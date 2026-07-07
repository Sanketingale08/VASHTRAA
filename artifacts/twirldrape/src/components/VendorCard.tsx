import React from "react";
import { Link } from "wouter";
import { Star, Store, MapPin, ArrowRight } from "lucide-react";
import type { VendorSummary } from "@workspace/api-client-react";

interface VendorCardProps {
  vendor: VendorSummary & { productCount?: number };
}

export function VendorCard({ vendor }: VendorCardProps) {
  const isDesigner = vendor.name.toLowerCase().includes("glam") ||
    vendor.name.toLowerCase().includes("drapes") ||
    vendor.name.toLowerCase().includes("designer");

  const href = isDesigner
    ? `/designer/shop?vendorId=${vendor.id}`
    : `/paithani/shop?vendorId=${vendor.id}`;

  const categoryLabel = isDesigner ? "Designer Sarees" : "Paithani & Silk";

  return (
    <Link href={href}>
      <div className="group flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-[#C9A84C]/20 hover:border-[#C9A84C] bg-white dark:bg-[#2A2E35] hover:shadow-lg transition-all duration-300 cursor-pointer min-w-[180px] max-w-[220px] w-full">
        <div className="relative">
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#C9A84C]/40 group-hover:border-[#C9A84C] transition-colors bg-[#F5EDE0]">
            {vendor.avatar ? (
              <img
                src={vendor.avatar}
                alt={vendor.name}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Store size={28} className="text-[#7B1C2C]/40" />
              </div>
            )}
          </div>
          <div className="absolute -bottom-1 -right-1 bg-[#C9A84C] text-[#7B1C2C] text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-tight">
            ★{vendor.rating.toFixed(1)}
          </div>
        </div>

        <div className="text-center flex-1 min-w-0">
          <h3 className="font-serif font-bold text-[#7B1C2C] dark:text-[#FAF6EE] text-sm leading-tight mb-1 line-clamp-2">
            {vendor.name}
          </h3>
          <div className="flex items-center justify-center gap-1 text-gray-400 mb-1.5">
            <MapPin size={11} />
            <span className="text-[11px] truncate">{vendor.location}</span>
          </div>
          <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#7B1C2C]/10 text-[#7B1C2C] mb-2">
            {categoryLabel}
          </span>
          <div className="flex items-center justify-center gap-1">
            <span className="text-xs text-gray-500 font-medium">
              {vendor.sareesCount.toLocaleString("en-IN")}+ sarees
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 text-xs font-bold text-[#7B1C2C] group-hover:gap-2 transition-all">
          Visit Shop <ArrowRight size={13} />
        </div>
      </div>
    </Link>
  );
}
