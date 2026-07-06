import React from "react";
import { ShieldCheck, Truck, RefreshCcw, CreditCard, Users, Store } from "lucide-react";

export function StatsBar() {
  const stats = [
    { icon: <Store className="w-5 h-5 mb-2 text-[#C9A84C]" />, text: "1,000+ Trusted Vendors" },
    { icon: <Users className="w-5 h-5 mb-2 text-[#C9A84C]" />, text: "50K+ Happy Customers" },
    { icon: <ShieldCheck className="w-5 h-5 mb-2 text-[#C9A84C]" />, text: "10K+ Authentic Products" },
    { icon: <CreditCard className="w-5 h-5 mb-2 text-[#C9A84C]" />, text: "Secure Payments" },
    { icon: <RefreshCcw className="w-5 h-5 mb-2 text-[#C9A84C]" />, text: "Easy Returns" },
    { icon: <Truck className="w-5 h-5 mb-2 text-[#C9A84C]" />, text: "Pan India Delivery" },
  ];

  return (
    <div className="bg-[#FAF6EE] dark:bg-[#1E2329] border-y border-[#C9A84C]/20 py-8">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 text-center">
          {stats.map((stat, i) => (
            <div key={i} className="flex flex-col items-center justify-center">
              {stat.icon}
              <span className="text-xs md:text-sm font-medium text-[#7B1C2C] dark:text-[#F5EDE0] tracking-wide">
                {stat.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
