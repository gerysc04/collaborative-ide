import docker
import asyncio

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