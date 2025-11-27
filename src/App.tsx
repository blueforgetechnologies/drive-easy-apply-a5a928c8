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
import VehicleDetail from "./pages/VehicleDetail";
import LoadDetail from "./pages/LoadDetail";
import DashboardLayout from "./components/DashboardLayout";
import UsersTab from "./pages/UsersTab";
import DispatcherDetail from "./pages/DispatcherDetail";
import LoadsTab from "./pages/LoadsTab";
import SettlementDetail from "./pages/SettlementDetail";
import InvoiceDetail from "./pages/InvoiceDetail";
import LocationsTab from "./pages/LocationsTab";
import LocationDetail from "./pages/LocationDetail";
import CompanyProfileTab from "./pages/CompanyProfileTab";
import MaintenanceTab from "./pages/MaintenanceTab";
import MapTab from "./pages/MapTab";
import AccountingTab from "./pages/AccountingTab";
import BusinessManagerTab from "./pages/BusinessManagerTab";

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
          <Route path="/dashboard" element={<Navigate to="/dashboard/business?subtab=assets" replace />} />
          <Route path="/dashboard/business" element={<DashboardLayout><BusinessManagerTab /></DashboardLayout>} />
          <Route path="/dashboard/users" element={<DashboardLayout><UsersTab /></DashboardLayout>} />
          <Route path="/dashboard/dispatchers/:id" element={<DashboardLayout><DispatcherDetail /></DashboardLayout>} />
          <Route path="/dashboard/loads" element={<DashboardLayout><LoadsTab /></DashboardLayout>} />
          <Route path="/dashboard/accounting" element={<DashboardLayout><AccountingTab /></DashboardLayout>} />
          <Route path="/dashboard/locations" element={<DashboardLayout><LocationsTab /></DashboardLayout>} />
          <Route path="/dashboard/locations/:id" element={<DashboardLayout><LocationDetail /></DashboardLayout>} />
          <Route path="/dashboard/maintenance" element={<DashboardLayout><MaintenanceTab /></DashboardLayout>} />
          <Route path="/dashboard/company-profile" element={<DashboardLayout><CompanyProfileTab /></DashboardLayout>} />
          <Route path="/dashboard/map" element={<DashboardLayout><MapTab /></DashboardLayout>} />
          <Route path="/dashboard/map" element={<DashboardLayout><MapTab /></DashboardLayout>} />
          <Route path="/dashboard/application/:id" element={<ApplicationDetail />} />
          <Route path="/dashboard/vehicle/:id" element={<VehicleDetail />} />
          <Route path="/dashboard/load/:id" element={<LoadDetail />} />
          <Route path="/dashboard/settlement/:id" element={<SettlementDetail />} />
          <Route path="/dashboard/invoice/:id" element={<InvoiceDetail />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
