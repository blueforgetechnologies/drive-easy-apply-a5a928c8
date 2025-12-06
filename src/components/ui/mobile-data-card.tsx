import { cn } from "@/lib/utils";
import { Badge } from "./badge";
import { ReactNode } from "react";

interface MobileDataRow {
  label: string;
  value: ReactNode;
  className?: string;
}

interface MobileDataCardProps {
  title: string;
  subtitle?: string;
  badge?: {
    text: string;
    variant?: "default" | "secondary" | "destructive" | "outline";
  };
  rows: MobileDataRow[];
  onClick?: () => void;
  actions?: ReactNode;
  className?: string;
}

export function MobileDataCard({
  title,
  subtitle,
  badge,
  rows,
  onClick,
  actions,
  className,
}: MobileDataCardProps) {
  return (
    <div
      className={cn(
        "p-4 rounded-lg border bg-card",
        onClick && "cursor-pointer hover:bg-accent/50 active:bg-accent transition-colors",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm truncate">{title}</h3>
            {badge && (
              <Badge variant={badge.variant || "default"} className="text-[10px] px-1.5 py-0">
                {badge.text}
              </Badge>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      
      <div className="space-y-1.5">
        {rows.map((row, index) => (
          <div key={index} className="flex justify-between items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">{row.label}</span>
            <span className={cn("text-xs font-medium text-right truncate", row.className)}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface MobileDataListProps {
  children: ReactNode;
  className?: string;
}

export function MobileDataList({ children, className }: MobileDataListProps) {
  return (
    <div className={cn("flex flex-col gap-3 md:hidden", className)}>
      {children}
    </div>
  );
}

interface ResponsiveTableWrapperProps {
  children: ReactNode;
  mobileContent?: ReactNode;
  className?: string;
}

export function ResponsiveTableWrapper({
  children,
  mobileContent,
  className,
}: ResponsiveTableWrapperProps) {
  return (
    <>
      {/* Mobile card view */}
      {mobileContent && (
        <div className="md:hidden">
          {mobileContent}
        </div>
      )}
      
      {/* Desktop table view */}
      <div className={cn("hidden md:block overflow-x-auto", className)}>
        {children}
      </div>
    </>
  );
}