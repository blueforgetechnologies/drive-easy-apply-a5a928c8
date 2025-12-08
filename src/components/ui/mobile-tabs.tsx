import * as React from "react";
import { cn } from "@/lib/utils";

interface MobileTabsProps {
  value: string;
  onValueChange: (value: string) => void;
  tabs: Array<{
    value: string;
    label: string;
    count?: number;
    icon?: React.ReactNode;
  }>;
  className?: string;
}

export function MobileTabs({ value, onValueChange, tabs, className }: MobileTabsProps) {
  return (
    <div
      className={cn(
        "flex overflow-x-auto gap-1.5 pb-1 -mx-3 px-3 md:mx-0 md:px-0 scrollbar-hide",
        className
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onValueChange(tab.value)}
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all active:scale-95",
            value === tab.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted/60 text-muted-foreground hover:bg-muted"
          )}
        >
          {tab.icon}
          <span>{tab.label}</span>
          {tab.count !== undefined && (
            <span
              className={cn(
                "ml-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full min-w-[18px] text-center",
                value === tab.value
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-background text-muted-foreground"
              )}
            >
              {tab.count > 99 ? "99+" : tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

interface MobileSegmentedControlProps {
  value: string;
  onValueChange: (value: string) => void;
  segments: Array<{
    value: string;
    label: string;
  }>;
  className?: string;
}

export function MobileSegmentedControl({
  value,
  onValueChange,
  segments,
  className,
}: MobileSegmentedControlProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center p-1 rounded-xl bg-muted/60",
        className
      )}
    >
      {segments.map((segment) => (
        <button
          key={segment.value}
          onClick={() => onValueChange(segment.value)}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-lg transition-all",
            value === segment.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}
