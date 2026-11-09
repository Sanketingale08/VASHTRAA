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

// Resilient Dynamic Import with Auto-Retry & Dual Named/Default Export Resolution
function safeLazy<T extends React.ComponentType<any>>(
  factory: () => Promise<any>,
  namedExport?: string
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    let attempts = 3;
    let delay = 350;

    while (attempts > 0) {
      try {
        const mod = await factory();
        if (!mod) {
          throw new Error("Module returned null or undefined");
        }

        // 1. Specified named export
        if (namedExport && mod[namedExport]) {
          return { default: mod[namedExport] };
        }

        // 2. Default export
        if (mod.default) {
          if (typeof mod.default === "object" && mod.default !== null && mod.default.default) {
            return { default: mod.default.default };
          }
          return { default: mod.default };
        }

        // 3. Direct function component
        if (typeof mod === "function") {
          return { default: mod as T };
        }

        // 4. Fallback search for any exported React component
        if (typeof mod === "object" && mod !== null) {
          for (const key of Object.keys(mod)) {
            if (typeof mod[key] === "function" && /^[A-Z]/.test(key)) {
              return { default: mod[key] };
            }
          }
        }

        throw new Error("Module does not export a valid React component");
      } catch (err: any) {
        attempts--;
        const isChunkOrFetchError =
          err?.message?.includes("Failed to fetch dynamically imported module") ||
          err?.message?.includes("Importing a module script failed") ||
          err?.message?.includes("error loading dynamically imported module") ||
          err?.message?.includes("Failed to fetch");

        if (attempts <= 0) {
          if (isChunkOrFetchError && typeof window !== "undefined") {
            const retryKey = `vastraa_chunk_retry_${window.location.pathname}`;
            if (!sessionStorage.getItem(retryKey)) {
              sessionStorage.setItem(retryKey, Date.now().toString());
              window.location.reload();
              return new Promise(() => {});
            }
          }
          console.error("safeLazy failed to load component:", err);
          throw err;
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 1.5;
      }
    }

    throw new Error("Failed to load module after multiple attempts");
  });
}

// Customer & Catalog Pages (Lazy Loaded)
const NotFound = safeLazy(() => import("@/pages/not-found"));
const Unauthorized = safeLazy(() => import("@/pages/Unauthorized"));
const Paithani = safeLazy(() => import("@/pages/Paithani"));
const Designer = safeLazy(() => import("@/pages/Designer"));
const PaithaniShop = safeLazy(() => import("@/pages/PaithaniShop"));
const DesignerShop = safeLazy(() => import("@/pages/DesignerShop"));
const ProductDetail = safeLazy(() => import("@/pages/ProductDetail"));
const Wishlist = safeLazy(() => import("@/pages/Wishlist"));
const CartPage = safeLazy(() => import("@/pages/Cart"), "CartPage");
const CheckoutPage = safeLazy(() => import("@/pages/Checkout"), "CheckoutPage");
const OrderConfirmationPage = safeLazy(() => import("@/pages/OrderConfirmation"), "OrderConfirmationPage");
const OrderHistoryPage = safeLazy(() => import("@/pages/OrderHistory"), "OrderHistoryPage");
const AddressBookPage = safeLazy(() => import("@/pages/AddressBook"), "AddressBookPage");
const AccountOverviewPage = safeLazy(() => import("@/pages/account/Overview"), "AccountOverviewPage");
const AccountProfilePage = safeLazy(() => import("@/pages/account/Profile"), "AccountProfilePage");
const AccountCouponsPage = safeLazy(() => import("@/pages/account/Coupons"), "AccountCouponsPage");
const AccountOrdersPage = safeLazy(() => import("@/pages/account/Orders"), "AccountOrdersPage");
const AccountWishlistPage = safeLazy(() => import("@/pages/account/AccountWishlist"), "AccountWishlistPage");
const AccountCartPage = safeLazy(() => import("@/pages/account/Cart"), "AccountCartPage");
const AccountReturnsRefundsPage = safeLazy(() => import("@/pages/account/ReturnsRefunds"), "AccountReturnsRefundsPage");
const AccountNotificationsPage = safeLazy(() => import("@/pages/account/Notifications"), "AccountNotificationsPage");
const AccountSupportPage = safeLazy(() => import("@/pages/account/Support"), "AccountSupportPage");
const AccountPaymentMethodsPage = safeLazy(() => import("@/pages/account/PaymentMethods"), "AccountPaymentMethodsPage");
const Contact = safeLazy(() => import("@/pages/Contact"));
const About = safeLazy(() => import("@/pages/About"));
const NewArrivals = safeLazy(() => import("@/pages/NewArrivals"));
const ProductsListing = safeLazy(() => import("@/pages/ProductsListing"), "ProductsListing");
const ShopByBudget = safeLazy(() => import("@/pages/ShopByBudget"));
const BridalCollection = safeLazy(() => import("@/pages/BridalCollection"));
const PartyWear = safeLazy(() => import("@/pages/PartyWear"));
const Festival = safeLazy(() => import("@/pages/Festival"));
const FAQs = safeLazy(() => import("@/pages/FAQs"));
const ShippingInfo = safeLazy(() => import("@/pages/ShippingInfo"));
const SizeGuide = safeLazy(() => import("@/pages/SizeGuide"));
const Returns = safeLazy(() => import("@/pages/Returns"));
const PrivacyPolicy = safeLazy(() => import("@/pages/PrivacyPolicy"));
const TermsOfService = safeLazy(() => import("@/pages/TermsOfService"));
const VendorStore = safeLazy(() => import("@/pages/VendorStore"));
const CustomSignInPage = safeLazy(() => import("@/pages/SignIn"));
const CustomSignUpPage = safeLazy(() => import("@/pages/SignUp"));
const VerifyEmailPage = safeLazy(() => import("@/pages/VerifyEmail"));
const VerifyEmailPendingPage = safeLazy(() => import("@/pages/VerifyEmailPending"));
const ForgotPasswordPage = safeLazy(() => import("@/pages/ForgotPassword"));
const ResetPasswordPage = safeLazy(() => import("@/pages/ResetPassword"));
const GoogleOAuthCallback = safeLazy(() => import("@/pages/GoogleOAuthCallback"));
const MaintenancePage = safeLazy(() => import("@/pages/MaintenancePage"));

// Admin Dashboard Modules (Lazy Loaded Chunk)
const AdminLogin = safeLazy(() => import("@/pages/AdminLogin"));
const Admin2FAVerify = safeLazy(() => import("@/pages/Admin2FAVerify"));
const AdminDashboard = safeLazy(() => import("@/pages/admin/AdminDashboard"));
const AdminVendors = safeLazy(() => import("@/pages/admin/AdminVendors"));
const AdminVendorAnalytics = safeLazy(() => import("@/pages/admin/AdminVendorAnalytics"));
const AdminVendorAnalyticsDetail = safeLazy(() => import("@/pages/admin/AdminVendorAnalyticsDetail"));
const AdminVendorDetail = safeLazy(() => import("@/pages/admin/AdminVendorDetail"));
const AdminOrders = safeLazy(() => import("@/pages/admin/AdminOrders"));
const AdminReturns = safeLazy(() => import("@/pages/admin/AdminReturns"));
const AdminDisputes = safeLazy(() => import("@/pages/admin/AdminDisputes"));
const AdminCoupons = safeLazy(() => import("@/pages/admin/AdminCoupons"));
const AdminSupport = safeLazy(() => import("@/pages/admin/AdminSupport"));
const AdminNotifications = safeLazy(() => import("@/pages/admin/AdminNotifications"));
const AdminBusinessIntelligence = safeLazy(() => import("@/pages/admin/AdminBusinessIntelligence"));
const AdminFinancialManagement = safeLazy(() => import("@/pages/admin/AdminFinancialManagement"));
const AdminAboutContent = safeLazy(() => import("@/pages/admin/AdminAboutContent"));
const AdminProducts = safeLazy(() => import("@/pages/admin/AdminProducts"));
const AdminReports = safeLazy(() => import("@/pages/admin/AdminReports"));
const AdminSettings = safeLazy(() => import("@/pages/admin/AdminSettings"));
const AdminAdvertisements = safeLazy(() => import("@/pages/admin/AdminAdvertisements"));
const AdminLogs = safeLazy(() => import("@/pages/admin/AdminLogs"));

// Seller Portal Modules (Lazy Loaded Chunk)
const SellerLogin = safeLazy(() => import("@/pages/seller/SellerLogin"));
const SellerRegister = safeLazy(() => import("@/pages/SellerRegister"));
const SellerDashboard = safeLazy(() => import("@/pages/seller/SellerDashboard"));
const SellerProfile = safeLazy(() => import("@/pages/seller/SellerProfile"));
const SellerProducts = safeLazy(() => import("@/pages/seller/SellerProducts"));
const SellerProductNew = safeLazy(() => import("@/pages/seller/SellerProductNew"));
const SellerProductEdit = safeLazy(() => import("@/pages/seller/SellerProductEdit"));
const SellerInventory = safeLazy(() => import("@/pages/seller/SellerInventory"));
const SellerOrders = safeLazy(() => import("@/pages/seller/SellerOrders"));
const SellerOrderDetail = safeLazy(() => import("@/pages/seller/SellerOrderDetail"));
const SellerCustomers = safeLazy(() => import("@/pages/seller/SellerCustomers"));
const SellerNotifications = safeLazy(() => import("@/pages/seller/SellerNotifications"));
const SellerAnalytics = safeLazy(() => import("@/pages/seller/SellerAnalytics"));
const SellerPayouts = safeLazy(() => import("@/pages/seller/SellerPayouts"));
const SellerSettlements = safeLazy(() => import("@/pages/seller/SellerSettlements"));
const SellerSupport = safeLazy(() => import("@/pages/seller/SellerSupport"));
const SellerReturns = safeLazy(() => import("@/pages/seller/SellerReturns"));


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchOnReconnect: true,
      gcTime: 5 * 60_000,
    },
  },
});

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
      <p className="text-xs font-semibold text-[#718096] uppercase tracking-widest">Loading VASTRAA...</p>
    </div>
  );
}

interface PageErrorBoundaryProps {
  children: ReactNode;
}

interface PageErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  public state: PageErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): PageErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Page error caught by PageErrorBoundary:", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      const isDynamicImportError =
        this.state.error?.message?.includes("Failed to fetch dynamically imported module") ||
        this.state.error?.message?.includes("dynamically imported module") ||
        this.state.error?.message?.includes("Importing a module script failed");

      return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-4 border border-amber-200">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="font-serif text-2xl font-bold text-[#0A1F44] mb-2">
            {isDynamicImportError ? "Module Loading Error" : "Something Went Wrong"}
          </h2>
          <p className="text-gray-600 text-sm mb-6 leading-relaxed">
            {isDynamicImportError
              ? "A required page module could not be loaded. This may occur if a deployment or server restart just happened."
              : (this.state.error?.message || "An unexpected error occurred while loading this page.")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={this.handleRetry}
              className="px-5 py-2.5 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white text-xs font-bold uppercase tracking-wider rounded-md transition-colors shadow-sm cursor-pointer"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold uppercase tracking-wider rounded-md transition-colors cursor-pointer"
            >
              Reload Page
            </button>
            <a
              href="/"
              className="px-5 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold uppercase tracking-wider rounded-md transition-colors cursor-pointer"
            >
              Go to Home
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function Router() {
  const [location] = useLocation();
  return (
    <PageErrorBoundary key={location}>
      <Suspense fallback={<PageLoadingFallback />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/products">{() => <ProductsListing />}</Route>
          <Route path="/category/:category">{(params: any) => <ProductsListing category={params?.category} />}</Route>
          <Route path="/sarees">{() => <ProductsListing category="sarees" title="Sarees" subtitle="Centuries of Royal Heritage & Master Artisanal Weaves" />}</Route>
          <Route path="/sarees/:subcategory">{(params: any) => <ProductsListing category="sarees" subcategory={params?.subcategory} title="Sarees" subtitle="Centuries of Royal Heritage & Master Artisanal Weaves" />}</Route>
          <Route path="/kurtis">{() => <ProductsListing category="kurtis" title="Kurtis" subtitle="Everyday Elegance & Contemporary Designer Silhouettes" />}</Route>
          <Route path="/kurtis/:subcategory">{(params: any) => <ProductsListing category="kurtis" subcategory={params?.subcategory} title="Kurtis" subtitle="Everyday Elegance & Contemporary Designer Silhouettes" />}</Route>
          <Route path="/kurta-sets">{() => <ProductsListing category="kurta-sets" title="Kurta Sets" subtitle="Coordinated Ethnic Sets & Festive Ensembles" />}</Route>
          <Route path="/kurta-sets/:subcategory">{(params: any) => <ProductsListing category="kurta-sets" subcategory={params?.subcategory} title="Kurta Sets" subtitle="Coordinated Ethnic Sets & Festive Ensembles" />}</Route>
          <Route path="/ethnic-dresses">{() => <ProductsListing category="ethnic-dresses" title="Ethnic Dresses" subtitle="Timeless Indian Aesthetics with Flowing Modern Gowns" />}</Route>
          <Route path="/ethnic-dresses/:subcategory">{(params: any) => <ProductsListing category="ethnic-dresses" subcategory={params?.subcategory} title="Ethnic Dresses" subtitle="Timeless Indian Aesthetics with Flowing Modern Gowns" />}</Route>
          <Route path="/western-dresses">{() => <ProductsListing category="western-dresses" title="Western Dresses" subtitle="Global Trends & Runway Chic Silhouettes" />}</Route>
          <Route path="/western-dresses/:subcategory">{(params: any) => <ProductsListing category="western-dresses" subcategory={params?.subcategory} title="Western Dresses" subtitle="Global Trends & Runway Chic Silhouettes" />}</Route>
          <Route path="/winter-wear">{() => <ProductsListing category="winter-wear" title="Winter Wear" subtitle="Opulent Warmth & Snug Luxury Ensembles" />}</Route>
          <Route path="/winter-wear/:subcategory">{(params: any) => <ProductsListing category="winter-wear" subcategory={params?.subcategory} title="Winter Wear" subtitle="Opulent Warmth & Snug Luxury Ensembles" />}</Route>
          <Route path="/tops">{() => <ProductsListing category="tops" title="Tops" subtitle="Chic, Contemporary & Everyday Tops for Women and Girls" />}</Route>
          <Route path="/tops/:subcategory">{(params: any) => <ProductsListing category="tops" subcategory={params?.subcategory} title="Tops" subtitle="Chic, Contemporary & Everyday Tops for Women and Girls" />}</Route>
          <Route path="/ladies-tops">{() => <ProductsListing category="tops" title="Tops" subtitle="Chic, Contemporary & Everyday Tops for Women" />}</Route>
          <Route path="/womens-tops">{() => <ProductsListing category="tops" subcategory="womens-tops" title="Women's Tops" subtitle="Chic, Contemporary & Everyday Tops for Women" />}</Route>
          <Route path="/girls-tops">{() => <ProductsListing category="tops" subcategory="girls-tops" title="Girls' Tops" subtitle="Charming, Playful & Everyday Tops for Girls" />}</Route>
          <Route path="/new-arrivals" component={NewArrivals} />
          <Route path="/shop-by-budget" component={ShopByBudget} />
          <Route path="/paithani" component={Paithani} />
          <Route path="/paithani/shop" component={PaithaniShop} />
          <Route path="/designer" component={Designer} />
          <Route path="/designer/shop" component={DesignerShop} />
          <Route path="/gadwal">{() => <ProductsListing category="gadwal" />}</Route>
          <Route path="/banarasi">{() => <ProductsListing category="banarasi" />}</Route>
          <Route path="/kanjivaram">{() => <ProductsListing category="kanjivaram" />}</Route>
          <Route path="/chanderi">{() => <ProductsListing category="chanderi" />}</Route>
          <Route path="/bandhani">{() => <ProductsListing category="bandhani" />}</Route>
          <Route path="/mysore-silk">{() => <ProductsListing category="mysore-silk" />}</Route>
          <Route path="/ikat">{() => <ProductsListing category="ikat" />}</Route>
          <Route path="/cotton">{() => <ProductsListing category="cotton" />}</Route>
          <Route path="/silk">{() => <ProductsListing category="silk" />}</Route>
          <Route path="/other-traditional">{() => <ProductsListing category="other-traditional" />}</Route>
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
          <Route path="/wedding-paithani-main">{() => <ProductsListing category="paithani" subcategory="wedding-paithani-main" title="Weddings Paithani Sarees" subtitle="Royal Maharashtrian Wedding Handlooms" />}</Route>
          <Route path="/western-paithani-main">{() => <ProductsListing category="paithani" subcategory="western-paithani-main" title="Western Paithani Sarees" subtitle="Indo-Western & Contemporary Fusion Drapes" />}</Route>
          <Route path="/bollywood">{() => <ProductsListing category="designer" subcategory="bollywood" title="Bollywood Designer Sarees" subtitle="Celebrity Inspired & Red Carpet Glamour" />}</Route>
          <Route path="/contemporary-silk-main">{() => <ProductsListing category="designer" subcategory="contemporary-silk-main" title="Contemporary Silk Sarees" subtitle="Modern Silk Fusions & Digital Weaves" />}</Route>
          <Route path="/bridal" component={BridalCollection} />
          <Route path="/festival" component={Festival} />
          <Route path="/party" component={PartyWear} />
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
          <Route path="/admin/logs" component={AdminLogs} />
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
          <Route path="/seller/returns" component={() => (
            <SellerGuard><SellerReturns /></SellerGuard>
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
          <Route path="/verify-email" component={VerifyEmailPage} />
          <Route path="/verify-email-pending" component={VerifyEmailPendingPage} />
          <Route path="/verify-email-success" component={() => <VerifyEmailPage />} />
          <Route path="/verify-email-failed" component={() => <VerifyEmailPage />} />
          <Route path="/google-callback" component={GoogleOAuthCallback} />
          <Route path="/unauthorized" component={Unauthorized} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </PageErrorBoundary>
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
                first === "admin-products" ||
                first === "admin-products-stats" ||
                first === "vendor-products" ||
                first === "product"
              )
            );
          },
        });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
        queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
        queryClient.invalidateQueries({ queryKey: ["admin-products"] });
        queryClient.invalidateQueries({ queryKey: ["admin-products-stats"] });
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
