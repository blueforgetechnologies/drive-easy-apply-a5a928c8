import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface MatchNotificationRequest {
  tenant_id: string;
  match_id: string;
  load_email_id: string;
  vehicle_id: string;
  distance_miles: number;
  parsed_data: {
    origin_city?: string;
    origin_state?: string;
    destination_city?: string;
    destination_state?: string;
    rate?: string;
    weight?: string;
    vehicle_type?: string;
    pickup_date?: string;
    delivery_date?: string;
    broker_name?: string;
    order_number?: string;
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const data: MatchNotificationRequest = await req.json();
    const { tenant_id, match_id, load_email_id, vehicle_id, distance_miles, parsed_data } = data;

    if (!tenant_id || !match_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: tenant_id, match_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-match-notification] Processing for tenant ${tenant_id}, match ${match_id}`);

    // Check if notifications are enabled for this tenant
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, match_notifications_enabled, match_notification_emails, match_notification_from_email")
      .eq("id", tenant_id)
      .single();

    if (tenantError || !tenant) {
      console.log(`[send-match-notification] Tenant not found: ${tenant_id}`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "Tenant not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tenant.match_notifications_enabled) {
      console.log(`[send-match-notification] Notifications disabled for tenant ${tenant_id}`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "Notifications disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get vehicle info
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("unit_number, year, make, model")
      .eq("id", vehicle_id)
      .single();

    const vehicleDisplay = vehicle 
      ? `${vehicle.unit_number || 'Unknown'} (${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''})`.trim()
      : 'Unknown Vehicle';

    // Determine recipients
    let recipientEmails: string[] = [];
    
    // First check custom notification emails
    if (tenant.match_notification_emails && tenant.match_notification_emails.length > 0) {
      recipientEmails = tenant.match_notification_emails;
    } else {
      // Fall back to dispatchers from tenant_users
      const { data: dispatchers } = await supabase
        .from("tenant_users")
        .select("profiles!inner(email)")
        .eq("tenant_id", tenant_id)
        .in("role", ["dispatcher", "admin", "owner"]);

      if (dispatchers && dispatchers.length > 0) {
        recipientEmails = dispatchers
          .map((d: any) => d.profiles?.email)
          .filter((email: string | null) => email);
      }
    }

    if (recipientEmails.length === 0) {
      console.log(`[send-match-notification] No recipients found for tenant ${tenant_id}`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "No recipients configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-match-notification] Sending to ${recipientEmails.length} recipients`);

    // Build email content
    const origin = parsed_data.origin_city && parsed_data.origin_state 
      ? `${parsed_data.origin_city}, ${parsed_data.origin_state}`
      : 'Unknown Origin';
    
    const destination = parsed_data.destination_city && parsed_data.destination_state
      ? `${parsed_data.destination_city}, ${parsed_data.destination_state}`
      : 'Unknown Destination';

    const subject = `🚛 New Load Match: ${origin} → ${destination}`;
    
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">🎯 New Load Match Found!</h1>
          <p style="margin: 8px 0 0 0; opacity: 0.9;">A load matching your hunt criteria has been found.</p>
        </div>
        
        <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                <strong style="color: #64748b;">Route</strong><br>
                <span style="font-size: 18px; color: #1e293b;">${origin} → ${destination}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                <strong style="color: #64748b;">Vehicle</strong><br>
                <span style="font-size: 16px; color: #1e293b;">${vehicleDisplay}</span>
                <span style="background: #dbeafe; color: #1d4ed8; padding: 2px 8px; border-radius: 4px; margin-left: 8px; font-size: 12px;">${distance_miles} mi from pickup</span>
              </td>
            </tr>
            ${parsed_data.rate ? `
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                <strong style="color: #64748b;">Rate</strong><br>
                <span style="font-size: 20px; color: #16a34a; font-weight: bold;">$${parsed_data.rate}</span>
              </td>
            </tr>
            ` : ''}
            ${parsed_data.broker_name ? `
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                <strong style="color: #64748b;">Broker</strong><br>
                <span style="font-size: 16px; color: #1e293b;">${parsed_data.broker_name}</span>
                ${parsed_data.order_number ? `<span style="color: #64748b; margin-left: 8px;">#${parsed_data.order_number}</span>` : ''}
              </td>
            </tr>
            ` : ''}
            ${parsed_data.vehicle_type ? `
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                <strong style="color: #64748b;">Equipment</strong><br>
                <span style="font-size: 16px; color: #1e293b;">${parsed_data.vehicle_type}</span>
                ${parsed_data.weight ? `<span style="color: #64748b; margin-left: 8px;">${parsed_data.weight} lbs</span>` : ''}
              </td>
            </tr>
            ` : ''}
            ${parsed_data.pickup_date || parsed_data.delivery_date ? `
            <tr>
              <td style="padding: 12px 0;">
                <strong style="color: #64748b;">Dates</strong><br>
                <span style="font-size: 16px; color: #1e293b;">
                  ${parsed_data.pickup_date ? `Pickup: ${parsed_data.pickup_date}` : ''}
                  ${parsed_data.pickup_date && parsed_data.delivery_date ? ' • ' : ''}
                  ${parsed_data.delivery_date ? `Delivery: ${parsed_data.delivery_date}` : ''}
                </span>
              </td>
            </tr>
            ` : ''}
          </table>
        </div>
        
        <div style="padding: 16px 20px; text-align: center; background: #1e293b; border-radius: 0 0 8px 8px;">
          <a href="https://drive-easy-apply.lovable.app/dashboard/load-hunter" 
             style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            View Match in Load Hunter
          </a>
        </div>
        
        <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 16px;">
          You're receiving this because match notifications are enabled for ${tenant.name}.
          <br>Manage settings in your Tenant Settings page.
        </p>
      </div>
    `;

    const textBody = `
New Load Match Found!

Route: ${origin} → ${destination}
Vehicle: ${vehicleDisplay} (${distance_miles} mi from pickup)
${parsed_data.rate ? `Rate: $${parsed_data.rate}` : ''}
${parsed_data.broker_name ? `Broker: ${parsed_data.broker_name}${parsed_data.order_number ? ` #${parsed_data.order_number}` : ''}` : ''}
${parsed_data.vehicle_type ? `Equipment: ${parsed_data.vehicle_type}${parsed_data.weight ? ` - ${parsed_data.weight} lbs` : ''}` : ''}
${parsed_data.pickup_date ? `Pickup: ${parsed_data.pickup_date}` : ''}
${parsed_data.delivery_date ? `Delivery: ${parsed_data.delivery_date}` : ''}

View in Load Hunter: https://drive-easy-apply.lovable.app/dashboard/load-hunter

--
${tenant.name} • Match Notifications
    `.trim();

    // Send via Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    // Use custom from email if configured, otherwise fallback to default
    // NOTE: The custom domain must be verified in Resend for this to work
    const fromEmail = tenant.match_notification_from_email || 'dispatch@blueforgetechnologies.org';
    const fromName = tenant.name + ' Load Hunter';
    
    console.log(`[send-match-notification] Sending from: ${fromName} <${fromEmail}>`);

    const emailPayload = {
      from: `${fromName} <${fromEmail}>`,
      to: recipientEmails,
      subject: subject,
      html: htmlBody,
      text: textBody,
    };

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("[send-match-notification] Resend API error:", result);
      
      // Track failed send
      await supabase.from("email_send_tracking").insert({
        email_type: "match_notification",
        recipient_email: recipientEmails.join(","),
        success: false,
        month_year: new Date().toISOString().slice(0, 7),
      });
      
      throw new Error(result.message || "Failed to send notification email");
    }

    console.log("[send-match-notification] Email sent successfully:", result);

    // Track successful send
    await supabase.from("email_send_tracking").insert({
      email_type: "match_notification",
      recipient_email: recipientEmails.join(","),
      success: true,
      month_year: new Date().toISOString().slice(0, 7),
    });

    return new Response(
      JSON.stringify({ success: true, message_id: result.id, recipients: recipientEmails.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[send-match-notification] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
