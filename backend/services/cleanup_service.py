import os
import asyncio
import logging
from datetime import datetime, timezone, timedelta
import docker
from services.mongo_service import sessions_collection

logger = logging.getLogger(__name__)
docker_client = docker.from_env()

SESSION_MAX_AGE_HOURS = int(os.getenv("SESSION_MAX_AGE_HOURS", "720"))  # 30 days
CLEANUP_INTERVAL_SECONDS = 3600  # run every hour


def _remove_container(container_id: str) -> None:
    try:
        container = docker_client.containers.get(container_id)
        container.remove(force=True)
        logger.info(f"Removed container {container_id}")
    except docker.errors.NotFound:
        pass
    except Exception as e:
        logger.warning(f"Failed to remove container {container_id}: {e}")


def _remove_network(network_name: str) -> None:
    try:
        network = docker_client.networks.get(network_name)
        network.remove()
        logger.info(f"Removed network {network_name}")
    except docker.errors.NotFound:
        pass
    except Exception as e:
        logger.warning(f"Failed to remove network {network_name}: {e}")


async def cleanup_old_sessions() -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=SESSION_MAX_AGE_HOURS)
    cutoff_naive = cutoff.replace(tzinfo=None)

    expired = await sessions_collection.find(
        {"created_at": {"$lt": cutoff_naive}, "status": "stopped"}
    ).to_list(length=None)

    if not expired:
        return

    logger.info(f"Cleaning up {len(expired)} expired session(s)")

    loop = asyncio.get_event_loop()
    for session in expired:
        containers = session.get("containers", {})
        for container_id in containers.values():
            await loop.run_in_executor(None, _remove_container, container_id)

        # legacy sessions stored a single container_id instead of a branch map
        if not containers:
            container_id = session.get("container_id")
            if container_id:
                await loop.run_in_executor(None, _remove_container, container_id)

        db_container_id = session.get("db_container_id")
        if db_container_id:
            await loop.run_in_executor(None, _remove_container, db_container_id)

        # network must be removed after all containers are detached
        network_name = session.get("network_name")
        if network_name:
            await loop.run_in_executor(None, _remove_network, network_name)

    ids = [s["id"] for s in expired]
    await sessions_collection.delete_many({"id": {"$in": ids}})
    logger.info(f"Deleted {len(ids)} session record(s) from MongoDB")


async def cleanup_loop() -> None:
    logger.info(
        f"Session cleanup task started — max age: {SESSION_MAX_AGE_HOURS}h, "
        f"interval: {CLEANUP_INTERVAL_SECONDS}s"
    )
    while True:
        try:
            await cleanup_old_sessions()
        except Exception:
            logger.exception("Error during session cleanup")
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
