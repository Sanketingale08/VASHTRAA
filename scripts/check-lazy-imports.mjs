import fs from "fs";
import path from "path";

const pagesDir = "c:/Users/Administrator/OneDrive/Desktop/VASHTRAA_1/artifacts/vastraa/src/pages";

const lazyImports = [
  { name: "NotFound", file: "not-found.tsx", exp: "default" },
  { name: "Unauthorized", file: "Unauthorized.tsx", exp: "default" },
  { name: "Paithani", file: "Paithani.tsx", exp: "default" },
  { name: "Designer", file: "Designer.tsx", exp: "default" },
  { name: "PaithaniShop", file: "PaithaniShop.tsx", exp: "default" },
  { name: "DesignerShop", file: "DesignerShop.tsx", exp: "default" },
  { name: "ProductDetail", file: "ProductDetail.tsx", exp: "default" },
  { name: "Wishlist", file: "Wishlist.tsx", exp: "default" },
  { name: "CartPage", file: "Cart.tsx", exp: "CartPage" },
  { name: "CheckoutPage", file: "Checkout.tsx", exp: "CheckoutPage" },
  { name: "OrderConfirmationPage", file: "OrderConfirmation.tsx", exp: "OrderConfirmationPage" },
  { name: "OrderHistoryPage", file: "OrderHistory.tsx", exp: "OrderHistoryPage" },
  { name: "AddressBookPage", file: "AddressBook.tsx", exp: "AddressBookPage" },
  { name: "AccountOverviewPage", file: "account/Overview.tsx", exp: "AccountOverviewPage" },
  { name: "AccountProfilePage", file: "account/Profile.tsx", exp: "AccountProfilePage" },
  { name: "AccountCouponsPage", file: "account/Coupons.tsx", exp: "AccountCouponsPage" },
  { name: "AccountOrdersPage", file: "account/Orders.tsx", exp: "AccountOrdersPage" },
  { name: "AccountWishlistPage", file: "account/AccountWishlist.tsx", exp: "AccountWishlistPage" },
  { name: "AccountCartPage", file: "account/Cart.tsx", exp: "AccountCartPage" },
  { name: "AccountReturnsRefundsPage", file: "account/ReturnsRefunds.tsx", exp: "AccountReturnsRefundsPage" },
  { name: "AccountNotificationsPage", file: "account/Notifications.tsx", exp: "AccountNotificationsPage" },
  { name: "AccountSupportPage", file: "account/Support.tsx", exp: "AccountSupportPage" },
  { name: "AccountPaymentMethodsPage", file: "account/PaymentMethods.tsx", exp: "AccountPaymentMethodsPage" },
  { name: "Contact", file: "Contact.tsx", exp: "default" },
  { name: "About", file: "About.tsx", exp: "default" },
  { name: "NewArrivals", file: "NewArrivals.tsx", exp: "default" },
  { name: "ProductsListing", file: "ProductsListing.tsx", exp: "ProductsListing" },
  { name: "BridalCollection", file: "BridalCollection.tsx", exp: "default" },
  { name: "PartyWear", file: "PartyWear.tsx", exp: "default" },
  { name: "Festival", file: "Festival.tsx", exp: "default" },
  { name: "FAQs", file: "FAQs.tsx", exp: "default" },
  { name: "ShippingInfo", file: "ShippingInfo.tsx", exp: "default" },
  { name: "SizeGuide", file: "SizeGuide.tsx", exp: "default" },
  { name: "Returns", file: "Returns.tsx", exp: "default" },
  { name: "PrivacyPolicy", file: "PrivacyPolicy.tsx", exp: "default" },
  { name: "TermsOfService", file: "TermsOfService.tsx", exp: "default" },
  { name: "VendorStore", file: "VendorStore.tsx", exp: "default" },
  { name: "CustomSignInPage", file: "SignIn.tsx", exp: "default" },
  { name: "CustomSignUpPage", file: "SignUp.tsx", exp: "default" },
  { name: "ForgotPasswordPage", file: "ForgotPassword.tsx", exp: "default" },
  { name: "ResetPasswordPage", file: "ResetPassword.tsx", exp: "default" },
  { name: "GoogleOAuthCallback", file: "GoogleOAuthCallback.tsx", exp: "default" },
  { name: "MaintenancePage", file: "MaintenancePage.tsx", exp: "default" },
  { name: "AdminLogin", file: "AdminLogin.tsx", exp: "default" },
  { name: "Admin2FAVerify", file: "Admin2FAVerify.tsx", exp: "default" },
  { name: "AdminDashboard", file: "admin/AdminDashboard.tsx", exp: "default" },
  { name: "AdminVendors", file: "admin/AdminVendors.tsx", exp: "default" },
  { name: "AdminVendorAnalytics", file: "admin/AdminVendorAnalytics.tsx", exp: "default" },
  { name: "AdminVendorAnalyticsDetail", file: "admin/AdminVendorAnalyticsDetail.tsx", exp: "default" },
  { name: "AdminVendorDetail", file: "admin/AdminVendorDetail.tsx", exp: "default" },
  { name: "AdminOrders", file: "admin/AdminOrders.tsx", exp: "default" },
  { name: "AdminReturns", file: "admin/AdminReturns.tsx", exp: "default" },
  { name: "AdminDisputes", file: "admin/AdminDisputes.tsx", exp: "default" },
  { name: "AdminCoupons", file: "admin/AdminCoupons.tsx", exp: "default" },
  { name: "AdminSupport", file: "admin/AdminSupport.tsx", exp: "default" },
  { name: "AdminNotifications", file: "admin/AdminNotifications.tsx", exp: "default" },
  { name: "AdminBusinessIntelligence", file: "admin/AdminBusinessIntelligence.tsx", exp: "default" },
  { name: "AdminFinancialManagement", file: "admin/AdminFinancialManagement.tsx", exp: "default" },
  { name: "AdminAboutContent", file: "admin/AdminAboutContent.tsx", exp: "default" },
  { name: "AdminProducts", file: "admin/AdminProducts.tsx", exp: "default" },
  { name: "AdminReports", file: "admin/AdminReports.tsx", exp: "default" },
  { name: "AdminSettings", file: "admin/AdminSettings.tsx", exp: "default" },
  { name: "AdminAdvertisements", file: "admin/AdminAdvertisements.tsx", exp: "default" },
  { name: "SellerLogin", file: "seller/SellerLogin.tsx", exp: "default" },
  { name: "SellerRegister", file: "SellerRegister.tsx", exp: "default" },
  { name: "SellerDashboard", file: "seller/SellerDashboard.tsx", exp: "default" },
  { name: "SellerProfile", file: "seller/SellerProfile.tsx", exp: "default" },
  { name: "SellerProducts", file: "seller/SellerProducts.tsx", exp: "default" },
  { name: "SellerProductNew", file: "seller/SellerProductNew.tsx", exp: "default" },
  { name: "SellerProductEdit", file: "seller/SellerProductEdit.tsx", exp: "default" },
  { name: "SellerInventory", file: "seller/SellerInventory.tsx", exp: "default" },
  { name: "SellerOrders", file: "seller/SellerOrders.tsx", exp: "default" },
  { name: "SellerOrderDetail", file: "seller/SellerOrderDetail.tsx", exp: "default" },
  { name: "SellerCustomers", file: "seller/SellerCustomers.tsx", exp: "default" },
  { name: "SellerNotifications", file: "seller/SellerNotifications.tsx", exp: "default" },
  { name: "SellerAnalytics", file: "seller/SellerAnalytics.tsx", exp: "default" },
  { name: "SellerPayouts", file: "seller/SellerPayouts.tsx", exp: "default" },
  { name: "SellerSettlements", file: "seller/SellerSettlements.tsx", exp: "default" },
  { name: "SellerSupport", file: "seller/SellerSupport.tsx", exp: "default" },
  { name: "SellerReturns", file: "seller/SellerReturns.tsx", exp: "default" },
];

for (const item of lazyImports) {
  const fullPath = path.join(pagesDir, item.file);
  if (!fs.existsSync(fullPath)) {
    console.error(`MISSING FILE: ${item.name} -> ${fullPath}`);
    continue;
  }
  const content = fs.readFileSync(fullPath, "utf-8");
  if (item.exp === "default") {
    if (!content.includes("export default")) {
      console.error(`MISSING DEFAULT EXPORT: ${item.name} in ${item.file}`);
    }
  } else {
    const namedExportPattern = new RegExp(`export (const|function|class|default) ${item.exp}\\b|export \\{[^}]*\\b${item.exp}\\b[^}]*\\}`);
    if (!namedExportPattern.test(content)) {
      console.error(`MISSING NAMED EXPORT ${item.exp}: ${item.name} in ${item.file}`);
    }
  }
}
console.log("Check complete.");
