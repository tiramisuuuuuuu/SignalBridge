import type { ChatMessage } from "@/types";
import { timeAgo } from "@/lib/time";

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const mine = message.role === "user";
  return (
    <div className={`msg ${mine ? "mine" : "theirs"}`}>
      <p className="msg-who">{mine ? "You" : "SignalBridge"}</p>
      <p className="msg-text">{message.text}</p>
      {message.warning && <p className="msg-warn" role="note">⚠️ {message.warning}</p>}
      {message.sources && message.sources.length > 0 && (
        <ul className="msg-sources">
          {message.sources.map((s, i) => (
            <li key={i}>
              <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a>
              {s.distanceMiles !== undefined && <> · {s.distanceMiles} mi away</>} · Updated {timeAgo(s.updatedAt)}
            </li>
          ))}
        </ul>
      )}
      <p className="msg-time">{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
    </div>
  );
}
