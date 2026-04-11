from fastapi import APIRouter, WebSocket
from services.docker_service import run_code

router = APIRouter()

@router.websocket("/ws/execute/{session_id}")
async def execute_code(websocket: WebSocket, session_id: str):
    await websocket.accept()
    
    try:
        while True:
            code = await websocket.receive_text()
            output = await run_code(code)
            await websocket.send_text(output)
    except Exception as e:
        await websocket.send_text(f"Error: {str(e)}")
        await websocket.close()