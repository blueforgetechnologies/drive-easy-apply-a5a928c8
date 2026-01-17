import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Parse datetime strings like "1/17/25 4:08 PM EST" or "01/17/2025 4:08 PM"
function parseDateTimeString(dateStr: string, timeStr: string, ampm: string, timezone?: string): Date | null {
  try {
    const dateParts = dateStr.split('/');
    if (dateParts.length !== 3) return null;
    
    let month = parseInt(dateParts[0], 10);
    let day = parseInt(dateParts[1], 10);
    let year = parseInt(dateParts[2], 10);
    
    // Handle 2-digit years
    if (year < 100) {
      year = year > 50 ? 1900 + year : 2000 + year;
    }
    
    // Parse time
    const timeParts = timeStr.split(':');
    if (timeParts.length !== 2) return null;
    
    let hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);
    
    // Convert to 24-hour format
    const isPM = ampm?.toUpperCase() === 'PM';
    if (isPM && hours !== 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
    
    // Create date in UTC (we'll approximate timezone offsets)
    const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
    
    // Apply timezone offset (approximate)
    const tzOffsets: Record<string, number> = {
      'EST': 5, 'EDT': 4,
      'CST': 6, 'CDT': 5,
      'MST': 7, 'MDT': 6,
      'PST': 8, 'PDT': 7,
    };
    const tz = timezone?.toUpperCase() || 'EST';
    const offset = tzOffsets[tz] || 5;
    date.setUTCHours(date.getUTCHours() + offset);
    
    return date;
  } catch {
    return null;
  }
}

// Extract posted_at and expires_at from body_text
function extractPostedExpires(bodyText: string): { posted_at: string | null; expires_at: string | null } {
  let posted_at: string | null = null;
  let expires_at: string | null = null;
  
  // Pattern for Posted: 1/17/25 4:08 PM EST
  const postedMatch = bodyText?.match(/Posted[:\s]*(?:<[^>]*>)*\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*(AM|PM)?\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/i);
  if (postedMatch) {
    const date = parseDateTimeString(postedMatch[1], postedMatch[2], postedMatch[3] || 'AM', postedMatch[4]);
    if (date) {
      posted_at = date.toISOString();
    }
  }
  
  // Pattern for Expires: 1/17/25 4:48 PM EST
  const expiresMatch = bodyText?.match(/Expires?[:\s]*(?:<[^>]*>)*\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*(AM|PM)?\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/i);
  if (expiresMatch) {
    const date = parseDateTimeString(expiresMatch[1], expiresMatch[2], expiresMatch[3] || 'AM', expiresMatch[4]);
    if (date) {
      expires_at = date.toISOString();
    }
  }
  
  // Full Circle TMS patterns
  // "Load posted: Jan 17, 2026 at 10:30 AM CST"
  const fcPostedMatch = bodyText?.match(/Load posted[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s+(?:at\s+)?(\d{1,2}:\d{2})\s*(AM|PM)?\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/i);
  if (!posted_at && fcPostedMatch) {
    try {
      const dateStr = fcPostedMatch[1];
      const timeStr = fcPostedMatch[2];
      const ampm = fcPostedMatch[3] || 'AM';
      const tz = fcPostedMatch[4] || 'CST';
      
      const parsedDate = new Date(dateStr);
      if (!isNaN(parsedDate.getTime())) {
        const timeParts = timeStr.split(':');
        let hours = parseInt(timeParts[0], 10);
        const minutes = parseInt(timeParts[1], 10);
        if (ampm.toUpperCase() === 'PM' && hours !== 12) hours += 12;
        if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
        parsedDate.setHours(hours, minutes, 0, 0);
        
        const tzOffsets: Record<string, number> = {
          'EST': 5, 'EDT': 4, 'CST': 6, 'CDT': 5,
          'MST': 7, 'MDT': 6, 'PST': 8, 'PDT': 7,
        };
        const offset = tzOffsets[tz.toUpperCase()] || 6;
        parsedDate.setHours(parsedDate.getHours() + offset);
        
        posted_at = parsedDate.toISOString();
      }
    } catch {
      // ignore parse errors
    }
  }
  
  // "This posting expires: Jan 17, 2026 at 11:10 AM CST"
  const fcExpiresMatch = bodyText?.match(/(?:This )?posting expires[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s+(?:at\s+)?(\d{1,2}:\d{2})\s*(AM|PM)?\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/i);
  if (!expires_at && fcExpiresMatch) {
    try {
      const dateStr = fcExpiresMatch[1];
      const timeStr = fcExpiresMatch[2];
      const ampm = fcExpiresMatch[3] || 'AM';
      const tz = fcExpiresMatch[4] || 'CST';
      
      const parsedDate = new Date(dateStr);
      if (!isNaN(parsedDate.getTime())) {
        const timeParts = timeStr.split(':');
        let hours = parseInt(timeParts[0], 10);
        const minutes = parseInt(timeParts[1], 10);
        if (ampm.toUpperCase() === 'PM' && hours !== 12) hours += 12;
        if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
        parsedDate.setHours(hours, minutes, 0, 0);
        
        const tzOffsets: Record<string, number> = {
          'EST': 5, 'EDT': 4, 'CST': 6, 'CDT': 5,
          'MST': 7, 'MDT': 6, 'PST': 8, 'PDT': 7,
        };
        const offset = tzOffsets[tz.toUpperCase()] || 6;
        parsedDate.setHours(parsedDate.getHours() + offset);
        
        expires_at = parsedDate.toISOString();
      }
    } catch {
      // ignore parse errors
    }
  }
  
  // Apply the rule: if expires_at <= posted_at, set expires_at = posted_at + 40 minutes
  if (posted_at && expires_at) {
    const postedTime = new Date(posted_at).getTime();
    const expiresTime = new Date(expires_at).getTime();
    if (expiresTime <= postedTime) {
      const correctedExpires = new Date(postedTime + 40 * 60 * 1000);
      expires_at = correctedExpires.toISOString();
      console.log(`[backfill] Corrected expires_at: was before posted_at, now posted_at + 40min`);
    }
  }
  
  return { posted_at, expires_at };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request
    let tenantId: string | null = null;
    let limit = 500;
    let onlyMissing = true;

    try {
      const body = await req.json();
      tenantId = body.tenant_id || null;
      limit = Math.min(Math.max(body.limit || 500, 1), 2000);
      onlyMissing = body.only_missing !== false;
    } catch {
      // ignore
    }

    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenant_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify tenant access
    const { data: membership } = await supabase
      .from('tenant_users')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userData.user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: 'Not allowed for this tenant' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[backfill-posted-expires] Starting: tenant=${tenantId}, limit=${limit}, only_missing=${onlyMissing}`);

    // Query load_emails that need backfill
    let query = supabase
      .from('load_emails')
      .select('id, body_text, posted_at, expires_at')
      .eq('tenant_id', tenantId)
      .not('body_text', 'is', null)
      .order('received_at', { ascending: false })
      .limit(limit);

    if (onlyMissing) {
      query = query.is('posted_at', null);
    }

    const { data: emails, error: fetchError } = await query;

    if (fetchError) {
      console.error('[backfill-posted-expires] Error fetching emails:', fetchError);
      throw fetchError;
    }

    if (!emails || emails.length === 0) {
      console.log('[backfill-posted-expires] No emails need backfill');
      return new Response(JSON.stringify({
        message: 'No emails need backfill',
        updated: 0,
        skipped: 0,
        errors: 0,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[backfill-posted-expires] Found ${emails.length} emails to process`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const email of emails) {
      try {
        const bodyText = email.body_text || '';
        const { posted_at, expires_at } = extractPostedExpires(bodyText);

        if (!posted_at && !expires_at) {
          skipped++;
          continue;
        }

        const updateData: Record<string, any> = {};
        if (posted_at && !email.posted_at) {
          updateData.posted_at = posted_at;
        }
        if (expires_at && !email.expires_at) {
          updateData.expires_at = expires_at;
        }

        if (Object.keys(updateData).length === 0) {
          skipped++;
          continue;
        }

        const { error: updateError } = await supabase
          .from('load_emails')
          .update(updateData)
          .eq('id', email.id);

        if (updateError) {
          console.error(`[backfill-posted-expires] Error updating ${email.id}:`, updateError.message);
          errors++;
        } else {
          updated++;
        }
      } catch (e) {
        console.error(`[backfill-posted-expires] Error processing ${email.id}:`, e);
        errors++;
      }
    }

    console.log(`[backfill-posted-expires] Complete: updated=${updated}, skipped=${skipped}, errors=${errors}`);

    return new Response(JSON.stringify({
      message: 'Backfill complete',
      updated,
      skipped,
      errors,
      total: emails.length,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[backfill-posted-expires] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
