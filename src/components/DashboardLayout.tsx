import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Briefcase, Wrench, Settings, Map, Calculator, Target, Menu, FileCode, History, LogOut, ShieldCheck, MonitorUp } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
  const [activeTab, setActiveTab] = useState<string>("drivers");
  const [alertCount, setAlertCount] = useState<number>(0);
  const [integrationAlertCount, setIntegrationAlertCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    loadUserProfile();
    loadAlerts();
    loadIntegrationAlerts();
    
    // Detect active tab from URL
    const pathParts = location.pathname.split('/');
    const tabFromUrl = pathParts[2]; // /dashboard/[tab]
    const validTabs = ['map', 'load-hunter', 'business', 'loads', 'accounting', 'maintenance', 'settings', 'roles', 'screenshare', 'development', 'changelog'];
    if (tabFromUrl && validTabs.includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }

    // Check integration status every 5 minutes
    const interval = setInterval(loadIntegrationAlerts, 5 * 60 * 1000);
    
    return () => {
      clearInterval(interval);
    };
  }, [location.pathname]);

  const loadUserProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      
      setUserName(profile?.full_name || user.email || "User");
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
    } else if (value === 'map' || value === 'load-hunter' || value === 'maintenance' || value === 'development' || value === 'changelog' || value === 'roles' || value === 'screenshare') {
      navigate(`/dashboard/${value}`);
    } else {
      navigate(`/dashboard/${value}?filter=active`);
    }
  };

  const navItems = [
    { value: "map", icon: Map, label: "Map" },
    { value: "load-hunter", icon: Target, label: "Load Hunter" },
    { value: "business", icon: Briefcase, label: "Business", badge: alertCount },
    { value: "loads", icon: Package, label: "Loads" },
    { value: "accounting", icon: Calculator, label: "Accounting" },
    { value: "maintenance", icon: Wrench, label: "Maintenance" },
    { value: "settings", icon: Settings, label: "Settings", badge: integrationAlertCount },
    { value: "roles", icon: ShieldCheck, label: "Roles" },
    { value: "screenshare", icon: MonitorUp, label: "Support" },
    { value: "development", icon: FileCode, label: "Dev" },
    { value: "changelog", icon: History, label: "Changelog" },
  ];

  return (
    <div className="min-h-screen w-full bg-background">
      <header className="sticky top-0 z-40 border-b bg-header border-header/20">
        <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-2.5">
          <div className="flex justify-between items-center gap-2">
            {/* Left: Logo + Desktop Nav */}
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-header-foreground whitespace-nowrap">TMS</h1>
              
              {/* Desktop Navigation - Hidden on mobile */}
              <div className="hidden md:block overflow-x-auto">
                <Tabs value={activeTab} onValueChange={handleTabChange}>
                  <TabsList className="h-9 bg-header-foreground/10 border-header-foreground/20">
                    {navItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <TabsTrigger 
                          key={item.value}
                          value={item.value} 
                          className="gap-1.5 h-8 text-xs text-header-foreground data-[state=active]:bg-header-foreground/20 data-[state=active]:text-header-foreground"
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span>{item.label}</span>
                          {item.badge && item.badge > 0 && (
                            <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold text-white bg-red-500 rounded-full">
                              {item.badge > 9 ? '9+' : item.badge}
                            </span>
                          )}
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
                        {navItems.map((item) => {
                          const Icon = item.icon;
                          const isActive = activeTab === item.value;
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
                              {item.badge && item.badge > 0 && (
                                <span className={cn(
                                  "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full",
                                  isActive 
                                    ? "bg-primary-foreground/20 text-primary-foreground"
                                    : "bg-destructive text-destructive-foreground"
                                )}>
                                  {item.badge > 9 ? '9+' : item.badge}
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
              <span className="text-xs sm:text-sm text-header-foreground/90 hidden sm:inline truncate max-w-[120px]">
                {userName}
              </span>
              <Button 
                onClick={handleLogout} 
                variant="outline" 
                size="sm" 
                className="h-8 text-xs sm:text-sm px-2 sm:px-3 border-header-foreground/30 text-header-foreground bg-transparent hover:bg-header-foreground/20 hover:text-header-foreground hidden md:flex"
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1700px] px-0 sm:px-4 py-0 sm:py-4 pb-20 md:pb-4">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileNav alertCount={alertCount} integrationAlertCount={integrationAlertCount} />

      {/* Mapbox Usage Alert - checks on login */}
      <MapboxUsageAlert />
    </div>
  );
}