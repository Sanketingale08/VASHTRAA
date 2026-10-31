import React from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { WishlistContent } from "@/pages/Wishlist";

export function AccountWishlistPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="font-serif text-2xl lg:text-3xl font-bold text-[#0A1F44]">
            My Wishlist
          </h1>
          <p className="text-xs lg:text-sm text-gray-500 mt-1">
            Review your saved handcrafted sarees and easily move them to your bag.
          </p>
        </div>
        <WishlistContent dashboardMode />
      </div>
    </DashboardLayout>
  );
}
