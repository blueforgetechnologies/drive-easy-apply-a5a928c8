import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Install from "./pages/Install";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ApplicationDetail from "./pages/ApplicationDetail";
import DashboardLayout from "./components/DashboardLayout";
import DriversTab from "./pages/DriversTab";
import UsersTab from "./pages/UsersTab";
import PlaceholderTab from "./pages/PlaceholderTab";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/install" element={<Install />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<Navigate to="/dashboard/drivers?filter=active" replace />} />
          <Route path="/dashboard/drivers" element={<DashboardLayout><DriversTab /></DashboardLayout>} />
          <Route path="/dashboard/users" element={<DashboardLayout><UsersTab /></DashboardLayout>} />
          <Route path="/dashboard/vehicles" element={<DashboardLayout><PlaceholderTab title="Vehicles" description="Manage your fleet of vehicles" /></DashboardLayout>} />
          <Route path="/dashboard/dispatchers" element={<DashboardLayout><PlaceholderTab title="Dispatchers" description="Manage dispatch operations" /></DashboardLayout>} />
          <Route path="/dashboard/loads" element={<DashboardLayout><PlaceholderTab title="Loads" description="Track and manage loads" /></DashboardLayout>} />
          <Route path="/dashboard/application/:id" element={<ApplicationDetail />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
