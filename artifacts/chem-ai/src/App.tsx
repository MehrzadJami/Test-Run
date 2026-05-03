import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Layout } from "@/components/layout";

import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import NewExtraction from "@/pages/new-extraction";
import ModelCardsIndex from "@/pages/model-cards";
import ModelCardDetail from "@/pages/model-card-detail";
import Simulation from "@/pages/simulation";
import ExperimentalData from "@/pages/experimental-data";
import Exports from "@/pages/exports";
import ShareModelCard from "@/pages/share-model-card";
import FeatureDisabled from "@/pages/feature-disabled";
import { features } from "@/lib/features";

const queryClient = new QueryClient();

function AppRouter() {
  return (
    <Switch>
      {/* Public share route — no sidebar */}
      <Route path="/share/model-cards/:id" component={ShareModelCard} />
      {/* All other routes get the full sidebar layout */}
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/new" component={NewExtraction} />
            <Route path="/model-cards" component={ModelCardsIndex} />
            <Route path="/model-cards/:id" component={ModelCardDetail} />
            <Route path="/simulation" component={Simulation} />
            <Route
              path="/experimental-data"
              component={() =>
                features.experimentalFitting ? (
                  <ExperimentalData />
                ) : (
                  <FeatureDisabled name="Experimental Data Fitting" />
                )
              }
            />
            <Route path="/exports" component={Exports} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="chemai-theme">
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRouter />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
