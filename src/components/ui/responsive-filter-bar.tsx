import { cn } from "@/lib/utils";
import { Input } from "./input";
import { Button } from "./button";
import { Search, Plus, Filter } from "lucide-react";
import { ReactNode, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./sheet";

interface ResponsiveFilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  actions?: ReactNode;
  addButton?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
  className?: string;
}

export function ResponsiveFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  filters,
  actions,
  addButton,
  className,
}: ResponsiveFilterBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Search and primary actions */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        
        {/* Mobile filter button */}
        {filters && (
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 px-3 md:hidden shrink-0">
                <Filter className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto max-h-[80vh]">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="py-4 space-y-4">
                {filters}
              </div>
            </SheetContent>
          </Sheet>
        )}
        
        {/* Desktop filters inline */}
        <div className="hidden md:flex items-center gap-2">
          {filters}
        </div>
        
        {addButton && (
          <Button
            onClick={addButton.onClick}
            size="sm"
            className="h-9 shrink-0"
          >
            {addButton.icon || <Plus className="h-4 w-4" />}
            <span className="hidden sm:inline ml-1">{addButton.label}</span>
          </Button>
        )}
      </div>
      
      {/* Secondary actions row */}
      {actions && (
        <div className="flex items-center gap-2 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}