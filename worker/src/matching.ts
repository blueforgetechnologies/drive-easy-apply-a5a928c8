import { supabase } from './supabase.js';
import type { ParsedEmailData } from './parsers/sylectus.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

/**
 * Send match notification email via edge function.
 * This is fire-and-forget to not block the matching process.
 */
async function sendMatchNotification(
  tenantId: string,
  matchId: string,
  loadEmailId: string,
  vehicleId: string,
  distanceMiles: number,
  parsedData: ParsedEmailData
): Promise<void> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-match-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        match_id: matchId,
        load_email_id: loadEmailId,
        vehicle_id: vehicleId,
        distance_miles: distanceMiles,
        parsed_data: {
          origin_city: parsedData.origin_city,
          origin_state: parsedData.origin_state,
          destination_city: parsedData.destination_city,
          destination_state: parsedData.destination_state,
          posted_amount: parsedData.posted_amount,
          weight: parsedData.weight,
          vehicle_type: parsedData.vehicle_type,
          pickup_date: parsedData.pickup_date,
          delivery_date: parsedData.delivery_date,
          broker_name: parsedData.broker_name,
          order_number: parsedData.order_number,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[matching] Notification send failed (non-blocking): ${errorText}`);
    } else {
      const result = await response.json() as { success?: boolean; skipped?: boolean };
      console.log(`[matching] Notification sent: ${result.success ? 'success' : result.skipped ? 'skipped' : 'unknown'}`);
    }
  } catch (error) {
    // Log but don't throw - notifications are non-blocking
    console.log(`[matching] Notification error (non-blocking):`, error instanceof Error ? error.message : 'unknown');
  }
}

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

  // CRITICAL: Tenant isolation enforcement
  // If no tenantId provided, we CANNOT match - this prevents cross-tenant matches
  if (!tenantId) {
    console.log(`[matching] BLOCKED - No tenant_id provided, cannot match without tenant context`);
    return 0;
  }

  // Get enabled hunt plans ONLY for this tenant - never global
  // Include cooldown_seconds_min for configurable cooldown
  const { data: enabledHunts } = await supabase
    .from('hunt_plans')
    .select(
      'id, vehicle_id, hunt_coordinates, pickup_radius, vehicle_size, floor_load_id, load_capacity, tenant_id, cooldown_seconds_min'
    )
    .eq('enabled', true)
    .eq('tenant_id', tenantId); // MANDATORY tenant filter

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
    // Cooldown is a MINIMUM threshold: suppress if delta < cooldown; allow if delta >= cooldown. No upper bound.
    // FAIL-CLOSED: If any gate data missing or RPC errors, suppress the match to prevent duplicates
    // NOTE: tenantId is guaranteed to be non-null by the check at function start
    const hasFp = loadContentFingerprint && loadContentFingerprint.trim() !== '';
    const hasReceivedAt = !!receivedAt;
    
    if (!hasFp || !hasReceivedAt) {
      const missing = [
        !hasFp ? 'fingerprint' : null,
        !hasReceivedAt ? 'receivedAt' : null,
      ].filter(Boolean).join('|');
      console.log(`[hunt-cooldown] suppressed_missing_gate_data tenant=${tenantId} hunt=${hunt.id} load_email_id=${loadEmailId} missing=${missing}`);
      continue; // FAIL-CLOSED: Cannot enforce cooldown without all gate data
    }
    
    // Determine cooldown: hunt_plans.cooldown_seconds_min > tenants.cooldown_seconds_min > default 60
    let cooldownSecondsMin = 60; // System default
    if ((hunt as any).cooldown_seconds_min != null) {
      cooldownSecondsMin = (hunt as any).cooldown_seconds_min;
    } else {
      // Fetch tenant default if hunt doesn't have one
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('cooldown_seconds_min')
        .eq('id', tenantId)
        .maybeSingle();
      if (tenantData?.cooldown_seconds_min != null) {
        cooldownSecondsMin = tenantData.cooldown_seconds_min;
      }
    }
    
    const { data: shouldTrigger, error: cooldownError } = await supabase.rpc('should_trigger_hunt_for_fingerprint', {
      p_tenant_id: tenantId,
      p_hunt_plan_id: hunt.id,
      p_fingerprint: loadContentFingerprint,
      p_received_at: receivedAt.toISOString(),
      p_cooldown_seconds: cooldownSecondsMin,
      p_last_load_email_id: loadEmailId,
    });
    
    if (cooldownError) {
      // FAIL-CLOSED: On RPC error, suppress match to prevent duplicates
      console.error(`[hunt-cooldown] RPC error (SUPPRESSING match):`, cooldownError);
      continue; // Skip this match - gate is unhealthy
    }
    
    if (!shouldTrigger) {
      console.log(`[hunt-cooldown] suppressed tenant=${tenantId} hunt=${hunt.id} fp=${loadContentFingerprint.substring(0, 8)}... received_at=${receivedAt.toISOString()} cooldown=${cooldownSecondsMin}s`);
      continue; // Skip this match - still in cooldown
    }
    
    // Log allowed actions for observability
    console.log(`[hunt-cooldown] allowed tenant=${tenantId} hunt=${hunt.id} fp=${loadContentFingerprint.substring(0, 8)}... received_at=${receivedAt.toISOString()} cooldown=${cooldownSecondsMin}s`);
    
    // CRITICAL: Final tenant isolation check before insert
    // hunt.tenant_id MUST equal tenantId (already guaranteed by query filter, but defense-in-depth)
    if (hunt.tenant_id !== tenantId) {
      console.error(`[matching] BLOCKED cross-tenant match: load_email tenant=${tenantId} hunt tenant=${hunt.tenant_id}`);
      continue;
    }

    // Insert match with correct tenant_id from hunt (which equals load email tenant)
    const { data: insertedMatch, error } = await supabase.from('load_hunt_matches').insert({
      load_email_id: loadEmailId,
      hunt_plan_id: hunt.id,
      vehicle_id: hunt.vehicle_id,
      distance_miles: Math.round(distance),
      is_active: true,
      match_status: 'active',
      matched_at: new Date().toISOString(),
      tenant_id: tenantId, // Use the validated tenantId from load_email
    }).select('id').single();

    if (!error && insertedMatch) {
      matchCount++;
      
      // Fire-and-forget notification (non-blocking)
      sendMatchNotification(
        tenantId,
        insertedMatch.id,
        loadEmailId,
        hunt.vehicle_id,
        Math.round(distance),
        parsedData
      ).catch(() => {}); // Swallow any uncaught errors
    }
  }

  return matchCount;
}
