import asyncio
import logging
import re
import traceback
import docker
import httpx
import websockets
from fastapi import APIRouter, Request, WebSocket, HTTPException
from fastapi.responses import RedirectResponse, Response
from services.mongo_service import sessions_collection

logger = logging.getLogger(__name__)

router = APIRouter()
docker_client = docker.from_env()


def _get_container_ip(container_id: str) -> str:
    container = docker_client.containers.get(container_id)
    container.reload()
    ns = container.attrs["NetworkSettings"]
    # Default bridge network
    ip = ns.get("IPAddress", "")
    if ip:
        return ip
    # Named networks (e.g. custom bridge)
    networks = ns.get("Networks", {})
    for net in networks.values():
        ip = net.get("IPAddress", "")
        if ip:
            return ip
    raise RuntimeError(f"No IP found for container {container_id}")


def _rewrite_html(html: bytes, base_path: str) -> bytes:
    """Rewrite absolute paths in HTML so assets load through the proxy."""
    text = html.decode("utf-8", errors="replace")

    # Rewrite absolute paths in HTML attributes (src=, href=, action=)
    # e.g. src="/_next/..." → src="/{session_id}/{port}/_next/..."
    # Skip external URLs (http://, https://, //)
    def rewrite_attr(m: re.Match) -> str:
        attr, url = m.group(1), m.group(2)
        if url.startswith(("http://", "https://", "//")):
            return m.group(0)
        return f'{attr}="{base_path.rstrip("/")}{url}"'

    text = re.sub(r'(src|href|action|data-src)="(/[^"]*)"', rewrite_attr, text)

    # Rewrite url(...) in inline styles
    def rewrite_url(m: re.Match) -> str:
        url = m.group(1).strip("'\"")
        if url.startswith(("http://", "https://", "//", "data:")):
            return m.group(0)
        if url.startswith("/"):
            return f'url("{base_path.rstrip("/")}{url}")'
        return m.group(0)

    text = re.sub(r'url\(([^)]+)\)', rewrite_url, text)

    # Inject base tag so relative URLs (if any) also resolve correctly
    base_tag = f'<base href="{base_path}">'
    if "<base " not in text and "<base>" not in text:
        for head_tag in ("<head>", "<Head>", "<HEAD>"):
            if head_tag in text:
                text = text.replace(head_tag, head_tag + base_tag, 1)
                break

    return text.encode("utf-8")


@router.get("/{session_id}/{port}", include_in_schema=False)
async def proxy_redirect(session_id: str, port: int):
    return RedirectResponse(url=f"/{session_id}/{port}/")


@router.api_route(
    "/{session_id}/{port}/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
    include_in_schema=False,
)
async def http_proxy(session_id: str, port: int, path: str, request: Request):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    loop = asyncio.get_event_loop()
    try:
        container_ip = await loop.run_in_executor(
            None, _get_container_ip, session["container_id"]
        )
    except Exception:
        raise HTTPException(status_code=503, detail="Container not available")

    query = str(request.url.query)
    target = f"http://{container_ip}:{port}/{path}"
    if query:
        target += f"?{query}"

    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in ("host", "content-length", "transfer-encoding")
    }
    body = await request.body()

    timeout = httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=10.0)
    async with httpx.AsyncClient(follow_redirects=False, timeout=timeout) as client:
        try:
            resp = await client.request(
                method=request.method,
                url=target,
                headers=headers,
                content=body,
            )
        except httpx.ConnectError:
            raise HTTPException(
                status_code=502,
                detail=f"Nothing is listening on port {port} in the container",
            )
        except httpx.ReadTimeout:
            raise HTTPException(
                status_code=504,
                detail=f"Container port {port} accepted the connection but did not respond in time",
            )
        except Exception as e:
            logger.error(f"Proxy request failed: {traceback.format_exc()}")
            raise HTTPException(status_code=502, detail=f"Proxy error: {type(e).__name__}: {repr(e)}")

    try:
        content_type = resp.headers.get("content-type", "")
        resp_headers = {
            k: v
            for k, v in resp.headers.items()
            if k.lower()
            not in ("content-encoding", "transfer-encoding", "content-length")
        }

        content = resp.content
        if "text/html" in content_type:
            content = _rewrite_html(content, f"/{session_id}/{port}/")

        return Response(
            content=content,
            status_code=resp.status_code,
            headers=resp_headers,
            media_type=content_type,
        )
    except Exception as e:
        logger.error(f"Proxy response handling failed: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Response handling error: {e}")


@router.websocket("/{session_id}/{port}/{path:path}")
async def ws_proxy(websocket: WebSocket, session_id: str, port: int, path: str):
    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        await websocket.close(code=1008)
        return

    loop = asyncio.get_event_loop()
    try:
        container_ip = await loop.run_in_executor(
            None, _get_container_ip, session["container_id"]
        )
    except Exception:
        await websocket.close(code=1011)
        return

    query = str(websocket.url.query)
    target = f"ws://{container_ip}:{port}/{path}"
    if query:
        target += f"?{query}"

    await websocket.accept()
    try:
        async with websockets.connect(target) as ws_conn:

            async def fwd_to_container():
                try:
                    while True:
                        msg = await websocket.receive()
                        if "bytes" in msg:
                            await ws_conn.send(msg["bytes"])
                        elif "text" in msg:
                            await ws_conn.send(msg["text"])
                        else:
                            break
                except Exception:
                    pass

            async def fwd_to_client():
                try:
                    async for msg in ws_conn:
                        if isinstance(msg, bytes):
                            await websocket.send_bytes(msg)
                        else:
                            await websocket.send_text(msg)
                except Exception:
                    pass

            await asyncio.gather(fwd_to_container(), fwd_to_client())
    except Exception:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
