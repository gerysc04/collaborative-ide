import asyncio
from typing import Optional
import docker
from fastapi import APIRouter, WebSocket
from services.mongo_service import sessions_collection

router = APIRouter()
_docker = docker.from_env()


def _resolve_container(session: dict, branch: Optional[str]) -> Optional[str]:
    containers = session.get("containers", {})
    default_branch = session.get("default_branch", "main")
    target = branch or default_branch
    return containers.get(target) or session.get("container_id")


def _parse_stats(s: dict) -> dict:
    cpu_delta = (
        s["cpu_stats"]["cpu_usage"]["total_usage"]
        - s["precpu_stats"]["cpu_usage"]["total_usage"]
    )
    system_delta = s["cpu_stats"].get("system_cpu_usage", 0) - s["precpu_stats"].get(
        "system_cpu_usage", 0
    )
    num_cpus = s["cpu_stats"].get("online_cpus", 1)
    cpu_pct = (cpu_delta / system_delta * num_cpus * 100) if system_delta > 0 else 0.0

    mem = s.get("memory_stats", {})
    # Docker reports cache separately; subtract it for "real" usage
    cache = mem.get("stats", {}).get("cache", 0)
    mem_usage = max(0, mem.get("usage", 0) - cache)
    mem_limit = mem.get("limit", 0)

    return {
        "cpu_percent": round(cpu_pct, 1),
        "memory_mb": round(mem_usage / 1024 / 1024),
        "memory_limit_mb": round(mem_limit / 1024 / 1024),
    }


@router.websocket("/ws/stats/{session_id}")
async def container_stats(websocket: WebSocket, session_id: str, branch: Optional[str] = None):
    await websocket.accept()

    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        await websocket.close()
        return

    container_id = _resolve_container(session, branch)
    if not container_id:
        await websocket.close()
        return

    loop = asyncio.get_event_loop()
    try:
        container = await loop.run_in_executor(None, _docker.containers.get, container_id)
        stats_iter = container.stats(stream=True, decode=True)

        while True:
            raw = await loop.run_in_executor(None, next, stats_iter)
            try:
                payload = _parse_stats(raw)
                await websocket.send_json(payload)
            except (KeyError, ZeroDivisionError):
                pass
    except Exception:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
