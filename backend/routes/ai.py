from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from services.mongo_service import sessions_collection
from services.crypto_service import decrypt_api_key
from services.agent_service import run_agent, get_session_lock

router = APIRouter()


@router.websocket("/ws/ai/{session_id}")
async def ai_websocket(websocket: WebSocket, session_id: str, branch: str = ""):
    await websocket.accept()
    try:
        data = await websocket.receive_json()
    except WebSocketDisconnect:
        return

    tag = data.get("tag", "").strip().lower()
    message = data.get("message", "").strip()

    if not tag or not message:
        await websocket.send_json({"type": "error", "message": "tag and message are required"})
        await websocket.close()
        return

    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close()
        return

    providers = session.get("ai_providers", [])
    provider_entry = next((p for p in providers if p["tag"] == tag), None)
    if not provider_entry:
        await websocket.send_json({"type": "error", "message": f"No provider configured for @{tag}. Add one in the Providers panel."})
        await websocket.close()
        return

    lock = get_session_lock(session_id)
    if lock.locked():
        await websocket.send_json({"type": "error", "message": "AI is busy — another request is already running in this session."})
        await websocket.close()
        return

    try:
        api_key = decrypt_api_key(provider_entry["key_ciphertext"], provider_entry["key_iv"])
    except Exception:
        await websocket.send_json({"type": "error", "message": "Failed to decrypt API key. Check server SECRET_KEY."})
        await websocket.close()
        return

    async with lock:
        await run_agent(
            session_id=session_id,
            branch=branch or data.get("branch", ""),
            tag=tag,
            message=message,
            api_key=api_key,
            provider=provider_entry["provider"],
            ws=websocket,
        )

    try:
        await websocket.close()
    except Exception:
        pass
