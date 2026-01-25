import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertFeatureEnabled } from '../_shared/assertFeatureEnabled.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface BidEmailRequest {
  to: string;
  cc?: string;
  from_email: string;
  from_name: string;
  subject: string;
  bid_amount: string;
  mc_number: string;
  dot_number: string;
  order_number: string;
  origin_city: string;
  origin_state: string;
  dest_city: string;
  dest_state: string;
  vehicle_size: string;
  vehicle_type: string;
  vehicle_description: string;
  equipment_details: string;
  truck_dimensions: string;
  door_dimensions: string;
  truck_features: string;
  dispatcher_name: string;
  company_name: string;
  company_address: string;
  company_phone: string;
  company_logo_url?: string;
  reference_id: string;
  contact_first_name?: string;
  selected_templates?: string[];
  // Editable body lines
  greeting_line?: string;
  blank_line?: string;
  vehicle_line?: string;
  help_line?: string;
  order_line?: string;
  // Admin override for verification
  overrideTenantId?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    
    // Safely extract overrideTenantId from body (for admin verification tests)
    let overrideTenantId: string | undefined;
    let requestBody: any = {};
    
    try {
      const bodyText = await req.text();
      if (bodyText) {
        requestBody = JSON.parse(bodyText);
        overrideTenantId = requestBody.overrideTenantId;
      }
    } catch (e) {
      // Empty or invalid body is fine - we'll validate required fields later
      console.log('[send-bid-email] Body parsing note:', e instanceof Error ? e.message : 'empty body');
    }
    
    // Feature gate FIRST - derive tenant from auth, check bid_automation_enabled
    const gateResult = await assertFeatureEnabled({
      flag_key: 'bid_automation_enabled',
      authHeader,
      overrideTenantId,
    });
    
    if (!gateResult.allowed) {
      console.log(`[send-bid-email] Feature disabled: ${gateResult.reason}`);
      return gateResult.response!;
    }

    // Cast to typed request after gate passes
    const data: BidEmailRequest = requestBody;
    
    // Validate required fields
    if (!data.to || !data.subject) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[send-bid-email] Processing for tenant ${gateResult.tenant_id}, user ${gateResult.user_id}`);
    
    // Normalize email domain to lowercase for Resend domain verification compatibility
    const normalizedFromEmail = data.from_email?.toLowerCase() || 'dispatch@blueforgetechnologies.org';
    
    console.log("Sending bid email to:", data.to);
    console.log("From:", data.from_name, "<", normalizedFromEmail, ">");

    // Build selected templates HTML section
    const selectedTemplatesHtml = data.selected_templates && data.selected_templates.length > 0
      ? data.selected_templates.map(t => `<p style="background-color: #EBF4FF; padding: 8px; border-radius: 4px; margin: 8px 0;">${t}</p>`).join('')
      : '';

    // Build selected templates text section
    const selectedTemplatesText = data.selected_templates && data.selected_templates.length > 0
      ? '\n' + data.selected_templates.join('\n\n') + '\n'
      : '';

    // Get time-based greeting (fallback if not provided)
    const hour = new Date().getHours();
    let timeGreeting = 'Good morning';
    if (hour >= 12 && hour < 17) {
      timeGreeting = 'Good afternoon';
    } else if (hour >= 17) {
      timeGreeting = 'Good evening';
    }
    const defaultGreeting = data.contact_first_name 
      ? `${timeGreeting} ${data.contact_first_name},` 
      : `${timeGreeting},`;

    // Use editable lines if provided, otherwise fall back to defaults
    const greetingLine = data.greeting_line || defaultGreeting;
    const blankLine = data.blank_line || '';
    const vehicleLine = data.vehicle_line || data.vehicle_description || '';
    const helpLine = data.help_line || 'Please let me know if I can help on this load:';
    const orderLine = data.order_line || `Order Number: ${data.order_number || 'N/A'} [${data.origin_city || '?'}, ${data.origin_state || '?'} to ${data.dest_city || '?'}, ${data.dest_state || '?'}]`;

    // Build the HTML email body
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <p style="margin: 0 0 20px 0;">
          <span style="background-color: #FFFF00; display: inline-block; padding: 4px 8px; font-weight: bold; margin-right: 8px;">Rate: $ ${data.bid_amount || 'TBD'}</span>
          <span style="background-color: #FFFF00; display: inline-block; padding: 4px 8px; font-weight: bold; margin-right: 8px;">MC#: ${data.mc_number || 'N/A'}</span>
          <span style="background-color: #FFFF00; display: inline-block; padding: 4px 8px; font-weight: bold;">USDOT#: ${data.dot_number || 'N/A'}</span>
        </p>
        
        <p style="margin-top: 20px;">${greetingLine}</p>
        
        ${blankLine ? `<p>${blankLine}</p>` : ''}
        
        <p>${vehicleLine}</p>
        
        <p>${helpLine}</p>
        
        <p>${orderLine}</p>
        
        ${selectedTemplatesHtml}
        
        <div style="margin-top: 20px; border-top: 1px dashed #ccc; padding-top: 15px; line-height: 1.4;">
          <p style="margin: 0 0 2px 0;"><strong>Truck Carries:</strong> ${data.equipment_details || 'N/A'}</p>
          <p style="margin: 0 0 2px 0;"><strong>Truck Size:</strong> ${data.truck_dimensions || 'N/A'}</p>
          <p style="margin: 0 0 2px 0;"><strong>Door Type and Size:</strong> ${data.door_dimensions || 'N/A'}</p>
          <p style="margin: 0;"><strong>Truck Features:</strong> ${data.truck_features || 'N/A'}</p>
        </div>
        
        <table style="margin-top: 30px; border-top: 1px solid #ccc; padding-top: 20px; width: 100%;">
          <tr>
            <td style="vertical-align: bottom;">
              <p style="font-weight: bold; margin: 0;">${data.dispatcher_name || 'Dispatcher'}</p>
              <p style="margin: 4px 0;">Dispatch • ${data.company_name || 'Company'}</p>
              <p style="font-weight: bold; margin: 4px 0;">MC#: ${data.mc_number || 'N/A'} • USDOT#: ${data.dot_number || 'N/A'}</p>
              <p style="margin: 4px 0;">${data.company_address || ''}</p>
              <p style="margin: 4px 0;">Cell: <strong>${data.company_phone || 'N/A'}</strong> • ${data.from_email || ''}</p>
            </td>
            ${data.company_logo_url ? `<td style="vertical-align: bottom; text-align: left; padding-left: 0;"><img src="${data.company_logo_url}" alt="${data.company_name}" style="max-height: 70px; max-width: 180px;" /></td>` : ''}
          </tr>
        </table>
        
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">Reference #: ${data.reference_id || 'N/A'}</p>
        </div>
      </div>
    `;

    // Build plain text version
    const textBody = `
Rate: $ ${data.bid_amount || 'TBD'}
MC#: ${data.mc_number || 'N/A'}
USDOT#: ${data.dot_number || 'N/A'}

${greetingLine}
${blankLine ? `\n${blankLine}` : ''}
${vehicleLine}

${helpLine}

${orderLine}

Truck Carries: ${data.equipment_details || 'N/A'}
Truck Size: ${data.truck_dimensions || 'N/A'}
Door Type and Size: ${data.door_dimensions || 'N/A'}
Truck Features: ${data.truck_features || 'N/A'}
${selectedTemplatesText}
---
${data.dispatcher_name || 'Dispatcher'}
Dispatch
${data.company_name || 'Company'}
MC#: ${data.mc_number || 'N/A'} USDOT#: ${data.dot_number || 'N/A'}
${data.company_address || ''}
Cell: ${data.company_phone || 'N/A'}
Email: ${data.from_email || ''}

Reference #: ${data.reference_id || 'N/A'}
    `.trim();

    // Build Resend API request
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const emailPayload: any = {
      from: `${data.company_name || 'Company'} <${normalizedFromEmail}>`,
      to: [data.to],
      subject: data.subject,
      html: htmlBody,
      text: textBody,
      reply_to: normalizedFromEmail,
    };

    // Add CC if provided
    if (data.cc && data.cc.trim()) {
      emailPayload.cc = [data.cc.trim()];
    }

    console.log("Email payload:", JSON.stringify(emailPayload, null, 2));

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const result = await response.json();

    // Service client for tracking
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (!response.ok) {
      console.error("Resend API error:", result);
      // Track failed send
      await supabase.from("email_send_tracking").insert({
        email_type: "bid_sent",
        recipient_email: data.to,
        success: false,
        month_year: new Date().toISOString().slice(0, 7),
      });
      throw new Error(result.message || "Failed to send email");
    }

    console.log("Email sent successfully:", result);

    // Track successful send
    await supabase.from("email_send_tracking").insert({
      email_type: "bid_sent",
      recipient_email: data.to,
      success: true,
      month_year: new Date().toISOString().slice(0, 7),
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-bid-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
