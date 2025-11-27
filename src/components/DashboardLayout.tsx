import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Package, Briefcase, MapPin, Wrench, Settings, Map, Calculator } from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [userName, setUserName] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("drivers");

  useEffect(() => {
    loadUserProfile();
    
    // Detect active tab from URL
    const pathParts = location.pathname.split('/');
    const tabFromUrl = pathParts[2]; // /dashboard/[tab]
    const validTabs = ['business', 'users', 'loads', 'accounting', 'locations', 'maintenance', 'company-profile', 'map'];
    if (tabFromUrl && validTabs.includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
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
    } else {
      navigate(`/dashboard/${value}?filter=active`);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-3 py-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-foreground">TMS</h1>
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="h-7">
                <TabsTrigger value="business" className="gap-1 text-xs px-2">
                  <Briefcase className="h-3 w-3" />
                  <span className="hidden sm:inline">Business</span>
                </TabsTrigger>
                <TabsTrigger value="users" className="gap-1 text-xs px-2">
                  <Users className="h-3 w-3" />
                  <span className="hidden sm:inline">Users</span>
                </TabsTrigger>
                <TabsTrigger value="loads" className="gap-1 text-xs px-2">
                  <Package className="h-3 w-3" />
                  <span className="hidden sm:inline">Loads</span>
                </TabsTrigger>
                <TabsTrigger value="accounting" className="gap-1 text-xs px-2">
                  <Calculator className="h-3 w-3" />
                  <span className="hidden sm:inline">Accounting</span>
                </TabsTrigger>
                <TabsTrigger value="locations" className="gap-1 text-xs px-2">
                  <MapPin className="h-3 w-3" />
                  <span className="hidden sm:inline">Locations</span>
                </TabsTrigger>
                <TabsTrigger value="maintenance" className="gap-1 text-xs px-2">
                  <Wrench className="h-3 w-3" />
                  <span className="hidden sm:inline">Maintenance</span>
                </TabsTrigger>
                <TabsTrigger value="company-profile" className="gap-1 text-xs px-2">
                  <Settings className="h-3 w-3" />
                  <span className="hidden sm:inline">Company</span>
                </TabsTrigger>
                <TabsTrigger value="map" className="gap-1 text-xs px-2">
                  <Map className="h-3 w-3" />
                  <span className="hidden sm:inline">Map</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {userName}
            </span>
            <Button onClick={handleLogout} variant="outline" size="sm" className="h-7 text-xs px-2">
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 py-3">
        {children}
      </main>
    </div>
  );
}