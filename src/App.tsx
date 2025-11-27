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
import DriversTab from "./pages/DriversTab";
import UsersTab from "./pages/UsersTab";
import VehiclesTab from "./pages/VehiclesTab";
import DispatchersTab from "./pages/DispatchersTab";
import DispatcherDetail from "./pages/DispatcherDetail";
import LoadsTab from "./pages/LoadsTab";
import CarriersTab from "./pages/CarriersTab";
import PayeesTab from "./pages/PayeesTab";
import SettlementsTab from "./pages/SettlementsTab";
import SettlementDetail from "./pages/SettlementDetail";
import CustomersTab from "./pages/CustomersTab";
import InvoicesTab from "./pages/InvoicesTab";
import InvoiceDetail from "./pages/InvoiceDetail";
import LocationsTab from "./pages/LocationsTab";
import LocationDetail from "./pages/LocationDetail";
import CompanyProfileTab from "./pages/CompanyProfileTab";
import AuditLogsTab from "./pages/AuditLogsTab";
import MaintenanceTab from "./pages/MaintenanceTab";

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
          <Route path="/dashboard/vehicles" element={<DashboardLayout><VehiclesTab /></DashboardLayout>} />
          <Route path="/dashboard/dispatchers" element={<DashboardLayout><DispatchersTab /></DashboardLayout>} />
          <Route path="/dashboard/dispatchers/:id" element={<DashboardLayout><DispatcherDetail /></DashboardLayout>} />
          <Route path="/dashboard/loads" element={<DashboardLayout><LoadsTab /></DashboardLayout>} />
          <Route path="/dashboard/carriers" element={<DashboardLayout><CarriersTab /></DashboardLayout>} />
          <Route path="/dashboard/payees" element={<DashboardLayout><PayeesTab /></DashboardLayout>} />
          <Route path="/dashboard/settlements" element={<DashboardLayout><SettlementsTab /></DashboardLayout>} />
          <Route path="/dashboard/customers" element={<DashboardLayout><CustomersTab /></DashboardLayout>} />
          <Route path="/dashboard/invoices" element={<DashboardLayout><InvoicesTab /></DashboardLayout>} />
          <Route path="/dashboard/locations" element={<DashboardLayout><LocationsTab /></DashboardLayout>} />
          <Route path="/dashboard/locations/:id" element={<DashboardLayout><LocationDetail /></DashboardLayout>} />
          <Route path="/dashboard/maintenance" element={<DashboardLayout><MaintenanceTab /></DashboardLayout>} />
          <Route path="/dashboard/audit-logs" element={<DashboardLayout><AuditLogsTab /></DashboardLayout>} />
          <Route path="/dashboard/company-profile" element={<DashboardLayout><CompanyProfileTab /></DashboardLayout>} />
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
