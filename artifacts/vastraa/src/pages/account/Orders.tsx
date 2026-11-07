import React from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { OrderHistoryContent } from "@/pages/OrderHistory";

export function AccountOrdersPage() {
  return (
    <DashboardLayout>
      <OrderHistoryContent dashboardMode />
    </DashboardLayout>
  );
}

export default AccountOrdersPage;
