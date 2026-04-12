import docker
import asyncio
import traceback
from fastapi import WebSocket

client = docker.from_env()

async def run_code(code: str) -> str:
    loop = asyncio.get_event_loop()
    
    result = await loop.run_in_executor(None, lambda: client.containers.run(
        "node:alpine",
        ["node", "-e", code],
        remove=True,
        mem_limit="128m",
        cpu_period=100000,
        cpu_quota=50000,
        network_disabled=True
    ))
    
    return result.decode("utf-8")

def create_container(session_id: str) -> str:
    container = client.containers.create(
        "node:alpine",
        command="/bin/sh",
        stdin_open=True,
        tty=True,
        mem_limit="512m",
        cpu_period=100000,
        cpu_quota=50000,
        name=f"collide-{session_id}",
        labels={"collide_session": session_id}
    )
    container.start()
    return container.id
async def attach_terminal(websocket: WebSocket, container_id: str):
    loop = asyncio.get_event_loop()
    
    try:
        container = client.containers.get(container_id)

        exec_id = client.api.exec_create(
            container.id,
            "/bin/sh",
            stdin=True,
            tty=True
        )

        sock = client.api.exec_start(
            exec_id,
            detach=False,
            tty=True,
            socket=True
        )

        # Keep blocking mode so recv waits for data
        sock._sock.setblocking(True)

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