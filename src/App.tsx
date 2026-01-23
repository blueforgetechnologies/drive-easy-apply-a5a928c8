import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TenantProvider } from "@/contexts/TenantContext";
import { ImpersonationProvider } from "@/contexts/ImpersonationContext";
import DashboardLayout from "./components/DashboardLayout";
import PageLoader from "./components/PageLoader";

// ============================================
// EAGER IMPORTS - Small, critical path pages
// ============================================
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// ============================================
// LAZY IMPORTS - Heavy dashboard pages
// Loaded on-demand to reduce initial bundle size
// ============================================

// Public routes (less critical)
const Apply = lazy(() => import("./pages/Apply"));
const Install = lazy(() => import("./pages/Install"));
const InstallApp = lazy(() => import("./pages/InstallApp"));

// Heavy map/analytics pages (biggest wins)
const MapTab = lazy(() => import("./pages/MapTab"));
const LoadHunterTab = lazy(() => import("./pages/LoadHunterTab"));
const LoadAnalyticsTab = lazy(() => import("./pages/LoadAnalyticsTab"));
const FleetFinancialsTab = lazy(() => import("./pages/FleetFinancialsTab"));

// Core dashboard pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const BusinessManagerTab = lazy(() => import("./pages/BusinessManagerTab"));
const LoadsTab = lazy(() => import("./pages/LoadsTab"));
const LoadApprovalTab = lazy(() => import("./pages/LoadApprovalTab"));
const AccountingTab = lazy(() => import("./pages/AccountingTab"));
const MaintenanceTab = lazy(() => import("./pages/MaintenanceTab"));
const SettingsTab = lazy(() => import("./pages/SettingsTab"));
const UsageTab = lazy(() => import("./pages/UsageTab"));

// Detail pages
const ApplicationDetail = lazy(() => import("./pages/ApplicationDetail"));
const VehicleDetail = lazy(() => import("./pages/VehicleDetail"));
const LoadDetail = lazy(() => import("./pages/LoadDetail"));
const DispatcherDetail = lazy(() => import("./pages/DispatcherDetail"));
const DispatcherDashboard = lazy(() => import("./pages/DispatcherDashboard"));
const CarrierDashboard = lazy(() => import("./pages/CarrierDashboard"));
const SettlementDetail = lazy(() => import("./pages/SettlementDetail"));
const InvoiceDetail = lazy(() => import("./pages/InvoiceDetail"));
const LocationDetail = lazy(() => import("./pages/LocationDetail"));
const CarrierDetail = lazy(() => import("./pages/CarrierDetail"));
const CustomerDetail = lazy(() => import("./pages/CustomerDetail"));
const UserDetail = lazy(() => import("./pages/UserDetail"));
const AuditDetail = lazy(() => import("./pages/AuditDetail"));

// Admin/Development pages
const DevelopmentTab = lazy(() => import("./pages/DevelopmentTab"));
const FlowDiagramTab = lazy(() => import("./pages/FlowDiagramTab"));
const RolloutsTab = lazy(() => import("./pages/RolloutsTab"));
const DuplicateCustomersTab = lazy(() => import("./pages/DuplicateCustomersTab"));
const ScreenshareTab = lazy(() => import("./pages/ScreenshareTab"));
const FreightCalculatorTab = lazy(() => import("./pages/FreightCalculatorTab"));
const SystemPromptExport = lazy(() => import("./pages/SystemPromptExport"));
const ToolsTab = lazy(() => import("./pages/ToolsTab"));
const PlatformAdminTab = lazy(() => import("./pages/PlatformAdminTab"));
const TenantSettingsPage = lazy(() => import("./pages/TenantSettingsPage"));
const EmailBrandingTab = lazy(() => import("./pages/EmailBrandingTab"));
const Inspector = lazy(() => import("./pages/Inspector"));
const DebugTenantDataTab = lazy(() => import("./pages/DebugTenantDataTab"));
const TenantVerificationTab = lazy(() => import("./pages/TenantVerificationTab"));
const IsolationAuditTab = lazy(() => import("./pages/IsolationAuditTab"));
const TenantIsolationTestsTab = lazy(() => import("./pages/TenantIsolationTestsTab"));
const CustomerOnboardingTab = lazy(() => import("./pages/CustomerOnboardingTab"));

const queryClient = new QueryClient();

/**
 * LazyRoute - Wraps lazy-loaded components with Suspense and DashboardLayout
 * The PageLoader spinner appears inside the DashboardLayout content area
 */
const LazyRoute = ({ children }: { children: React.ReactNode }) => (
  <DashboardLayout>
    <Suspense fallback={<PageLoader />}>
      {children}
    </Suspense>
  </DashboardLayout>
);

/**
 * LazyPublicRoute - For public pages outside DashboardLayout
 */
const LazyPublicRoute = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<PageLoader />}>
    {children}
  </Suspense>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TenantProvider>
      <ImpersonationProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner position="bottom-left" />
          <BrowserRouter>
            <Routes>
              {/* ============================================ */}
              {/* PUBLIC ROUTES - Eager loaded for fast LCP   */}
              {/* ============================================ */}
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              
              {/* Public routes - lazy loaded */}
              <Route path="/apply" element={<LazyPublicRoute><Apply /></LazyPublicRoute>} />
              <Route path="/install" element={<LazyPublicRoute><Install /></LazyPublicRoute>} />
              <Route path="/install-app" element={<LazyPublicRoute><InstallApp /></LazyPublicRoute>} />
              <Route path="/inspector" element={<LazyPublicRoute><Inspector /></LazyPublicRoute>} />
              <Route path="/system-prompt" element={<LazyPublicRoute><SystemPromptExport /></LazyPublicRoute>} />
              
              {/* ============================================ */}
              {/* DASHBOARD ROUTES - All lazy loaded          */}
              {/* ============================================ */}
              <Route path="/dashboard" element={<Navigate to="/dashboard/business" replace />} />
              
              {/* Heavy pages (biggest bundle impact) */}
              <Route path="/dashboard/map" element={<LazyRoute><MapTab /></LazyRoute>} />
              <Route path="/dashboard/load-hunter" element={<LazyRoute><LoadHunterTab /></LazyRoute>} />
              <Route path="/dashboard/analytics" element={<LazyRoute><LoadAnalyticsTab /></LazyRoute>} />
              <Route path="/dashboard/fleet-financials" element={<LazyRoute><FleetFinancialsTab /></LazyRoute>} />
              
              {/* Core dashboard pages */}
              <Route path="/dashboard/business" element={<LazyRoute><BusinessManagerTab /></LazyRoute>} />
              <Route path="/dashboard/loads" element={<LazyRoute><LoadsTab /></LazyRoute>} />
              <Route path="/dashboard/load-approval" element={<LazyRoute><LoadApprovalTab /></LazyRoute>} />
              <Route path="/dashboard/accounting" element={<LazyRoute><AccountingTab /></LazyRoute>} />
              <Route path="/dashboard/maintenance" element={<LazyRoute><MaintenanceTab /></LazyRoute>} />
              <Route path="/dashboard/settings" element={<LazyRoute><SettingsTab /></LazyRoute>} />
              <Route path="/dashboard/usage" element={<LazyRoute><UsageTab /></LazyRoute>} />
              <Route path="/dashboard/my-dashboard" element={<LazyRoute><DispatcherDashboard /></LazyRoute>} />
              <Route path="/dashboard/carrier-dashboard" element={<LazyRoute><CarrierDashboard /></LazyRoute>} />
              
              {/* Detail pages */}
              <Route path="/dashboard/dispatchers/:id" element={<LazyRoute><DispatcherDetail /></LazyRoute>} />
              <Route path="/dashboard/locations/:id" element={<LazyRoute><LocationDetail /></LazyRoute>} />
              <Route path="/dashboard/user/:id" element={<LazyRoute><UserDetail /></LazyRoute>} />
              <Route path="/dashboard/application/:id" element={<LazyRoute><ApplicationDetail /></LazyRoute>} />
              <Route path="/dashboard/vehicle/:id" element={<LazyRoute><VehicleDetail /></LazyRoute>} />
              <Route path="/dashboard/load/:id" element={<LazyRoute><LoadDetail /></LazyRoute>} />
              <Route path="/dashboard/settlement/:id" element={<LazyRoute><SettlementDetail /></LazyRoute>} />
              <Route path="/dashboard/invoice/:id" element={<LazyRoute><InvoiceDetail /></LazyRoute>} />
              <Route path="/dashboard/carrier/:id" element={<LazyRoute><CarrierDetail /></LazyRoute>} />
              <Route path="/dashboard/customer/:id" element={<LazyRoute><CustomerDetail /></LazyRoute>} />
              <Route path="/dashboard/accounting/audit/:id" element={<LazyRoute><AuditDetail /></LazyRoute>} />
              
              {/* Admin/Development pages */}
              <Route path="/dashboard/screenshare" element={<LazyRoute><ScreenshareTab /></LazyRoute>} />
              <Route path="/dashboard/tools" element={<LazyRoute><ToolsTab /></LazyRoute>} />
              <Route path="/dashboard/development" element={<LazyRoute><DevelopmentTab /></LazyRoute>} />
              <Route path="/dashboard/flow" element={<LazyRoute><FlowDiagramTab /></LazyRoute>} />
              <Route path="/dashboard/rollouts" element={<LazyRoute><RolloutsTab /></LazyRoute>} />
              <Route path="/dashboard/duplicate-customers" element={<LazyRoute><DuplicateCustomersTab /></LazyRoute>} />
              <Route path="/dashboard/platform-admin" element={<LazyRoute><PlatformAdminTab /></LazyRoute>} />
              <Route path="/dashboard/tenant/:tenantId/settings" element={<LazyRoute><TenantSettingsPage /></LazyRoute>} />
              <Route path="/dashboard/email-branding" element={<LazyRoute><EmailBrandingTab /></LazyRoute>} />
              <Route path="/dashboard/inspector" element={<LazyRoute><Inspector /></LazyRoute>} />
              
              {/* Debug pages */}
              <Route path="/dashboard/debug/tenant-data" element={<LazyRoute><DebugTenantDataTab /></LazyRoute>} />
              <Route path="/dashboard/debug/tenant-verification" element={<LazyRoute><TenantVerificationTab /></LazyRoute>} />
              <Route path="/dashboard/debug/isolation-audit" element={<LazyRoute><IsolationAuditTab /></LazyRoute>} />
              <Route path="/dashboard/debug/tenant-isolation-tests" element={<LazyRoute><TenantIsolationTestsTab /></LazyRoute>} />
              <Route path="/dashboard/admin/customers" element={<LazyRoute><CustomerOnboardingTab /></LazyRoute>} />
              
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
