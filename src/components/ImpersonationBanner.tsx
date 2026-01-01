import { Building2, Clock, XCircle, AlertTriangle } from 'lucide-react';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { Button } from '@/components/ui/button';

export function ImpersonationBanner() {
  const { isImpersonating, session, timeRemaining, stopImpersonation, loading } = useImpersonation();

  if (!isImpersonating || !session) return null;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isLowTime = timeRemaining !== null && timeRemaining < 300; // Less than 5 minutes

  return (
    <div 
      className={`sticky top-0 z-50 px-4 py-2 flex items-center justify-between gap-4 ${
        isLowTime 
          ? 'bg-amber-500 text-amber-950' 
          : 'bg-red-600 text-white'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {isLowTime ? (
            <AlertTriangle className="h-5 w-5" />
          ) : (
            <Building2 className="h-5 w-5" />
          )}
          <span className="font-bold text-sm uppercase tracking-wide">
            Impersonating
          </span>
        </div>
        <div className="h-4 w-px bg-current opacity-30" />
        <span className="font-medium">{session.tenant_name}</span>
        <div className="h-4 w-px bg-current opacity-30" />
        <div className="flex items-center gap-1 text-sm">
          <Clock className="h-4 w-4" />
          <span className={isLowTime ? 'font-bold' : ''}>
            {timeRemaining !== null ? formatTime(timeRemaining) : '--:--'} remaining
          </span>
        </div>
      </div>
      
      <Button
        variant="ghost"
        size="sm"
        onClick={stopImpersonation}
        disabled={loading}
        className={`gap-1.5 ${
          isLowTime 
            ? 'text-amber-950 hover:bg-amber-600/50' 
            : 'text-white hover:bg-white/20'
        }`}
      >
        <XCircle className="h-4 w-4" />
        Stop
      </Button>
    </div>
  );
}
