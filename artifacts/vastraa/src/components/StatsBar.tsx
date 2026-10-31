import React from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Truck, RefreshCcw, CreditCard, Users, Store } from "lucide-react";

const NAVY = "#0A1F44";
const PLATINUM = "#C7CCD1";

const stats = [
  { icon: <Store />, number: "1000+", label: "Trusted Vendors" },
  { icon: <Users />, number: "50K+", label: "Happy Customers" },
  { icon: <ShieldCheck />, number: "10K+", label: "Authentic Products" },
  { icon: <CreditCard />, number: "Secure", label: "Payments" },
  { icon: <RefreshCcw />, number: "Easy", label: "Returns" },
  { icon: <Truck />, number: "Pan India", label: "Delivery" },
];

export function StatsBar() {
  return (
    <div
      className="relative z-10 px-4 md:px-6 py-8"
      style={{ background: "#E5E8EC" }}
    >
      <div
        className="mx-auto"
        style={{ maxWidth: "1400px" }}
      >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              className="flex flex-col items-center justify-center text-center rounded-2xl py-5 px-3 cursor-default"
              style={{
                background: "white",
                boxShadow: "0 4px 18px rgba(10,31,68,0.08), 0 1px 4px rgba(199,204,209,0.06)",
                border: `1px solid ${PLATINUM}44`,
              }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.07 }}
              whileHover={{ y: -3, boxShadow: "0 8px 28px rgba(10,31,68,0.13), 0 2px 8px rgba(199,204,209,0.10)" }}
            >
              <span
                className="mb-2 flex items-center justify-center w-10 h-10 rounded-full"
                style={{ background: PLATINUM + "33", color: NAVY }}
              >
                {React.cloneElement(stat.icon as React.ReactElement<{ size?: number }>, { size: 18 })}
              </span>
              <p
                className="font-serif font-bold leading-none mb-1"
                style={{ fontSize: "18px", color: NAVY }}
              >
                {stat.number}
              </p>
              <p
                className="text-[11px] font-medium tracking-wide"
                style={{ color: "#4A5568" }}
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
