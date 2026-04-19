import asyncio
from fastapi import WebSocket
from helpers.docker_helpers import exec_socket_in_container

MAX_BUFFER = 50_000  # replay last 50KB to new joiners


class SharedTerminalManager:
    def __init__(self):
        # session_id → name → {sock, clients, task, buffer}
        self._terminals: dict[str, dict[str, dict]] = {}

    def list_terminals(self, session_id: str) -> list[str]:
        return list(self._terminals.get(session_id, {}).keys())

    async def connect(
        self, session_id: str, name: str, container_id: str, websocket: WebSocket
    ):
        if session_id not in self._terminals:
            self._terminals[session_id] = {}

        terminals = self._terminals[session_id]

        if name not in terminals:
            sock = await exec_socket_in_container(container_id, ["/bin/bash"])
            entry: dict = {
                "sock": sock,
                "clients": set(),
                "task": None,
                "buffer": bytearray(),
            }
            terminals[name] = entry
            entry["task"] = asyncio.create_task(
                self._read_loop(session_id, name)
            )

        entry = terminals[name]
        entry["clients"].add(websocket)

        # Replay buffered output so new joiners see the session history
        if entry["buffer"]:
            try:
                await websocket.send_bytes(bytes(entry["buffer"]))
            except Exception:
                pass

        loop = asyncio.get_event_loop()
        try:
            while True:
                msg = await websocket.receive()
                if "bytes" in msg:
                    await loop.run_in_executor(
                        None, entry["sock"]._sock.sendall, msg["bytes"]
                    )
                elif "text" in msg:
                    await loop.run_in_executor(
                        None, entry["sock"]._sock.sendall, msg["text"].encode()
                    )
                else:
                    break
        except Exception:
            pass
        finally:
            entry["clients"].discard(websocket)

    async def _read_loop(self, session_id: str, name: str):
        entry = self._terminals[session_id][name]
        sock = entry["sock"]
        loop = asyncio.get_event_loop()

        while True:
            try:
                data = await loop.run_in_executor(None, sock._sock.recv, 1024)
                if not data:
                    await asyncio.sleep(0.01)
                    continue

                entry["buffer"].extend(data)
                if len(entry["buffer"]) > MAX_BUFFER:
                    entry["buffer"] = entry["buffer"][-MAX_BUFFER:]

                dead: set = set()
                for client in list(entry["clients"]):
                    try:
                        await client.send_bytes(data)
                    except Exception:
                        dead.add(client)
                entry["clients"] -= dead
            except Exception:
                break

    def cleanup_session(self, session_id: str):
        for entry in self._terminals.pop(session_id, {}).values():
            task = entry.get("task")
            if task:
                task.cancel()


shared_terminal_manager = SharedTerminalManager()
