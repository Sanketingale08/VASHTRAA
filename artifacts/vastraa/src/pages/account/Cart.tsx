import React from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { CartContent } from "@/pages/Cart";

export function AccountCartPage() {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="font-serif text-2xl lg:text-3xl font-bold text-[#0A1F44]">
            Shopping Cart
          </h1>
          <p className="text-xs lg:text-sm text-gray-500 mt-1">
            Review your selected products and proceed to checkout.
          </p>
        </div>
        <div className="bg-white rounded-xl border border-[#C7CCD1]/20 p-4 lg:p-6 shadow-sm">
          <CartContent dashboardMode />
        </div>
      </div>
    </DashboardLayout>
  );
}

export default AccountCartPage;
