import asyncio
import json
from fastapi import WebSocket
from services.file_service import get_file_content, write_file_content
from helpers.docker_helpers import exec_in_container

# One asyncio.Lock per session — prevents concurrent agents fighting over files
_session_locks: dict[str, asyncio.Lock] = {}


def get_session_lock(session_id: str) -> asyncio.Lock:
    if session_id not in _session_locks:
        _session_locks[session_id] = asyncio.Lock()
    return _session_locks[session_id]


TOOL_DEFINITIONS_ANTHROPIC = [
    {
        "name": "read_file",
        "description": "Read the content of a file in the project. Use absolute paths starting with /app/.",
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string", "description": "Absolute path to the file, e.g. /app/src/index.ts"}},
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Write (create or overwrite) a file in the project.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Absolute path to the file"},
                "content": {"type": "string", "description": "Full file content to write"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "run_command",
        "description": "Run a shell command in the project container (working dir /app). Output is truncated at 4000 chars.",
        "input_schema": {
            "type": "object",
            "properties": {"command": {"type": "string", "description": "Shell command to execute"}},
            "required": ["command"],
        },
    },
]

TOOL_DEFINITIONS_OPENAI = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the content of a file in the project. Use absolute paths starting with /app/.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write (create or overwrite) a file in the project.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_command",
            "description": "Run a shell command in the project container (working dir /app). Output truncated at 4000 chars.",
            "parameters": {
                "type": "object",
                "properties": {"command": {"type": "string"}},
                "required": ["command"],
            },
        },
    },
]

TOOL_DEFINITIONS_GEMINI = [
    {
        "name": "read_file",
        "description": "Read the content of a file in the project. Use absolute paths starting with /app/.",
        "parameters": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Write (create or overwrite) a file in the project.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "run_command",
        "description": "Run a shell command in the project container (working dir /app). Output truncated at 4000 chars.",
        "parameters": {
            "type": "object",
            "properties": {"command": {"type": "string"}},
            "required": ["command"],
        },
    },
]


def _make_tool_fns(container_id: str) -> dict:
    async def read_file(path: str) -> str:
        try:
            return await get_file_content(container_id, path)
        except Exception as e:
            return f"Error reading file: {e}"

    async def write_file(path: str, content: str) -> str:
        try:
            await write_file_content(container_id, path, content)
            return "ok"
        except Exception as e:
            return f"Error writing file: {e}"

    async def run_command(command: str) -> str:
        try:
            _, output = await exec_in_container(container_id, ["sh", "-c", command])
            return (output.decode("utf-8", errors="replace") if output else "")[:4000]
        except Exception as e:
            return f"Error: {e}"

    return {"read_file": read_file, "write_file": write_file, "run_command": run_command}


async def run_agent(
    session_id: str,
    branch: str,
    tag: str,
    message: str,
    api_key: str,
    provider: str,
    ws: WebSocket,
):
    from services.mongo_service import sessions_collection

    session = await sessions_collection.find_one({"id": session_id})
    if not session:
        await ws.send_json({"type": "error", "message": "Session not found"})
        return

    containers = session.get("containers", {})
    default_branch = session.get("default_branch", "main")
    container_id = containers.get(branch or default_branch) or session.get("container_id")

    if not container_id:
        await ws.send_json({"type": "error", "message": "No container found for this branch"})
        return

    tool_fns = _make_tool_fns(container_id)

    try:
        if provider == "anthropic":
            await _run_anthropic(message, api_key, tool_fns, ws)
        elif provider == "openai":
            await _run_openai(message, api_key, tool_fns, ws)
        elif provider == "gemini":
            await _run_gemini(message, api_key, tool_fns, ws)
        else:
            await ws.send_json({"type": "error", "message": f"Unknown provider: {provider}"})
            return
    except Exception as e:
        await ws.send_json({"type": "error", "message": str(e)})
        return

    await ws.send_json({"type": "done"})


async def _run_anthropic(message: str, api_key: str, tools: dict, ws: WebSocket):
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=api_key)
    messages = [{"role": "user", "content": message}]

    while True:
        tool_uses_by_index: dict[int, dict] = {}

        async with client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            tools=TOOL_DEFINITIONS_ANTHROPIC,
            messages=messages,
        ) as stream:
            async for event in stream:
                etype = getattr(event, "type", None)
                if etype == "content_block_start":
                    cb = event.content_block
                    if cb.type == "tool_use":
                        tool_uses_by_index[event.index] = {
                            "id": cb.id,
                            "name": cb.name,
                            "input_json": "",
                        }
                elif etype == "content_block_delta":
                    delta = event.delta
                    if delta.type == "text_delta":
                        await ws.send_json({"type": "token", "content": delta.text})
                    elif delta.type == "input_json_delta":
                        if event.index in tool_uses_by_index:
                            tool_uses_by_index[event.index]["input_json"] += delta.partial_json

            final = await stream.get_final_message()

        stop_reason = final.stop_reason

        # Build assistant turn from final message
        assistant_content = []
        for block in final.content:
            if block.type == "text":
                assistant_content.append({"type": "text", "text": block.text})
            elif block.type == "tool_use":
                assistant_content.append({
                    "type": "tool_use",
                    "id": block.id,
                    "name": block.name,
                    "input": block.input,
                })
        messages.append({"role": "assistant", "content": assistant_content})

        tool_use_blocks = [b for b in final.content if b.type == "tool_use"]
        if stop_reason != "tool_use" or not tool_use_blocks:
            break

        tool_results = []
        for block in tool_use_blocks:
            fn = tools.get(block.name)
            await ws.send_json({"type": "tool_call", "name": block.name, "args": block.input})
            result = await fn(**block.input) if fn else f"Unknown tool: {block.name}"
            await ws.send_json({"type": "tool_result", "name": block.name, "result": result[:500]})
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": result,
            })

        messages.append({"role": "user", "content": tool_results})


async def _run_openai(message: str, api_key: str, tools: dict, ws: WebSocket):
    import openai

    client = openai.AsyncOpenAI(api_key=api_key)
    messages = [{"role": "user", "content": message}]

    while True:
        tool_calls_acc: dict[int, dict] = {}
        full_content = ""
        finish_reason = None

        stream = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=TOOL_DEFINITIONS_OPENAI,
            stream=True,
        )

        async for chunk in stream:
            choice = chunk.choices[0] if chunk.choices else None
            if not choice:
                continue
            if choice.finish_reason:
                finish_reason = choice.finish_reason
            delta = choice.delta
            if delta.content:
                full_content += delta.content
                await ws.send_json({"type": "token", "content": delta.content})
            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index
                    if idx not in tool_calls_acc:
                        tool_calls_acc[idx] = {"id": "", "name": "", "arguments_json": ""}
                    if tc.id:
                        tool_calls_acc[idx]["id"] = tc.id
                    if tc.function and tc.function.name:
                        tool_calls_acc[idx]["name"] = tc.function.name
                    if tc.function and tc.function.arguments:
                        tool_calls_acc[idx]["arguments_json"] += tc.function.arguments

        tool_calls = list(tool_calls_acc.values())

        assistant_msg: dict = {"role": "assistant"}
        if full_content:
            assistant_msg["content"] = full_content
        if tool_calls:
            assistant_msg["tool_calls"] = [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {"name": tc["name"], "arguments": tc["arguments_json"]},
                }
                for tc in tool_calls
            ]
        messages.append(assistant_msg)

        if finish_reason != "tool_calls" or not tool_calls:
            break

        for tc in tool_calls:
            try:
                args = json.loads(tc["arguments_json"]) if tc["arguments_json"] else {}
            except json.JSONDecodeError:
                args = {}
            fn = tools.get(tc["name"])
            await ws.send_json({"type": "tool_call", "name": tc["name"], "args": args})
            result = await fn(**args) if fn else f"Unknown tool: {tc['name']}"
            await ws.send_json({"type": "tool_result", "name": tc["name"], "result": result[:500]})
            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": result,
            })


async def _run_gemini(message: str, api_key: str, tools: dict, ws: WebSocket):
    from google import genai as gai
    from google.genai import types as gtypes

    client = gai.Client(api_key=api_key)

    fn_declarations = [
        gtypes.FunctionDeclaration(
            name=t["name"],
            description=t["description"],
            parameters=t["parameters"],
        )
        for t in TOOL_DEFINITIONS_GEMINI
    ]
    tool_obj = gtypes.Tool(function_declarations=fn_declarations)
    config = gtypes.GenerateContentConfig(tools=[tool_obj])

    contents = [{"role": "user", "parts": [{"text": message}]}]

    while True:
        response = await client.aio.models.generate_content(
            model="gemini-2.0-flash",
            contents=contents,
            config=config,
        )

        candidate = response.candidates[0] if response.candidates else None
        if not candidate:
            break

        text_parts = []
        function_calls = []
        for part in candidate.content.parts:
            if hasattr(part, "text") and part.text:
                text_parts.append(part.text)
            if hasattr(part, "function_call") and part.function_call:
                function_calls.append(part.function_call)

        for text in text_parts:
            await ws.send_json({"type": "token", "content": text})

        # Add assistant turn to history
        contents.append({"role": "model", "parts": candidate.content.parts})

        if not function_calls:
            break

        function_response_parts = []
        for fc in function_calls:
            args = {k: v for k, v in fc.args.items()}
            fn = tools.get(fc.name)
            await ws.send_json({"type": "tool_call", "name": fc.name, "args": args})
            result = await fn(**args) if fn else f"Unknown tool: {fc.name}"
            await ws.send_json({"type": "tool_result", "name": fc.name, "result": result[:500]})
            function_response_parts.append(
                gtypes.Part.from_function_response(name=fc.name, response={"result": result})
            )

        contents.append({"role": "user", "parts": function_response_parts})
