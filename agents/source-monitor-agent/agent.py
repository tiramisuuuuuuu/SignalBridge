import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import api, build_agent  # noqa: E402


async def handle(text: str) -> str:
    r = await api("GET", "/api/agents/source-check")
    if not r["issues"]:
        return f"Packet version {r['packetVersion']}: no data-quality issues found."
    lines = [f"Packet version {r['packetVersion']}: {len(r['issues'])} issue(s) found:"]
    for i in r["issues"]:
        lines.append(f"- [{i['severity']}] {i['type']}: {i['detail']}")
    return "\n".join(lines)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        print(asyncio.run(handle(" ".join(sys.argv[1:]))))
    else:
        build_agent("SignalBridge Source Monitor", "AGENT_SEED_SOURCE_MONITOR", 8003, handle).run()
