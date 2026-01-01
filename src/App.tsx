import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TenantProvider } from "@/contexts/TenantContext";
import { ImpersonationProvider } from "@/contexts/ImpersonationContext";
import Index from "./pages/Index";
import Apply from "./pages/Apply";
import Install from "./pages/Install";
import InstallApp from "./pages/InstallApp";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ApplicationDetail from "./pages/ApplicationDetail";
import VehicleDetail from "./pages/VehicleDetail";
import LoadDetail from "./pages/LoadDetail";
import DashboardLayout from "./components/DashboardLayout";
import DispatcherDetail from "./pages/DispatcherDetail";
import DispatcherDashboard from "./pages/DispatcherDashboard";
import CarrierDashboard from "./pages/CarrierDashboard";
import LoadsTab from "./pages/LoadsTab";
import SettlementDetail from "./pages/SettlementDetail";
import InvoiceDetail from "./pages/InvoiceDetail";
import LocationDetail from "./pages/LocationDetail";
import MaintenanceTab from "./pages/MaintenanceTab";
import MapTab from "./pages/MapTab";
import AccountingTab from "./pages/AccountingTab";
import BusinessManagerTab from "./pages/BusinessManagerTab";
import SettingsTab from "./pages/SettingsTab";
import CarrierDetail from "./pages/CarrierDetail";
import CustomerDetail from "./pages/CustomerDetail";
import LoadHunterTab from "./pages/LoadHunterTab";
import DevelopmentTab from "./pages/DevelopmentTab";
import FlowDiagramTab from "./pages/FlowDiagramTab";
import UsageTab from "./pages/UsageTab";
import FleetFinancialsTab from "./pages/FleetFinancialsTab";
import LoadApprovalTab from "./pages/LoadApprovalTab";
import RolloutsTab from "./pages/RolloutsTab";

import DuplicateCustomersTab from "./pages/DuplicateCustomersTab";

import ScreenshareTab from "./pages/ScreenshareTab";
import FreightCalculatorTab from "./pages/FreightCalculatorTab";
import LoadAnalyticsTab from "./pages/LoadAnalyticsTab";
import SystemPromptExport from "./pages/SystemPromptExport";
import UserDetail from "./pages/UserDetail";
import ToolsTab from "./pages/ToolsTab";
import AuditDetail from "./pages/AuditDetail";
import PlatformAdminTab from "./pages/PlatformAdminTab";
import Inspector from "./pages/Inspector";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TenantProvider>
      <ImpersonationProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner position="bottom-left" />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/apply" element={<Apply />} />
              <Route path="/install" element={<Install />} />
              <Route path="/install-app" element={<InstallApp />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/inspector" element={<Inspector />} />
              <Route path="/dashboard" element={<Navigate to="/dashboard/business" replace />} />
              <Route path="/dashboard/map" element={<DashboardLayout><MapTab /></DashboardLayout>} />
              <Route path="/dashboard/load-hunter" element={<DashboardLayout><LoadHunterTab /></DashboardLayout>} />
              <Route path="/dashboard/business" element={<DashboardLayout><BusinessManagerTab /></DashboardLayout>} />
              <Route path="/dashboard/dispatchers/:id" element={<DashboardLayout><DispatcherDetail /></DashboardLayout>} />
              <Route path="/dashboard/my-dashboard" element={<DashboardLayout><DispatcherDashboard /></DashboardLayout>} />
              <Route path="/dashboard/carrier-dashboard" element={<DashboardLayout><CarrierDashboard /></DashboardLayout>} />
              <Route path="/dashboard/loads" element={<DashboardLayout><LoadsTab /></DashboardLayout>} />
              <Route path="/dashboard/load-approval" element={<DashboardLayout><LoadApprovalTab /></DashboardLayout>} />
              <Route path="/dashboard/accounting" element={<DashboardLayout><AccountingTab /></DashboardLayout>} />
              <Route path="/dashboard/accounting/audit/:id" element={<DashboardLayout><AuditDetail /></DashboardLayout>} />
              <Route path="/dashboard/locations/:id" element={<DashboardLayout><LocationDetail /></DashboardLayout>} />
              <Route path="/dashboard/maintenance" element={<DashboardLayout><MaintenanceTab /></DashboardLayout>} />
              <Route path="/dashboard/settings" element={<DashboardLayout><SettingsTab /></DashboardLayout>} />
              <Route path="/dashboard/user/:id" element={<DashboardLayout><UserDetail /></DashboardLayout>} />
              <Route path="/dashboard/screenshare" element={<DashboardLayout><ScreenshareTab /></DashboardLayout>} />
              <Route path="/dashboard/tools" element={<DashboardLayout><ToolsTab /></DashboardLayout>} />
              <Route path="/dashboard/analytics" element={<DashboardLayout><LoadAnalyticsTab /></DashboardLayout>} />
              <Route path="/dashboard/development" element={<DashboardLayout><DevelopmentTab /></DashboardLayout>} />
              <Route path="/dashboard/usage" element={<DashboardLayout><UsageTab /></DashboardLayout>} />
              <Route path="/dashboard/fleet-financials" element={<DashboardLayout><FleetFinancialsTab /></DashboardLayout>} />
              <Route path="/dashboard/flow" element={<DashboardLayout><FlowDiagramTab /></DashboardLayout>} />
              <Route path="/dashboard/rollouts" element={<DashboardLayout><RolloutsTab /></DashboardLayout>} />
              <Route path="/dashboard/application/:id" element={<DashboardLayout><ApplicationDetail /></DashboardLayout>} />
              <Route path="/dashboard/vehicle/:id" element={<DashboardLayout><VehicleDetail /></DashboardLayout>} />
              <Route path="/dashboard/load/:id" element={<DashboardLayout><LoadDetail /></DashboardLayout>} />
              <Route path="/dashboard/settlement/:id" element={<DashboardLayout><SettlementDetail /></DashboardLayout>} />
              <Route path="/dashboard/invoice/:id" element={<DashboardLayout><InvoiceDetail /></DashboardLayout>} />
              <Route path="/dashboard/carrier/:id" element={<DashboardLayout><CarrierDetail /></DashboardLayout>} />
              <Route path="/dashboard/customer/:id" element={<DashboardLayout><CustomerDetail /></DashboardLayout>} />
              <Route path="/dashboard/duplicate-customers" element={<DashboardLayout><DuplicateCustomersTab /></DashboardLayout>} />
              <Route path="/dashboard/platform-admin" element={<DashboardLayout><PlatformAdminTab /></DashboardLayout>} />
              <Route path="/dashboard/inspector" element={<DashboardLayout><Inspector /></DashboardLayout>} />
              <Route path="/system-prompt" element={<SystemPromptExport />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ImpersonationProvider>
    </TenantProvider>
  </QueryClientProvider>
);

export default App;
