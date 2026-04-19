from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.mongo_service import sessions_collection
from services.crypto_service import encrypt_api_key

router = APIRouter()

SUPPORTED_PROVIDERS = {"anthropic", "openai", "gemini"}


class AddProviderRequest(BaseModel):
    tag: str
    provider: str
    display_name: str
    api_key: str


@router.post("/sessions/{session_id}/ai/providers")
async def add_provider(session_id: str, req: AddProviderRequest):
    if req.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider. Choose from: {', '.join(SUPPORTED_PROVIDERS)}")

    tag = req.tag.strip().lower()
    if not tag or not tag.isalnum():
        raise HTTPException(status_code=400, detail="Tag must be alphanumeric (e.g. claude, gpt4, gemini)")

    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    providers = session.get("ai_providers", [])
    if any(p["tag"] == tag for p in providers):
        raise HTTPException(status_code=400, detail=f"Tag '@{tag}' is already in use")

    encrypted = encrypt_api_key(req.api_key)
    entry = {
        "tag": tag,
        "provider": req.provider,
        "display_name": req.display_name,
        "key_ciphertext": encrypted["ciphertext"],
        "key_iv": encrypted["iv"],
    }

    await sessions_collection.update_one(
        {"id": session_id},
        {"$push": {"ai_providers": entry}}
    )
    return {"tag": tag, "provider": req.provider, "display_name": req.display_name}


@router.get("/sessions/{session_id}/ai/providers")
async def list_providers(session_id: str):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    providers = session.get("ai_providers", [])
    # Return masked keys — never return plaintext
    return [
        {
            "tag": p["tag"],
            "provider": p["provider"],
            "display_name": p["display_name"],
            "key_masked": "sk-..." + "●" * 8,
        }
        for p in providers
    ]


@router.delete("/sessions/{session_id}/ai/providers/{tag}")
async def delete_provider(session_id: str, tag: str):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await sessions_collection.update_one(
        {"id": session_id},
        {"$pull": {"ai_providers": {"tag": tag}}}
    )
    return {"deleted": tag}
