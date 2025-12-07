import { useNavigate, useLocation } from "react-router-dom";
import { Map, Target, Briefcase, Package, Calculator, Wrench, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  alertCount: number;
  integrationAlertCount: number;
}

export default function MobileNav({ alertCount, integrationAlertCount }: MobileNavProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const getActiveTab = () => {
    const pathParts = location.pathname.split('/');
    return pathParts[2] || 'map';
  };

  const activeTab = getActiveTab();

  const navItems = [
    { value: "map", icon: Map, label: "Map" },
    { value: "load-hunter", icon: Target, label: "Hunter" },
    { value: "business", icon: Briefcase, label: "Business", badge: alertCount },
    { value: "loads", icon: Package, label: "Loads" },
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border/50 md:hidden safe-area-inset-bottom">
      <div className="flex justify-around items-center h-16 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.value;
          
          return (
            <button
              key={item.value}
              onClick={() => handleNavigation(item.value)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative transition-all duration-200 rounded-xl mx-0.5",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground active:scale-95 active:bg-muted/50"
              )}
            >
              <div className="relative">
                <div className={cn(
                  "p-1.5 rounded-xl transition-all duration-200",
                  isActive && "bg-primary/10"
                )}>
                  <Icon className={cn(
                    "h-5 w-5 transition-all duration-200",
                    isActive && "scale-110"
                  )} />
                </div>
                {item.badge && item.badge > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold text-white bg-destructive rounded-full px-1 shadow-sm animate-in zoom-in duration-200">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className={cn(
                "text-[10px] font-medium transition-all duration-200",
                isActive && "font-semibold"
              )}>
                {item.label}
              </span>
              {isActive && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
