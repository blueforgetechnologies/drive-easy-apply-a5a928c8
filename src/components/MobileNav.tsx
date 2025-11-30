import { useNavigate, useLocation } from "react-router-dom";
import { Map, Target, Briefcase, Package, Calculator, Wrench, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  alertCount: number;
  integrationAlertCount: number;
  unreviewedLoadsCount: number;
}

export default function MobileNav({ alertCount, integrationAlertCount, unreviewedLoadsCount }: MobileNavProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const getActiveTab = () => {
    const pathParts = location.pathname.split('/');
    return pathParts[2] || 'map';
  };

  const activeTab = getActiveTab();

  const navItems = [
    { value: "map", icon: Map, label: "Map" },
    { value: "load-hunter", icon: Target, label: "Hunter", badge: unreviewedLoadsCount },
    { value: "business", icon: Briefcase, label: "Business", badge: alertCount },
    { value: "loads", icon: Package, label: "Loads" },
    { value: "accounting", icon: Calculator, label: "Account" },
    { value: "maintenance", icon: Wrench, label: "Service" },
    { value: "settings", icon: Settings, label: "Settings", badge: integrationAlertCount },
  ];

  const handleNavigation = (value: string) => {
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden safe-area-inset-bottom">
      <div className="flex justify-around items-center h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.value;
          
          return (
            <button
              key={item.value}
              onClick={() => handleNavigation(item.value)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 h-full relative transition-colors",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {item.badge && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold text-white bg-red-500 rounded-full">
                    {item.value === 'load-hunter' ? item.badge : item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
