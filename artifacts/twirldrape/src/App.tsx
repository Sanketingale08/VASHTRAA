import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Paithani from "@/pages/Paithani";
import Designer from "@/pages/Designer";
import PaithaniShop from "@/pages/PaithaniShop";
import DesignerShop from "@/pages/DesignerShop";
import ProductDetail from "@/pages/ProductDetail";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/paithani" component={Paithani} />
      <Route path="/paithani/shop" component={PaithaniShop} />
      <Route path="/designer" component={Designer} />
      <Route path="/designer/shop" component={DesignerShop} />
      <Route path="/products/:id" component={ProductDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
