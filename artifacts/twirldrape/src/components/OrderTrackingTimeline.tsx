import React from "react";
import { CheckCircle2, Circle, XCircle, Clock } from "lucide-react";

export type StatusHistoryEntry = {
  status: string;
  timestamp: string;
  note?: string;
};

type Stage = {
  key: string;
  label: string;
  description: string;
};

const NORMAL_STAGES: Stage[] = [
  { key: "confirmed", label: "Order Confirmed", description: "Your order has been placed" },
  { key: "processing", label: "Processing", description: "We're preparing your saree" },
  { key: "dispatched", label: "Dispatched", description: "Your order is on the way" },
  { key: "out_for_delivery", label: "Out for Delivery", description: "Almost there!" },
  { key: "delivered", label: "Delivered", description: "Enjoy your saree!" },
];

const STATUS_ORDER = ["confirmed", "processing", "dispatched", "out_for_delivery", "delivered"];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let count = 0;
  while (count < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return d;
}

function estimatedLabel(stageKey: string, createdAt: string): string {
  const base = new Date(createdAt);
  const daysMap: Record<string, number> = {
    processing: 1,
    dispatched: 2,
    out_for_delivery: 5,
    delivered: 7,
  };
  const days = daysMap[stageKey] ?? 1;
  const est = addBusinessDays(base, days);
  return est.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

type Props = {
  statusHistory: StatusHistoryEntry[];
  currentStatus: string;
  createdAt: string;
};

export function OrderTrackingTimeline({ statusHistory, currentStatus, createdAt }: Props) {
  const isCancelled = currentStatus === "cancelled";

  const historyMap = new Map<string, string>();
  for (const entry of statusHistory) {
    historyMap.set(entry.status, entry.timestamp);
  }

  if (isCancelled) {
    const cancelledEntry = historyMap.get("cancelled");
    const completedBeforeCancel = NORMAL_STAGES.filter(s => historyMap.has(s.key));

    return (
      <div className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5">
        <h2 className="font-serif text-lg font-bold text-[#1E6B5A] mb-4">Order Timeline</h2>
        <div className="relative pl-8">
          {[...completedBeforeCancel.map(s => ({ key: s.key, label: s.label, ts: historyMap.get(s.key)!, cancelled: false })),
            { key: "cancelled", label: "Order Cancelled", ts: cancelledEntry ?? null, cancelled: true }
          ].map((step, i, arr) => (
            <div key={step.key} className="relative pb-6 last:pb-0">
              {i < arr.length - 1 && (
                <div className={`absolute left-[-16px] top-4 w-0.5 h-full ${step.cancelled ? "bg-red-200" : "bg-gradient-to-b from-[#1E6B5A] to-[#C9A84C]"}`} />
              )}
              <div className="absolute left-[-20px] top-0">
                {step.cancelled ? (
                  <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shadow-sm">
                    <XCircle size={13} className="text-white" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full bg-[#1E6B5A] flex items-center justify-center shadow-sm">
                    <CheckCircle2 size={13} className="text-[#C9A84C]" />
                  </div>
                )}
              </div>
              <div className="ml-1">
                <p className={`font-semibold text-sm leading-tight ${step.cancelled ? "text-red-600 dark:text-red-400" : "text-[#1E6B5A]"}`}>
                  {step.label}
                </p>
                {step.ts && (
                  <p className="text-xs text-gray-500 mt-0.5">{formatDateTime(step.ts)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const currentIdx = STATUS_ORDER.indexOf(currentStatus);

  return (
    <div className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5">
      <h2 className="font-serif text-lg font-bold text-[#1E6B5A] mb-4">Order Tracking</h2>
      <div className="relative pl-8">
        {NORMAL_STAGES.map((stage, idx) => {
          const isCompleted = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isFuture = idx > currentIdx;

          const resolvedTs = historyMap.get(stage.key) ?? null;

          return (
            <div key={stage.key} className="relative pb-6 last:pb-0">
              {idx < NORMAL_STAGES.length - 1 && (
                <div
                  className={`absolute left-[-16px] top-4 w-0.5 h-full ${
                    isCompleted || isCurrent
                      ? "bg-gradient-to-b from-[#1E6B5A] to-[#C9A84C]"
                      : "bg-gray-200 dark:bg-gray-700"
                  }`}
                />
              )}

              <div className="absolute left-[-20px] top-0">
                {isCompleted ? (
                  <div className="w-5 h-5 rounded-full bg-[#1E6B5A] flex items-center justify-center shadow-sm">
                    <CheckCircle2 size={13} className="text-[#C9A84C]" />
                  </div>
                ) : isCurrent ? (
                  <div className="w-5 h-5 rounded-full bg-[#C9A84C] flex items-center justify-center shadow-md ring-2 ring-[#C9A84C]/30">
                    <Clock size={11} className="text-[#1E6B5A]" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                    <Circle size={11} className="text-gray-400" />
                  </div>
                )}
              </div>

              <div className="ml-1">
                <p
                  className={`font-semibold text-sm leading-tight ${
                    isCompleted
                      ? "text-[#1E6B5A]"
                      : isCurrent
                      ? "text-[#C9A84C]"
                      : "text-gray-400 dark:text-gray-600"
                  }`}
                >
                  {stage.label}
                  {isCurrent && (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#C9A84C]/15 text-[#C9A84C] uppercase tracking-wide">
                      Current
                    </span>
                  )}
                </p>
                <p
                  className={`text-xs mt-0.5 ${
                    isFuture ? "text-gray-300 dark:text-gray-700" : "text-gray-500"
                  }`}
                >
                  {stage.description}
                </p>
                {resolvedTs && (
                  <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(resolvedTs)}</p>
                )}
                {isCurrent && (
                  <p className="text-xs font-medium text-[#C9A84C]/80 mt-0.5">
                    Expected by {estimatedLabel(stage.key, createdAt)}
                  </p>
                )}
                {isFuture && (
                  <p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5">
                    Est. {estimatedLabel(stage.key, createdAt)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
