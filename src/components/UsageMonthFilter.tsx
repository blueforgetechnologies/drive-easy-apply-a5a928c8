import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface UsageMonthFilterProps {
  selectedMonth: string; // YYYY-MM format or "all"
  onMonthChange: (month: string) => void;
  className?: string;
}

const getMonthLabel = (monthStr: string): string => {
  if (monthStr === "all") return "All Time";
  
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  if (monthStr === currentMonth) {
    return "This Month";
  }
  
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

const getRecentMonths = (count: number = 6): string[] => {
  const months: string[] = [];
  const now = new Date();
  
  for (let i = 0; i < count; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }
  
  return months;
};

export function UsageMonthFilter({ selectedMonth, onMonthChange, className }: UsageMonthFilterProps) {
  const [months, setMonths] = useState<string[]>([]);
  const [startIndex, setStartIndex] = useState(0);
  const visibleCount = 5;

  useEffect(() => {
    setMonths(getRecentMonths(12));
  }, []);

  const visibleMonths = months.slice(startIndex, startIndex + visibleCount);

  const canScrollLeft = startIndex > 0;
  const canScrollRight = startIndex + visibleCount < months.length;

  const scrollLeft = () => {
    if (canScrollLeft) setStartIndex(startIndex - 1);
  };

  const scrollRight = () => {
    if (canScrollRight) setStartIndex(startIndex + 1);
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* All Time button - always visible */}
      <Button
        variant={selectedMonth === "all" ? "default" : "outline"}
        size="sm"
        className={cn(
          "h-8 px-3 text-xs font-medium whitespace-nowrap transition-all shrink-0",
          selectedMonth === "all" && "bg-primary text-primary-foreground"
        )}
        onClick={() => onMonthChange("all")}
      >
        All Time
      </Button>
      
      <div className="w-px h-6 bg-border mx-1" />
      
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={scrollLeft}
        disabled={!canScrollLeft}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      
      <div className="flex gap-1 overflow-hidden">
        {visibleMonths.map((month) => (
          <Button
            key={month}
            variant={selectedMonth === month ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-8 px-3 text-xs font-medium whitespace-nowrap transition-all",
              selectedMonth === month && "bg-primary text-primary-foreground"
            )}
            onClick={() => onMonthChange(month)}
          >
            {getMonthLabel(month)}
          </Button>
        ))}
      </div>
      
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={scrollRight}
        disabled={!canScrollRight}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export { getMonthLabel, getRecentMonths };
