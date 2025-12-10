import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Loader2, Check } from "lucide-react";
import { format, startOfDay, endOfDay, subDays, subMonths, subYears, subHours, isSameDay } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface AnalyticsDateFilterProps {
  startDate: Date;
  endDate: Date;
  onDateChange: (start: Date, end: Date) => void;
  prefetchStatus?: Record<string, 'idle' | 'loading' | 'done'>;
}

type PresetOption = {
  label: string;
  value: string;
  prefetchKey?: string;
  getRange: () => { start: Date; end: Date };
};

// Stable reference date - only created once per component mount
const STABLE_TODAY = new Date();

export function AnalyticsDateFilter({ startDate, endDate, onDateChange, prefetchStatus }: AnalyticsDateFilterProps) {
  // Use stable date reference for consistent cache key matching
  const today = useMemo(() => STABLE_TODAY, []);

  const presets: PresetOption[] = useMemo(() => [
    {
      label: "24h",
      value: "24hours",
      prefetchKey: "24h",
      getRange: () => ({ start: subHours(today, 24), end: today })
    },
    {
      label: "3d",
      value: "3days",
      prefetchKey: "3d",
      getRange: () => ({ start: startOfDay(subDays(today, 2)), end: endOfDay(today) })
    },
    {
      label: "7d",
      value: "7days",
      prefetchKey: "7d",
      getRange: () => ({ start: startOfDay(subDays(today, 6)), end: endOfDay(today) })
    },
    {
      label: "30d",
      value: "30days",
      prefetchKey: "30d",
      getRange: () => ({ start: startOfDay(subDays(today, 29)), end: endOfDay(today) })
    },
    {
      label: "90d",
      value: "90days",
      prefetchKey: "90d",
      getRange: () => ({ start: startOfDay(subDays(today, 89)), end: endOfDay(today) })
    },
    {
      label: "6mo",
      value: "6months",
      prefetchKey: "6m",
      getRange: () => ({ start: startOfDay(subMonths(today, 6)), end: endOfDay(today) })
    },
    {
      label: "1yr",
      value: "1year",
      prefetchKey: "1y",
      getRange: () => ({ start: startOfDay(subYears(today, 1)), end: endOfDay(today) })
    }
  ], [today]);

  // Determine the active preset based on current startDate/endDate
  const activePreset = useMemo(() => {
    for (const preset of presets) {
      const range = preset.getRange();
      // For 24 hours, compare times; for others compare days
      if (preset.value === "24hours") {
        const diffMs = Math.abs(range.start.getTime() - startDate.getTime());
        const endDiffMs = Math.abs(range.end.getTime() - endDate.getTime());
        if (diffMs < 60000 && endDiffMs < 60000) return preset.value;
      } else {
        if (isSameDay(range.start, startDate) && isSameDay(range.end, endDate)) {
          return preset.value;
        }
      }
    }
    return "custom";
  }, [startDate, endDate, presets]);

  const [customRange, setCustomRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: activePreset === "custom" ? startDate : undefined,
    to: activePreset === "custom" ? endDate : undefined
  });

  // Sync custom range when props change
  useEffect(() => {
    if (activePreset === "custom") {
      setCustomRange({ from: startDate, to: endDate });
    }
  }, [startDate, endDate, activePreset]);

  const handlePresetClick = (preset: PresetOption) => {
    // Check if this preset is ready (done) or always available (24h)
    if (prefetchStatus && preset.prefetchKey && preset.prefetchKey !== '24h') {
      const status = prefetchStatus[preset.prefetchKey];
      if (status !== 'done') return; // Don't allow click if not ready
    }
    
    setCustomRange({ from: undefined, to: undefined });
    const { start, end } = preset.getRange();
    onDateChange(start, end);
  };

  const handleCustomRangeSelect = (range: { from: Date | undefined; to: Date | undefined } | undefined) => {
    if (!range) return;
    
    setCustomRange(range);
    
    if (range.from && range.to) {
      onDateChange(startOfDay(range.from), endOfDay(range.to));
    } else if (range.from) {
      onDateChange(startOfDay(range.from), endOfDay(range.from));
    }
  };

  const getCustomLabel = () => {
    if (activePreset === "custom" && startDate && endDate) {
      if (isSameDay(startDate, endDate)) {
        return format(startDate, "M/d");
      }
      return `${format(startDate, "M/d")} - ${format(endDate, "M/d")}`;
    }
    if (customRange.from && customRange.to) {
      return `${format(customRange.from, "M/d")} - ${format(customRange.to, "M/d")}`;
    }
    if (customRange.from) {
      return format(customRange.from, "M/d");
    }
    return "Custom";
  };

  const getPresetStatus = (preset: PresetOption): 'ready' | 'loading' | 'waiting' => {
    if (!prefetchStatus || !preset.prefetchKey) return 'ready';
    if (preset.prefetchKey === '24h') return 'ready'; // Always ready
    const status = prefetchStatus[preset.prefetchKey];
    if (status === 'done') return 'ready';
    if (status === 'loading') return 'loading';
    return 'waiting';
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {presets.map((preset) => {
        const status = getPresetStatus(preset);
        const isActive = activePreset === preset.value;
        const isDisabled = status === 'waiting' || status === 'loading';
        
        return (
          <Button
            key={preset.value}
            variant={isActive ? "default" : "outline"}
            size="sm"
            disabled={isDisabled && !isActive}
            className={cn(
              "h-7 px-2 text-xs font-medium min-w-[42px] relative",
              isActive && "bg-primary text-primary-foreground",
              isDisabled && !isActive && "opacity-50 cursor-not-allowed"
            )}
            onClick={() => handlePresetClick(preset)}
          >
            <span className="flex items-center gap-1">
              {status === 'loading' && !isActive && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              {status === 'ready' && !isActive && preset.prefetchKey !== '24h' && (
                <Check className="h-3 w-3 text-green-500" />
              )}
              {preset.label}
            </span>
          </Button>
        );
      })}
      
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={activePreset === "custom" ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 px-2 text-xs font-medium gap-1",
              activePreset === "custom" && "bg-primary text-primary-foreground"
            )}
          >
            <CalendarIcon className="h-3 w-3" />
            {getCustomLabel()}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            selected={customRange}
            onSelect={handleCustomRangeSelect}
            disabled={(date) => date > today}
            numberOfMonths={2}
            initialFocus
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}