// Helper utilities for LoadHunter
// Extracted from LoadHunterTab.tsx for reuse

/**
 * Normalize date format from "2025-12-19" or "2025-12-19 08:00 CST" to "12/19/25"
 */
export const normalizeDate = (dateStr: string | undefined): string => {
  if (!dateStr) return '';
  // Match ISO-like format: 2025-12-19 or 2025-12-19 08:00 CST
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${month}/${day}/${year.slice(2)}`;
  }
  return dateStr;
};

/**
 * Normalize time format - strip timezone suffix like " CST"
 */
export const normalizeTime = (timeStr: string | undefined): string => {
  if (!timeStr) return '';
  // Remove timezone suffix like " CST", " EST", " PST"
  return timeStr.replace(/\s+[A-Z]{2,4}$/i, '');
};

/**
 * Format a date to a human-readable date/time string
 */
export const formatDateTime = (date: Date): string => {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

/**
 * Calculate relative time ago string
 */
export const formatTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h ago`;
  if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m ago`;
  return `${diffMins}m ${diffSecs % 60}s ago`;
};

/**
 * Calculate time until expiration
 */
export const formatExpiresIn = (expiresAt: string | Date | undefined): string => {
  if (!expiresAt) return '—';
  
  const now = new Date();
  const expiresDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  
  if (isNaN(expiresDate.getTime())) return '—';
  
  const timeUntilExpiration = expiresDate.getTime() - now.getTime();
  const minsUntilExpiration = Math.floor(timeUntilExpiration / 60000);

  if (minsUntilExpiration > 60) {
    const hours = Math.floor(minsUntilExpiration / 60);
    const mins = minsUntilExpiration % 60;
    return `${hours}h ${mins}m`;
  } else if (minsUntilExpiration > 0) {
    return `${minsUntilExpiration}m`;
  } else {
    // Show negative time for expired loads
    const expiredMins = Math.abs(minsUntilExpiration);
    if (expiredMins > 60) {
      const hours = Math.floor(expiredMins / 60);
      const mins = expiredMins % 60;
      return `-${hours}h ${mins}m`;
    } else {
      return `-${expiredMins}m`;
    }
  }
};

/**
 * Build pickup display string from parsed data
 */
export const buildPickupDisplay = (data: any, cleanBody: string): string => {
  const normPickupDate = normalizeDate(data?.pickup_date);
  const normPickupTime = normalizeTime(data?.pickup_time);
  
  if (normPickupDate && normPickupTime) {
    return `${normPickupDate} ${normPickupTime}`;
  } else if (normPickupDate) {
    return normPickupDate;
  } else if (normPickupTime) {
    return normPickupTime;
  }
  
  // Fallback: extract timing after location in raw body
  const pickupMatch = cleanBody.match(/Pick[-\s]*Up\s+[A-Za-z\s,]+\d{5}\s+(ASAP|[A-Za-z\s]+?)(?:\s+Delivery|$)/i);
  if (pickupMatch && pickupMatch[1]) {
    const result = pickupMatch[1].trim();
    if (!/box\s*>\s*p/i.test(result)) {
      return result;
    }
  }
  
  return '—';
};

/**
 * Build delivery display string from parsed data
 */
export const buildDeliveryDisplay = (data: any, cleanBody: string): string => {
  const normDeliveryDate = normalizeDate(data?.delivery_date);
  const normDeliveryTime = normalizeTime(data?.delivery_time);
  
  if (normDeliveryDate && normDeliveryTime) {
    return `${normDeliveryDate} ${normDeliveryTime}`;
  } else if (normDeliveryDate) {
    return normDeliveryDate;
  } else if (normDeliveryTime) {
    return normDeliveryTime;
  }
  
  // Fallback: extract timing after location in raw body
  const deliveryMatch = cleanBody.match(/Delivery\s+[A-Za-z\s,]+\d{5}\s+(Deliver\s+Direct|[A-Za-z\s]+?)(?:\s+Rate|\s+Contact|$)/i);
  if (deliveryMatch && deliveryMatch[1]) {
    const result = deliveryMatch[1].trim();
    if (!/box\s*>\s*p/i.test(result)) {
      return result;
    }
  }
  
  return '—';
};

/**
 * Clean HTML tags from text
 */
export const stripHtmlTags = (text: string): string => {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

/**
 * Truncate text with ellipsis
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
};

/**
 * Group matches by load email for consolidated display
 */
export const groupMatchesByLoadEmail = <T extends { load_email_id: string; vehicle_id: string; distance_miles?: number | null }>(
  matches: T[],
  myVehicleIds: string[],
  groupingEnabled: boolean
): (T & { _allMatches: T[]; _matchCount: number; _isGrouped: boolean })[] => {
  if (matches.length === 0) return [];
  
  // If grouping is disabled, return matches as-is (each match = own row)
  if (!groupingEnabled) {
    return matches.map(match => ({
      ...match,
      _allMatches: [match],
      _matchCount: 1,
      _isGrouped: false,
    }));
  }
  
  const grouped = new Map<string, T[]>();
  matches.forEach(match => {
    const key = match.load_email_id;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(match);
  });
  
  // Convert grouped map to array of "primary" matches with count metadata
  const result: (T & { _allMatches: T[]; _matchCount: number; _isGrouped: boolean })[] = [];
  
  grouped.forEach((matchesForLoad) => {
    // Sort matches: prioritize user's vehicles first, then by distance
    const sortedMatches = [...matchesForLoad].sort((a, b) => {
      const aIsMyVehicle = myVehicleIds.includes(a.vehicle_id) ? 0 : 1;
      const bIsMyVehicle = myVehicleIds.includes(b.vehicle_id) ? 0 : 1;
      if (aIsMyVehicle !== bIsMyVehicle) return aIsMyVehicle - bIsMyVehicle;
      return (a.distance_miles || 999) - (b.distance_miles || 999);
    });
    
    // Primary match is the first (user's vehicle or closest)
    const primaryMatch = sortedMatches[0];
    result.push({
      ...primaryMatch,
      _allMatches: sortedMatches,
      _matchCount: sortedMatches.length,
      _isGrouped: sortedMatches.length > 1,
    });
  });
  
  return result;
};
