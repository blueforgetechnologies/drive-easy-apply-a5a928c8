import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, getServiceClient } from "../_shared/assertTenantAccess.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncRequest {
  tenant_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ============================================================================
    // GUARD: Exit immediately if no tenants have Samsara integration enabled
    // This avoids any Samsara API calls when no integrations exist
    // ============================================================================
    const guardClient = getServiceClient();
    const { count: samsaraIntegrationCount } = await guardClient
      .from('tenant_integrations')
      .select('id', { count: 'exact', head: true })
      .eq('provider', 'samsara')
      .eq('is_enabled', true);

    if ((samsaraIntegrationCount || 0) === 0) {
      console.log('[sync-vehicles-samsara] ⚡ GUARD: No tenants with Samsara enabled, exiting early');
      return new Response(
        JSON.stringify({ guarded: true, message: 'No Samsara integrations configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sync-vehicles-samsara] Found ${samsaraIntegrationCount} Samsara integration(s), proceeding`);

    // Parse request body
    let requestedTenantId: string | undefined;
    try {
      const body: SyncRequest = await req.json();
      requestedTenantId = body.tenant_id;
    } catch {
      // No body or invalid JSON
    }

    // CRITICAL: Validate caller has access to the requested tenant
    if (requestedTenantId) {
      const authHeader = req.headers.get('Authorization');
      const accessCheck = await assertTenantAccess(authHeader, requestedTenantId);
      
      if (!accessCheck.allowed) {
        console.log(`[sync-vehicles-samsara] Access denied for tenant ${requestedTenantId}`);
        return accessCheck.response!;
      }
      
      console.log(`[sync-vehicles-samsara] Access granted for tenant ${requestedTenantId} (user: ${accessCheck.user_id})`);
    }

    // ONLY after access check passes, use service role for privileged operations
    const supabase = getServiceClient();

    // Determine which tenants to sync
    let tenantsToSync: { id: string; apiKey: string }[] = [];

    if (requestedTenantId) {
      // Sync specific tenant - get their API key
      const apiKey = await getTenantSamsaraApiKey(supabase, requestedTenantId);
      
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: `No Samsara API key configured for tenant ${requestedTenantId}` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      tenantsToSync.push({ id: requestedTenantId, apiKey });
    } else {
      // No specific tenant - this is a scheduled job, get all tenants with Samsara enabled
      // For scheduled jobs, no auth header is present, so we process all configured tenants
      const { data: integrations } = await supabase
        .from('tenant_integrations')
        .select('tenant_id')
        .eq('provider', 'samsara')
        .eq('is_enabled', true);

      if (integrations && integrations.length > 0) {
        for (const int of integrations) {
          const apiKey = await getTenantSamsaraApiKey(supabase, int.tenant_id);
          if (apiKey) {
            tenantsToSync.push({ id: int.tenant_id, apiKey });
          }
        }
      }

      // If no tenant-specific integrations, use global key for default tenant
      if (tenantsToSync.length === 0) {
        const globalKey = Deno.env.get("SAMSARA_API_KEY");
        if (!globalKey) {
          return new Response(
            JSON.stringify({ error: 'No Samsara integrations configured' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get default tenant
        const { data: defaultTenant } = await supabase
          .from('tenants')
          .select('id')
          .eq('slug', 'default')
          .single();

        if (defaultTenant) {
          tenantsToSync.push({ id: defaultTenant.id, apiKey: globalKey.trim() });
        }
      }
    }

    console.log(`Starting Samsara sync for ${tenantsToSync.length} tenant(s)`);

    const allResults: any[] = [];

    for (const { id: tenantId, apiKey } of tenantsToSync) {
      console.log(`Syncing tenant: ${tenantId}`);
      const result = await syncTenantVehicles(supabase, tenantId, apiKey);
      allResults.push({ tenant_id: tenantId, ...result });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${allResults.length} tenant(s)`,
        results: allResults
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-vehicles-samsara:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Get Samsara API key for a tenant.
 * Priority:
 * 1. Supabase secret named 'samsara_api_{tenant_slug}' (preferred)
 * 2. Global SAMSARA_API_KEY environment variable (fallback)
 */
async function getTenantSamsaraApiKey(
  supabase: any,
  tenantId: string
): Promise<string | null> {
  try {
    // Get tenant slug for secret naming
    const { data: tenant } = await supabase
      .from('tenants')
      .select('slug')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      console.warn(`Tenant ${tenantId} not found`);
      return null;
    }

    // Try to get tenant-specific secret from environment
    // Secret naming convention: samsara_api_{slug} (underscores for dashes)
    const secretName = `samsara_api_${tenant.slug.replace(/-/g, '_')}`;
    const tenantApiKey = Deno.env.get(secretName);
    
    if (tenantApiKey) {
      console.log(`Using tenant-specific Samsara key for ${tenant.slug}`);
      return tenantApiKey.trim();
    }

    // Check tenant_integrations for enabled Samsara
    const { data: integration } = await supabase
      .from('tenant_integrations')
      .select('is_enabled')
      .eq('tenant_id', tenantId)
      .eq('provider', 'samsara')
      .single();

    // If tenant has Samsara integration enabled, fall back to global key
    if (integration?.is_enabled) {
      const globalKey = Deno.env.get("SAMSARA_API_KEY");
      if (globalKey) {
        console.log(`Using global Samsara key for ${tenant.slug}`);
        return globalKey.trim();
      }
    }

    return null;
  } catch (error) {
    console.error(`Error getting Samsara API key for tenant ${tenantId}:`, error);
    return null;
  }
}

async function syncTenantVehicles(
  supabase: any,
  tenantId: string,
  apiKey: string
) {
  try {
    // Fetch vehicles for this tenant only
    const { data: dbVehicles, error: dbError } = await supabase
      .from('vehicles')
      .select('id, vin, vehicle_number, oil_change_due')
      .eq('tenant_id', tenantId)
      .not('vin', 'is', null);

    if (dbError) {
      console.error(`Error fetching vehicles for tenant ${tenantId}:`, dbError);
      return { error: 'Failed to fetch vehicles from database', details: dbError.message };
    }

    console.log(`Found ${dbVehicles?.length || 0} vehicles with VINs for tenant ${tenantId}`);

    if (!dbVehicles || dbVehicles.length === 0) {
      return { matched: 0, updated: 0, notFound: [], message: 'No vehicles with VINs found' };
    }

    // Fetch vehicle stats from Samsara
    const samsaraStatsResponse = await fetch(
      'https://api.samsara.com/fleet/vehicles/stats/feed?types=gps,obdOdometerMeters,fuelPercents,engineStates',
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!samsaraStatsResponse.ok) {
      const errorText = await samsaraStatsResponse.text();
      console.error(`Samsara API error for tenant ${tenantId}:`, samsaraStatsResponse.status, errorText);
      
      // Update integration status on failure
      await supabase
        .from('tenant_integrations')
        .update({
          sync_status: 'failed',
          error_message: `API error: ${samsaraStatsResponse.status}`,
          last_sync_at: new Date().toISOString()
        })
        .eq('tenant_id', tenantId)
        .eq('provider', 'samsara');
      
      return { 
        error: 'Failed to fetch Samsara data',
        status: samsaraStatsResponse.status,
        details: errorText
      };
    }

    const samsaraStatsData = await samsaraStatsResponse.json();
    const samsaraVehicles = samsaraStatsData.data || [];

    // Fetch fault codes
    let faultCodesByVin = new Map<string, string[]>();
    try {
      const faultCodesResponse = await fetch(
        'https://api.samsara.com/fleet/vehicles/stats?types=faultCodes',
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
          },
        }
      );

      if (faultCodesResponse.ok) {
        const faultCodesData = await faultCodesResponse.json();
        const faultVehicles = faultCodesData.data || [];
        
        for (const vehicle of faultVehicles) {
          const vin = vehicle.externalIds?.["samsara.vin"];
          if (!vin) continue;
          
          const faultCodes = extractFaultCodes(vehicle);
          if (faultCodes.length > 0) {
            faultCodesByVin.set(vin, faultCodes);
          }
        }
      }
    } catch (faultError) {
      console.warn(`Error fetching fault codes for tenant ${tenantId}:`, faultError);
    }

    // Create VIN to Samsara vehicle map
    const samsaraByVin = new Map();
    samsaraVehicles.forEach((v: any) => {
      const vin = v.externalIds?.["samsara.vin"];
      if (vin) samsaraByVin.set(vin, v);
    });

    // Sync results
    const results = {
      total: dbVehicles.length,
      matched: 0,
      updated: 0,
      notFound: [] as string[],
      errors: [] as any[],
      faultCodesFound: faultCodesByVin.size,
    };

    for (const dbVehicle of dbVehicles) {
      const samsaraVehicle = samsaraByVin.get(dbVehicle.vin);
      
      if (!samsaraVehicle) {
        results.notFound.push(dbVehicle.vin);
        continue;
      }

      results.matched++;

      const updateData: any = {
        last_updated: new Date().toISOString(),
      };

      // Extract odometer
      if (samsaraVehicle.obdOdometerMeters?.[0]?.value) {
        const newOdometer = Math.round(samsaraVehicle.obdOdometerMeters[0].value / 1609.34);
        updateData.odometer = newOdometer;
        
        if (dbVehicle.oil_change_due) {
          updateData.oil_change_remaining = dbVehicle.oil_change_due - newOdometer;
        }
      }

      // Extract speed, heading, and location
      // NOTE: Use a small threshold to avoid misclassifying GPS drift as movement.
      // This aligns better with Samsara's idling vs parked classification.
      if (samsaraVehicle.gps?.[0]?.speedMilesPerHour !== undefined) {
        const rawSpeed = samsaraVehicle.gps[0].speedMilesPerHour;
        updateData.speed = Math.round(rawSpeed);
        updateData.stopped_status = rawSpeed <= 2 ? 'Stopped' : 'Moving';
      }

      // Engine state (used to distinguish IDLING vs PARKED when stopped)
      // Samsara returns engineStates as an array of readings, newest first.
      const engineState = samsaraVehicle.engineStates?.[0]?.value;
      if (engineState) {
        updateData.provider_status = engineState;
      }

      // Extract heading (0-360 degrees, 0 = North)
      if (samsaraVehicle.gps?.[0]?.headingDegrees !== undefined) {
        updateData.heading = Math.round(samsaraVehicle.gps[0].headingDegrees);
      }

      if (samsaraVehicle.gps?.[0]?.latitude && samsaraVehicle.gps?.[0]?.longitude) {
        const lat = samsaraVehicle.gps[0].latitude;
        const lng = samsaraVehicle.gps[0].longitude;
        updateData.last_location = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        
        if (samsaraVehicle.gps[0].reverseGeo?.formattedLocation) {
          updateData.formatted_address = samsaraVehicle.gps[0].formattedLocation;
        }
      }

      // Fault codes
      updateData.fault_codes = faultCodesByVin.get(dbVehicle.vin) || [];

      // Provider info
      updateData.provider = 'Samsara';
      updateData.provider_id = samsaraVehicle.id;

      // Update vehicle - scoped to tenant for safety
      const { error: updateError } = await supabase
        .from('vehicles')
        .update(updateData)
        .eq('id', dbVehicle.id)
        .eq('tenant_id', tenantId);

      if (updateError) {
        results.errors.push({ vin: dbVehicle.vin, error: updateError.message });
      } else {
        results.updated++;
      }
    }

    // Update sync status in tenant_integrations
    await supabase
      .from('tenant_integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_status: results.errors.length > 0 ? 'partial' : 'success',
        error_message: results.errors.length > 0 ? `${results.errors.length} vehicle(s) failed` : null
      })
      .eq('tenant_id', tenantId)
      .eq('provider', 'samsara');

    return results;
  } catch (error) {
    console.error(`Error syncing tenant ${tenantId}:`, error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function extractFaultCodes(vehicle: any): string[] {
  const faultCodes: string[] = [];
  const faultCodesData = vehicle.faultCodes;
  const faultCodesArray = Array.isArray(faultCodesData) ? faultCodesData : (faultCodesData ? [faultCodesData] : []);
  
  for (const faultReading of faultCodesArray) {
    // J1939 fault codes
    if (faultReading.j1939?.diagnosticTroubleCodes) {
      for (const dtc of faultReading.j1939.diagnosticTroubleCodes) {
        const spnId = dtc.spnId || '';
        const fmiId = dtc.fmiId || '';
        const description = dtc.spnDescription || dtc.fmiDescription || '';
        faultCodes.push(`SPN ${spnId} FMI ${fmiId}${description ? ': ' + description : ''}`);
      }
    }
    
    // J1939 check engine lights
    if (faultReading.j1939?.checkEngineLights) {
      const lights = faultReading.j1939.checkEngineLights;
      if (lights.emissionsIsOn || lights.protectIsOn || lights.stopIsOn || lights.warningIsOn) {
        const activeLights: string[] = [];
        if (lights.emissionsIsOn) activeLights.push('Emissions');
        if (lights.protectIsOn) activeLights.push('Protect');
        if (lights.stopIsOn) activeLights.push('Stop');
        if (lights.warningIsOn) activeLights.push('Warning');
        faultCodes.push(`Check Engine Light: ${activeLights.join(', ')}`);
      }
    }
    
    // OBD-II fault codes
    if (faultReading.obdii?.diagnosticTroubleCodes) {
      for (const dtcGroup of faultReading.obdii.diagnosticTroubleCodes) {
        for (const dtc of (dtcGroup.confirmedDtcs || [])) {
          const code = dtc.dtcShortCode || dtc.dtcId || '';
          const description = dtc.dtcDescription || '';
          if (code || description) faultCodes.push(`${code}${description ? ': ' + description : ''}`);
        }
        for (const dtc of (dtcGroup.pendingDtcs || [])) {
          const code = dtc.dtcShortCode || dtc.dtcId || '';
          const description = dtc.dtcDescription || '';
          if (code || description) faultCodes.push(`PENDING: ${code}${description ? ': ' + description : ''}`);
        }
        for (const dtc of (dtcGroup.permanentDtcs || [])) {
          const code = dtc.dtcShortCode || dtc.dtcId || '';
          const description = dtc.dtcDescription || '';
          if (code || description) faultCodes.push(`PERMANENT: ${code}${description ? ': ' + description : ''}`);
        }
      }
    }
    
    if (faultReading.obdii?.checkEngineLightIsOn) {
      faultCodes.push('Check Engine Light: ON');
    }
  }
  
  return [...new Set(faultCodes)];
}
