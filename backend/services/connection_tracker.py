import asyncio
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)

INACTIVITY_TIMEOUT = 600  # 10 minutes

_active_connections: dict[str, set] = defaultdict(set)
_inactivity_timers: dict[str, asyncio.TimerHandle] = {}
_snapshot_callback = None


def set_snapshot_callback(fn) -> None:
    global _snapshot_callback
    _snapshot_callback = fn


def _schedule_inactivity(session_id: str) -> None:
    loop = asyncio.get_running_loop()

    def _on_inactive():
        if not _active_connections[session_id] and _snapshot_callback:
            asyncio.ensure_future(_snapshot_callback(session_id))
            logger.info(f"Session {session_id} inactive — triggering snapshot")

    handle = loop.call_later(INACTIVITY_TIMEOUT, _on_inactive)
    _inactivity_timers[session_id] = handle


def connect(session_id: str, ws_id: object) -> None:
    _active_connections[session_id].add(ws_id)
    handle = _inactivity_timers.pop(session_id, None)
    if handle:
        handle.cancel()


def disconnect(session_id: str, ws_id: object) -> None:
    _active_connections[session_id].discard(ws_id)
    if not _active_connections[session_id]:
        try:
            _schedule_inactivity(session_id)
        except RuntimeError:
            pass


def is_active(session_id: str) -> bool:
    return bool(_active_connections.get(session_id))
