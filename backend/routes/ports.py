from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.mongo_service import sessions_collection

router = APIRouter()


class PortEntry(BaseModel):
    label: str
    container_port: int


@router.get("/sessions/{session_id}/ports")
async def get_ports(session_id: str):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.get("ports", [])


@router.post("/sessions/{session_id}/ports")
async def add_port(session_id: str, entry: PortEntry):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    existing = session.get("ports", [])
    if any(p["container_port"] == entry.container_port for p in existing):
        raise HTTPException(status_code=409, detail="Port already registered")
    await sessions_collection.update_one(
        {"id": session_id},
        {"$push": {"ports": entry.model_dump()}},
    )
    return {"ok": True}


@router.delete("/sessions/{session_id}/ports/{port}")
async def remove_port(session_id: str, port: int):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await sessions_collection.update_one(
        {"id": session_id},
        {"$pull": {"ports": {"container_port": port}}},
    )
    return {"ok": True}
