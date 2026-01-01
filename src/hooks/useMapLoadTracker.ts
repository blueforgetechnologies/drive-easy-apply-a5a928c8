import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenantFilter } from './useTenantFilter';

export function useMapLoadTracker(componentName: string) {
  const tracked = useRef(false);
  const { tenantId, shouldFilter } = useTenantFilter();

  useEffect(() => {
    // Only track once per component mount
    if (tracked.current) return;
    
    // Wait for tenant to be ready if filtering is required
    if (shouldFilter && !tenantId) return;
    
    tracked.current = true;

    const trackMapLoad = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        
        // tenant_id will be auto-set by the enforce_tenant_isolation trigger
        // but we include it explicitly for clarity
        await supabase
          .from('map_load_tracking')
          .insert({
            component_name: componentName,
            user_id: user?.id || null,
            month_year: currentMonth,
            tenant_id: tenantId
          });
      } catch (error) {
        // Silently fail - don't break map functionality for tracking
        console.debug('Map load tracking failed:', error);
      }
    };

    trackMapLoad();
  }, [componentName, tenantId, shouldFilter]);
}