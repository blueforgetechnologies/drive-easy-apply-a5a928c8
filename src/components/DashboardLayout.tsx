import { useState, useEffect } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { Users, Car, Package, UserCog, Truck } from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [userName, setUserName] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("drivers");
  const currentFilter = searchParams.get("filter") || "active";

  useEffect(() => {
    loadUserProfile();
    
    // Detect active tab from URL
    const pathParts = location.pathname.split('/');
    const tabFromUrl = pathParts[2]; // /dashboard/[tab]
    if (tabFromUrl && ['drivers', 'users', 'vehicles', 'dispatchers', 'loads'].includes(tabFromUrl)) {
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
    navigate(`/dashboard/${value}?filter=active`);
  };

  const handleFilterChange = (filter: string) => {
    const currentPath = location.pathname;
    navigate(`${currentPath}?filter=${filter}`);
  };

  return (
    <div className="min-h-screen w-full bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList>
                <TabsTrigger value="drivers" className="gap-2">
                  <Truck className="h-4 w-4" />
                  <span className="hidden sm:inline">Drivers</span>
                </TabsTrigger>
                <TabsTrigger value="users" className="gap-2">
                  <Users className="h-4 w-4" />
                  <span className="hidden sm:inline">Users</span>
                </TabsTrigger>
                <TabsTrigger value="vehicles" className="gap-2">
                  <Car className="h-4 w-4" />
                  <span className="hidden sm:inline">Vehicles</span>
                </TabsTrigger>
                <TabsTrigger value="dispatchers" className="gap-2">
                  <UserCog className="h-4 w-4" />
                  <span className="hidden sm:inline">Dispatchers</span>
                </TabsTrigger>
                <TabsTrigger value="loads" className="gap-2">
                  <Package className="h-4 w-4" />
                  <span className="hidden sm:inline">Loads</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Signed in as: <span className="font-medium text-foreground">{userName}</span>
            </span>
            <Button onClick={handleLogout} variant="outline" size="sm">
              Logout
            </Button>
          </div>
        </div>
      </header>

      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <Sidebar>
            <SidebarContent>
              {activeTab === "drivers" && (
                <SidebarGroup>
                  <SidebarGroupLabel>Filter Drivers</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          isActive={currentFilter === "active"}
                          onClick={() => handleFilterChange("active")}
                        >
                          Active Drivers
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          isActive={currentFilter === "invitations"}
                          onClick={() => handleFilterChange("invitations")}
                        >
                          Invitations
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          isActive={currentFilter === "inactive"}
                          onClick={() => handleFilterChange("inactive")}
                        >
                          Inactive Drivers
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )}

              {activeTab === "users" && (
                <SidebarGroup>
                  <SidebarGroupLabel>Filter Users</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          isActive={currentFilter === "invitations"}
                          onClick={() => handleFilterChange("invitations")}
                        >
                          Invitations
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          isActive={currentFilter === "active"}
                          onClick={() => handleFilterChange("active")}
                        >
                          Active Users
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          isActive={currentFilter === "inactive"}
                          onClick={() => handleFilterChange("inactive")}
                        >
                          Inactive Users
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )}
            </SidebarContent>
          </Sidebar>

          <main className="flex-1 p-6">
            {children}
          </main>
        </div>
      </SidebarProvider>
    </div>
  );
}