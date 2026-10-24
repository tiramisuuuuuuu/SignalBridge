import type { RefObject } from "react";
import type { Message } from "./types";

type ChatMessagesProps = {
  messages: Message[];
  loading: boolean;
  bottomRef: RefObject<HTMLDivElement | null>;
};

export function ChatMessages({ messages, loading, bottomRef }: ChatMessagesProps) {
  return (
    <div className="conversation" aria-live="polite">
      {messages.map((message) => (
        <article className={`message message-${message.role}`} key={message.id}>
          {message.role === "assistant" && (
            <div className="assistant-avatar" aria-hidden="true">+</div>
          )}

          <div className="message-body">
            {message.role === "user" ? (
              <div className="user-bubble">{message.content}</div>
            ) : (
              <>
                <p className="answer-intro">{message.content}</p>
                {message.cards && message.cards.length > 0 && (
                  <div className="answer-grid">
                    {message.cards.map((card, index) => (
                      <section
                        className="answer-card"
                        key={`${message.id}-${card.title}`}
                        style={{ animationDelay: `${index * 80}ms` }}
                      >
                        <div className="answer-card-top">
                          <span className="card-number">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          {card.tag && <span className="card-tag">{card.tag}</span>}
                        </div>
                        <h2>{card.title}</h2>
                        <p>{card.description}</p>
                        {card.bullets && (
                          <ul className="card-bullets">
                            {card.bullets.map((bullet) => (
                              <li key={bullet}>
                                <span aria-hidden="true">•</span>
                                {bullet}
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </article>
      ))}

      {loading && (
        <div className="message message-assistant" role="status" aria-label="Preparing response">
          <div className="assistant-avatar" aria-hidden="true">+</div>
          <div className="typing-card">
            <span className="typing-dots"><i /><i /><i /></span>
            Preparing response…
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
