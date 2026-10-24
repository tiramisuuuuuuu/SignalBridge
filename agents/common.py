import asyncio
import json
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from uagents import Agent, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    TextContent,
    chat_protocol_spec,
)


def _load_env():
    env = Path(__file__).resolve().parent.parent / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


_load_env()
API = os.environ.get("SIGNALBRIDGE_API_URL", "http://localhost:4000")

FALLBACK = (
    "SignalBridge could not reach its data service, so no shelter information "
    "is available right now. Follow official emergency instructions."
)


def _request(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        API + path, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


async def api(method, path, body=None):
    return await asyncio.to_thread(_request, method, path, body)


def build_agent(name, seed_env, port, handler):
    seed = os.environ.get(seed_env)
    if not seed:
        raise SystemExit(f"{seed_env} is missing from .env")

    agent = Agent(name=name, seed=seed, port=port, mailbox=True, publish_agent_details=True)
    protocol = Protocol(spec=chat_protocol_spec)

    @protocol.on_message(ChatMessage)
    async def on_message(ctx, sender, msg):
        await ctx.send(
            sender,
            ChatAcknowledgement(
                timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id
            ),
        )
        text = "".join(c.text for c in msg.content if isinstance(c, TextContent)).strip()
        try:
            reply = await handler(text)
        except Exception:
            ctx.logger.exception("handler failed")
            reply = FALLBACK
        await ctx.send(
            sender,
            ChatMessage(
                timestamp=datetime.now(timezone.utc),
                msg_id=uuid4(),
                content=[
                    TextContent(type="text", text=reply),
                    EndSessionContent(type="end-session"),
                ],
            ),
        )

    @protocol.on_message(ChatAcknowledgement)
    async def on_ack(ctx, sender, msg):
        pass

    agent.include(protocol, publish_manifest=True)
    return agent
