import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.mongo_service import sessions_collection

router = APIRouter()


class RunConfigRequest(BaseModel):
    name: str
    command: str


@router.get("/sessions/{session_id}/run-configs")
async def list_run_configs(session_id: str):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.get("run_configs", [])


@router.post("/sessions/{session_id}/run-configs")
async def add_run_config(session_id: str, req: RunConfigRequest):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    entry = {"id": str(uuid.uuid4()), "name": req.name.strip(), "command": req.command.strip()}
    await sessions_collection.update_one(
        {"id": session_id}, {"$push": {"run_configs": entry}}
    )
    return entry


@router.put("/sessions/{session_id}/run-configs/{config_id}")
async def update_run_config(session_id: str, config_id: str, req: RunConfigRequest):
    result = await sessions_collection.update_one(
        {"id": session_id, "run_configs.id": config_id},
        {"$set": {"run_configs.$.name": req.name.strip(), "run_configs.$.command": req.command.strip()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Config not found")
    return {"id": config_id, "name": req.name.strip(), "command": req.command.strip()}


@router.delete("/sessions/{session_id}/run-configs/{config_id}")
async def delete_run_config(session_id: str, config_id: str):
    await sessions_collection.update_one(
        {"id": session_id}, {"$pull": {"run_configs": {"id": config_id}}}
    )
    return {"deleted": config_id}
