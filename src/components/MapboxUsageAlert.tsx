import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';

const MAP_LOADS_FREE_TIER = 50000;

export function MapboxUsageAlert() {
  const hasAlerted = useRef(false);

  const { data: mapLoadStats } = useQuery({
    queryKey: ["mapbox-usage-alert-check"],
    queryFn: async () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      
      // First check mapbox_monthly_usage table
      const { data: monthlyUsage } = await supabase
        .from('mapbox_monthly_usage')
        .select('map_loads')
        .eq('month_year', currentMonth)
        .single();
      
      if (monthlyUsage?.map_loads) {
        return monthlyUsage.map_loads;
      }
      
      // Fall back to counting map_load_tracking
      const { count } = await supabase
        .from('map_load_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('month_year', currentMonth);
      
      return count || 0;
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (hasAlerted.current || mapLoadStats === undefined) return;
    
    if (mapLoadStats > MAP_LOADS_FREE_TIER) {
      hasAlerted.current = true;
      
      // Play alert sound
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // Create a two-tone alert sound
        const playTone = (frequency: number, startTime: number, duration: number) => {
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.value = frequency;
          oscillator.type = 'sine';
          
          gainNode.gain.setValueAtTime(0.3, startTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
          
          oscillator.start(startTime);
          oscillator.stop(startTime + duration);
        };
        
        const now = audioContext.currentTime;
        playTone(880, now, 0.15);        // A5
        playTone(1320, now + 0.15, 0.15); // E6
        playTone(880, now + 0.3, 0.15);   // A5
      } catch (e) {
        console.debug('Audio alert failed:', e);
      }
      
      // Show toast notification
      toast.warning(
        `Map Loads Exceeded Free Tier!`,
        {
          description: `You've used ${mapLoadStats.toLocaleString()} map loads this month (${(mapLoadStats - MAP_LOADS_FREE_TIER).toLocaleString()} over the 50K free tier). Billing applies.`,
          duration: 10000,
          icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
        }
      );
    }
  }, [mapLoadStats]);

  return null; // This component only handles alerts, no UI
}
