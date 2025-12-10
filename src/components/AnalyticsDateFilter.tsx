import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon } from "lucide-react";
import { format, startOfDay, endOfDay, subDays, subMonths, subYears, previousMonday, previousSunday, previousSaturday, previousFriday, previousThursday, previousWednesday, previousTuesday, isMonday, isSunday, isSaturday, isFriday, isThursday, isWednesday, isTuesday } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface AnalyticsDateFilterProps {
  startDate: Date;
  endDate: Date;
  onDateChange: (start: Date, end: Date) => void;
}

type PresetOption = {
  label: string;
  value: string;
  getRange: () => { start: Date; end: Date };
};

export function AnalyticsDateFilter({ startDate, endDate, onDateChange }: AnalyticsDateFilterProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>("today");
  const [customRange, setCustomRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined
  });
  const today = new Date();

  const getLastDayOfWeek = (dayCheck: (date: Date) => boolean, getPrevious: (date: Date) => Date) => {
    if (dayCheck(today)) return today;
    return getPrevious(today);
  };

  const getDayWithDate = (dayCheck: (date: Date) => boolean, getPrevious: (date: Date) => Date, shortName: string) => {
    const date = getLastDayOfWeek(dayCheck, getPrevious);
    return `${shortName} ${format(date, "M/d")}`;
  };

  const presets: PresetOption[] = [
    {
      label: "Today",
      value: "today",
      getRange: () => ({ start: startOfDay(today), end: endOfDay(today) })
    },
    {
      label: getDayWithDate(isMonday, previousMonday, "Mon"),
      value: "monday",
      getRange: () => {
        const day = getLastDayOfWeek(isMonday, previousMonday);
        return { start: startOfDay(day), end: endOfDay(day) };
      }
    },
    {
      label: getDayWithDate(isTuesday, previousTuesday, "Tue"),
      value: "tuesday",
      getRange: () => {
        const day = getLastDayOfWeek(isTuesday, previousTuesday);
        return { start: startOfDay(day), end: endOfDay(day) };
      }
    },
    {
      label: getDayWithDate(isWednesday, previousWednesday, "Wed"),
      value: "wednesday",
      getRange: () => {
        const day = getLastDayOfWeek(isWednesday, previousWednesday);
        return { start: startOfDay(day), end: endOfDay(day) };
      }
    },
    {
      label: getDayWithDate(isThursday, previousThursday, "Thu"),
      value: "thursday",
      getRange: () => {
        const day = getLastDayOfWeek(isThursday, previousThursday);
        return { start: startOfDay(day), end: endOfDay(day) };
      }
    },
    {
      label: getDayWithDate(isFriday, previousFriday, "Fri"),
      value: "friday",
      getRange: () => {
        const day = getLastDayOfWeek(isFriday, previousFriday);
        return { start: startOfDay(day), end: endOfDay(day) };
      }
    },
    {
      label: getDayWithDate(isSaturday, previousSaturday, "Sat"),
      value: "saturday",
      getRange: () => {
        const day = getLastDayOfWeek(isSaturday, previousSaturday);
        return { start: startOfDay(day), end: endOfDay(day) };
      }
    },
    {
      label: getDayWithDate(isSunday, previousSunday, "Sun"),
      value: "sunday",
      getRange: () => {
        const day = getLastDayOfWeek(isSunday, previousSunday);
        return { start: startOfDay(day), end: endOfDay(day) };
      }
    },
    {
      label: "3 Days",
      value: "3days",
      getRange: () => ({ start: startOfDay(subDays(today, 2)), end: endOfDay(today) })
    },
    {
      label: "7 Days",
      value: "7days",
      getRange: () => ({ start: startOfDay(subDays(today, 6)), end: endOfDay(today) })
    },
    {
      label: "30 Days",
      value: "30days",
      getRange: () => ({ start: startOfDay(subDays(today, 29)), end: endOfDay(today) })
    },
    {
      label: "90 Days",
      value: "90days",
      getRange: () => ({ start: startOfDay(subDays(today, 89)), end: endOfDay(today) })
    },
    {
      label: "6 Months",
      value: "6months",
      getRange: () => ({ start: startOfDay(subMonths(today, 6)), end: endOfDay(today) })
    },
    {
      label: "1 Year",
      value: "1year",
      getRange: () => ({ start: startOfDay(subYears(today, 1)), end: endOfDay(today) })
    }
  ];

  const handlePresetClick = (preset: PresetOption) => {
    setSelectedPreset(preset.value);
    setCustomRange({ from: undefined, to: undefined });
    const { start, end } = preset.getRange();
    onDateChange(start, end);
  };

  const handleCustomRangeSelect = (range: { from: Date | undefined; to: Date | undefined } | undefined) => {
    if (!range) return;
    
    setCustomRange(range);
    setSelectedPreset("custom");
    
    if (range.from && range.to) {
      onDateChange(startOfDay(range.from), endOfDay(range.to));
    } else if (range.from) {
      onDateChange(startOfDay(range.from), endOfDay(range.from));
    }
  };

  const getCustomLabel = () => {
    if (customRange.from && customRange.to) {
      return `${format(customRange.from, "M/d")} - ${format(customRange.to, "M/d")}`;
    }
    if (customRange.from) {
      return format(customRange.from, "M/d");
    }
    return "Custom";
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {presets.map((preset) => (
        <Button
          key={preset.value}
          variant={selectedPreset === preset.value ? "default" : "outline"}
          size="sm"
          className={cn(
            "h-7 px-2 text-xs font-medium",
            selectedPreset === preset.value && "bg-primary text-primary-foreground"
          )}
          onClick={() => handlePresetClick(preset)}
        >
          {preset.label}
        </Button>
      ))}
      
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={selectedPreset === "custom" ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 px-2 text-xs font-medium gap-1",
              selectedPreset === "custom" && "bg-primary text-primary-foreground"
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
