import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ParsedData = Record<string, unknown>;

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
};

type GmailMessage = {
  id?: string;
  threadId?: string;
  internalDate?: string;
  payload?: GmailPart;
};

function getHeaderValue(headers: GmailHeader[] | undefined, name: string): string {
  if (!headers) return "";
  const found = headers.find((h) => (h.name || "").toLowerCase() === name.toLowerCase());
  return found?.value || "";
}

function base64UrlToUint8Array(data: string): Uint8Array {
  // Gmail uses base64url (RFC 4648 §5)
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "===".slice((base64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeBase64UrlToString(data: string): string {
  try {
    const bytes = base64UrlToUint8Array(data);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

function extractFirstBody(part: GmailPart | undefined, mimeType: string): string {
  if (!part) return "";

  if (part.mimeType === mimeType && part.body?.data) {
    return decodeBase64UrlToString(part.body.data);
  }

  if (Array.isArray(part.parts)) {
    for (const p of part.parts) {
      const found = extractFirstBody(p, mimeType);
      if (found) return found;
    }
  }

  return "";
}

function extractBodiesFromMessage(message: GmailMessage): { textPlain: string; textHtml: string } {
  const payload = message.payload;
  const textPlain = extractFirstBody(payload, "text/plain");
  const textHtml = extractFirstBody(payload, "text/html");

  // Some messages have only one part. If so, try the other mime type as fallback.
  const fallback = textPlain || textHtml || "";
  return {
    textPlain: textPlain || (textHtml ? textHtml.replace(/<[^>]*>/g, " ") : ""),
    textHtml: textHtml || "",
  };
}

async function loadMessageFromStorage(rawPayloadUrl: string): Promise<GmailMessage | null> {
  try {
    const { data, error } = await supabase.storage.from("email-payloads").download(rawPayloadUrl);
    if (error) {
      console.log(`[reparse] storage download failed: ${rawPayloadUrl} - ${error.message}`);
      return null;
    }
    const text = await data.text();
    return JSON.parse(text) as GmailMessage;
  } catch (e) {
    console.log(`[reparse] storage payload parse failed: ${rawPayloadUrl} - ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

function parseLoadEmail(subjectRaw: string, bodyRaw: string): ParsedData {
  const subject = (subjectRaw || "").trim();
  const bodyText = bodyRaw || "";

  const parsed: Record<string, unknown> = {};

  // Vehicle type: anything before " from" (handles "SPRINTER", "E 26 FOOT", "Cargo Van", etc.)
  const vehicleTypeMatch = subject.match(/^(.+?)\s+from\s+/i);
  if (vehicleTypeMatch?.[1]) {
    parsed.vehicle_type = vehicleTypeMatch[1].trim();
  }

  // Extract origin and destination from subject
  const routeMatch = subject.match(/from\s+([^,]+),\s*([A-Z]{2})\s+to\s+([^,]+),\s*([A-Z]{2})/i);
  if (routeMatch) {
    parsed.origin_city = routeMatch[1].trim();
    parsed.origin_state = routeMatch[2].trim();
    parsed.destination_city = routeMatch[3].trim();
    parsed.destination_state = routeMatch[4].trim();
  }

  // Miles
  const milesMatch = subject.match(/:\s*(\d+)\s*miles/i);
  if (milesMatch) parsed.loaded_miles = parseInt(milesMatch[1], 10);

  // Weight
  const weightMatch = subject.match(/(\d+)\s*lbs/i);
  if (weightMatch) parsed.weight = weightMatch[1];

  // Posted by
  const postedByMatch = subject.match(/Posted by\s+([^\(]+)/i);
  if (postedByMatch) parsed.customer = postedByMatch[1].trim();

  // Order Number in body
  const orderNumberMatch = bodyText.match(/Bid on Order #(\d+)/i);
  if (orderNumberMatch) parsed.order_number = orderNumberMatch[1];

  // Broker email: try to find any email address in body
  const emailMatch = bodyText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) parsed.broker_email = emailMatch[1];

  return parsed;
}

function buildIssueNotes(parsedData: ParsedData): { has_issues: boolean; issue_notes: string | null } {
  const originCity = typeof parsedData.origin_city === "string" ? parsedData.origin_city : "";
  const vehicleType = typeof parsedData.vehicle_type === "string" ? parsedData.vehicle_type : "";
  const brokerEmail = typeof parsedData.broker_email === "string" ? parsedData.broker_email : "";

  const notes = [
    !brokerEmail ? "Missing broker email" : null,
    !originCity ? "Missing origin location" : null,
    !vehicleType ? "Missing vehicle type" : null,
  ].filter(Boolean) as string[];

  return {
    has_issues: notes.length > 0,
    issue_notes: notes.length ? notes.join("; ") : null,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---- Auth: require the caller to be a member of the tenant they request ----
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Request params ----
    let tenantId: string | null = null;
    let onlyMissing = false;
    let limit = 500;

    try {
      const body = await req.json();
      tenantId = body.tenant_id || null;
      onlyMissing = body.only_missing === true;
      limit = Math.min(Math.max(body.limit || 500, 1), 2000);
    } catch {
      // ignore
    }

    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenant_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: membership } = await supabase
      .from("tenant_users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userData.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Not allowed for this tenant" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[reparse] start tenant=${tenantId} only_missing=${onlyMissing} limit=${limit}`);

    const { data: emails, error: fetchError } = await supabase
      .from("load_emails")
      .select("id, tenant_id, subject, body_html, body_text, raw_payload_url, parsed_data, received_at")
      .eq("tenant_id", tenantId)
      .order("received_at", { ascending: false })
      .limit(limit);

    if (fetchError) throw fetchError;

    let success = 0;
    let errors = 0;
    let skippedMissing = 0;
    let skippedNoParse = 0;
    let skippedNotMissing = 0;

    for (const email of emails || []) {
      try {
        const currentParsed = (email as any).parsed_data as ParsedData | null;

        if (onlyMissing) {
          const originCity = currentParsed && typeof currentParsed.origin_city === "string" ? currentParsed.origin_city : null;
          const vehicleType = currentParsed && typeof currentParsed.vehicle_type === "string" ? currentParsed.vehicle_type : null;
          if (originCity && vehicleType) {
            skippedNotMissing++;
            continue;
          }
        }

        let subject = ((email as any).subject || "").trim();
        let bodyText = (email as any).body_text || "";
        let bodyHtml = (email as any).body_html || "";

        // If we don't have enough stored content, fall back to the raw Gmail payload.
        const rawPayloadUrl = (email as any).raw_payload_url as string | null;
        if ((!subject || (!bodyText && !bodyHtml)) && rawPayloadUrl) {
          const message = await loadMessageFromStorage(rawPayloadUrl);
          if (message) {
            const headers = message.payload?.headers || [];
            subject = subject || getHeaderValue(headers, "Subject");
            const bodies = extractBodiesFromMessage(message);
            bodyText = bodyText || bodies.textPlain;
            bodyHtml = bodyHtml || bodies.textHtml;
          }
        }

        const bodyForParsing = bodyHtml || bodyText || "";

        if (!subject && !bodyForParsing) {
          console.log(`[reparse] Skipping email ${(email as any).id} - missing subject and body`);
          skippedMissing++;
          continue;
        }

        const reparsed = parseLoadEmail(subject, bodyForParsing);

        // If we still couldn't extract anything useful, skip.
        const originCity = typeof reparsed.origin_city === "string" ? reparsed.origin_city : "";
        const vehicleType = typeof reparsed.vehicle_type === "string" ? reparsed.vehicle_type : "";
        if (!originCity && !vehicleType) {
          console.log(`[reparse] Skipping email ${(email as any).id} - no parseable data found`);
          skippedNoParse++;
          continue;
        }

        const mergedParsed: ParsedData = {
          ...(currentParsed || {}),
          ...reparsed,
        };

        const { has_issues, issue_notes } = buildIssueNotes(mergedParsed);

        const { error: updateError } = await supabase
          .from("load_emails")
          .update({
            subject: subject || null,
            // Keep stored body_html null (worker design); store body_text when available
            body_text: bodyText ? String(bodyText).slice(0, 50000) : null,
            parsed_data: mergedParsed,
            has_issues,
            issue_notes,
          })
          .eq("id", (email as any).id);

        if (updateError) {
          console.log(`[reparse] update error ${(email as any).id}: ${updateError.message}`);
          errors++;
        } else {
          success++;
        }
      } catch (e) {
        console.log(`[reparse] error processing: ${e instanceof Error ? e.message : String(e)}`);
        errors++;
      }
    }

    console.log(
      `[reparse] done success=${success} errors=${errors} skipped_missing=${skippedMissing} skipped_no_parse=${skippedNoParse} skipped_not_missing=${skippedNotMissing}`,
    );

    return new Response(
      JSON.stringify({
        message: "Reparse complete",
        success,
        errors,
        skipped_missing: skippedMissing,
        skipped_no_parse: skippedNoParse,
        skipped_not_missing: skippedNotMissing,
        total: emails?.length || 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in reparse-load-emails:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
