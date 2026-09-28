import { useEffect, useRef } from "react";
import { ClerkProvider } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useClerk } from "@clerk/react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WishlistProvider } from "@/context/WishlistContext";
import { CartProvider } from "@/context/CartContext";
import { OrdersProvider } from "@/context/OrdersContext";
import { CartDrawer } from "@/components/CartDrawer";
import NotFound from "@/pages/not-found";
import Unauthorized from "@/pages/Unauthorized";
import Home from "@/pages/Home";
import Collections from "@/pages/Collections";
import Paithani from "@/pages/Paithani";
import Designer from "@/pages/Designer";
import PaithaniShop from "@/pages/PaithaniShop";
import DesignerShop from "@/pages/DesignerShop";
import ProductDetail from "@/pages/ProductDetail";
import Wishlist from "@/pages/Wishlist";
import { CartPage } from "@/pages/Cart";
import { CheckoutPage } from "@/pages/Checkout";
import { OrderConfirmationPage } from "@/pages/OrderConfirmation";
import { OrderHistoryPage } from "@/pages/OrderHistory";
import { AddressBookPage } from "@/pages/AddressBook";
import { AccountOverviewPage } from "@/pages/account/Overview";
import { AccountProfilePage } from "@/pages/account/Profile";
import { AccountCouponsPage } from "@/pages/account/Coupons";
import { AccountOrdersPage } from "@/pages/account/Orders";
import { AccountWishlistPage } from "@/pages/account/AccountWishlist";
import { AccountRewardsPage } from "@/pages/account/Rewards";
import { AccountNotificationsPage } from "@/pages/account/Notifications";
import { AccountSupportPage } from "@/pages/account/Support";
import { AccountPaymentMethodsPage } from "@/pages/account/PaymentMethods";
import Contact from "@/pages/Contact";
import About from "@/pages/About";
import NewArrivals from "@/pages/NewArrivals";
import AdminLogin from "@/pages/AdminLogin";
import Admin2FAVerify from "@/pages/Admin2FAVerify";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminVendors from "@/pages/admin/AdminVendors";
import AdminVendorAnalytics from "@/pages/admin/AdminVendorAnalytics";
import AdminVendorAnalyticsDetail from "@/pages/admin/AdminVendorAnalyticsDetail";
import AdminVendorDetail from "@/pages/admin/AdminVendorDetail";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminReturns from "@/pages/admin/AdminReturns";
import AdminDisputes from "@/pages/admin/AdminDisputes";
import AdminCoupons from "@/pages/admin/AdminCoupons";
import AdminSupport from "@/pages/admin/AdminSupport";
import AdminNotifications from "@/pages/admin/AdminNotifications";
import AdminBusinessIntelligence from "@/pages/admin/AdminBusinessIntelligence";
import AdminFinancialManagement from "@/pages/admin/AdminFinancialManagement";
import AdminAboutContent from "@/pages/admin/AdminAboutContent";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminReports from "@/pages/admin/AdminReports";
import AdminSettings from "@/pages/admin/AdminSettings";
import SellerSupport from "@/pages/seller/SellerSupport";
import SellerRegister from "@/pages/SellerRegister";
import SellerDashboard from "@/pages/seller/SellerDashboard";
import SellerProfile from "@/pages/seller/SellerProfile";
import SellerProducts from "@/pages/seller/SellerProducts";
import SellerProductNew from "@/pages/seller/SellerProductNew";
import SellerProductEdit from "@/pages/seller/SellerProductEdit";
import SellerInventory from "@/pages/seller/SellerInventory";
import SellerOrders from "@/pages/seller/SellerOrders";
import SellerOrderDetail from "@/pages/seller/SellerOrderDetail";
import SellerCustomers from "@/pages/seller/SellerCustomers";
import SellerNotifications from "@/pages/seller/SellerNotifications";
import SellerAnalytics from "@/pages/seller/SellerAnalytics";
import SellerPayouts from "@/pages/seller/SellerPayouts";
import SellerSettlements from "@/pages/seller/SellerSettlements";
import SellerLogin from "@/pages/seller/SellerLogin";
import VendorStore from "@/pages/VendorStore";
import Weavers from "@/pages/Weavers";
import WeaverProfile from "@/pages/WeaverProfile";
import BridalCollection from "@/pages/BridalCollection";
import PartyWear from "@/pages/PartyWear";
import Festival from "@/pages/Festival";
import FAQs from "@/pages/FAQs";
import ShippingInfo from "@/pages/ShippingInfo";
import SizeGuide from "@/pages/SizeGuide";
import Returns from "@/pages/Returns";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import { SellerGuard } from "@/components/SellerGuard";
import { CustomerGuard } from "@/components/CustomerGuard";
import { AuthProvider } from "@/context/AuthContext";
import CustomSignInPage from "@/pages/SignIn";
import CustomSignUpPage from "@/pages/SignUp";
import ForgotPasswordPage from "@/pages/ForgotPassword";
import ResetPasswordPage from "@/pages/ResetPassword";
import GoogleOAuthCallback from "@/pages/GoogleOAuthCallback";
import MaintenancePage from "@/pages/MaintenancePage";

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  baseTheme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#0A1F44",
    colorForeground: "#3D1A1A",
    colorMutedForeground: "#7a5f4e",
    colorDanger: "#c0392b",
    colorBackground: "#F4F5F7",
    colorInput: "#E5E8EC",
    colorInputForeground: "#3D1A1A",
    colorNeutral: "#C7CCD1",
    fontFamily: "'DM Sans', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#F4F5F7] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl border border-[#C7CCD1]/30",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#0A1F44] font-serif text-2xl",
    headerSubtitle: "text-[#7a5f4e]",
    socialButtonsBlockButtonText: "text-[#3D1A1A]",
    formFieldLabel: "text-[#3D1A1A] font-medium",
    footerActionLink: "text-[#0A1F44] font-semibold hover:text-[#C7CCD1]",
    footerActionText: "text-[#7a5f4e]",
    dividerText: "text-[#7a5f4e]",
    identityPreviewEditButton: "text-[#0A1F44]",
    formFieldSuccessText: "text-green-700",
    alertText: "text-[#3D1A1A]",
    logoBox: "flex justify-center py-2",
    logoImage: "h-16 w-auto object-contain",
    socialButtonsBlockButton: "border border-[#C7CCD1]/40 hover:border-[#C7CCD1] bg-white",
    formButtonPrimary: "bg-[#0A1F44] hover:bg-[#2C3E6B] text-[#F4F5F7]",
    formFieldInput: "bg-[#E5E8EC] border-[#C7CCD1]/40 text-[#3D1A1A]",
    footerAction: "bg-[#E5E8EC] border-t border-[#C7CCD1]/20",
    dividerLine: "bg-[#C7CCD1]/30",
    alert: "bg-[#E5E8EC] border border-[#C7CCD1]/30",
    otpCodeFieldInput: "bg-[#E5E8EC] border-[#C7CCD1]/40 text-[#3D1A1A]",
    formFieldRow: "",
    main: "",
  },
};

const REFERRAL_STORAGE_KEY = "td_ref_code";

function ReferralCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get("ref");
    if (refCode && !localStorage.getItem(REFERRAL_STORAGE_KEY)) {
      localStorage.setItem(REFERRAL_STORAGE_KEY, refCode.trim().toUpperCase());
    }
  }, []);
  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/collections" component={Collections} />
      <Route path="/new-arrivals" component={NewArrivals} />
      <Route path="/paithani" component={Paithani} />
      <Route path="/paithani/shop" component={PaithaniShop} />
      <Route path="/designer" component={Designer} />
      <Route path="/designer/shop" component={DesignerShop} />
      <Route path="/products/:id" component={ProductDetail} />
      <Route path="/wishlist" component={Wishlist} />
      <Route path="/cart" component={CartPage} />
      <Route path="/checkout" component={CheckoutPage} />
      <Route path="/orders" component={OrderHistoryPage} />
      <Route path="/orders/:id" component={OrderConfirmationPage} />
      <Route path="/account" component={() => <CustomerGuard><Redirect to="/account/overview" /></CustomerGuard>} />
      <Route path="/account/overview" component={() => <CustomerGuard><AccountOverviewPage /></CustomerGuard>} />
      <Route path="/account/profile" component={() => <CustomerGuard><AccountProfilePage /></CustomerGuard>} />
      <Route path="/account/coupons" component={() => <CustomerGuard><AccountCouponsPage /></CustomerGuard>} />
      <Route path="/account/orders" component={() => <CustomerGuard><AccountOrdersPage /></CustomerGuard>} />
      <Route path="/account/wishlist" component={() => <CustomerGuard><AccountWishlistPage /></CustomerGuard>} />
      <Route path="/account/rewards" component={() => <CustomerGuard><AccountRewardsPage /></CustomerGuard>} />
      <Route path="/account/notifications" component={() => <CustomerGuard><AccountNotificationsPage /></CustomerGuard>} />
      <Route path="/account/support" component={() => <CustomerGuard><AccountSupportPage /></CustomerGuard>} />
      <Route path="/account/payment-methods" component={() => <CustomerGuard><AccountPaymentMethodsPage /></CustomerGuard>} />
      <Route path="/account/addresses" component={() => <CustomerGuard><AddressBookPage /></CustomerGuard>} />
      <Route path="/bridal" component={BridalCollection} />
      <Route path="/festival" component={Festival} />
      <Route path="/party-wear" component={PartyWear} />
      <Route path="/faqs" component={FAQs} />
      <Route path="/shipping-info" component={ShippingInfo} />
      <Route path="/size-guide" component={SizeGuide} />
      <Route path="/returns" component={Returns} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms-of-service" component={TermsOfService} />
      <Route path="/contact" component={Contact} />
      <Route path="/about" component={About} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/2fa-verify" component={Admin2FAVerify} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/vendors/:id" component={AdminVendorDetail} />
      <Route path="/admin/vendors" component={AdminVendors} />
      <Route path="/admin/vendor-analytics/:id" component={AdminVendorAnalyticsDetail} />
      <Route path="/admin/vendor-analytics" component={AdminVendorAnalytics} />
      <Route path="/admin/orders" component={AdminOrders} />
      <Route path="/admin/returns" component={AdminReturns} />
      <Route path="/admin/disputes" component={AdminDisputes} />
      <Route path="/admin/coupons" component={AdminCoupons} />
      <Route path="/admin/support" component={AdminSupport} />
      <Route path="/admin/notifications" component={AdminNotifications} />
      <Route path="/admin/business-intelligence" component={AdminBusinessIntelligence} />
      <Route path="/admin/financial" component={AdminFinancialManagement} />
      <Route path="/admin/about-content" component={AdminAboutContent} />
      <Route path="/admin/products" component={AdminProducts} />
      <Route path="/admin/reports" component={AdminReports} />
      <Route path="/admin/settings" component={AdminSettings} />
      <Route path="/seller/login/*?" component={SellerLogin} />
      <Route path="/seller/register" component={SellerRegister} />
      <Route path="/seller/claim" component={() => <Redirect to="/seller/login" />} />
      <Route path="/seller/dashboard" component={() => (
        <SellerGuard><SellerDashboard /></SellerGuard>
      )} />
      <Route path="/seller/profile" component={() => (
        <SellerGuard><SellerProfile /></SellerGuard>
      )} />
      <Route path="/seller/products/new" component={() => (
        <SellerGuard><SellerProductNew /></SellerGuard>
      )} />
      <Route path="/seller/products/:id/edit" component={() => (
        <SellerGuard><SellerProductEdit /></SellerGuard>
      )} />
      <Route path="/seller/products" component={() => (
        <SellerGuard><SellerProducts /></SellerGuard>
      )} />
      <Route path="/seller/inventory" component={() => (
        <SellerGuard><SellerInventory /></SellerGuard>
      )} />
      <Route path="/seller/orders/:id" component={() => (
        <SellerGuard><SellerOrderDetail /></SellerGuard>
      )} />
      <Route path="/seller/orders" component={() => (
        <SellerGuard><SellerOrders /></SellerGuard>
      )} />
      <Route path="/seller/customers" component={() => (
        <SellerGuard><SellerCustomers /></SellerGuard>
      )} />
      <Route path="/seller/notifications" component={() => (
        <SellerGuard><SellerNotifications /></SellerGuard>
      )} />
      <Route path="/seller/analytics" component={() => (
        <SellerGuard><SellerAnalytics /></SellerGuard>
      )} />
      <Route path="/seller/payouts" component={() => (
        <SellerGuard><SellerPayouts /></SellerGuard>
      )} />
      <Route path="/seller/settlements" component={() => (
        <SellerGuard><SellerSettlements /></SellerGuard>
      )} />
      <Route path="/seller/support" component={() => (
        <SellerGuard><SellerSupport /></SellerGuard>
      )} />
      <Route path="/stores/:vendorId" component={VendorStore} />
      <Route path="/weavers/:id" component={WeaverProfile} />
      <Route path="/weavers" component={Weavers} />
      <Route path="/seller/forgot-password" component={() => <ForgotPasswordPage role="seller" />} />
      <Route path="/seller/reset-password" component={() => <ResetPasswordPage role="seller" />} />
      <Route path="/forgot-password" component={() => <ForgotPasswordPage role="customer" />} />
      <Route path="/reset-password" component={() => <ResetPasswordPage role="customer" />} />
      <Route path="/sign-in/*?" component={CustomSignInPage} />
      <Route path="/sign-in" component={CustomSignInPage} />
      <Route path="/sign-up/*?" component={CustomSignUpPage} />
      <Route path="/sign-up" component={CustomSignUpPage} />
      <Route path="/google-callback" component={GoogleOAuthCallback} />
      <Route path="/unauthorized" component={Unauthorized} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * MaintenanceGuard — polls /api/settings/maintenance-status every 30 s.
 * When maintenance is active, shoppers see MaintenancePage.
 * Admin and seller paths are never blocked so the admin panel stays usable.
 */
function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const isAdminOrSeller =
    location.startsWith("/admin") || location.startsWith("/seller");

  const { data } = useQuery({
    queryKey: ["maintenance-status"],
    queryFn: async () => {
      const r = await fetch("/api/settings/maintenance-status");
      if (!r.ok) return { maintenance: false };
      return r.json() as Promise<{ maintenance: boolean }>;
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
    // Don't hold up the initial render — assume live until proven otherwise
    placeholderData: { maintenance: false },
  });

  if (!isAdminOrSeller && data?.maintenance) {
    return <MaintenancePage />;
  }

  return <>{children}</>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Sign in to TwirlDrape",
            subtitle: "Access your wishlist and account",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Save wishlists and shop your favorites",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ClerkQueryClientCacheInvalidator />
          <ReferralCapture />
          <TooltipProvider>
            <WishlistProvider>
              <CartProvider>
                <OrdersProvider>
                  <MaintenanceGuard>
                    <Router />
                  </MaintenanceGuard>
                  <CartDrawer />
                  <Toaster />
                </OrdersProvider>
              </CartProvider>
            </WishlistProvider>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
