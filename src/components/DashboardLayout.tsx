import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Briefcase, Wrench, Settings, Map, Calculator, Target, Menu, FileCode, GitBranch } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import MobileNav from "./MobileNav";
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
  const [unreviewedLoadsCount, setUnreviewedLoadsCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    loadUserProfile();
    loadAlerts();
    loadIntegrationAlerts();
    loadUnreviewedLoads();
    
    // Detect active tab from URL
    const pathParts = location.pathname.split('/');
    const tabFromUrl = pathParts[2]; // /dashboard/[tab]
    const validTabs = ['map', 'load-hunter', 'business', 'loads', 'accounting', 'maintenance', 'settings', 'development'];
    if (tabFromUrl && validTabs.includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }

    // Check integration status every 5 minutes
    const interval = setInterval(loadIntegrationAlerts, 5 * 60 * 1000);
    
    // Refresh unreviewed loads count every minute
    const unreviewedInterval = setInterval(loadUnreviewedLoads, 60 * 1000);
    
    return () => {
      clearInterval(interval);
      clearInterval(unreviewedInterval);
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

  const loadUnreviewedLoads = async () => {
    try {
      const { data, error } = await supabase
        .from("load_emails")
        .select("*")
        .eq("status", "new");
      
      if (error) {
        console.error("Error loading unreviewed loads:", error);
        return;
      }
      
      // Apply same filtering logic as Load Hunter page
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
      
      const filteredCount = (data || []).filter(e => {
        const emailTime = new Date(e.received_at);
        
        // Remove loads without expiration after 30 minutes
        if (e.status === 'new' && !e.expires_at && emailTime <= thirtyMinutesAgo) {
          return false;
        }
        
        return true;
      }).length;
      
      setUnreviewedLoadsCount(filteredCount);
    } catch (error) {
      console.error("Error counting unreviewed loads:", error);
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
    } else if (value === 'map' || value === 'load-hunter' || value === 'maintenance' || value === 'development') {
      navigate(`/dashboard/${value}`);
    } else {
      navigate(`/dashboard/${value}?filter=active`);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background pb-safe">
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
                    <TabsTrigger value="map" className="gap-1.5 h-8 text-xs text-header-foreground data-[state=active]:bg-header-foreground/20 data-[state=active]:text-header-foreground">
                      <Map className="h-3.5 w-3.5" />
                      <span>Map</span>
                    </TabsTrigger>
                    <TabsTrigger value="load-hunter" className="gap-1.5 h-8 text-xs relative text-header-foreground data-[state=active]:bg-header-foreground/20 data-[state=active]:text-header-foreground">
                      <Target className="h-3.5 w-3.5" />
                      <span>Hunter</span>
                      {unreviewedLoadsCount > 0 && (
                        <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold text-white bg-red-500 rounded-full">
                          {unreviewedLoadsCount}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="business" className="gap-1.5 h-8 text-xs relative text-header-foreground data-[state=active]:bg-header-foreground/20 data-[state=active]:text-header-foreground">
                      <Briefcase className="h-3.5 w-3.5" />
                      <span>Business</span>
                      {alertCount > 0 && (
                        <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold text-white bg-red-500 rounded-full">
                          {alertCount > 9 ? '9+' : alertCount}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="loads" className="gap-1.5 h-8 text-xs text-header-foreground data-[state=active]:bg-header-foreground/20 data-[state=active]:text-header-foreground">
                      <Package className="h-3.5 w-3.5" />
                      <span>Loads</span>
                    </TabsTrigger>
                    <TabsTrigger value="accounting" className="gap-1.5 h-8 text-xs text-header-foreground data-[state=active]:bg-header-foreground/20 data-[state=active]:text-header-foreground">
                      <Calculator className="h-3.5 w-3.5" />
                      <span>Accounting</span>
                    </TabsTrigger>
                    <TabsTrigger value="maintenance" className="gap-1.5 h-8 text-xs text-header-foreground data-[state=active]:bg-header-foreground/20 data-[state=active]:text-header-foreground">
                      <Wrench className="h-3.5 w-3.5" />
                      <span>Maint</span>
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="gap-1.5 h-8 text-xs relative text-header-foreground data-[state=active]:bg-header-foreground/20 data-[state=active]:text-header-foreground">
                      <Settings className="h-3.5 w-3.5" />
                      <span>Settings</span>
                      {integrationAlertCount > 0 && (
                        <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold text-white bg-red-500 rounded-full">
                          {integrationAlertCount > 9 ? '9+' : integrationAlertCount}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="development" className="gap-1.5 h-8 text-xs text-header-foreground data-[state=active]:bg-header-foreground/20 data-[state=active]:text-header-foreground">
                      <FileCode className="h-3.5 w-3.5" />
                      <span>Dev</span>
                    </TabsTrigger>
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
                <SheetContent side="left" className="w-64 p-0">
                  <div className="flex flex-col h-full">
                    <div className="border-b p-4">
                      <h2 className="font-semibold">Navigation</h2>
                    </div>
                    <div className="flex-1 overflow-auto py-2">
                      <nav className="flex flex-col gap-1 px-2">
                        {[
                          { value: "map", icon: Map, label: "Map" },
                          { value: "load-hunter", icon: Target, label: "Load Hunter", badge: unreviewedLoadsCount },
                          { value: "business", icon: Briefcase, label: "Business Manager", badge: alertCount },
                          { value: "loads", icon: Package, label: "Loads" },
                          { value: "accounting", icon: Calculator, label: "Accounting" },
                          { value: "maintenance", icon: Wrench, label: "Maintenance" },
                          { value: "settings", icon: Settings, label: "Settings", badge: integrationAlertCount },
                          { value: "development", icon: FileCode, label: "DEV" },
                          { value: "flow", icon: GitBranch, label: "FLOW" },
                        ].map((item) => {
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
                                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors relative",
                                isActive
                                  ? "bg-primary text-primary-foreground"
                                  : "hover:bg-accent hover:text-accent-foreground"
                              )}
                            >
                              <Icon className="h-5 w-5" />
                              <span>{item.label}</span>
                              {item.badge && item.badge > 0 && (
                                <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 rounded-full">
                                  {item.badge > 9 ? '9+' : item.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </nav>
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
              <Button onClick={handleLogout} variant="outline" size="sm" className="h-8 text-xs sm:text-sm px-2 sm:px-3 border-header-foreground/30 text-header-foreground hover:bg-header-foreground/20 hover:text-header-foreground">
                <span className="hidden sm:inline">Logout</span>
                <span className="sm:hidden">Exit</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1700px] px-3 sm:px-4 py-3 sm:py-4 pb-20 md:pb-4">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <MobileNav 
          alertCount={alertCount} 
          integrationAlertCount={integrationAlertCount}
          unreviewedLoadsCount={unreviewedLoadsCount}
        />
      )}
    </div>
  );
}