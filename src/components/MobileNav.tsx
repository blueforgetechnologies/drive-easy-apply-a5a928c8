import { useNavigate, useLocation } from "react-router-dom";
import { Map, Target, Briefcase, Package, Settings, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { MobileActionSheet } from "./ui/mobile-bottom-sheet";

interface MobileNavProps {
  alertCount: number;
  integrationAlertCount: number;
}

export default function MobileNav({ alertCount, integrationAlertCount }: MobileNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const getActiveTab = () => {
    const pathParts = location.pathname.split('/');
    return pathParts[2] || 'map';
  };

  const activeTab = getActiveTab();

  const mainNavItems = [
    { value: "map", icon: Map, label: "Map" },
    { value: "load-hunter", icon: Target, label: "Hunter" },
    { value: "business", icon: Briefcase, label: "Business", badge: alertCount },
    { value: "loads", icon: Package, label: "Loads" },
  ];

  const moreNavItems = [
    { value: "accounting", label: "Accounting", onClick: () => handleNavigation("accounting") },
    { value: "maintenance", label: "Maintenance", onClick: () => handleNavigation("maintenance") },
    { value: "settings", label: "Settings", onClick: () => handleNavigation("settings") },
    { value: "development", label: "Development", onClick: () => handleNavigation("development") },
    { value: "changelog", label: "Changelog", onClick: () => handleNavigation("changelog") },
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
      navigate(`/dashboard/${value}`);
    }
  };

  const isMoreActive = ['accounting', 'maintenance', 'settings', 'development', 'changelog'].includes(activeTab);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border/50 md:hidden">
      <div className="flex justify-around items-stretch h-16 max-w-lg mx-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {mainNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.value;
          
          return (
            <button
              key={item.value}
              onClick={() => handleNavigation(item.value)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 relative transition-all duration-200",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground active:text-foreground"
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
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-4 text-[10px] font-bold text-white bg-destructive rounded-full px-1 shadow-sm">
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
            </button>
          );
        })}

        {/* More button */}
        <MobileActionSheet
          trigger={
            <button
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 relative transition-all duration-200",
                isMoreActive 
                  ? "text-primary" 
                  : "text-muted-foreground active:text-foreground"
              )}
            >
              <div className={cn(
                "p-1.5 rounded-xl transition-all duration-200",
                isMoreActive && "bg-primary/10"
              )}>
                <MoreHorizontal className={cn(
                  "h-5 w-5 transition-all duration-200",
                  isMoreActive && "scale-110"
                )} />
              </div>
              <span className={cn(
                "text-[10px] font-medium transition-all duration-200",
                isMoreActive && "font-semibold"
              )}>
                More
              </span>
              {integrationAlertCount > 0 && (
                <span className="absolute top-1 right-1/4 inline-flex items-center justify-center min-w-[16px] h-4 text-[10px] font-bold text-white bg-destructive rounded-full px-1 shadow-sm">
                  {integrationAlertCount}
                </span>
              )}
            </button>
          }
          title="More Options"
          actions={moreNavItems}
          open={moreOpen}
          onOpenChange={setMoreOpen}
        />
      </div>
    </nav>
  );
}
