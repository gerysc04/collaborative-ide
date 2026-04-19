from typing import Optional
from fastapi import APIRouter, WebSocket
from services.docker_service import run_code, attach_terminal
from services.mongo_service import sessions_collection

router = APIRouter()

def _resolve_container(session: dict, branch: Optional[str]) -> Optional[str]:
    containers = session.get("containers", {})
    default_branch = session.get("default_branch", "main")
    target = branch or default_branch
    container_id = containers.get(target)
    if not container_id:
        container_id = session.get("container_id")
    return container_id

@router.websocket("/ws/execute/{session_id}")
async def execute_code(websocket: WebSocket, session_id: str):
    await websocket.accept()

    try:
        while True:
            code = await websocket.receive_text()
            output = await run_code(code)
            await websocket.send_text(output)
    except Exception as e:
        await websocket.send_text(f"Error: {str(e)}")
        await websocket.close()

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

    try:
        await attach_terminal(websocket, container_id)
    except Exception:
        await websocket.close()
