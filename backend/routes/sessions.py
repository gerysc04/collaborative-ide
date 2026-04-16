import asyncio
from fastapi import APIRouter
from models.session import Session
from services.mongo_service import sessions_collection
from services.docker_service import create_container

router = APIRouter()

@router.post("/sessions")
async def create_session(username: str, session_name: str):
    session = Session(name=session_name, owner=username)

    loop = asyncio.get_event_loop()
    container_id = await loop.run_in_executor(None, create_container, session.id)
    
    session.container_id = container_id
    await sessions_collection.insert_one(session.model_dump())
    return {"session_id": session.id}

@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        return {"error": "Session not found"}
    session.pop("_id")
    return session