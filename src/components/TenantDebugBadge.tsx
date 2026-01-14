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
  const { tenantId, tenantSlug, shouldFilter, isPlatformAdmin, showAllTenants, isInternalChannel } = useTenantFilter();
  const { effectiveTenant, impersonatedTenant } = useTenantContext();

  // Short ID for display (first 8 chars)
  const shortId = tenantId ? tenantId.slice(0, 8) : "null";
  
  const isImpersonating = !!impersonatedTenant;
  const filterStatus = shouldFilter ? "FILTERED" : "UNFILTERED";
  
  // Determine status color
  let statusColor = "bg-green-100 text-green-800 border-green-300";
  let StatusIcon = CheckCircle2;
  
  if (showAllTenants) {
    statusColor = "bg-red-100 text-red-800 border-red-300";
    StatusIcon = AlertTriangle;
  } else if (isImpersonating) {
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
          
          {isImpersonating && (
            <Badge variant="secondary" className="bg-amber-500 text-white">
              IMPERSONATING
            </Badge>
          )}
          
          {showAllTenants && (
            <Badge variant="destructive" className="animate-pulse">
              ⚠️ ALL TENANTS MODE
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
