import os
import httpx
from fastapi import APIRouter
from fastapi.responses import RedirectResponse

router = APIRouter()

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
GITHUB_AUTHORIZE_URL = os.getenv("GITHUB_AUTHORIZE_URL")
GITHUB_TOKEN_URL = os.getenv("GITHUB_TOKEN_URL")
GITHUB_API_URL = os.getenv("GITHUB_API_URL")
GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI")
FRONTEND_URL = os.getenv("FRONTEND_URL")


@router.get("/auth/github")
async def github_login():
    url = (
        f"{GITHUB_AUTHORIZE_URL}"
        f"?client_id={GITHUB_CLIENT_ID}"
        f"&redirect_uri={GITHUB_REDIRECT_URI}"
        f"&scope=repo"
    )
    return RedirectResponse(url)


@router.get("/auth/github/callback")
async def github_callback(code: str):
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            GITHUB_TOKEN_URL,
            json={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": GITHUB_REDIRECT_URI,
            },
            headers={"Accept": "application/json"},
        )
        token_data = token_res.json()
        access_token = token_data.get("access_token")
        if not access_token:
            return RedirectResponse(f"{FRONTEND_URL}?github_error=auth_failed")

        user_res = await client.get(
            f"{GITHUB_API_URL}/user",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        user_data = user_res.json()
        github_username = user_data.get("login", "")

    return RedirectResponse(
        f"{FRONTEND_URL}/auth/callback"
        f"?token={access_token}"
        f"&username={github_username}"
    )
