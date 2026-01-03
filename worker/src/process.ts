import { supabase } from './supabase.js';
import { fetchMessage, extractBody, getHeader, type GmailMessage } from './gmail.js';
import { parseSylectusEmail, parseSubjectLine, type ParsedEmailData } from './parsers/sylectus.js';
import { parseFullCircleTMSEmail } from './parsers/fullcircle.js';
import { geocodeLocation, lookupCityFromZip } from './geocode.js';
import { matchLoadToHunts } from './matching.js';
import type { QueueItem } from './claim.js';

/**
 * Apply parser hints from database to fill missing fields.
 */
async function applyParserHints(
  emailSource: string,
  parsedData: ParsedEmailData,
  bodyText: string,
  bodyHtml: string
): Promise<ParsedEmailData> {
  try {
    const { data: hints } = await supabase
      .from('parser_hints')
      .select('field_name, pattern, context_before, context_after')
      .eq('email_source', emailSource)
      .eq('is_active', true);

    if (!hints?.length) return parsedData;

    const searchText = bodyHtml || bodyText || '';
    const result = { ...parsedData };

    for (const hint of hints) {
      const currentValue = (result as any)[hint.field_name];
      if (currentValue !== null && currentValue !== undefined && currentValue !== '') {
        continue;
      }

      try {
        const regex = new RegExp(hint.pattern, 'i');
        const match = searchText.match(regex);

        if (match) {
          const value = match[1] || match[0];
          (result as any)[hint.field_name] = value.trim();
          console.log(`[hints] Applied: ${hint.field_name}`);
        }
      } catch {
        if (hint.context_before || hint.context_after) {
          const contextPattern = `${hint.context_before || ''}([\\s\\S]*?)${hint.context_after || ''}`;
          try {
            const contextRegex = new RegExp(contextPattern, 'i');
            const contextMatch = searchText.match(contextRegex);
            if (contextMatch?.[1]) {
              (result as any)[hint.field_name] = contextMatch[1].trim();
            }
          } catch {}
        }
      }
    }

    return result;
  } catch (e) {
    console.error('[hints] Error:', e);
    return parsedData;
  }
}

/**
 * Detect email source type.
 */
function detectEmailSource(from: string, subject: string, bodyText: string, bodyHtml: string): string {
  const fromEmailLower = from.toLowerCase();
  const bodyCombinedLower = `${bodyText}\n${bodyHtml}`.toLowerCase();

  const isFullCircleTMS =
    fromEmailLower.includes('fullcircletms.com') ||
    fromEmailLower.includes('fctms.com') ||
    bodyCombinedLower.includes('app.fullcircletms.com') ||
    bodyCombinedLower.includes('bid yes to this load') ||
    /^Load Available:\s+[A-Z]{2}\s+-\s+[A-Z]{2}/i.test(subject);

  return isFullCircleTMS ? 'fullcircle' : 'sylectus';
}

/**
 * Process a single queue item.
 */
export async function processQueueItem(item: QueueItem): Promise<{ success: boolean; loadId?: string; error?: string }> {
  try {
    // Fetch email from Gmail
    const message = await fetchMessage(item.gmail_message_id);
    const { text: bodyText, html: bodyHtml } = extractBody(message);

    const subject = getHeader(message, 'Subject') || '';
    const from = getHeader(message, 'From') || '';
    const receivedAt = message.internalDate
      ? new Date(parseInt(message.internalDate, 10))
      : new Date();

    // Detect source
    const fromEmail = (from.match(/<([^>]+)>/)?.[1] || from).trim();
    const emailSource = detectEmailSource(fromEmail, subject, bodyText, bodyHtml);

    // Parse based on source
    let parsedData: ParsedEmailData;
    if (emailSource === 'fullcircle') {
      parsedData = parseFullCircleTMSEmail(subject, bodyText, bodyHtml);
      console.log(`[process] Full Circle TMS email detected`);
    } else {
      const subjectData = parseSubjectLine(subject);
      const bodyData = parseSylectusEmail(subject, bodyText);
      parsedData = { ...bodyData, ...subjectData };
    }

    // Apply parser hints
    parsedData = await applyParserHints(emailSource, parsedData, bodyText, bodyHtml);

    // Lookup city from zip if needed
    if (!parsedData.origin_city && parsedData.origin_zip) {
      const cityData = await lookupCityFromZip(parsedData.origin_zip, parsedData.origin_state);
      if (cityData) {
        parsedData.origin_city = cityData.city;
        parsedData.origin_state = cityData.state;
      }
    }

    if (!parsedData.destination_city && parsedData.destination_zip) {
      const cityData = await lookupCityFromZip(parsedData.destination_zip, parsedData.destination_state);
      if (cityData) {
        parsedData.destination_city = cityData.city;
        parsedData.destination_state = cityData.state;
      }
    }

    // Geocode origin
    let geocodeFailed = false;
    if (parsedData.origin_city && parsedData.origin_state) {
      const coords = await geocodeLocation(parsedData.origin_city, parsedData.origin_state);
      if (coords) {
        parsedData.pickup_coordinates = coords;
      } else {
        geocodeFailed = true;
      }
    }

    // Check for issues
    const isFullCircle = emailSource === 'fullcircle';
    const hasIssues =
      (!parsedData.broker_email && !isFullCircle) ||
      !parsedData.origin_city ||
      !parsedData.vehicle_type ||
      geocodeFailed;

    const issueNotes: string[] = [];
    if (!parsedData.broker_email && !isFullCircle) issueNotes.push('Missing broker email');
    if (!parsedData.origin_city) issueNotes.push('Missing origin location');
    if (!parsedData.vehicle_type) issueNotes.push('Missing vehicle type');
    if (geocodeFailed) issueNotes.push('Geocoding failed');

    // Extract sender info
    const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/);
    const fromName = fromMatch ? fromMatch[1].trim() : from;
    const fromEmailAddr = fromMatch ? fromMatch[2] : from;

    const tenantId = item.tenant_id;

    // Create/update customer for Full Circle TMS
    if (isFullCircle && parsedData.broker_company && tenantId) {
      const customerName = parsedData.broker_company;

      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id, mc_number')
        .ilike('name', customerName)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (existingCustomer) {
        if (!existingCustomer.mc_number && parsedData.mc_number) {
          await supabase
            .from('customers')
            .update({ mc_number: parsedData.mc_number })
            .eq('id', existingCustomer.id);
        }
      } else {
        await supabase.from('customers').insert({
          name: customerName,
          mc_number: parsedData.mc_number || null,
          contact_name: parsedData.broker_name || null,
          phone: parsedData.broker_phone || null,
          address: parsedData.broker_address || null,
          city: parsedData.broker_city || null,
          state: parsedData.broker_state || null,
          zip: parsedData.broker_zip || null,
          tenant_id: tenantId,
        });
      }
    }

    // Insert into load_emails
    const { data: insertedEmail, error: insertError } = await supabase
      .from('load_emails')
      .upsert(
        {
          email_id: item.gmail_message_id,
          thread_id: (await fetchMessage(item.gmail_message_id)).threadId,
          from_email: fromEmailAddr,
          from_name: fromName,
          subject,
          body_text: bodyText.substring(0, 50000),
          body_html: null,
          received_at: receivedAt.toISOString(),
          parsed_data: parsedData,
          expires_at: parsedData.expires_at || null,
          status: 'new',
          has_issues: hasIssues,
          issue_notes: issueNotes.length > 0 ? issueNotes.join('; ') : null,
          email_source: emailSource,
          tenant_id: tenantId,
          raw_payload_url: item.payload_url || null,
        },
        { onConflict: 'email_id' }
      )
      .select('id, load_id, received_at')
      .single();

    if (insertError) {
      throw insertError;
    }

    // Hunt matching
    if (insertedEmail && parsedData.pickup_coordinates && parsedData.vehicle_type && tenantId) {
      const matchCount = await matchLoadToHunts(
        insertedEmail.id,
        insertedEmail.load_id,
        parsedData,
        tenantId
      );
      if (matchCount > 0) {
        console.log(`[process] Created ${matchCount} matches for ${insertedEmail.load_id}`);
      }
    }

    return { success: true, loadId: insertedEmail?.load_id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[process] Error processing ${item.gmail_message_id}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}
