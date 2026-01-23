import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  OTR_API_BASE_URL, 
  getOtrCredentialsFromEnv,
  maskSubscriptionKey,
  useIsoDateFormat,
  testOtrBrokerCheck,
  getOtrHeadersWithToken,
  validateOtrPayload,
  getOtrToken,
  type OtrInvoicePayload,
} from "../_shared/otrClient.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// Timezone Helpers - US/Eastern with explicit Intl.DateTimeFormat
// ============================================================================

interface TimestampInfo {
  utc_time: string;
  eastern_time: string;
  eastern_hour: number;
  within_staging_hours: boolean;
}

function getTimestampInfo(): TimestampInfo {
  const now = new Date();
  
  // UTC time in ISO format
  const utc_time = now.toISOString();
  
  // Eastern time using explicit Intl.DateTimeFormat
  const easternFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  
  const parts = easternFormatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || "";
  
  const eastern_time = `${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart("hour")}:${getPart("minute")}:${getPart("second")} America/New_York`;
  const eastern_hour = parseInt(getPart("hour"), 10);
  
  // OTR Staging hours: 08:00 - 23:00 Eastern
  const within_staging_hours = eastern_hour >= 8 && eastern_hour < 23;
  
  return {
    utc_time,
    eastern_time,
    eastern_hour,
    within_staging_hours,
  };
}

// ============================================================================
// Correlation Logging
// ============================================================================

interface CorrelatedRequest {
  attempt_id: string;
  timestamps: TimestampInfo;
  token_result?: {
    success: boolean;
    attempt_id: string;
    error?: string;
  };
  request_url: string;
  subscription_key_masked: string;
  payload: OtrInvoicePayload;
  response_status: number;
  response_headers: Record<string, string>;
  response_body: unknown;
  success: boolean;
}

async function executeCorrelatedInvoiceSubmit(
  credentials: { subscriptionKey: string; username?: string; password?: string },
  payload: OtrInvoicePayload,
  timestamps: TimestampInfo
): Promise<CorrelatedRequest> {
  const attempt_id = crypto.randomUUID();
  const request_url = `${OTR_API_BASE_URL}/invoices`;
  
  console.log('\n' + '='.repeat(70));
  console.log(`[ATTEMPT ${attempt_id}]`);
  console.log('='.repeat(70));
  console.log(`[TIMESTAMP] UTC: ${timestamps.utc_time}`);
  console.log(`[TIMESTAMP] Eastern: ${timestamps.eastern_time}`);
  console.log(`[TIMESTAMP] Eastern Hour: ${timestamps.eastern_hour}`);
  console.log(`[TIMESTAMP] Within Staging Hours (08:00-23:00 ET): ${timestamps.within_staging_hours}`);
  console.log(`[REQUEST] URL: ${request_url}`);
  console.log(`[REQUEST] Method: POST`);
  console.log(`[REQUEST] Subscription Key: ${maskSubscriptionKey(credentials.subscriptionKey)}`);
  console.log(`[REQUEST] Payload:`, JSON.stringify(payload, null, 2));
  
  // Get OAuth token first (REQUIRED for invoice submission)
  if (!credentials.username || !credentials.password) {
    console.error('[ERROR] OTR_USERNAME and OTR_PASSWORD required for invoice submission');
    return {
      attempt_id,
      timestamps,
      request_url,
      subscription_key_masked: maskSubscriptionKey(credentials.subscriptionKey),
      payload,
      response_status: 0,
      response_headers: {},
      response_body: { error: 'OTR_USERNAME and OTR_PASSWORD secrets required for invoice submission' },
      success: false,
    };
  }
  
  console.log('[TOKEN] Getting OAuth bearer token (REQUIRED for invoice submission)...');
  const tokenResult = await getOtrToken(
    credentials.subscriptionKey,
    credentials.username,
    credentials.password
  );
  
  if (!tokenResult.success || !tokenResult.access_token) {
    console.error('[TOKEN] Failed to get token:', tokenResult.error);
    return {
      attempt_id,
      timestamps,
      token_result: {
        success: false,
        attempt_id: tokenResult.attempt_id,
        error: tokenResult.error,
      },
      request_url,
      subscription_key_masked: maskSubscriptionKey(credentials.subscriptionKey),
      payload,
      response_status: 0,
      response_headers: {},
      response_body: { error: `Token authentication failed: ${tokenResult.error}` },
      success: false,
    };
  }
  
  console.log(`[TOKEN] Token obtained successfully (attempt: ${tokenResult.attempt_id})`);
  
  // Use bearer token for invoice submission
  const headers = getOtrHeadersWithToken(credentials.subscriptionKey, tokenResult.access_token);
  
  try {
    const response = await fetch(request_url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => { responseHeaders[k] = v; });
    
    const bodyRaw = await response.text();
    let response_body: unknown;
    try {
      response_body = JSON.parse(bodyRaw);
    } catch {
      response_body = bodyRaw;
    }
    
    console.log(`[RESPONSE] Status: ${response.status}`);
    console.log(`[RESPONSE] Headers:`, JSON.stringify(responseHeaders, null, 2));
    console.log(`[RESPONSE] Body:`, bodyRaw);
    console.log('='.repeat(70));
    
    return {
      attempt_id,
      timestamps,
      token_result: {
        success: true,
        attempt_id: tokenResult.attempt_id,
      },
      request_url,
      subscription_key_masked: maskSubscriptionKey(credentials.subscriptionKey),
      payload,
      response_status: response.status,
      response_headers: responseHeaders,
      response_body,
      success: response.ok,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ERROR] ${errMsg}`);
    
    return {
      attempt_id,
      timestamps,
      token_result: {
        success: true,
        attempt_id: tokenResult.attempt_id,
      },
      request_url,
      subscription_key_masked: maskSubscriptionKey(credentials.subscriptionKey),
      payload,
      response_status: 0,
      response_headers: {},
      response_body: { error: errMsg },
      success: false,
    };
  }
}

/**
 * OTR Test Function with Timezone Awareness
 * 
 * Tests OTR API connectivity with staging window enforcement.
 * 
 * OTR Staging Hours: 8:00 AM - 11:00 PM US/Eastern
 * 
 * Usage:
 *   POST /test-otr-api
 *   Body: { "test_type": "broker_check", "broker_mc": "635576" }
 *   Body: { "test_type": "invoice_exact" } - runs with known-good OTR payload
 *   Body: { "test_type": "known_good" } - runs with the exact OTR-specified payload
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Get timestamps FIRST - before any processing
  const timestamps = getTimestampInfo();

  console.log('\n' + '#'.repeat(70));
  console.log('# OTR API TEST - TIMEZONE AWARE');
  console.log('#'.repeat(70));
  console.log(`[TIME] UTC: ${timestamps.utc_time}`);
  console.log(`[TIME] Eastern (America/New_York): ${timestamps.eastern_time}`);
  console.log(`[TIME] Eastern Hour: ${timestamps.eastern_hour}`);
  console.log(`[TIME] OTR Staging Window: 08:00 - 23:00 Eastern`);
  console.log(`[TIME] Within Staging Hours: ${timestamps.within_staging_hours}`);
  console.log('#'.repeat(70));

  // STAGING WINDOW GUARD
  if (!timestamps.within_staging_hours) {
    console.log('\n[BLOCKED] Request blocked - outside OTR staging window');
    console.log('[BLOCKED] OTR Staging hours are 08:00-23:00 America/New_York');
    
    return new Response(
      JSON.stringify({
        success: false,
        error: "OTR staging window closed",
        message: "OTR staging environment is only available 8:00 AM - 11:00 PM US/Eastern",
        utc_time: timestamps.utc_time,
        eastern_time: timestamps.eastern_time,
        eastern_hour: timestamps.eastern_hour,
        within_staging_hours: timestamps.within_staging_hours,
        staging_hours: "08:00-23:00 America/New_York",
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { test_type = 'known_good', broker_mc } = body;

    // Get credentials
    const credentials = getOtrCredentialsFromEnv();
    if (!credentials) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'OTR_API_KEY not configured in secrets',
          utc_time: timestamps.utc_time,
          eastern_time: timestamps.eastern_time,
          within_staging_hours: timestamps.within_staging_hours,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[CONFIG] Base URL: ${OTR_API_BASE_URL}`);
    console.log(`[CONFIG] Subscription key: ${maskSubscriptionKey(credentials.subscriptionKey)}`);
    console.log(`[CONFIG] Username configured: ${credentials.username ? 'YES' : 'NO'}`);
    console.log(`[CONFIG] Password configured: ${credentials.password ? 'YES' : 'NO'}`);
    console.log(`[CONFIG] ISO date format enabled: ${useIsoDateFormat()}`);
    console.log(`[CONFIG] Test type: ${test_type}`);

    // Initialize results with timing info
    const results: {
      config: {
        base_url: string;
        subscription_key_masked: string;
        token_auth_required: boolean;
        username_configured: boolean;
        password_configured: boolean;
        iso_date_format_enabled: boolean;
        endpoints: {
          broker_check: string;
          invoices: string;
          token: string;
        };
      };
      broker_check?: unknown;
      invoice_submit?: CorrelatedRequest;
    } = {
      config: {
        base_url: OTR_API_BASE_URL,
        subscription_key_masked: maskSubscriptionKey(credentials.subscriptionKey),
        token_auth_required: true, // OTR confirmed bearer token is REQUIRED
        username_configured: !!credentials.username,
        password_configured: !!credentials.password,
        iso_date_format_enabled: useIsoDateFormat(),
        endpoints: {
          broker_check: `${OTR_API_BASE_URL}/broker-check/{brokerMc}`,
          invoices: `${OTR_API_BASE_URL}/invoices`,
          token: `${OTR_API_BASE_URL}/token`,
        },
      },
    };

    // Test broker check
    if (test_type === 'broker_check' || test_type === 'both') {
      const testMc = broker_mc || '635576';
      console.log(`\n[TEST] Testing broker check with MC: ${testMc}`);
      
      results.broker_check = await testOtrBrokerCheck(
        credentials.subscriptionKey,
        testMc
      );
    }

    // KNOWN GOOD PAYLOAD - Exact payload from OTR documentation
    if (test_type === 'known_good' || test_type === 'invoice_exact' || test_type === 'both') {
      // This is the EXACT payload specified by OTR as known-good:
      const knownGoodPayload: OtrInvoicePayload = {
        BrokerMC: 635576,
        ClientDOT: "2391750",
        FromCity: "FAIRLESS HILLS",
        FromState: "PA",
        ToCity: "FRAMINGHAM",
        ToState: "MA",
        PoNumber: "1144695",
        InvoiceNo: "1000002",
        InvoiceDate: "2025-12-22",  // The exact date from OTR spec
        InvoiceAmount: 800,
      };
      
      console.log(`\n[TEST] Testing KNOWN-GOOD invoice submission`);
      console.log(`[TEST] Payload:`, JSON.stringify(knownGoodPayload, null, 2));
      
      // Validate before submission
      const validation = validateOtrPayload(knownGoodPayload);
      console.log(`[VALIDATION] Pre-submission validation:`, JSON.stringify(validation, null, 2));
      
      // Execute with correlation logging (includes token fetch)
      results.invoice_submit = await executeCorrelatedInvoiceSubmit(
        credentials,
        knownGoodPayload,
        timestamps
      );
    }

    console.log('\n' + '='.repeat(70));
    console.log('[COMPLETE] Test Complete');
    console.log('='.repeat(70));

    return new Response(
      JSON.stringify({
        success: true,
        test_type,
        utc_time: timestamps.utc_time,
        eastern_time: timestamps.eastern_time,
        eastern_hour: timestamps.eastern_hour,
        within_staging_hours: timestamps.within_staging_hours,
        staging_hours: "08:00-23:00 America/New_York",
        attempt_id: results.invoice_submit?.attempt_id || null,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ERROR]', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        utc_time: timestamps.utc_time,
        eastern_time: timestamps.eastern_time,
        within_staging_hours: timestamps.within_staging_hours,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
