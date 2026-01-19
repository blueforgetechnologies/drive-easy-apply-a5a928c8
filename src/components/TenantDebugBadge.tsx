/**
 * Debug badge showing current tenantId for troubleshooting tenant isolation.
 * Displays prominently on LoadHunter and TenantSettings pages.
 */
import { Badge } from "@/components/ui/badge";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { useTenantContext } from "@/contexts/TenantContext";
import { Bug, AlertTriangle, CheckCircle2 } from "lucide-react";

interface TenantDebugBadgeProps {
  className?: string;
  showFull?: boolean;
}

export function TenantDebugBadge({ className = "", showFull = false }: TenantDebugBadgeProps) {
  const { tenantId, tenantSlug, shouldFilter, isPlatformAdmin, isInternalChannel, tenantEpoch } = useTenantFilter();
  const { effectiveTenant, impersonatedTenant } = useTenantContext();

  // Short ID for display (first 8 chars)
  const shortId = tenantId ? tenantId.slice(0, 8) : "null";
  
  const isImpersonating = !!impersonatedTenant;
  const filterStatus = shouldFilter ? "FILTERED" : "UNFILTERED";
  
  // Determine status color (tenant filtering is now always on when tenantId exists)
  let statusColor = "bg-green-100 text-green-800 border-green-300";
  let StatusIcon = CheckCircle2;
  
  if (isImpersonating) {
    statusColor = "bg-amber-100 text-amber-800 border-amber-300";
    StatusIcon = Bug;
  } else if (!tenantId) {
    statusColor = "bg-gray-100 text-gray-600 border-gray-300";
    StatusIcon = AlertTriangle;
  }

  return (
    <div className={`inline-flex flex-wrap items-center gap-2 text-xs font-mono ${className}`}>
      <Badge 
        variant="outline" 
        className={`${statusColor} border flex items-center gap-1`}
      >
        <StatusIcon className="h-3 w-3" />
        <span className="font-bold">TENANT:</span>
        <span>{tenantSlug || shortId}</span>
      </Badge>
      
      {showFull && (
        <>
          <Badge variant="outline" className="bg-background">
            ID: {shortId}...
          </Badge>
          
          <Badge 
            variant={shouldFilter ? "default" : "destructive"} 
            className="text-xs"
          >
            {filterStatus}
          </Badge>
          
          <Badge variant="outline" className="bg-background text-xs">
            epoch: {tenantEpoch}
          </Badge>
          
          {isImpersonating && (
            <Badge variant="secondary" className="bg-gradient-to-b from-amber-400 to-amber-600 text-white !px-3 !py-1.5 shadow-md">
              IMPERSONATING
            </Badge>
          )}
          
          {isPlatformAdmin && (
            <Badge variant="outline" className="text-purple-600 border-purple-300">
              Platform Admin
            </Badge>
          )}
          
          {isInternalChannel && (
            <Badge variant="outline" className="text-blue-600 border-blue-300">
              Internal
            </Badge>
          )}
        </>
      )}
    </div>
  );
}
