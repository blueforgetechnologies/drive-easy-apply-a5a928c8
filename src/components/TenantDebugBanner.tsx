import { useTenantFilter } from '@/hooks/useTenantFilter';
import { useTenantContext } from '@/contexts/TenantContext';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Database, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Dev-only debug banner showing current tenant context.
 * Only renders in development mode.
 */
export function TenantDebugBanner() {
  const { tenantId, tenantSlug, showAllTenants, setShowAllTenants, isPlatformAdmin } = useTenantFilter();
  const { isImpersonating } = useTenantContext();

  // Only show in development
  if (import.meta.env.PROD) {
    return null;
  }

  return (
    <div className={cn(
      "fixed bottom-4 left-4 z-50 flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-mono shadow-lg border",
      isImpersonating 
        ? "bg-amber-950/90 border-amber-500/50 text-amber-200" 
        : "bg-slate-900/90 border-slate-700 text-slate-300"
    )}>
      <Database className="h-3.5 w-3.5 text-muted-foreground" />
      
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">tenant:</span>
          <span className="text-white font-semibold">{tenantSlug || 'none'}</span>
          {isImpersonating && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-500 text-amber-400">
              impersonating
            </Badge>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">
          {tenantId || 'no tenant selected'}
        </div>
      </div>

      {isPlatformAdmin && (
        <>
          <div className="w-px h-6 bg-slate-700" />
          <div className="flex items-center gap-2">
            {showAllTenants ? (
              <Eye className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="text-muted-foreground">all:</span>
            <Switch
              checked={showAllTenants}
              onCheckedChange={setShowAllTenants}
              className="h-4 w-7 data-[state=checked]:bg-amber-500"
            />
          </div>
        </>
      )}
    </div>
  );
}
