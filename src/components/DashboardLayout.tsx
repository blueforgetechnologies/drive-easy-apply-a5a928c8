import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Briefcase, Wrench, Settings, Map, Calculator, Target } from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [userName, setUserName] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("drivers");
  const [alertCount, setAlertCount] = useState<number>(0);
  const [integrationAlertCount, setIntegrationAlertCount] = useState<number>(0);

  useEffect(() => {
    loadUserProfile();
    loadAlerts();
    loadIntegrationAlerts();
    
    // Detect active tab from URL
    const pathParts = location.pathname.split('/');
    const tabFromUrl = pathParts[2]; // /dashboard/[tab]
    const validTabs = ['map', 'load-hunter', 'business', 'loads', 'accounting', 'maintenance', 'settings'];
    if (tabFromUrl && validTabs.includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }

    // Check integration status every 5 minutes
    const interval = setInterval(loadIntegrationAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
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
    } else if (value === 'map' || value === 'load-hunter' || value === 'maintenance') {
      navigate(`/dashboard/${value}`);
    } else {
      navigate(`/dashboard/${value}?filter=active`);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-2.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">TMS</h1>
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList>
                <TabsTrigger value="map" className="gap-1.5">
                  <Map className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Map</span>
                </TabsTrigger>
                <TabsTrigger value="load-hunter" className="gap-1.5">
                  <Target className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Load Hunter</span>
                </TabsTrigger>
                <TabsTrigger value="business" className="gap-1.5 relative">
                  <Briefcase className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Business</span>
                  {alertCount > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 rounded-full">
                      {alertCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="loads" className="gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Loads</span>
                </TabsTrigger>
                <TabsTrigger value="accounting" className="gap-1.5">
                  <Calculator className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Accounting</span>
                </TabsTrigger>
                <TabsTrigger value="maintenance" className="gap-1.5">
                  <Wrench className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Maintenance</span>
                </TabsTrigger>
                <TabsTrigger value="settings" className="gap-1.5 relative">
                  <Settings className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Settings</span>
                  {integrationAlertCount > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 rounded-full">
                      {integrationAlertCount}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {userName}
            </span>
            <Button onClick={handleLogout} variant="outline" size="sm" className="h-8 text-sm">
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4">
        {children}
      </main>
    </div>
  );
}