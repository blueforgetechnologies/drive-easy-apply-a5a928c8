import { RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface RefreshControlProps {
  lastRefresh: Date;
  refreshInterval: number;
  onIntervalChange: (interval: number) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  label?: string;
}

export function RefreshControl({
  lastRefresh,
  refreshInterval,
  onIntervalChange,
  onRefresh,
  isRefreshing = false,
  label = "stats"
}: RefreshControlProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {refreshInterval / 1000}s
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <Settings className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-36 p-2" align="end">
          <Select
            value={refreshInterval.toString()}
            onValueChange={(value) => {
              onIntervalChange(parseInt(value));
              toast.success(`Refresh: ${parseInt(value) / 1000}s`);
            }}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10000">10s</SelectItem>
              <SelectItem value="20000">20s</SelectItem>
              <SelectItem value="30000">30s</SelectItem>
              <SelectItem value="60000">1m</SelectItem>
              <SelectItem value="120000">2m</SelectItem>
            </SelectContent>
          </Select>
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={onRefresh}
        disabled={isRefreshing}
      >
        <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  );
}
