import { timeAgo } from "@/lib/time";

export default function StatusBar({ sources, updatedAt }: { sources: number; updatedAt: string }) {
  return (
    <footer className="status">
      <span>Sources checked: {sources}</span>
      <span>Last updated: {timeAgo(updatedAt)}</span>
    </footer>
  );
}
