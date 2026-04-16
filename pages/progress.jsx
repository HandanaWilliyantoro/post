import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";

import Layout from "@/components/Layout";
import ProgressBar from "@/components/ProgressBar";
import PrimaryButton from "@/components/PrimaryButton";

function formatStartDate(startDate) {
  if (!startDate) {
    return "Waiting for a start date";
  }

  const date = new Date(startDate);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function ProgressPage() {
  const router = useRouter();
  const { startDate } = router.query;

  const [percentage, setPercentage] = useState(0);
  const [connectionState, setConnectionState] = useState("idle");
  const eventSourceRef = useRef(null);

  useEffect(() => {
    if (!startDate) {
      return;
    }

    const eventSource = new EventSource(
      `/api/bulk-publish-stream?startDate=${startDate}`
    );

    eventSourceRef.current = eventSource;
    setConnectionState("connecting");

    eventSource.onopen = () => {
      setConnectionState("streaming");
    };

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.percentage !== undefined) {
        setPercentage(data.percentage);
      }

      if (data.status === "done") {
        setConnectionState("complete");
        eventSource.close();
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE error:", error);
      setConnectionState("error");
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [startDate]);

  const handleAbort = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setConnectionState("aborted");
    router.push("/");
  };

  const statusLabel = useMemo(() => {
    const labels = {
      idle: "Waiting",
      connecting: "Connecting",
      streaming: "Streaming",
      complete: "Completed",
      error: "Needs Attention",
      aborted: "Stopped",
    };

    return labels[connectionState] || "Unknown";
  }, [connectionState]);

  const completionMessage =
    percentage >= 100
      ? "The scheduler reported full completion."
      : "The stream will update this panel as the job advances.";

  return (
    <Layout
      eyebrow="Operations Monitor"
      title="Scheduling Progress"
      description="Watch the publishing run in real time, keep an eye on the live stream state, and return to the scheduler whenever you need to adjust course."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_360px]">
        <section className="dashboard-card">
          <div className="dashboard-card-header">
            <div>
              <p className="dashboard-section-label">Live Stream</p>
              <h3 className="dashboard-card-title">Run progress</h3>
            </div>
            <div className="dashboard-badge dashboard-badge-accent">
              {statusLabel}
            </div>
          </div>

          <div className="mt-8">
            <ProgressBar percentage={percentage} />
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="dashboard-stat-card">
              <p className="dashboard-stat-label">Start Date</p>
              <p className="dashboard-stat-value">{formatStartDate(startDate)}</p>
            </div>

            <div className="dashboard-stat-card">
              <p className="dashboard-stat-label">Connection</p>
              <p className="dashboard-stat-value">{statusLabel}</p>
            </div>

            <div className="dashboard-stat-card">
              <p className="dashboard-stat-label">Completion</p>
              <p className="dashboard-stat-value">{percentage}%</p>
            </div>
          </div>

          <div className="mt-8 rounded-[22px] border border-[var(--color-border)] bg-[var(--color-panel-muted)] p-5">
            <p className="dashboard-section-label">Run Notes</p>
            <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
              {completionMessage}
            </p>
          </div>
        </section>

        <aside className="grid gap-6">
          <section className="dashboard-card">
            <p className="dashboard-section-label">Session Control</p>
            <h3 className="dashboard-card-title mt-3">Manage this run</h3>
            <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
              Closing the stream stops live monitoring in the browser and sends
              you back to the scheduler workspace.
            </p>

            <div className="mt-6">
              <PrimaryButton variant="ghost" onClick={handleAbort}>
                Exit Monitoring View
              </PrimaryButton>
            </div>
          </section>

          <section className="dashboard-card">
            <p className="dashboard-section-label">Health Snapshot</p>
            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between rounded-2xl border border-[var(--color-border)] px-4 py-3">
                <span className="text-sm font-medium text-[var(--color-ink)]">
                  Stream state
                </span>
                <span className="dashboard-status-pill">{statusLabel}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-[var(--color-border)] px-4 py-3">
                <span className="text-sm font-medium text-[var(--color-ink)]">
                  Job progress
                </span>
                <span className="dashboard-status-pill dashboard-status-pill-warm">
                  {percentage}%
                </span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </Layout>
  );
}
