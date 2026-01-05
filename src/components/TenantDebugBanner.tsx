import { useTenantFilter } from '@/hooks/useTenantFilter';
import { useTenantContext } from '@/contexts/TenantContext';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Database, Eye, EyeOff, AlertTriangle, ShieldCheck, ShieldAlert, Filter, FilterX } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Dev-only debug banner showing current tenant context with full isolation diagnostics.
 * SECURITY: "All Tenants" toggle is ONLY shown for platform admins in internal channel.
 */
export function TenantDebugBanner() {
  const { 
    tenantId, 
    tenantSlug, 
    showAllTenants, 
    setShowAllTenants, 
    shouldFilter,
    isPlatformAdmin,
    isInternalChannel,
    canUseAllTenantsMode,
  } = useTenantFilter();
  const { isImpersonating, effectiveTenant, loading: tenantLoading } = useTenantContext();

  // Only show in development
  if (import.meta.env.PROD) {
    return null;
  }

  return (
    <>
      {/* SECURITY: Prominent warning banner when All Tenants mode is active */}
      {showAllTenants && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-destructive text-destructive-foreground py-2 px-4 flex items-center justify-center gap-2 text-sm font-bold shadow-lg">
          <AlertTriangle className="h-4 w-4" />
          <span>⚠ ALL TENANTS MODE — INTERNAL USE ONLY ⚠</span>
          <AlertTriangle className="h-4 w-4" />
        </div>
      )}
      
      <div className={cn(
        "fixed bottom-4 left-4 z-50 flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-mono shadow-lg border max-w-md",
        showAllTenants
          ? "bg-destructive/90 border-destructive text-destructive-foreground"
          : isImpersonating 
            ? "bg-amber-950/90 border-amber-500/50 text-amber-200" 
            : "bg-slate-900/90 border-slate-700 text-slate-300"
      )}>
        <Database className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        
        <div className="flex flex-col gap-1 min-w-0">
          {/* Row 1: Tenant + Status Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">tenant:</span>
            <span className="text-white font-semibold truncate">{tenantSlug || 'none'}</span>
            {tenantLoading && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-blue-500 text-blue-400 animate-pulse">
                loading
              </Badge>
            )}
            {isImpersonating && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-500 text-amber-400">
                impersonating
              </Badge>
            )}
            {effectiveTenant?.release_channel && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                {effectiveTenant.release_channel}
              </Badge>
            )}
          </div>
          
          {/* Row 2: Tenant ID */}
          <div className="text-[10px] text-muted-foreground truncate">
            {tenantId || 'no tenant selected'}
          </div>
          
          {/* Row 3: Isolation Status Indicators */}
          <div className="flex items-center gap-2 flex-wrap text-[10px]">
            {/* shouldFilter indicator */}
            <div className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded",
              shouldFilter ? "bg-green-900/50 text-green-300" : "bg-red-900/50 text-red-300"
            )}>
              {shouldFilter ? <Filter className="h-2.5 w-2.5" /> : <FilterX className="h-2.5 w-2.5" />}
              <span>filter:{shouldFilter ? 'ON' : 'OFF'}</span>
            </div>
            
            {/* isPlatformAdmin indicator */}
            <div className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded",
              isPlatformAdmin ? "bg-purple-900/50 text-purple-300" : "bg-slate-800/50 text-slate-400"
            )}>
              {isPlatformAdmin ? <ShieldCheck className="h-2.5 w-2.5" /> : <ShieldAlert className="h-2.5 w-2.5" />}
              <span>admin:{isPlatformAdmin ? 'Y' : 'N'}</span>
            </div>
            
            {/* isInternalChannel indicator */}
            <div className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded",
              isInternalChannel ? "bg-blue-900/50 text-blue-300" : "bg-slate-800/50 text-slate-400"
            )}>
              <span>internal:{isInternalChannel ? 'Y' : 'N'}</span>
            </div>
            
            {/* showAllTenants indicator */}
            {showAllTenants && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/50 text-destructive-foreground font-bold">
                <AlertTriangle className="h-2.5 w-2.5" />
                <span>ALL_TENANTS</span>
              </div>
            )}
          </div>
        </div>

        {/* SECURITY: Only show toggle for platform admins in internal channel */}
        {canUseAllTenantsMode && (
          <>
            <div className="w-px h-8 bg-slate-700 flex-shrink-0" />
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              {showAllTenants ? (
                <Eye className="h-3.5 w-3.5 text-destructive-foreground" />
              ) : (
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <Switch
                checked={showAllTenants}
                onCheckedChange={setShowAllTenants}
                className="h-4 w-7 data-[state=checked]:bg-destructive"
              />
              <span className="text-[9px] text-muted-foreground">all</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
