import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DispatcherInfo {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  show_all_tab?: boolean;
}

interface UseLoadHunterDispatcherProps {
  tenantId: string | null;
  shouldFilter: boolean;
}

export function useLoadHunterDispatcher({
  tenantId,
  shouldFilter,
}: UseLoadHunterDispatcherProps) {
  const [currentDispatcherId, setCurrentDispatcherId] = useState<string | null>(null);
  const [currentDispatcherInfo, setCurrentDispatcherInfo] = useState<DispatcherInfo | null>(null);
  const [myVehicleIds, setMyVehicleIds] = useState<string[]>([]);
  const [showAllTabState, setShowAllTabState] = useState<boolean>(() => 
    localStorage.getItem('showAllTab') === 'true'
  );
  
  const currentDispatcherIdRef = useRef<string | null>(null);

  // Listen for localStorage changes from DashboardLayout toggle
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'showAllTab') {
        setShowAllTabState(e.newValue === 'true');
      }
    };
    
    const handleLocalUpdate = () => {
      setShowAllTabState(localStorage.getItem('showAllTab') === 'true');
    };
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('showAllTabChanged', handleLocalUpdate);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('showAllTabChanged', handleLocalUpdate);
    };
  }, []);

  // localStorage takes priority since the toggle in menu controls it directly
  const showAllTabEnabled = showAllTabState;

  // Refresh my vehicle IDs
  const refreshMyVehicleIds = useCallback(async () => {
    const dispatcherId = currentDispatcherIdRef.current;
    if (!dispatcherId) return;
    
    let query = supabase
      .from('vehicles')
      .select('id, vehicle_number')
      .or(`primary_dispatcher_id.eq.${dispatcherId},secondary_dispatcher_ids.cs.{${dispatcherId}}`);
    
    if (shouldFilter && tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data: assignedVehicles } = await query;
    
    if (assignedVehicles) {
      setMyVehicleIds(assignedVehicles.map(v => v.id));
      console.log('✅ Refreshed my vehicle IDs (primary + secondary):', assignedVehicles.map(v => v.id));
    }
  }, [tenantId, shouldFilter]);

  // Fetch current user's dispatcher info
  useEffect(() => {
    // Clear stale state when tenant changes
    setCurrentDispatcherId(null);
    setCurrentDispatcherInfo(null);
    currentDispatcherIdRef.current = null;
    setMyVehicleIds([]);
    console.log('🔄 Tenant changed to', tenantId, '- cleared dispatcher state');
    
    const fetchUserDispatcherInfo = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('🔍 Current user:', user?.email, 'for tenant:', tenantId);
      
      if (!user?.email) {
        console.log('❌ No user email found');
        return;
      }
      
      if (!tenantId) {
        console.log('⏳ No tenant ID yet, skipping dispatcher lookup');
        return;
      }
      
      const { data: dispatcher, error: dispatcherError } = await supabase
        .from('dispatchers')
        .select('id, first_name, last_name, email, show_all_tab')
        .ilike('email', user.email)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      
      console.log('🔍 Dispatcher lookup for tenant', tenantId, ':', { dispatcher, error: dispatcherError });
      
      if (dispatcher) {
        setCurrentDispatcherId(dispatcher.id);
        setCurrentDispatcherInfo(dispatcher);
        currentDispatcherIdRef.current = dispatcher.id;
        console.log('✅ Found dispatcher:', dispatcher.first_name, dispatcher.last_name, 'ID:', dispatcher.id);
        
        const { data: assignedVehicles, error: vehiclesError } = await supabase
          .from('vehicles')
          .select('id, vehicle_number')
          .or(`primary_dispatcher_id.eq.${dispatcher.id},secondary_dispatcher_ids.cs.{${dispatcher.id}}`)
          .eq('tenant_id', tenantId);
        
        console.log('🔍 Assigned vehicles (primary + secondary):', { assignedVehicles, error: vehiclesError });
        
        if (assignedVehicles && assignedVehicles.length > 0) {
          setMyVehicleIds(assignedVehicles.map(v => v.id));
          console.log('✅ My vehicle IDs:', assignedVehicles.map(v => v.id));
        } else {
          console.log('⚠️ Dispatcher has no assigned vehicles');
          setMyVehicleIds([]);
        }
      } else {
        console.log('❌ No dispatcher found for email:', user.email, 'in tenant:', tenantId);
      }
    };
    
    fetchUserDispatcherInfo();
  }, [tenantId]);

  return {
    currentDispatcherId,
    currentDispatcherInfo,
    currentDispatcherIdRef,
    myVehicleIds,
    setMyVehicleIds,
    showAllTabEnabled,
    refreshMyVehicleIds,
  };
}
