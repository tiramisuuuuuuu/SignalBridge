import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import api, build_agent  # noqa: E402

HELP = "Tell me what you need, for example: I need a pet-friendly shelter with wheelchair access and no car."


async def handle(text: str) -> str:
    if not text:
        return HELP
    r = await api("POST", "/api/agents/assist", {"text": text})
    lines = []

    if r["recommended"]:
        lines.append("Verified open shelters that match your request:")
        for s in r["recommended"]:
            e = s["evidence"]
            cap = s["capacity"] if s["capacity"] is not None else "unknown"
            updated = e["sourceUpdatedAt"] or "unknown"
            lines.append(
                f"- {s['name']} (capacity {cap}). Source: {e['sourceName']}, "
                f"checked {e['observedAt']}, source updated {updated}."
            )
    else:
        lines.append("No shelter matching your request is verified open right now.")

    if r["checkFirst"]:
        lines.append("Unverified. Confirm before traveling:")
        for s in r["checkFirst"]:
            lines.append(f"- {s['name']}: {s['reason']}")

    lines.extend(r["notes"])
    lines.append(r["disclaimer"])
    return "\n".join(lines)


if __name__ == "__main__":
    if len(sys.argv) > 1:  # local test without Agentverse
        print(asyncio.run(handle(" ".join(sys.argv[1:]))))
    else:
        build_agent("SignalBridge Resident Assistant", "AGENT_SEED_RESIDENT", 8001, handle).run()
