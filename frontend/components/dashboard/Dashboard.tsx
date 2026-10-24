"use client";
import { useRouter } from "next/navigation";
import type { UserLocation } from "@/types";
import { sampleAlerts, sampleNews } from "@/data/sample";
import Header from "@/components/layout/Header";
import StatusBar from "@/components/layout/StatusBar";
import AlertsRow from "@/components/alerts/AlertsRow";
import NewsFeed from "@/components/news/NewsFeed";
import ChatPanel from "@/components/chat/ChatPanel";

export default function Dashboard({ location, onChangeLocation }: { location: UserLocation; onChangeLocation: () => void }) {
  const router = useRouter();
  // Swap for fetch("/api/live-alerts?...") and fetch("/api/news?...") once the backend is ready.
  const alerts = sampleAlerts.filter((a) => a.distanceMiles <= location.radiusMiles + 10);
  return (
    <div className="shell">
      <Header location={location} onChange={onChangeLocation} />
      <AlertsRow alerts={alerts} />
      <div className="main">
        <NewsFeed articles={sampleNews} />
        <ChatPanel
          locationLabel={location.label}
          onOpen={(q) => router.push(q ? `/chat?q=${encodeURIComponent(q)}` : "/chat")}
        />
      </div>
      <StatusBar sources={8} updatedAt={new Date(Date.now() - 2 * 60_000).toISOString()} />
    </div>
  );
}
