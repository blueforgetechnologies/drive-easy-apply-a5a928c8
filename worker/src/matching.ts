import { supabase } from './supabase.js';
import type { ParsedEmailData } from './parsers/sylectus.js';

/**
 * Haversine distance calculation in miles.
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Match a load email to active hunt plans.
 */
export async function matchLoadToHunts(
  loadEmailId: string,
  loadId: string,
  parsedData: ParsedEmailData,
  tenantId: string | null,
  loadContentFingerprint?: string,
  receivedAt?: Date
): Promise<number> {
  // Check if matching is enabled for this tenant
  if (tenantId) {
    const { data: matchingEnabled } = await supabase.rpc('is_feature_enabled', {
      _tenant_id: tenantId,
      _feature_key: 'load_hunter_matching',
    });

    if (matchingEnabled === false) {
      console.log(`[matching] Disabled for tenant ${tenantId}`);
      return 0;
    }
  }

  // Get enabled hunt plans for this tenant
  const huntQuery = supabase
    .from('hunt_plans')
    .select(
      'id, vehicle_id, hunt_coordinates, pickup_radius, vehicle_size, floor_load_id, load_capacity, tenant_id'
    )
    .eq('enabled', true);

  if (tenantId) {
    huntQuery.eq('tenant_id', tenantId);
  }

  const { data: enabledHunts } = await huntQuery;

  if (!enabledHunts?.length) return 0;

  const loadCoords = parsedData.pickup_coordinates;
  if (!loadCoords) return 0;

  const loadVehicleType = parsedData.vehicle_type?.toLowerCase().replace(/[^a-z]/g, '');

  let matchCount = 0;

  for (const hunt of enabledHunts) {
    // Skip if load is older than floor
    if (hunt.floor_load_id && loadId <= hunt.floor_load_id) continue;

    const huntCoords = hunt.hunt_coordinates as { lat: number; lng: number } | null;
    if (!huntCoords?.lat || !huntCoords?.lng) continue;

    const distance = haversineDistance(
      loadCoords.lat,
      loadCoords.lng,
      huntCoords.lat,
      huntCoords.lng
    );
    if (distance > parseFloat(hunt.pickup_radius || '200')) continue;

    // Parse vehicle_sizes as JSON array
    let huntVehicleSizes: string[] = [];
    if (hunt.vehicle_size) {
      try {
        const parsed = JSON.parse(hunt.vehicle_size);
        huntVehicleSizes = Array.isArray(parsed) ? parsed : [hunt.vehicle_size];
      } catch {
        huntVehicleSizes = [hunt.vehicle_size];
      }
    }

    // Check vehicle type match
    if (huntVehicleSizes.length > 0 && loadVehicleType) {
      const loadTypeNormalized = loadVehicleType.toLowerCase().replace(/[^a-z-]/g, '');
      const vehicleMatches = huntVehicleSizes.some((huntSize) => {
        const huntNormalized = huntSize.toLowerCase().replace(/[^a-z-]/g, '');
        return (
          loadTypeNormalized === huntNormalized ||
          loadTypeNormalized.includes(huntNormalized) ||
          huntNormalized.includes(loadTypeNormalized) ||
          (loadTypeNormalized.includes('cargo') && huntNormalized.includes('cargo')) ||
          (loadTypeNormalized.includes('sprinter') && huntNormalized.includes('sprinter')) ||
          (loadTypeNormalized.includes('straight') && huntNormalized.includes('straight'))
        );
      });
      if (!vehicleMatches) continue;
    }

    // Check weight capacity
    if (hunt.load_capacity) {
      const maxCapacity = parseFloat(hunt.load_capacity);
      const loadWeight = parseFloat(parsedData.weight || '0');
      if (!isNaN(maxCapacity) && !isNaN(loadWeight) && loadWeight > 0 && loadWeight > maxCapacity) {
        continue;
      }
    }

    // Check for existing match (dedupe via unique constraint by load_email_id + hunt_plan_id)
    // This does NOT block re-triggering - a new load_email_id will pass this check
    const { count: existingMatch } = await supabase
      .from('load_hunt_matches')
      .select('id', { count: 'exact', head: true })
      .eq('load_email_id', loadEmailId)
      .eq('hunt_plan_id', hunt.id);

    if (existingMatch && existingMatch > 0) continue;

    // COOLDOWN GATING: Check if we should trigger action for this fingerprint
    // Default cooldown is 60 seconds (1 minute) to allow re-triggering
    // FAIL-CLOSED: If RPC errors, suppress the match to prevent duplicates
    const huntTenantId = tenantId || hunt.tenant_id;
    if (loadContentFingerprint && huntTenantId && receivedAt) {
      const { data: shouldTrigger, error: cooldownError } = await supabase.rpc('should_trigger_hunt_for_fingerprint', {
        p_tenant_id: huntTenantId,
        p_hunt_plan_id: hunt.id,
        p_fingerprint: loadContentFingerprint,
        p_received_at: receivedAt.toISOString(),
        p_cooldown_seconds: 60, // 1 minute cooldown
        p_last_load_email_id: loadEmailId,
      });
      
      if (cooldownError) {
        // FAIL-CLOSED: On RPC error, suppress match to prevent duplicates
        console.error(`[hunt-cooldown] RPC error (SUPPRESSING match):`, cooldownError);
        continue; // Skip this match - gate is unhealthy
      }
      
      if (!shouldTrigger) {
        console.log(`[hunt-cooldown] suppressed tenant=${huntTenantId} hunt=${hunt.id} fp=${loadContentFingerprint.substring(0, 8)}... received_at=${receivedAt.toISOString()} cooldown=60s`);
        continue; // Skip this match - still in cooldown
      }
      
      // Log allowed actions for observability
      console.log(`[hunt-cooldown] allowed tenant=${huntTenantId} hunt=${hunt.id} fp=${loadContentFingerprint.substring(0, 8)}... received_at=${receivedAt.toISOString()}`);
    }

    // Insert match
    const { error } = await supabase.from('load_hunt_matches').insert({
      load_email_id: loadEmailId,
      hunt_plan_id: hunt.id,
      vehicle_id: hunt.vehicle_id,
      distance_miles: Math.round(distance),
      is_active: true,
      match_status: 'active',
      matched_at: new Date().toISOString(),
      tenant_id: huntTenantId,
    });

    if (!error) {
      matchCount++;
    }
  }

  return matchCount;
}
