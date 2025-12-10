import { ChevronLeft, ChevronRight, X, History, Calendar, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, isToday } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';

interface VehicleHistoryControlsProps {
  isActive: boolean;
  selectedDate: Date;
  selectedVehicleName: string | null;
  pointsCount: number;
  loading: boolean;
  hasStarted: boolean;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onDateSelect: (date: Date) => void;
  onStart: () => void;
  onClose: () => void;
}

export function VehicleHistoryControls({
  isActive,
  selectedDate,
  selectedVehicleName,
  pointsCount,
  loading,
  hasStarted,
  onPreviousDay,
  onNextDay,
  onDateSelect,
  onStart,
  onClose,
}: VehicleHistoryControlsProps) {
  if (!isActive) return null;

  const canGoNext = !isToday(selectedDate);

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
      <div className="flex items-center gap-2 bg-background/95 backdrop-blur-xl border rounded-full px-3 py-2 shadow-xl">
        {/* History icon */}
        <div className="flex items-center gap-2 px-2 border-r border-border">
          <History className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {selectedVehicleName || 'Vehicle'} History
          </span>
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onPreviousDay}
            disabled={hasStarted && loading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className="h-7 px-3 text-sm font-medium"
                disabled={hasStarted && loading}
              >
                <Calendar className="h-3.5 w-3.5 mr-2" />
                {format(selectedDate, 'MMM d, yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <CalendarComponent
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && onDateSelect(date)}
                disabled={(date) => date > new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onNextDay}
            disabled={!canGoNext || (hasStarted && loading)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Start button or points count */}
        <div className="flex items-center gap-2 px-2 border-l border-border">
          {!hasStarted ? (
            <Button
              variant="default"
              size="sm"
              className="h-7 px-3 text-xs gap-1.5"
              onClick={onStart}
            >
              <Play className="h-3.5 w-3.5" />
              Start
            </Button>
          ) : loading ? (
            <span className="text-xs text-muted-foreground">Loading...</span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {pointsCount} point{pointsCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 ml-1"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
