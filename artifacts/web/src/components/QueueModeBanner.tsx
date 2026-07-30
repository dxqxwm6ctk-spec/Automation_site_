import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Polls /api/ready once on mount and shows a warning banner if the execution
 * queue is running in in-process mode (no Redis configured). The banner is
 * purely informational — the app still works, but executions won't survive a
 * server restart and there are no retries.
 */
export function QueueModeBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    fetch("/api/ready", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { checks?: { queue?: string } }) => {
        if (data?.checks?.queue === "in-process") {
          setShowBanner(true);
        }
      })
      .catch(() => {
        // Silently ignore — can't reach the API
      });
  }, []);

  if (!showBanner) return null;

  return (
    <div className="flex items-center gap-2 border-b bg-yellow-50 px-4 py-2 text-sm text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        <strong>In-process execution mode:</strong> Redis is not configured.
        Executions run in-memory only — they won't survive a server restart and
        have no retries. Configure{" "}
        <code className="rounded bg-yellow-100 px-1 dark:bg-yellow-900">
          REDIS_URL
        </code>{" "}
        to enable durable queuing.
      </span>
    </div>
  );
}
