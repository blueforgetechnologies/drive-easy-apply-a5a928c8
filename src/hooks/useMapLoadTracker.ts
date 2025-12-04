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
        
        await supabase
          .from('map_load_tracking')
          .insert({
            component_name: componentName,
            user_id: user?.id || null
          });
      } catch (error) {
        // Silently fail - don't break map functionality for tracking
        console.debug('Map load tracking failed:', error);
      }
    };

    trackMapLoad();
  }, [componentName]);
}
