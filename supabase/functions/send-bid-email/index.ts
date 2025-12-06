import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

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
  origin_state: string;
  dest_state: string;
  vehicle_size: string;
  vehicle_type: string;
  equipment_details: string;
  truck_dimensions: string;
  door_dimensions: string;
  truck_features: string;
  dispatcher_name: string;
  company_name: string;
  company_address: string;
  company_phone: string;
  reference_id: string;
  selected_templates?: string[];
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: BidEmailRequest = await req.json();
    
    // Normalize email domain to lowercase for Resend domain verification compatibility
    const normalizedFromEmail = data.from_email?.toLowerCase() || 'dispatch@nexustechsolution.com';
    
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

    // Build the HTML email body
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <p style="background-color: #FFFF00; display: inline-block; padding: 4px 8px; font-weight: bold;">Rate: $ ${data.bid_amount}</p><br/>
        <p style="background-color: #FFFF00; display: inline-block; padding: 4px 8px; font-weight: bold;">MC#: ${data.mc_number}</p><br/>
        <p style="background-color: #FFFF00; display: inline-block; padding: 4px 8px; font-weight: bold;">USDOT#: ${data.dot_number}</p>
        
        <p style="margin-top: 20px;">Hello,</p>
        
        <p>I have a ${data.vehicle_size}${data.vehicle_type}.</p>
        
        <p>Please let me know if I can help on this load:</p>
        
        <p>Order Number: ${data.order_number} [${data.origin_state} to ${data.dest_state}]</p>
        
        <div style="margin-top: 20px;">
          <p><strong>Truck Carries:</strong> ${data.equipment_details}</p>
          <p><strong>Truck Size:</strong> ${data.truck_dimensions}</p>
          <p><strong>Door Type and Size:</strong> ${data.door_dimensions}</p>
          <p><strong>Truck Features:</strong> ${data.truck_features}</p>
        </div>
        
        ${selectedTemplatesHtml}
        
        <div style="margin-top: 30px; border-top: 1px solid #ccc; padding-top: 20px;">
          <p style="font-weight: bold; margin: 0;">${data.dispatcher_name}</p>
          <p style="margin: 4px 0;">Dispatch</p>
          <p style="margin: 4px 0;">${data.company_name}</p>
          <p style="font-weight: bold; margin: 4px 0;">MC#: ${data.mc_number} USDOT#: ${data.dot_number}</p>
          <p style="margin: 4px 0;">${data.company_address}</p>
          <p style="margin: 4px 0;">Cell: <strong>${data.company_phone}</strong></p>
          <p style="margin: 4px 0;">Email: ${data.from_email}</p>
        </div>
        
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">Reference #: ${data.reference_id}</p>
        </div>
      </div>
    `;

    // Build plain text version
    const textBody = `
Rate: $ ${data.bid_amount}
MC#: ${data.mc_number}
USDOT#: ${data.dot_number}

Hello,

I have a ${data.vehicle_size}${data.vehicle_type}.

Please let me know if I can help on this load:

Order Number: ${data.order_number} [${data.origin_state} to ${data.dest_state}]

Truck Carries: ${data.equipment_details}
Truck Size: ${data.truck_dimensions}
Door Type and Size: ${data.door_dimensions}
Truck Features: ${data.truck_features}
${selectedTemplatesText}
---
${data.dispatcher_name}
Dispatch
${data.company_name}
MC#: ${data.mc_number} USDOT#: ${data.dot_number}
${data.company_address}
Cell: ${data.company_phone}
Email: ${data.from_email}

Reference #: ${data.reference_id}
    `.trim();

    // Build Resend API request
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const emailPayload: any = {
      from: `${data.company_name} <${normalizedFromEmail}>`,
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

    if (!response.ok) {
      console.error("Resend API error:", result);
      throw new Error(result.message || "Failed to send email");
    }

    console.log("Email sent successfully:", result);

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
