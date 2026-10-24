"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ChatHeader } from "./components/ChatHeader";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { ChatMessages } from "./components/ChatMessages";
import { ChatComposer } from "./components/ChatComposer";
import { createDemoResponse } from "./components/demo-response";
import type { Message } from "./components/types";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  function submitQuestion(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setHasStarted(true);
    setInput("");
    setMessages((current) => [
      ...current,
      { id: Date.now(), role: "user", content: trimmed },
    ]);
    setLoading(true);

    // Demo only. Replace this with a request to your own API route.
    window.setTimeout(() => {
      const response = createDemoResponse(trimmed);
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: response.content,
          cards: response.cards,
        },
      ]);
      setLoading(false);
    }, 900);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitQuestion(input);
  }

  function resetChat() {
    setMessages([]);
    setInput("");
    setHasStarted(false);
    setLoading(false);
  }

  return (
    <main className="app-shell">
      <ChatHeader onNewChat={resetChat} />

      <section className={`chat-layout ${hasStarted ? "chat-layout-active" : ""}`}>
        {!hasStarted ? (
          <WelcomeScreen onSelectPrompt={submitQuestion} />
        ) : (
          <ChatMessages messages={messages} loading={loading} bottomRef={bottomRef} />
        )}

        <ChatComposer
          value={input}
          loading={loading}
          onChange={setInput}
          onSubmit={handleSubmit}
        />
      </section>
    </main>
  );
}
