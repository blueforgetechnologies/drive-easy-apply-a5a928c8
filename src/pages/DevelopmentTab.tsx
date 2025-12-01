import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Code, AlertCircle, Filter, Clock, CheckCircle, Database, Zap, Bell } from "lucide-react";

export default function DevelopmentTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Development Documentation</h2>
        <p className="text-muted-foreground">Comprehensive documentation of Load Hunter logic and filtering rules</p>
      </div>

      <Accordion type="multiple" className="w-full space-y-4">
        {/* System Overview */}
        <AccordionItem value="overview" className="border rounded-lg px-6">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              <span className="text-lg font-semibold">Load Hunter System Overview</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <CardContent className="space-y-4 pt-4">
              <div>
                <h4 className="font-semibold mb-2">Purpose</h4>
                <p className="text-sm text-muted-foreground">
                  Load Hunter monitors incoming load emails from Gmail (P.D@talbilogistics.com), automatically parses load details,
                  and matches them against active hunt plans to find suitable loads for available trucks.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Key Components</h4>
                <ul className="text-sm space-y-2 list-disc list-inside text-muted-foreground">
                  <li><strong>Email Polling:</strong> Cron job runs every 1 minute via pg_cron calling fetch-gmail-loads edge function</li>
                  <li><strong>Email Storage:</strong> Parsed load data stored in load_emails table</li>
                  <li><strong>Hunt Plans:</strong> User-defined search criteria (location, radius, vehicle type) stored in hunt_plans table</li>
                  <li><strong>Matching Engine:</strong> Automatically matches incoming loads against active hunt plans</li>
                  <li><strong>Match Storage:</strong> Successful matches stored in load_hunt_matches table</li>
                </ul>
              </div>
            </CardContent>
          </AccordionContent>
        </AccordionItem>

        {/* Load Email Lifecycle */}
        <AccordionItem value="lifecycle" className="border rounded-lg px-6">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <span className="text-lg font-semibold">Load Email Lifecycle & Status Flow</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <CardContent className="space-y-4 pt-4">
              <div className="grid gap-4">
                <div className="border-l-4 border-green-500 pl-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-green-500">NEW</Badge>
                    <span className="text-sm font-semibold">Initial State</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Load arrives via email and is parsed. Status = "new". Appears in Unreviewed section if it matches an active hunt plan.
                  </p>
                </div>

                <div className="border-l-4 border-yellow-500 pl-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-yellow-500">WAITLIST</Badge>
                    <span className="text-sm font-semibold">User Marked as Waitlist</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    User clicks "Move to Waitlist". Status = "waitlist". Removed from Unreviewed, appears in Waitlist section.
                  </p>
                </div>

                <div className="border-l-4 border-gray-500 pl-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary">SKIPPED</Badge>
                    <span className="text-sm font-semibold">User Skipped</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    User clicks "Skip". Status = "skipped". Removed from Unreviewed, appears in Skipped section.
                  </p>
                </div>

                <div className="border-l-4 border-red-500 pl-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="destructive">MISSED</Badge>
                    <span className="text-sm font-semibold">Auto-Marked After 15 Minutes</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    After 15 minutes without review/skip/waitlist: marked_missed_at timestamp set. Still appears in Unreviewed until 30 minutes.
                    After 30 minutes: moved to Missed section exclusively. Logged to missed_loads_history table.
                  </p>
                </div>

                <div className="border-l-4 border-purple-500 pl-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-purple-500">EXPIRED</Badge>
                    <span className="text-sm font-semibold">Load Expiration</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    If load has expires_at field: removed from Unreviewed when expires_at timestamp is reached.
                    If no expires_at: automatically removed from Unreviewed after 30 minutes from received_at.
                  </p>
                </div>
              </div>
            </CardContent>
          </AccordionContent>
        </AccordionItem>

        {/* Filter Section Logic */}
        <AccordionItem value="filters" className="border rounded-lg px-6">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              <span className="text-lg font-semibold">Filter Section Logic</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <CardContent className="space-y-6 pt-4">
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge>Unreviewed</Badge>
                </h4>
                <div className="bg-amber-100 dark:bg-amber-950 border-l-4 border-amber-500 p-4 rounded-lg mb-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold text-amber-900 dark:text-amber-100">Development Mode Active</p>
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        Time-based filtering (30-minute window and expiry checks) has been temporarily disabled for development. 
                        All matches with status="new" are currently displayed regardless of received time or expiry status. 
                        This allows testing and debugging of all hunt matches including older loads.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p><strong>Data Source:</strong> load_hunt_matches table (NOT load_emails directly)</p>
                  <p><strong>Display Logic:</strong> Shows one row per match (one load can appear multiple times if it matches multiple hunt plans)</p>
                  <p><strong>Filtering Criteria (PRODUCTION):</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1 text-muted-foreground">
                    <li>Load email status must be "new"</li>
                    <li className="line-through opacity-60">If load has expires_at: must not be expired (expires_at &gt; now) - DISABLED FOR DEV</li>
                    <li className="line-through opacity-60">If load has NO expires_at: must be less than 30 minutes old (received_at within last 30 minutes) - DISABLED FOR DEV</li>
                    <li>Load must match at least one active hunt plan to appear</li>
                  </ul>
                  <p><strong>Removal Rules:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1 text-muted-foreground">
                    <li className="line-through opacity-60">Load expires (based on expires_at or 30-minute timeout) - DISABLED FOR DEV</li>
                    <li>User manually skips the load</li>
                    <li>User moves load to Waitlist</li>
                    <li>User places a Bid on the load (to be implemented)</li>
                  </ul>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge variant="secondary">Missed</Badge>
                </h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p><strong>Data Source:</strong> load_emails table</p>
                  <p><strong>Filtering Criteria:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1 text-muted-foreground">
                    <li>marked_missed_at IS NOT NULL</li>
                    <li>Loads appear here exclusively after reaching 30 minutes old</li>
                  </ul>
                  <p><strong>Reset Logic:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1 text-muted-foreground">
                    <li>All missed loads reset to "new" status at midnight Eastern Time daily</li>
                    <li>Reset events logged to missed_loads_history table</li>
                  </ul>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge className="bg-yellow-500">Waitlist</Badge>
                </h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p><strong>Data Source:</strong> load_emails table</p>
                  <p><strong>Filtering Criteria:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1 text-muted-foreground">
                    <li>status = "waitlist"</li>
                    <li>User manually moved load here via "Move to Waitlist" button</li>
                  </ul>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge variant="secondary">Skipped</Badge>
                </h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p><strong>Data Source:</strong> load_emails table</p>
                  <p><strong>Filtering Criteria:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1 text-muted-foreground">
                    <li>status = "skipped"</li>
                    <li>User manually skipped load via "Skip" button</li>
                  </ul>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge variant="outline">All</Badge>
                </h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p><strong>Data Source:</strong> load_emails table</p>
                  <p><strong>Filtering Criteria:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1 text-muted-foreground">
                    <li>Shows ALL load emails regardless of status</li>
                    <li>Includes new, skipped, waitlist, and missed loads</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </AccordionContent>
        </AccordionItem>

        {/* Hunt Plan Matching Logic */}
        <AccordionItem value="matching" className="border rounded-lg px-6">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              <span className="text-lg font-semibold">Hunt Plan Matching Logic</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <CardContent className="space-y-4 pt-4">
              <div>
                <h4 className="font-semibold mb-2">Matching Criteria</h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p><strong>Geographic Matching:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1 text-muted-foreground">
                    <li>Hunt plan has huntCoordinates (lat/lng) and pickup_radius</li>
                    <li>Load origin location is geocoded if not already available</li>
                    <li>Haversine formula calculates distance between hunt location and load origin</li>
                    <li>Match if distance ≤ pickup_radius miles</li>
                  </ul>
                  <p className="mt-3"><strong>Vehicle Size Matching:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1 text-muted-foreground">
                    <li>Hunt plan has vehicle_size defined</li>
                    <li>Load has parsed vehicle type in parsed_data</li>
                    <li>Match if load vehicle type matches hunt vehicle_size</li>
                  </ul>
                  <p className="mt-3"><strong>Both Criteria Must Match:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1 text-muted-foreground">
                    <li>Location AND vehicle type must both match for successful match</li>
                    <li>Each successful match creates a record in load_hunt_matches table</li>
                    <li>One load can match multiple hunt plans (displayed as multiple rows in Unreviewed)</li>
                  </ul>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Truck-Driver-Carrier Display</h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    In the results table, the "Truck-Driver-Carrier" column shows vehicle/driver/carrier information ONLY for loads
                    that match an active hunt plan. If a load matches multiple hunt plans, it displays the information from each
                    matching hunt. If no hunt plan matches, displays "Available".
                  </p>
                </div>
              </div>
            </CardContent>
          </AccordionContent>
        </AccordionItem>

        {/* Email Parsing */}
        <AccordionItem value="email-parsing" className="border rounded-lg px-6">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              <span className="text-lg font-semibold">Email Parsing Fields</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <CardContent className="space-y-4 text-sm pt-4">
              <div>
                <h4 className="font-semibold mb-1">Route & Vehicle</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li><strong>vehicle_type</strong> – VAN / CARGO VAN / STRAIGHT, taken from the very beginning of the subject line.</li>
                  <li><strong>origin_city</strong> / <strong>origin_state</strong> – pickup city & state (e.g. Morrisville, NC) from "from … to …".</li>
                  <li><strong>destination_city</strong> / <strong>destination_state</strong> – delivery city & state from the same subject route.</li>
                  <li><strong>loaded_miles</strong> – posted loaded miles (e.g. 318 miles).</li>
                  <li><strong>weight</strong> – load weight in pounds from the subject (e.g. 0 lbs).</li>
                  <li><strong>pieces</strong> – number of pieces / pallets, from the HTML "Pieces" line or text fallbacks.</li>
                  <li><strong>dimensions</strong> – L x W x H measurements converted to "LxWxH".</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-1">Timing</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li><strong>pickup_date</strong> / <strong>pickup_time</strong> – second line in the pickup leginfo box or text fallback. Can be a real date/time or instructions like "ASAP".</li>
                  <li><strong>delivery_date</strong> / <strong>delivery_time</strong> – second line in the delivery leginfo box or text fallback.</li>
                  <li><strong>expires_datetime</strong> – raw "Expires" value as shown in the email (MM/DD/YY HH:MM TZ).</li>
                  <li><strong>expires_at</strong> – ISO timestamp version of expires_datetime with timezone applied (used for filtering).</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-1">Pricing</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li><strong>rate</strong> – extracted from "Posted Amount:" field (NOT "Rate:"). This is the dollar amount the broker is offering.</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-1">Broker / Customer</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li><strong>customer</strong> – "Posted by …" name from the subject.</li>
                  <li><strong>broker_name</strong> – value after "Broker Name:" in the details block.</li>
                  <li><strong>broker_company</strong> – value after "Broker Company:".</li>
                  <li><strong>broker_phone</strong> – value after "Broker Phone:".</li>
                  <li><strong>email</strong> – general email from "Email:" field (NOT broker email).</li>
                  <li><strong>broker_email</strong> – extracted from email in parentheses in subject line (e.g., "(email@domain.com)").</li>
                  <li><strong>order_number</strong> – numeric order ID from "Bid on Order #123456".</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-1">Load Details</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li><strong>load_type</strong> – Type of load extracted from "Load Type:" field (e.g., "Expedited", "Standard").</li>
                  <li><strong>dock_level</strong> – Dock level requirement from "Dock Level:" field.</li>
                  <li><strong>hazmat</strong> – Boolean indicating if load contains hazardous materials (extracted from "Hazmat:" field).</li>
                  <li><strong>stackable</strong> – Boolean indicating if load is stackable (extracted from "Stackable:" field).</li>
                  <li><strong>has_multiple_stops</strong> – Boolean indicating if load has 2 stops (detected from "2 stops" text).</li>
                  <li><strong>stop_count</strong> – Number of stops (currently only captures 2 when detected).</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-1">Notes & Extras</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li><strong>notes</strong> – combined text from all &lt;p&gt; tags inside the "notes-section" block.</li>
                </ul>
              </div>

              <p className="text-xs text-muted-foreground">
                If you see something in the original email that is not listed here (for example an extra field in the broker block),
                it means we are not parsing it yet and should add it to <code>parseLoadEmail</code>.
              </p>
            </CardContent>
          </AccordionContent>
        </AccordionItem>

        {/* Database Schema */}
        <AccordionItem value="database" className="border rounded-lg px-6">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              <span className="text-lg font-semibold">Database Schema</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <CardContent className="space-y-4 pt-4">
              <div>
                <h4 className="font-semibold mb-2">load_emails</h4>
                <div className="bg-muted p-4 rounded-lg space-y-1 text-sm">
                  <p className="text-muted-foreground">Main table storing all incoming load emails from Gmail.</p>
                  <p className="font-mono text-xs mt-2">Key fields: id, email_id, thread_id, subject, from_email, body_html, body_text, parsed_data (JSON), status, received_at, expires_at, marked_missed_at, load_id, assigned_load_id</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">hunt_plans</h4>
                <div className="bg-muted p-4 rounded-lg space-y-1 text-sm">
                  <p className="text-muted-foreground">User-defined search criteria for matching loads.</p>
                  <p className="font-mono text-xs mt-2">Key fields: id, vehicle_id, plan_name, zip_code, pickup_radius, destination_zip, destination_radius, vehicle_size, hunt_coordinates (JSON with lat/lng), enabled, created_at</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">load_hunt_matches</h4>
                <div className="bg-muted p-4 rounded-lg space-y-1 text-sm">
                  <p className="text-muted-foreground">Stores successful matches between loads and hunt plans. One load can have multiple matches.</p>
                  <p className="font-mono text-xs mt-2">Key fields: id, load_email_id, hunt_plan_id, vehicle_id, distance_miles, match_score, is_active, matched_at, created_at, updated_at</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">missed_loads_history</h4>
                <div className="bg-muted p-4 rounded-lg space-y-1 text-sm">
                  <p className="text-muted-foreground">Audit log of all loads that were marked as missed and reset events.</p>
                  <p className="font-mono text-xs mt-2">Key fields: id, load_email_id, missed_at, reset_at, dispatcher_id, from_email, subject, received_at</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">gmail_tokens</h4>
                <div className="bg-muted p-4 rounded-lg space-y-1 text-sm">
                  <p className="text-muted-foreground">Stores Gmail OAuth tokens for API access.</p>
                  <p className="font-mono text-xs mt-2">Key fields: id, user_email, access_token, refresh_token, token_expiry, created_at, updated_at</p>
                </div>
              </div>
            </CardContent>
          </AccordionContent>
        </AccordionItem>

        {/* Critical Timing Rules */}
        <AccordionItem value="timing" className="border rounded-lg px-6">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <span className="text-lg font-semibold">Critical Timing Rules</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <CardContent className="space-y-4 pt-4">
              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold mb-2">15 Minutes: Missed Status</h4>
                <p className="text-sm text-muted-foreground">
                  Loads that haven't been reviewed, skipped, or moved to waitlist after 15 minutes get their marked_missed_at timestamp set. 
                  They continue to appear in Unreviewed until 30 minutes.
                </p>
              </div>

              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold mb-2">30 Minutes: Unreviewed Removal</h4>
                <p className="text-sm text-muted-foreground">
                  Loads are automatically removed from Unreviewed section after 30 minutes from received_at (or when expires_at is reached if specified). 
                  Once removed from Unreviewed, they appear exclusively in the Missed section.
                </p>
              </div>

              <div className="border-l-4 border-purple-500 pl-4">
                <h4 className="font-semibold mb-2">Midnight ET: Daily Reset</h4>
                <p className="text-sm text-muted-foreground">
                  All missed loads are automatically reset to "new" status at midnight Eastern Time daily. Reset events are logged to 
                  missed_loads_history table for dispatcher performance tracking.
                </p>
              </div>

              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold mb-2">1 Minute: Email Polling</h4>
                <p className="text-sm text-muted-foreground">
                  Gmail inbox is polled every 1 minute via pg_cron job calling fetch-gmail-loads edge function. New emails are immediately 
                  parsed, matched against hunt plans, and appear in Load Hunter if they match active hunts.
                </p>
              </div>
            </CardContent>
          </AccordionContent>
        </AccordionItem>

        {/* Edge Functions */}
        <AccordionItem value="edge-functions" className="border rounded-lg px-6">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              <span className="text-lg font-semibold">Edge Functions</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <CardContent className="space-y-4 pt-4">
              <div>
                <h4 className="font-semibold mb-2">fetch-gmail-loads</h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p className="text-muted-foreground">Main cron function that polls Gmail inbox every minute for new load emails.</p>
                  <p><strong>Purpose:</strong> Fetches unread emails, parses load details, stores in load_emails table, matches against hunt plans</p>
                  <p><strong>Trigger:</strong> pg_cron every 1 minute</p>
                  <p><strong>Key Operations:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1 text-muted-foreground">
                    <li>Retrieves OAuth token from gmail_tokens table</li>
                    <li>Fetches unread emails with label "Sylectus"</li>
                    <li>Parses email HTML and text content for load details</li>
                    <li>Stores parsed data in load_emails.parsed_data (JSON)</li>
                    <li>Geocodes pickup location if not available</li>
                    <li>Matches against all active hunt plans</li>
                    <li>Creates records in load_hunt_matches for successful matches</li>
                  </ul>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">reset-missed-loads</h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p className="text-muted-foreground">Daily reset function that runs at midnight ET to clear missed load status.</p>
                  <p><strong>Purpose:</strong> Resets all missed loads back to "new" status for fresh daily cycle</p>
                  <p><strong>Trigger:</strong> pg_cron at 00:00 ET daily</p>
                  <p><strong>Key Operations:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1 text-muted-foreground">
                    <li>Finds all loads with marked_missed_at timestamp</li>
                    <li>Updates status back to "new" and clears marked_missed_at</li>
                    <li>Logs reset event to missed_loads_history table</li>
                    <li>Returns count of reset loads</li>
                  </ul>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">gmail-auth</h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p className="text-muted-foreground">Handles Gmail OAuth authentication and token storage.</p>
                  <p><strong>Purpose:</strong> Manages OAuth flow for Gmail API access</p>
                  <p><strong>Trigger:</strong> Manual invocation during setup</p>
                </div>
              </div>
            </CardContent>
          </AccordionContent>
        </AccordionItem>

        {/* Audio Alert System */}
        <AccordionItem value="audio" className="border rounded-lg px-6">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <span className="text-lg font-semibold">Audio Alert System</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <CardContent className="space-y-4 pt-4">
              <div>
                <h4 className="font-semibold mb-2">Purpose</h4>
                <p className="text-sm text-muted-foreground">
                  Provides audible alerts when new loads arrive in Load Hunter to ensure dispatchers don't miss opportunities.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">How It Works</h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Uses Web Audio API to play sound notifications</li>
                    <li>Toggle button in header (Volume2 icon when unmuted, VolumeX when muted)</li>
                    <li>Subscribes to load_emails table for real-time inserts</li>
                    <li>Plays alert sound whenever new email is inserted into database</li>
                    <li>Requires user interaction first (clicking speaker button) due to browser autoplay policies</li>
                    <li>Sound state persists in component state (does not persist across page refreshes)</li>
                  </ul>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Browser Limitations</h4>
                <p className="text-sm text-muted-foreground">
                  Most browsers block audio autoplay until user interacts with the page. Users must click the speaker icon at least once 
                  to enable sound notifications.
                </p>
              </div>
            </CardContent>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
