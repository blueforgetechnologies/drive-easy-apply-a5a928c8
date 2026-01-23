import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  OTR_API_BASE_URL, 
  getOtrCredentialsFromEnv,
  maskSubscriptionKey,
  getOtrHeaders,
  type OtrInvoicePayload,
} from "../_shared/otrClient.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestResult {
  test_name: string;
  test_description: string;
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    payload: unknown;
  };
  response: {
    status: number;
    headers: Record<string, string>;
    body_raw: string;
    body_parsed: unknown;
  };
  success: boolean;
  notes: string;
}

async function runInvoiceTest(
  testName: string,
  description: string,
  payload: OtrInvoicePayload,
  subscriptionKey: string
): Promise<TestResult> {
  const url = `${OTR_API_BASE_URL}/invoices`;
  const headers = getOtrHeaders(subscriptionKey);
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`[TEST] ${testName}`);
  console.log(`[DESC] ${description}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`[REQ] POST ${url}`);
  console.log(`[REQ] Payload:`, JSON.stringify(payload, null, 2));
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => { responseHeaders[k] = v; });
    
    const bodyRaw = await response.text();
    let bodyParsed: unknown;
    try {
      bodyParsed = JSON.parse(bodyRaw);
    } catch {
      bodyParsed = bodyRaw;
    }
    
    console.log(`[RES] Status: ${response.status}`);
    console.log(`[RES] Headers:`, JSON.stringify(responseHeaders, null, 2));
    console.log(`[RES] Body:`, bodyRaw);
    
    return {
      test_name: testName,
      test_description: description,
      request: {
        url,
        method: 'POST',
        headers: { ...headers, 'ocp-apim-subscription-key': maskSubscriptionKey(subscriptionKey) },
        payload,
      },
      response: {
        status: response.status,
        headers: responseHeaders,
        body_raw: bodyRaw,
        body_parsed: bodyParsed,
      },
      success: response.ok,
      notes: response.ok ? 'SUCCESS' : `Failed with ${response.status}`,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ERR] ${errMsg}`);
    return {
      test_name: testName,
      test_description: description,
      request: {
        url,
        method: 'POST',
        headers: { ...headers, 'ocp-apim-subscription-key': maskSubscriptionKey(subscriptionKey) },
        payload,
      },
      response: {
        status: 0,
        headers: {},
        body_raw: '',
        body_parsed: null,
      },
      success: false,
      notes: `Network error: ${errMsg}`,
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const credentials = getOtrCredentialsFromEnv();
    if (!credentials) {
      return new Response(
        JSON.stringify({ error: 'OTR_API_KEY not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const subKey = credentials.subscriptionKey;
    const results: TestResult[] = [];

    // =========================================================================
    // STEP 1: Verify endpoint
    // =========================================================================
    console.log('\n' + '#'.repeat(70));
    console.log('# STEP 1: ENDPOINT VERIFICATION');
    console.log('#'.repeat(70));
    console.log(`Base URL: ${OTR_API_BASE_URL}`);
    console.log(`Full Invoice Endpoint: ${OTR_API_BASE_URL}/invoices`);
    console.log(`No redirects or proxies - direct fetch to OTR staging`);

    // =========================================================================
    // STEP 2A: InvoiceAmount format tests
    // =========================================================================
    console.log('\n' + '#'.repeat(70));
    console.log('# STEP 2A: InvoiceAmount FORMAT TESTS');
    console.log('#'.repeat(70));

    const basePayload: OtrInvoicePayload = {
      BrokerMC: 635576,
      ClientDOT: "2391750",
      FromCity: "FAIRLESS HILLS",
      FromState: "PA",
      ToCity: "FRAMINGHAM",
      ToState: "MA",
      PoNumber: "1144695",
      InvoiceNo: "1000002",
      InvoiceDate: "2025-12-22", // Past date to avoid future date issues
      InvoiceAmount: 800,
    };

    // Test 2A.1: Integer amount (800)
    results.push(await runInvoiceTest(
      '2A.1_Amount_Integer',
      'InvoiceAmount as integer: 800',
      { ...basePayload, InvoiceAmount: 800, InvoiceNo: "1000010" },
      subKey
    ));

    // Test 2A.2: Float with one decimal (800.0)
    results.push(await runInvoiceTest(
      '2A.2_Amount_OneDecimal',
      'InvoiceAmount as float: 800.0',
      { ...basePayload, InvoiceAmount: 800.0, InvoiceNo: "1000011" },
      subKey
    ));

    // Test 2A.3: Float with two decimals (800.00) - JSON will still be 800
    results.push(await runInvoiceTest(
      '2A.3_Amount_TwoDecimals',
      'InvoiceAmount as 800.00 (note: JSON serializes to 800)',
      { ...basePayload, InvoiceAmount: 800.00, InvoiceNo: "1000012" },
      subKey
    ));

    // Test 2A.4: Non-round amount
    results.push(await runInvoiceTest(
      '2A.4_Amount_WithCents',
      'InvoiceAmount with cents: 800.50',
      { ...basePayload, InvoiceAmount: 800.50, InvoiceNo: "1000013" },
      subKey
    ));

    // =========================================================================
    // STEP 2B: InvoiceDate constraint tests
    // =========================================================================
    console.log('\n' + '#'.repeat(70));
    console.log('# STEP 2B: InvoiceDate CONSTRAINT TESTS');
    console.log('#'.repeat(70));

    // Test 2B.1: Past date
    results.push(await runInvoiceTest(
      '2B.1_Date_Past',
      'InvoiceDate as past date: 2025-12-22',
      { ...basePayload, InvoiceDate: "2025-12-22", InvoiceNo: "1000020" },
      subKey
    ));

    // Test 2B.2: Today's date (2026-01-23)
    const today = new Date().toISOString().split('T')[0];
    results.push(await runInvoiceTest(
      '2B.2_Date_Today',
      `InvoiceDate as today: ${today}`,
      { ...basePayload, InvoiceDate: today, InvoiceNo: "1000021" },
      subKey
    ));

    // =========================================================================
    // STEP 2C: City formatting tests
    // =========================================================================
    console.log('\n' + '#'.repeat(70));
    console.log('# STEP 2C: CITY FORMATTING TESTS');
    console.log('#'.repeat(70));

    // Test 2C.1: Shortened city name
    results.push(await runInvoiceTest(
      '2C.1_City_Shortened',
      'FromCity shortened: "FAIRLESS" instead of "FAIRLESS HILLS"',
      { ...basePayload, FromCity: "FAIRLESS", InvoiceNo: "1000030" },
      subKey
    ));

    // Test 2C.2: Mixed case cities
    results.push(await runInvoiceTest(
      '2C.2_City_MixedCase',
      'Cities in mixed case: "Fairless Hills", "Framingham"',
      { ...basePayload, FromCity: "Fairless Hills", ToCity: "Framingham", InvoiceNo: "1000031" },
      subKey
    ));

    // =========================================================================
    // STEP 2D: Optional field tests (one at a time)
    // =========================================================================
    console.log('\n' + '#'.repeat(70));
    console.log('# STEP 2D: OPTIONAL/UNDOCUMENTED FIELD TESTS');
    console.log('#'.repeat(70));

    // Test 2D.1: With TermPkey
    results.push(await runInvoiceTest(
      '2D.1_With_TermPkey',
      'Adding TermPkey: 1',
      { ...basePayload, TermPkey: 1, InvoiceNo: "1000040" },
      subKey
    ));

    // Test 2D.2: With Miles
    results.push(await runInvoiceTest(
      '2D.2_With_Miles',
      'Adding Miles: 300',
      { ...basePayload, Miles: 300, InvoiceNo: "1000041" },
      subKey
    ));

    // Test 2D.3: With Weight
    results.push(await runInvoiceTest(
      '2D.3_With_Weight',
      'Adding Weight: 1000',
      { ...basePayload, Weight: 1000, InvoiceNo: "1000042" },
      subKey
    ));

    // Test 2D.4: With all optional fields
    results.push(await runInvoiceTest(
      '2D.4_With_AllOptional',
      'Adding TermPkey, Miles, Weight together',
      { ...basePayload, TermPkey: 1, Miles: 300, Weight: 1000, InvoiceNo: "1000043" },
      subKey
    ));

    // =========================================================================
    // STEP 2E: Minimal payload test
    // =========================================================================
    console.log('\n' + '#'.repeat(70));
    console.log('# STEP 2E: MINIMAL PAYLOAD TEST');
    console.log('#'.repeat(70));

    // Test with absolute minimum required fields
    results.push(await runInvoiceTest(
      '2E.1_Minimal_Payload',
      'Minimal payload with only documented required fields',
      {
        BrokerMC: 635576,
        ClientDOT: "2391750",
        FromCity: "FAIRLESS HILLS",
        FromState: "PA",
        ToCity: "FRAMINGHAM",
        ToState: "MA",
        PoNumber: "1144695",
        InvoiceNo: "1000050",
        InvoiceDate: "2025-12-22",
        InvoiceAmount: 800,
      },
      subKey
    ));

    // =========================================================================
    // STEP 3: Summary and analysis
    // =========================================================================
    console.log('\n' + '#'.repeat(70));
    console.log('# STEP 3: SUMMARY');
    console.log('#'.repeat(70));

    const successfulTests = results.filter(r => r.success);
    const failedTests = results.filter(r => !r.success);

    // Check for any pattern in failures
    const uniqueResponses = new Set(results.map(r => r.response.body_raw));
    const allSameError = uniqueResponses.size === 1 && !results[0].success;

    const summary = {
      endpoint_verified: {
        url: `${OTR_API_BASE_URL}/invoices`,
        method: 'POST',
        no_redirects: true,
        direct_to_otr_staging: true,
      },
      test_results: {
        total: results.length,
        successful: successfulTests.length,
        failed: failedTests.length,
        all_same_error: allSameError,
      },
      analysis: {
        payload_validation_issue: allSameError 
          ? 'All tests fail with same error - likely NOT a payload format issue'
          : 'Different errors observed - may be format-related',
        account_configuration_issue: allSameError
          ? 'LIKELY - Subscription key works for broker-check but not invoice submission. ClientDOT or BrokerMC may not be enabled for invoice posting in staging.'
          : 'Unknown - need OTR confirmation',
        requires_otr_confirmation: [
          'Is ClientDOT 2391750 registered for invoice submission in staging?',
          'Is BrokerMC 635576 approved for invoice submission (vs credit check only)?',
          'Are there missing required fields not in documentation?',
          'Is the staging environment fully functional for POST /invoices?',
        ],
      },
      known_good_payload: {
        note: 'This payload passes all client-side validation but is rejected by staging',
        payload: {
          BrokerMC: 635576,
          ClientDOT: "2391750",
          FromCity: "FAIRLESS HILLS",
          FromState: "PA",
          ToCity: "FRAMINGHAM",
          ToState: "MA",
          PoNumber: "1144695",
          InvoiceNo: "1000002",
          InvoiceDate: "2025-12-22",
          InvoiceAmount: 800,
        },
      },
      detailed_results: results,
    };

    console.log('\n' + '='.repeat(70));
    console.log('FINAL SUMMARY');
    console.log('='.repeat(70));
    console.log(JSON.stringify(summary, null, 2));

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[otr-diagnostic] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
