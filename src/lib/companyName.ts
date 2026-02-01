/**
 * Extracts a clean company name from noisy broker/customer strings.
 * Designed to remove email-subject metadata like "Broker Posted: ...", dates,
 * contact info, and HTML artifacts.
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

  // Cut at "Broker Phone:" which marks metadata start in Sylectus emails
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

/**
 * Sanitizes load notes by stripping Sylectus/Solera boilerplate text.
 * Removes the "BID ON LOAD" instructions and copyright footer that appear in emails.
 */
export function cleanLoadNotes(input: string | null | undefined): string {
  if (!input) return "";

  let s = String(input);

  // Remove Sylectus boilerplate patterns
  const boilerplatePatterns: RegExp[] = [
    // "BID ON LOAD To bid on the load please click..."
    /BID\s+ON\s+LOAD\s*To\s+bid\s+on\s+the\s+load\s+please\s+click\s+the\s+button\s+above\.?/gi,
    // "To review your existing bids, go to the Bid Board page."
    /To\s+review\s+your\s+existing\s+bids,?\s+go\s+to\s+the\s+Bid\s+Board\s+page\.?/gi,
    // "The status of your bid will change throughout the life cycle of the post."
    /The\s+status\s+of\s+your\s+bid\s+will\s+change\s+throughout\s+the\s+life\s*cycle\s+of\s+the\s+post\.?/gi,
    // "© 2023 Solera, Inc.All Rights Reserved" (with possible whitespace issues)
    /©\s*\d{4}\s*Solera,?\s*Inc\.?\s*All\s*Rights\s*Reserved/gi,
    // HTML entity version: "&#169; 2023 Solera, Inc.All Rights Reserved"
    /&#169;\s*\d{4}\s*Solera,?\s*Inc\.?\s*All\s*Rights\s*Reserved/gi,
    // "|| www.solera.com Privacy Policy"
    /\|?\|?\s*www\.solera\.com\s*Privacy\s*Policy/gi,
    // Just "www.solera.com" standalone
    /www\.solera\.com/gi,
    // "Privacy Policy" at end
    /\s*Privacy\s*Policy\s*$/gi,
  ];

  for (const pattern of boilerplatePatterns) {
    s = s.replace(pattern, "").trim();
  }

  // Clean up multiple spaces and trailing/leading whitespace
  s = s.replace(/\s+/g, " ").trim();
  
  // Remove trailing pipes or separators
  s = s.replace(/[\|]+\s*$/g, "").trim();

  return s;
}
