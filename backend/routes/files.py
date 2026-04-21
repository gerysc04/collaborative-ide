import base64
import shlex
from typing import Optional, Literal
from fastapi import APIRouter, WebSocket, UploadFile, File, Form, Query
from fastapi.responses import Response, JSONResponse
from pathlib import PurePosixPath
from pydantic import BaseModel
from services.file_service import get_file_tree, get_file_content, write_file_content, create_file_or_dir, watch_files
from services.mongo_service import sessions_collection
from services import connection_tracker
from helpers.docker_helpers import exec_in_container

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

def _resolve_container(session: dict, branch: Optional[str]) -> Optional[str]:
    containers = session.get("containers", {})
    default_branch = session.get("default_branch", "main")
    target = branch or default_branch
    container_id = containers.get(target)
    if not container_id:
        container_id = session.get("container_id")
    return container_id

@router.get("/sessions/{session_id}/files")
async def files(session_id: str, branch: Optional[str] = None):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        return {"error": "Session not found"}
    container_id = _resolve_container(session, branch)
    if not container_id:
        return {"error": "No container for this branch"}
    return await get_file_tree(container_id)

@router.get("/sessions/{session_id}/files/content")
async def file_content(session_id: str, path: str, branch: Optional[str] = None):
    if not _safe_path(path):
        return {"error": "Invalid path"}
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        return {"error": "Session not found"}
    container_id = _resolve_container(session, branch)
    if not container_id:
        return {"error": "No container for this branch"}
    content = await get_file_content(container_id, path)
    return {"content": content}

@router.post("/sessions/{session_id}/files/content")
async def write_content(session_id: str, path: str, body: WriteFileRequest, branch: Optional[str] = None):
    if not _safe_path(path):
        return {"error": "Invalid path"}
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        return {"error": "Session not found"}
    container_id = _resolve_container(session, branch)
    if not container_id:
        return {"error": "No container for this branch"}
    await write_file_content(container_id, path, body.content)
    return {"success": True}

@router.post("/sessions/{session_id}/files/new")
async def create_node(session_id: str, path: str, body: CreateNodeRequest, branch: Optional[str] = None):
    if not _safe_path(path):
        return {"error": "Invalid path"}
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        return {"error": "Session not found"}
    container_id = _resolve_container(session, branch)
    if not container_id:
        return {"error": "No container for this branch"}
    await create_file_or_dir(container_id, path, body.type)
    return {"success": True}

@router.post("/sessions/{session_id}/files/upload")
async def upload_file(
    session_id: str,
    path: str = Form(...),
    file: UploadFile = File(...),
    branch: Optional[str] = Query(None),
):
    if not _safe_path(path):
        return JSONResponse(status_code=400, content={"error": "Invalid path"})
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        return JSONResponse(status_code=404, content={"error": "Session not found"})
    container_id = _resolve_container(session, branch)
    if not container_id:
        return JSONResponse(status_code=404, content={"error": "No container for this branch"})

    content_bytes = await file.read(10 * 1024 * 1024 + 1)
    if len(content_bytes) > 10 * 1024 * 1024:
        return JSONResponse(status_code=413, content={"error": "File exceeds 10MB limit"})
    encoded = base64.b64encode(content_bytes).decode("ascii")
    parent = str(PurePosixPath(path).parent)
    await exec_in_container(container_id, ["mkdir", "-p", parent])
    await exec_in_container(container_id, ["sh", "-c", f"echo '{encoded}' | base64 -d > {shlex.quote(path)}"])
    return {"success": True}


@router.get("/sessions/{session_id}/files/download")
async def download_project(session_id: str, branch: Optional[str] = None):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        return JSONResponse(status_code=404, content={"error": "Session not found"})
    container_id = _resolve_container(session, branch)
    if not container_id:
        return JSONResponse(status_code=404, content={"error": "No container for this branch"})

    _, data = await exec_in_container(container_id, ["tar", "czf", "-", "-C", "/app", "."])
    return Response(
        content=data,
        media_type="application/gzip",
        headers={"Content-Disposition": "attachment; filename=project.tar.gz"},
    )


@router.websocket("/ws/files/{session_id}")
async def file_watcher(websocket: WebSocket, session_id: str, branch: Optional[str] = None):
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
        await watch_files(websocket, container_id)
    finally:
        connection_tracker.disconnect(session_id, ws_id)
