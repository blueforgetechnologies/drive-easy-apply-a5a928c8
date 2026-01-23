import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  OTR_API_BASE_URL, 
  getOtrCredentialsFromEnv,
  maskSubscriptionKey,
  isTokenAuthEnabled,
  useIsoDateFormat,
  testOtrBrokerCheck,
  testOtrInvoiceSubmit,
  validateOtrPayload,
  type OtrInvoicePayload,
} from "../_shared/otrClient.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * OTR Test Function
 * 
 * Tests OTR API connectivity with broker check and invoice submission.
 * Logs full request/response details (with masked keys) for debugging.
 * 
 * Usage:
 *   POST /test-otr-api
 *   Body: { "test_type": "broker_check", "broker_mc": "635576" }
 *   Body: { "test_type": "invoice", "payload": { ... } }
 *   Body: { "test_type": "invoice_exact" } - runs with exact OTR-specified payload
 *   Body: { "test_type": "invoice_iso" } - runs with ISO date format (YYYY-MM-DDT00:00:00Z)
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { test_type = 'invoice_exact', broker_mc, payload } = body;

    // Get credentials
    const credentials = getOtrCredentialsFromEnv();
    if (!credentials) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'OTR_API_KEY not configured in secrets' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('='.repeat(70));
    console.log('[test-otr-api] OTR API Test Starting');
    console.log('='.repeat(70));
    console.log(`[test-otr-api] Base URL: ${OTR_API_BASE_URL}`);
    console.log(`[test-otr-api] Subscription key: ${maskSubscriptionKey(credentials.subscriptionKey)}`);
    console.log(`[test-otr-api] Token auth enabled: ${isTokenAuthEnabled()}`);
    console.log(`[test-otr-api] ISO date format enabled: ${useIsoDateFormat()}`);
    console.log(`[test-otr-api] Test type: ${test_type}`);
    console.log('='.repeat(70));

    const results: {
      config: {
        base_url: string;
        subscription_key_masked: string;
        token_auth_enabled: boolean;
        iso_date_format_enabled: boolean;
        endpoints: {
          broker_check: string;
          invoices: string;
        };
      };
      broker_check?: unknown;
      invoice_submit?: unknown;
    } = {
      config: {
        base_url: OTR_API_BASE_URL,
        subscription_key_masked: maskSubscriptionKey(credentials.subscriptionKey),
        token_auth_enabled: isTokenAuthEnabled(),
        iso_date_format_enabled: useIsoDateFormat(),
        endpoints: {
          broker_check: `${OTR_API_BASE_URL}/broker-check/{brokerMc}`,
          invoices: `${OTR_API_BASE_URL}/invoices`,
        },
      },
    };

    // Test broker check
    if (test_type === 'broker_check' || test_type === 'both') {
      const testMc = broker_mc || '635576';
      console.log(`\n[test-otr-api] Testing broker check with MC: ${testMc}`);
      
      results.broker_check = await testOtrBrokerCheck(
        credentials.subscriptionKey,
        testMc
      );
    }

    // Test invoice submission with exact payload from OTR email
    if (test_type === 'invoice_exact' || test_type === 'both') {
      // EXACT payload matching OTR email specification:
      // - InvoiceNo: numeric-only string
      // - PoNumber: numeric-only string
      // - InvoiceDate: YYYY-MM-DD format
      const exactPayload: OtrInvoicePayload = {
        BrokerMC: 635576,
        ClientDOT: "2391750",
        FromCity: "FAIRLESS HILLS",
        FromState: "PA",
        ToCity: "FRAMINGHAM",
        ToState: "MA",
        PoNumber: "1144695",       // Numeric-only per OTR spec
        InvoiceNo: "1000002",       // Numeric-only per OTR spec
        InvoiceDate: "2026-01-19",  // YYYY-MM-DD format
        InvoiceAmount: 800,
      };
      
      console.log(`\n[test-otr-api] Testing invoice submission with EXACT OTR payload`);
      
      // Validate before submission
      const validation = validateOtrPayload(exactPayload);
      console.log(`[test-otr-api] Pre-validation result:`, JSON.stringify(validation, null, 2));
      
      results.invoice_submit = await testOtrInvoiceSubmit(
        credentials.subscriptionKey,
        exactPayload
      );
    }

    // Test invoice submission with ISO date format
    if (test_type === 'invoice_iso') {
      const isoPayload: OtrInvoicePayload = {
        BrokerMC: 635576,
        ClientDOT: "2391750",
        FromCity: "FAIRLESS HILLS",
        FromState: "PA",
        ToCity: "FRAMINGHAM",
        ToState: "MA",
        PoNumber: "1144695",
        InvoiceNo: "1000003",  // Different invoice number to avoid duplicate
        InvoiceDate: "2026-01-19T00:00:00Z",  // ISO format with time
        InvoiceAmount: 800,
      };
      
      console.log(`\n[test-otr-api] Testing invoice submission with ISO DATE FORMAT`);
      
      results.invoice_submit = await testOtrInvoiceSubmit(
        credentials.subscriptionKey,
        isoPayload
      );
    }

    // Test with custom payload
    if (test_type === 'invoice' && payload) {
      console.log(`\n[test-otr-api] Testing invoice submission with custom payload`);
      
      results.invoice_submit = await testOtrInvoiceSubmit(
        credentials.subscriptionKey,
        payload as OtrInvoicePayload
      );
    }

    console.log('\n' + '='.repeat(70));
    console.log('[test-otr-api] Test Complete');
    console.log('='.repeat(70));
    console.log('[test-otr-api] Full Results:', JSON.stringify(results, null, 2));

    return new Response(
      JSON.stringify({
        success: true,
        test_type,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[test-otr-api] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
