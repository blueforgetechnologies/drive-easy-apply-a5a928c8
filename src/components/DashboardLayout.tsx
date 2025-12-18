import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Briefcase, Wrench, Settings, Map, Calculator, Target, Menu, FileCode, History, LogOut, ShieldCheck, MonitorUp, Ruler, TrendingUp, User, Mail, Shield, ChevronDown, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import MobileNav from "./MobileNav";
import { MapboxUsageAlert } from "./MapboxUsageAlert";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

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
  const [alertCount, setAlertCount] = useState<number>(0);
  const [integrationAlertCount, setIntegrationAlertCount] = useState<number>(0);
  const [unmappedTypesCount, setUnmappedTypesCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    loadUserProfile();
    loadAlerts();
    loadIntegrationAlerts();
    loadUnmappedTypesCount();
    
    // Detect active tab from URL
    const pathParts = location.pathname.split('/');
    const tabFromUrl = pathParts[2]; // /dashboard/[tab]
    const validTabs = ['map', 'load-hunter', 'business', 'loads', 'accounting', 'maintenance', 'settings', 'screenshare', 'development', 'tools', 'analytics'];
    if (tabFromUrl && validTabs.includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }

    // Check integration status every 5 minutes
    const interval = setInterval(() => {
      loadIntegrationAlerts();
      loadUnmappedTypesCount();
    }, 5 * 60 * 1000);
    
    return () => {
      clearInterval(interval);
    };
  }, [location.pathname]);

  const loadUserProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
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
      
      if (roles && roles.length > 0) {
        setUserRoles(roles.map(r => r.role));
      }
    }
  };

  const loadAlerts = async () => {
    // Load vehicle alerts
    const { data: vehicles } = await supabase
      .from("vehicles")
      .select("oil_change_remaining, insurance_expiry, registration_expiry")
      .eq("status", "active");

    let vehicleCount = 0;
    if (vehicles) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      vehicles.forEach(vehicle => {
        // Oil change due or overdue
        if (vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining <= 0) {
          vehicleCount++;
        }
        // Insurance expired
        if (vehicle.insurance_expiry) {
          const insuranceDate = new Date(vehicle.insurance_expiry);
          insuranceDate.setHours(0, 0, 0, 0);
          if (insuranceDate < today) {
            vehicleCount++;
          }
        }
        // Registration expired
        if (vehicle.registration_expiry) {
          const registrationDate = new Date(vehicle.registration_expiry);
          registrationDate.setHours(0, 0, 0, 0);
          if (registrationDate < today) {
            vehicleCount++;
          }
        }
      });
    }

    // Load carrier alerts (NOT AUTHORIZED status for active/pending carriers)
    const { data: carriers } = await supabase
      .from("carriers")
      .select("safer_status, status")
      .in("status", ["active", "pending"]);

    let carrierCount = 0;
    if (carriers) {
      carrierCount = carriers.filter(
        (carrier) => carrier.safer_status?.toUpperCase().includes("NOT AUTHORIZED")
      ).length;
    }

    // Combine both counts for Business tab
    setAlertCount(vehicleCount + carrierCount);
  };

  const loadIntegrationAlerts = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('check-integrations');
      
      if (error) {
        console.error("Error checking integrations:", error);
        return;
      }
      
      if (data && data.integrations) {
        const failedCount = data.integrations.filter(
          (i: any) => i.status === "down" || i.status === "degraded"
        ).length;
        setIntegrationAlertCount(failedCount);
      }
    } catch (error) {
      console.error("Error loading integration alerts:", error);
    }
  };

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
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'accounting') {
      navigate(`/dashboard/${value}?subtab=invoices`);
    } else if (value === 'business') {
      navigate(`/dashboard/${value}?subtab=assets`);
    } else if (value === 'settings') {
      navigate(`/dashboard/${value}?subtab=users`);
    } else if (value === 'map' || value === 'load-hunter' || value === 'maintenance' || value === 'development' || value === 'changelog' || value === 'screenshare' || value === 'tools' || value === 'analytics') {
      navigate(`/dashboard/${value}`);
    } else {
      navigate(`/dashboard/${value}?filter=active`);
    }
  };

  // Primary nav items - most frequently used
  const primaryNavItems = [
    { value: "map", icon: Map, label: "Map" },
    { value: "load-hunter", icon: Target, label: "Load Hunter" },
    { value: "loads", icon: Package, label: "Loads" },
    { value: "business", icon: Briefcase, label: "Operations", badge: alertCount },
    { value: "accounting", icon: Calculator, label: "Accounting" },
    { value: "analytics", icon: TrendingUp, label: "Analytics" },
  ];

  // Secondary nav items - less frequent, in dropdown
  const secondaryNavItems = [
    { value: "tools", icon: Ruler, label: "Tools" },
    { value: "maintenance", icon: Wrench, label: "Maintenance" },
    { value: "development", icon: FileCode, label: "Development", badge: integrationAlertCount + unmappedTypesCount },
  ];

  // Combined for mobile menu
  const allNavItems = [...primaryNavItems, ...secondaryNavItems];

  // Check if current tab is in secondary
  const isSecondaryActive = secondaryNavItems.some(item => item.value === activeTab);
  const totalSecondaryBadge = integrationAlertCount + unmappedTypesCount;

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <header 
        className="sticky top-0 z-40 border-b border-white/20"
        style={{
          background: 'linear-gradient(180deg, hsl(217 91% 60%) 0%, hsl(221 83% 53%) 50%, hsl(224 76% 48%) 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.15)'
        }}
      >
        <div className="max-w-[1630px] mx-auto px-3 sm:px-5 py-2 sm:py-2.5">
          <div className="flex justify-between items-center gap-3">
            {/* Left: Logo + Desktop Nav */}
            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
              <h1 
                className="text-xl sm:text-2xl font-bold text-white whitespace-nowrap"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
              >
                TMS
              </h1>
              
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

                {/* More Dropdown for secondary items */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center gap-1.5 h-8 text-[13px] px-2.5 text-white/90 border border-white/20 rounded-md transition-colors",
                        isSecondaryActive ? "bg-white/20" : "hover:bg-white/10"
                      )}
                      style={{
                        textShadow: '0 1px 1px rgba(0,0,0,0.3)',
                        background: isSecondaryActive 
                          ? 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.15) 100%)'
                          : 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.25) 100%)',
                        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)'
                      }}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                      <span>More</span>
                      {totalSecondaryBadge > 0 && (
                        <span 
                          className="ml-0.5 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold text-white rounded-full"
                          style={{
                            background: 'linear-gradient(180deg, hsl(0 84% 60%) 0%, hsl(0 72% 51%) 100%)',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.3)'
                          }}
                        >
                          {totalSecondaryBadge > 9 ? '9+' : totalSecondaryBadge}
                        </span>
                      )}
                      <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52 bg-background">
                    {secondaryNavItems.map((item, index) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.value;
                      return (
                        <div key={item.value}>
                          {index === 4 && <DropdownMenuSeparator />}
                          <DropdownMenuItem 
                            onClick={() => handleTabChange(item.value)}
                            className={cn(
                              "flex items-center gap-2.5 cursor-pointer",
                              isActive && "bg-accent"
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            <span className="flex-1">{item.label}</span>
                            {item.badge && item.badge > 0 && (
                              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-destructive-foreground bg-destructive rounded-full">
                                {item.badge > 9 ? '9+' : item.badge}
                              </span>
                            )}
                          </DropdownMenuItem>
                        </div>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
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
                    <span className="truncate max-w-[120px]">{userName}</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-0" sideOffset={8}>
                  <div className="p-4 border-b">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{userName}</p>
                        <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-center gap-2.5 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Email:</span>
                      <span className="truncate flex-1 text-right">{userEmail}</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-sm">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Role:</span>
                      <div className="flex-1 flex justify-end gap-1 flex-wrap">
                        {userRoles.length > 0 ? (
                          userRoles.map((role) => (
                            <span 
                              key={role} 
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize"
                            >
                              {role}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-xs">No role assigned</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="p-3 border-t space-y-2">
                    <Button 
                      onClick={() => navigate('/dashboard/settings')} 
                      variant="ghost" 
                      size="sm" 
                      className="w-full h-8 gap-2 justify-start"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      Settings
                    </Button>
                    <Button 
                      onClick={() => navigate('/dashboard/screenshare')} 
                      variant="ghost" 
                      size="sm" 
                      className="w-full h-8 gap-2 justify-start"
                    >
                      <MonitorUp className="h-3.5 w-3.5" />
                      Support
                    </Button>
                    <Button 
                      onClick={handleLogout} 
                      variant="outline" 
                      size="sm" 
                      className="w-full h-8 gap-2"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Logout
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Button 
                onClick={handleLogout} 
                variant="outline" 
                size="sm" 
                className="h-7 text-[11px] px-2.5 border-white/30 text-white bg-white/10 hover:bg-white/20 hover:text-white hidden md:flex"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 1px 2px rgba(0,0,0,0.15)',
                  textShadow: '0 1px 1px rgba(0,0,0,0.3)'
                }}
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1630px] w-full mx-auto px-3 sm:px-4 py-4 pb-20 md:pb-4 flex-1">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileNav alertCount={alertCount} integrationAlertCount={integrationAlertCount} />

      {/* Mapbox Usage Alert - checks on login */}
      <MapboxUsageAlert />
    </div>
  );
}