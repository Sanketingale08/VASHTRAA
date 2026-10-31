import React from "react";
import { AlertTriangle, WifiOff, RefreshCw, Inbox, AlertCircle } from "lucide-react";

const NAVY = "#0A1F44";
const GOLD = "#C7CCD1";

/**
 * Safely formats technical errors into user-friendly, safe natural language messages.
 * Ensures no sensitive database stack traces, SQL queries, or internal errors are shown.
 */
export function getFriendlyErrorMessage(error: any, fallbackSection: string = "data"): string {
  if (!error) return `Unable to load ${fallbackSection.toLowerCase()}. Please try again.`;

  if (typeof error === "string") {
    if (
      error.includes("SELECT") ||
      error.includes("SyntaxError") ||
      error.includes("TypeError") ||
      error.includes("Postgres") ||
      error.includes("Mongo")
    ) {
      return `Unable to load ${fallbackSection.toLowerCase()}. Please try again.`;
    }
    return error;
  }

  const status = error?.status || error?.response?.status;
  const code = error?.code;
  const rawMsg = error?.message || "";

  if (status === 401 || status === 403 || code === "UNAUTHORIZED" || code === "SESSION_EXPIRED") {
    return "Your session has expired. Redirecting to login...";
  }

  if (status === 404) {
    return `The requested ${fallbackSection.toLowerCase()} could not be found.`;
  }

  if (status === 429) {
    return "Too many requests. Please wait a moment and try again.";
  }

  if (
    rawMsg.toLowerCase().includes("failed to fetch") ||
    rawMsg.toLowerCase().includes("networkerror") ||
    rawMsg.toLowerCase().includes("offline")
  ) {
    return "Network connection error. Please check your internet connection and try again.";
  }

  if (
    rawMsg &&
    !rawMsg.includes("SELECT") &&
    !rawMsg.includes("SyntaxError") &&
    !rawMsg.includes("TypeError") &&
    !rawMsg.includes("Postgres") &&
    !rawMsg.includes("Mongo") &&
    !rawMsg.startsWith("HTTP ")
  ) {
    return rawMsg;
  }

  if (status >= 500 || code === "DATABASE_ERROR") {
    return `Unable to load ${fallbackSection.toLowerCase()} at this time. Please try refreshing.`;
  }

  return `Unable to load ${fallbackSection.toLowerCase()}. Please try again.`;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  sectionName?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global React Error Boundary for Admin Portal pages and sections.
 * Catches unhandled JavaScript crashes during render and displays a clean, recoverable UI.
 */
export class AdminErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[AdminErrorBoundary:${this.props.sectionName || "Global"}] Caught crash:`, error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      const section = this.props.sectionName || "Section";
      return (
        <div className="bg-white rounded-2xl border border-amber-200 p-8 shadow-sm text-center max-w-lg mx-auto my-6 space-y-4">
          <div className="w-12 h-12 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto text-amber-600">
            <AlertCircle size={24} />
          </div>
          <div>
            <h3 className="font-serif font-bold text-base text-gray-900">
              {section} Temporarily Unavailable
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Unable to load {section.toLowerCase()}. Please try again.
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer shadow-md inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
            style={{ background: NAVY, color: GOLD }}
          >
            <RefreshCw size={14} /> Retry Loading
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

interface AdminErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  compact?: boolean;
}

/**
 * Friendly Error Display Component with Retry action.
 */
export function AdminErrorState({
  title = "Unable to load data",
  message = "A temporary issue occurred while fetching information. Please try again.",
  onRetry,
  isRetrying = false,
  compact = false,
}: AdminErrorStateProps) {
  const isNetwork = message.toLowerCase().includes("network") || message.toLowerCase().includes("connection");

  if (compact) {
    return (
      <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 text-xs flex items-center justify-between gap-3 text-amber-900">
        <div className="flex items-center gap-2 min-w-0">
          {isNetwork ? <WifiOff size={15} className="text-amber-600 shrink-0" /> : <AlertTriangle size={15} className="text-amber-600 shrink-0" />}
          <span className="truncate">{message}</span>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={isRetrying}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-[11px] shrink-0 inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={12} className={isRetrying ? "animate-spin" : ""} />
            <span>{isRetrying ? "Retrying..." : "Retry"}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center max-w-md mx-auto my-6 space-y-4 shadow-sm">
      <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto text-amber-600 border border-amber-200">
        {isNetwork ? <WifiOff size={22} /> : <AlertTriangle size={22} />}
      </div>
      <div>
        <h3 className="font-serif font-bold text-base text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={isRetrying}
          className="px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer shadow-sm inline-flex items-center gap-2 transition-all disabled:opacity-50"
          style={{ background: NAVY, color: GOLD }}
        >
          <RefreshCw size={14} className={isRetrying ? "animate-spin" : ""} />
          <span>{isRetrying ? "Retrying..." : "Retry"}</span>
        </button>
      )}
    </div>
  );
}

interface AdminEmptyStateProps {
  title?: string;
  message?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ElementType;
}

/**
 * Friendly Empty State Component when data is empty.
 */
export function AdminEmptyState({
  title = "No data available",
  message: rawMessage,
  description,
  actionLabel,
  onAction,
  icon: Icon = Inbox,
}: AdminEmptyStateProps) {
  const message = description || rawMessage || "There are currently no items to display.";
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center max-w-md mx-auto my-6 space-y-4 shadow-sm">
      <div className="w-12 h-12 bg-gray-50 border border-gray-200 rounded-2xl flex items-center justify-center mx-auto text-gray-400">
        <Icon size={22} />
      </div>
      <div>
        <h3 className="font-serif font-bold text-base text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-1">{message}</p>
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer border border-gray-300 hover:bg-gray-50 transition-colors"
          style={{ color: NAVY }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
