import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Vehicle, Driver, HuntPlan } from '@/types/loadHunter';

interface UseLoadHunterDataProps {
  tenantId: string | null;
  shouldFilter: boolean;
  emailTimeWindow: '30m' | '6h' | '24h' | 'session';
  sessionStart: string;
}

export function useLoadHunterData({
  tenantId,
  shouldFilter,
  emailTimeWindow,
  sessionStart,
}: UseLoadHunterDataProps) {
  // Core data state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loadEmails, setLoadEmails] = useState<any[]>([]);
  const [failedQueueItems, setFailedQueueItems] = useState<any[]>([]);
  const [huntPlans, setHuntPlans] = useState<HuntPlan[]>([]);
  const [allDispatchers, setAllDispatchers] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [carriersMap, setCarriersMap] = useState<Record<string, string>>({});
  const [payeesMap, setPayeesMap] = useState<Record<string, string>>({});
  const [canonicalVehicleTypes, setCanonicalVehicleTypes] = useState<{ value: string; label: string }[]>([]);
  const [vehicleTypeMappings, setVehicleTypeMappings] = useState<Map<string, string>>(new Map());
  
  // Match state
  const [loadMatches, setLoadMatches] = useState<any[]>([]);
  const [skippedMatches, setSkippedMatches] = useState<any[]>([]);
  const [bidMatches, setBidMatches] = useState<any[]>([]);
  const [bookedMatches, setBookedMatches] = useState<any[]>([]);
  const [undecidedMatches, setUndecidedMatches] = useState<any[]>([]);
  const [waitlistMatches, setWaitlistMatches] = useState<any[]>([]);
  const [expiredMatches, setExpiredMatches] = useState<any[]>([]);
  const [unreviewedViewData, setUnreviewedViewData] = useState<any[]>([]);
  const [missedHistory, setMissedHistory] = useState<any[]>([]);
  
  // Loading state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Request ID guards for stale async writes
  const loadEmailsReqIdRef = useRef(0);
  const loadMatchesReqIdRef = useRef(0);
  const loadUnreviewedReqIdRef = useRef(0);

  // Mapbox token
  const [mapboxToken, setMapboxToken] = useState<string>('');

  const fetchMapboxToken = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-mapbox-token');
      if (error) throw error;
      if (data?.token) {
        setMapboxToken(data.token);
      }
    } catch (error) {
      console.error('Error fetching Mapbox token:', error);
    }
  };

  const loadVehicles = useCallback(async () => {
    try {
      let query = supabase
        .from('vehicles')
        .select('*')
        .in('status', ['active', 'available'])
        .order('vehicle_number', { ascending: true });

      if (shouldFilter && tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setVehicles(data || []);
    } catch (error: any) {
      console.error('Failed to load vehicles', error);
      toast.error('Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  }, [tenantId, shouldFilter]);

  const loadDrivers = useCallback(async () => {
    try {
      let query = supabase
        .from('applications')
        .select('id, personal_info, vehicle_note')
        .eq('driver_status', 'active');

      if (shouldFilter && tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setDrivers(data || []);
    } catch (error: any) {
      console.error('Failed to load drivers', error);
    }
  }, [tenantId, shouldFilter]);

  const loadAllDispatchers = useCallback(async () => {
    try {
      let query = supabase
        .from('dispatchers')
        .select('id, first_name, last_name')
        .in('status', ['active', 'Active', 'ACTIVE']);

      if (shouldFilter && tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setAllDispatchers(data || []);
    } catch (error: any) {
      console.error('Failed to load dispatchers', error);
    }
  }, [tenantId, shouldFilter]);

  const loadCarriersAndPayees = useCallback(async () => {
    try {
      // Load carriers
      let carriersQuery = supabase
        .from('carriers')
        .select('id, name')
        .in('status', ['active', 'Active', 'ACTIVE']);

      if (shouldFilter && tenantId) {
        carriersQuery = carriersQuery.eq('tenant_id', tenantId);
      }

      const { data: carriersData, error: carriersError } = await carriersQuery;

      if (!carriersError && carriersData) {
        const cMap: Record<string, string> = {};
        carriersData.forEach((carrier: any) => {
          cMap[carrier.id] = carrier.name;
        });
        setCarriersMap(cMap);
      }

      // Load payees
      let payeesQuery = supabase
        .from('payees')
        .select('id, name')
        .in('status', ['active', 'Active', 'ACTIVE']);

      if (shouldFilter && tenantId) {
        payeesQuery = payeesQuery.eq('tenant_id', tenantId);
      }

      const { data: payeesData, error: payeesError } = await payeesQuery;

      if (!payeesError && payeesData) {
        const pMap: Record<string, string> = {};
        payeesData.forEach((payee: any) => {
          pMap[payee.id] = payee.name;
        });
        setPayeesMap(pMap);
      }
    } catch (error: any) {
      console.error('Failed to load carriers/payees', error);
    }
  }, [tenantId, shouldFilter]);

  const loadCanonicalVehicleTypes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('sylectus_type_config')
        .select('type_category, original_value, mapped_to');

      if (error) throw error;

      const mappings = new Map<string, string>();
      const canonicalSet = new Set<string>();

      data?.forEach((config: any) => {
        if (config.mapped_to) {
          mappings.set(config.original_value.toLowerCase(), config.mapped_to.toUpperCase());
          canonicalSet.add(config.mapped_to.toUpperCase());
        }
      });

      setVehicleTypeMappings(mappings);

      if (canonicalSet.size > 0) {
        const types = Array.from(canonicalSet).sort().map(t => ({
          value: t,
          label: t
        }));
        setCanonicalVehicleTypes(types);
      } else {
        setCanonicalVehicleTypes([
          { value: 'LARGE STRAIGHT', label: 'LARGE STRAIGHT' },
          { value: 'SMALL STRAIGHT', label: 'SMALL STRAIGHT' },
          { value: 'CARGO VAN', label: 'CARGO VAN' },
          { value: 'SPRINTER', label: 'SPRINTER' },
          { value: 'STRAIGHT', label: 'STRAIGHT' },
          { value: 'FLATBED', label: 'FLATBED' },
        ]);
      }
    } catch (error) {
      console.error('Failed to load canonical vehicle types:', error);
    }
  }, []);

  const loadLoadEmails = useCallback(async (retries = 3) => {
    const myReqId = ++loadEmailsReqIdRef.current;
    console.log('📧 Loading emails...', { tenantId, shouldFilter, reqId: myReqId });
    
    if (shouldFilter && !tenantId) {
      console.log('📧 No tenant context, clearing emails');
      if (myReqId === loadEmailsReqIdRef.current) {
        setLoadEmails([]);
      }
      return;
    }
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        let cutoffTime: string;
        if (emailTimeWindow === 'session') {
          cutoffTime = sessionStart;
        } else {
          const timeWindowMs = emailTimeWindow === '30m' ? 30 * 60 * 1000 
                             : emailTimeWindow === '6h' ? 6 * 60 * 60 * 1000 
                             : 24 * 60 * 60 * 1000;
          cutoffTime = new Date(Date.now() - timeWindowMs).toISOString();
        }
        
        let query = supabase
          .from('load_emails')
          .select('*')
          .gte('created_at', cutoffTime)
          .order('received_at', { ascending: false })
          .limit(5000);

        if (shouldFilter && tenantId) {
          query = query.eq('tenant_id', tenantId);
        }

        let failedQuery = supabase
          .from('email_queue')
          .select('*')
          .eq('status', 'failed')
          .order('queued_at', { ascending: false })
          .limit(200);

        if (shouldFilter && tenantId) {
          failedQuery = failedQuery.eq('tenant_id', tenantId);
        }

        const [emailsResult, failedResult] = await Promise.all([query, failedQuery]);

        if (myReqId !== loadEmailsReqIdRef.current) {
          console.log(`📧 Request ${myReqId} stale (current: ${loadEmailsReqIdRef.current}), discarding`);
          return;
        }

        if (emailsResult.error) {
          console.error(`📧 Attempt ${attempt} failed:`, emailsResult.error);
          if (attempt === retries) {
            toast.error('Failed to load emails - please refresh');
            return;
          }
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
          continue;
        }
        console.log(`✅ Loaded ${emailsResult.data?.length || 0} emails, ${failedResult.data?.length || 0} failed (tenant: ${tenantId}, reqId: ${myReqId})`);
        setLoadEmails(emailsResult.data || []);
        setFailedQueueItems(failedResult.data || []);
        return;
      } catch (err) {
        console.error(`📧 Attempt ${attempt} error:`, err);
        if (attempt === retries) {
          toast.error('Failed to load emails - please refresh');
        }
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }
  }, [tenantId, shouldFilter, emailTimeWindow, sessionStart]);

  const loadHuntPlans = useCallback(async (retries = 3) => {
    console.log('🎯 Loading hunt plans...');
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        let query = supabase
          .from('hunt_plans')
          .select('*')
          .not('plan_name', 'ilike', '[DELETED]%')
          .order('created_at', { ascending: false });

        if (shouldFilter && tenantId) {
          query = query.eq('tenant_id', tenantId);
        }

        const { data, error } = await query;

        if (error) {
          console.error(`🎯 Attempt ${attempt} failed:`, error);
          if (attempt === retries) {
            toast.error('Failed to load hunt plans - please refresh');
            return;
          }
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
          continue;
        }
        
        console.log(`✅ Loaded ${data?.length || 0} hunt plans`);
        const transformedPlans: HuntPlan[] = (data || []).map((plan: any) => {
          let vehicleSizes: string[] = [];
          if (plan.vehicle_size) {
            try {
              const parsed = JSON.parse(plan.vehicle_size);
              vehicleSizes = Array.isArray(parsed) ? parsed : [plan.vehicle_size];
            } catch {
              vehicleSizes = [plan.vehicle_size];
            }
          }
          return {
            id: plan.id,
            vehicleId: plan.vehicle_id,
            planName: plan.plan_name,
            vehicleSizes,
            zipCode: plan.zip_code || '',
            availableFeet: plan.available_feet || '',
            partial: plan.partial || false,
            pickupRadius: plan.pickup_radius || '',
            mileLimit: plan.mile_limit || '',
            loadCapacity: plan.load_capacity || '',
            availableDate: plan.available_date || '',
            availableTime: plan.available_time || '',
            destinationZip: plan.destination_zip || '',
            destinationRadius: plan.destination_radius || '',
            notes: plan.notes || '',
            createdBy: plan.created_by || '',
            createdAt: new Date(plan.created_at),
            lastModified: new Date(plan.last_modified),
            huntCoordinates: plan.hunt_coordinates as { lat: number; lng: number } | null,
            enabled: plan.enabled !== false,
            floorLoadId: plan.floor_load_id || null,
            initialMatchDone: plan.initial_match_done || false,
          };
        });
        
        setHuntPlans(transformedPlans);
        return;
      } catch (err) {
        console.error(`🎯 Attempt ${attempt} error:`, err);
        if (attempt === retries) {
          toast.error('Failed to load hunt plans - please refresh');
        }
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }
  }, [tenantId, shouldFilter]);

  const loadUnreviewedMatches = useCallback(async (retries = 3) => {
    const myReqId = ++loadUnreviewedReqIdRef.current;
    console.log('🚀 Loading unreviewed matches...', { tenantId, shouldFilter, reqId: myReqId });
    
    if (shouldFilter && !tenantId) {
      console.log('🚀 No tenant context, clearing matches');
      if (myReqId === loadUnreviewedReqIdRef.current) {
        setUnreviewedViewData([]);
      }
      return;
    }
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Use rpc or raw query for view that may not be in generated types
        let query = (supabase as any)
          .from('load_hunter_unreviewed_view')
          .select('*')
          .order('received_at', { ascending: false });

        if (shouldFilter && tenantId) {
          query = query.eq('tenant_id', tenantId);
        }
        
        const { data, error } = await query.limit(500);

        if (error) {
          console.error(`🚀 Attempt ${attempt} failed:`, error);
          if (attempt === retries) {
            toast.error('Failed to load unreviewed matches - please refresh');
            return;
          }
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
          continue;
        }
        
        if (myReqId !== loadUnreviewedReqIdRef.current) {
          console.log(`🚀 Request ${myReqId} stale (current: ${loadUnreviewedReqIdRef.current}), discarding`);
          return;
        }
        
        console.log(`✅ Loaded ${data?.length || 0} unreviewed matches from view (tenant: ${tenantId}, reqId: ${myReqId})`);
        setUnreviewedViewData(data || []);
        return;
      } catch (err) {
        console.error(`🚀 Attempt ${attempt} error:`, err);
        if (attempt === retries) {
          toast.error('Failed to load unreviewed matches - please refresh');
        }
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }
  }, [tenantId, shouldFilter]);

  const loadMissedHistory = useCallback(async () => {
    const MAX_RECORDS = 9999;
    const PAGE_SIZE = 1000;
    const EMAIL_CHUNK_SIZE = 500;

    try {
      const allMissed: any[] = [];
      const emailMap = new Map<string, any>();

      for (let offset = 0; offset < MAX_RECORDS; offset += PAGE_SIZE) {
        const { data: page, error } = await supabase
          .from('missed_loads_history')
          .select(`
            id,
            load_email_id,
            hunt_plan_id,
            vehicle_id,
            match_id,
            missed_at,
            received_at,
            from_email,
            subject,
            dispatcher_id
          `)
          .order('missed_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
          console.error('Error loading missed history:', error);
          break;
        }

        const pageRows = page || [];
        allMissed.push(...pageRows);

        const pageEmailIds = [...new Set(pageRows.map((m) => m.load_email_id).filter(Boolean))].filter(
          (id) => !emailMap.has(id)
        );

        for (let i = 0; i < pageEmailIds.length; i += EMAIL_CHUNK_SIZE) {
          const chunk = pageEmailIds.slice(i, i + EMAIL_CHUNK_SIZE);
          const { data: emails, error: emailsError } = await supabase
            .from('load_emails')
            .select('*')
            .in('id', chunk);

          if (emailsError) {
            console.error('Error loading missed email details:', emailsError);
            continue;
          }

          (emails || []).forEach((e) => emailMap.set(e.id, e));
        }

        if (pageRows.length < PAGE_SIZE || allMissed.length >= MAX_RECORDS) {
          break;
        }
      }

      const enrichedData = allMissed.map((m) => ({
        ...m,
        email: m.load_email_id ? emailMap.get(m.load_email_id) || null : null,
      }));

      console.log(`📊 Loaded ${enrichedData.length} missed history records`);
      setMissedHistory(enrichedData);
    } catch (err) {
      console.error('Error in loadMissedHistory:', err);
    }
  }, []);

  // Get Eastern timezone offset helper
  const getEasternTimezoneOffset = (date: Date): number => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'shortOffset',
    });
    
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT-5';
    const match = tzPart.match(/GMT([+-]?\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    const month = date.getMonth();
    if (month >= 2 && month <= 9) {
      return -4; // EDT
    }
    return -5; // EST
  };

  const loadHuntMatches = useCallback(async (retries = 3) => {
    const myReqId = ++loadMatchesReqIdRef.current;
    console.log('🔗 Loading hunt matches...', { tenantId, shouldFilter, reqId: myReqId });
    
    if (shouldFilter && !tenantId) {
      console.log('🔗 No tenant context, clearing matches');
      if (myReqId === loadMatchesReqIdRef.current) {
        setLoadMatches([]);
        setSkippedMatches([]);
        setBidMatches([]);
        setUndecidedMatches([]);
        setWaitlistMatches([]);
        setBookedMatches([]);
        setExpiredMatches([]);
      }
      return;
    }
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const now = new Date();
        const easternFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        const parts = easternFormatter.formatToParts(now);
        const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';
        const easternDateStr = `${getPart('year')}-${getPart('month')}-${getPart('day')}T00:00:00`;
        const tempDate = new Date(easternDateStr + 'Z');
        const easternOffset = getEasternTimezoneOffset(now);
        const midnightET = new Date(tempDate.getTime() - easternOffset * 60 * 60 * 1000);
        const midnightETIso = midnightET.toISOString();

        const baseSelect = '*';

        // Fetch active matches
        let activeQuery = supabase
          .from('load_hunt_matches')
          .select(baseSelect)
          .eq('match_status', 'active');
        if (shouldFilter && tenantId) {
          activeQuery = activeQuery.eq('tenant_id', tenantId);
        }
        const { data: activeData, error: activeError } = await activeQuery;

        // Fetch skipped matches
        let skippedQuery = supabase
          .from('load_hunt_matches')
          .select(`*, load_emails (*)`)
          .eq('match_status', 'skipped')
          .gte('updated_at', midnightETIso);
        if (shouldFilter && tenantId) {
          skippedQuery = skippedQuery.eq('tenant_id', tenantId);
        }
        const { data: skippedData, error: skippedError } = await skippedQuery;

        // Fetch bid matches
        let bidQuery = supabase
          .from('load_hunt_matches')
          .select(`*, load_emails (*), load_bids!load_bids_match_id_fkey (*)`)
          .eq('match_status', 'bid')
          .gte('updated_at', midnightETIso);
        if (shouldFilter && tenantId) {
          bidQuery = bidQuery.eq('tenant_id', tenantId);
        }
        const { data: bidData, error: bidError } = await bidQuery;

        // Fetch undecided matches
        let undecidedQuery = supabase
          .from('load_hunt_matches')
          .select(`*, load_emails (*)`)
          .eq('match_status', 'undecided');
        if (shouldFilter && tenantId) {
          undecidedQuery = undecidedQuery.eq('tenant_id', tenantId);
        }
        const { data: undecidedData, error: undecidedError } = await undecidedQuery;

        // Fetch waitlist matches
        let waitlistQuery = supabase
          .from('load_hunt_matches')
          .select(`*, load_emails (*)`)
          .eq('match_status', 'waitlist');
        if (shouldFilter && tenantId) {
          waitlistQuery = waitlistQuery.eq('tenant_id', tenantId);
        }
        const { data: waitlistData, error: waitlistError } = await waitlistQuery;

        // Fetch booked matches
        let bookedQuery = supabase
          .from('load_hunt_matches')
          .select(`*, load_emails (*)`)
          .eq('match_status', 'booked')
          .gte('updated_at', midnightETIso);
        if (shouldFilter && tenantId) {
          bookedQuery = bookedQuery.eq('tenant_id', tenantId);
        }
        const { data: bookedData, error: bookedError } = await bookedQuery;

        // Fetch expired matches
        let expiredQuery = supabase
          .from('load_hunt_matches')
          .select(`*, load_emails (*)`)
          .eq('match_status', 'expired')
          .gte('updated_at', midnightETIso);
        if (shouldFilter && tenantId) {
          expiredQuery = expiredQuery.eq('tenant_id', tenantId);
        }
        const { data: expiredData, error: expiredError } = await expiredQuery;

        if (myReqId !== loadMatchesReqIdRef.current) {
          console.log(`🔗 Request ${myReqId} stale (current: ${loadMatchesReqIdRef.current}), discarding`);
          return;
        }

        if (activeError || skippedError || bidError || undecidedError || waitlistError || bookedError || expiredError) {
          console.error('Error loading matches:', { activeError, skippedError, bidError, undecidedError, waitlistError, bookedError, expiredError });
          if (attempt === retries) {
            toast.error('Failed to load matches - please refresh');
            return;
          }
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
          continue;
        }

        console.log(`✅ Loaded matches: ${activeData?.length || 0} active, ${skippedData?.length || 0} skipped, ${bidData?.length || 0} bids, ${undecidedData?.length || 0} undecided, ${waitlistData?.length || 0} waitlist, ${bookedData?.length || 0} booked, ${expiredData?.length || 0} expired`);
        
        setLoadMatches(activeData || []);
        setSkippedMatches(skippedData || []);
        setBidMatches(bidData || []);
        setUndecidedMatches(undecidedData || []);
        setWaitlistMatches(waitlistData || []);
        setBookedMatches(bookedData || []);
        setExpiredMatches(expiredData || []);
        return;
      } catch (err) {
        console.error(`🔗 Attempt ${attempt} error:`, err);
        if (attempt === retries) {
          toast.error('Failed to load matches - please refresh');
        }
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
      }
    }
  }, [tenantId, shouldFilter]);

  // Clear all state (for tenant changes)
  const clearAllState = useCallback(() => {
    setVehicles([]);
    setDrivers([]);
    setLoadEmails([]);
    setHuntPlans([]);
    setLoadMatches([]);
    setSkippedMatches([]);
    setBidMatches([]);
    setBookedMatches([]);
    setUndecidedMatches([]);
    setWaitlistMatches([]);
    setExpiredMatches([]);
    setUnreviewedViewData([]);
    setMissedHistory([]);
  }, []);

  // Load all data
  const loadAllData = useCallback(async () => {
    await Promise.all([
      loadVehicles(),
      loadDrivers(),
      loadLoadEmails(),
      loadHuntPlans(),
      loadHuntMatches(),
      loadUnreviewedMatches(),
      loadMissedHistory(),
      loadCarriersAndPayees(),
      loadCanonicalVehicleTypes(),
      loadAllDispatchers(),
      fetchMapboxToken(),
    ]);
  }, [
    loadVehicles,
    loadDrivers,
    loadLoadEmails,
    loadHuntPlans,
    loadHuntMatches,
    loadUnreviewedMatches,
    loadMissedHistory,
    loadCarriersAndPayees,
    loadCanonicalVehicleTypes,
    loadAllDispatchers,
  ]);

  return {
    // Data
    vehicles,
    setVehicles,
    drivers,
    loadEmails,
    setLoadEmails,
    failedQueueItems,
    huntPlans,
    setHuntPlans,
    allDispatchers,
    carriersMap,
    payeesMap,
    canonicalVehicleTypes,
    vehicleTypeMappings,
    loadMatches,
    setLoadMatches,
    skippedMatches,
    setSkippedMatches,
    bidMatches,
    setBidMatches,
    bookedMatches,
    setBookedMatches,
    undecidedMatches,
    setUndecidedMatches,
    waitlistMatches,
    setWaitlistMatches,
    expiredMatches,
    setExpiredMatches,
    unreviewedViewData,
    setUnreviewedViewData,
    missedHistory,
    setMissedHistory,
    mapboxToken,
    
    // Loading state
    loading,
    refreshing,
    setRefreshing,
    
    // Loaders
    loadVehicles,
    loadDrivers,
    loadLoadEmails,
    loadHuntPlans,
    loadHuntMatches,
    loadUnreviewedMatches,
    loadMissedHistory,
    loadCarriersAndPayees,
    loadCanonicalVehicleTypes,
    loadAllDispatchers,
    fetchMapboxToken,
    clearAllState,
    loadAllData,
  };
}
