import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";

export default function ChangelogTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <History className="h-8 w-8 text-primary" />
          Changelog
        </h2>
        <p className="text-muted-foreground">All system changes tracked chronologically. Entries are never removed, only added.</p>
      </div>

      <Card className="border-primary/30">
        <CardContent className="space-y-4 pt-6">
          {/* LATEST CHANGES - Add new entries at the top with incremented change numbers */}
          
          <div className="border-l-4 border-primary pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="font-mono">#009</Badge>
              <Badge>Dec 3, 2024</Badge>
              <span className="text-sm font-semibold">Server-Side Hunt Matching Implemented</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li><strong>Root cause fixed:</strong> Client-side matching had race condition - loads could be missed if React state hadn't refreshed when matcher ran</li>
              <li><strong>Solution:</strong> Moved hunt matching logic directly into process-email-queue edge function</li>
              <li><strong>Flow:</strong> Each load is now matched to hunt plans immediately after insertion (server-side)</li>
              <li><strong>Matching logic:</strong> Haversine distance + vehicle type matching + floor_load_id cursor check</li>
              <li><strong>Benefit:</strong> 100% match coverage - no loads can be missed due to timing/state issues</li>
              <li><strong>Backward compatible:</strong> Client-side backup matching still runs as safety net</li>
            </ul>
          </div>

          <div className="border-l-4 border-primary pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="font-mono">#008</Badge>
              <Badge>Dec 3, 2024</Badge>
              <span className="text-sm font-semibold">Expiration Time Parsing Added</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Added expiration datetime parsing to process-email-queue edge function</li>
              <li>Parses "Expiration:" field from Sylectus emails (format: MM/DD/YY HH:MM AM/PM TZ)</li>
              <li>Converts to ISO timestamp and stores in expires_at column</li>
              <li>New emails will now have expiration times displayed in Load Hunter</li>
            </ul>
          </div>

          <div className="border-l-4 border-primary pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="font-mono">#007</Badge>
              <Badge>Dec 3, 2024</Badge>
              <span className="text-sm font-semibold">Load Hunter Shows Expiration Instead of Processed</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Replaced "Processed" timestamp with "Expires" date/time in Load Hunter table</li>
              <li>Shows expiration date/time in hours and minutes format (e.g., "Dec 3, 2:30 PM (2h 15m)")</li>
            </ul>
          </div>

          <div className="border-l-4 border-primary pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="font-mono">#006</Badge>
              <Badge>Dec 3, 2024</Badge>
              <span className="text-sm font-semibold">Pickup/Delivery Time Parsing Fixed</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Updated process-email-queue edge function to parse pickup_time and delivery_time</li>
              <li>Added patterns for "Pick-Up" and "Delivery" sections in Sylectus emails</li>
              <li>Format parsed: MM/DD/YY HH:MM TZ (e.g., "12/03/25 13:00 EST")</li>
              <li>Added fallback patterns for leginfo HTML format</li>
            </ul>
          </div>

          <div className="border-l-4 border-primary pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="font-mono">#005</Badge>
              <Badge>Dec 3, 2024</Badge>
              <span className="text-sm font-semibold">Header Tab Renamed</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Renamed "Hunter" tab to "Load Hunter" in header navigation</li>
            </ul>
          </div>

          <div className="border-l-4 border-primary pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="font-mono">#004</Badge>
              <Badge>Dec 3, 2024</Badge>
              <span className="text-sm font-semibold">Changelog Moved to Own Tab</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Created dedicated Changelog tab in header navigation</li>
              <li>Added change numbers (#001, #002, etc.) for easy reference</li>
              <li>Removed changelog from Development tab</li>
            </ul>
          </div>

          <div className="border-l-4 border-primary pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="font-mono">#003</Badge>
              <Badge>Dec 3, 2024</Badge>
              <span className="text-sm font-semibold">Changelog Section Added</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Added Changelog section to Development tab (now moved here)</li>
              <li>All future changes documented chronologically</li>
              <li>Entries are append-only - never removed</li>
            </ul>
          </div>

          <div className="border-l-4 border-primary pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="font-mono">#002</Badge>
              <Badge>Dec 3, 2024</Badge>
              <span className="text-sm font-semibold">ALL Tab Always Visible</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Removed "Hide All / Show All" toggle button from Load Hunter filter bar</li>
              <li>ALL tab is now permanently visible in the filter buttons</li>
              <li>Removed showAllTab state variable</li>
            </ul>
          </div>

          <div className="border-l-4 border-primary pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="font-mono">#001</Badge>
              <Badge>Dec 3, 2024</Badge>
              <span className="text-sm font-semibold">Hunter Tab Badge Removed</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Removed the unreviewed count badge from Hunter tab in header navigation</li>
              <li>Removed unreviewedLoadsCount state and loadUnreviewedLoads function from DashboardLayout</li>
              <li>Removed badge prop from MobileNav component</li>
            </ul>
          </div>

          {/* BASELINE - Existing System Logic */}
          <div className="mt-8 pt-6 border-t">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Badge variant="secondary">BASELINE</Badge>
              Current System Intervals & Logic
            </h3>
          </div>

          <div className="border-l-4 border-blue-500 pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-blue-500">Interval</Badge>
              <span className="text-sm font-semibold">Email Queue Processing - 20 seconds</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li><strong>Function:</strong> processEmailQueue() in LoadHunterTab</li>
              <li><strong>Interval:</strong> Every 20 seconds (20000ms)</li>
              <li><strong>Purpose:</strong> Calls process-email-queue edge function to process queued emails</li>
              <li><strong>Batch size:</strong> Processes 2-5 emails per batch</li>
              <li><strong>Also triggers:</strong> loadEmails() after processing completes</li>
            </ul>
          </div>

          <div className="border-l-4 border-green-500 pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-green-500">Interval</Badge>
              <span className="text-sm font-semibold">Load Emails Refresh - 20 seconds</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li><strong>Function:</strong> loadEmails() in LoadHunterTab</li>
              <li><strong>Interval:</strong> Every 20 seconds (EMAIL_POLL_INTERVAL)</li>
              <li><strong>Purpose:</strong> Fetches load_emails from last 48 hours by created_at</li>
              <li><strong>Query:</strong> load_emails ordered by received_at DESC, limit 500</li>
              <li><strong>Triggers:</strong> runHuntMatchingLogic() after load</li>
            </ul>
          </div>

          <div className="border-l-4 border-yellow-500 pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-yellow-500">Interval</Badge>
              <span className="text-sm font-semibold">Unreviewed Matches Refresh - 20 seconds</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li><strong>Function:</strong> loadUnreviewedMatches() in LoadHunterTab</li>
              <li><strong>Interval:</strong> Every 20 seconds (EMAIL_POLL_INTERVAL)</li>
              <li><strong>Purpose:</strong> Fetches from unreviewed_matches database view</li>
              <li><strong>View logic:</strong> Joins load_hunt_matches with load_emails, hunt_plans, vehicles</li>
              <li><strong>Filter:</strong> is_active=true, status='new', not expired</li>
            </ul>
          </div>

          <div className="border-l-4 border-orange-500 pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-orange-500">Interval</Badge>
              <span className="text-sm font-semibold">Hunt Matching Re-run - 30 seconds</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li><strong>Function:</strong> runHuntMatchingLogic() backup interval</li>
              <li><strong>Interval:</strong> Every 30 seconds (30000ms)</li>
              <li><strong>Purpose:</strong> Backup re-match to catch any missed matches</li>
              <li><strong>Logic:</strong> Only runs if enabled hunt plans exist</li>
              <li><strong>Matching:</strong> Haversine distance + vehicle_type matching</li>
            </ul>
          </div>

          <div className="border-l-4 border-purple-500 pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-purple-500">Interval</Badge>
              <span className="text-sm font-semibold">Vehicles Refresh - 60 seconds</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li><strong>Function:</strong> loadVehicles() in LoadHunterTab</li>
              <li><strong>Interval:</strong> Every 60 seconds (60000ms)</li>
              <li><strong>Purpose:</strong> Refreshes vehicle list with Samsara data</li>
              <li><strong>Data:</strong> unit_id, current_location, formatted_address, speed</li>
            </ul>
          </div>

          <div className="border-l-4 border-pink-500 pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-pink-500">Interval</Badge>
              <span className="text-sm font-semibold">Hunt Plans Refresh - 30 seconds</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li><strong>Function:</strong> loadHuntPlans() in LoadHunterTab</li>
              <li><strong>Interval:</strong> Every 30 seconds (30000ms)</li>
              <li><strong>Purpose:</strong> Refreshes active hunt plan configurations</li>
              <li><strong>Also:</strong> Updates myHuntPlanVehicleIds for MY TRUCKS filtering</li>
            </ul>
          </div>

          <div className="border-l-4 border-cyan-500 pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-cyan-500">Realtime</Badge>
              <span className="text-sm font-semibold">Supabase Realtime Subscriptions</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li><strong>Channel:</strong> load-emails-changes</li>
              <li><strong>Events:</strong> INSERT on load_emails table</li>
              <li><strong>Action:</strong> Triggers loadEmails() and plays audio alert if unmuted</li>
              <li><strong>Also subscribes:</strong> load_hunt_matches, hunt_plans tables</li>
            </ul>
          </div>

          <div className="border-l-4 border-red-500 pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="destructive">Timing</Badge>
              <span className="text-sm font-semibold">Missed Load Marking - 15 minutes</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li><strong>Function:</strong> checkMissedLoads() (currently runs in intervals)</li>
              <li><strong>Threshold:</strong> 15 minutes from received_at</li>
              <li><strong>Action:</strong> Sets marked_missed_at timestamp on load_emails</li>
              <li><strong>Batch:</strong> Chunks updates into 50 records per request</li>
            </ul>
          </div>

          <div className="border-l-4 border-gray-500 pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary">Timing</Badge>
              <span className="text-sm font-semibold">Unreviewed Removal - 30 minutes</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li><strong>Logic:</strong> Loads removed from Unreviewed after 30 min OR expires_at</li>
              <li><strong>Filter:</strong> Applied in unreviewed_matches view</li>
              <li><strong>Fallback:</strong> If no expires_at, uses 30 min from received_at</li>
            </ul>
          </div>

          <div className="border-l-4 border-gray-500 pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary">Daily</Badge>
              <span className="text-sm font-semibold">Midnight ET Reset</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li><strong>Function:</strong> reset-missed-loads edge function</li>
              <li><strong>Trigger:</strong> pg_cron at midnight Eastern Time</li>
              <li><strong>Actions:</strong> Resets marked_missed_at, reactivates skipped matches</li>
              <li><strong>Logging:</strong> Records to missed_loads_history table</li>
            </ul>
          </div>

          <div className="border-l-4 border-gray-500 pl-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary">Query</Badge>
              <span className="text-sm font-semibold">ALL Tab Data Window - 48 hours</span>
            </div>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li><strong>Query:</strong> load_emails where created_at &gt; now() - 48 hours</li>
              <li><strong>Limit:</strong> 500 records maximum</li>
              <li><strong>Sort:</strong> received_at DESC (newest first)</li>
              <li><strong>Pagination:</strong> 50 items per page in UI</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
