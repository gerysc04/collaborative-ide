import asyncio
import traceback
import docker
from fastapi import WebSocket
from helpers.docker_helpers import exec_socket_in_container

client = docker.from_env()

DB_IMAGES = {
    "postgresql": ("postgres:16-alpine", {"POSTGRES_PASSWORD": "collide", "POSTGRES_DB": "app", "POSTGRES_USER": "collide"}),
    "mongodb": ("mongo:7", {"MONGO_INITDB_DATABASE": "app"}),
    "redis": ("redis:7-alpine", {}),
}


async def run_code(code: str) -> str:
    loop = asyncio.get_event_loop()

    result = await loop.run_in_executor(None, lambda: client.containers.run(
        "collide-dev",
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
        "collide-dev",
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
                    print(f"read error: {e}")
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
                    print(f"write error: {e}")
                    break

        await asyncio.gather(read_from_container(), write_to_container())

    except Exception as e:
        print(f"attach_terminal error: {traceback.format_exc()}")
        await websocket.close()
