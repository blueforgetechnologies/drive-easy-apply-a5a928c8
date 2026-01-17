/**
 * Full Circle TMS email parser - extracted from process-email-queue edge function.
 */

import type { ParsedEmailData } from './sylectus.js';

export function parseFullCircleTMSEmail(
  subject: string,
  bodyText: string,
  bodyHtml?: string
): ParsedEmailData {
  const data: ParsedEmailData = {};

  // Parse route from subject line
  const subjectRouteMatch = subject?.match(
    /from\s+([A-Za-z\s]+),\s*([A-Z]{2})\s+to\s+([A-Za-z\s]+),\s*([A-Z]{2})/i
  );
  if (subjectRouteMatch) {
    data.origin_city = subjectRouteMatch[1].trim();
    data.origin_state = subjectRouteMatch[2];
    data.destination_city = subjectRouteMatch[3].trim();
    data.destination_state = subjectRouteMatch[4];
  }

  // Vehicle type from subject
  const vehicleSubjectMatch = subject?.match(/^([A-Za-z\s]+)\s+from\s+/i);
  if (vehicleSubjectMatch) {
    data.vehicle_type = vehicleSubjectMatch[1].trim();
  }

  // Order numbers
  const orderMatch = bodyText?.match(/ORDER\s*NUMBER:?\s*(\d+)(?:\s+or\s+(\d+))?/i);
  if (orderMatch) {
    data.order_number = orderMatch[1];
    if (orderMatch[2]) {
      data.order_number_secondary = orderMatch[2];
    }
  }

  // Extract stops from HTML table - strict datetime format
  const htmlStopsPattern =
    /<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(Pick Up|Delivery)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([A-Z]{2})<\/td>\s*<td[^>]*>([A-Z0-9]*)<\/td>\s*<td[^>]*>(USA|CAN)<\/td>\s*<td[^>]*>(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?<\/td>/gi;

  // Also match flexible times like ASAP, Direct
  const htmlStopsFlexiblePattern =
    /<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(Pick Up|Delivery)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([A-Z]{2})<\/td>\s*<td[^>]*>([A-Z0-9]*)<\/td>\s*<td[^>]*>(USA|CAN)<\/td>\s*<td[^>]*>([^<]+)<\/td>/gi;

  const stops: Array<{
    type: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    datetime: string;
    tz: string;
    sequence: number;
  }> = [];

  let match;
  // First try strict datetime pattern
  while ((match = htmlStopsPattern.exec(bodyText)) !== null) {
    stops.push({
      sequence: parseInt(match[1]),
      type: match[2].toLowerCase(),
      city: match[3].trim(),
      state: match[4],
      zip: match[5] || '',
      country: match[6],
      datetime: match[7],
      tz: match[8] || 'EST',
    });
  }

  // If no strict matches, try flexible pattern that captures ASAP/Direct times
  if (stops.length === 0) {
    while ((match = htmlStopsFlexiblePattern.exec(bodyText)) !== null) {
      const datetimeRaw = match[7].trim();
      // Check if it's a valid datetime or instruction-style time
      const isStrictDatetime = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(datetimeRaw);
      const isInstructionTime = /^(ASAP|Direct|Deliver\s*Direct|Flexible|TBD|Open|Will\s*Call)/i.test(datetimeRaw);
      const hasDateWithInstruction = /^(\d{4}-\d{2}-\d{2})\s+(ASAP|Direct|Deliver\s*Direct|Flexible|TBD|Open|Will\s*Call)/i.test(datetimeRaw);
      
      if (isStrictDatetime || isInstructionTime || hasDateWithInstruction) {
        stops.push({
          sequence: parseInt(match[1]),
          type: match[2].toLowerCase(),
          city: match[3].trim(),
          state: match[4],
          zip: match[5] || '',
          country: match[6],
          datetime: datetimeRaw,
          tz: 'EST', // Default timezone for instruction times
        });
      }
    }
  }

  // Plain text fallback - strict pattern
  if (stops.length === 0) {
    const plainStopsPattern =
      /(\d+)\s+(Pick Up|Delivery)\s+([A-Za-z\s]+)\s+([A-Z]{2})\s+([A-Z0-9]*)\s+(USA|CAN)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(EST|CST|MST|PST|EDT|CDT|MDT|PDT)/gi;
    while ((match = plainStopsPattern.exec(bodyText)) !== null) {
      stops.push({
        sequence: parseInt(match[1]),
        type: match[2].toLowerCase(),
        city: match[3].trim(),
        state: match[4],
        zip: match[5] || '',
        country: match[6],
        datetime: match[7],
        tz: match[8],
      });
    }
  }

  // Plain text fallback - flexible pattern for ASAP/Direct
  if (stops.length === 0) {
    const plainStopsFlexiblePattern =
      /(\d+)\s+(Pick Up|Delivery)\s+([A-Za-z\s]+)\s+([A-Z]{2})\s+([A-Z0-9]*)\s+(USA|CAN)\s+((?:\d{4}-\d{2}-\d{2}\s+)?(?:ASAP|Direct|Deliver\s*Direct|Flexible|TBD|Open|Will\s*Call))/gi;
    while ((match = plainStopsFlexiblePattern.exec(bodyText)) !== null) {
      stops.push({
        sequence: parseInt(match[1]),
        type: match[2].toLowerCase(),
        city: match[3].trim(),
        state: match[4],
        zip: match[5] || '',
        country: match[6],
        datetime: match[7].trim(),
        tz: 'EST',
      });
    }
  }

  // Helper to parse datetime which may be strict format or instruction-style
  const parseDatetime = (datetime: string, tz: string): { date: string; time: string } => {
    const parts = datetime.split(' ');
    const isInstructionTime = /^(ASAP|Direct|Deliver\s*Direct|Flexible|TBD|Open|Will\s*Call)/i.test(datetime);
    
    if (isInstructionTime) {
      // Pure instruction time like "ASAP" - no date
      return { date: '', time: datetime.trim() };
    } else if (parts.length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
      // Has date, check if second part is time or instruction
      const hasNumericTime = /^\d{2}:\d{2}$/.test(parts[1]);
      if (hasNumericTime) {
        return { date: parts[0], time: parts[1] + ' ' + tz };
      } else {
        // Date + instruction time like "2026-01-18 ASAP"
        return { date: parts[0], time: parts.slice(1).join(' ') };
      }
    }
    // Default: try to split
    return { date: parts[0] || '', time: (parts[1] || '') + (tz ? ' ' + tz : '') };
  };

  // Set origin from first pickup
  const firstPickup = stops.find((s) => s.type === 'pick up');
  if (firstPickup) {
    data.origin_city = firstPickup.city;
    data.origin_state = firstPickup.state;
    data.origin_zip = firstPickup.zip;
    const parsed = parseDatetime(firstPickup.datetime, firstPickup.tz);
    data.pickup_date = parsed.date;
    data.pickup_time = parsed.time;
  }

  // Set destination from first delivery
  const firstDelivery = stops.find((s) => s.type === 'delivery');
  if (firstDelivery) {
    data.destination_city = firstDelivery.city;
    data.destination_state = firstDelivery.state;
    data.destination_zip = firstDelivery.zip;
    const parsed = parseDatetime(firstDelivery.datetime, firstDelivery.tz);
    data.delivery_date = parsed.date;
    data.delivery_time = parsed.time;
  }

  if (stops.length > 0) {
    data.stops = stops;
    data.stop_count = stops.length;
    data.has_multiple_stops = stops.length > 2;
  }

  // Helper to parse YYYY-MM-DD HH:MM TZ format (Full Circle style)
  const parseFCDateTime = (dateStr: string, timeStr: string, timezone: string): Date | null => {
    try {
      const tzOffsets: Record<string, number> = {
        EST: -5, EDT: -4, CST: -6, CDT: -5,
        MST: -7, MDT: -6, PST: -8, PDT: -7,
      };
      const offset = tzOffsets[timezone.toUpperCase()] || -5;

      const [year, month, day] = dateStr.split('-').map(Number);
      const [hours, minutes] = timeStr.split(':').map(Number);

      const result = new Date(Date.UTC(year, month - 1, day, hours - offset, minutes, 0));
      return isNaN(result.getTime()) ? null : result;
    } catch {
      return null;
    }
  };

  // Posted time - parse "Load posted:" or similar
  const postedMatch = bodyText?.match(
    /(?:Load posted|Posted)[:\s]*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(EST|CST|MST|PST|EDT|CDT|MDT|PDT)/i
  );
  if (postedMatch) {
    const dateStr = postedMatch[1];
    const timeStr = postedMatch[2];
    const timezone = postedMatch[3];

    data.posted_datetime = `${dateStr} ${timeStr} ${timezone}`;
    const postedDate = parseFCDateTime(dateStr, timeStr, timezone);
    if (postedDate) {
      data.posted_at = postedDate.toISOString();
    }
  }

  // Parse expiration
  const expiresMatch = bodyText?.match(
    /This posting expires:\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(EST|CST|MST|PST|EDT|CDT|MDT|PDT)(?:\s*\(UTC([+-]\d{4})\))?/i
  );
  if (expiresMatch) {
    const dateStr = expiresMatch[1];
    const timeStr = expiresMatch[2];
    const timezone = expiresMatch[3];

    data.expires_datetime = `${dateStr} ${timeStr} ${timezone}`;
    const expiresDate = parseFCDateTime(dateStr, timeStr, timezone);
    if (expiresDate) {
      data.expires_at = expiresDate.toISOString();
    }
  }

  // RULE 1: If expires_at is before posted_at, set expires_at = posted_at + 40 minutes
  if (data.posted_at && data.expires_at) {
    const postedTime = new Date(data.posted_at).getTime();
    const expiresTime = new Date(data.expires_at).getTime();
    if (expiresTime <= postedTime) {
      const correctedExpires = new Date(postedTime + 40 * 60 * 1000);
      data.expires_at = correctedExpires.toISOString();
      console.log(`[fullcircle] Corrected expires_at: was before posted_at, now posted_at + 40min`);
    }
  }
  
  // RULE 2: If expires_at is in the past (already expired on arrival), extend to now + 40 minutes
  // This handles loads that arrive after their expiration time
  if (data.expires_at) {
    const now = Date.now();
    const expiresTime = new Date(data.expires_at).getTime();
    if (expiresTime < now) {
      const correctedExpires = new Date(now + 40 * 60 * 1000);
      data.expires_at = correctedExpires.toISOString();
      console.log(`[fullcircle] Corrected expires_at: was already expired on arrival, now now() + 40min -> ${data.expires_at}`);
    }
  }

  // Pieces and weight
  const totalPiecesMatch = bodyText?.match(/Total Pieces:?\s*(\d+)/i);
  if (totalPiecesMatch) {
    data.pieces = parseInt(totalPiecesMatch[1]);
  }

  const totalWeightMatch = bodyText?.match(/Total Weight:?\s*([\d,]+)\s*(?:lbs?)?/i);
  if (totalWeightMatch) {
    data.weight = totalWeightMatch[1].replace(',', '');
  }

  // Distance
  const distanceMatch = bodyText?.match(/Distance:\s*([\d,]+)\s*mi/i);
  if (distanceMatch) {
    data.loaded_miles = parseInt(distanceMatch[1].replace(',', ''));
  }

  // Vehicle type
  const vehicleClassMatch = bodyText?.match(
    /(?:Requested Vehicle Class|We call this vehicle class):\s*([^\n]+)/i
  );
  if (vehicleClassMatch) {
    data.vehicle_type = vehicleClassMatch[1].trim().toUpperCase();
  }

  // Normalize vehicle names
  if (data.vehicle_type) {
    const vehicleNormMap: Record<string, string> = {
      'SPRINTER VAN': 'SPRINTER',
      'CARGO VAN': 'CARGO VAN',
      'SMALL STRAIGHT TRUCK': 'SMALL STRAIGHT',
      'LARGE STRAIGHT TRUCK': 'LARGE STRAIGHT',
    };
    for (const [key, value] of Object.entries(vehicleNormMap)) {
      if (data.vehicle_type.includes(key)) {
        data.vehicle_type = value;
        break;
      }
    }
  }

  // Dock level, hazmat, team
  const dockLevelMatch = bodyText?.match(/Dock Level.*?:\s*(Yes|No)/i);
  if (dockLevelMatch) {
    data.dock_level = dockLevelMatch[1].toLowerCase() === 'yes';
  }

  const hazmatMatch = bodyText?.match(/Hazardous\??\s*:\s*(Yes|No)/i);
  if (hazmatMatch) {
    data.hazmat = hazmatMatch[1].toLowerCase() === 'yes';
  }

  const teamMatch = bodyText?.match(/Driver TEAM.*?:\s*(Yes|No)/i);
  if (teamMatch) {
    data.team_required = teamMatch[1].toLowerCase() === 'yes';
  }

  // Broker company with MC#
  if (bodyHtml) {
    const htmlContactMatch = bodyHtml.match(
      /please contact:[\s\S]*?<br\s*\/?>\s*([^<\n(]+)\s*\(MC#\s*(\d+)\)/i
    );
    if (htmlContactMatch) {
      const companyName = htmlContactMatch[1]
        .trim()
        .replace(/&#x([0-9A-F]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      if (!data.broker_company) data.broker_company = companyName;
      data.mc_number = htmlContactMatch[2];
    }
  }

  // Fallback for MC#
  if (!data.mc_number && bodyText) {
    const brokerCompanyMCMatch = bodyText.match(
      /please contact:\s*\n?\s*([^\n(]+)\s*\(MC#\s*(\d+)\)/i
    );
    if (brokerCompanyMCMatch) {
      if (!data.broker_company) data.broker_company = brokerCompanyMCMatch[1].trim();
      data.mc_number = brokerCompanyMCMatch[2];
    }
  }

  if (!data.mc_number) {
    const mcFallback = (bodyHtml || bodyText)?.match(/\(MC#\s*(\d+)\)/i);
    if (mcFallback) {
      data.mc_number = mcFallback[1];
    }
  }

  // Broker address
  const addressMatch = bodyText?.match(
    /\(MC#\s*\d+\)\s*\n([^\n]+)\s*\n([^\n]+),\s*([A-Z]{2})\s+(\d{5})/i
  );
  if (addressMatch) {
    data.broker_address = addressMatch[1].trim();
    data.broker_city = addressMatch[2].trim();
    data.broker_state = addressMatch[3];
    data.broker_zip = addressMatch[4];
  }

  // Posted by
  const postedByMatch = bodyText?.match(/Load posted by:\s*([^\n]+)/i);
  if (postedByMatch) {
    data.broker_name = postedByMatch[1].trim();
  }

  const phoneMatch = bodyText?.match(/Phone:\s*\(?([\d\-\(\)\s]+)/i);
  if (phoneMatch) {
    data.broker_phone = phoneMatch[1].trim();
  }

  const faxMatch = bodyText?.match(/Fax:\s*\(?([\d\-\(\)\s]+)/i);
  if (faxMatch) {
    data.broker_fax = faxMatch[1].trim();
  }

  // Dimensions from table
  const dimensionsMatch = bodyText?.match(
    /Stops\s+Pieces\s+Weight[\s\S]*?1 to 2\s+(\d+)\s+([\d,]+)\s*lbs?\s+(\d+)\s*in\s+(\d+)\s*in\s+(\d+)\s*in\s+(Yes|No)/i
  );
  if (dimensionsMatch) {
    data.dimensions = `${dimensionsMatch[3]}x${dimensionsMatch[4]}x${dimensionsMatch[5]}`;
    data.stackable = dimensionsMatch[6].toLowerCase() === 'yes';
    if (!data.pieces) data.pieces = parseInt(dimensionsMatch[1]);
    if (!data.weight) data.weight = dimensionsMatch[2].replace(',', '');
  }

  // Fallback for states from subject
  if (!data.origin_state || !data.destination_state) {
    const subjectStatesMatch = subject?.match(/Load Available:\s*([A-Z]{2})\s*-\s*([A-Z]{2})/i);
    if (subjectStatesMatch) {
      if (!data.origin_state) data.origin_state = subjectStatesMatch[1].toUpperCase();
      if (!data.destination_state) data.destination_state = subjectStatesMatch[2].toUpperCase();
    }
  }

  // Extract notes from red text
  const searchContent = bodyHtml || bodyText || '';
  const extractedNotes: string[] = [];

  const processNoteText = (text: string): string | null => {
    let noteText = text.trim();
    noteText = noteText
      .replace(/&#x([0-9A-F]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec)))
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/<[^>]*>/g, '')
      .trim()
      .replace(/^Notes:\s*/i, '');

    if (
      !noteText ||
      noteText.toLowerCase().includes('submit your bid via') ||
      noteText.toLowerCase().includes('submitted bids must include') ||
      noteText.toLowerCase().includes('location of your vehicle') ||
      noteText.toLowerCase().includes('confirm all key requirements')
    ) {
      return null;
    }
    return noteText;
  };

  // Red <p> tags
  const redPPattern = /<p[^>]*style\s*=\s*["'][^"']*color\s*:\s*red[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi;
  let noteMatch;
  while ((noteMatch = redPPattern.exec(searchContent)) !== null) {
    const processed = processNoteText(noteMatch[1]);
    if (processed) extractedNotes.push(processed);
  }

  // Red <h4> tags
  const redH4Pattern = /<h4[^>]*style\s*=\s*["'][^"']*color\s*:\s*red[^"']*["'][^>]*>([\s\S]*?)<\/h4>/gi;
  while ((noteMatch = redH4Pattern.exec(searchContent)) !== null) {
    const processed = processNoteText(noteMatch[1]);
    if (processed) extractedNotes.push(processed);
  }

  if (extractedNotes.length > 0) {
    data.notes = extractedNotes.join(' | ');
  }

  // Plain text notes fallback
  if (!data.notes) {
    const fctmsNotesMatch = (bodyHtml || bodyText)?.match(
      /(?:Notes?|Special Instructions?):\s*([^\n<]+)/i
    );
    if (fctmsNotesMatch && fctmsNotesMatch[1].trim()) {
      data.notes = fctmsNotesMatch[1].trim();
    }
  }

  return data;
}
