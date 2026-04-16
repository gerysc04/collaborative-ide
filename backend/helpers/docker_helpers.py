import asyncio
import docker

client = docker.from_env()

async def exec_in_container(container_id: str, command: list) -> tuple:
    loop = asyncio.get_event_loop()

    def _exec():
        container = client.containers.get(container_id)
        # demux=True tells the SDK to strip the 8-byte stream headers Docker adds
        # when tty=False, so we get clean bytes instead of a multiplexed blob.
        exit_code, (stdout, stderr) = container.exec_run(command, demux=True, tty=False)
        return exit_code, (stdout or b"") + (stderr or b"")

    return await loop.run_in_executor(None, _exec)

async def exec_socket_in_container(container_id: str, command: list, tty: bool = True):
    loop = asyncio.get_event_loop()
    
    def _exec():
        exec_id = client.api.exec_create(
            container_id,
            command,
            stdin=True,
            tty=tty
        )
        sock = client.api.exec_start(
            exec_id,
            detach=False,
            tty=tty,
            socket=True
        )
        sock._sock.setblocking(True)
        return sock
    
    return await loop.run_in_executor(None, _exec)