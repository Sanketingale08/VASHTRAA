import React from "react";

export function AnnouncementBar() {
  return (
    <div className="bg-[#7B1C2C] text-[#FAF6EE] text-xs py-2 px-4 flex justify-center md:justify-between items-center z-50 relative">
      <div className="hidden md:flex gap-4 opacity-80">
        <a href="#" className="hover:text-[#C9A84C] transition-colors">Track Order</a>
        <span className="opacity-40">|</span>
        <a href="#" className="hover:text-[#C9A84C] transition-colors">Become a Vendor</a>
      </div>
      <div className="font-medium tracking-wide text-center">
        Authentic Paithani, Premium Designer Sarees. Trusted by 10,000+ Customers.
      </div>
      <div className="hidden md:flex gap-4 opacity-80">
        <a href="#" className="hover:text-[#C9A84C] transition-colors">Help & Support</a>
      </div>
    </div>
  );
}
