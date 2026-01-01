import { Building2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTenantContext } from "@/hooks/useTenantContext";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const releaseChannelColors: Record<string, string> = {
  stable: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  beta: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  alpha: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  canary: "bg-rose-500/20 text-rose-400 border-rose-500/30",
};

const statusColors: Record<string, string> = {
  active: "text-emerald-400",
  suspended: "text-destructive",
  pending: "text-amber-400",
};

export function TenantIndicator() {
  const { currentTenant, loading } = useTenantContext();

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 animate-pulse">
        <div className="h-4 w-4 rounded bg-muted" />
        <div className="h-4 w-24 rounded bg-muted" />
      </div>
    );
  }

  if (!currentTenant) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-destructive/10 border border-destructive/30 cursor-help">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">
              Tenant: Not Selected
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>No tenant context. You may not have access to tenant data.</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const channelClass = releaseChannelColors[currentTenant.release_channel] || releaseChannelColors.stable;
  const statusClass = statusColors[currentTenant.status] || "text-muted-foreground";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 border border-border/50 cursor-default hover:bg-muted/70 transition-colors">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground truncate max-w-[140px]">
            {currentTenant.name}
          </span>
          <Badge 
            variant="outline" 
            className={cn("text-[10px] px-1.5 py-0 h-5 uppercase font-semibold", channelClass)}
          >
            {currentTenant.release_channel}
          </Badge>
          {currentTenant.status !== 'active' && (
            <span className={cn("text-[10px] uppercase font-medium", statusClass)}>
              ({currentTenant.status})
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs space-y-1">
          <p><strong>Tenant:</strong> {currentTenant.name}</p>
          <p><strong>Channel:</strong> {currentTenant.release_channel}</p>
          <p><strong>Status:</strong> {currentTenant.status}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
