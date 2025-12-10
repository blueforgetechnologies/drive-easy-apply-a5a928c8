import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { format, startOfDay, endOfDay, getDaysInMonth, setYear, setMonth, setDate, subYears } from "date-fns";
import { cn } from "@/lib/utils";

interface AnalyticsDateFilterProps {
  startDate: Date;
  endDate: Date;
  onDateChange: (start: Date, end: Date) => void;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

// Generate years from 2020 to current year
const generateYears = () => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = 2020; y <= currentYear; y++) {
    years.push(y);
  }
  return years;
};

const YEARS = generateYears();

export function AnalyticsDateFilter({ startDate, endDate, onDateChange }: AnalyticsDateFilterProps) {
  const today = startOfDay(new Date());
  
  // Selected date state
  const [selectedYear, setSelectedYear] = useState(startDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(startDate.getMonth());
  const [selectedDay, setSelectedDay] = useState(startDate.getDate());
  
  // Scroll refs
  const yearScrollRef = useRef<HTMLDivElement>(null);
  const monthScrollRef = useRef<HTMLDivElement>(null);
  const dayScrollRef = useRef<HTMLDivElement>(null);

  // Days in selected month
  const daysInMonth = getDaysInMonth(new Date(selectedYear, selectedMonth, 1));
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Check if selection is valid (not in future)
  const isValidDate = (year: number, month: number, day: number) => {
    const date = new Date(year, month, day);
    return date <= today;
  };

  // Apply date selection
  const applyDate = (year: number, month: number, day: number) => {
    if (!isValidDate(year, month, day)) return;
    
    const newDate = new Date(year, month, day);
    onDateChange(startOfDay(newDate), endOfDay(newDate));
  };

  // Handle year change
  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    // Adjust day if necessary
    const maxDays = getDaysInMonth(new Date(year, selectedMonth, 1));
    const newDay = Math.min(selectedDay, maxDays);
    setSelectedDay(newDay);
    if (isValidDate(year, selectedMonth, newDay)) {
      applyDate(year, selectedMonth, newDay);
    }
  };

  // Handle month change
  const handleMonthChange = (month: number) => {
    setSelectedMonth(month);
    // Adjust day if necessary
    const maxDays = getDaysInMonth(new Date(selectedYear, month, 1));
    const newDay = Math.min(selectedDay, maxDays);
    setSelectedDay(newDay);
    if (isValidDate(selectedYear, month, newDay)) {
      applyDate(selectedYear, month, newDay);
    }
  };

  // Handle day change
  const handleDayChange = (day: number) => {
    setSelectedDay(day);
    if (isValidDate(selectedYear, selectedMonth, day)) {
      applyDate(selectedYear, selectedMonth, day);
    }
  };

  // Scroll helpers
  const scroll = (ref: React.RefObject<HTMLDivElement>, direction: 'left' | 'right') => {
    if (ref.current) {
      const scrollAmount = direction === 'left' ? -150 : 150;
      ref.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Jump to today
  const goToToday = () => {
    const now = new Date();
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth());
    setSelectedDay(now.getDate());
    applyDate(now.getFullYear(), now.getMonth(), now.getDate());
  };

  // Check if a date is selected
  const isSelected = (year: number, month: number, day: number) => {
    return startDate.getFullYear() === year && 
           startDate.getMonth() === month && 
           startDate.getDate() === day;
  };

  // Sync state when props change
  useEffect(() => {
    setSelectedYear(startDate.getFullYear());
    setSelectedMonth(startDate.getMonth());
    setSelectedDay(startDate.getDate());
  }, [startDate]);

  return (
    <div className="flex flex-col gap-1 bg-background border rounded-lg p-2">
      {/* Year Row */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => scroll(yearScrollRef, 'left')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <div 
          ref={yearScrollRef}
          className="flex gap-1 overflow-x-auto scrollbar-hide flex-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {YEARS.map(year => (
            <Button
              key={year}
              variant={selectedYear === year ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-7 px-3 shrink-0 text-xs font-medium",
                selectedYear === year && "bg-primary text-primary-foreground"
              )}
              onClick={() => handleYearChange(year)}
            >
              {year}
            </Button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => scroll(yearScrollRef, 'right')}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 shrink-0 text-xs ml-1"
          onClick={goToToday}
        >
          Today
        </Button>
      </div>

      {/* Month Row */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => scroll(monthScrollRef, 'left')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <div 
          ref={monthScrollRef}
          className="flex gap-1 overflow-x-auto scrollbar-hide flex-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {MONTHS.map((month, idx) => {
            const isFuture = selectedYear === today.getFullYear() && idx > today.getMonth();
            return (
              <Button
                key={month}
                variant={selectedMonth === idx ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-7 px-3 shrink-0 text-xs font-medium",
                  selectedMonth === idx && "bg-primary text-primary-foreground",
                  isFuture && "opacity-40 cursor-not-allowed"
                )}
                onClick={() => !isFuture && handleMonthChange(idx)}
                disabled={isFuture}
              >
                {month}
              </Button>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => scroll(monthScrollRef, 'right')}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day Row */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => scroll(dayScrollRef, 'left')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <div 
          ref={dayScrollRef}
          className="flex gap-1 overflow-x-auto scrollbar-hide flex-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {days.map(day => {
            const isFuture = !isValidDate(selectedYear, selectedMonth, day);
            const isCurrentSelection = isSelected(selectedYear, selectedMonth, day);
            return (
              <Button
                key={day}
                variant={isCurrentSelection ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-7 w-8 px-0 shrink-0 text-xs font-medium",
                  isCurrentSelection && "bg-primary text-primary-foreground",
                  isFuture && "opacity-40 cursor-not-allowed"
                )}
                onClick={() => !isFuture && handleDayChange(day)}
                disabled={isFuture}
              >
                {day}
              </Button>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => scroll(dayScrollRef, 'right')}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Current Selection Display */}
      <div className="flex items-center justify-center gap-2 pt-1 border-t mt-1">
        <CalendarIcon className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          Selected: <span className="font-medium text-foreground">{format(startDate, "EEEE, MMMM d, yyyy")}</span>
        </span>
      </div>
    </div>
  );
}
