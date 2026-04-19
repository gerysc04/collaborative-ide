import asyncio
import logging
from services.mongo_service import sessions_collection
from services.docker_service import (
    ensure_network, snapshot_container, stop_and_remove_container,
    restore_container_from_snapshot, restore_db_container_from_snapshot,
    create_db_container,
)

logger = logging.getLogger(__name__)

_locks: dict[str, asyncio.Lock] = {}


def _get_lock(session_id: str) -> asyncio.Lock:
    if session_id not in _locks:
        _locks[session_id] = asyncio.Lock()
    return _locks[session_id]


async def snapshot_and_stop_session(session_id: str) -> None:
    lock = _get_lock(session_id)
    async with lock:
        session = await sessions_collection.find_one({"id": session_id})
        if not session or session.get("status") == "stopped":
            return

        loop = asyncio.get_event_loop()
        containers: dict[str, str] = session.get("containers", {})
        snapshots: dict[str, str] = {}

        for branch, container_id in containers.items():
            image_name = f"collide-snap-{session_id[:8]}-{branch[:20]}"
            try:
                await loop.run_in_executor(None, snapshot_container, container_id, image_name)
                snapshots[branch] = image_name
                logger.info(f"Snapshotted {branch} → {image_name}")
            except Exception as e:
                logger.warning(f"Failed to snapshot branch {branch}: {e}")
            try:
                await loop.run_in_executor(None, stop_and_remove_container, container_id)
            except Exception as e:
                logger.warning(f"Failed to stop container {container_id}: {e}")

        db_container_id = session.get("db_container_id")
        db_snapshot_image = None
        if db_container_id:
            db_snapshot_image = f"collide-snap-db-{session_id[:8]}"
            try:
                await loop.run_in_executor(None, snapshot_container, db_container_id, db_snapshot_image)
                logger.info(f"Snapshotted DB → {db_snapshot_image}")
            except Exception as e:
                logger.warning(f"Failed to snapshot DB: {e}")
                db_snapshot_image = None
            try:
                await loop.run_in_executor(None, stop_and_remove_container, db_container_id)
            except Exception as e:
                logger.warning(f"Failed to stop DB container: {e}")

        update: dict = {"status": "stopped", "containers": {}, "snapshots": snapshots}
        if db_snapshot_image:
            update["db_snapshot_image"] = db_snapshot_image
        update["db_container_id"] = None

        await sessions_collection.update_one({"id": session_id}, {"$set": update})
        logger.info(f"Session {session_id} stopped and snapshotted")


async def restore_session(session_id: str) -> bool:
    lock = _get_lock(session_id)
    async with lock:
        session = await sessions_collection.find_one({"id": session_id})
        if not session:
            return False
        if session.get("status") == "running":
            return True

        loop = asyncio.get_event_loop()
        network_name = session.get("network_name") or f"collide-net-{session_id}"
        await loop.run_in_executor(None, ensure_network, network_name)

        snapshots: dict[str, str] = session.get("snapshots", {})
        new_containers: dict[str, str] = {}

        for branch, image_name in snapshots.items():
            try:
                container_id = await loop.run_in_executor(
                    None, restore_container_from_snapshot,
                    session_id, branch, network_name, image_name
                )
                new_containers[branch] = container_id
                logger.info(f"Restored branch {branch} from {image_name}")
            except Exception as e:
                logger.error(f"Failed to restore branch {branch}: {e}")
                return False

        db_type = session.get("db_type")
        db_snapshot_image = session.get("db_snapshot_image")
        new_db_container_id = None

        if db_type:
            if db_snapshot_image:
                try:
                    new_db_container_id = await loop.run_in_executor(
                        None, restore_db_container_from_snapshot,
                        session_id, network_name, db_snapshot_image
                    )
                    logger.info(f"Restored DB from {db_snapshot_image}")
                except Exception as e:
                    logger.warning(f"DB snapshot restore failed, creating fresh: {e}")

            if not new_db_container_id:
                try:
                    new_db_container_id = await loop.run_in_executor(
                        None, create_db_container, session_id, db_type, network_name
                    )
                    logger.info(f"Created fresh {db_type} container")
                except Exception as e:
                    logger.error(f"Failed to create DB container: {e}")

        update: dict = {
            "status": "running",
            "containers": new_containers,
            "network_name": network_name,
            "db_container_id": new_db_container_id,
        }
        await sessions_collection.update_one({"id": session_id}, {"$set": update})
        logger.info(f"Session {session_id} restored successfully")
        return True


async def ensure_running(session_id: str) -> bool:
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        return False
    if session.get("status") == "running":
        return True
    return await restore_session(session_id)
