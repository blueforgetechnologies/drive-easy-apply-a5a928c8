import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Code, AlertCircle, Filter, Clock, CheckCircle, XCircle } from "lucide-react";

export default function DevelopmentTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Development Documentation</h2>
        <p className="text-muted-foreground">Comprehensive documentation of Load Hunter logic and filtering rules</p>
      </div>

      {/* Load Hunter Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Load Hunter System Overview
          </CardTitle>
          <CardDescription>Core functionality and purpose</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
      </Card>

      {/* Load Email Lifecycle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Load Email Lifecycle & Status Flow
          </CardTitle>
          <CardDescription>How loads progress through different states</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
      </Card>

      {/* Filter Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filter Section Logic
          </CardTitle>
          <CardDescription>Detailed rules for each filter tab</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Badge>Unreviewed</Badge>
            </h4>
            <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
              <p><strong>Data Source:</strong> load_hunt_matches table (NOT load_emails directly)</p>
              <p><strong>Display Logic:</strong> Shows one row per match (one load can appear multiple times if it matches multiple hunt plans)</p>
              <p><strong>Filtering Criteria:</strong></p>
              <ul className="list-disc list-inside ml-4 space-y-1 text-muted-foreground">
                <li>Load email status must be "new"</li>
                <li>If load has expires_at: must not be expired (expires_at &gt; now)</li>
                <li>If load has NO expires_at: must be less than 30 minutes old (received_at within last 30 minutes)</li>
                <li>Load must match at least one active hunt plan to appear</li>
              </ul>
              <p><strong>Removal Rules:</strong></p>
              <ul className="list-disc list-inside ml-4 space-y-1 text-muted-foreground">
                <li>Load expires (based on expires_at or 30-minute timeout)</li>
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
      </Card>

      {/* Hunt Plan Matching */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Hunt Plan Matching Logic
          </CardTitle>
          <CardDescription>How loads are matched to hunt plans</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
      </Card>

      {/* Database Tables */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Database Schema
          </CardTitle>
          <CardDescription>Key tables and their relationships</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="border p-4 rounded-lg">
              <h4 className="font-semibold mb-2">load_emails</h4>
              <p className="text-sm text-muted-foreground mb-2">Stores all incoming load emails</p>
              <div className="text-xs font-mono bg-muted p-2 rounded">
                <p>- id (uuid)</p>
                <p>- email_id (text)</p>
                <p>- from_email (text)</p>
                <p>- subject (text)</p>
                <p>- body_html (text)</p>
                <p>- parsed_data (jsonb)</p>
                <p>- status (text: new/skipped/waitlist)</p>
                <p>- received_at (timestamp)</p>
                <p>- expires_at (timestamp, nullable)</p>
                <p>- marked_missed_at (timestamp, nullable)</p>
              </div>
            </div>

            <div className="border p-4 rounded-lg">
              <h4 className="font-semibold mb-2">hunt_plans</h4>
              <p className="text-sm text-muted-foreground mb-2">User-defined load search criteria</p>
              <div className="text-xs font-mono bg-muted p-2 rounded">
                <p>- id (uuid)</p>
                <p>- vehicle_id (uuid, FK to vehicles)</p>
                <p>- plan_name (text)</p>
                <p>- zip_code (text)</p>
                <p>- pickup_radius (text)</p>
                <p>- vehicle_size (text)</p>
                <p>- huntCoordinates (jsonb: lat, lng)</p>
                <p>- enabled (boolean)</p>
                <p>- available_date (date)</p>
              </div>
            </div>

            <div className="border p-4 rounded-lg">
              <h4 className="font-semibold mb-2">load_hunt_matches</h4>
              <p className="text-sm text-muted-foreground mb-2">Tracks which loads match which hunt plans</p>
              <div className="text-xs font-mono bg-muted p-2 rounded">
                <p>- id (uuid)</p>
                <p>- load_email_id (uuid, FK to load_emails)</p>
                <p>- hunt_plan_id (uuid, FK to hunt_plans)</p>
                <p>- vehicle_id (uuid, FK to vehicles)</p>
                <p>- distance_miles (numeric)</p>
                <p>- match_score (numeric)</p>
                <p>- matched_at (timestamp)</p>
                <p>- is_active (boolean)</p>
              </div>
            </div>

            <div className="border p-4 rounded-lg">
              <h4 className="font-semibold mb-2">missed_loads_history</h4>
              <p className="text-sm text-muted-foreground mb-2">Audit log of all missed loads for dispatcher scoring</p>
              <div className="text-xs font-mono bg-muted p-2 rounded">
                <p>- id (uuid)</p>
                <p>- load_email_id (uuid, FK to load_emails)</p>
                <p>- missed_at (timestamp)</p>
                <p>- reset_at (timestamp, nullable)</p>
                <p>- dispatcher_id (uuid, nullable)</p>
                <p>- from_email (text)</p>
                <p>- subject (text)</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Critical Timing Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-500" />
            Critical Timing Rules
          </CardTitle>
          <CardDescription>Important time-based behaviors</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex gap-3 items-start">
              <Badge className="bg-yellow-500">15 min</Badge>
              <div className="flex-1">
                <p className="font-semibold text-sm">Missed Status Applied</p>
                <p className="text-sm text-muted-foreground">
                  After 15 minutes without user action, marked_missed_at is set. Load still visible in Unreviewed.
                </p>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <Badge variant="destructive">30 min</Badge>
              <div className="flex-1">
                <p className="font-semibold text-sm">Removal from Unreviewed</p>
                <p className="text-sm text-muted-foreground">
                  At 30 minutes, load removed from Unreviewed and moves to Missed section. Logged to missed_loads_history.
                </p>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <Badge className="bg-purple-500">Midnight ET</Badge>
              <div className="flex-1">
                <p className="font-semibold text-sm">Daily Reset</p>
                <p className="text-sm text-muted-foreground">
                  All missed loads reset to "new" status. Reset logged to history. Enables daily load cycle tracking.
                </p>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <Badge>Every 1 min</Badge>
              <div className="flex-1">
                <p className="font-semibold text-sm">Email Polling</p>
                <p className="text-sm text-muted-foreground">
                  Cron job fetches new Gmail emails and parses load data every 1 minute.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edge Functions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Edge Functions
          </CardTitle>
          <CardDescription>Backend serverless functions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-l-4 border-blue-500 pl-4">
            <h4 className="font-semibold mb-1">fetch-gmail-loads</h4>
            <p className="text-sm text-muted-foreground">
              <strong>Purpose:</strong> Polls Gmail API for unread emails from P.D@talbilogistics.com
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Trigger:</strong> Cron job every 1 minute
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Actions:</strong> Fetches emails, parses HTML for load details, stores in load_emails table
            </p>
          </div>

          <div className="border-l-4 border-blue-500 pl-4">
            <h4 className="font-semibold mb-1">reparse-load-emails</h4>
            <p className="text-sm text-muted-foreground">
              <strong>Purpose:</strong> Re-parses existing emails with updated parsing logic
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Trigger:</strong> Manual (refresh button)
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Actions:</strong> Updates parsed_data for all load_emails records
            </p>
          </div>

          <div className="border-l-4 border-blue-500 pl-4">
            <h4 className="font-semibold mb-1">reset-missed-loads</h4>
            <p className="text-sm text-muted-foreground">
              <strong>Purpose:</strong> Daily reset of missed loads
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Trigger:</strong> Cron job at midnight Eastern Time
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Actions:</strong> Resets missed loads to "new" status, logs to history
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Audio Alerts */}
      <Card>
        <CardHeader>
          <CardTitle>Audio Alert System</CardTitle>
          <CardDescription>Sound notification for new loads</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            <strong>Trigger:</strong> When a new load email is inserted into load_emails table (detected via real-time subscription)
          </p>
          <p className="text-sm text-muted-foreground">
            <strong>Control:</strong> Speaker icon button in header toggles sound on/off
          </p>
          <p className="text-sm text-muted-foreground">
            <strong>Browser Requirement:</strong> User must interact with speaker button first (click) due to browser autoplay policies
          </p>
          <p className="text-sm text-muted-foreground">
            <strong>Implementation:</strong> Web Audio API generates tone when unmuted
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
