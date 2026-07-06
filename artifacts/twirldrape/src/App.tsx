import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useClerk } from "@clerk/react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WishlistProvider } from "@/context/WishlistContext";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Collections from "@/pages/Collections";
import Paithani from "@/pages/Paithani";
import Designer from "@/pages/Designer";
import PaithaniShop from "@/pages/PaithaniShop";
import DesignerShop from "@/pages/DesignerShop";
import ProductDetail from "@/pages/ProductDetail";
import Wishlist from "@/pages/Wishlist";

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
    colorPrimary: "#7B1C2C",
    colorForeground: "#3D1A1A",
    colorMutedForeground: "#7a5f4e",
    colorDanger: "#c0392b",
    colorBackground: "#FAF6EE",
    colorInput: "#F5EDE0",
    colorInputForeground: "#3D1A1A",
    colorNeutral: "#C9A84C",
    fontFamily: "'DM Sans', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#FAF6EE] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl border border-[#C9A84C]/30",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#7B1C2C] font-serif text-2xl",
    headerSubtitle: "text-[#7a5f4e]",
    socialButtonsBlockButtonText: "text-[#3D1A1A]",
    formFieldLabel: "text-[#3D1A1A] font-medium",
    footerActionLink: "text-[#7B1C2C] font-semibold hover:text-[#C9A84C]",
    footerActionText: "text-[#7a5f4e]",
    dividerText: "text-[#7a5f4e]",
    identityPreviewEditButton: "text-[#7B1C2C]",
    formFieldSuccessText: "text-green-700",
    alertText: "text-[#3D1A1A]",
    logoBox: "flex justify-center py-2",
    logoImage: "h-10",
    socialButtonsBlockButton: "border border-[#C9A84C]/40 hover:border-[#C9A84C] bg-white",
    formButtonPrimary: "bg-[#7B1C2C] hover:bg-[#5e1421] text-[#FAF6EE]",
    formFieldInput: "bg-[#F5EDE0] border-[#C9A84C]/40 text-[#3D1A1A]",
    footerAction: "bg-[#F5EDE0] border-t border-[#C9A84C]/20",
    dividerLine: "bg-[#C9A84C]/30",
    alert: "bg-[#F5EDE0] border border-[#C9A84C]/30",
    otpCodeFieldInput: "bg-[#F5EDE0] border-[#C9A84C]/40 text-[#3D1A1A]",
    formFieldRow: "",
    main: "",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAF6EE] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-sm tracking-[0.2em] uppercase text-[#7a5f4e]">Welcome back</p>
        </div>
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={`${basePath}/sign-up`}
          forceRedirectUrl={`${basePath}/`}
        />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAF6EE] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-sm tracking-[0.2em] uppercase text-[#7a5f4e]">Join TwirlDrape</p>
        </div>
        <SignUp
          routing="path"
          path={`${basePath}/sign-up`}
          signInUrl={`${basePath}/sign-in`}
          forceRedirectUrl={`${basePath}/`}
        />
      </div>
    </div>
  );
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
      <Route path="/paithani" component={Paithani} />
      <Route path="/paithani/shop" component={PaithaniShop} />
      <Route path="/designer" component={Designer} />
      <Route path="/designer/shop" component={DesignerShop} />
      <Route path="/products/:id" component={ProductDetail} />
      <Route path="/wishlist" component={Wishlist} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route component={NotFound} />
    </Switch>
  );
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
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <WishlistProvider>
            <Router />
            <Toaster />
          </WishlistProvider>
        </TooltipProvider>
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
