from fastapi import APIRouter, WebSocket
from pathlib import PurePosixPath
from pydantic import BaseModel
from typing import Literal
from services.file_service import get_file_tree, get_file_content, write_file_content, create_file_or_dir, watch_files
from services.mongo_service import sessions_collection

router = APIRouter()

class WriteFileRequest(BaseModel):
    content: str

class CreateNodeRequest(BaseModel):
    type: Literal['file', 'directory']

def _safe_path(path: str) -> bool:
    try:
        p = PurePosixPath(path)
        return p.is_absolute() and str(p).startswith('/app/') and '..' not in p.parts
    except Exception:
        return False

@router.get("/sessions/{session_id}/files")
async def files(session_id: str):
    session = await sessions_collection.find_one({"id": session_id})
    if not session or not session.get("container_id"):
        return {"error": "Session not found"}
    return await get_file_tree(session["container_id"])

@router.get("/sessions/{session_id}/files/content")
async def file_content(session_id: str, path: str):
    session = await sessions_collection.find_one({"id": session_id})
    if not session or not session.get("container_id"):
        return {"error": "Session not found"}
    content = await get_file_content(session["container_id"], path)
    return {"content": content}

@router.post("/sessions/{session_id}/files/content")
async def write_content(session_id: str, path: str, body: WriteFileRequest):
    session = await sessions_collection.find_one({"id": session_id})
    if not session or not session.get("container_id"):
        return {"error": "Session not found"}
    await write_file_content(session["container_id"], path, body.content)
    return {"success": True}

@router.post("/sessions/{session_id}/files/new")
async def create_node(session_id: str, path: str, body: CreateNodeRequest):
    if not _safe_path(path):
        return {"error": "Invalid path"}
    session = await sessions_collection.find_one({"id": session_id})
    if not session or not session.get("container_id"):
        return {"error": "Session not found"}
    await create_file_or_dir(session["container_id"], path, body.type)
    return {"success": True}

@router.websocket("/ws/files/{session_id}")
async def file_watcher(websocket: WebSocket, session_id: str):
    await websocket.accept()
    session = await sessions_collection.find_one({"id": session_id})
    if not session or not session.get("container_id"):
        await websocket.close()
        return
    await watch_files(websocket, session["container_id"])