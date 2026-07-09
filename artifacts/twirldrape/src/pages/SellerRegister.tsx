import React, { useState, useEffect, useRef } from "react";
import { useUser, useSignUp } from "@clerk/react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store, ChevronRight, ChevronLeft, Check, Eye, EyeOff,
  Upload, Phone, Building2, FileText, Landmark, MapPin, ShieldCheck,
  Loader2, AlertCircle, CheckCircle2, X,
} from "lucide-react";
import { getApiUrl } from "@/lib/api";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const EMERALD = "#1E6B5A";
const GOLD = "#C9A84C";
const IVORY = "#F3F8F5";

const STEPS = [
  { id: 1, label: "Account", icon: Store },
  { id: 2, label: "Mobile", icon: Phone },
  { id: 3, label: "Business", icon: Building2 },
  { id: 4, label: "KYC", icon: FileText },
  { id: 5, label: "Bank", icon: Landmark },
  { id: 6, label: "Address", icon: MapPin },
  { id: 7, label: "Review", icon: ShieldCheck },
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
  panNumber: "", panCardUrl: "",
  bankHolder: "", bankName: "", bankAccount: "", bankIfsc: "",
  shopStreet: "", shopCity: "", shopState: "", shopPincode: "",
  termsAccepted: false,
};

async function uploadKycFile(file: File): Promise<string> {
  const metaRes = await fetch(getApiUrl("/api/storage/uploads/request-url"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!metaRes.ok) throw new Error("Failed to get upload URL");
  const { uploadURL, objectPath } = await metaRes.json();
  const uploadRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!uploadRes.ok) throw new Error("Upload failed");
  return objectPath as string;
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
                  background: done || active ? EMERALD : "#E6F0EA",
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
      <div className="w-full bg-[#E6F0EA] rounded-full h-1.5">
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
        className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none bg-white pr-10 transition-colors"
        style={{ borderColor: "#C8D8D0", color: "#1a1a1a" }}
      />
      {isPass && (
        <button type="button" onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
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
      className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none resize-none bg-white"
      style={{ borderColor: "#C8D8D0" }} />
  );
}

function OTPBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input type="text" inputMode="numeric" maxLength={6} value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      placeholder="• • • • • •"
      className="w-full text-center text-2xl font-mono tracking-[0.5em] rounded-xl border px-4 py-3 outline-none bg-white"
      style={{ borderColor: "#C8D8D0", color: EMERALD }} />
  );
}

function FileUpload({ label, objectPath, onUploaded, accept, helper }: {
  label: string; objectPath: string; onUploaded: (path: string) => void; accept?: string; helper?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fname, setFname] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setErr("File must be under 5MB"); return; }
    setBusy(true); setErr("");
    try {
      const path = await uploadKycFile(f);
      setFname(f.name);
      onUploaded(path);
    } catch { setErr("Upload failed. Please try again."); }
    finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  }

  return (
    <Field label={label} helper={helper} error={err}>
      <div onClick={() => !busy && ref.current?.click()}
        className="flex items-center gap-3 w-full rounded-xl border-2 border-dashed px-4 py-3.5 cursor-pointer transition-colors hover:bg-[#E6F0EA]"
        style={{ borderColor: objectPath ? EMERALD : "#C8D8D0" }}>
        <input ref={ref} type="file" accept={accept ?? "image/*,.pdf"} onChange={onFile} className="hidden" />
        {busy ? (
          <><Loader2 size={18} className="animate-spin shrink-0" style={{ color: EMERALD }} />
            <span className="text-sm text-gray-500">Uploading…</span></>
        ) : objectPath ? (
          <><CheckCircle2 size={18} className="shrink-0" style={{ color: EMERALD }} />
            <span className="text-sm font-medium truncate flex-1" style={{ color: EMERALD }}>{fname || "File uploaded"}</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); onUploaded(""); setFname(""); }}
              className="text-gray-400 hover:text-red-400 shrink-0"><X size={14} /></button></>
        ) : (
          <><Upload size={18} className="text-gray-400 shrink-0" />
            <span className="text-sm text-gray-500">Click to upload · JPG, PNG or PDF · max 5MB</span></>
        )}
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
      <h2 className="text-xl font-serif font-bold mb-1" style={{ color: EMERALD }}>{title}</h2>
      {subtitle && <p className="text-sm text-gray-500 mb-5">{subtitle}</p>}
      <div className="space-y-4">{children}</div>
      <div className="flex items-center gap-3 mt-6">
        {onBack && (
          <button onClick={onBack}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border text-sm font-semibold transition-colors hover:bg-[#E6F0EA]"
            style={{ borderColor: "#C8D8D0", color: EMERALD }}>
            <ChevronLeft size={15} /> Back
          </button>
        )}
        {onNext && (
          <button onClick={onNext} disabled={nextDisabled || loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
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
  const { isLoaded: signUpLoaded, signUp, setActive } = useSignUp();
  const [, navigate] = useLocation();

  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(DEFAULT_DATA);
  const [errs, setErrs] = useState<Partial<Record<keyof WizardData, string>>>({});
  const [apiErr, setApiErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [already, setAlready] = useState(false);

  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [phoneObj, setPhoneObj] = useState<any>(null);
  const [phoneSent, setPhoneSent] = useState(false);
  const [phoneCode, setPhoneCode] = useState("");

  const set = (k: keyof WizardData) => (v: string | boolean) =>
    setData((d) => ({ ...d, [k]: v }));
  const e = (k: keyof WizardData) => errs[k];

  useEffect(() => {
    if (!userLoaded || !signUpLoaded || step !== 0) return;
    if (isSignedIn) {
      setStep(2);
      const email = user?.primaryEmailAddress?.emailAddress ?? "";
      if (email) setData((d) => ({ ...d, contactEmail: email }));
    } else {
      setStep(1);
    }
  }, [isSignedIn, userLoaded, signUpLoaded]);

  if (!userLoaded || !signUpLoaded || step === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: IVORY }}>
        <Loader2 size={28} className="animate-spin" style={{ color: EMERALD }} />
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: IVORY }}>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl border border-[#C8D8D0] p-10 max-w-md w-full text-center shadow-sm">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: EMERALD + "1A" }}>
            <CheckCircle2 size={32} style={{ color: EMERALD }} />
          </div>
          <h2 className="text-2xl font-serif font-bold mb-2" style={{ color: EMERALD }}>Application Submitted!</h2>
          <p className="text-gray-500 text-sm mb-6">
            Your seller application is under review. Our team will verify your KYC and bank details
            within 2–3 business days. You'll be notified by email once approved.
          </p>
          <div className="bg-[#E6F0EA] rounded-xl p-4 text-left text-sm text-gray-600 mb-6 space-y-1.5">
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
        <div className="bg-white rounded-2xl border border-[#C8D8D0] p-10 max-w-md w-full text-center shadow-sm">
          <Store size={32} className="mx-auto mb-4" style={{ color: EMERALD }} />
          <h2 className="text-xl font-serif font-bold mb-2" style={{ color: EMERALD }}>Already Registered</h2>
          <p className="text-sm text-gray-500 mb-6">
            You already have a seller account. Please sign in to access your dashboard.
          </p>
          <button onClick={() => navigate(`${BASE}/seller/login`)}
            className="w-full py-3 rounded-xl text-sm font-bold text-white"
            style={{ background: EMERALD }}>
            Go to Seller Login
          </button>
        </div>
      </div>
    );
  }

  async function step1Create() {
    const e2: typeof errs = {};
    if (!data.email.trim() || !/\S+@\S+\.\S+/.test(data.email)) e2.email = "Enter a valid email";
    if (!data.password || data.password.length < 8) e2.password = "Min. 8 characters";
    setErrs(e2);
    if (Object.keys(e2).length) return;
    setLoading(true); setApiErr("");
    try {
      await signUp!.create({ emailAddress: data.email.trim(), password: data.password });
      await signUp!.prepareEmailAddressVerification({ strategy: "email_code" });
      setEmailOtpSent(true);
    } catch (err: any) {
      setApiErr(err?.errors?.[0]?.longMessage || "Failed to create account. Email may already be in use.");
    } finally { setLoading(false); }
  }

  async function step1Verify() {
    if (emailCode.length < 6) { setApiErr("Enter the 6-digit code from your email"); return; }
    setLoading(true); setApiErr("");
    try {
      const res = await signUp!.attemptEmailAddressVerification({ code: emailCode });
      if (res.status === "complete") {
        await setActive!({ session: res.createdSessionId });
        setStep(2);
      } else {
        setApiErr("Verification incomplete. Please try again.");
      }
    } catch (err: any) {
      setApiErr(err?.errors?.[0]?.longMessage || "Invalid or expired code.");
    } finally { setLoading(false); }
  }

  async function sendPhoneOtp() {
    const num = data.mobile.trim();
    if (!num) { setApiErr("Enter your mobile number"); return; }
    const full = num.startsWith("+") ? num : `+91${num}`;
    setLoading(true); setApiErr("");
    try {
      const ph = await user!.createPhoneNumber({ phoneNumber: full });
      await ph.prepareVerification({ strategy: "phone_code" });
      setPhoneObj(ph); setPhoneSent(true);
    } catch (err: any) {
      setApiErr(err?.errors?.[0]?.longMessage || "Failed to send OTP. Check the number and try again.");
    } finally { setLoading(false); }
  }

  async function verifyPhone() {
    if (phoneCode.length < 6) { setApiErr("Enter the 6-digit OTP"); return; }
    setLoading(true); setApiErr("");
    try {
      await phoneObj.attemptVerification({ code: phoneCode });
      setStep(3);
    } catch (err: any) {
      setApiErr(err?.errors?.[0]?.longMessage || "Invalid OTP. Please try again.");
    } finally { setLoading(false); }
  }

  function v3(): boolean {
    const e2: typeof errs = {};
    if (!data.name.trim()) e2.name = "Shop name is required";
    if (!data.location.trim()) e2.location = "City / location is required";
    if (data.contactEmail && !/\S+@\S+\.\S+/.test(data.contactEmail)) e2.contactEmail = "Enter a valid email";
    if (data.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(data.gstin.toUpperCase()))
      e2.gstin = "Enter a valid 15-character GSTIN";
    setErrs(e2); return !Object.keys(e2).length;
  }

  function v4(): boolean {
    const e2: typeof errs = {};
    if (!data.panNumber.trim()) e2.panNumber = "PAN number is required";
    else if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(data.panNumber.toUpperCase())) e2.panNumber = "Enter a valid 10-character PAN";
    if (!data.panCardUrl) e2.panCardUrl = "Please upload your PAN card";
    setErrs(e2); return !Object.keys(e2).length;
  }

  function v5(): boolean {
    const e2: typeof errs = {};
    if (!data.bankHolder.trim()) e2.bankHolder = "Account holder name is required";
    if (!data.bankName.trim()) e2.bankName = "Bank name is required";
    if (!data.bankAccount.trim()) e2.bankAccount = "Account number is required";
    if (!data.bankIfsc.trim()) e2.bankIfsc = "IFSC code is required";
    else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data.bankIfsc.toUpperCase())) e2.bankIfsc = "Enter a valid 11-character IFSC";
    setErrs(e2); return !Object.keys(e2).length;
  }

  function v6(): boolean {
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
      const res = await fetch(getApiUrl("/api/vendors"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: data.name, location: data.location, bio: data.bio, gstin: data.gstin,
          contactEmail: data.contactEmail, tagline: data.tagline, mobile: data.mobile,
          panNumber: data.panNumber.toUpperCase(), panCardUrl: data.panCardUrl,
          bankHolder: data.bankHolder, bankName: data.bankName,
          bankAccount: data.bankAccount, bankIfsc: data.bankIfsc.toUpperCase(),
          shopStreet: data.shopStreet, shopCity: data.shopCity,
          shopState: data.shopState, shopPincode: data.shopPincode,
          termsAccepted: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) { if (res.status === 409) { setAlready(true); return; } setApiErr(json.error || "Submission failed."); return; }
      setDone(true);
    } catch { setApiErr("Network error. Please check your connection."); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: IVORY }}>
      <div className="flex-1 flex flex-col items-center justify-start py-10 px-4">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-8">
          <img src={`${BASE}/images/logo.png`} alt="TwirlDrape" className="h-10 w-auto object-contain" />
          <span className="text-xs font-bold uppercase tracking-[0.25em]" style={{ color: GOLD }}>Seller Registration</span>
        </motion.div>

        <div className="w-full max-w-lg bg-white rounded-2xl border border-[#C8D8D0] p-7 shadow-sm">
          <ProgressBar step={step} />

          {apiErr && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-red-600">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{apiErr}</span>
            </div>
          )}

          <AnimatePresence mode="wait">
            {step === 1 && (
              <StepShell key="s1" title="Create Your Account"
                subtitle="Set up your TwirlDrape seller account with email and password."
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
                    <p className="text-xs text-gray-400">
                      Already have an account?{" "}
                      <a href={`${BASE}/seller/login`} className="underline" style={{ color: EMERALD }}>Sign in here</a>
                    </p>
                  </>
                ) : (
                  <>
                    <div className="bg-[#E6F0EA] rounded-xl p-4 text-sm text-center" style={{ color: EMERALD }}>
                      A 6-digit code was sent to <strong>{data.email}</strong>
                    </div>
                    <OTPBox value={emailCode} onChange={setEmailCode} />
                    <button type="button" onClick={() => { setEmailOtpSent(false); setEmailCode(""); setApiErr(""); }}
                      className="text-xs text-gray-400 underline w-full text-center">
                      ← Change email or resend code
                    </button>
                  </>
                )}
              </StepShell>
            )}

            {step === 2 && (
              <StepShell key="s2" title="Verify Mobile Number"
                subtitle="We need your mobile number for order updates and account security."
                onBack={!isSignedIn ? () => { setErrs({}); setStep(1); } : undefined}
                onNext={phoneSent ? verifyPhone : sendPhoneOtp}
                nextLabel={phoneSent ? "Verify OTP" : "Send OTP"}
                loading={loading}>
                {!phoneSent ? (
                  <>
                    <Field label="Mobile Number" required>
                      <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: "#C8D8D0" }}>
                        <span className="bg-[#E6F0EA] px-4 py-2.5 text-sm font-semibold border-r text-gray-600"
                          style={{ borderColor: "#C8D8D0" }}>+91</span>
                        <input type="tel" maxLength={10} value={data.mobile}
                          onChange={(e2) => set("mobile")(e2.target.value.replace(/\D/g, "").slice(0, 10))}
                          placeholder="9876543210"
                          className="flex-1 px-4 py-2.5 text-sm outline-none bg-white" />
                      </div>
                    </Field>
                    <button type="button" onClick={() => { setApiErr(""); setStep(3); }}
                      className="text-xs text-gray-400 underline w-full text-right">
                      Skip for now →
                    </button>
                  </>
                ) : (
                  <>
                    <div className="bg-[#E6F0EA] rounded-xl p-4 text-sm text-center" style={{ color: EMERALD }}>
                      OTP sent to <strong>+91 {data.mobile}</strong>
                    </div>
                    <OTPBox value={phoneCode} onChange={setPhoneCode} />
                    <button type="button" onClick={() => { setPhoneSent(false); setPhoneCode(""); setApiErr(""); }}
                      className="text-xs text-gray-400 underline w-full text-center">
                      ← Change number or resend
                    </button>
                  </>
                )}
              </StepShell>
            )}

            {step === 3 && (
              <StepShell key="s3" title="Business Profile"
                subtitle="Tell us about your shop, craft, and what you sell."
                onBack={() => { setErrs({}); setStep(2); }}
                onNext={() => { setApiErr(""); if (v3()) setStep(4); }}>
                <Field label="Shop Name" required error={e("name")}>
                  <Input value={data.name} onChange={set("name")} placeholder="e.g. Silk Heritage Emporium" />
                </Field>
                <Field label="City / Location" required error={e("location")}>
                  <Input value={data.location} onChange={set("location")} placeholder="e.g. Varanasi, Uttar Pradesh" />
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

            {step === 4 && (
              <StepShell key="s4" title="KYC Documents"
                subtitle="Required for identity verification as per RBI guidelines."
                onBack={() => { setErrs({}); setStep(3); }}
                onNext={() => { setApiErr(""); if (v4()) setStep(5); }}>
                <Field label="PAN Number" required error={e("panNumber")} helper="10-character Permanent Account Number">
                  <Input value={data.panNumber} onChange={(v) => set("panNumber")(v.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} />
                </Field>
                <FileUpload label="PAN Card Photo / Scan *" objectPath={data.panCardUrl} onUploaded={set("panCardUrl")}
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  helper="Clear photo or scan of front side of PAN card" />
                {e("panCardUrl") && (
                  <p className="text-xs text-red-500 -mt-2 flex items-center gap-1">
                    <AlertCircle size={11} />{e("panCardUrl")}
                  </p>
                )}
                <FileUpload label="GST Certificate (Optional)" objectPath={""} onUploaded={() => {}}
                  accept="image/jpeg,image/png,application/pdf"
                  helper="Upload if you have GST registration" />
              </StepShell>
            )}

            {step === 5 && (
              <StepShell key="s5" title="Bank Account Details"
                subtitle="Your earnings will be transferred to this account weekly."
                onBack={() => { setErrs({}); setStep(4); }}
                onNext={() => { setApiErr(""); if (v5()) setStep(6); }}>
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

            {step === 6 && (
              <StepShell key="s6" title="Shop Address"
                subtitle="Your registered business or pickup address."
                onBack={() => { setErrs({}); setStep(5); }}
                onNext={() => { setApiErr(""); if (v6()) setStep(7); }}>
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

            {step === 7 && (
              <StepShell key="s7" title="Review & Submit"
                subtitle="Confirm your details and accept our terms."
                onBack={() => { setErrs({}); setStep(6); }}
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
                    <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-[#F3F8F5] border border-[#C8D8D0]">
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

                <div className="border border-[#C8D8D0] rounded-xl p-4 max-h-32 overflow-y-auto text-xs text-gray-500 leading-relaxed">
                  <p className="font-semibold text-gray-700 mb-2">Terms & Conditions</p>
                  By registering as a seller on TwirlDrape, you agree to: (a) provide accurate and truthful information;
                  (b) comply with all applicable Indian laws including GST regulations; (c) maintain product quality
                  standards; (d) not sell counterfeit, prohibited, or restricted goods; (e) accept our commission
                  structure and payout terms (10% commission on each sale); (f) allow TwirlDrape to use your shop name
                  and product images for marketing. TwirlDrape reserves the right to suspend or terminate accounts for
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
          <a href="mailto:sellers@twirldrape.com" className="underline">sellers@twirldrape.com</a>
        </p>
      </div>
    </div>
  );
}
