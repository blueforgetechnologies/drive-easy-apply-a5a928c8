import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useMapLoadTracker(componentName: string) {
  const tracked = useRef(false);

  useEffect(() => {
    // Only track once per component mount
    if (tracked.current) return;
    tracked.current = true;

    const trackMapLoad = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        
        await supabase
          .from('map_load_tracking')
          .insert({
            component_name: componentName,
            user_id: user?.id || null,
            month_year: currentMonth
          });
      } catch (error) {
        // Silently fail - don't break map functionality for tracking
        console.debug('Map load tracking failed:', error);
      }
    };

    trackMapLoad();
  }, [componentName]);
}
