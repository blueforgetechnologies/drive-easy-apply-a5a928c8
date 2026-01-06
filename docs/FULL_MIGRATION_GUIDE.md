# Full Migration Guide: Lovable Cloud → Your Supabase Project

## Source Project Confirmation
- **Project Ref**: `vvbdmjjovzcfmfqywoty`
- **URL**: `https://vvbdmjjovzcfmfqywoty.supabase.co`
- **Environment**: Production

---

## 1. DATABASE EXPORT

### Option A: pg_dump (Recommended - Full Export)

Since you don't have direct CLI access to the Lovable Cloud project, you'll need to request a pg_dump from Lovable Support OR use the SQL export below.

**Contact**: support@lovable.dev
**Request**: "Please provide a pg_dump export of project vvbdmjjovzcfmfqywoty including schema, data, RLS policies, functions, triggers, and extensions."

### Option B: SQL Schema Export (You Can Run This)

Run these queries in your target Supabase project's SQL Editor to recreate the schema:

#### Step 1: Enable Extensions

```sql
-- Extensions required
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";
```

#### Step 2: Create Enums

```sql
-- Custom types/enums
CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'dispatcher', 'driver');
CREATE TYPE public.email_source AS ENUM ('sylectus', 'fullcircle', '123loadboard', 'truckstop');
CREATE TYPE public.release_channel AS ENUM ('internal', 'pilot', 'general');
CREATE TYPE public.tenant_status AS ENUM ('active', 'suspended', 'trial', 'churned');
```

#### Step 3: Tables (87 Tables with RLS Enabled)

The full table list includes:
- admin_impersonation_sessions
- ai_usage_tracking
- applications
- audit_logs
- billing_customers
- billing_subscriptions
- carrier_rate_history
- carriers
- cleanup_job_logs
- company_profile
- contacts
- custom_roles
- customers
- directions_api_tracking
- dispatchers
- driver_invites
- email_queue
- email_send_tracking
- email_volume_stats
- expense_categories
- expenses
- feature_flag_audit_log
- feature_flags
- gcp_usage_baselines
- geocode_cache
- geocode_cache_daily_stats
- geocoding_api_tracking
- gmail_tokens
- hunt_plans
- invites
- invoice_loads
- invoices
- load_bids
- load_documents
- load_emails (55,563 rows)
- load_emails_archive
- load_expenses
- load_hunt_matches
- load_hunt_matches_archive
- load_stops
- loadboard_filters
- loads
- locations
- login_history
- maintenance_records
- map_load_tracking
- mapbox_billing_history
- mapbox_monthly_usage
- match_action_history
- missed_loads_history
- parser_hints
- pay_structures
- payees
- payment_formulas
- permissions
- plan_features
- plans
- processing_state
- profiles
- pubsub_tracking
- release_channel_feature_flags
- role_permissions
- screen_share_sessions
- settlement_loads
- settlements
- spend_alerts
- sylectus_type_config
- tenant_audit_log
- tenant_feature_access
- tenant_feature_flags
- tenant_integrations
- tenant_invitations
- tenant_preferences
- tenant_rate_limits
- tenant_users
- tenants (2 rows)
- ui_action_registry
- usage_meter_events
- user_cost_settings
- user_custom_roles
- user_fleet_column_preferences
- user_preferences
- user_roles
- vehicle_integrations
- vehicle_location_history
- vehicles (13 rows)

**To get the full CREATE TABLE statements**, run this in the source project:

```sql
SELECT 
    'CREATE TABLE public.' || tablename || ' (' ||
    string_agg(
        column_name || ' ' || data_type || 
        CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
        CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
        ', '
    ) || ');'
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY tablename
ORDER BY tablename;
```

---

## 2. STORAGE EXPORT

### Buckets to Create

```sql
-- Run in your target Supabase project
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('company-logos', 'company-logos', true, NULL, NULL),
  ('load-documents', 'load-documents', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('email-payloads', 'email-payloads', false, 5242880, ARRAY['application/json']);
```

### Storage Policies

```sql
-- company-logos policies
CREATE POLICY "Allow public read access to company logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-logos');

CREATE POLICY "Allow authenticated users to upload company logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'company-logos');

CREATE POLICY "Allow authenticated users to update company logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'company-logos');

CREATE POLICY "Allow authenticated users to delete company logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'company-logos');

-- load-documents policies
CREATE POLICY "Allow authenticated read access on load-documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'load-documents');

CREATE POLICY "Allow authenticated upload on load-documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'load-documents');

CREATE POLICY "Allow authenticated delete on load-documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'load-documents');

-- email-payloads policies
CREATE POLICY "Service role full access to email payloads"
ON storage.objects FOR ALL
USING (bucket_id = 'email-payloads')
WITH CHECK (bucket_id = 'email-payloads');
```

### File Migration

To migrate files, you'll need to:
1. Download files from source using Supabase Storage API
2. Upload to target using Supabase Storage API

This requires service_role keys for both projects.

---

## 3. AUTH MIGRATION

### Current Auth Users: 8 users

### Option A: Full Migration with Password Hashes (RECOMMENDED)

**Requires Supabase Support involvement**

1. Contact Supabase Support: support@supabase.io
2. Request: "Migration of auth.users including password hashes from project vvbdmjjovzcfmfqywoty to [YOUR_PROJECT_REF]"
3. They will coordinate the secure transfer

### Option B: Force Password Reset (Self-Service)

If you cannot get Supabase Support help:

1. Export user emails from source:
```sql
SELECT id, email, created_at, email_confirmed_at, phone, raw_user_meta_data
FROM auth.users;
```

2. In target project, users will need to:
   - Sign up again, OR
   - Use "Forgot Password" flow

**I recommend Option A** - contact Supabase Support to properly migrate auth users.

---

## 4. EDGE FUNCTIONS

Your edge functions are in `supabase/functions/`. After setting up your target project:

```bash
# Install Supabase CLI
npm install -g supabase

# Login to your Supabase account
supabase login

# Link to your new project
supabase link --project-ref YOUR_NEW_PROJECT_REF

# Deploy all functions
supabase functions deploy
```

### Functions to Deploy (50+)
- admin-get-impersonation-session
- admin-start-impersonation
- admin-stop-impersonation
- admin-tenant-create
- admin-tenant-suspend
- admin-tenant-update
- ai-update-customers
- archive-old-emails
- backfill-customers
- capture-vehicle-locations
- check-integrations
- check-tenant-integrations
- cleanup-stale-data
- debug-tenant-data
- elevenlabs-sfx
- fetch-carrier-data
- fetch-gmail-loads
- fetch-highway-data
- geocode
- get-mapbox-token
- get-vehicle-stats
- get-weather
- gmail-auth
- gmail-tenant-mapping
- gmail-webhook
- inspector-billing
- inspector-feature-flags
- inspector-invoke-proxy
- inspector-load-hunter-health
- inspector-release-control
- inspector-tenants
- inspector-ui-actions
- optimize-route
- parse-freight-dimensions
- parse-rate-confirmation
- platform-rollout-control
- process-email-queue
- reparse-fullcircle-emails
- reset-missed-loads
- samsara-webhook
- send-application
- send-bid-email
- send-dispatcher-login
- send-driver-invite
- send-invite
- send-spend-alert
- send-user-login
- set-tenant-integration
- snapshot-email-volume
- snapshot-geocode-stats
- snapshot-monthly-usage
- stripe-create-checkout-session
- stripe-customer-portal
- stripe-webhook
- sync-carriers-fmcsa
- sync-vehicles-samsara
- tenant-backfill-null
- tenant-counts
- tenant-isolation-audit
- tenant-seed-data
- tenant-wipe-test-data
- test-ai
- test-tenant-integration
- track-invite-open

---

## 5. SECRETS TO CONFIGURE

In your new Supabase project dashboard → Settings → Edge Functions → Secrets:

| Secret Name | Description |
|-------------|-------------|
| SAMSARA_API_KEY | Samsara fleet API key |
| WEATHER_API_KEY | Weather service API key |
| INTEGRATIONS_MASTER_KEY | Master key for integrations |
| LOVABLE_API_KEY | Lovable AI API key |
| ELEVENLABS_API_KEY | ElevenLabs TTS API key |
| RESEND_API_KEY | Resend email API key |
| GMAIL_CLIENT_ID | Google OAuth client ID |
| GMAIL_CLIENT_SECRET | Google OAuth client secret |
| GMAIL_PUBSUB_TOPIC | Gmail Pub/Sub topic |
| VITE_MAPBOX_TOKEN | Mapbox access token |
| CRON_SECRET | Cron job authentication |

---

## 6. CUTOVER STEPS

### Pre-Cutover
1. ✅ Create new Supabase project in your org
2. ✅ Run schema migrations
3. ✅ Create storage buckets + policies
4. ✅ Deploy edge functions
5. ✅ Configure all secrets
6. ✅ Coordinate auth migration with Supabase Support
7. ✅ Test in new environment

### Cutover Day
1. Put app in maintenance mode
2. Final data sync (if doing incremental)
3. Update `.env` in Lovable:
   - `VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY=your_new_anon_key`
4. Redeploy app
5. Test all functionality
6. Remove maintenance mode

### Post-Cutover
1. Monitor for errors
2. Verify all integrations work
3. Update OAuth redirect URLs (Google, etc.)
4. Update webhook URLs (Stripe, Gmail Pub/Sub)

---

## 7. CONFIRMATION

After migration is complete:

- ✅ **Your Supabase project** owns all production data
- ✅ **You control** the service_role key
- ✅ **You manage** auth users
- ✅ **You pay** Supabase directly
- ✅ **Lovable Cloud** no longer controls production data (app will point to YOUR project)

---

## NEXT STEPS

1. **Create your Supabase project** at https://supabase.com/dashboard
2. **Contact Lovable Support** (support@lovable.dev) to request:
   - pg_dump export of project `vvbdmjjovzcfmfqywoty`
   - Storage files export
3. **Contact Supabase Support** (support@supabase.io) for auth user migration
4. **Return here** and I'll help you update the app to point to your new project

---

## DATA SUMMARY (Current State)

| Table | Row Count |
|-------|-----------|
| load_emails | 55,563 |
| customers | ~900 |
| tenants | 2 |
| vehicles | 13 |
| auth.users | 8 |

All 87 tables have RLS enabled.
