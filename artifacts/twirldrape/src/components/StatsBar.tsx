import React from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Truck, RefreshCcw, CreditCard, Users, Store } from "lucide-react";

const WINE = "#4D0B35";
const PRIMARY = "#6A0D45";
const GOLD = "#D4AF37";
const IVORY = "#FFF9F4";
const GOLD_DIM = "rgba(212,175,55,0.18)";

const stats = [
  { icon: <Store size={18} />, number: "1000+", label: "Trusted Vendors" },
  { icon: <Users size={18} />, number: "50K+", label: "Happy Customers" },
  { icon: <ShieldCheck size={18} />, number: "10K+", label: "Authentic Products" },
  { icon: <CreditCard size={18} />, number: "Secure", label: "Payments" },
  { icon: <RefreshCcw size={18} />, number: "Easy", label: "Returns" },
  { icon: <Truck size={18} />, number: "Pan India", label: "Delivery" },
];

export function StatsBar() {
  return (
    <div
      className="relative"
      style={{
        background: `linear-gradient(90deg, ${WINE} 0%, ${PRIMARY} 100%)`,
        borderTop: `1px solid ${GOLD}44`,
      }}
    >
      <div className="mx-auto px-4 md:px-8" style={{ maxWidth: "1400px" }}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              className="flex flex-col items-center justify-center text-center py-6 px-4 cursor-default"
              style={{
                borderRight: i < 5 ? `1px solid ${GOLD}22` : "none",
              }}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.07 }}
            >
              <span
                className="mb-2 flex items-center justify-center w-9 h-9 rounded-full"
                style={{ background: GOLD_DIM }}
              >
                <span style={{ color: GOLD }}>{stat.icon}</span>
              </span>
              <p
                className="font-serif font-bold leading-none mb-1"
                style={{ fontSize: "17px", color: IVORY }}
              >
                {stat.number}
              </p>
              <p
                style={{
                  fontSize: "11px",
                  color: "rgba(255,249,244,0.6)",
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                }}
              >
                {stat.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
