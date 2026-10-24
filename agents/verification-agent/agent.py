import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import api, build_agent  # noqa: E402


async def handle(text: str) -> str:
    r = await api("GET", "/api/agents/verify")
    lines = [f"Shelter verification for packet version {r['packetVersion']}:"]
    for v in r["verdicts"]:
        if v["verified"]:
            lines.append(f"- {v['shelterId']}: {v['recommendedStatus']} (verified). {v['reason']}")
        else:
            lines.append(
                f"- {v['shelterId']}: UNVERIFIED. Sources reported {v['reportedStatus']}, "
                f"recommended status is {v['recommendedStatus']}. {v['reason']}"
            )
    return "\n".join(lines)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        print(asyncio.run(handle(" ".join(sys.argv[1:]))))
    else:
        build_agent("SignalBridge Verification Agent", "AGENT_SEED_VERIFICATION", 8002, handle).run()
