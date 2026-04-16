import os
import httpx
from fastapi import APIRouter, HTTPException, Header

router = APIRouter()

GITHUB_API_URL = os.getenv("GITHUB_API_URL")


def _extract_token(authorization: str) -> str:
    return authorization.removeprefix("Bearer ").strip()


@router.get("/github/repos")
async def list_repos(authorization: str = Header(...)):
    token = _extract_token(authorization)
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{GITHUB_API_URL}/user/repos",
            headers={"Authorization": f"Bearer {token}"},
            params={"per_page": 100, "sort": "updated", "affiliation": "owner,collaborator,organization_member"},
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail="Failed to fetch repositories")
        repos = res.json()

    return [
        {
            "name": r["name"],
            "full_name": r["full_name"],
            "private": r["private"],
            "clone_url": r["clone_url"],
        }
        for r in repos if isinstance(r, dict)
    ]


@router.get("/github/repos/access")
async def check_repo_access(owner: str, repo: str, authorization: str = Header(...)):
    token = _extract_token(authorization)
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{GITHUB_API_URL}/repos/{owner}/{repo}",
            headers={"Authorization": f"Bearer {token}"},
        )
    if res.status_code == 200:
        return {"access": True}
    raise HTTPException(status_code=403, detail="You don't have access to this repository")
