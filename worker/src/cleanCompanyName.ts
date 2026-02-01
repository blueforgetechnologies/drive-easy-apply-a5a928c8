/**
 * Extracts a clean company name from noisy broker/customer strings.
 * Designed to remove email-subject metadata like "Broker Posted: ...", dates,
 * contact info, and HTML artifacts.
 * 
 * SYNC NOTE: This is a copy of src/lib/companyName.ts for the VPS worker.
 * Keep these two files in sync when making changes.
 */
export function cleanCompanyName(input: string | null | undefined): string {
  if (!input) return "";

  let s = String(input);

  // Decode common HTML entities
  s = s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ");

  // Strip HTML tags and whitespace artifacts
  s = s.replace(/<[^>]*>/g, " ");
  s = s.replace(/\u00a0/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  // Cut at "Broker Phone:" or "Broker Posted:" which marks metadata start
  s = s.replace(/\s+Broker\s+Phone\s*:\s*[\s\S]*/i, "").trim();
  
  // Cut off common metadata blocks that get appended to broker names
  const cutoffs: RegExp[] = [
    /\s+Broker\s+Posted\b[\s\S]*/i,
    /\s+Posted\b[\s\S]*/i,
    /\s+Expires\b[\s\S]*/i,
    /\s+Dock\b[\s\S]*/i,
    /\s+Hazmat\b[\s\S]*/i,
    /\s+Posted\s+Amount\b[\s\S]*/i,
    /\s+Load\s+Type\b[\s\S]*/i,
    /\s+Vehicle\s+required\b[\s\S]*/i,
    /\s+Pieces\b[\s\S]*/i,
    /\s+Weight\b[\s\S]*/i,
    /\s+Dimensions\b[\s\S]*/i,
    /\s+Notes\b[\s\S]*/i,
    /\s+BID\s+ON\s+LOAD\b[\s\S]*/i,
  ];
  for (const re of cutoffs) {
    s = s.replace(re, "").trim();
  }

  // Remove embedded contact fields if present
  s = s
    .replace(/\b(phone|fax|email)\b\s*[:#-]?\s*[^|,]+/gi, " ")
    .replace(/\b(mc|dot)\b\s*[:#-]?\s*\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Clean trailing separators
  s = s.replace(/[|\-–—:]+\s*$/g, "").trim();

  return s;
}
