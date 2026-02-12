import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Code, AlertCircle, Filter, Clock, CheckCircle, Database, Zap, Bell, Mail, ArrowRight, RefreshCw, FileSearch, Plug, Target, History } from "lucide-react";
import ParserHelper from "@/components/ParserHelper";
import IntegrationsTab from "./IntegrationsTab";
import LoadboardFiltersTab from "./LoadboardFiltersTab";
import ChangelogTab from "./ChangelogTab";

export default function DevelopmentTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const loadIdParam = searchParams.get("loadId");
  
  const [activeTab, setActiveTab] = useState(tabParam || "documentation");

  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const next = new URLSearchParams(searchParams);
    next.set("tab", value);
    setSearchParams(next);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Development</h2>
        <p className="text-muted-foreground">Documentation, integrations, and development tools</p>
      </div>

      <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
        <div className="flex items-center gap-0 w-max sm:w-auto">
          {[
            { key: "documentation", label: "Docs", icon: null },
            { key: "parser-helper", label: "Parser", icon: FileSearch },
            { key: "integrations", label: "Integrations", icon: Plug },
            { key: "loadboard", label: "Load Hunter", icon: Target },
            { key: "changelog", label: "Changelog", icon: History },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`h-[32px] px-4 text-[13px] font-medium rounded-none first:rounded-l-full last:rounded-r-full border-0 flex items-center gap-2 transition-all ${
                activeTab === tab.key 
                  ? 'btn-glossy-primary text-white' 
                  : 'btn-glossy text-gray-700 hover:opacity-90'
              }`}
            >
              {tab.icon && <tab.icon className="h-4 w-4" />}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">

        <TabsContent value="parser-helper" className="mt-4">
          <ParserHelper initialLoadId={loadIdParam} />
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <IntegrationsTab />
        </TabsContent>

        <TabsContent value="loadboard" className="mt-4">
          <LoadboardFiltersTab />
        </TabsContent>

        <TabsContent value="changelog" className="mt-4">
          <ChangelogTab />
        </TabsContent>

        <TabsContent value="documentation" className="mt-4">
      <Accordion type="multiple" className="w-full space-y-4" defaultValue={["step-by-step"]}>
        {/* Step-by-Step Flow */}
        <AccordionItem value="step-by-step" className="border rounded-lg px-6">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              <span className="text-lg font-semibold">Complete Step-by-Step Flow</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <CardContent className="space-y-6 pt-4">
              {/* Step 1 */}
              <div className="border-l-4 border-blue-500 pl-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-gradient-to-b from-blue-400 to-blue-600 text-white !px-3 !py-1.5 shadow-md">Step 1</Badge>
                  <span className="font-semibold">Email Arrival</span>
                </div>
                <div className="text-sm space-y-2 text-muted-foreground">
                  <p><strong>Flow:</strong> Gmail → Google Pub/Sub → gmail-webhook edge function</p>
                  <p><strong>How it works:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>New email arrives at P.D@talbilogistics.com</li>
                    <li>Google Pub/Sub sends push notification to gmail-webhook endpoint</li>
                    <li>Webhook receives historyId indicating new messages</li>
                    <li>This is <strong>instant</strong> - no polling delays</li>
                  </ul>
                </div>
              </div>

              {/* Step 2 */}
              <div className="border-l-4 border-green-500 pl-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-gradient-to-b from-green-400 to-green-600 text-white !px-3 !py-1.5 shadow-md">Step 2</Badge>
                  <span className="font-semibold">Token Retrieval</span>
                </div>
                <div className="text-sm space-y-2 text-muted-foreground">
                  <p><strong>Flow:</strong> gmail-webhook → gmail_tokens table → refresh if needed</p>
                  <p><strong>How it works:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>Looks up access_token, refresh_token, token_expiry from gmail_tokens table</li>
                    <li>If token expired: calls Google OAuth to refresh token</li>
                    <li>Updates gmail_tokens table with new access_token and expiry</li>
                    <li>Includes retry logic with exponential backoff for database timeouts</li>
                  </ul>
                </div>
              </div>

              {/* Step 3 */}
              <div className="border-l-4 border-yellow-500 pl-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-gradient-to-b from-yellow-400 to-yellow-600 text-black !px-3 !py-1.5 shadow-md">Step 3</Badge>
                  <span className="font-semibold">Email Fetching</span>
                </div>
                <div className="text-sm space-y-2 text-muted-foreground">
                  <p><strong>Flow:</strong> gmail-webhook → Gmail API (history.list → messages.get)</p>
                  <p><strong>How it works:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>Uses history.list API with historyId to get new message IDs</li>
                    <li>For each message: calls messages.get with format=full</li>
                    <li>Extracts headers (From, Subject, Date) and body content</li>
                    <li>Decodes base64 HTML and plain text parts</li>
                  </ul>
                </div>
              </div>

              {/* Step 4 */}
              <div className="border-l-4 border-orange-500 pl-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-gradient-to-b from-orange-400 to-orange-600 text-white !px-3 !py-1.5 shadow-md">Step 4</Badge>
                  <span className="font-semibold">Email Parsing (Sylectus Format)</span>
                </div>
                <div className="text-sm space-y-2 text-muted-foreground">
                  <p><strong>Extracted fields from subject line:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>broker_email (in parentheses) - <strong>MANDATORY</strong></li>
                    <li>vehicle_type (VAN/CARGO VAN/STRAIGHT)</li>
                    <li>origin_city, origin_state → destination_city, destination_state</li>
                    <li>loaded_miles, weight</li>
                    <li>order_number, customer (Posted by)</li>
                  </ul>
                  <p className="mt-2"><strong>Extracted from body:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>broker_name, broker_company, broker_phone</li>
                    <li>pickup_date, pickup_time, delivery_date, delivery_time</li>
                    <li>rate (from "Posted Amount:" - NOT "Rate:")</li>
                    <li>pieces, dimensions, dock_level</li>
                    <li>hazmat, stackable (booleans)</li>
                    <li>expires_at (ISO timestamp)</li>
                    <li>notes</li>
                  </ul>
                </div>
              </div>

              {/* Step 5 */}
              <div className="border-l-4 border-purple-500 pl-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-gradient-to-b from-purple-400 to-purple-600 text-white !px-3 !py-1.5 shadow-md">Step 5</Badge>
                  <span className="font-semibold">Database Storage</span>
                </div>
                <div className="text-sm space-y-2 text-muted-foreground">
                  <p><strong>Flow:</strong> Parsed data → load_emails table + customers table</p>
                  <p><strong>How it works:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>Generates load_id in format: LH-YYMMDD-### (e.g., LH-241201-001)</li>
                    <li>Checks for duplicate by email_id to prevent double-processing</li>
                    <li>Inserts into load_emails with status='new', received_at=now()</li>
                    <li>Auto-creates customer record from broker info (broker_company → name, broker_email → email)</li>
                    <li>Uses case-insensitive matching to prevent duplicate customers</li>
                  </ul>
                </div>
              </div>

              {/* Step 6 */}
              <div className="border-l-4 border-pink-500 pl-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-gradient-to-b from-pink-400 to-pink-600 text-white !px-3 !py-1.5 shadow-md">Step 6</Badge>
                  <span className="font-semibold">Hunt Plan Matching</span>
                </div>
                <div className="text-sm space-y-2 text-muted-foreground">
                  <p><strong>Flow:</strong> New load → Active hunt_plans → load_hunt_matches</p>
                  <p><strong>Matching criteria (ALL must match):</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li><strong>Geographic:</strong> Load origin within hunt's pickup_radius miles (Haversine distance)</li>
                    <li><strong>Vehicle Size:</strong> Load vehicle_type matches hunt's vehicle_size</li>
                    <li><strong>Hunt Enabled:</strong> Hunt plan must have enabled=true</li>
                  </ul>
                  <p className="mt-2"><strong>Result:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>One load can match multiple hunt plans (multiple trucks)</li>
                    <li>Each match creates a record in load_hunt_matches table</li>
                    <li>Each match displays as a separate row in Unreviewed section</li>
                  </ul>
                </div>
              </div>

              {/* Step 7 */}
              <div className="border-l-4 border-cyan-500 pl-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-cyan-500">Step 7</Badge>
                  <span className="font-semibold">UI Display</span>
                </div>
                <div className="text-sm space-y-2 text-muted-foreground">
                  <p><strong>Load Hunter shows:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>Left sidebar: All fleet vehicles with current location/driver</li>
                    <li>Main area: Loads table filtered by selected tab</li>
                    <li>Unreviewed tab: Shows load_hunt_matches (one row per match)</li>
                    <li>Other tabs: Show load_emails directly</li>
                  </ul>
                  <p className="mt-2"><strong>Dispatcher Mode:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>Admin Mode: See all vehicles and all matches</li>
                    <li>MY TRUCKS Mode: Only see vehicles assigned to current dispatcher</li>
                  </ul>
                </div>
              </div>

              {/* Step 8 */}
              <div className="border-l-4 border-red-500 pl-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-red-500">Step 8</Badge>
                  <span className="font-semibold">User Actions</span>
                </div>
                <div className="text-sm space-y-2 text-muted-foreground">
                  <p><strong>Available actions on each load:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li><strong>Skip:</strong> Deactivates ONLY that specific match (other matches for same load remain)</li>
                    <li><strong>Waitlist:</strong> Moves entire load to waitlist status</li>
                    <li><strong>Set Bid:</strong> Opens bid dialog with email template</li>
                    <li><strong>View Detail:</strong> Opens full load email detail view</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </AccordionContent>
        </AccordionItem>

        {/* Load Email Lifecycle */}
        <AccordionItem value="lifecycle" className="border rounded-lg px-6">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              <span className="text-lg font-semibold">Load Status Lifecycle</span>
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
                    <span className="text-sm font-semibold">User Skipped Match</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    User clicks "Skip". Only deactivates the individual match (is_active=false in load_hunt_matches). 
                    Other matches for same load remain active. Skipped matches reset at midnight ET.
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
              <span className="text-lg font-semibold">UI Tab Filter Logic</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <CardContent className="space-y-6 pt-4">
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge>Unreviewed</Badge>
                </h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p><strong>Data Source:</strong> load_hunt_matches table joined with load_emails</p>
                  <p><strong>Display Logic:</strong> Shows one row per match (same load can appear multiple times)</p>
                  <p><strong>Filtering Criteria:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1 text-muted-foreground">
                    <li>Match must be active (is_active = true)</li>
                    <li>Load email status must be "new"</li>
                    <li>Load not expired (expires_at &gt; now OR within 30 min of received_at)</li>
                  </ul>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge variant="secondary">Missed</Badge>
                </h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p><strong>Data Source:</strong> load_emails table</p>
                  <p><strong>Filtering:</strong> marked_missed_at IS NOT NULL</p>
                  <p><strong>Reset:</strong> All missed loads reset to "new" at midnight ET daily</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge className="bg-yellow-500">Waitlist</Badge>
                </h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p><strong>Data Source:</strong> load_emails table</p>
                  <p><strong>Filtering:</strong> status = "waitlist"</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge variant="secondary">Skipped</Badge>
                </h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p><strong>Data Source:</strong> load_hunt_matches with is_active = false</p>
                  <p><strong>Note:</strong> Skipped matches reset at midnight ET (is_active set back to true)</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge variant="outline">All</Badge>
                </h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p><strong>Data Source:</strong> load_emails table</p>
                  <p><strong>Filtering:</strong> Shows ALL load emails regardless of status</p>
                </div>
              </div>
            </CardContent>
          </AccordionContent>
        </AccordionItem>

        {/* Database Schema */}
        <AccordionItem value="database" className="border rounded-lg px-6">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              <span className="text-lg font-semibold">Database Tables</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <CardContent className="space-y-4 pt-4">
              <div>
                <h4 className="font-semibold mb-2">gmail_tokens</h4>
                <div className="bg-muted p-4 rounded-lg space-y-1 text-sm">
                  <p className="text-muted-foreground">Stores Gmail OAuth tokens for API access.</p>
                  <p className="font-mono text-xs mt-2">id, user_email, access_token, refresh_token, token_expiry, created_at, updated_at</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">load_emails</h4>
                <div className="bg-muted p-4 rounded-lg space-y-1 text-sm">
                  <p className="text-muted-foreground">Main table storing all incoming load emails.</p>
                  <p className="font-mono text-xs mt-2">id, email_id, load_id (LH-YYMMDD-###), subject, from_email, body_html, body_text, parsed_data (JSON), status, received_at, expires_at, marked_missed_at</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">hunt_plans</h4>
                <div className="bg-muted p-4 rounded-lg space-y-1 text-sm">
                  <p className="text-muted-foreground">User-defined search criteria for matching loads to trucks.</p>
                  <p className="font-mono text-xs mt-2">id, vehicle_id, plan_name, zip_code, pickup_radius, vehicle_size, hunt_coordinates (JSON), enabled</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">load_hunt_matches</h4>
                <div className="bg-muted p-4 rounded-lg space-y-1 text-sm">
                  <p className="text-muted-foreground">Stores successful matches between loads and hunt plans. One load → multiple matches.</p>
                  <p className="font-mono text-xs mt-2">id, load_email_id, hunt_plan_id, vehicle_id, distance_miles, match_score, is_active, matched_at</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">customers</h4>
                <div className="bg-muted p-4 rounded-lg space-y-1 text-sm">
                  <p className="text-muted-foreground">Auto-populated from broker info in emails.</p>
                  <p className="font-mono text-xs mt-2">id, name (broker_company), contact_name (broker_name), email (broker_email), phone (broker_phone)</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">vehicles</h4>
                <div className="bg-muted p-4 rounded-lg space-y-1 text-sm">
                  <p className="text-muted-foreground">Fleet vehicles synced from Samsara with telematics data.</p>
                  <p className="font-mono text-xs mt-2">id, unit_id, vin, provider_id (Samsara ID), current_odometer, current_location, formatted_address</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">dispatchers</h4>
                <div className="bg-muted p-4 rounded-lg space-y-1 text-sm">
                  <p className="text-muted-foreground">Dispatcher profiles linked to user emails for MY TRUCKS filtering.</p>
                  <p className="font-mono text-xs mt-2">id, first_name, last_name, email, assigned_trucks</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">missed_loads_history</h4>
                <div className="bg-muted p-4 rounded-lg space-y-1 text-sm">
                  <p className="text-muted-foreground">Audit log of missed loads and reset events.</p>
                  <p className="font-mono text-xs mt-2">id, load_email_id, missed_at, reset_at, dispatcher_id, from_email, subject</p>
                </div>
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
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  gmail-webhook
                  <Badge className="bg-green-500">PRIMARY</Badge>
                </h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p className="text-muted-foreground">Receives Gmail Pub/Sub push notifications for instant email processing.</p>
                  <p><strong>Trigger:</strong> Google Pub/Sub push notification (instant)</p>
                  <p><strong>Operations:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1 text-muted-foreground">
                    <li>Receives push notification with historyId</li>
                    <li>Retrieves OAuth token (with retry logic)</li>
                    <li>Fetches new messages via Gmail API</li>
                    <li>Parses Sylectus email format</li>
                    <li>Stores in load_emails, creates customers</li>
                    <li>Matches against active hunt plans</li>
                  </ul>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">gmail-auth</h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p className="text-muted-foreground">Handles Gmail OAuth authentication flow and token storage.</p>
                  <p><strong>Trigger:</strong> Manual invocation during setup</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  fetch-gmail-loads
                  <Badge variant="secondary">BACKUP</Badge>
                </h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p className="text-muted-foreground">Legacy polling function - backup if Pub/Sub fails.</p>
                  <p><strong>Trigger:</strong> pg_cron (disabled when Pub/Sub is active)</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">reset-missed-loads</h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p className="text-muted-foreground">Daily reset function that clears missed load status.</p>
                  <p><strong>Trigger:</strong> pg_cron at midnight ET daily</p>
                  <p><strong>Operations:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1 text-muted-foreground">
                    <li>Resets all loads with marked_missed_at to "new" status</li>
                    <li>Resets skipped matches (is_active = true)</li>
                    <li>Logs to missed_loads_history</li>
                  </ul>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">backfill-customers</h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p className="text-muted-foreground">Retroactively populates customers from existing load emails.</p>
                  <p><strong>Trigger:</strong> Manual invocation</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">ai-update-customers</h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <p className="text-muted-foreground">AI fallback for emails where regex parsing fails.</p>
                  <p><strong>Trigger:</strong> Manual invocation</p>
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
              <div className="border-l-4 border-green-500 pl-4">
                <h4 className="font-semibold mb-2">Instant: Email Arrival (Pub/Sub)</h4>
                <p className="text-sm text-muted-foreground">
                  Gmail Push Notifications deliver emails instantly via Pub/Sub. No polling delays.
                  This replaced the old 1-minute polling approach.
                </p>
              </div>

              <div className="border-l-4 border-blue-500 pl-4">
                <h4 className="font-semibold mb-2">15 Minutes: Missed Marking</h4>
                <p className="text-sm text-muted-foreground">
                  Loads not reviewed within 15 minutes get marked_missed_at timestamp set.
                  Still visible in Unreviewed until 30 minutes.
                </p>
              </div>

              <div className="border-l-4 border-orange-500 pl-4">
                <h4 className="font-semibold mb-2">30 Minutes: Unreviewed Removal</h4>
                <p className="text-sm text-muted-foreground">
                  Loads automatically removed from Unreviewed after 30 minutes (or when expires_at reached).
                  Moves exclusively to Missed section.
                </p>
              </div>

              <div className="border-l-4 border-purple-500 pl-4">
                <h4 className="font-semibold mb-2">Midnight ET: Daily Reset</h4>
                <p className="text-sm text-muted-foreground">
                  All missed loads reset to "new" status. All skipped matches reactivated.
                  Reset events logged to missed_loads_history.
                </p>
              </div>
            </CardContent>
          </AccordionContent>
        </AccordionItem>

        {/* Email Parsing Fields */}
        <AccordionItem value="email-parsing" className="border rounded-lg px-6">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              <span className="text-lg font-semibold">Sylectus Email Parsing Fields</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <CardContent className="space-y-4 text-sm pt-4">
              <div>
                <h4 className="font-semibold mb-1">From Subject Line</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li><strong>broker_email</strong> – In parentheses (e.g., "(email@domain.com)") - <span className="text-red-500 font-semibold">MANDATORY</span></li>
                  <li><strong>vehicle_type</strong> – VAN / CARGO VAN / STRAIGHT at beginning</li>
                  <li><strong>origin_city, origin_state</strong> – From "from X to Y" pattern</li>
                  <li><strong>destination_city, destination_state</strong> – From "from X to Y" pattern</li>
                  <li><strong>loaded_miles</strong> – e.g., "318 miles"</li>
                  <li><strong>weight</strong> – e.g., "0 lbs"</li>
                  <li><strong>order_number</strong> – From "Bid on Order #123456"</li>
                  <li><strong>customer</strong> – From "Posted by X"</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-1">From Body Content</h4>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li><strong>broker_name</strong> – "Broker Name:" field</li>
                  <li><strong>broker_company</strong> – "Broker Company:" field</li>
                  <li><strong>broker_phone</strong> – "Broker Phone:" field</li>
                  <li><strong>rate</strong> – "Posted Amount:" field (NOT "Rate:")</li>
                  <li><strong>pickup_date, pickup_time</strong> – From pickup leginfo box</li>
                  <li><strong>delivery_date, delivery_time</strong> – From delivery leginfo box</li>
                  <li><strong>pieces</strong> – Number of pieces/pallets</li>
                  <li><strong>dimensions</strong> – L x W x H measurements</li>
                  <li><strong>dock_level</strong> – Dock level requirement</li>
                  <li><strong>hazmat</strong> – Boolean from "Hazmat:" field</li>
                  <li><strong>stackable</strong> – Boolean from "Stackable:" field</li>
                  <li><strong>expires_at</strong> – ISO timestamp from "Expires:" field</li>
                  <li><strong>notes</strong> – Combined text from notes-section</li>
                </ul>
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
                <h4 className="font-semibold mb-2">How It Works</h4>
                <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Uses Web Audio API to play sound notifications</li>
                    <li>Toggle button in header (Volume2/VolumeX icons)</li>
                    <li>Subscribes to load_emails table for real-time inserts</li>
                    <li>Plays alert when new email arrives via Supabase Realtime</li>
                    <li>Requires user interaction first (click speaker) due to browser autoplay policies</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </AccordionContent>
        </AccordionItem>

        {/* Set Bid Format */}
        <AccordionItem value="set-bid" className="border rounded-lg px-6">
          <AccordionTrigger className="hover:no-underline py-4">
            <div className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              <span className="text-lg font-semibold">Set Bid Email Format</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <CardContent className="space-y-4 pt-4">
              <div>
                <h4 className="font-semibold mb-2">Subject Line Format</h4>
                <div className="bg-muted p-4 rounded-lg text-sm font-mono">
                  Order# {'{order_number}'} [{'{origin_state}'} to {'{destination_state}'}] {'{vehicle_length}'}' {'{vehicle_type}'} - ${'{bid_amount}'}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Example: <code>Order# 85174 [OH to KS] 24' Large Straight - $3000</code>
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Vehicle Info Source</h4>
                <p className="text-sm text-muted-foreground">
                  Vehicle size and type come from the asset's dimensions_length and asset_subtype fields in the vehicles table.
                </p>
              </div>
            </CardContent>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
        </TabsContent>
      </Tabs>
    </div>
  );
}
