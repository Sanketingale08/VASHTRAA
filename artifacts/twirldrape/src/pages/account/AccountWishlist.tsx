import React from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { WishlistContent } from "@/pages/Wishlist";

export function AccountWishlistPage() {
  return (
    <DashboardLayout>
      <WishlistContent dashboardMode />
    </DashboardLayout>
  );
}
