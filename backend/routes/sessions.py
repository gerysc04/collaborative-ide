import asyncio
import re
import docker
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from models.session import Session
from services.mongo_service import sessions_collection
from services.docker_service import (
    create_session_network, create_container, rename_container_for_branch,
    create_branch_container, create_db_container, DB_IMAGES
)
from services.session_lifecycle import restore_session
from helpers.docker_helpers import exec_in_container

docker_client = docker.from_env()
router = APIRouter()


class CreateSessionRequest(BaseModel):
    github_username: str
    github_token: str
    repo_url: str
    repo_full_name: str
    db_type: Optional[str] = None


class CreateBranchRequest(BaseModel):
    branch_name: str
    is_new: bool = False
    github_token: str


def _strip_credentials(text: str) -> str:
    return re.sub(r'https://[^@\s]+@', 'https://', text)


def _resolve_container(session: dict, branch: Optional[str]) -> Optional[str]:
    containers = session.get("containers", {})
    default_branch = session.get("default_branch", "main")
    target = branch or default_branch
    container_id = containers.get(target)
    # Fallback for sessions created before branch management
    if not container_id:
        container_id = session.get("container_id")
    return container_id


@router.post("/sessions")
async def create_session(req: CreateSessionRequest):
    if req.db_type and req.db_type not in DB_IMAGES:
        raise HTTPException(status_code=400, detail=f"Unsupported db_type: {req.db_type}")

    repo_name = req.repo_full_name.split("/")[-1]
    session = Session(
        name=repo_name,
        owner=req.github_username,
        repo_url=req.repo_url,
        github_username=req.github_username,
        db_type=req.db_type or None,
    )

    loop = asyncio.get_event_loop()

    network_name = await loop.run_in_executor(None, create_session_network, session.id)
    session.network_name = network_name

    container_id = await loop.run_in_executor(None, create_container, session.id, network_name)

    if req.db_type:
        try:
            db_container_id = await loop.run_in_executor(
                None, create_db_container, session.id, req.db_type, network_name
            )
            session.db_container_id = db_container_id
        except Exception as e:
            await loop.run_in_executor(None, lambda: docker_client.containers.get(container_id).remove(force=True))
            try:
                await loop.run_in_executor(None, lambda: docker_client.networks.get(network_name).remove())
            except Exception:
                pass
            raise HTTPException(status_code=500, detail=f"Failed to start database container: {e}")

    clone_url = req.repo_url
    if req.github_token and "github.com" in clone_url and clone_url.startswith("https://"):
        clone_url = clone_url.replace("https://", f"https://x-access-token:{req.github_token}@")

    exit_code, output = await exec_in_container(container_id, ["git", "clone", clone_url, "/app"])

    if exit_code != 0:
        await loop.run_in_executor(None, lambda: docker_client.containers.get(container_id).remove(force=True))
        if session.db_container_id:
            try:
                await loop.run_in_executor(None, lambda: docker_client.containers.get(session.db_container_id).remove(force=True))
            except Exception:
                pass
        try:
            await loop.run_in_executor(None, lambda: docker_client.networks.get(network_name).remove())
        except Exception:
            pass
        error_msg = _strip_credentials(output.decode(errors="replace") if output else "unknown error")
        raise HTTPException(status_code=400, detail=f"Failed to clone repository: {error_msg}")

    # Detect the actual default branch
    _, branch_output = await exec_in_container(container_id, ["git", "-C", "/app", "symbolic-ref", "--short", "HEAD"])
    detected_branch = branch_output.decode("utf-8", errors="replace").strip() if branch_output else "main"
    if not detected_branch:
        detected_branch = "main"

    # Rename container to include branch name
    await loop.run_in_executor(None, rename_container_for_branch, container_id, session.id, detected_branch)

    session.default_branch = detected_branch
    session.containers = {detected_branch: container_id}

    await sessions_collection.insert_one(session.model_dump())
    return {"session_id": session.id}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        return {"error": "Session not found"}
    session.pop("_id")
    return session


@router.post("/sessions/{session_id}/resume")
async def resume_session(session_id: str):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("status") == "running":
        return {"status": "running"}
    ok = await restore_session(session_id)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to restore session")
    return {"status": "running"}


@router.get("/sessions/{session_id}/branches")
async def list_branches(session_id: str):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    containers = session.get("containers", {})
    default_branch = session.get("default_branch", "main")

    # Get all remote branches from git
    git_branches: list[str] = []
    container_id = next(iter(containers.values()), None) or session.get("container_id")
    if container_id:
        _, output = await exec_in_container(
            container_id,
            ["git", "-C", "/app", "branch", "-a", "--format=%(refname:short)"]
        )
        if output:
            raw_branches = output.decode("utf-8", errors="replace").strip().split("\n")
            seen: set[str] = set()
            for b in raw_branches:
                b = b.strip()
                if not b:
                    continue
                # Normalize remote refs: origin/main → main
                if b.startswith("origin/"):
                    b = b[len("origin/"):]
                if b == "HEAD":
                    continue
                if b not in seen:
                    seen.add(b)
                    git_branches.append(b)

    return {
        "branches": git_branches,
        "containers": list(containers.keys()),  # branches that already have containers
        "default_branch": default_branch,
    }


@router.post("/sessions/{session_id}/branches")
async def create_branch(session_id: str, req: CreateBranchRequest):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    containers = session.get("containers", {})
    if req.branch_name in containers:
        return {"container_id": containers[req.branch_name], "already_exists": True}

    network_name = session.get("network_name")
    repo_url = session.get("repo_url", "")

    loop = asyncio.get_event_loop()

    container_id = await loop.run_in_executor(
        None, create_branch_container, session_id, req.branch_name, network_name
    )

    clone_url = repo_url
    if req.github_token and "github.com" in clone_url and clone_url.startswith("https://"):
        clone_url = clone_url.replace("https://", f"https://x-access-token:{req.github_token}@")

    exit_code, output = await exec_in_container(container_id, ["git", "clone", clone_url, "/app"])
    if exit_code != 0:
        await loop.run_in_executor(None, lambda: docker_client.containers.get(container_id).remove(force=True))
        error_msg = _strip_credentials(output.decode(errors="replace") if output else "unknown error")
        raise HTTPException(status_code=400, detail=f"Failed to clone: {error_msg}")

    if req.is_new:
        await exec_in_container(container_id, ["git", "-C", "/app", "checkout", "-b", req.branch_name])
    else:
        await exec_in_container(container_id, ["git", "-C", "/app", "checkout", req.branch_name])

    await sessions_collection.update_one(
        {"id": session_id},
        {"$set": {f"containers.{req.branch_name}": container_id}}
    )

    return {"container_id": container_id, "already_exists": False}


@router.get("/sessions/{session_id}/git/status")
async def git_status(session_id: str, branch: Optional[str] = None):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    container_id = _resolve_container(session, branch)
    if not container_id:
        raise HTTPException(status_code=404, detail="No container for this branch")

    _, output = await exec_in_container(container_id, ["git", "-C", "/app", "status", "--porcelain"])
    has_changes = bool(output and output.decode("utf-8", errors="replace").strip())
    return {"has_changes": has_changes}


class CommitRequest(BaseModel):
    message: str


@router.post("/sessions/{session_id}/git/commit")
async def git_commit(session_id: str, req: CommitRequest, branch: Optional[str] = None):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    container_id = _resolve_container(session, branch)
    if not container_id:
        raise HTTPException(status_code=404, detail="No container for this branch")

    await exec_in_container(container_id, ["git", "-C", "/app", "add", "-A"])
    exit_code, output = await exec_in_container(
        container_id,
        ["git", "-C", "/app", "commit", "-m", req.message, "--allow-empty-message"]
    )
    if exit_code != 0:
        error_msg = output.decode(errors="replace") if output else "unknown error"
        raise HTTPException(status_code=400, detail=f"Commit failed: {error_msg}")

    return {"success": True}
