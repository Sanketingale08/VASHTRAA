import React, { useEffect, useRef, Component, ErrorInfo, ReactNode, Suspense, lazy } from "react";
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
import { SocketProvider } from "@/context/SocketContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { CartDrawer } from "@/components/CartDrawer";
import { ScrollToTop } from "@/components/ScrollToTop";
import { IntroScreen } from "@/components/IntroScreen";
import { SellerGuard } from "@/components/SellerGuard";
import { CustomerGuard } from "@/components/CustomerGuard";
import Home from "@/pages/Home";

// Customer & Catalog Pages (Lazy Loaded)
const NotFound = lazy(() => import("@/pages/not-found"));
const Unauthorized = lazy(() => import("@/pages/Unauthorized"));
const Paithani = lazy(() => import("@/pages/Paithani"));
const Designer = lazy(() => import("@/pages/Designer"));
const PaithaniShop = lazy(() => import("@/pages/PaithaniShop"));
const DesignerShop = lazy(() => import("@/pages/DesignerShop"));
const ProductDetail = lazy(() => import("@/pages/ProductDetail"));
const Wishlist = lazy(() => import("@/pages/Wishlist"));
const CartPage = lazy(() => import("@/pages/Cart").then(m => ({ default: m.CartPage })));
const CheckoutPage = lazy(() => import("@/pages/Checkout").then(m => ({ default: m.CheckoutPage })));
const OrderConfirmationPage = lazy(() => import("@/pages/OrderConfirmation").then(m => ({ default: m.OrderConfirmationPage })));
const OrderHistoryPage = lazy(() => import("@/pages/OrderHistory").then(m => ({ default: m.OrderHistoryPage })));
const AddressBookPage = lazy(() => import("@/pages/AddressBook").then(m => ({ default: m.AddressBookPage })));
const AccountOverviewPage = lazy(() => import("@/pages/account/Overview").then(m => ({ default: m.AccountOverviewPage })));
const AccountProfilePage = lazy(() => import("@/pages/account/Profile").then(m => ({ default: m.AccountProfilePage })));
const AccountCouponsPage = lazy(() => import("@/pages/account/Coupons").then(m => ({ default: m.AccountCouponsPage })));
const AccountOrdersPage = lazy(() => import("@/pages/account/Orders").then(m => ({ default: m.AccountOrdersPage })));
const AccountWishlistPage = lazy(() => import("@/pages/account/AccountWishlist").then(m => ({ default: m.AccountWishlistPage })));
const AccountCartPage = lazy(() => import("@/pages/account/Cart").then(m => ({ default: m.AccountCartPage })));
const AccountReturnsRefundsPage = lazy(() => import("@/pages/account/ReturnsRefunds").then(m => ({ default: m.AccountReturnsRefundsPage })));
const AccountNotificationsPage = lazy(() => import("@/pages/account/Notifications").then(m => ({ default: m.AccountNotificationsPage })));
const AccountSupportPage = lazy(() => import("@/pages/account/Support").then(m => ({ default: m.AccountSupportPage })));
const AccountPaymentMethodsPage = lazy(() => import("@/pages/account/PaymentMethods").then(m => ({ default: m.AccountPaymentMethodsPage })));
const Contact = lazy(() => import("@/pages/Contact"));
const About = lazy(() => import("@/pages/About"));
const NewArrivals = lazy(() => import("@/pages/NewArrivals"));
const ProductsListing = lazy(() => import("@/pages/ProductsListing").then(m => ({ default: m.ProductsListing })));
const BridalCollection = lazy(() => import("@/pages/BridalCollection"));
const PartyWear = lazy(() => import("@/pages/PartyWear"));
const Festival = lazy(() => import("@/pages/Festival"));
const FAQs = lazy(() => import("@/pages/FAQs"));
const ShippingInfo = lazy(() => import("@/pages/ShippingInfo"));
const SizeGuide = lazy(() => import("@/pages/SizeGuide"));
const Returns = lazy(() => import("@/pages/Returns"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));
const VendorStore = lazy(() => import("@/pages/VendorStore"));
const CustomSignInPage = lazy(() => import("@/pages/SignIn"));
const CustomSignUpPage = lazy(() => import("@/pages/SignUp"));
const ForgotPasswordPage = lazy(() => import("@/pages/ForgotPassword"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPassword"));
const GoogleOAuthCallback = lazy(() => import("@/pages/GoogleOAuthCallback"));
const MaintenancePage = lazy(() => import("@/pages/MaintenancePage"));

// Admin Dashboard Modules (Lazy Loaded Chunk)
const AdminLogin = lazy(() => import("@/pages/AdminLogin"));
const Admin2FAVerify = lazy(() => import("@/pages/Admin2FAVerify"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminVendors = lazy(() => import("@/pages/admin/AdminVendors"));
const AdminVendorAnalytics = lazy(() => import("@/pages/admin/AdminVendorAnalytics"));
const AdminVendorAnalyticsDetail = lazy(() => import("@/pages/admin/AdminVendorAnalyticsDetail"));
const AdminVendorDetail = lazy(() => import("@/pages/admin/AdminVendorDetail"));
const AdminOrders = lazy(() => import("@/pages/admin/AdminOrders"));
const AdminReturns = lazy(() => import("@/pages/admin/AdminReturns"));
const AdminDisputes = lazy(() => import("@/pages/admin/AdminDisputes"));
const AdminCoupons = lazy(() => import("@/pages/admin/AdminCoupons"));
const AdminSupport = lazy(() => import("@/pages/admin/AdminSupport"));
const AdminNotifications = lazy(() => import("@/pages/admin/AdminNotifications"));
const AdminBusinessIntelligence = lazy(() => import("@/pages/admin/AdminBusinessIntelligence"));
const AdminFinancialManagement = lazy(() => import("@/pages/admin/AdminFinancialManagement"));
const AdminAboutContent = lazy(() => import("@/pages/admin/AdminAboutContent"));
const AdminProducts = lazy(() => import("@/pages/admin/AdminProducts"));
const AdminReports = lazy(() => import("@/pages/admin/AdminReports"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
const AdminAdvertisements = lazy(() => import("@/pages/admin/AdminAdvertisements"));

// Seller Portal Modules (Lazy Loaded Chunk)
const SellerLogin = lazy(() => import("@/pages/seller/SellerLogin"));
const SellerRegister = lazy(() => import("@/pages/SellerRegister"));
const SellerDashboard = lazy(() => import("@/pages/seller/SellerDashboard"));
const SellerProfile = lazy(() => import("@/pages/seller/SellerProfile"));
const SellerProducts = lazy(() => import("@/pages/seller/SellerProducts"));
const SellerProductNew = lazy(() => import("@/pages/seller/SellerProductNew"));
const SellerProductEdit = lazy(() => import("@/pages/seller/SellerProductEdit"));
const SellerInventory = lazy(() => import("@/pages/seller/SellerInventory"));
const SellerOrders = lazy(() => import("@/pages/seller/SellerOrders"));
const SellerOrderDetail = lazy(() => import("@/pages/seller/SellerOrderDetail"));
const SellerCustomers = lazy(() => import("@/pages/seller/SellerCustomers"));
const SellerNotifications = lazy(() => import("@/pages/seller/SellerNotifications"));
const SellerAnalytics = lazy(() => import("@/pages/seller/SellerAnalytics"));
const SellerPayouts = lazy(() => import("@/pages/seller/SellerPayouts"));
const SellerSettlements = lazy(() => import("@/pages/seller/SellerSettlements"));
const SellerSupport = lazy(() => import("@/pages/seller/SellerSupport"));

const queryClient = new QueryClient();

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by RootErrorBoundary:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px 20px", textAlign: "center", fontFamily: "sans-serif", maxWidth: "600px", margin: "80px auto" }}>
          <h2 style={{ color: "#0A1F44", fontSize: "24px", marginBottom: "16px" }}>Something went wrong</h2>
          <p style={{ color: "#4A5568", marginBottom: "24px", fontSize: "14px" }}>
            The application encountered an unexpected runtime error.
          </p>
          <pre style={{ background: "#E5E8EC", padding: "16px", borderRadius: "8px", textAlign: "left", fontSize: "12px", overflowX: "auto", color: "#c0392b" }}>
            {this.state.error?.message || "Unknown error"}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: "24px", padding: "10px 24px", backgroundColor: "#0A1F44", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "600" }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const rawClerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "";
const isClerkConfigured = !!rawClerkPubKey && !rawClerkPubKey.includes("placeholder") && rawClerkPubKey.startsWith("pk_");
let clerkPubKey = rawClerkPubKey || "pk_test_placeholder";
if (typeof window !== "undefined" && rawClerkPubKey && isClerkConfigured) {
  try {
    clerkPubKey = publishableKeyFromHost(window.location.hostname, rawClerkPubKey) || clerkPubKey;
  } catch (e) {
    console.warn("Clerk publishableKeyFromHost warning:", e);
  }
}

const mockClerk = {
  loaded: true,
  status: "ready",
  client: null,
  session: null,
  user: null,
  organization: null,
  isSignedIn: false,
  addListener: () => () => {},
  load: async () => {},
  signOut: async () => {},
  __internal_getOptions: () => ({}),
  __internal_state: {
    __internal_effect: () => () => {},
    signInSignal: () => ({
      signIn: null,
      errors: null,
      fetchStatus: "idle",
      isLoaded: true,
    }),
    signUpSignal: () => ({
      signUp: null,
      errors: null,
      fetchStatus: "idle",
      isLoaded: true,
    }),
    waitlistSignal: () => ({
      waitlist: null,
      errors: null,
      fetchStatus: "idle",
      isLoaded: true,
    }),
  },
  openSignIn: () => {},
  openSignUp: () => {},
  closeSignIn: () => {},
  closeSignUp: () => {},
  navigate: () => {},
  buildSignInUrl: () => "",
  buildSignUpUrl: () => "",
  buildAfterSignInUrl: () => "",
  buildAfterSignUpUrl: () => "",
  redirectToSignIn: () => {},
  redirectToSignUp: () => {},
  redirectToUserProfile: () => {},
};

const mockInitialState = {
  userId: null,
  user: null,
  sessionId: null,
  session: null,
  orgId: null,
  orgRole: null,
  orgSlug: null,
  organization: null,
};

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
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

function VastraaAuthQueryClientCacheInvalidator() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const currentId = user?.id ?? null;
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== currentId) {
      qc.clear();
    }
    prevUserIdRef.current = currentId;
  }, [user?.id, qc]);

  return null;
}

function PageLoadingFallback() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-8">
      <div className="w-10 h-10 border-3 border-[#0A1F44]/20 border-t-[#0A1F44] rounded-full animate-spin mb-4" />
      <p className="text-xs font-semibold text-[#718096] uppercase tracking-widest">Loading TwirlDrape...</p>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/products">{() => <ProductsListing />}</Route>
        <Route path="/category/:category">{(params: any) => <ProductsListing category={params?.category} />}</Route>
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
        <Route path="/account/cart" component={() => <CustomerGuard><AccountCartPage /></CustomerGuard>} />
        <Route path="/account/returns" component={() => <CustomerGuard><AccountReturnsRefundsPage /></CustomerGuard>} />
        <Route path="/account/rewards" component={() => <CustomerGuard><Redirect to="/account/overview" /></CustomerGuard>} />
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
        <Route path="/admin/advertisements" component={AdminAdvertisements} />
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
    </Suspense>
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
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <MaintenancePage />
      </Suspense>
    );
  }

  return <>{children}</>;
}

function RealtimeQueryInvalidator() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleRealtimeEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;

      const name: string = detail.name || "";
      if (name.startsWith("product:") || name.startsWith("inventory:") || name === "catalog:updated" || name.startsWith("category:")) {
        queryClient.invalidateQueries({
          predicate: (query) => {
            const first = query.queryKey[0];
            return (
              typeof first === "string" && (
                first.startsWith("/api/products") ||
                first.startsWith("/api/seller/products") ||
                first.startsWith("/api/seller/inventory") ||
                first.startsWith("/api/admin/products") ||
                first.startsWith("/api/categories") ||
                first === "admin-categories" ||
                first === "vendor-products" ||
                first === "product"
              )
            );
          },
        });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
        queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
        queryClient.invalidateQueries({ queryKey: ["/api/seller/products"] });
        queryClient.invalidateQueries({ queryKey: ["/api/seller/inventory"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      }

      if (name.startsWith("vendor:") || name.startsWith("shop:")) {
        queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/vendors"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      }

      if (name.startsWith("order:") || name.startsWith("payment:")) {
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-orders"] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["user-orders"] });
        queryClient.invalidateQueries({ queryKey: ["rewards-summary"] });
        queryClient.invalidateQueries({ queryKey: ["rewards-history"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/seller/orders"] });
      }

      if (name.startsWith("wishlist:")) {
        queryClient.invalidateQueries({ queryKey: ["/api/wishlists"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-wishlist-ids"] });
        queryClient.invalidateQueries({ queryKey: ["wishlist-items"] });
        queryClient.invalidateQueries({ queryKey: ["wishlist-ids"] });
      }

      if (name.startsWith("cart:")) {
        queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
        queryClient.invalidateQueries({ queryKey: ["cart"] });
        queryClient.invalidateQueries({ queryKey: ["cart-items"] });
      }

      if (name.startsWith("address:")) {
        queryClient.invalidateQueries({ queryKey: ["/api/addresses"] });
        queryClient.invalidateQueries({ queryKey: ["addresses"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-addresses"] });
        queryClient.invalidateQueries({ queryKey: ["/api/account/profile"] });
      }

      if (name.startsWith("coupon:")) {
        queryClient.invalidateQueries({ queryKey: ["/api/coupons/available"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-coupons-available"] });
        queryClient.invalidateQueries({ queryKey: ["coupons-available"] });
        queryClient.invalidateQueries({ queryKey: ["coupons-used"] });
        queryClient.invalidateQueries({ queryKey: ["coupons-expired"] });
      }

      if (name.startsWith("profile:")) {
        queryClient.invalidateQueries({ queryKey: ["/api/account/profile"] });
        queryClient.invalidateQueries({ queryKey: ["user-profile"] });
        queryClient.invalidateQueries({ queryKey: ["account-profile"] });
      }

      if (name.startsWith("payment_method:")) {
        queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
        queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-payment-methods"] });
      }

      if (name.startsWith("return:") || name.startsWith("refund:") || name.startsWith("dispute:")) {
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-orders"] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["user-orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/returns"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/tickets"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      }

      if (name.startsWith("vendor:") || name.startsWith("shop:") || name.startsWith("order:") || name.startsWith("financials:") || name.startsWith("settlement:") || name.startsWith("refund:") || name.startsWith("return:") || name === "vendor:analytics_updated" || name === "analytics:updated") {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/vendor-analytics"] });
        queryClient.invalidateQueries({ queryKey: ["/api/seller/analytics"] });
      }

      if (name.startsWith("financials:") || name.startsWith("settlement:")) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/financial/settlements"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/reports/revenue"] });
      }

      if (name.startsWith("notification:")) {
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-notifications-unread"] });
        queryClient.invalidateQueries({ queryKey: ["notif-list"] });
        queryClient.invalidateQueries({ queryKey: ["notif-drawer"] });
        queryClient.invalidateQueries({ queryKey: ["notif-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
        queryClient.invalidateQueries({ queryKey: ["/api/seller/notifications"] });
        queryClient.invalidateQueries({ queryKey: ["/api/seller/notifications/unread-count"] });
        queryClient.invalidateQueries({ queryKey: ["seller-notifications"] });
        queryClient.invalidateQueries({ queryKey: ["seller-unread-count"] });
      }

      if (name.startsWith("reward:")) {
        queryClient.invalidateQueries({ queryKey: ["/api/rewards/summary"] });
        queryClient.invalidateQueries({ queryKey: ["rewards-summary"] });
        queryClient.invalidateQueries({ queryKey: ["rewards-history"] });
      }

      if (name.startsWith("support:")) {
        queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-support-open-count"] });
        queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
        queryClient.invalidateQueries({ queryKey: ["support-ticket"] });
        queryClient.invalidateQueries({ queryKey: ["support-open-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/support/tickets"] });
      }
    };

    window.addEventListener("vastraa-realtime-event", handleRealtimeEvent);
    return () => {
      window.removeEventListener("vastraa-realtime-event", handleRealtimeEvent);
    };
  }, [queryClient]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  const clerkProps: any = isClerkConfigured
    ? {
        publishableKey: clerkPubKey,
        proxyUrl: clerkProxyUrl,
        appearance: clerkAppearance,
        signInUrl: `${basePath}/sign-in`,
        signUpUrl: `${basePath}/sign-up`,
        localization: {
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
        },
        routerPush: (to: string) => setLocation(stripBase(to)),
        routerReplace: (to: string) => setLocation(stripBase(to), { replace: true }),
      }
    : {
        Clerk: mockClerk,
        initialState: mockInitialState,
        publishableKey: "pk_test_placeholder",
      };

  return (
    <ClerkProvider {...clerkProps}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SocketProvider>
            <RealtimeQueryInvalidator />
            <ClerkQueryClientCacheInvalidator />
            <VastraaAuthQueryClientCacheInvalidator />
            <ReferralCapture />
            <TooltipProvider>
              <WishlistProvider>
                <CartProvider>
                  <OrdersProvider>
                    <ScrollToTop />
                    <IntroScreen />
                    <MaintenanceGuard>
                      <Router />
                    </MaintenanceGuard>
                    <CartDrawer />
                    <Toaster />
                  </OrdersProvider>
                </CartProvider>
              </WishlistProvider>
            </TooltipProvider>
          </SocketProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <RootErrorBoundary>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
    </RootErrorBoundary>
  );
}

export default App;
