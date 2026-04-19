from fastapi import APIRouter
from routes.sessions import router as sessions_router
from routes.execution import router as execution_router
from routes.files import router as files_router
from routes.auth import router as auth_router
from routes.github import router as github_router
from routes.ports import router as ports_router
from routes.ai_providers import router as ai_providers_router
from routes.ai import router as ai_router
from routes.run_configs import router as run_configs_router
from routes.stats import router as stats_router

router = APIRouter()

router.include_router(sessions_router)
router.include_router(execution_router)
router.include_router(files_router)
router.include_router(auth_router)
router.include_router(github_router)
router.include_router(ports_router)
router.include_router(ai_providers_router)
router.include_router(ai_router)
router.include_router(run_configs_router)
router.include_router(stats_router)