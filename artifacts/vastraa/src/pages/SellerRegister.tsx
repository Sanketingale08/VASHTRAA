import React, { useState, useEffect, useRef, useCallback } from "react";
import { useUser } from "@clerk/react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store, ChevronRight, ChevronLeft, Check, Eye, EyeOff,
  Upload, Phone, Building2, FileText, Landmark, MapPin, ShieldCheck,
  Loader2, AlertCircle, CheckCircle2, X, Save,
} from "lucide-react";
import { getApiUrl, apiFetch } from "@/lib/api";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { GoogleOtpModal } from "@/components/GoogleOtpModal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const EMERALD = "#0A1F44";
const GOLD = "#C7CCD1";
const IVORY = "#F4F5F7";

const STEPS = [
  { id: 1, label: "Account", icon: Store },
  { id: 2, label: "Business", icon: Building2 },
  { id: 3, label: "KYC", icon: FileText },
  { id: 4, label: "Bank", icon: Landmark },
  { id: 5, label: "Address", icon: MapPin },
  { id: 6, label: "Review", icon: ShieldCheck },
];

interface WizardData {
  email: string;
  password: string;
  mobile: string;
  name: string;
  location: string;
  tagline: string;
  bio: string;
  contactEmail: string;
  gstin: string;
  panNumber: string;
  panCardUrl: string;
  gstCertUrl: string;
  bankHolder: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  shopStreet: string;
  shopCity: string;
  shopState: string;
  shopPincode: string;
  termsAccepted: boolean;
}

const DEFAULT_DATA: WizardData = {
  email: "", password: "", mobile: "",
  name: "", location: "", tagline: "", bio: "", contactEmail: "", gstin: "",
  panNumber: "", panCardUrl: "", gstCertUrl: "",
  bankHolder: "", bankName: "", bankAccount: "", bankIfsc: "",
  shopStreet: "", shopCity: "", shopState: "", shopPincode: "",
  termsAccepted: false,
};

const DRAFT_KEY = "twirldrape_seller_registration_draft_v1";

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface WizardDraft {
  data: Partial<Omit<WizardData, "password">>;
  step: number;
  savedAt: number;
}

function loadDraft(): WizardDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.step !== "number" || typeof parsed.data !== "object") return null;
    const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
    if (Date.now() - savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return parsed as WizardDraft;
  } catch {
    return null;
  }
}

function saveDraft(data: WizardData, step: number) {
  try {
    const { password, ...rest } = data;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ data: rest, step, savedAt: Date.now() }));
  } catch {
    // localStorage unavailable — fail silently
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

async function loadServerDraft(): Promise<{ data: Partial<Omit<WizardData, "password">>; step: number } | null> {
  try {
    const res = await fetch(getApiUrl("/api/seller/registration-draft"), {
      credentials: "include",
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || typeof json.step !== "number" || typeof json.data !== "object") return null;
    return { data: json.data as Partial<Omit<WizardData, "password">>, step: json.step };
  } catch {
    return null;
  }
}

async function saveServerDraft(data: WizardData, step: number): Promise<void> {
  try {
    const { password, ...rest } = data;
    await fetch(getApiUrl("/api/seller/registration-draft"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ data: rest, step }),
    });
  } catch {
    // fail silently — localStorage is the fallback
  }
}

async function clearServerDraft(): Promise<void> {
  try {
    await fetch(getApiUrl("/api/seller/registration-draft"), {
      method: "DELETE",
      credentials: "include",
    });
  } catch {
    // ignore
  }
}

async function uploadKycFile(file: File, docType: "pan" | "gst" = "pan"): Promise<string> {
  // 1. Try R2 Presigned Upload URL
  try {
    const kycRes = await fetch(getApiUrl("/api/seller/upload/kyc-url"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ docType, fileName: file.name, size: file.size, contentType: file.type || "application/pdf" }),
    });
    if (kycRes.ok) {
      const { uploadURL, publicUrl, objectPath } = await kycRes.json();
      if (uploadURL) {
        try {
          const uploadRes = await fetch(uploadURL, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/pdf" },
            body: file,
          });
          if (uploadRes.ok) {
            const finalPath = (publicUrl || objectPath) as string;
            // Confirm asset upload in MongoDB Atlas
            fetch(getApiUrl("/api/seller/upload/confirm-kyc"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ publicUrl: finalPath, docType }),
            }).catch(() => {});
            return finalPath;
          }
        } catch {
          // Direct PUT to presigned URL failed (e.g. CORS/network) — proceed to direct server upload
        }
      }
    }
  } catch {
    // Proceed to server upload fallback
  }

  // 2. Direct server-side upload to /api/seller/upload/kyc (bypasses direct S3 CORS / network blocks)
  try {
    const rawRes = await fetch(getApiUrl("/api/seller/upload/kyc"), {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/pdf",
        "x-doc-type": docType,
        "x-file-name": encodeURIComponent(file.name),
      },
      credentials: "include",
      body: file,
    });
    if (rawRes.ok) {
      const { publicUrl, objectPath } = await rawRes.json();
      return (publicUrl || objectPath) as string;
    }
  } catch {
    // Continue to legacy endpoint fallback
  }

  // 3. Legacy endpoint fallback
  const endpoint = docType === "gst" ? "/api/seller/upload/gst" : "/api/seller/upload/pan";
  const metaRes = await fetch(getApiUrl(endpoint), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/pdf" }),
  });
  if (!metaRes.ok) throw new Error("Failed to upload KYC document");
  const { uploadURL, objectPath, publicUrl } = await metaRes.json();
  if (uploadURL) {
    const uploadRes = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/pdf" },
      body: file,
    });
    if (!uploadRes.ok) throw new Error("KYC file upload failed");
  }
  return (publicUrl || objectPath) as string;
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="w-full mb-8">
      <div className="flex items-center justify-between mb-3">
        {STEPS.map((s) => {
          const done = step > s.id;
          const active = step === s.id;
          const Icon = s.icon;
          return (
            <div key={s.id} className="flex flex-col items-center gap-1 flex-1">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                style={{
                  background: done || active ? EMERALD : "#E5E8EC",
                  color: done || active ? "#fff" : "#9CA3AF",
                  boxShadow: active ? `0 0 0 3px ${GOLD}44` : "none",
                }}
              >
                {done ? <Check size={14} /> : <Icon size={13} />}
              </div>
              <span className="text-[10px] font-medium hidden sm:block"
                style={{ color: active || done ? EMERALD : "#9CA3AF" }}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="w-full bg-[#E5E8EC] rounded-full h-1.5">
        <motion.div className="h-1.5 rounded-full" style={{ background: EMERALD }}
          animate={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }}
          transition={{ duration: 0.4 }} />
      </div>
      <p className="text-xs text-gray-400 mt-1.5 text-right">Step {step} of {STEPS.length}</p>
    </div>
  );
}

function Field({ label, required, error, helper, children }: {
  label: string; required?: boolean; error?: string; helper?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-1.5" style={{ color: EMERALD }}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} />{error}</p>}
      {helper && !error && <p className="text-xs text-gray-400 mt-1">{helper}</p>}
    </div>
  );
}

function Input({ value, onChange, type = "text", placeholder, maxLength }: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string; maxLength?: number;
}) {
  const [show, setShow] = useState(false);
  const isPass = type === "password";
  return (
    <div className="relative">
      <input
        type={isPass ? (show ? "text" : "password") : type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none bg-[#F4F5F7] pr-10 transition-all focus:border-[#0A1F44] focus:ring-1 focus:ring-[#0A1F44]"
        style={{ borderColor: "rgba(199, 204, 209, 0.6)", color: "#0A1F44" }}
      />
      {isPass && (
        <button type="button" onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#0A1F44] transition-colors">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      )}
    </div>
  );
}

function Textarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      rows={3}
      className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none resize-none bg-[#F4F5F7] transition-all focus:border-[#0A1F44] focus:ring-1 focus:ring-[#0A1F44]"
      style={{ borderColor: "rgba(199, 204, 209, 0.6)", color: "#0A1F44" }} />
  );
}

function OTPBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const digits = (value || "").split("").concat(Array(6).fill("")).slice(0, 6);

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
    }
  };

  const handleChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, "");
    if (!clean) {
      const newDigits = [...digits];
      newDigits[index] = "";
      onChange(newDigits.join(""));
      return;
    }

    if (clean.length > 1) {
      const pasted = clean.slice(0, 6);
      onChange(pasted);
      const nextIndex = Math.min(pasted.length, 5);
      inputsRef.current[nextIndex]?.focus();
      return;
    }

    const newDigits = [...digits];
    newDigits[index] = clean[0];
    const finalVal = newDigits.join("").slice(0, 6);
    onChange(finalVal);

    if (index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) {
      onChange(pasted);
      const nextIndex = Math.min(pasted.length, 5);
      inputsRef.current[nextIndex]?.focus();
    }
  };

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 my-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputsRef.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] || ""}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onChange={(e) => handleChange(i, e.target.value)}
          onPaste={handlePaste}
          className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold font-mono rounded-xl border bg-[#F4F5F7] transition-all focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/20 outline-none"
          style={{ borderColor: "#C7CCD1", color: EMERALD }}
        />
      ))}
    </div>
  );
}

function FileUpload({ label, objectPath, onUploaded, accept, helper, docType = "pan", onUploadStart, onUploadEnd }: {
  label: string; objectPath: string; onUploaded: (path: string) => void;
  accept?: string; helper?: string; docType?: "pan" | "gst";
  onUploadStart?: () => void; onUploadEnd?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fname, setFname] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showConfirm) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowConfirm(false);
    }
    function onMouseDown(e: MouseEvent) {
      if (confirmRef.current && !confirmRef.current.contains(e.target as Node)) {
        setShowConfirm(false);
      }
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown);
    confirmRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [showConfirm]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setErr("File must be under 5MB"); return; }
    setBusy(true); setErr("");
    onUploadStart?.();
    try {
      const path = await uploadKycFile(f, docType);
      setFname(f.name);
      onUploaded(path);
    } catch { setErr("Upload failed. Please try again."); }
    finally { setBusy(false); onUploadEnd?.(); if (ref.current) ref.current.value = ""; }
  }

  return (
    <Field label={label} helper={helper} error={err}>
      <div className="relative">
        <div onClick={() => !busy && !showConfirm && ref.current?.click()}
          className="flex items-center gap-3 w-full rounded-xl border-2 border-dashed px-4 py-3.5 cursor-pointer transition-colors hover:bg-[#E5E8EC]"
          style={{ borderColor: objectPath ? EMERALD : "#C7CCD1" }}>
          <input ref={ref} type="file" accept={accept ?? "image/*,.pdf"} onChange={onFile} className="hidden" />
          {busy ? (
            <><Loader2 size={18} className="animate-spin shrink-0" style={{ color: EMERALD }} />
              <span className="text-sm text-gray-500">Uploading…</span></>
          ) : objectPath ? (
            <><CheckCircle2 size={18} className="shrink-0" style={{ color: EMERALD }} />
              <span className="text-sm font-medium truncate flex-1" style={{ color: EMERALD }}>{fname || "File uploaded"}</span>
              <button
                type="button"
                aria-label="Remove file"
                onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }}
                className="text-gray-400 hover:text-red-400 shrink-0 rounded focus:outline-none focus:ring-2 focus:ring-red-300"
              ><X size={14} /></button></>
          ) : (
            <><Upload size={18} className="text-gray-400 shrink-0" />
              <span className="text-sm text-gray-500">Click to upload · JPG, PNG or PDF · max 5MB</span></>
          )}
        </div>
        <AnimatePresence>
          {showConfirm && (
            <motion.div
              ref={confirmRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="Confirm file removal"
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-1.5 z-50 bg-white border border-[#C7CCD1] rounded-xl shadow-lg px-4 py-3 flex flex-col gap-3 min-w-[200px] outline-none"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm font-semibold text-gray-700">Remove this file?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowConfirm(false); onUploaded(""); setFname(""); }}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white transition-colors"
                  style={{ background: "#DC2626" }}
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors hover:bg-[#E5E8EC]"
                  style={{ borderColor: "#C7CCD1", color: EMERALD }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Field>
  );
}

function StepShell({ title, subtitle, onBack, onNext, nextLabel = "Continue", nextDisabled, loading, children }: {
  title: string; subtitle?: string; onBack?: () => void; onNext?: () => void;
  nextLabel?: string; nextDisabled?: boolean; loading?: boolean; children: React.ReactNode;
}) {
  return (
    <motion.div key={title} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.28 }}>
      <h2 className="text-2xl font-serif font-bold mb-1 tracking-wide" style={{ color: EMERALD }}>{title}</h2>
      {subtitle && <p className="text-sm text-gray-500 mb-5">{subtitle}</p>}
      <div className="space-y-4">{children}</div>
      <div className="flex items-center gap-3 mt-6">
        {onBack && (
          <button onClick={onBack}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border text-sm font-semibold transition-all hover:bg-[#E5E8EC]"
            style={{ borderColor: "#C7CCD1", color: EMERALD }}>
            <ChevronLeft size={15} /> Back
          </button>
        )}
        {onNext && (
          <button onClick={onNext} disabled={nextDisabled || loading}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-[#F4F5F7] uppercase tracking-wider transition-all hover:bg-[#2C3E6B] disabled:opacity-50 shadow-sm cursor-pointer"
            style={{ background: EMERALD }}>
            {loading && <Loader2 size={15} className="animate-spin" />}
            {nextLabel} {!loading && <ChevronRight size={15} />}
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default function SellerRegister() {
  const { isSignedIn, isLoaded: userLoaded, user } = useUser();
  const [, navigate] = useLocation();

  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(DEFAULT_DATA);
  const [errs, setErrs] = useState<Partial<Record<keyof WizardData, string>>>({});
  const [apiErr, setApiErr] = useState("");
  const [apiSuccess, setApiSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [already, setAlready] = useState(false);

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const leaveResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const isDirtyRef = useRef(false);

  const [showStartOverModal, setShowStartOverModal] = useState(false);

  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const [uploadCount, setUploadCount] = useState(0);
  const [draftSaved, setDraftSaved] = useState(false);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Google OTP Modal State
  const [otpModalState, setOtpModalState] = useState<{
    isOpen: boolean;
    challengeId: string;
    email: string;
    targetRole: "customer" | "seller";
  }>({
    isOpen: false,
    challengeId: "",
    email: "",
    targetRole: "seller",
  });

  useEffect(() => {
    // Check if returning from top-level OAuth redirect with OTP challenge
    const saved = sessionStorage.getItem("td_google_challenge");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        sessionStorage.removeItem("td_google_challenge");
        if (parsed.challengeId && parsed.email) {
          setOtpModalState({
            isOpen: true,
            challengeId: parsed.challengeId,
            email: parsed.email,
            targetRole: parsed.targetRole || "seller",
          });
        }
      } catch { /* ignore */ }
    }
  }, []);

  const onUploadStart = useCallback(() => setUploadCount((n) => n + 1), []);
  const onUploadEnd = useCallback(() => setUploadCount((n) => Math.max(0, n - 1)), []);

  const set = (k: keyof WizardData) => (v: string | boolean) =>
    setData((d) => ({ ...d, [k]: v }));
  const e = (k: keyof WizardData) => errs[k];

  // Initialize draft data on mount & handle signed-in users
  useEffect(() => {
    const localDraft = loadDraft();
    if (localDraft && localDraft.data) {
      setData((d) => ({ ...d, ...localDraft.data }));
    }

    if (userLoaded && isSignedIn) {
      const email = user?.primaryEmailAddress?.emailAddress ?? "";
      loadServerDraft()
        .then((serverDraft) => {
          const best = serverDraft ?? (localDraft && localDraft.step >= 1 ? localDraft : null);
          if (best && best.step >= 1) {
            setData((d) => ({ ...d, ...best.data, email: best.data.email || d.email || email, contactEmail: best.data.contactEmail || d.contactEmail || email }));
            setStep(best.step);
          } else {
            if (email) setData((d) => ({ ...d, email: d.email || email, contactEmail: d.contactEmail || email }));
          }
        })
        .catch(() => {
          if (email) setData((d) => ({ ...d, email: d.email || email, contactEmail: d.contactEmail || email }));
        });
    }
  }, [userLoaded, isSignedIn, user]);

  useEffect(() => {
    if (step === 0 || done) return;
    saveDraft(data, step);
    if (isSignedIn && step >= 2) {
      saveServerDraft(data, step);
    }
  }, [data, step, done, isSignedIn]);

  useEffect(() => {
    if (step <= 1 || done) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    setDraftSaved(true);
    draftTimerRef.current = setTimeout(() => setDraftSaved(false), 2500);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [step]);

  const isDirty = !done && step >= 1 && (step > 1 || data.email.trim() !== "" || data.password !== "");
  isDirtyRef.current = isDirty;

  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      const msg = uploadCount > 0
        ? "A file upload is in progress. If you leave now, the upload will be lost."
        : "Your registration is not complete. If you leave now, your progress may be lost.";
      e.returnValue = msg;
      return msg;
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, uploadCount]);

  function resolveLeave(ok: boolean) {
    setShowLeaveModal(false);
    leaveResolveRef.current?.(ok);
    leaveResolveRef.current = null;
  }

  function startOver() {
    clearDraft();
    if (isSignedIn) clearServerDraft();
    setErrs({}); setApiErr(""); setAlready(false);
    setEmailOtpSent(false); setEmailCode("");
    setData(DEFAULT_DATA);
    setStep(1);
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: IVORY }}>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl border border-[#C7CCD1] p-10 max-w-md w-full text-center shadow-sm">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: EMERALD + "1A" }}>
            <CheckCircle2 size={32} style={{ color: EMERALD }} />
          </div>
          <h2 className="text-2xl font-serif font-bold mb-2" style={{ color: EMERALD }}>Application Submitted!</h2>
          <p className="text-gray-500 text-sm mb-6">
            Your seller application is under review. Our team will verify your KYC and bank details
            within 2–3 business days. You'll be notified by email once approved.
          </p>
          <div className="bg-[#E5E8EC] rounded-xl p-4 text-left text-sm text-gray-600 mb-6 space-y-1.5">
            <p className="font-semibold mb-2" style={{ color: EMERALD }}>What happens next</p>
            <p>✓ KYC document verification (PAN)</p>
            <p>✓ Bank account validation</p>
            <p>✓ Shop profile activation</p>
            <p>✓ Email notification upon approval</p>
          </div>
          <button onClick={() => navigate(`${BASE}/seller/login`)}
            className="w-full py-3 rounded-xl text-sm font-bold text-white"
            style={{ background: EMERALD }}>
            Go to Seller Login
          </button>
        </motion.div>
      </div>
    );
  }

  if (already) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: IVORY }}>
        <div className="bg-white rounded-2xl border border-[#C7CCD1] p-10 max-w-md w-full text-center shadow-sm">
          <Store size={32} className="mx-auto mb-4" style={{ color: EMERALD }} />
          <h2 className="text-xl font-serif font-bold mb-2" style={{ color: EMERALD }}>Already Registered</h2>
          <p className="text-sm text-gray-500 mb-6">
            A seller account with this email address already exists. Please sign in to access your dashboard, or use a different email address to register a new shop.
          </p>
          <div className="space-y-3">
            <button onClick={() => navigate(`${BASE}/seller/login`)}
              className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
              style={{ background: EMERALD }}>
              Go to Seller Login
            </button>
            <button onClick={() => startOver()}
              className="w-full py-3 rounded-xl text-sm font-bold border transition-all hover:bg-gray-50"
              style={{ borderColor: "#C7CCD1", color: EMERALD }}>
              Register with a Different Email
            </button>
          </div>
        </div>
      </div>
    );
  }

  async function step1Create() {
    if (loading) return;
    const e2: typeof errs = {};
    if (!data.email.trim() || !/\S+@\S+\.\S+/.test(data.email)) e2.email = "Please enter a valid email address.";
    if (!data.password || data.password.length < 8) e2.password = "Min. 8 characters";
    setErrs(e2);
    if (Object.keys(e2).length) return;
    setLoading(true); setApiErr(""); setApiSuccess("");
    try {
      const res = await apiFetch("/api/seller/send-verification-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApiErr(json.error || json.message || "Unable to send the verification code. Please try again.");
        const match = (json.error || json.message || "").match(/(\d+)\s*second/i);
        if (match) setResendCooldown(parseInt(match[1], 10));
        return;
      }
      setEmailOtpSent(true);
      setResendCooldown(30);
      setApiSuccess(json.message || `Verification code sent successfully to ${data.email.trim()}. Please check your inbox and spam folder.`);
    } catch (err: any) {
      setApiErr("Unable to send the verification code. Please try again.");
    } finally { setLoading(false); }
  }

  async function resendVerificationCode() {
    if (loading || resendCooldown > 0) return;
    setLoading(true); setApiErr(""); setApiSuccess("");
    try {
      const res = await apiFetch("/api/seller/resend-verification-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApiErr(json.error || json.message || "Unable to resend the verification code. Please try again.");
        const match = (json.error || json.message || "").match(/(\d+)\s*second/i);
        if (match) setResendCooldown(parseInt(match[1], 10));
        return;
      }
      setResendCooldown(30);
      setApiSuccess(json.message || `New verification code sent successfully to ${data.email.trim()}. Please check your inbox.`);
    } catch (err: any) {
      setApiErr("Unable to resend the verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function step1Verify() {
    if (loading) return;
    if (!emailCode.trim() || emailCode.trim().length < 6) { setApiErr("Invalid verification code. Please check the code and try again."); return; }
    setLoading(true); setApiErr(""); setApiSuccess("");
    try {
      const res = await apiFetch("/api/seller/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email.trim(), code: emailCode.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApiErr(json.error || json.message || "Invalid verification code. Please check the code and try again.");
        return;
      }
      try {
        localStorage.setItem("vastraa_seller_email", data.email.trim());
      } catch {}
      setApiSuccess(json.message || "Email verified successfully! You can now continue your seller registration.");
      setTimeout(() => {
        setStep(2);
        setApiSuccess("");
      }, 800);
    } catch (err: any) {
      setApiErr("Unable to verify code. Please try again.");
    } finally { setLoading(false); }
  }

  function v2(): boolean {
    const e2: typeof errs = {};
    if (!data.name.trim()) e2.name = "Shop name is required";
    if (!data.location.trim()) e2.location = "City / location is required";
    if (!data.mobile.trim() || data.mobile.trim().length < 10) e2.mobile = "Enter a valid 10-digit mobile number";
    if (data.contactEmail && !/\S+@\S+\.\S+/.test(data.contactEmail)) e2.contactEmail = "Enter a valid email";
    if (data.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(data.gstin.toUpperCase()))
      e2.gstin = "Enter a valid 15-character GSTIN";
    setErrs(e2); return !Object.keys(e2).length;
  }

  function v3(): boolean {
    const e2: typeof errs = {};
    if (!data.panNumber.trim()) e2.panNumber = "PAN number is required";
    else if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(data.panNumber.toUpperCase())) e2.panNumber = "Enter a valid 10-character PAN";
    if (!data.panCardUrl) e2.panCardUrl = "Please upload your PAN card";
    setErrs(e2); return !Object.keys(e2).length;
  }

  function v4(): boolean {
    const e2: typeof errs = {};
    if (!data.bankHolder.trim()) e2.bankHolder = "Account holder name is required";
    if (!data.bankName.trim()) e2.bankName = "Bank name is required";
    if (!data.bankAccount.trim()) e2.bankAccount = "Account number is required";
    if (!data.bankIfsc.trim()) e2.bankIfsc = "IFSC code is required";
    else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data.bankIfsc.toUpperCase())) e2.bankIfsc = "Enter a valid 11-character IFSC";
    setErrs(e2); return !Object.keys(e2).length;
  }

  function v5(): boolean {
    const e2: typeof errs = {};
    if (!data.shopCity.trim()) e2.shopCity = "City is required";
    if (!data.shopState.trim()) e2.shopState = "State is required";
    if (!data.shopPincode.trim() || !/^[1-9][0-9]{5}$/.test(data.shopPincode)) e2.shopPincode = "Enter a valid 6-digit pincode";
    setErrs(e2); return !Object.keys(e2).length;
  }

  async function submit() {
    if (!data.termsAccepted) { setApiErr("Please accept the terms and conditions to proceed."); return; }
    setLoading(true); setApiErr("");
    try {
      const res = await apiFetch("/api/seller/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email, password: data.password,
          name: data.name, shopName: data.name, location: data.location, bio: data.bio, gstin: data.gstin,
          contactEmail: data.contactEmail || data.email, tagline: data.tagline, mobile: data.mobile,
          panNumber: data.panNumber.toUpperCase(), panCardUrl: data.panCardUrl,
          gstCertUrl: data.gstCertUrl || undefined,
          bankHolder: data.bankHolder, bankName: data.bankName,
          bankAccount: data.bankAccount, bankIfsc: data.bankIfsc.toUpperCase(),
          shopStreet: data.shopStreet, shopCity: data.shopCity,
          shopState: data.shopState, shopPincode: data.shopPincode,
          termsAccepted: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { if (res.status === 409) { setAlready(true); return; } setApiErr(json.error || json.message || "Submission failed."); return; }
      clearDraft();
      clearServerDraft();
      try { localStorage.removeItem("vastraa_seller_email"); } catch {}
      setDone(true);
    } catch (err: any) { setApiErr(err?.message ? `Submission error: ${err.message}` : "Network error. Please check your connection."); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: IVORY }}>
      <div className="flex-1 flex flex-col items-center justify-start py-10 px-4">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-8">
          <img src={`${BASE}/logo.svg`} alt="VASTRAA" className="h-12 w-auto object-contain" />
          <span className="text-xs font-bold uppercase tracking-[0.25em]" style={{ color: GOLD }}>Seller Registration</span>
        </motion.div>

        <div className="w-full max-w-lg bg-white rounded-2xl border p-7 sm:p-8 shadow-md transition-all" style={{ borderColor: "rgba(199, 204, 209, 0.4)" }}>
          <ProgressBar step={step} />
          <AnimatePresence>
            {draftSaved && (
              <motion.div
                key="draft-saved"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-1.5 text-xs font-medium mb-3 -mt-2"
                style={{ color: EMERALD }}
              >
                <Save size={11} />
                Draft saved
              </motion.div>
            )}
          </AnimatePresence>

          {step > (isSignedIn ? 2 : 1) && (
            <div className="flex justify-end -mt-4 mb-4">
              <button type="button" onClick={() => setShowStartOverModal(true)}
                className="text-xs text-gray-400 underline hover:text-red-400">
                Start over
              </button>
            </div>
          )}

          {apiErr && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-red-600">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{apiErr}</span>
            </div>
          )}

          {apiSuccess && (
            <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-emerald-700">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
              <span>{apiSuccess}</span>
            </div>
          )}

          <AnimatePresence mode="wait">
            {step === 1 && (
              <StepShell key="s1" title="Create Your Account"
                subtitle="Set up your VASTRAA seller account with email and password."
                onNext={emailOtpSent ? step1Verify : step1Create}
                nextLabel={emailOtpSent ? "Verify Email" : "Send Verification Code"}
                loading={loading}>
                {!emailOtpSent ? (
                  <>
                    <Field label="Email Address" required error={e("email")}>
                      <Input value={data.email} onChange={set("email")} type="email" placeholder="you@example.com" />
                    </Field>
                    <Field label="Password" required error={e("password")}>
                      <Input value={data.password} onChange={set("password")} type="password" placeholder="Min. 8 characters" />
                    </Field>
                    
                    <div className="relative my-4 text-center">
                      <div className="absolute inset-0 flex items-center" aria-hidden="true">
                        <div className="w-full border-t border-[#C7CCD1]/60" />
                      </div>
                      <div className="relative inline-block bg-white px-3 text-xs font-bold uppercase tracking-wider text-gray-400">
                        OR
                      </div>
                    </div>

                    <GoogleAuthButton
                      targetRole="seller"
                      mode="signup"
                      onSuccess={(res) => {
                        if (res?.user?.email) {
                          set("email")(res.user.email);
                          set("contactEmail")(res.user.email);
                          if (res.user.name) {
                            set("name")(res.user.name);
                          }
                        }
                        if (res?.token) {
                          localStorage.setItem("vastraa_auth_token", res.token);
                          if (res?.user?.role === "seller" && res?.redirectUrl === "/seller/dashboard") {
                            localStorage.setItem("vastraa_seller_authenticated", "true");
                            localStorage.setItem("vastraa_seller_email", res.user?.email || "");
                          } else {
                            localStorage.removeItem("vastraa_seller_authenticated");
                            localStorage.removeItem("vastraa_seller_email");
                          }
                        }
                        if (res?.redirectUrl === "/seller/dashboard") {
                          navigate("/seller/dashboard");
                        } else {
                          setStep(2);
                        }
                      }}
                      onSuccessChallenge={(res) => {
                        setOtpModalState({
                          isOpen: true,
                          challengeId: res.challengeId,
                          email: res.email,
                          targetRole: res.targetRole,
                        });
                      }}
                      onError={(err) => setApiErr(err)}
                    />

                    <p className="text-xs text-gray-400 mt-2">
                      Already have an account?{" "}
                      <Link
                        href="/seller/login"
                        className="underline font-semibold"
                        style={{ color: EMERALD }}
                      >
                        Sign in here
                      </Link>
                    </p>
                  </>
                ) : (
                  <>
                    <div className="bg-[#E5E8EC] rounded-xl p-4 text-sm text-center" style={{ color: EMERALD }}>
                      A 6-digit verification code was sent to <strong>{data.email}</strong>
                    </div>

                    <OTPBox value={emailCode} onChange={setEmailCode} />

                    <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                      <button type="button" onClick={() => { setEmailOtpSent(false); setApiErr(""); setApiSuccess(""); setEmailCode(""); }}
                        className="underline hover:text-gray-700">
                        ← Change email
                      </button>
                      <button type="button" onClick={() => { resendVerificationCode(); }}
                        className="underline hover:text-gray-700 font-medium disabled:opacity-50 disabled:no-underline"
                        disabled={loading || resendCooldown > 0}>
                        {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend verification code"}
                      </button>
                    </div>
                  </>
                )}
              </StepShell>
            )}

            {step === 2 && (
              <StepShell key="s2" title="Business Profile"
                subtitle="Tell us about your shop, craft, and contact details."
                onBack={!isSignedIn ? () => { setErrs({}); setStep(1); } : undefined}
                onNext={() => { setApiErr(""); if (v2()) setStep(3); }}>
                <Field label="Shop Name" required error={e("name")}>
                  <Input value={data.name} onChange={set("name")} placeholder="e.g. Silk Heritage Emporium" />
                </Field>
                <Field label="City / Location" required error={e("location")}>
                  <Input value={data.location} onChange={set("location")} placeholder="e.g. Varanasi, Uttar Pradesh" />
                </Field>
                <Field label="Mobile Number" required error={e("mobile")} helper="10-digit Indian mobile number for order updates">
                  <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: "#C7CCD1" }}>
                    <span className="bg-[#E5E8EC] px-4 py-2.5 text-sm font-semibold border-r text-gray-600"
                      style={{ borderColor: "#C7CCD1" }}>+91</span>
                    <input type="tel" maxLength={10} value={data.mobile}
                      onChange={(e2) => set("mobile")(e2.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="9876543210"
                      className="flex-1 px-4 py-2.5 text-sm outline-none bg-white" />
                  </div>
                </Field>
                <Field label="Shop Tagline" helper="A short catchy line for your shop page">
                  <Input value={data.tagline} onChange={set("tagline")} placeholder="e.g. Authentic handwoven silks since 1982" />
                </Field>
                <Field label="About Your Shop">
                  <Textarea value={data.bio} onChange={set("bio")} placeholder="Describe your craft, heritage, specialities…" />
                </Field>
                <Field label="Contact Email" error={e("contactEmail")}>
                  <Input value={data.contactEmail} onChange={set("contactEmail")} type="email" placeholder="shop@email.com" />
                </Field>
                <Field label="GSTIN" error={e("gstin")} helper="15-character GST Identification Number (optional)">
                  <Input value={data.gstin} onChange={(v) => set("gstin")(v.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} />
                </Field>
              </StepShell>
            )}

            {step === 3 && (
              <StepShell key="s3" title="KYC Documents"
                subtitle="Required for identity verification as per RBI guidelines."
                onBack={() => { setErrs({}); setStep(2); }}
                onNext={() => { setApiErr(""); if (v3()) setStep(4); }}>
                <Field label="PAN Number" required error={e("panNumber")} helper="10-character Permanent Account Number">
                  <Input value={data.panNumber} onChange={(v) => set("panNumber")(v.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} />
                </Field>
                <FileUpload label="PAN Card Photo / Scan *" objectPath={data.panCardUrl} onUploaded={set("panCardUrl")}
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  helper="Clear photo or scan of front side of PAN card"
                  onUploadStart={onUploadStart} onUploadEnd={onUploadEnd} />
                {e("panCardUrl") && (
                  <p className="text-xs text-red-500 -mt-2 flex items-center gap-1">
                    <AlertCircle size={11} />{e("panCardUrl")}
                  </p>
                )}
                <FileUpload label="GST Certificate (Optional)" objectPath={data.gstCertUrl} onUploaded={set("gstCertUrl")}
                  accept="image/jpeg,image/png,application/pdf"
                  helper="Upload your GST registration certificate if applicable"
                  docType="gst"
                  onUploadStart={onUploadStart} onUploadEnd={onUploadEnd} />
              </StepShell>
            )}

            {step === 4 && (
              <StepShell key="s4" title="Bank Account Details"
                subtitle="Your earnings will be transferred to this account weekly."
                onBack={() => { setErrs({}); setStep(3); }}
                onNext={() => { setApiErr(""); if (v4()) setStep(5); }}>
                <Field label="Account Holder Name" required error={e("bankHolder")}>
                  <Input value={data.bankHolder} onChange={set("bankHolder")} placeholder="As per bank records" />
                </Field>
                <Field label="Bank Name" required error={e("bankName")}>
                  <Input value={data.bankName} onChange={set("bankName")} placeholder="e.g. State Bank of India" />
                </Field>
                <Field label="Account Number" required error={e("bankAccount")}>
                  <Input value={data.bankAccount} onChange={set("bankAccount")} placeholder="Enter account number" />
                </Field>
                <Field label="IFSC Code" required error={e("bankIfsc")} helper="11-character code on your cheque book">
                  <Input value={data.bankIfsc} onChange={(v) => set("bankIfsc")(v.toUpperCase())} placeholder="SBIN0001234" maxLength={11} />
                </Field>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  🔒 Your bank details are encrypted and used only for payout purposes.
                </div>
              </StepShell>
            )}

            {step === 5 && (
              <StepShell key="s5" title="Shop Address"
                subtitle="Your registered business or pickup address."
                onBack={() => { setErrs({}); setStep(4); }}
                onNext={() => { setApiErr(""); if (v5()) setStep(6); }}>
                <Field label="Street / Area">
                  <Input value={data.shopStreet} onChange={set("shopStreet")} placeholder="Building, street, locality" />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="City" required error={e("shopCity")}>
                    <Input value={data.shopCity} onChange={set("shopCity")} placeholder="e.g. Surat" />
                  </Field>
                  <Field label="State" required error={e("shopState")}>
                    <Input value={data.shopState} onChange={set("shopState")} placeholder="e.g. Gujarat" />
                  </Field>
                </div>
                <Field label="Pincode" required error={e("shopPincode")}>
                  <Input value={data.shopPincode} onChange={(v) => set("shopPincode")(v.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit pincode" maxLength={6} />
                </Field>
              </StepShell>
            )}

            {step === 6 && (
              <StepShell key="s6" title="Review & Submit"
                subtitle="Confirm your details and accept our terms."
                onBack={() => { setErrs({}); setStep(5); }}
                onNext={submit}
                nextLabel="Submit Application"
                loading={loading}
                nextDisabled={!data.termsAccepted}>
                <div className="space-y-2.5">
                  {[
                    { icon: Building2, label: "Shop", value: data.name || "—", sub: data.location },
                    { icon: Phone, label: "Mobile", value: data.mobile ? `+91 ${data.mobile}` : "—" },
                    { icon: FileText, label: "PAN", value: data.panNumber.toUpperCase() || "—" },
                    { icon: Landmark, label: "Bank", value: data.bankName || "—", sub: data.bankAccount ? `A/C ••••${data.bankAccount.slice(-4)}` : "" },
                    { icon: MapPin, label: "Address", value: [data.shopCity, data.shopState].filter(Boolean).join(", ") || "—", sub: data.shopPincode || "" },
                  ].map(({ icon: Icon, label, value, sub }) => (
                    <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-[#F4F5F7] border border-[#C7CCD1]">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: EMERALD + "1A" }}>
                        <Icon size={15} style={{ color: EMERALD }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400">{label}</p>
                        <p className="text-sm font-semibold truncate">{value}</p>
                        {sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border border-[#C7CCD1] rounded-xl p-4 max-h-32 overflow-y-auto text-xs text-gray-500 leading-relaxed">
                  <p className="font-semibold text-gray-700 mb-2">Terms & Conditions</p>
                  By registering as a seller on VASTRAA, you agree to: (a) provide accurate and truthful information;
                  (b) comply with all applicable Indian laws including GST regulations; (c) maintain product quality
                  standards; (d) not sell counterfeit, prohibited, or restricted goods; (e) accept our commission
                  structure and payout terms (10% commission on each sale); (f) allow VASTRAA to use your shop name
                  and product images for marketing. VASTRAA reserves the right to suspend or terminate accounts for
                  policy violations. Disputes shall be subject to the jurisdiction of courts in Mumbai, Maharashtra.
                </div>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input type="checkbox" checked={data.termsAccepted}
                    onChange={(ev) => set("termsAccepted")(ev.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded accent-emerald-700" />
                  <span className="text-sm text-gray-600">
                    I have read and agree to the{" "}
                    <span className="font-semibold" style={{ color: EMERALD }}>Terms & Conditions</span>{" "}
                    and{" "}
                    <span className="font-semibold" style={{ color: EMERALD }}>Privacy Policy</span>.
                  </span>
                </label>
              </StepShell>
            )}
          </AnimatePresence>
        </div>

        <p className="text-xs text-gray-400 mt-6">
          Need help?{" "}
          <a href="mailto:sellers@vastraa.com" className="underline">sellers@vastraa.com</a>
        </p>
      </div>

      {showStartOverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl border border-[#C7CCD1] p-6 max-w-sm w-full shadow-xl"
          >
            <h3 className="text-base font-bold mb-2" style={{ color: EMERALD }}>
              Start over?
            </h3>
            <p className="text-sm text-gray-500 mb-5">
              This will erase all your progress — your KYC details, bank info, and business profile will be lost. Are you sure?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowStartOverModal(false)}
                className="flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors hover:bg-[#E5E8EC]"
                style={{ borderColor: "#C7CCD1", color: EMERALD }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowStartOverModal(false); startOver(); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: "#DC2626" }}
              >
                Start over
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl border border-[#C7CCD1] p-6 max-w-sm w-full shadow-xl"
          >
            <h3 className="text-base font-bold mb-2" style={{ color: EMERALD }}>
              Leave registration?
            </h3>
            <p className="text-sm text-gray-500 mb-5">
              You have unsaved progress. Your draft has been saved and you can continue later, but
              your registration won't be complete until all steps are finished.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => resolveLeave(false)}
                className="flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors hover:bg-[#E5E8EC]"
                style={{ borderColor: "#C7CCD1", color: EMERALD }}
              >
                Stay
              </button>
              <button
                onClick={() => resolveLeave(true)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: EMERALD }}
              >
                Leave anyway
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Google OTP Verification Modal */}
      <GoogleOtpModal
        isOpen={otpModalState.isOpen}
        challengeId={otpModalState.challengeId}
        email={otpModalState.email}
        targetRole={otpModalState.targetRole}
        onClose={() => setOtpModalState((prev) => ({ ...prev, isOpen: false }))}
        onVerified={(res) => {
          setOtpModalState((prev) => ({ ...prev, isOpen: false }));
          if (res?.user?.email) {
            set("email")(res.user.email);
            set("contactEmail")(res.user.email);
            if (res.user.name) {
              set("name")(res.user.name);
            }
          }
          if (res?.token) {
            localStorage.setItem("vastraa_auth_token", res.token);
            if (res?.user?.role === "seller" && res?.redirectUrl === "/seller/dashboard") {
              localStorage.setItem("vastraa_seller_authenticated", "true");
              localStorage.setItem("vastraa_seller_email", res.user?.email || "");
            } else {
              localStorage.removeItem("vastraa_seller_authenticated");
              localStorage.removeItem("vastraa_seller_email");
            }
          }
          if (res?.redirectUrl === "/seller/dashboard") {
            navigate("/seller/dashboard");
          } else {
            setStep(2);
          }
        }}
      />
    </div>
  );
}
