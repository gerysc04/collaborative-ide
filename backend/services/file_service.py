import asyncio
import logging
import traceback
from fastapi import WebSocket

logger = logging.getLogger(__name__)
from helpers.docker_helpers import exec_in_container, exec_socket_in_container

_PRUNE_DIRS = [
    "*/node_modules/*", "*/.git/*", "*/.next/*", "*/__pycache__/*",
    "*/.venv/*", "*/venv/*", "*/.env/*", "*/dist/*", "*/build/*",
    "*/.cache/*", "*/.turbo/*",
]

def _find_args(path: str, type_flag: str) -> list:
    args = ["find", path, "-type", type_flag]
    for pat in _PRUNE_DIRS:
        args += ["-not", "-path", pat]
    return args

async def get_file_tree(container_id: str) -> dict:
    _, dirs_output = await exec_in_container(container_id, _find_args("/app", "d"))
    _, files_output = await exec_in_container(container_id, _find_args("/app", "f"))

    dirs = set(dirs_output.decode("utf-8").strip().split("\n")) if dirs_output else set()
    files_raw = files_output.decode("utf-8").strip() if files_output else ""

    return parse_file_tree(dirs, files_raw)

def parse_file_tree(dirs: set, files_raw: str) -> dict:
    files = [p for p in files_raw.split("\n") if p.startswith("/app/")]
    root = {"name": "app", "path": "/app", "type": "directory", "children": []}

    all_paths = []
    for d in sorted(dirs):
        if d.startswith("/app/") and d != "/app":
            all_paths.append((d, "directory"))
    for f in sorted(files):
        all_paths.append((f, "file"))

    for path, node_type in sorted(all_paths):
        parts = path[len("/app/"):].split("/")
        current = root

        for i, part in enumerate(parts):
            full_path = "/app/" + "/".join(parts[:i+1])
            is_last = i == len(parts) - 1

            existing = next((c for c in (current["children"] or []) if c["name"] == part), None)

            if existing:
                current = existing
            else:
                node = {
                    "name": part,
                    "path": full_path,
                    "type": node_type if is_last else "directory",
                    "children": [] if (not is_last or node_type == "directory") else None
                }
                current["children"].append(node)
                if not is_last or node_type == "directory":
                    current = node

    return root

async def create_file_or_dir(container_id: str, path: str, node_type: str) -> None:
    from pathlib import PurePosixPath
    if node_type == 'directory':
        await exec_in_container(container_id, ["mkdir", "-p", path])
    else:
        parent = str(PurePosixPath(path).parent)
        await exec_in_container(container_id, ["mkdir", "-p", parent])
        await exec_in_container(container_id, ["touch", path])

async def get_file_content(container_id: str, path: str) -> str:
    _, output = await exec_in_container(container_id, ["cat", path])
    return output.decode("utf-8") if output else ""

async def write_file_content(container_id: str, path: str, content: str) -> bool:
    import base64
    encoded = base64.b64encode(content.encode("utf-8")).decode("ascii")
    await exec_in_container(
        container_id,
        ["sh", "-c", f"echo '{encoded}' | base64 -d > {path}"]
    )
    return True

async def watch_files(websocket: WebSocket, container_id: str):
    try:
        sock = await exec_socket_in_container(
            container_id,
            [
                "inotifywait", "-m", "-r", "-e", "create,delete,modify,move",
                "--format", "%e %w%f",
                "--exclude", r"\.(git|next|cache|turbo)|node_modules|__pycache__|\.venv|/venv/|/dist/|/build/",
                "/app",
            ],
            tty=False
        )

        loop = asyncio.get_event_loop()

        while True:
            try:
                data = await loop.run_in_executor(None, sock._sock.recv, 1024)
                if data:
                    await websocket.send_text(data.decode("utf-8", errors="ignore"))
                else:
                    await asyncio.sleep(0.1)
            except Exception as e:
                logger.error(f"watch error: {e}")
                break

    except Exception:
        logger.error(f"watch_files error: {traceback.format_exc()}")
        await websocket.close()
