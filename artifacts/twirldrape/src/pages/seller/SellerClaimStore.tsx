import React, { useEffect, useState } from "react";
import { useUser } from "@clerk/react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store, Search, CheckCircle2, AlertCircle, Loader2,
  ChevronRight, MapPin, Star, Package, ArrowLeft,
} from "lucide-react";
import { getApiUrl } from "@/lib/api";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const EMERALD = "#1E6B5A";
const GOLD = "#C9A84C";
const IVORY = "#F3F8F5";

interface ClaimableStore {
  id: string;
  name: string;
  location: string;
  rating: number;
  sareesCount: number;
  avatar: string;
  bio: string | null;
  tagline: string | null;
}

export default function SellerClaimStore() {
  const { isSignedIn, isLoaded } = useUser();
  const [, navigate] = useLocation();

  const [stores, setStores] = useState<ClaimableStore[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [storesError, setStoresError] = useState("");
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<ClaimableStore | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      navigate(`${BASE}/seller/login`);
      return;
    }
    fetchStores();
  }, [isLoaded, isSignedIn]);

  async function fetchStores() {
    setLoadingStores(true);
    setStoresError("");
    try {
      const res = await fetch(getApiUrl("/api/seller/claimable-stores"), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load stores");
      const data = await res.json();
      setStores(data.stores ?? []);
    } catch {
      setStoresError("Failed to load claimable stores. Please try again.");
    } finally {
      setLoadingStores(false);
    }
  }

  async function claimStore() {
    if (!selected) return;
    setClaiming(true);
    setClaimError("");
    try {
      const res = await fetch(getApiUrl(`/api/seller/claim/${selected.id}`), {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        setClaimError(json.error || "Failed to claim store.");
        return;
      }
      setClaimed(true);
    } catch {
      setClaimError("Network error. Please try again.");
    } finally {
      setClaiming(false);
    }
  }

  const filtered = stores.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.location.toLowerCase().includes(search.toLowerCase())
  );

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: IVORY }}>
        <Loader2 size={28} className="animate-spin" style={{ color: EMERALD }} />
      </div>
    );
  }

  if (claimed && selected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: IVORY }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl border border-[#C8D8D0] p-10 max-w-md w-full text-center shadow-sm"
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: EMERALD + "1A" }}
          >
            <CheckCircle2 size={32} style={{ color: EMERALD }} />
          </div>
          <h2 className="text-2xl font-serif font-bold mb-2" style={{ color: EMERALD }}>
            Store Claimed!
          </h2>
          <p className="text-gray-500 text-sm mb-2">
            You've successfully claimed <strong>{selected.name}</strong>.
          </p>
          <p className="text-gray-400 text-sm mb-6">
            Your application is now pending admin review. You'll receive a notification once approved — usually within 2–3 business days.
          </p>
          <div className="bg-[#E6F0EA] rounded-xl p-4 text-left text-sm text-gray-600 mb-6 space-y-1.5">
            <p className="font-semibold mb-2" style={{ color: EMERALD }}>What happens next</p>
            <p>✓ Admin reviews your claim</p>
            <p>✓ KYC documents may be requested</p>
            <p>✓ Store activated once approved</p>
            <p>✓ Order alerts start reaching you</p>
          </div>
          <button
            onClick={() => navigate(`${BASE}/seller/dashboard`)}
            className="w-full py-3 rounded-xl text-sm font-bold text-white"
            style={{ background: EMERALD }}
          >
            Go to Seller Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: IVORY }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-[#C8D8D0] p-8 max-w-md w-full shadow-sm"
        >
          <button
            onClick={() => { setSelected(null); setClaimError(""); }}
            className="flex items-center gap-1.5 text-sm mb-6 hover:underline"
            style={{ color: EMERALD }}
          >
            <ArrowLeft size={14} /> Back to list
          </button>

          <h2 className="text-xl font-serif font-bold mb-1" style={{ color: EMERALD }}>
            Claim this store?
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            You're about to link your account to <strong>{selected.name}</strong>. This will allow you to receive order alerts and manage this store.
          </p>

          <div
            className="rounded-xl border p-5 mb-6 flex items-start gap-4"
            style={{ borderColor: "#C8D8D0", background: IVORY }}
          >
            <img
              src={selected.avatar || "/images/artisan-1.png"}
              alt={selected.name}
              className="w-14 h-14 rounded-full object-cover shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).src = "/images/artisan-1.png"; }}
            />
            <div className="min-w-0">
              <p className="font-semibold text-gray-800 truncate">{selected.name}</p>
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                <MapPin size={12} /> {selected.location}
              </p>
              {selected.tagline && (
                <p className="text-xs text-gray-400 mt-1 truncate">{selected.tagline}</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Star size={11} className="text-yellow-500" /> {selected.rating.toFixed(1)}
                </span>
                <span className="flex items-center gap-1">
                  <Package size={11} /> {selected.sareesCount} sarees
                </span>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 mb-6">
            <strong>Note:</strong> Claiming a store submits it for admin review. You won't be able to manage products until approved.
          </div>

          {claimError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-red-600">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{claimError}</span>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { setSelected(null); setClaimError(""); }}
              className="flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors hover:bg-[#E6F0EA]"
              style={{ borderColor: "#C8D8D0", color: EMERALD }}
            >
              Cancel
            </button>
            <button
              onClick={claimStore}
              disabled={claiming}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
              style={{ background: EMERALD }}
            >
              {claiming && <Loader2 size={14} className="animate-spin" />}
              {claiming ? "Claiming…" : "Confirm Claim"}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: IVORY }}>
      <div className="flex-1 flex flex-col items-center justify-start py-10 px-4">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-8"
        >
          <img
            src={`${BASE}/images/logo.png`}
            alt="TwirlDrape"
            className="h-10 w-auto object-contain"
          />
          <span
            className="text-xs font-bold uppercase tracking-[0.25em]"
            style={{ color: GOLD }}
          >
            Claim Your Store
          </span>
        </motion.div>

        <div className="w-full max-w-2xl">
          <div className="bg-white rounded-2xl border border-[#C8D8D0] p-7 shadow-sm mb-4">
            <h2 className="text-xl font-serif font-bold mb-1" style={{ color: EMERALD }}>
              Find & claim your store
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              If your store is already listed on TwirlDrape but isn't linked to your account, you can claim it here. Search by name or location.
            </p>

            <div className="relative mb-5">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by store name or city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border px-4 py-2.5 pl-10 text-sm outline-none bg-white"
                style={{ borderColor: "#C8D8D0" }}
              />
            </div>

            {loadingStores ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin" style={{ color: EMERALD }} />
              </div>
            ) : storesError ? (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-red-600">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{storesError}</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <Store size={36} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm text-gray-500 font-medium">
                  {search ? `No unclaimed stores matching "${search}"` : "No unclaimed stores available"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  All stores are already claimed, or you may need to register a new one.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {filtered.map((store, i) => (
                    <motion.button
                      key={store.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => setSelected(store)}
                      className="w-full flex items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-all hover:border-[#1E6B5A] hover:bg-[#E6F0EA] group"
                      style={{ borderColor: "#C8D8D0" }}
                    >
                      <img
                        src={store.avatar || "/images/artisan-1.png"}
                        alt={store.name}
                        className="w-12 h-12 rounded-full object-cover shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).src = "/images/artisan-1.png"; }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 truncate">{store.name}</p>
                        <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                          <MapPin size={11} /> {store.location}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <Star size={10} className="text-yellow-500" /> {store.rating.toFixed(1)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Package size={10} /> {store.sareesCount} sarees
                          </span>
                        </div>
                      </div>
                      <ChevronRight
                        size={18}
                        className="shrink-0 text-gray-300 group-hover:text-[#1E6B5A] transition-colors"
                      />
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          <p className="text-center text-sm text-gray-400">
            New seller?{" "}
            <a href={`${BASE}/seller/register`} className="font-semibold hover:underline" style={{ color: EMERALD }}>
              Register a new store →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
