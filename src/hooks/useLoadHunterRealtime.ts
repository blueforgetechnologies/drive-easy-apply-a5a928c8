import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseLoadHunterRealtimeProps {
  tenantId: string | null;
  onEmailInsert: (payload: any) => void;
  onHuntPlanChange: () => void;
  onMatchChange: (payload: any) => void;
  onVehicleChange: () => void;
  playAlertSound?: (force?: boolean) => void;
  showSystemNotification?: (title: string, body: string) => void;
  isTabHidden?: boolean;
  isSoundMuted?: boolean;
}

export function useLoadHunterRealtime({
  tenantId,
  onEmailInsert,
  onHuntPlanChange,
  onMatchChange,
  onVehicleChange,
  playAlertSound,
  showSystemNotification,
  isTabHidden = false,
  isSoundMuted = false,
}: UseLoadHunterRealtimeProps) {
  // Refs for channel cleanup
  const emailsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const huntPlansChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const matchesChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const vehiclesChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Cleanup function
  const cleanupChannels = useCallback(() => {
    console.log('[Realtime] cleanupChannels() called');
    if (emailsChannelRef.current) {
      supabase.removeChannel(emailsChannelRef.current);
      emailsChannelRef.current = null;
    }
    if (huntPlansChannelRef.current) {
      supabase.removeChannel(huntPlansChannelRef.current);
      huntPlansChannelRef.current = null;
    }
    if (matchesChannelRef.current) {
      supabase.removeChannel(matchesChannelRef.current);
      matchesChannelRef.current = null;
    }
    if (vehiclesChannelRef.current) {
      supabase.removeChannel(vehiclesChannelRef.current);
      vehiclesChannelRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Always cleanup existing channels first
    cleanupChannels();

    // Don't subscribe if no tenant
    if (!tenantId) {
      console.log('[Realtime] No tenantId, skipping subscriptions');
      return cleanupChannels;
    }

    console.log(`[Realtime] Setting up tenant-scoped channels for tenant: ${tenantId}`);

    // Subscribe to load_emails changes
    emailsChannelRef.current = supabase
      .channel(`load-emails-changes-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'load_emails',
          filter: `tenant_id=eq.${tenantId}`
        },
        (payload) => {
          const newEmail = payload.new as any;
          if (newEmail?.tenant_id !== tenantId) {
            console.warn('[Realtime] Ignoring cross-tenant email insert');
            return;
          }
          console.log(`[Realtime] New load email for tenant ${tenantId}:`, payload);
          onEmailInsert(payload);
        }
      )
      .subscribe();

    // Subscribe to hunt_plans changes
    huntPlansChannelRef.current = supabase
      .channel(`hunt-plans-changes-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hunt_plans',
          filter: `tenant_id=eq.${tenantId}`
        },
        (payload) => {
          const record = (payload.new || payload.old) as any;
          if (record?.tenant_id !== tenantId) {
            console.warn('[Realtime] Ignoring cross-tenant hunt plan change');
            return;
          }
          console.log(`[Realtime] Hunt plan change for tenant ${tenantId}:`, payload);
          onHuntPlanChange();
        }
      )
      .subscribe();

    // Subscribe to load_hunt_matches changes
    matchesChannelRef.current = supabase
      .channel(`load-hunt-matches-changes-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'load_hunt_matches',
          filter: `tenant_id=eq.${tenantId}`
        },
        (payload) => {
          const record = (payload.new || payload.old) as any;
          if (record?.tenant_id !== tenantId) {
            console.warn('[Realtime] Ignoring cross-tenant match change');
            return;
          }
          console.log(`[Realtime] Match change for tenant ${tenantId}:`, payload);
          
          // Play sound for new active matches
          if (payload.eventType === 'INSERT' && record?.match_status === 'active') {
            console.log('🔔 NEW MATCH - playing sound and refreshing');
            if (playAlertSound && !isSoundMuted) {
              playAlertSound(false);
            }
            if (isTabHidden && showSystemNotification) {
              showSystemNotification(
                '🚛 New Load Match!',
                'A new load matches one of your hunt plans.'
              );
            }
          }
          
          onMatchChange(payload);
        }
      )
      .subscribe();

    // Subscribe to vehicles changes
    vehiclesChannelRef.current = supabase
      .channel(`vehicles-changes-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vehicles',
          filter: `tenant_id=eq.${tenantId}`
        },
        (payload) => {
          const record = (payload.new || payload.old) as any;
          if (record?.tenant_id !== tenantId) {
            console.warn('[Realtime] Ignoring cross-tenant vehicle change');
            return;
          }
          console.log(`[Realtime] Vehicle change for tenant ${tenantId}:`, payload);
          onVehicleChange();
        }
      )
      .subscribe();

    return cleanupChannels;
  }, [
    tenantId,
    onEmailInsert,
    onHuntPlanChange,
    onMatchChange,
    onVehicleChange,
    playAlertSound,
    showSystemNotification,
    isTabHidden,
    isSoundMuted,
    cleanupChannels,
  ]);

  return { cleanupChannels };
}
