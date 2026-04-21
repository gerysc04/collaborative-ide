import os
import re
import asyncio
import logging
import traceback
import docker
from fastapi import WebSocket
from helpers.docker_helpers import exec_socket_in_container

logger = logging.getLogger(__name__)
client = docker.from_env()

DEV_IMAGE = os.getenv("DEV_IMAGE", DEV_IMAGE)

DB_IMAGES = {
    "postgresql": ("postgres:16-alpine", {"POSTGRES_PASSWORD": "collide", "POSTGRES_DB": "app", "POSTGRES_USER": "collide"}),
    "mongodb": ("mongo:7", {"MONGO_INITDB_DATABASE": "app"}),
    "redis": ("redis:7-alpine", {}),
}


def _safe_branch(branch: str) -> str:
    return re.sub(r'[^a-zA-Z0-9_.-]', '-', branch)[:40]


async def run_code(code: str) -> str:
    loop = asyncio.get_event_loop()

    result = await loop.run_in_executor(None, lambda: client.containers.run(
        DEV_IMAGE,
        ["node", "-e", code],
        remove=True,
        mem_limit="128m",
        cpu_period=100000,
        cpu_quota=50000,
        network_disabled=True
    ))

    return result.decode("utf-8")


def create_session_network(session_id: str) -> str:
    network_name = f"collide-net-{session_id}"
    client.networks.create(network_name, driver="bridge")
    return network_name


def create_container(session_id: str, network_name: str) -> str:
    container = client.containers.create(
        DEV_IMAGE,
        command="/bin/bash",
        stdin_open=True,
        tty=True,
        mem_limit="1g",
        cpu_period=100000,
        cpu_quota=200000,
        name=f"collide-{session_id}",
        network=network_name,
        labels={"collide_session": session_id, "collide_role": "app"}
    )
    container.start()
    container.exec_run(["mkdir", "-p", "/app"])
    return container.id


def rename_container_for_branch(container_id: str, session_id: str, branch: str) -> None:
    safe = _safe_branch(branch)
    container = client.containers.get(container_id)
    container.rename(f"collide-{session_id}-{safe}")


def create_branch_container(session_id: str, branch: str, network_name: str) -> str:
    safe = _safe_branch(branch)
    container = client.containers.create(
        DEV_IMAGE,
        command="/bin/bash",
        stdin_open=True,
        tty=True,
        mem_limit="1g",
        cpu_period=100000,
        cpu_quota=200000,
        name=f"collide-{session_id}-{safe}",
        network=network_name,
        labels={"collide_session": session_id, "collide_role": "app", "collide_branch": branch}
    )
    container.start()
    container.exec_run(["mkdir", "-p", "/app"])
    return container.id


def ensure_network(network_name: str) -> None:
    try:
        client.networks.get(network_name)
    except docker.errors.NotFound:
        client.networks.create(network_name, driver="bridge")


def snapshot_container(container_id: str, image_name: str) -> None:
    container = client.containers.get(container_id)
    container.commit(repository=image_name, tag="latest")


def stop_and_remove_container(container_id: str) -> None:
    try:
        container = client.containers.get(container_id)
        container.stop(timeout=10)
        container.remove()
    except docker.errors.NotFound:
        pass


def restore_db_container_from_snapshot(session_id: str, network_name: str, image_name: str) -> str:
    container = client.containers.create(
        image_name,
        name=f"collide-db-{session_id}",
        hostname="db",
        network=network_name,
        labels={"collide_session": session_id, "collide_role": "db"}
    )
    container.start()
    return container.id


def restore_container_from_snapshot(session_id: str, branch: str, network_name: str, image_name: str) -> str:
    safe = _safe_branch(branch)
    container = client.containers.create(
        image_name,
        command="/bin/bash",
        stdin_open=True,
        tty=True,
        mem_limit="1g",
        cpu_period=100000,
        cpu_quota=200000,
        name=f"collide-{session_id}-{safe}",
        network=network_name,
        labels={"collide_session": session_id, "collide_role": "app", "collide_branch": branch}
    )
    container.start()
    return container.id


def create_db_container(session_id: str, db_type: str, network_name: str) -> str:
    image, env = DB_IMAGES[db_type]
    try:
        client.images.get(image)
    except docker.errors.ImageNotFound:
        client.images.pull(image)
    container = client.containers.create(
        image,
        name=f"collide-db-{session_id}",
        hostname="db",
        environment=env,
        network=network_name,
        labels={"collide_session": session_id, "collide_role": "db"}
    )
    container.start()
    return container.id


async def attach_terminal(websocket: WebSocket, container_id: str):
    try:
        sock = await exec_socket_in_container(container_id, ["/bin/bash"])

        loop = asyncio.get_event_loop()

        async def read_from_container():
            while True:
                try:
                    data = await loop.run_in_executor(None, sock._sock.recv, 1024)
                    if data:
                        await websocket.send_bytes(data)
                    else:
                        await asyncio.sleep(0.01)
                except Exception as e:
                    logger.error(f"read error: {e}")
                    break

        async def write_to_container():
            while True:
                try:
                    message = await websocket.receive()
                    if "bytes" in message:
                        data = message["bytes"]
                    elif "text" in message:
                        data = message["text"].encode()
                    else:
                        break
                    await loop.run_in_executor(None, sock._sock.sendall, data)
                except Exception as e:
                    logger.error(f"write error: {e}")
                    break

        await asyncio.gather(read_from_container(), write_to_container())

    except Exception:
        logger.error(f"attach_terminal error: {traceback.format_exc()}")
        await websocket.close()
