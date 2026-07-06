import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Paithani from "@/pages/Paithani";
import Designer from "@/pages/Designer";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/">{() => <Redirect to="/paithani" />}</Route>
      <Route path="/paithani" component={Paithani} />
      <Route path="/designer" component={Designer} />
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
