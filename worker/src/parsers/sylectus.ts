/**
 * Sylectus email parser - extracted from process-email-queue edge function.
 */

export interface ParsedEmailData {
  broker_email?: string;
  broker_name?: string;
  broker_company?: string;
  broker_phone?: string;
  broker_address?: string;
  broker_city?: string;
  broker_state?: string;
  broker_zip?: string;
  broker_fax?: string;
  order_number?: string;
  order_number_secondary?: string;
  origin_city?: string;
  origin_state?: string;
  origin_zip?: string;
  destination_city?: string;
  destination_state?: string;
  destination_zip?: string;
  pickup_date?: string;
  pickup_time?: string;
  delivery_date?: string;
  delivery_time?: string;
  posted_amount?: string;
  vehicle_type?: string;
  load_type?: string;
  pieces?: number;
  weight?: string;
  dimensions?: string;
  loaded_miles?: number;
  expires_datetime?: string;
  expires_at?: string;
  notes?: string;
  customer?: string;
  mc_number?: string;
  pickup_coordinates?: { lat: number; lng: number };
  stops?: any[];
  stop_count?: number;
  has_multiple_stops?: boolean;
  dock_level?: boolean;
  hazmat?: boolean;
  team_required?: boolean;
  stackable?: boolean;
}

export function extractBrokerEmail(subject: string, bodyText: string): string | null {
  const subjectMatch = subject?.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (subjectMatch) return subjectMatch[0];

  const bodyMatch = bodyText?.match(/[\w.-]+@[\w.-]+\.\w+/);
  return bodyMatch ? bodyMatch[0] : null;
}

export function parseSylectusEmail(subject: string, bodyText: string): ParsedEmailData {
  const data: ParsedEmailData = {};

  data.broker_email = extractBrokerEmail(subject, bodyText) || undefined;

  const bidOrderMatch = bodyText?.match(/Bid on Order #(\d+)/i);
  if (bidOrderMatch) {
    data.order_number = bidOrderMatch[1];
  } else {
    const orderPatterns = [
      /Order\s*#\s*(\d+)/i,
      /Order\s*Number\s*:?\s*(\d+)/i,
      /Order\s*:?\s*#?\s*(\d+)/i,
    ];
    for (const pattern of orderPatterns) {
      const match = bodyText?.match(pattern);
      if (match) {
        data.order_number = match[1];
        break;
      }
    }
  }

  // HTML format extractions
  const brokerNameHtmlMatch = bodyText?.match(/<strong>Broker\s*Name:\s*<\/strong>\s*([^<\n]+)/i);
  if (brokerNameHtmlMatch) {
    data.broker_name = brokerNameHtmlMatch[1].trim();
  }

  const brokerCompanyHtmlMatch = bodyText?.match(/<strong>Broker\s*Company:\s*<\/strong>\s*([^<\n]+)/i);
  if (brokerCompanyHtmlMatch) {
    data.broker_company = brokerCompanyHtmlMatch[1].trim();
  }

  const brokerPhoneHtmlMatch = bodyText?.match(/<strong>Broker\s*Phone:\s*<\/strong>\s*([^<\n]+)/i);
  if (brokerPhoneHtmlMatch) {
    data.broker_phone = brokerPhoneHtmlMatch[1].trim();
  }

  const patterns: Record<string, RegExp> = {
    broker_name: /(?:Contact|Rep|Agent)[\s:]+([A-Za-z\s]+?)(?:\n|$)/i,
    broker_company: /(?:Company|Broker)[\s:]+([^\n]+)/i,
    broker_phone: /(?:Phone|Tel|Ph)[\s:]+([0-9\s\-\(\)\.]+)/i,
    origin_city: /(?:Origin|Pick\s*up|From)[\s:]+([A-Za-z\s]+),?\s*([A-Z]{2})/i,
    destination_city: /(?:Destination|Deliver|To)[\s:]+([A-Za-z\s]+),?\s*([A-Z]{2})/i,
    posted_amount: /Posted\s*Amount[\s:]*\$?([\d,]+(?:\.\d{2})?)/i,
    vehicle_type: /(?:Equipment|Vehicle|Truck)[\s:]+([^\n]+)/i,
    load_type: /(?:Load\s*Type|Type)[\s:]+([^\n]+)/i,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    if ((data as any)[key]) continue;

    const match = bodyText?.match(pattern);
    if (match) {
      if (key === 'origin_city' && match[2]) {
        data.origin_city = match[1].trim();
        data.origin_state = match[2];
      } else if (key === 'destination_city' && match[2]) {
        data.destination_city = match[1].trim();
        data.destination_state = match[2];
      } else {
        (data as any)[key] = match[1].trim();
      }
    }
  }

  // Extract zip codes
  const originZipMatch = bodyText?.match(/Pick-Up[\s\S]*?(?:,\s*)?([A-Z]{2})\s+(\d{5})(?:\s|<|$)/i);
  if (originZipMatch) {
    data.origin_zip = originZipMatch[2];
    if (!data.origin_state) {
      data.origin_state = originZipMatch[1].toUpperCase();
    }
  }

  const destZipMatch = bodyText?.match(/Delivery[\s\S]*?(?:,\s*)?([A-Z]{2})\s+(\d{5})(?:\s|<|$)/i);
  if (destZipMatch) {
    data.destination_zip = destZipMatch[2];
    if (!data.destination_state) {
      data.destination_state = destZipMatch[1].toUpperCase();
    }
  }

  // Parse pickup datetime - try strict format first, then flexible
  const pickupSection = bodyText?.match(/Pick-Up[\s\S]*?(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/i);
  if (pickupSection) {
    data.pickup_date = pickupSection[1];
    data.pickup_time = pickupSection[2] + (pickupSection[3] ? ' ' + pickupSection[3] : '');
  } else {
    // Try to extract date and flexible time (ASAP, Direct, etc.)
    const pickupDateOnly = bodyText?.match(/Pick-Up[\s\S]*?(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (pickupDateOnly) {
      data.pickup_date = pickupDateOnly[1];
      // Look for instruction-style time after the date
      const afterDate = bodyText?.substring(bodyText.indexOf(pickupDateOnly[0]) + pickupDateOnly[0].length);
      const instructionMatch = afterDate?.match(/^\s*(ASAP|Direct|Deliver\s*Direct|Flexible|TBD|Open|Will\s*Call)/i);
      if (instructionMatch) {
        data.pickup_time = instructionMatch[1].trim();
      }
    }
  }

  // Parse delivery datetime - try strict format first, then flexible
  const deliverySection = bodyText?.match(/Delivery[\s\S]*?(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/i);
  if (deliverySection) {
    data.delivery_date = deliverySection[1];
    data.delivery_time = deliverySection[2] + (deliverySection[3] ? ' ' + deliverySection[3] : '');
  } else {
    // Try to extract date and flexible time (ASAP, Direct, etc.)
    const deliveryDateOnly = bodyText?.match(/Delivery[\s\S]*?(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (deliveryDateOnly) {
      data.delivery_date = deliveryDateOnly[1];
      // Look for instruction-style time after the date
      const afterDate = bodyText?.substring(bodyText.indexOf(deliveryDateOnly[0]) + deliveryDateOnly[0].length);
      const instructionMatch = afterDate?.match(/^\s*(ASAP|Direct|Deliver\s*Direct|Flexible|TBD|Open|Will\s*Call)/i);
      if (instructionMatch) {
        data.delivery_time = instructionMatch[1].trim();
      }
    }
  }

  // Vehicle type detection
  const vehicleTypes = ['CARGO VAN', 'SPRINTER', 'SMALL STRAIGHT', 'LARGE STRAIGHT', 'FLATBED', 'TRACTOR', 'VAN'];
  for (const vt of vehicleTypes) {
    if (bodyText?.toUpperCase().includes(vt)) {
      data.vehicle_type = vt;
      break;
    }
  }

  // Pieces
  const piecesHtmlMatch = bodyText?.match(/<strong>Pieces?:\s*<\/strong>\s*(\d+)/i);
  if (piecesHtmlMatch) {
    data.pieces = parseInt(piecesHtmlMatch[1]);
  } else {
    const piecesMatch = bodyText?.match(/Pieces?[:\s]+(\d+)/i);
    if (piecesMatch) {
      data.pieces = parseInt(piecesMatch[1]);
    }
  }

  // Weight
  const weightHtmlMatch = bodyText?.match(/<strong>Weight:\s*<\/strong>\s*([\d,]+)\s*(?:lbs?)?/i);
  if (weightHtmlMatch) {
    data.weight = weightHtmlMatch[1].replace(',', '');
  } else {
    const weightMatch = bodyText?.match(/(?:^|[\s,])(\d{1,6})\s*(?:lbs?|pounds?)(?:[\s,.]|$)/i);
    if (weightMatch) {
      data.weight = weightMatch[1];
    }
  }

  // Dimensions
  const dimensionsHtmlMatch = bodyText?.match(/<strong>Dimensions?:\s*<\/strong>\s*([^<\n]+)/i);
  if (dimensionsHtmlMatch) {
    data.dimensions = dimensionsHtmlMatch[1].trim();
  } else {
    const dimensionsPlainMatch = bodyText?.match(/Dimensions?:\s*(\d+[x×X]\d+(?:[x×X]\d+)?)/i);
    if (dimensionsPlainMatch) {
      data.dimensions = dimensionsPlainMatch[1].trim();
    }
  }

  // Expiration
  const expirationMatch = bodyText?.match(/Expires?[:\s]*(?:<[^>]*>)*\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*(AM|PM)?\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/i);
  if (expirationMatch) {
    const dateStr = expirationMatch[1];
    const timeStr = expirationMatch[2];
    const ampm = expirationMatch[3] || '';
    const timezone = expirationMatch[4] || 'EST';

    data.expires_datetime = `${dateStr} ${timeStr} ${ampm} ${timezone}`.trim();

    try {
      const dateParts = dateStr.split('/');
      let year = parseInt(dateParts[2]);
      if (year < 100) year += 2000;
      const month = parseInt(dateParts[0]) - 1;
      const day = parseInt(dateParts[1]);

      let hours = parseInt(timeStr.split(':')[0]);
      const minutes = parseInt(timeStr.split(':')[1]);

      if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
      if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;

      const tzOffsets: Record<string, number> = {
        EST: -5, EDT: -4, CST: -6, CDT: -5,
        MST: -7, MDT: -6, PST: -8, PDT: -7,
      };
      const offset = tzOffsets[timezone.toUpperCase()] || -5;

      const expiresDate = new Date(Date.UTC(year, month, day, hours - offset, minutes, 0));
      if (!isNaN(expiresDate.getTime())) {
        data.expires_at = expiresDate.toISOString();
      }
    } catch (e) {
      // Ignore parsing errors
    }
  }

  // Notes
  const notesMatch = bodyText?.match(/<div[^>]*class=['"]notes-section['"][^>]*>([\s\S]*?)<\/div>/i);
  if (notesMatch) {
    const notesContent = notesMatch[1];
    const notesPTags = notesContent.match(/<p[^>]*>(.*?)<\/p>/gi);
    if (notesPTags && notesPTags.length > 0) {
      const notesText = notesPTags
        .map((tag) => tag.replace(/<[^>]*>/g, '').trim())
        .filter((text) => text.length > 0)
        .join(', ');
      if (notesText) {
        data.notes = notesText;
      }
    }
  }

  if (!data.notes) {
    const notesPlainMatch = bodyText?.match(/Notes?:\s*([^\n<]+)/i);
    if (notesPlainMatch) {
      data.notes = notesPlainMatch[1].trim();
    }
  }

  return data;
}

export function parseSubjectLine(subject: string): ParsedEmailData {
  const data: ParsedEmailData = {};

  const subjectMatch = subject.match(
    /^([A-Z\s]+(?:VAN|STRAIGHT|SPRINTER|TRACTOR|FLATBED|REEFER)[A-Z\s]*)\s+(?:from|-)\s+([^,]+),\s*([A-Z]{2})\s+to\s+([^,]+),\s*([A-Z]{2})/i
  );
  if (subjectMatch) {
    data.vehicle_type = subjectMatch[1].trim().toUpperCase();
    data.origin_city = subjectMatch[2].trim();
    data.origin_state = subjectMatch[3].trim();
    data.destination_city = subjectMatch[4].trim();
    data.destination_state = subjectMatch[5].trim();
  }

  const brokerEmailMatch = subject.match(/\(([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\)/);
  if (brokerEmailMatch) {
    data.broker_email = brokerEmailMatch[1];
  }

  const milesMatch = subject.match(/:\s*(\d+)\s*miles/i);
  if (milesMatch) {
    data.loaded_miles = parseInt(milesMatch[1], 10);
  }

  const weightMatch = subject.match(/(\d+)\s*lbs/i);
  if (weightMatch) {
    data.weight = weightMatch[1];
  }

  const customerMatch = subject.match(/Posted by ([^(]+)\s*\(/);
  if (customerMatch) {
    const rawCustomer = customerMatch[1].trim();
    if (rawCustomer.startsWith('-')) {
      const afterDash = rawCustomer.substring(1).trim();
      if (afterDash) {
        data.customer = afterDash;
        data.broker_company = afterDash;
      }
    } else if (rawCustomer.includes(' - ')) {
      const parts = rawCustomer.split(' - ');
      data.customer = parts[0].trim() || parts[1]?.trim();
      data.broker_company = parts[1]?.trim() || parts[0].trim();
    } else if (rawCustomer) {
      data.customer = rawCustomer;
      data.broker_company = rawCustomer;
    }
  }

  return data;
}
