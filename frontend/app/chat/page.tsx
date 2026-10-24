import { Suspense } from "react";
import ChatPage from "@/components/chat/ChatPage";

export const metadata = { title: "SignalBridge Assistant" };

export default function Chat() {
  return <Suspense fallback={null}><ChatPage /></Suspense>;
}
