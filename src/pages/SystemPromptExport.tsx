import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";

const SystemPromptExport = () => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-white text-black p-8 print:p-4">
      {/* Print/Download buttons - hidden when printing */}
      <div className="flex gap-2 mb-6 print:hidden sticky top-0 bg-white py-4 border-b">
        <Button onClick={handlePrint} className="gap-2">
          <Printer className="h-4 w-4" />
          Print / Save as PDF
        </Button>
        <p className="text-sm text-muted-foreground self-center ml-4">
          Use your browser's "Save as PDF" option when printing
        </p>
      </div>

      <article className="max-w-4xl mx-auto prose prose-sm">
        <h1 className="text-3xl font-bold mb-2">Transportation Management Software (TMS)</h1>
        <h2 className="text-xl text-gray-600 mb-8">Complete System Prompt for AI-Assisted Development</h2>
        
        <hr className="my-6" />

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">1. Project Overview</h2>
          <p>Build a comprehensive Transportation Management Software (TMS) for managing trucking company operations. The system should be a Progressive Web App (PWA) built with React, TypeScript, Vite, Tailwind CSS, and Supabase for backend services.</p>
          
          <h3 className="text-lg font-semibold mt-4">Core Technology Stack:</h3>
          <ul className="list-disc pl-6">
            <li>Frontend: React 18+, TypeScript, Vite, Tailwind CSS</li>
            <li>UI Components: shadcn/ui component library</li>
            <li>Backend: Supabase (PostgreSQL, Edge Functions, Auth, Storage)</li>
            <li>Maps: Mapbox GL JS for fleet tracking and route visualization</li>
            <li>Real-time: Supabase Realtime for live updates</li>
            <li>PWA: vite-plugin-pwa for installable mobile app</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">2. Core Modules</h2>
          
          <h3 className="text-lg font-semibold mt-4">2.1 Load Hunter (Email-Based Load Matching)</h3>
          <p>Automated system for matching incoming freight loads from email feeds to available trucks.</p>
          <ul className="list-disc pl-6">
            <li>Gmail integration via Pub/Sub push notifications for real-time email ingestion</li>
            <li>Queue-based email processing (two-stage: fast ingestion → batch processing)</li>
            <li>Sylectus email parsing for load details extraction</li>
            <li>Hunt Plans: User-defined search criteria (pickup location, radius, vehicle types, dates)</li>
            <li>Multi-truck matching: One load can match multiple hunt plans simultaneously</li>
            <li>Geographic matching using geocoded coordinates and Haversine distance calculation</li>
            <li>Tabs: Unreviewed, Skipped, Waitlist, My Bids, Undecided, Missed, All, Issues</li>
            <li>15-minute missed load threshold, 30-minute auto-deactivation</li>
            <li>Midnight Eastern Time daily reset for skipped loads</li>
            <li>Audio alerts for new incoming loads</li>
            <li>Real-time presence tracking (see who else is viewing same load)</li>
            <li>Bid email composition with personalized greetings and company branding</li>
            <li>Dispatcher metrics tracking (bids sent, skip rate, actions)</li>
          </ul>

          <h3 className="text-lg font-semibold mt-4">2.2 Fleet/Asset Management</h3>
          <ul className="list-disc pl-6">
            <li>Vehicle CRUD with comprehensive fields (VIN, unit number, year, make, model, dimensions)</li>
            <li>Samsara telematics integration for real-time location, speed, odometer</li>
            <li>Vehicle status: Moving/Stopped/Idling with color-coded display</li>
            <li>Maintenance reminders by mileage or date thresholds</li>
            <li>Insurance and registration expiration tracking</li>
            <li>Vehicle-to-dispatcher assignment management</li>
            <li>Location history tracking with playback visualization</li>
            <li>Fuel type, efficiency (MPG), tank capacity for cost calculations</li>
          </ul>

          <h3 className="text-lg font-semibold mt-4">2.3 Map/Fleet Tracking</h3>
          <ul className="list-disc pl-6">
            <li>Real-time fleet map showing all vehicle positions</li>
            <li>Interactive sidebar with vehicle list (click to center on vehicle)</li>
            <li>Weather overlay integration</li>
            <li>Vehicle history playback for selected date ranges</li>
            <li>30-second auto-refresh for vehicle positions</li>
            <li>Custom markers with vehicle unit numbers and status indicators</li>
          </ul>

          <h3 className="text-lg font-semibold mt-4">2.4 Load Management</h3>
          <ul className="list-disc pl-6">
            <li>Load CRUD with status workflow: Draft → Booked → Dispatched → Loaded → In Transit → Delivered → Completed</li>
            <li>Multi-stop support with stop-level status tracking</li>
            <li>Route visualization on Mapbox with pickup (green) and delivery (blue) markers</li>
            <li>Route optimization with HOS (Hours of Service) compliance calculations</li>
            <li>Break point markers for required driver rest stops</li>
            <li>Fuel cost and CO₂ emissions estimates based on route distance</li>
            <li>Assignment section: Customer, Carrier, Vehicle, Driver, Dispatcher</li>
            <li>Quick-add dialogs for creating new entities from load detail</li>
            <li>Bulk operations: multi-select, status updates, driver/vehicle assignment, CSV export</li>
            <li>Document attachments (BOL, POD) per stop</li>
            <li>Load expenses tracking</li>
          </ul>

          <h3 className="text-lg font-semibold mt-4">2.5 Drivers Management</h3>
          <ul className="list-disc pl-6">
            <li>Driver application system with invite-based access control</li>
            <li>Multi-step application form: Personal Info, License, Employment History, Emergency Contacts, Policy Acknowledgments, Document Upload</li>
            <li>Application status tracking: Draft, Submitted, Under Review, Approved, Rejected</li>
            <li>Driver detail view with comprehensive profile fields</li>
            <li>Vehicle assignment to drivers</li>
          </ul>

          <h3 className="text-lg font-semibold mt-4">2.6 Dispatchers Management</h3>
          <ul className="list-disc pl-6">
            <li>Dispatcher CRUD with pay percentage, assigned trucks</li>
            <li>License information and emergency contacts</li>
            <li>Role-based access (Admin vs My Trucks mode in Load Hunter)</li>
            <li>Performance metrics: bids sent, skip rate, actions</li>
          </ul>

          <h3 className="text-lg font-semibold mt-4">2.7 Carriers Management</h3>
          <ul className="list-disc pl-6">
            <li>Carrier CRUD with FMCSA/SaferWeb integration</li>
            <li>Auto-populate carrier data from DOT/MC number lookup</li>
            <li>Safer Status and Safety Rating with color-coded badges</li>
            <li>Daily 8 AM ET automatic sync from FMCSA</li>
            <li>Manual refresh button for on-demand updates</li>
            <li>Alert badges for carriers with compliance issues</li>
          </ul>

          <h3 className="text-lg font-semibold mt-4">2.8 Customers Management</h3>
          <ul className="list-disc pl-6">
            <li>Customer CRUD (invoice recipients: customers or factoring companies)</li>
            <li>Auto-creation from Load Hunter email broker data</li>
            <li>Contact information, payment terms, credit limits</li>
            <li>Factoring approval status</li>
          </ul>

          <h3 className="text-lg font-semibold mt-4">2.9 Accounting Module</h3>
          <ul className="list-disc pl-6">
            <li>Invoices: Create, send, track payment status (Draft, Sent, Paid, Cancelled)</li>
            <li>Link completed loads as invoice line items</li>
            <li>Settlements: Driver pay calculations (per mile, percentage, fixed salary)</li>
            <li>Audit Logs: System-wide change tracking with user, timestamp, old/new values</li>
          </ul>

          <h3 className="text-lg font-semibold mt-4">2.10 Maintenance Module</h3>
          <ul className="list-disc pl-6">
            <li>Maintenance records with service date, type, cost, vendor</li>
            <li>Maintenance reminders by mileage threshold or due date</li>
            <li>Dynamic remaining miles calculation using Samsara odometer</li>
            <li>Red highlighting for overdue maintenance in asset list</li>
          </ul>

          <h3 className="text-lg font-semibold mt-4">2.11 Settings Module</h3>
          <ul className="list-disc pl-6">
            <li>Company Profile: Name, address, DOT/MC numbers, logo</li>
            <li>Users Management: Invite, role assignment</li>
            <li>Roles & Permissions: Role Builder with granular tab/feature permissions</li>
            <li>Locations: Pickup/delivery point management</li>
            <li>Integrations Monitoring: Health status of external APIs (Samsara, FMCSA, Mapbox, etc.)</li>
          </ul>

          <h3 className="text-lg font-semibold mt-4">2.12 Additional Features</h3>
          <ul className="list-disc pl-6">
            <li>Load Analytics: Email volume stats, peak hours, busiest days (Eastern Time)</li>
            <li>Freight Fit Calculator: AI-powered dimension parsing from text/images</li>
            <li>Screen Sharing: WebRTC-based remote support tool</li>
            <li>Changelog: Permanent documentation of system changes</li>
            <li>Usage Costs: Mapbox, AI, email tracking</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">3. Database Schema (Key Tables)</h2>
          <pre className="bg-gray-100 p-4 rounded text-xs overflow-x-auto">
{`-- Core Tables
vehicles (id, vehicle_number, vin, year, make, model, vehicle_type, status, 
         last_location, speed, odometer, provider_id, fuel_type, fuel_efficiency_mpg,
         insurance_expiration, registration_expiration, dimensions_length/width/height)

applications (id, personal_info, license_info, employment_history, emergency_contacts,
             driving_history, document_upload, status, invite_id, submitted_at)

dispatchers (id, first_name, last_name, email, phone, pay_percentage, assigned_trucks,
            status, user_id, hire_date, license_number)

carriers (id, name, dot_number, mc_number, safer_status, safety_rating, address, phone)

customers (id, name, contact_name, email, phone, address, payment_terms, credit_limit)

loads (id, load_number, status, pickup_city/state/zip, delivery_city/state/zip,
      pickup_date, delivery_date, rate, assigned_vehicle_id, assigned_driver_id,
      customer_id, carrier_id, equipment_type, cargo_weight)

load_stops (id, load_id, stop_type, stop_sequence, location_city/state/zip,
           scheduled_date, status, actual_arrival, actual_departure)

-- Load Hunter Tables
hunt_plans (id, vehicle_id, plan_name, zip_code, pickup_radius, destination_zip,
           destination_radius, vehicle_size, available_date, enabled, floor_load_id)

load_emails (id, email_id, from_email, subject, body_text, parsed_data, status,
            received_at, expires_at, has_issues)

load_hunt_matches (id, load_email_id, hunt_plan_id, vehicle_id, distance_miles,
                  match_score, match_status, is_active, matched_at)

match_action_history (id, match_id, action_type, dispatcher_id, dispatcher_name, created_at)

missed_loads_history (id, load_email_id, match_id, vehicle_id, missed_at, reset_at)

-- Supporting Tables
vehicle_location_history (id, vehicle_id, latitude, longitude, speed, odometer, recorded_at)
maintenance_records (id, asset_id, maintenance_type, service_date, cost, odometer)
invoices (id, invoice_number, customer_name, total_amount, status, due_date)
settlements (id, driver_id, period_start, period_end, gross_pay, deductions, net_pay)
audit_logs (id, entity_type, entity_id, action, field_name, old_value, new_value, user_id)
geocode_cache (id, location_key, latitude, longitude, city, state, hit_count)
email_queue (id, gmail_message_id, status, attempts, last_error, queued_at)`}
          </pre>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">4. Edge Functions</h2>
          <ul className="list-disc pl-6">
            <li><strong>gmail-webhook</strong>: Receives Gmail Pub/Sub notifications, queues emails</li>
            <li><strong>process-email-queue</strong>: Batch processes queued emails with parsing and matching</li>
            <li><strong>fetch-gmail-loads</strong>: Fallback polling for Gmail (if Pub/Sub fails)</li>
            <li><strong>sync-vehicles-samsara</strong>: Syncs vehicle data from Samsara API (runs every minute)</li>
            <li><strong>capture-vehicle-locations</strong>: Saves vehicle positions to history table</li>
            <li><strong>fetch-carrier-data</strong>: FMCSA lookup for carrier safety data</li>
            <li><strong>sync-carriers-fmcsa</strong>: Daily carrier safety status sync</li>
            <li><strong>send-bid-email</strong>: Sends formatted bid emails via Resend</li>
            <li><strong>send-driver-invite</strong>: Sends driver application invitations</li>
            <li><strong>optimize-route</strong>: Route optimization with HOS calculations</li>
            <li><strong>get-mapbox-token</strong>: Securely provides Mapbox access token</li>
            <li><strong>get-weather</strong>: Weather data for map overlay</li>
            <li><strong>parse-freight-dimensions</strong>: AI-powered dimension extraction</li>
            <li><strong>check-integrations</strong>: Health check for external API connections</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">5. Critical Business Rules</h2>
          
          <h3 className="text-lg font-semibold mt-4">Load Hunter Timing:</h3>
          <ul className="list-disc pl-6">
            <li>15 minutes: Unacted match copied to Missed tab</li>
            <li>30 minutes: Match deactivated from Unreviewed</li>
            <li>Midnight ET: Daily reset of skipped matches</li>
            <li>Hunt enablement: 15-minute backfill from current time</li>
          </ul>

          <h3 className="text-lg font-semibold mt-4">Data Integrity:</h3>
          <ul className="list-disc pl-6">
            <li>Broker email is mandatory in all Sylectus emails</li>
            <li>Truck information must persist across all Load Hunter tabs</li>
            <li>Skipped tab shows only manual skips, not auto-deactivated matches</li>
            <li>Zero pending email backlog is critical business requirement</li>
          </ul>

          <h3 className="text-lg font-semibold mt-4">Security:</h3>
          <ul className="list-disc pl-6">
            <li>Driver applications require valid invite tokens</li>
            <li>RLS policies on all tables for proper data isolation</li>
            <li>Map load tracking restricted to user's own data</li>
            <li>Production domain (blueforgetechnologies.org) for all external links</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">6. External Integrations</h2>
          <ul className="list-disc pl-6">
            <li><strong>Samsara</strong>: Vehicle telematics (location, speed, odometer, status)</li>
            <li><strong>Gmail API + Pub/Sub</strong>: Real-time email notifications for load emails</li>
            <li><strong>FMCSA/SaferWeb</strong>: Carrier safety data lookup</li>
            <li><strong>Mapbox</strong>: Maps, geocoding, directions, route optimization</li>
            <li><strong>Resend</strong>: Transactional email sending (bids, invites)</li>
            <li><strong>Lovable AI</strong>: AI-powered features (dimension parsing, data extraction)</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">7. UI/UX Requirements</h2>
          <ul className="list-disc pl-6">
            <li>Compact, modern design with space optimization</li>
            <li>Responsive design with mobile-optimized PWA</li>
            <li>Tab-based navigation with alert badges for attention items</li>
            <li>Persistent header across all pages</li>
            <li>Dark/light mode support via design system tokens</li>
            <li>Status color coding: green (authorized/good), red (not authorized/issues), orange (warnings)</li>
            <li>Real-time updates without page refresh</li>
            <li>Bulk operations with multi-select patterns</li>
            <li>Quick-add dialogs for creating related entities</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">8. Scheduled Jobs (pg_cron)</h2>
          <ul className="list-disc pl-6">
            <li>sync-vehicles-samsara: Every 1 minute</li>
            <li>capture-vehicle-locations: Every 1 minute</li>
            <li>process-email-queue: Every 20 seconds</li>
            <li>sync-carriers-fmcsa: Daily at 8 AM ET</li>
            <li>reset-missed-loads: Daily at midnight ET</li>
            <li>snapshot-email-volume: Hourly</li>
            <li>snapshot-geocode-stats: Daily</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">9. Scaling Considerations</h2>
          <ul className="list-disc pl-6">
            <li>Target: 5,000 concurrent active hunts (50 hunts × 100 customers)</li>
            <li>Queue-based email processing to prevent connection pool exhaustion</li>
            <li>Cursor-based matching (floor_load_id) for forward-only processing</li>
            <li>Geocode caching to minimize API calls</li>
            <li>Server-side filtering via database views for large datasets</li>
            <li>Supabase Enterprise tier for high-volume operations</li>
          </ul>
        </section>

        <footer className="mt-12 pt-6 border-t text-sm text-gray-500">
          <p>Generated from TMS Application • {new Date().toLocaleDateString()}</p>
          <p>This document serves as a comprehensive system prompt for AI-assisted development of the Transportation Management Software.</p>
        </footer>
      </article>
    </div>
  );
};

export default SystemPromptExport;
