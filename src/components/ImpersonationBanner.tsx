import { Building2, Clock, XCircle, AlertTriangle, Eye, Shield } from 'lucide-react';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useTenantContext } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function ImpersonationBanner() {
  const { isImpersonating, session, timeRemaining, stopImpersonation, loading } = useImpersonation();
  const { currentTenant } = useTenantContext();

  if (!isImpersonating || !session) return null;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isLowTime = timeRemaining !== null && timeRemaining < 300; // Less than 5 minutes
  const isCriticalTime = timeRemaining !== null && timeRemaining < 60; // Less than 1 minute

  return (
    <div 
      className={`sticky top-0 z-50 px-4 py-2.5 flex items-center justify-between gap-4 shadow-lg ${
        isCriticalTime 
          ? 'bg-red-700 text-white animate-pulse' 
          : isLowTime 
            ? 'bg-amber-500 text-amber-950' 
            : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white'
      }`}
    >
      <div className="flex items-center gap-3 flex-wrap">
        {/* Impersonation indicator */}
        <div className="flex items-center gap-2 bg-black/20 rounded-full px-3 py-1">
          {isCriticalTime ? (
            <AlertTriangle className="h-4 w-4 animate-bounce" />
          ) : isLowTime ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
          <span className="font-bold text-xs uppercase tracking-wider">
            Impersonating
          </span>
        </div>

        {/* Tenant being impersonated */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 opacity-80" />
              <span className="font-semibold">{session.tenant_name}</span>
              <Badge variant="outline" className="text-xs border-current/30 bg-white/10">
                {session.tenant_slug}
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Viewing as tenant: {session.tenant_name}</p>
            <p className="text-xs text-muted-foreground mt-1">Reason: {session.reason}</p>
          </TooltipContent>
        </Tooltip>

        {/* Your actual tenant */}
        {currentTenant && currentTenant.id !== session.tenant_id && (
          <>
            <div className="h-4 w-px bg-current opacity-30 hidden sm:block" />
            <div className="hidden sm:flex items-center gap-1.5 text-xs opacity-80">
              <Shield className="h-3.5 w-3.5" />
              <span>Your tenant: {currentTenant.name}</span>
            </div>
          </>
        )}

        {/* Time remaining */}
        <div className="h-4 w-px bg-current opacity-30" />
        <div className={`flex items-center gap-1.5 text-sm ${isCriticalTime ? 'font-bold' : ''}`}>
          <Clock className="h-4 w-4" />
          <span className={isCriticalTime ? 'animate-pulse' : ''}>
            {timeRemaining !== null ? formatTime(timeRemaining) : '--:--'}
          </span>
          <span className="text-xs opacity-80">remaining</span>
        </div>
      </div>
      
      <Button
        variant="ghost"
        size="sm"
        onClick={stopImpersonation}
        disabled={loading}
        className={`gap-1.5 font-medium ${
          isCriticalTime 
            ? 'text-white hover:bg-white/20 border border-white/30' 
            : isLowTime 
              ? 'text-amber-950 hover:bg-amber-600/50' 
              : 'text-white hover:bg-white/20'
        }`}
      >
        <XCircle className="h-4 w-4" />
        <span className="hidden sm:inline">Stop Impersonation</span>
        <span className="sm:hidden">Stop</span>
      </Button>
    </div>
  );
}
