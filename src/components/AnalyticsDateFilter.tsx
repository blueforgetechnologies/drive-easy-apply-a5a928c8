import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, subDays, subWeeks, subMonths, startOfMonth, endOfMonth, getDay, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";

interface AnalyticsDateFilterProps {
  startDate: Date;
  endDate: Date;
  onDateChange: (start: Date, end: Date) => void;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function AnalyticsDateFilter({ startDate, endDate, onDateChange }: AnalyticsDateFilterProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'quick' | 'days' | 'weeks' | 'months' | 'custom'>('quick');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startDate,
    to: endDate
  });

  const today = startOfDay(new Date());
  
  // Get the most recent occurrence of a specific day
  const getMostRecentDay = (dayIndex: number): Date => {
    const todayIndex = getDay(today);
    const daysAgo = todayIndex >= dayIndex ? todayIndex - dayIndex : 7 - (dayIndex - todayIndex);
    return subDays(today, daysAgo);
  };

  const applyPreset = (start: Date, end: Date) => {
    onDateChange(startOfDay(start), endOfDay(end));
    setOpen(false);
  };

  const applyCustomRange = () => {
    if (dateRange?.from) {
      onDateChange(
        startOfDay(dateRange.from),
        endOfDay(dateRange.to || dateRange.from)
      );
      setOpen(false);
    }
  };

  // Format the current selection for display
  const getDisplayText = () => {
    const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    if (diffDays === 1) {
      if (startDate.toDateString() === today.toDateString()) {
        return "Today";
      }
      return format(startDate, "MMM d, yyyy");
    }
    
    if (diffDays === 7) {
      return "Last 7 days";
    }
    if (diffDays === 14) {
      return "Last 2 weeks";
    }
    if (diffDays === 21) {
      return "Last 3 weeks";
    }
    if (diffDays >= 28 && diffDays <= 31) {
      return "Last month";
    }
    
    return `${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2">
          <CalendarIcon className="h-4 w-4" />
          <span>{getDisplayText()}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="w-full grid grid-cols-5 h-9">
            <TabsTrigger value="quick" className="text-xs">Quick</TabsTrigger>
            <TabsTrigger value="days" className="text-xs">Days</TabsTrigger>
            <TabsTrigger value="weeks" className="text-xs">Weeks</TabsTrigger>
            <TabsTrigger value="months" className="text-xs">Months</TabsTrigger>
            <TabsTrigger value="custom" className="text-xs">Custom</TabsTrigger>
          </TabsList>

          {/* Quick Presets */}
          <TabsContent value="quick" className="p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start"
                onClick={() => applyPreset(today, today)}
              >
                Today
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start"
                onClick={() => applyPreset(subDays(today, 1), subDays(today, 1))}
              >
                Yesterday
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start"
                onClick={() => applyPreset(subDays(today, 6), today)}
              >
                Last 7 days
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start"
                onClick={() => applyPreset(subDays(today, 13), today)}
              >
                Last 2 weeks
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start"
                onClick={() => applyPreset(subDays(today, 29), today)}
              >
                Last 30 days
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start"
                onClick={() => applyPreset(subDays(today, 89), today)}
              >
                Last 90 days
              </Button>
            </div>
          </TabsContent>

          {/* Days of Week */}
          <TabsContent value="days" className="p-3 space-y-2">
            <p className="text-xs text-muted-foreground mb-2">Select a day (includes today)</p>
            <div className="grid grid-cols-2 gap-2">
              {DAY_NAMES.map((day, index) => {
                const dayDate = getMostRecentDay(index);
                const isToday = dayDate.toDateString() === today.toDateString();
                return (
                  <Button 
                    key={day}
                    variant="outline" 
                    size="sm" 
                    className="justify-start gap-2"
                    onClick={() => applyPreset(dayDate, today)}
                  >
                    {day}
                    {isToday && <Badge variant="secondary" className="text-[10px] px-1">Today</Badge>}
                  </Button>
                );
              })}
            </div>
          </TabsContent>

          {/* Weeks */}
          <TabsContent value="weeks" className="p-3 space-y-2">
            <div className="grid grid-cols-1 gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start"
                onClick={() => applyPreset(startOfWeek(today), endOfWeek(today))}
              >
                This week
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start"
                onClick={() => applyPreset(startOfWeek(subWeeks(today, 1)), endOfWeek(subWeeks(today, 1)))}
              >
                Last week
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start"
                onClick={() => applyPreset(subDays(today, 6), today)}
              >
                Last 7 days
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start"
                onClick={() => applyPreset(subDays(today, 13), today)}
              >
                Last 2 weeks
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start"
                onClick={() => applyPreset(subDays(today, 20), today)}
              >
                Last 3 weeks
              </Button>
            </div>
          </TabsContent>

          {/* Months */}
          <TabsContent value="months" className="p-3 space-y-2">
            <div className="grid grid-cols-1 gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start"
                onClick={() => applyPreset(startOfMonth(today), endOfMonth(today))}
              >
                This month ({format(today, "MMMM")})
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start"
                onClick={() => applyPreset(startOfMonth(subMonths(today, 1)), endOfMonth(subMonths(today, 1)))}
              >
                Last month ({format(subMonths(today, 1), "MMMM")})
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start"
                onClick={() => applyPreset(subDays(today, 29), today)}
              >
                Last 30 days
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start"
                onClick={() => applyPreset(subDays(today, 59), today)}
              >
                Last 60 days
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start"
                onClick={() => applyPreset(subDays(today, 89), today)}
              >
                Last 90 days
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start"
                onClick={() => applyPreset(startOfMonth(subMonths(today, 2)), endOfMonth(subMonths(today, 2)))}
              >
                2 months ago ({format(subMonths(today, 2), "MMMM")})
              </Button>
            </div>
          </TabsContent>

          {/* Custom Date Range */}
          <TabsContent value="custom" className="p-3 space-y-3">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={setDateRange}
              numberOfMonths={2}
              className="pointer-events-auto"
            />
            <div className="flex justify-between items-center pt-2 border-t">
              <div className="text-xs text-muted-foreground">
                {dateRange?.from && dateRange?.to && (
                  <>
                    {format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}
                  </>
                )}
              </div>
              <Button 
                size="sm" 
                onClick={applyCustomRange}
                disabled={!dateRange?.from}
              >
                Apply
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
