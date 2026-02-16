import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Package, Briefcase, Wrench, Settings, Map, Calculator, Target, Menu, FileCode, LogOut, MonitorUp, Ruler, TrendingUp, User, ChevronDown, CircleUser, Eye, LayoutDashboard, DollarSign, Wallet, ShieldCheck, Shield, Building2, Rocket } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { MapboxUsageAlert } from "./MapboxUsageAlert";
import { TenantSwitcher } from "./TenantSwitcher";
import { NoRoleAssignedBanner } from "./NoRoleAssignedBanner";

import { TenantRequired } from "./TenantRequired";
import { prefetchMapboxToken } from "./LoadRouteMap";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { ImpersonateTenantDialog } from "./ImpersonateTenantDialog";
import { TenantDebugBanner } from "./TenantDebugBanner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTenantContext } from "@/contexts/TenantContext";
import { useTenantAlertCounts } from "@/hooks/useTenantAlertCounts";
import { useIntegrationsAlertsCount } from "@/hooks/useIntegrationsAlertsCount";
import { useFeatureGates } from "@/hooks/useFeatureGates";
import { useUserPermissions, PERMISSION_CODES } from "@/hooks/useUserPermissions";
import { useRealtimeCounts } from "@/hooks/useRealtimeCounts";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [userName, setUserName] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>("drivers");
  // Use tenant-scoped alert counts hooks
  const { totalBusinessAlerts: alertCount } = useTenantAlertCounts();
  const { totalAlerts: integrationAlertCount } = useIntegrationsAlertsCount();
  const [unmappedTypesCount, setUnmappedTypesCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showAllTab, setShowAllTab] = useState<boolean>(() => {
    return localStorage.getItem('showAllTab') === 'true';
  });
  const [dispatcherId, setDispatcherId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [impersonateDialogOpen, setImpersonateDialogOpen] = useState(false);
  const { isPlatformAdmin, isImpersonating, effectiveTenant, loading: tenantLoading } = useTenantContext();
  
  // Load user's permissions from custom roles - STRICT enforcement
  const { 
    hasPermission, 
    isLoading: permissionsLoading, 
    hasCustomRole
  } = useUserPermissions();
  
  // Batched feature gates - single set of queries for ALL feature flags
  const GATE_KEYS = useMemo(() => [
    "analytics", "accounting_module", "fleet_financials", "carrier_dashboard",
    "maintenance_module", "map_view", "load_hunter_enabled", "development_tools",
    "operations_module",
  ], []);
  const { isEnabledForTenant: isFeatureEnabled, isLoading: gatesLoading } = useFeatureGates(GATE_KEYS);

  // Enable global realtime count updates - this subscribes to all relevant tables
  // and automatically invalidates React Query caches when data changes
  useRealtimeCounts({ enabled: authReady });

  // Compute visibility: BOTH tenant feature flag AND user permission required
  // Platform admins bypass permission checks
  // Users without custom roles see NOTHING
  const canAccessFeature = (featureEnabled: boolean, permissionCode: string): boolean => {
    if (isPlatformAdmin) return featureEnabled; // Platform admins only need feature enabled
    if (!hasCustomRole) return false; // No custom role = no access
    return featureEnabled && hasPermission(permissionCode);
  };

  // All gates resolve together now - no more staggered loading
  const allGatesReady = !gatesLoading && !permissionsLoading;

  // Analytics: tenant feature enabled + user has tab_analytics permission
  const showAnalytics = allGatesReady && 
    isFeatureEnabled("analytics") && 
    hasPermission(PERMISSION_CODES.TAB_ANALYTICS);
  const showAccounting = allGatesReady && 
    canAccessFeature(isFeatureEnabled("accounting_module"), PERMISSION_CODES.TAB_ACCOUNTING);
  const showFleetFinancials = allGatesReady && 
    canAccessFeature(isFeatureEnabled("fleet_financials"), PERMISSION_CODES.TAB_FLEET_FINANCIALS);
  const showCarrierDashboard = allGatesReady && 
    canAccessFeature(isFeatureEnabled("carrier_dashboard"), PERMISSION_CODES.TAB_CARRIER_DASHBOARD);
  const showMaintenance = allGatesReady && 
    canAccessFeature(isFeatureEnabled("maintenance_module"), PERMISSION_CODES.TAB_MAINTENANCE);
  const showMap = allGatesReady && 
    canAccessFeature(isFeatureEnabled("map_view"), PERMISSION_CODES.TAB_MAP);
  const showLoadHunter = allGatesReady && 
    canAccessFeature(isFeatureEnabled("load_hunter_enabled"), PERMISSION_CODES.TAB_LOAD_HUNTER);
  const showDevelopment = allGatesReady && 
    canAccessFeature(isFeatureEnabled("development_tools"), PERMISSION_CODES.TAB_DEVELOPMENT);
  const showOperations = allGatesReady && 
    canAccessFeature(isFeatureEnabled("operations_module"), PERMISSION_CODES.TAB_BUSINESS);
  // Loads tab - core feature, but still requires permission
  const showLoads = !permissionsLoading && (isPlatformAdmin || hasPermission(PERMISSION_CODES.TAB_LOADS));
  // Settings tab - check permission
  const showSettings = !permissionsLoading && (isPlatformAdmin || hasPermission("tab_settings"));
  // Tools tab - check permission
  const showTools = !permissionsLoading && (isPlatformAdmin || hasPermission("tab_tools"));

  const isInspectorOrPlatformAdminRoute =
    location.pathname.includes('/platform-admin') || location.pathname.includes('/inspector');

  // Debug: log gate + permission resolution
  useEffect(() => {
    if (allGatesReady) {
      console.log("[DashboardLayout] Access resolved:", {
        hasCustomRole,
        isPlatformAdmin,
        analytics: showAnalytics,
        accounting: showAccounting,
        fleetFinancials: showFleetFinancials,
        carrierDashboard: showCarrierDashboard,
        maintenance: showMaintenance,
        map: showMap,
        loadHunter: showLoadHunter,
        development: showDevelopment,
        operations: showOperations,
        loads: showLoads,
        tenantName: effectiveTenant?.name,
      });
    }
  }, [
    allGatesReady,
    permissionsLoading,
    hasCustomRole,
    showAnalytics,
    showAccounting,
    showFleetFinancials,
    effectiveTenant?.name,
  ]);

  // Keep UI in sync with auth state (fixes "logged in but UI not updating")
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setAuthUserId(session?.user?.id ?? null);
      setAuthReady(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUserId(session?.user?.id ?? null);
      setAuthReady(true);
    });
    
    // Prefetch mapbox token early for faster map loading
    prefetchMapboxToken();

    return () => subscription.unsubscribe();
  }, []);

  // If user is signed out, bounce to /auth
  useEffect(() => {
    if (!authReady) return;
    if (!authUserId) {
      setUserName("");
      setUserEmail("");
      setUserRoles([]);
      setDispatcherId(null);
      navigate("/auth", { replace: true });
    }
  }, [authReady, authUserId, navigate]);

  useEffect(() => {
    if (!authReady || !authUserId) return;

    loadUserProfile();
    // Alert counts now handled by tenant-scoped hooks
    loadUnmappedTypesCount();

    // Detect active tab from URL
    const pathParts = location.pathname.split('/');
    const tabFromUrl = pathParts[2]; // /dashboard/[tab]
    const validTabs = ['map', 'load-hunter', 'business', 'loads', 'load-approval', 'accounting', 'maintenance', 'settings', 'screenshare', 'development', 'tools', 'analytics', 'usage', 'fleet-financials', 'carrier-dashboard'];
    if (tabFromUrl && validTabs.includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }

    // Check unmapped types every 5 minutes
    const interval = setInterval(() => {
      loadUnmappedTypesCount();
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, [location.pathname, authReady, authUserId]);

  const loadUserProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setUserName("");
      setUserEmail("");
      setUserRoles([]);
      setDispatcherId(null);
      return;
    }

    setUserEmail(user.email || "");

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    setUserName(profile?.full_name || user.email || "User");

    // Fetch user roles
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    setUserRoles(roles?.map(r => r.role) ?? []);

    // Fetch dispatcher show_all_tab setting
    const { data: dispatcher } = await supabase
      .from("dispatchers")
      .select("id, show_all_tab")
      .eq("user_id", user.id)
      .single();

    if (dispatcher) {
      setDispatcherId(dispatcher.id);
      setShowAllTab(dispatcher.show_all_tab || false);
    } else {
      setDispatcherId(null);
    }
  };

  const toggleShowAllTab = async () => {
    const newValue = !showAllTab;
    
    // Always save to localStorage
    localStorage.setItem('showAllTab', String(newValue));
    setShowAllTab(newValue);
    
    // Dispatch custom event so LoadHunterTab can react immediately
    window.dispatchEvent(new CustomEvent('showAllTabChanged'));
    
    // If dispatcher profile exists, also save to database
    if (dispatcherId) {
      await supabase
        .from("dispatchers")
        .update({ show_all_tab: newValue })
        .eq("id", dispatcherId);
    }
    
    toast.success(newValue ? "All Loads tab enabled" : "All Loads tab disabled");
  };

  // Alert counts are now handled by tenant-scoped hooks

  const loadUnmappedTypesCount = async () => {
    try {
      // First, get all type configs to understand which types are mapped or canonical
      const { data: typeConfigs, error: configError } = await supabase
        .from("sylectus_type_config")
        .select("type_category, original_value, mapped_to");

      if (configError) throw configError;

      // Build sets of mapped types and canonical types
      const mappedTypes = new Set<string>(); // Types that are mapped to something
      const canonicalTypes = new Set<string>(); // Types that have things mapped TO them
      const hiddenTypes = new Set<string>(); // Types hidden (mapped_to = null in config)

      typeConfigs?.forEach((config: any) => {
        const key = `${config.type_category}:${config.original_value}`;
        if (config.mapped_to) {
          mappedTypes.add(key);
          canonicalTypes.add(`${config.type_category}:${config.mapped_to}`);
        } else {
          hiddenTypes.add(key);
        }
      });

      // Get unique types from recent emails
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: emails, error: emailError } = await supabase
        .from("load_emails")
        .select("parsed_data")
        .not("parsed_data", "is", null)
        .gte("received_at", thirtyDaysAgo)
        .limit(5000);

      if (emailError) throw emailError;

      const allVehicleTypes = new Set<string>();
      const allLoadTypes = new Set<string>();

      emails?.forEach((email: any) => {
        const parsed = email.parsed_data;
        if (!parsed) return;
        const vehicleType = (parsed.vehicle_type || parsed.vehicleType) as string | undefined;
        const loadType = (parsed.load_type || parsed.loadType) as string | undefined;
        if (vehicleType?.trim()) allVehicleTypes.add(vehicleType.trim());
        if (loadType?.trim()) allLoadTypes.add(loadType.trim());
      });

      // Count unmapped types: not mapped, not canonical, not hidden
      let unmappedCount = 0;
      allVehicleTypes.forEach(type => {
        const key = `vehicle:${type}`;
        if (!mappedTypes.has(key) && !canonicalTypes.has(key) && !hiddenTypes.has(key)) {
          unmappedCount++;
        }
      });
      allLoadTypes.forEach(type => {
        const key = `load:${type}`;
        if (!mappedTypes.has(key) && !canonicalTypes.has(key) && !hiddenTypes.has(key)) {
          unmappedCount++;
        }
      });

      setUnmappedTypesCount(unmappedCount);
    } catch (error) {
      console.error("Error loading unmapped types count:", error);
    }
  };

  const handleLogout = async () => {
    // Clear any persisted UI/tenant state so it can't affect the next login on this device
    localStorage.removeItem('tms.currentTenantId');
    localStorage.removeItem('showAllTab');
    localStorage.removeItem('tms.adminImpersonationSession');

    await supabase.auth.signOut();
    // Hard redirect to fully reset in-memory state (react-query cache, old permissions, etc.)
    window.location.replace('/auth');
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'accounting') {
      navigate(`/dashboard/${value}?subtab=ready_for_audit`);
    } else if (value === 'business') {
      navigate(`/dashboard/${value}?subtab=assets`);
    } else if (value === 'settings') {
      navigate(`/dashboard/${value}?subtab=users`);
    } else if (value === 'map' || value === 'load-hunter' || value === 'loads' || value === 'maintenance' || value === 'development' || value === 'changelog' || value === 'screenshare' || value === 'tools' || value === 'analytics' || value === 'usage' || value === 'fleet-financials' || value === 'carrier-dashboard') {
      navigate(`/dashboard/${value}`);
    } else {
      navigate(`/dashboard/${value}?filter=active`);
    }
  };

  // Primary nav items - BOTH feature flag AND user permission required
  // Users without custom roles see NOTHING (strict enforcement)
  const primaryNavItems = [
    // Map - gated by feature flag + permission
    ...(showMap ? [{ value: "map", icon: Map, label: "Map" }] : []),
    // Load Hunter - gated
    ...(showLoadHunter ? [{ value: "load-hunter", icon: Target, label: "Load Hunter" }] : []),
    // Loads - gated by permission (core feature but still requires permission)
    ...(showLoads ? [{ value: "loads", icon: Package, label: "Loads" }] : []),
    // Fleet Financials - gated
    ...(showFleetFinancials ? [{ value: "fleet-financials", icon: Wallet, label: "Fleet $" }] : []),
    // Carrier Dashboard - gated
    ...(showCarrierDashboard ? [{ value: "carrier-dashboard", icon: Briefcase, label: "Carrier's Dashboard" }] : []),
    // Operations - gated
    ...(showOperations ? [{ value: "business", icon: Briefcase, label: "Operations", badge: alertCount }] : []),
    // Accounting - gated
    ...(showAccounting ? [{ value: "accounting", icon: Calculator, label: "Accounting" }] : []),
    // Analytics - gated with user-level access check
    ...(showAnalytics ? [{ value: "analytics", icon: TrendingUp, label: "Analytics" }] : []),
    // Maintenance - gated
    ...(showMaintenance ? [{ value: "maintenance", icon: Wrench, label: "Maintenance" }] : []),
    // Usage - internal only (platform admins)
    ...(isPlatformAdmin ? [{ value: "usage", icon: DollarSign, label: "Usage" }] : []),
    // Development - gated
    ...(showDevelopment ? [{ value: "development", icon: FileCode, label: "Development", badge: integrationAlertCount + unmappedTypesCount }] : []),
  ];

  // Combined for mobile menu (includes items from user dropdown)
  const allNavItems = [
    ...primaryNavItems,
    // Tools - gated by permission
    ...(showTools ? [{ value: "tools", icon: Ruler, label: "Tools" }] : []),
    // Settings - gated by permission or tenant admin
    ...(showSettings ? [{ value: "settings", icon: Settings, label: "Settings" }] : []),
    // Admin items for mobile (only shown if platform admin)
    ...(isPlatformAdmin ? [
      { value: "platform-admin", icon: ShieldCheck, label: "Platform Admin" },
      { value: "inspector", icon: Shield, label: "Inspector" },
      { value: "rollouts", icon: Rocket, label: "Rollouts" },
    ] : []),
  ];

  // Prevent child routes from firing queries / function calls before auth state is known.
  // This avoids transient 401s where the client still uses the anon key as the Bearer token.
  if (!authReady) {
    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  // If signed out, the effect above will navigate to /auth; return nothing to avoid flashes.
  if (!authUserId) {
    return null;
  }

  return (
    <div
      className={cn(
        "w-full bg-background flex flex-col",
        location.pathname.includes("/fleet-financials")
          ? "h-[100dvh] overflow-hidden"
          : "min-h-screen",
      )}
    >
      {/* Impersonation Banner - always on top */}
      <ImpersonationBanner />
      <header 
        className="sticky top-0 z-40 border-b border-white/20"
        style={{
          background: 'linear-gradient(180deg, hsl(217 91% 60%) 0%, hsl(221 83% 53%) 50%, hsl(224 76% 48%) 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.15)'
        }}
      >
        <div className="max-w-[1630px] mx-auto px-3 sm:px-5 py-2 sm:py-2.5">
          <div className="flex justify-between items-center gap-3">
            {/* Left: Logo + Tenant Switcher + Desktop Nav */}
            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
              <h1 
                className="text-xl sm:text-2xl font-bold text-white whitespace-nowrap"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
              >
                TMS
              </h1>
              
              {/* Tenant Switcher - visible on all screen sizes */}
              <TenantSwitcher />
              
              {/* Desktop Navigation - Hidden on mobile */}
              <div className="hidden md:flex items-center gap-2 overflow-x-auto">
                <Tabs value={activeTab} onValueChange={handleTabChange}>
                  <TabsList 
                    className="h-10 border border-white/20 p-1 gap-1"
                    style={{
                      background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.25) 100%)',
                      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)'
                    }}
                  >
                    {primaryNavItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <TabsTrigger 
                          key={item.value}
                          value={item.value} 
                          className="gap-1.5 h-8 text-[13px] px-2.5 text-white/90 border-0 rounded-md data-[state=active]:text-white data-[state=active]:shadow-none"
                          style={{
                            textShadow: '0 1px 1px rgba(0,0,0,0.3)',
                            ...(activeTab === item.value ? {
                              background: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.15) 100%)',
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 1px 2px rgba(0,0,0,0.15)'
                            } : {})
                          }}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </Tabs>
              </div>

              {/* Mobile Menu Button */}
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild className="md:hidden">
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-header-foreground hover:bg-header-foreground/20 hover:text-header-foreground">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  <div className="flex flex-col h-full">
                    <div className="border-b p-4">
                      <h2 className="font-bold text-lg">TMS</h2>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{userName}</p>
                    </div>
                    <div className="flex-1 overflow-auto py-3">
                      <nav className="flex flex-col gap-1 px-3">
                        {allNavItems.map((item) => {
                          const Icon = item.icon;
                          const isActive = activeTab === item.value;
                          const badge = 'badge' in item ? (item as any).badge : undefined;
                          return (
                            <button
                              key={item.value}
                              onClick={() => {
                                handleTabChange(item.value);
                                setMobileMenuOpen(false);
                              }}
                              className={cn(
                                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all active:scale-[0.98]",
                                isActive
                                  ? "bg-primary text-primary-foreground"
                                  : "hover:bg-muted active:bg-muted"
                              )}
                            >
                              <Icon className="h-5 w-5" />
                              <span className="flex-1 text-left">{item.label}</span>
                              {badge && badge > 0 && (
                                <span className={cn(
                                  "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full",
                                  isActive 
                                    ? "bg-primary-foreground/20 text-primary-foreground"
                                    : "bg-destructive text-destructive-foreground"
                                )}>
                                  {badge > 9 ? '9+' : badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </nav>
                    </div>
                    <div className="border-t p-4">
                      <Button 
                        onClick={handleLogout} 
                        variant="outline" 
                        className="w-full h-11 gap-2 rounded-xl"
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* Right: User info + Logout */}
            <div className="flex items-center gap-2 sm:gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <button 
                    className="hidden sm:flex items-center gap-1.5 text-xs sm:text-sm text-white/90 hover:text-white transition-colors cursor-pointer rounded-md px-2 py-1 hover:bg-white/10"
                    style={{ textShadow: '0 1px 1px rgba(0,0,0,0.3)' }}
                  >
                    <CircleUser className="h-4 w-4" />
                    <span className="truncate max-w-[120px]">{userName}</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-0" sideOffset={8}>
                  <div className="px-3 py-2.5 border-b">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate leading-tight">{userName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{userEmail}</p>
                      </div>
                      {userRoles.length > 0 && (
                        <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end max-w-[80px]">
                          {userRoles.map((role) => (
                            <span key={role} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary capitalize">
                              {role}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-1">
                    {dispatcherId && (
                      <button 
                        onClick={() => navigate('/dashboard/my-dashboard')} 
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors text-left"
                      >
                        <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground" />
                        My Dashboard
                      </button>
                    )}
                    {isPlatformAdmin && (
                      <>
                        <button 
                          onClick={() => navigate('/dashboard/platform-admin')} 
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors text-left"
                        >
                          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                          Platform Admin
                        </button>
                        <button 
                          onClick={() => navigate('/dashboard/inspector')} 
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors text-left"
                        >
                          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                          Inspector
                        </button>
                        <button 
                          onClick={() => navigate('/dashboard/rollouts')} 
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors text-left"
                        >
                          <Rocket className="h-3.5 w-3.5 text-muted-foreground" />
                          Rollouts
                        </button>
                        {!isImpersonating && (
                          <button 
                            onClick={() => setImpersonateDialogOpen(true)} 
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors text-left text-amber-700 dark:text-amber-400"
                          >
                            <Building2 className="h-3.5 w-3.5" />
                            Impersonate Tenant
                          </button>
                        )}
                      </>
                    )}
                    {showSettings && (
                      <button 
                        onClick={() => navigate('/dashboard/settings')} 
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors text-left"
                      >
                        <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                        Settings
                      </button>
                    )}
                    {showTools && (
                      <button 
                        onClick={() => navigate('/dashboard/tools')} 
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors text-left"
                      >
                        <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
                        Tools
                      </button>
                    )}
                    <button 
                      onClick={() => navigate('/dashboard/screenshare')} 
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors text-left"
                    >
                      <MonitorUp className="h-3.5 w-3.5 text-muted-foreground" />
                      Support
                    </button>
                  </div>
                  <div className="px-2 py-1.5 border-t">
                    <div 
                      className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted transition-colors cursor-pointer"
                      onClick={toggleShowAllTab}
                    >
                      <div className="flex items-center gap-2">
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">All Loads</span>
                      </div>
                      <Switch 
                        checked={showAllTab} 
                        onCheckedChange={toggleShowAllTab}
                        className="scale-75"
                      />
                    </div>
                  </div>
                  <div className="p-1 border-t">
                    <button 
                      onClick={handleLogout} 
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-destructive/10 text-destructive transition-colors text-left"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </header>

      <main className={cn(
        "max-w-[1630px] w-full mx-auto px-3 sm:px-4 py-4 flex-1",
        location.pathname.includes('/load-hunter') ? "pb-4" : "pb-20 md:pb-4",
        location.pathname.includes('/fleet-financials') && "min-h-0 overflow-hidden",
      )}>
        {/* Platform Admin and Inspector are exempt from tenant requirement */}
        {location.pathname.includes('/platform-admin') || location.pathname.includes('/inspector') ? (
          children
        ) : tenantLoading || permissionsLoading ? (
          // Prevent any tenant pages from rendering until tenant context AND permissions are resolved
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-sm text-muted-foreground">Checking access…</div>
          </div>
        ) : !hasCustomRole && !isPlatformAdmin ? (
          // User has no custom role assigned - show message (strict enforcement)
          <NoRoleAssignedBanner />
        ) : (
          <TenantRequired>
            {children}
          </TenantRequired>
        )}
      </main>


      {/* Mapbox Usage Alert - checks on login */}
      <MapboxUsageAlert />
      
      {/* Impersonate Tenant Dialog */}
      <ImpersonateTenantDialog 
        open={impersonateDialogOpen} 
        onOpenChange={setImpersonateDialogOpen} 
      />
      
      {/* Dev-only tenant debug banner */}
      <TenantDebugBanner />
    </div>
  );
}