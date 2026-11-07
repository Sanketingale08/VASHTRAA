import React, { useState, useEffect, useCallback } from "react";
import {
  Shield, RefreshCw, Download, Search, Filter,
  CheckCircle2, XCircle, AlertTriangle, Info, Terminal,
  Calendar, ChevronLeft, ChevronRight, Eye, X
} from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import { adminHeaders } from "@/lib/adminApi";
import { useToast } from "@/hooks/use-toast";

export default function AdminLogs() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"audit" | "app">("audit");
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  // Filters
  const [role, setRole] = useState("all");
  const [action, setAction] = useState("all");
  const [result, setResult] = useState("all");
  const [level, setLevel] = useState("all");
  const [search, setSearch] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = activeTab === "audit" ? "/api/admin/logs/audit" : "/api/admin/logs/app";
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        ...(role !== "all" && { role }),
        ...(action !== "all" && { action }),
        ...(result !== "all" && { result }),
        ...(level !== "all" && { level }),
        ...(search.trim() && { search: search.trim() }),
      });

      const res = await fetch(`${endpoint}?${params.toString()}`, {
        headers: adminHeaders(),
      });

      if (!res.ok) {
        throw new Error(`Failed to load logs (HTTP ${res.status})`);
      }

      const data = await res.json();
      setLogs(data.logs || []);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.totalCount || 0);
    } catch (err: any) {
      toast({
        title: "Error fetching logs",
        description: err.message || "Unable to retrieve log records.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, role, action, result, level, search, toast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleExportCSV = () => {
    const params = new URLSearchParams({
      ...(role !== "all" && { role }),
      ...(action !== "all" && { action }),
      ...(result !== "all" && { result }),
    });
    window.open(`/api/admin/logs/export/csv?${params.toString()}`, "_blank");
  };

  return (
    <AdminGuard>
      <AdminLayout>
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-xs">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-50 text-amber-800 rounded-xl">
                  <Shield size={24} />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 tracking-tight">Audit & System Logs</h1>
                  <p className="text-sm text-gray-500">
                    Tamper-proof permanent audit trail and operational diagnostic logs
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => fetchLogs()}
                disabled={loading}
                className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition shadow-2xs disabled:opacity-50"
              >
                <RefreshCw size={15} className={loading ? "animate-spin text-amber-700" : ""} />
                Refresh
              </button>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-700 hover:bg-amber-800 rounded-xl transition shadow-xs"
              >
                <Download size={15} />
                Export CSV
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => { setActiveTab("audit"); setPage(1); }}
              className={`pb-3 px-5 text-sm font-semibold transition-colors border-b-2 ${
                activeTab === "audit"
                  ? "border-amber-700 text-amber-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Business Audit Trail
            </button>
            <button
              onClick={() => { setActiveTab("app"); setPage(1); }}
              className={`pb-3 px-5 text-sm font-semibold transition-colors border-b-2 ${
                activeTab === "app"
                  ? "border-amber-700 text-amber-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Application & Diagnostic Logs
            </button>
          </div>

          {/* Filter Toolbar */}
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-2xs flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[240px] relative">
              <Search size={16} className="absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                placeholder="Search by ID, action, actor, or message..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchLogs()}
                className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50/50 border border-gray-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
              />
            </div>

            {activeTab === "audit" ? (
              <>
                <select
                  value={role}
                  onChange={(e) => { setRole(e.target.value); setPage(1); }}
                  className="px-3 py-2 text-sm bg-gray-50/50 border border-gray-200 rounded-lg text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="seller">Seller</option>
                  <option value="system">System</option>
                  <option value="customer">Customer</option>
                </select>

                <select
                  value={result}
                  onChange={(e) => { setResult(e.target.value); setPage(1); }}
                  className="px-3 py-2 text-sm bg-gray-50/50 border border-gray-200 rounded-lg text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
                >
                  <option value="all">All Results</option>
                  <option value="success">Success</option>
                  <option value="failure">Failure</option>
                </select>
              </>
            ) : (
              <select
                value={level}
                onChange={(e) => { setLevel(e.target.value); setPage(1); }}
                className="px-3 py-2 text-sm bg-gray-50/50 border border-gray-200 rounded-lg text-gray-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
              >
                <option value="all">All Levels</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
                <option value="fatal">Fatal</option>
              </select>
            )}
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50/75 text-gray-600 font-semibold border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4">Timestamp (UTC)</th>
                    <th className="py-3 px-4">{activeTab === "audit" ? "Actor" : "Level"}</th>
                    <th className="py-3 px-4">{activeTab === "audit" ? "Action" : "Message"}</th>
                    <th className="py-3 px-4">{activeTab === "audit" ? "Resource" : "Third Party"}</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-400">
                        {loading ? "Loading logs..." : "No log records found matching the filter criteria."}
                      </td>
                    </tr>
                  ) : (
                    logs.map((log, idx) => (
                      <tr key={log._id || idx} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-gray-500 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          {activeTab === "audit" ? (
                            <div className="flex items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                                log.actor?.role === "admin" ? "bg-purple-50 text-purple-700 border border-purple-200/60" :
                                log.actor?.role === "seller" ? "bg-blue-50 text-blue-700 border border-blue-200/60" :
                                "bg-gray-100 text-gray-700 border border-gray-200"
                              }`}>
                                {log.actor?.role || "system"}
                              </span>
                              <span className="text-xs text-gray-500 truncate max-w-[120px]" title={log.actor?.email || log.actor?.id}>
                                {log.actor?.email || log.actor?.id}
                              </span>
                            </div>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                              log.level === "error" || log.level === "fatal" ? "bg-red-50 text-red-700 border border-red-200" :
                              log.level === "warn" ? "bg-amber-50 text-amber-800 border border-amber-200" :
                              "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            }`}>
                              {log.level}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium text-gray-800 max-w-[280px] truncate" title={activeTab === "audit" ? log.action : log.message}>
                          {activeTab === "audit" ? log.action : log.message}
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-500">
                          {activeTab === "audit" ? (
                            <span>{log.resource?.type}: <strong className="text-gray-700">{log.resource?.id}</strong></span>
                          ) : (
                            log.thirdParty ? `${log.thirdParty.provider} (${log.thirdParty.statusCode})` : "-"
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {log.result === "success" || (log.level && log.level !== "error" && log.level !== "fatal") ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium text-xs">
                              <CheckCircle2 size={14} /> Success
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-600 font-medium text-xs">
                              <XCircle size={14} /> Failed
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800 underline"
                          >
                            <Eye size={13} /> View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>Showing {logs.length} of {totalCount} total entries</span>
              <div className="flex gap-1.5 items-center">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition shadow-2xs"
                >
                  <ChevronLeft size={14} className="inline mr-1" /> Prev
                </button>
                <span className="px-3 py-1.5 font-medium text-gray-700">Page {page} of {totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition shadow-2xs"
                >
                  Next <ChevronRight size={14} className="inline ml-1" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Diagnostic Modal */}
        {selectedLog && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Terminal size={18} className="text-amber-700" />
                  <h3 className="font-bold text-base text-gray-900">Diagnostic Entry Inspector</h3>
                </div>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 font-mono text-xs bg-gray-950 text-emerald-400 p-4 rounded-xl shadow-inner border border-gray-800">
                <pre className="whitespace-pre-wrap">{JSON.stringify(selectedLog, null, 2)}</pre>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
                <button
                  onClick={() => setSelectedLog(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </AdminLayout>
    </AdminGuard>
  );
}

