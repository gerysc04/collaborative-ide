from fastapi import APIRouter
from routes.sessions import router as sessions_router
from routes.execution import router as execution_router
from routes.files import router as files_router

router = APIRouter()

router.include_router(sessions_router)
router.include_router(execution_router)
router.include_router(files_router)