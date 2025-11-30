import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function parseLoadEmail(subject: string, bodyText: string): any {
  const parsed: any = {};

  // Extract vehicle type (first word)
  const vehicleTypeMatch = subject.match(/^([A-Z\s]+)\s+from/i);
  if (vehicleTypeMatch) {
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

  // Extract miles from subject
  const milesMatch = subject.match(/:\s*(\d+)\s*miles/i);
  if (milesMatch) {
    parsed.loaded_miles = parseInt(milesMatch[1]);
  }

  // Extract weight from subject
  const weightMatch = subject.match(/(\d+)\s*lbs/i);
  if (weightMatch) {
    parsed.weight = weightMatch[1];
  }

  // Extract customer/poster from subject
  const postedByMatch = subject.match(/Posted by\s+([^(]+)/i);
  if (postedByMatch) {
    parsed.customer = postedByMatch[1].trim();
  }

  // Extract Order Number from body text (e.g., "Bid on Order #206389")
  const orderNumberMatch = bodyText.match(/Bid on Order #(\d+)/i);
  if (orderNumberMatch) {
    parsed.order_number = orderNumberMatch[1];
  }

  // Extract from HTML structure using <strong> tags
  const piecesHtmlMatch = bodyText.match(/<strong>Pieces?:\s*<\/strong>\s*(\d+)/i);
  if (piecesHtmlMatch) {
    parsed.pieces = parseInt(piecesHtmlMatch[1]);
  }

  const dimsHtmlMatch = bodyText.match(/<strong>Dimensions?:\s*<\/strong>\s*(\d+)L?\s*[xX]\s*(\d+)W?\s*[xX]\s*(\d+)H?/i);
  if (dimsHtmlMatch) {
    parsed.dimensions = `${dimsHtmlMatch[1]}x${dimsHtmlMatch[2]}x${dimsHtmlMatch[3]}`;
  }

  const expiresHtmlMatch = bodyText.match(/<strong>Expires?:\s*<\/strong>\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*([A-Z]{2,3}T?)/i);
  if (expiresHtmlMatch) {
    const dateStr = expiresHtmlMatch[1];
    const timeStr = expiresHtmlMatch[2];
    const timezone = expiresHtmlMatch[3];
    parsed.expires_datetime = `${dateStr} ${timeStr} ${timezone}`;
    
    // Convert to ISO timestamp with proper timezone handling
    try {
      const dateParts = dateStr.split('/');
      const month = dateParts[0].padStart(2, '0');
      const day = dateParts[1].padStart(2, '0');
      let year = dateParts[2];
      
      if (year.length === 2) {
        year = '20' + year;
      }
      
      const timeParts = timeStr.split(':');
      const hour = timeParts[0].padStart(2, '0');
      const minute = timeParts[1].padStart(2, '0');
      
      // Map timezone abbreviations to UTC offsets
      const timezoneOffsets: { [key: string]: string } = {
        'EST': '-05:00',
        'EDT': '-04:00',
        'CST': '-06:00',
        'CDT': '-05:00',
        'MST': '-07:00',
        'MDT': '-06:00',
        'PST': '-08:00',
        'PDT': '-07:00',
        'CEN': '-06:00',
        'CENT': '-06:00',
      };
      
      const offset = timezoneOffsets[timezone.toUpperCase()] || '-05:00';
      const isoString = `${year}-${month}-${day}T${hour}:${minute}:00${offset}`;
      const expiresDate = new Date(isoString);
      
      if (!isNaN(expiresDate.getTime())) {
        parsed.expires_at = expiresDate.toISOString();
      }
    } catch (e) {
      console.error('Error parsing expires date:', e);
    }
  }

  // Clean HTML for text-based parsing
  let cleanText = bodyText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  // Extract pickup date and time from HTML structure
  // Look for the second <p> tag inside leginfo within pickup-box
  const pickupBoxMatch = bodyText.match(/<div class=['"]pickup-box['"]>[\s\S]*?<div class=['"]leginfo['"]>([\s\S]*?)<\/div>/i);
  if (pickupBoxMatch) {
    const leginfoContent = pickupBoxMatch[1];
    // Extract all <p> tags from leginfo
    const pTags = leginfoContent.match(/<p[^>]*>(.*?)<\/p>/gi);
    if (pTags && pTags.length >= 2) {
      // Second <p> tag should contain the date/time or instruction
      const secondP = pTags[1].replace(/<[^>]*>/g, '').trim();
      
      // First, try to match date + time together (e.g., "11/30/25 10:00 EST")
      const dateTimeMatch = secondP.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})/i);
      if (dateTimeMatch) {
        // Found both date and time - use them
        parsed.pickup_date = dateTimeMatch[1];
        parsed.pickup_time = dateTimeMatch[2];
      } else {
        // No date/time found, check if it's a valid instruction text (not a location fragment)
        // Valid instructions: ASAP, Deliver Direct, or similar short phrases
        // Exclude if it looks like a location (contains state abbreviations at end)
        const isLocationFragment = /\b[A-Z]{2}$/.test(secondP); // Ends with state code like "IN", "OH"
        if (!isLocationFragment && secondP.length > 0 && secondP.length < 50) {
          // It's likely a timing instruction like "ASAP" or "Deliver Direct"
          parsed.pickup_time = secondP;
        }
      }
    }
  }
  
  // Fallback to text-based extraction if nothing found
  if (!parsed.pickup_date && !parsed.pickup_time) {
    const pickupMatch = cleanText.match(/Pick.*?Up.*?(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})/i);
    if (pickupMatch) {
      parsed.pickup_date = pickupMatch[1];
      parsed.pickup_time = pickupMatch[2];
    }
  }

  // Extract delivery date and time from HTML structure
  // Look for the second <p> tag inside leginfo within delivery-box
  const deliveryBoxMatch = bodyText.match(/<div class=['"]delivery-box['"]>[\s\S]*?<div class=['"]leginfo['"]>([\s\S]*?)<\/div>/i);
  if (deliveryBoxMatch) {
    const leginfoContent = deliveryBoxMatch[1];
    // Extract all <p> tags from leginfo
    const pTags = leginfoContent.match(/<p[^>]*>(.*?)<\/p>/gi);
    if (pTags && pTags.length >= 2) {
      // Second <p> tag should contain the date/time or instruction
      const secondP = pTags[1].replace(/<[^>]*>/g, '').trim();
      
      // First, try to match date + time together (e.g., "11/30/25 10:00 EST")
      const dateTimeMatch = secondP.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})/i);
      if (dateTimeMatch) {
        // Found both date and time - use them
        parsed.delivery_date = dateTimeMatch[1];
        parsed.delivery_time = dateTimeMatch[2];
      } else {
        // No date/time found, check if it's a valid instruction text (not a location fragment)
        // Valid instructions: ASAP, Deliver Direct, or similar short phrases
        // Exclude if it looks like a location (contains state abbreviations at end)
        const isLocationFragment = /\b[A-Z]{2}$/.test(secondP); // Ends with state code like "IN", "OH"
        if (!isLocationFragment && secondP.length > 0 && secondP.length < 50) {
          // It's likely a timing instruction like "ASAP" or "Deliver Direct"
          parsed.delivery_time = secondP;
        }
      }
    }
  }
  
  // Fallback to text-based extraction if nothing found
  if (!parsed.delivery_date && !parsed.delivery_time) {
    const deliveryMatch = cleanText.match(/Delivery.*?(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})/i);
    if (deliveryMatch) {
      parsed.delivery_date = deliveryMatch[1];
      parsed.delivery_time = deliveryMatch[2];
    }
  }

  // Extract rate if available
  const rateMatch = cleanText.match(/(?:rate|pay).*?\$\s*([\d,]+(?:\.\d{2})?)/i);
  if (rateMatch) {
    parsed.rate = parseFloat(rateMatch[1].replace(/,/g, ''));
  }

  // Fallback: Extract pieces from plain text
  if (!parsed.pieces) {
    const piecesMatch = cleanText.match(/(\d+)\s*(?:pieces?|pcs?|pallets?|plts?|plt|skids?)/i);
    if (piecesMatch) {
      parsed.pieces = parseInt(piecesMatch[1]);
    }
  }

  // Fallback: Extract dimensions from plain text
  if (!parsed.dimensions) {
    const dimsSectionMatch = cleanText.match(/dimensions?[:\s-]*([0-9"' xX]+)/i);
    if (dimsSectionMatch) {
      const dimsInner = dimsSectionMatch[1];
      const dimsPattern = /(\d+)\s*[xX]\s*(\d+)\s*[xX]\s*(\d+)/;
      const innerMatch = dimsInner.match(dimsPattern);
      if (innerMatch) {
        parsed.dimensions = `${innerMatch[1]}x${innerMatch[2]}x${innerMatch[3]}`;
      }
    }
  }

  // Extract notes from HTML structure (notes-section class)
  const notesMatch = bodyText.match(/<div[^>]*class=['"]notes-section['"][^>]*>([\s\S]*?)<\/div>/i);
  if (notesMatch) {
    const notesContent = notesMatch[1];
    // Extract text from <p> tags, join with comma
    const notesPTags = notesContent.match(/<p[^>]*>(.*?)<\/p>/gi);
    if (notesPTags && notesPTags.length > 0) {
      const notesText = notesPTags
        .map(tag => tag.replace(/<[^>]*>/g, '').trim())
        .filter(text => text.length > 0)
        .join(', ');
      if (notesText) {
        parsed.notes = notesText;
      }
    }
  }

  // Extract broker information from HTML structure
  // Broker Name: <strong>Broker Name: </strong>VALUE
  const brokerNameMatch = bodyText.match(/<strong>Broker Name:\s*<\/strong>\s*([^<]+)/i);
  if (brokerNameMatch) {
    parsed.broker_name = brokerNameMatch[1].trim();
  }

  // Broker Company: <strong>Broker Company: </strong>VALUE
  const brokerCompanyMatch = bodyText.match(/<strong>Broker Company:\s*<\/strong>\s*([^<]+)/i);
  if (brokerCompanyMatch) {
    parsed.broker_company = brokerCompanyMatch[1].trim();
  }

  // Broker Phone: <strong>Broker Phone: </strong>VALUE
  const brokerPhoneMatch = bodyText.match(/<strong>Broker Phone:\s*<\/strong>\s*([^<]+)/i);
  if (brokerPhoneMatch) {
    parsed.broker_phone = brokerPhoneMatch[1].trim();
  }

  // Email can be in multiple places:
  // 1. <strong>Email: </strong>VALUE
  const brokerEmailMatch1 = bodyText.match(/<strong>Email:\s*<\/strong>\s*([^<]+)/i);
  if (brokerEmailMatch1) {
    parsed.broker_email = brokerEmailMatch1[1].trim();
  }
  
  // 2. In subject line after poster name in parentheses: (email@domain.com)
  if (!parsed.broker_email) {
    const emailInSubject = subject.match(/\(([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)\)/);
    if (emailInSubject) {
      parsed.broker_email = emailInSubject[1].trim();
    }
  }

  return parsed;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting reparse of all load emails...');

    // Fetch all emails
    const { data: emails, error: fetchError } = await supabase
      .from('load_emails')
      .select('id, subject, body_html');

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${emails?.length || 0} emails to reparse`);

    let successCount = 0;
    let errorCount = 0;

    for (const email of emails || []) {
      try {
        if (!email.body_html || !email.subject) {
          console.log(`Skipping email ${email.id} - missing body or subject`);
          continue;
        }

        // Reparse the email
        const parsedData = parseLoadEmail(email.subject, email.body_html);

        // Update the database
        const { error: updateError } = await supabase
          .from('load_emails')
          .update({
            parsed_data: parsedData,
            expires_at: parsedData.expires_at || null,
          })
          .eq('id', email.id);

        if (updateError) {
          console.error(`Error updating email ${email.id}:`, updateError);
          errorCount++;
        } else {
          successCount++;
        }
      } catch (error) {
        console.error(`Error processing email ${email.id}:`, error);
        errorCount++;
      }
    }

    console.log(`Reparse complete: ${successCount} success, ${errorCount} errors`);

    return new Response(
      JSON.stringify({ 
        message: 'Reparse complete', 
        success: successCount,
        errors: errorCount,
        total: emails?.length || 0
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error in reparse-load-emails:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
