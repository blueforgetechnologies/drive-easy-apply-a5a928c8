import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  OTR_API_BASE_URL, 
  getOtrCredentialsFromEnv,
  maskSubscriptionKey,
  isTokenAuthEnabled,
  testOtrBrokerCheck,
  testOtrInvoiceSubmit,
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
 *   Body: { "test_type": "both" } - runs both with sample data
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { test_type = 'both', broker_mc, payload } = body;

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

    console.log('='.repeat(60));
    console.log('[test-otr-api] OTR API Test Starting');
    console.log('='.repeat(60));
    console.log(`[test-otr-api] Base URL: ${OTR_API_BASE_URL}`);
    console.log(`[test-otr-api] Subscription key: ${maskSubscriptionKey(credentials.subscriptionKey)}`);
    console.log(`[test-otr-api] Token auth enabled: ${isTokenAuthEnabled()}`);
    console.log(`[test-otr-api] Test type: ${test_type}`);
    console.log('='.repeat(60));

    const results: {
      config: {
        base_url: string;
        subscription_key_masked: string;
        token_auth_enabled: boolean;
        endpoints: {
          broker_check: string;
          invoices: string;
        };
      };
      broker_check?: {
        success: boolean;
        request_url: string;
        response_status: number;
        response_body: unknown;
        error?: string;
      };
      invoice_submit?: {
        success: boolean;
        request_url: string;
        request_payload: unknown;
        response_status: number;
        response_body: unknown;
        error?: string;
      };
    } = {
      config: {
        base_url: OTR_API_BASE_URL,
        subscription_key_masked: maskSubscriptionKey(credentials.subscriptionKey),
        token_auth_enabled: isTokenAuthEnabled(),
        endpoints: {
          broker_check: `${OTR_API_BASE_URL}/broker-check/{brokerMc}`,
          invoices: `${OTR_API_BASE_URL}/invoices`,
        },
      },
    };

    // Test broker check
    if (test_type === 'broker_check' || test_type === 'both') {
      const testMc = broker_mc || '635576'; // Default test MC
      console.log(`\n[test-otr-api] Testing broker check with MC: ${testMc}`);
      
      results.broker_check = await testOtrBrokerCheck(
        credentials.subscriptionKey,
        testMc
      );
    }

    // Test invoice submission
    if (test_type === 'invoice' || test_type === 'both') {
      // Use provided payload or default test payload
      const testPayload = payload || {
        BrokerMC: 635576,
        ClientDOT: "2391750",
        FromCity: "FAIRLESS HILLS",
        FromState: "PA",
        ToCity: "FRAMINGHAM",
        ToState: "MA",
        PoNumber: "TEST-1144695",
        InvoiceNo: `TEST-${Date.now()}`, // Unique invoice number for each test
        InvoiceDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        InvoiceAmount: 800,
      };
      
      console.log(`\n[test-otr-api] Testing invoice submission`);
      
      results.invoice_submit = await testOtrInvoiceSubmit(
        credentials.subscriptionKey,
        testPayload
      );
    }

    console.log('\n' + '='.repeat(60));
    console.log('[test-otr-api] Test Complete');
    console.log('='.repeat(60));
    console.log('[test-otr-api] Results:', JSON.stringify(results, null, 2));

    return new Response(
      JSON.stringify({
        success: true,
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
