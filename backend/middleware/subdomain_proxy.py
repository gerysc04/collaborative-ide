import asyncio
import re
import logging
import traceback
import docker
import httpx
import websockets

logger = logging.getLogger(__name__)
docker_client = docker.from_env()

# Matches {uuid}-{port}.anything  e.g. "abc123-3000.lvh.me:8000"
SUBDOMAIN_RE = re.compile(
    r'^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(\d+)\.'
)


def _get_container_ip(container_id: str) -> str:
    container = docker_client.containers.get(container_id)
    container.reload()
    ns = container.attrs["NetworkSettings"]
    ip = ns.get("IPAddress", "")
    if ip:
        return ip
    for net in ns.get("Networks", {}).values():
        ip = net.get("IPAddress", "")
        if ip:
            return ip
    raise RuntimeError(f"No IP found for container {container_id}")


async def _send_http_error(send, status: int, message: str):
    body = message.encode()
    await send({
        "type": "http.response.start",
        "status": status,
        "headers": [
            (b"content-type", b"text/plain"),
            (b"content-length", str(len(body)).encode()),
        ],
    })
    await send({"type": "http.response.body", "body": body})


class SubdomainProxyMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        host = headers.get(b"host", b"").decode("utf-8", errors="ignore")

        m = SUBDOMAIN_RE.match(host)
        if not m:
            await self.app(scope, receive, send)
            return

        session_id = m.group(1)
        port = int(m.group(2))

        if scope["type"] == "http":
            await self._proxy_http(scope, receive, send, session_id, port)
        else:
            await self._proxy_ws(scope, receive, send, session_id, port)

    async def _resolve(self, session_id: str) -> str:
        from services.mongo_service import sessions_collection
        session = await sessions_collection.find_one({"id": session_id})
        if not session:
            raise ValueError("Session not found")
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _get_container_ip, session["container_id"])

    async def _proxy_http(self, scope, receive, send, session_id: str, port: int):
        try:
            container_ip = await self._resolve(session_id)
        except ValueError:
            await _send_http_error(send, 404, "Session not found")
            return
        except Exception:
            await _send_http_error(send, 503, "Container not available")
            return

        path = scope["path"]
        query = scope.get("query_string", b"").decode()
        target = f"http://{container_ip}:{port}{path}"
        if query:
            target += f"?{query}"

        # Read request body
        body = b""
        more_body = True
        while more_body:
            message = await receive()
            body += message.get("body", b"")
            more_body = message.get("more_body", False)

        req_headers = [
            (k.decode(), v.decode())
            for k, v in scope["headers"]
            if k.lower() not in (b"host", b"content-length", b"transfer-encoding")
        ]

        timeout = httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=10.0)
        async with httpx.AsyncClient(follow_redirects=False, timeout=timeout) as client:
            try:
                resp = await client.request(
                    method=scope["method"],
                    url=target,
                    headers=req_headers,
                    content=body,
                )
            except httpx.ConnectError:
                await _send_http_error(send, 502, f"Nothing listening on port {port} in the container")
                return
            except httpx.ReadTimeout:
                await _send_http_error(send, 504, f"Port {port} timed out")
                return
            except Exception as e:
                logger.error(traceback.format_exc())
                await _send_http_error(send, 502, f"Proxy error: {e}")
                return

        resp_headers = [
            (k.lower().encode(), v.encode())
            for k, v in resp.headers.items()
            if k.lower() not in ("content-encoding", "transfer-encoding", "content-length")
        ]

        await send({
            "type": "http.response.start",
            "status": resp.status_code,
            "headers": resp_headers,
        })
        await send({
            "type": "http.response.body",
            "body": resp.content,
        })

    async def _proxy_ws(self, scope, receive, send, session_id: str, port: int):
        try:
            container_ip = await self._resolve(session_id)
        except Exception:
            await send({"type": "websocket.close", "code": 1011})
            return

        path = scope["path"]
        query = scope.get("query_string", b"").decode()
        target = f"ws://{container_ip}:{port}{path}"
        if query:
            target += f"?{query}"

        await receive()  # consume websocket.connect
        await send({"type": "websocket.accept"})

        try:
            async with websockets.connect(target) as ws_conn:
                async def fwd_to_container():
                    try:
                        while True:
                            msg = await receive()
                            if msg["type"] == "websocket.disconnect":
                                break
                            if msg.get("bytes"):
                                await ws_conn.send(msg["bytes"])
                            elif msg.get("text"):
                                await ws_conn.send(msg["text"])
                    except Exception:
                        pass

                async def fwd_to_client():
                    try:
                        async for data in ws_conn:
                            if isinstance(data, bytes):
                                await send({"type": "websocket.send", "bytes": data})
                            else:
                                await send({"type": "websocket.send", "text": data})
                    except Exception:
                        pass

                await asyncio.gather(fwd_to_container(), fwd_to_client())
        except Exception:
            logger.error(traceback.format_exc())
        finally:
            try:
                await send({"type": "websocket.close", "code": 1000})
            except Exception:
                pass
