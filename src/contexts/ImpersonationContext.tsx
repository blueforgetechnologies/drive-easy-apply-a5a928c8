import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const STORAGE_KEY = 'tms.adminImpersonationSession';

interface ImpersonationSession {
  session_id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  expires_at: string;
  reason: string;
}

interface ImpersonationContextValue {
  isImpersonating: boolean;
  session: ImpersonationSession | null;
  loading: boolean;
  startImpersonation: (tenantId: string, reason: string, durationMinutes: number) => Promise<boolean>;
  stopImpersonation: () => Promise<boolean>;
  timeRemaining: number | null; // seconds
}

const ImpersonationContext = createContext<ImpersonationContextValue | null>(null);

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ImpersonationSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  // Load session from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ImpersonationSession;
        const expiresAt = new Date(parsed.expires_at).getTime();
        const now = Date.now();
        
        if (expiresAt > now) {
          setSession(parsed);
        } else {
          // Session expired
          localStorage.removeItem(STORAGE_KEY);
          toast.info('Impersonation session expired');
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Update time remaining every second when impersonating
  useEffect(() => {
    if (!session) {
      setTimeRemaining(null);
      return;
    }

    const updateRemaining = () => {
      const expiresAt = new Date(session.expires_at).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
      
      if (remaining === 0) {
        // Session expired
        setSession(null);
        localStorage.removeItem(STORAGE_KEY);
        toast.info('Impersonation session expired');
        return false;
      }
      
      setTimeRemaining(remaining);
      return true;
    };

    // Initial update
    if (!updateRemaining()) return;

    const interval = setInterval(() => {
      if (!updateRemaining()) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [session]);

  const startImpersonation = useCallback(async (
    tenantId: string, 
    reason: string, 
    durationMinutes: number
  ): Promise<boolean> => {
    setLoading(true);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) {
        toast.error('Not authenticated');
        return false;
      }

      const { data, error } = await supabase.functions.invoke('admin-start-impersonation', {
        body: { tenant_id: tenantId, reason, duration_minutes: durationMinutes },
      });

      if (error) {
        toast.error(error.message || 'Failed to start impersonation');
        return false;
      }

      if (data?.error) {
        toast.error(data.error);
        return false;
      }

      const newSession: ImpersonationSession = {
        session_id: data.session.id,
        tenant_id: data.session.tenant_id,
        tenant_name: data.session.tenant_name,
        tenant_slug: data.session.tenant_slug,
        expires_at: data.session.expires_at,
        reason,
      };

      setSession(newSession);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
      
      // Dispatch event to notify TenantContext
      window.dispatchEvent(new CustomEvent('impersonation-changed'));
      
      toast.success(`Now impersonating ${data.session.tenant_name}`);
      return true;
    } catch (err) {
      console.error('Error starting impersonation:', err);
      toast.error('Failed to start impersonation');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const stopImpersonation = useCallback(async (): Promise<boolean> => {
    if (!session) return false;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-stop-impersonation', {
        body: { session_id: session.session_id },
      });

      if (error) {
        toast.error(error.message || 'Failed to stop impersonation');
        return false;
      }

      if (data?.error) {
        toast.error(data.error);
        return false;
      }

      setSession(null);
      localStorage.removeItem(STORAGE_KEY);
      
      // Dispatch event to notify TenantContext
      window.dispatchEvent(new CustomEvent('impersonation-changed'));
      
      toast.success('Impersonation session ended');
      return true;
    } catch (err) {
      console.error('Error stopping impersonation:', err);
      toast.error('Failed to stop impersonation');
      return false;
    } finally {
      setLoading(false);
    }
  }, [session]);

  return (
    <ImpersonationContext.Provider value={{
      isImpersonating: !!session,
      session,
      loading,
      startImpersonation,
      stopImpersonation,
      timeRemaining,
    }}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const context = useContext(ImpersonationContext);
  if (!context) {
    throw new Error('useImpersonation must be used within an ImpersonationProvider');
  }
  return context;
}
