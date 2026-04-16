import asyncio
import docker
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from models.session import Session
from services.mongo_service import sessions_collection
from services.docker_service import create_container
from helpers.docker_helpers import exec_in_container

docker_client = docker.from_env()
router = APIRouter()


class CreateSessionRequest(BaseModel):
    github_username: str
    github_token: str
    repo_url: str
    repo_full_name: str


@router.post("/sessions")
async def create_session(req: CreateSessionRequest):
    repo_name = req.repo_full_name.split("/")[-1]
    session = Session(
        name=repo_name,
        owner=req.github_username,
        repo_url=req.repo_url,
        github_username=req.github_username,
    )

    loop = asyncio.get_event_loop()
    container_id = await loop.run_in_executor(None, create_container, session.id)
    session.container_id = container_id

    # Inject token into URL for private repo access
    clone_url = req.repo_url
    if req.github_token and "github.com" in clone_url and clone_url.startswith("https://"):
        clone_url = clone_url.replace("https://", f"https://x-access-token:{req.github_token}@")

    exit_code, output = await exec_in_container(container_id, ["git", "clone", clone_url, "/app"])

    if exit_code != 0:
        await loop.run_in_executor(
            None,
            lambda: docker_client.containers.get(container_id).remove(force=True),
        )
        error_msg = output.decode(errors="replace") if output else "unknown error"
        raise HTTPException(status_code=400, detail=f"Failed to clone repository: {error_msg}")

    await sessions_collection.insert_one(session.model_dump())
    return {"session_id": session.id}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        return {"error": "Session not found"}
    session.pop("_id")
    return session
