from typing import Optional
from fastapi import APIRouter, WebSocket
from services.docker_service import attach_terminal
from services.mongo_service import sessions_collection
from services import connection_tracker

router = APIRouter()


def _resolve_container(session: dict, branch: Optional[str]) -> Optional[str]:
    containers = session.get("containers", {})
    default_branch = session.get("default_branch", "main")
    target = branch or default_branch
    container_id = containers.get(target)
    if not container_id:
        container_id = session.get("container_id")
    return container_id


@router.websocket("/ws/terminal/{session_id}")
async def terminal(websocket: WebSocket, session_id: str, branch: Optional[str] = None):
    await websocket.accept()

    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        await websocket.close()
        return

    container_id = _resolve_container(session, branch)
    if not container_id:
        await websocket.close()
        return

    ws_id = id(websocket)
    connection_tracker.connect(session_id, ws_id)
    try:
        await attach_terminal(websocket, container_id)
    finally:
        connection_tracker.disconnect(session_id, ws_id)
