import React from "react";
import { Link } from "wouter";
import { Star, Store, MapPin, ArrowRight, Package } from "lucide-react";
import type { VendorSummary } from "@workspace/api-client-react";

export interface VendorCardProps {
  vendor: VendorSummary & {
    productCount?: number;
    tagline?: string | null;
    bio?: string | null;
    vendorId?: string | null;
  };
}

export function VendorCard({ vendor }: VendorCardProps) {
  const shopId = vendor.vendorId || vendor.id;
  const href = `/stores/${shopId}`;
  const productCount = vendor.productCount ?? vendor.sareesCount ?? 0;
  const description = vendor.tagline || vendor.bio || "Authentic Handloom & Designer Saree Shop";

  return (
    <Link href={href}>
      <div className="group flex flex-col items-center justify-between p-5 rounded-2xl border-2 border-[#C7CCD1]/20 hover:border-[#C7CCD1] bg-white dark:bg-[#2A2E35] hover:shadow-xl transition-all duration-300 cursor-pointer w-full h-full min-h-[270px]">
        <div className="flex flex-col items-center gap-3 w-full">
          <div className="relative">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#C7CCD1]/40 group-hover:border-[#C7CCD1] transition-colors bg-[#E5E8EC] shrink-0">
              {vendor.avatar ? (
                <img
                  src={vendor.avatar}
                  alt={vendor.name}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = "/images/artisan-1.png"; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Store size={28} className="text-[#0A1F44]/40" />
                </div>
              )}
            </div>
            {typeof vendor.rating === "number" && vendor.rating > 0 && (
              <div className="absolute -bottom-1 -right-1 bg-[#C7CCD1] text-[#0A1F44] text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-tight shadow-sm">
                ★{vendor.rating.toFixed(1)}
              </div>
            )}
          </div>

          <div className="text-center w-full min-w-0">
            <h3 className="font-serif font-bold text-[#0A1F44] dark:text-[#F4F5F7] text-base leading-snug mb-1 line-clamp-1">
              {vendor.name}
            </h3>
            {description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 line-clamp-2 min-h-[32px] px-1">
                {description}
              </p>
            )}
            {vendor.location && (
              <div className="flex items-center justify-center gap-1 text-gray-400 mb-2">
                <MapPin size={12} className="shrink-0" />
                <span className="text-xs truncate max-w-[180px]">{vendor.location}</span>
              </div>
            )}
            <div className="flex items-center justify-center">
              <span className="inline-flex items-center gap-1 text-xs text-[#0A1F44] dark:text-[#C7CCD1] font-semibold px-2.5 py-1 rounded-full bg-[#0A1F44]/5 dark:bg-white/10">
                <Package size={12} />
                {productCount.toLocaleString("en-IN")} Active {productCount === 1 ? "Product" : "Products"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1 text-xs font-bold text-[#0A1F44] dark:text-[#C7CCD1] group-hover:gap-2 transition-all mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-800 w-full">
          Visit Shop <ArrowRight size={13} />
        </div>
      </div>
    </Link>
  );
}
