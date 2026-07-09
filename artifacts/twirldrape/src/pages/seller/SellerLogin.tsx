import React from "react";
import { SignIn, useUser } from "@clerk/react";
import { Store } from "lucide-react";
import { motion } from "framer-motion";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const MAROON = "#1E6B5A";
const GOLD = "#C9A84C";
const IVORY = "#F3F8F5";

export default function SellerLogin() {
  const { isSignedIn } = useUser();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: IVORY }}>
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10 text-center"
        >
          <img
            src={`${basePath}/images/logo.png`}
            alt="TwirlDrape"
            className="h-14 w-auto object-contain mx-auto mb-4"
          />
          <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>
            Seller Portal
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-md"
        >
          {isSignedIn ? (
            <div className="bg-white rounded-2xl border border-[#C9A84C]/20 p-8 text-center shadow-sm">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: MAROON + "18" }}
              >
                <Store size={24} style={{ color: MAROON }} />
              </div>
              <h2 className="font-serif text-xl font-bold mb-2" style={{ color: MAROON }}>
                Already Signed In
              </h2>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                You're signed in to TwirlDrape. Access your seller panel or register as a vendor.
              </p>
              <div className="flex flex-col gap-3">
                <a
                  href={`${basePath}/seller/dashboard`}
                  className="inline-flex items-center justify-center gap-2 py-3 px-6 font-bold text-sm uppercase tracking-widest rounded-sm transition-colors"
                  style={{ background: MAROON, color: IVORY }}
                >
                  Go to Seller Dashboard
                </a>
                <a
                  href={`${basePath}/seller/register`}
                  className="inline-flex items-center justify-center gap-2 py-3 px-6 font-bold text-sm uppercase tracking-widest rounded-sm border-2 transition-colors"
                  style={{ borderColor: GOLD, color: MAROON }}
                >
                  Register as Vendor
                </a>
              </div>
            </div>
          ) : (
            <div>
              <SignIn
                routing="path"
                path={`${basePath}/seller/login`}
                signUpUrl={`${basePath}/sign-up`}
                forceRedirectUrl={`${basePath}/seller/dashboard`}
              />
              <p className="mt-5 text-center text-sm text-gray-500">
                New seller?{" "}
                <a
                  href={`${basePath}/seller/register`}
                  className="font-semibold hover:underline"
                  style={{ color: MAROON }}
                >
                  Register your store →
                </a>
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
