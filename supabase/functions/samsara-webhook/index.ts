import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HMAC-SHA256 signature verification
async function verifySignature(payload: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) {
    console.error('Missing X-Samsara-Signature header');
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expectedSignature.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }
    
    return result === 0;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the webhook secret (using the same API key)
    const webhookSecret = Deno.env.get('SAMSARA_API_KEY');
    
    if (!webhookSecret) {
      console.error('SAMSARA_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Read the raw body for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get('X-Samsara-Signature');
    
    // Verify webhook signature
    const isValid = await verifySignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      console.error('Invalid webhook signature');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse webhook payload
    const payload = JSON.parse(rawBody);
    console.log('Received verified Samsara webhook:', JSON.stringify(payload, null, 2));

    // Handle EngineFaultOn event
    if (payload.eventType === 'EngineFaultOn') {
      const vehicleData = payload.data?.vehicle;
      const faultData = payload.data?.fault;

      if (!vehicleData || !faultData) {
        console.error('Missing vehicle or fault data in webhook payload');
        return new Response(JSON.stringify({ error: 'Invalid payload structure' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Find vehicle by VIN or Samsara provider_id
      const { data: vehicles, error: findError } = await supabase
        .from('vehicles')
        .select('id, fault_codes, vehicle_number')
        .or(`vin.eq.${vehicleData.vin},provider_id.eq.${vehicleData.id}`)
        .limit(1);

      if (findError) {
        console.error('Error finding vehicle:', findError);
        return new Response(JSON.stringify({ error: 'Database error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!vehicles || vehicles.length === 0) {
        console.log(`Vehicle not found: VIN=${vehicleData.vin}, ID=${vehicleData.id}`);
        // Return 200 OK even if vehicle not found to avoid webhook retry spam
        return new Response(JSON.stringify({ message: 'Vehicle not found, event logged' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const vehicle = vehicles[0];
      
      // Parse fault codes from different sources
      const faultCodes: any[] = [];

      // J1939 fault codes (heavy-duty vehicles)
      if (faultData.j1939?.diagnosticTroubleCodes) {
        faultCodes.push(...faultData.j1939.diagnosticTroubleCodes.map((code: any) => ({
          type: 'j1939',
          spnId: code.spnId,
          spnDescription: code.spnDescription,
          fmiId: code.fmiId,
          fmiDescription: code.fmiDescription,
          occurrenceCount: code.occurrenceCount,
          milStatus: code.milStatus,
          timestamp: payload.eventTime,
        })));
      }

      // Passenger vehicle DTC codes (OBD-II)
      if (faultData.passenger?.dtc) {
        faultCodes.push({
          type: 'passenger',
          troubleCode: faultData.passenger.dtc.troubleCode,
          shortCode: faultData.passenger.dtc.shortCode,
          description: faultData.passenger.dtc.description,
          timestamp: payload.eventTime,
        });
      }

      // OEM codes
      if (faultData.oem) {
        faultCodes.push({
          type: 'oem',
          codeIdentifier: faultData.oem.codeIdentifier,
          codeDescription: faultData.oem.codeDescription,
          codeSeverity: faultData.oem.codeSeverity,
          codeSource: faultData.oem.codeSource,
          timestamp: payload.eventTime,
        });
      }

      // Get existing fault codes
      const existingCodes = vehicle.fault_codes || [];

      // Merge new fault codes with existing ones (avoid duplicates based on code identifiers)
      const updatedCodes = [...existingCodes];
      
      faultCodes.forEach(newCode => {
        // Check if code already exists
        const isDuplicate = updatedCodes.some(existing => {
          if (newCode.type === 'j1939' && existing.type === 'j1939') {
            return existing.spnId === newCode.spnId && existing.fmiId === newCode.fmiId;
          } else if (newCode.type === 'passenger' && existing.type === 'passenger') {
            return existing.troubleCode === newCode.troubleCode;
          } else if (newCode.type === 'oem' && existing.type === 'oem') {
            return existing.codeIdentifier === newCode.codeIdentifier;
          }
          return false;
        });

        if (!isDuplicate) {
          updatedCodes.push(newCode);
        }
      });

      // Update vehicle with new fault codes
      const { error: updateError } = await supabase
        .from('vehicles')
        .update({ fault_codes: updatedCodes })
        .eq('id', vehicle.id);

      if (updateError) {
        console.error('Error updating vehicle fault codes:', updateError);
        return new Response(JSON.stringify({ error: 'Failed to update fault codes' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`Updated fault codes for vehicle ${vehicle.vehicle_number || vehicle.id}: ${faultCodes.length} new codes`);

      return new Response(JSON.stringify({ 
        success: true, 
        message: `Processed ${faultCodes.length} fault codes for vehicle ${vehicle.vehicle_number}` 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Handle EngineFaultOff event (clear fault codes)
    if (payload.eventType === 'EngineFaultOff') {
      const vehicleData = payload.data?.vehicle;
      const faultData = payload.data?.fault;

      if (!vehicleData || !faultData) {
        return new Response(JSON.stringify({ error: 'Invalid payload structure' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Find vehicle
      const { data: vehicles, error: findError } = await supabase
        .from('vehicles')
        .select('id, fault_codes, vehicle_number')
        .or(`vin.eq.${vehicleData.vin},provider_id.eq.${vehicleData.id}`)
        .limit(1);

      if (findError || !vehicles || vehicles.length === 0) {
        return new Response(JSON.stringify({ message: 'Vehicle not found, event logged' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const vehicle = vehicles[0];
      const existingCodes = vehicle.fault_codes || [];

      // Remove the cleared fault code
      let updatedCodes = existingCodes.filter((code: any) => {
        if (faultData.j1939 && code.type === 'j1939') {
          return !(code.spnId === faultData.j1939.spn?.id && code.fmiId === faultData.j1939.fmi?.id);
        } else if (faultData.passenger && code.type === 'passenger') {
          return code.troubleCode !== faultData.passenger.dtc?.troubleCode;
        } else if (faultData.oem && code.type === 'oem') {
          return code.codeIdentifier !== faultData.oem.codeIdentifier;
        }
        return true;
      });

      // Update vehicle
      const { error: updateError } = await supabase
        .from('vehicles')
        .update({ fault_codes: updatedCodes })
        .eq('id', vehicle.id);

      if (updateError) {
        console.error('Error clearing fault code:', updateError);
      }

      console.log(`Cleared fault code for vehicle ${vehicle.vehicle_number || vehicle.id}`);

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Fault code cleared' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Log other event types
    console.log(`Received unhandled event type: ${payload.eventType}`);
    return new Response(JSON.stringify({ 
      message: 'Event received but not processed',
      eventType: payload.eventType 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error processing Samsara webhook:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
