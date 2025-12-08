import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

interface MobileListProps {
  children: React.ReactNode;
  className?: string;
}

export function MobileList({ children, className }: MobileListProps) {
  return (
    <div className={cn("flex flex-col gap-2 md:hidden", className)}>
      {children}
    </div>
  );
}

interface MobileListItemProps {
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  showChevron?: boolean;
}

export function MobileListItem({
  onClick,
  children,
  className,
  showChevron = true,
}: MobileListItemProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-4 rounded-xl border bg-card transition-all",
        onClick && "cursor-pointer active:scale-[0.98] active:bg-accent/50",
        className
      )}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {onClick && showChevron && (
        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
      )}
    </div>
  );
}

interface MobileListRowProps {
  label: string;
  value: React.ReactNode;
  className?: string;
  valueClassName?: string;
}

export function MobileListRow({
  label,
  value,
  className,
  valueClassName,
}: MobileListRowProps) {
  return (
    <div className={cn("flex justify-between items-center py-1", className)}>
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-sm font-medium text-right truncate ml-2", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

interface MobileListHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  avatar?: React.ReactNode;
  className?: string;
}

export function MobileListHeader({
  title,
  subtitle,
  badge,
  avatar,
  className,
}: MobileListHeaderProps) {
  return (
    <div className={cn("flex items-start gap-3 mb-2", className)}>
      {avatar && <div className="shrink-0">{avatar}</div>}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm truncate">{title}</span>
          {badge}
        </div>
        {subtitle && (
          <span className="text-xs text-muted-foreground block truncate">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

interface MobileEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function MobileEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: MobileEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-6 text-center",
        className
      )}
    >
      {icon && (
        <div className="mb-4 p-4 rounded-full bg-muted/50 text-muted-foreground">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-4">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
