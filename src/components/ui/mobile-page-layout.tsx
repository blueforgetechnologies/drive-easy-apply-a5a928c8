import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { ArrowLeft, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface MobilePageLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  showBackButton?: boolean;
  actions?: ReactNode;
  addButton?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function MobilePageLayout({
  title,
  subtitle,
  children,
  showBackButton = false,
  actions,
  addButton,
  className,
}: MobilePageLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className={cn("min-h-screen pb-20 md:pb-0", className)}>
      {/* Mobile Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b md:hidden">
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {showBackButton && (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-9 w-9 -ml-2"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold truncate">{title}</h1>
              {subtitle && (
                <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {actions}
            {addButton && (
              <Button size="sm" className="h-9 gap-1.5" onClick={addButton.onClick}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{addButton.label}</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden md:flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {addButton && (
            <Button className="gap-2" onClick={addButton.onClick}>
              <Plus className="h-4 w-4" />
              {addButton.label}
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-3 py-3 md:px-0 md:py-0">{children}</div>
    </div>
  );
}

interface MobileFilterBarProps {
  children: ReactNode;
  className?: string;
}

export function MobileFilterBar({ children, className }: MobileFilterBarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-2 overflow-x-auto pb-2 -mx-3 px-3 md:mx-0 md:px-0 scrollbar-hide",
        className
      )}
    >
      {children}
    </div>
  );
}

interface MobileSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function MobileSearchBar({
  value,
  onChange,
  placeholder = "Search...",
  className,
}: MobileSearchBarProps) {
  return (
    <div className={cn("relative", className)}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 md:h-9 pl-4 pr-4 text-sm rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-ring transition-all"
      />
    </div>
  );
}
