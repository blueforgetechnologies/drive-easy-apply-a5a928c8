import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon } from "lucide-react";
import { format, startOfDay, endOfDay, subDays, subMonths, subYears, previousMonday, previousSunday, previousSaturday, previousFriday, previousThursday, previousWednesday, isMonday, isSunday, isSaturday, isFriday, isThursday, isWednesday } from "date-fns";
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
  const [customDate, setCustomDate] = useState<Date | undefined>();
  const today = new Date();

  const getLastDayOfWeek = (dayCheck: (date: Date) => boolean, getPrevious: (date: Date) => Date) => {
    if (dayCheck(today)) return today;
    return getPrevious(today);
  };

  const presets: PresetOption[] = [
    {
      label: "Today",
      value: "today",
      getRange: () => ({ start: startOfDay(today), end: endOfDay(today) })
    },
    {
      label: "Mon",
      value: "monday",
      getRange: () => {
        const day = getLastDayOfWeek(isMonday, previousMonday);
        return { start: startOfDay(day), end: endOfDay(day) };
      }
    },
    {
      label: "Sun",
      value: "sunday",
      getRange: () => {
        const day = getLastDayOfWeek(isSunday, previousSunday);
        return { start: startOfDay(day), end: endOfDay(day) };
      }
    },
    {
      label: "Sat",
      value: "saturday",
      getRange: () => {
        const day = getLastDayOfWeek(isSaturday, previousSaturday);
        return { start: startOfDay(day), end: endOfDay(day) };
      }
    },
    {
      label: "Fri",
      value: "friday",
      getRange: () => {
        const day = getLastDayOfWeek(isFriday, previousFriday);
        return { start: startOfDay(day), end: endOfDay(day) };
      }
    },
    {
      label: "Thu",
      value: "thursday",
      getRange: () => {
        const day = getLastDayOfWeek(isThursday, previousThursday);
        return { start: startOfDay(day), end: endOfDay(day) };
      }
    },
    {
      label: "Wed",
      value: "wednesday",
      getRange: () => {
        const day = getLastDayOfWeek(isWednesday, previousWednesday);
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
    setCustomDate(undefined);
    const { start, end } = preset.getRange();
    onDateChange(start, end);
  };

  const handleCustomDateSelect = (date: Date | undefined) => {
    if (date) {
      setCustomDate(date);
      setSelectedPreset("custom");
      onDateChange(startOfDay(date), endOfDay(date));
    }
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {presets.map((preset) => (
        <Button
          key={preset.value}
          variant={selectedPreset === preset.value ? "default" : "outline"}
          size="sm"
          className={cn(
            "h-7 px-2.5 text-xs font-medium",
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
              "h-7 px-2.5 text-xs font-medium gap-1",
              selectedPreset === "custom" && "bg-primary text-primary-foreground"
            )}
          >
            <CalendarIcon className="h-3 w-3" />
            {customDate ? format(customDate, "MMM d") : "Custom"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={customDate}
            onSelect={handleCustomDateSelect}
            disabled={(date) => date > today}
            initialFocus
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
