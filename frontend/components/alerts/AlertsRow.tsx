import type { LiveAlert } from "@/types";
import AlertBadge from "./AlertBadge";

export default function AlertsRow({ alerts }: { alerts: LiveAlert[] }) {
  if (!alerts.length)
    return <div className="all-clear">No active disasters or road closures in your area.</div>;
  return (
    <section className="alerts" aria-label="Live safety alerts">
      {alerts.map((a) => <AlertBadge key={a.id} alert={a} />)}
    </section>
  );
}
