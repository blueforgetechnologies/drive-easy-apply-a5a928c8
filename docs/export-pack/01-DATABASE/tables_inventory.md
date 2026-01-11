# Tables Inventory

**Generated:** 2026-01-11  
**Total Tables:** 91

---

## Tenant-Owned Tables (50)

These tables contain `tenant_id` column and are scoped to individual tenants.

| Table | Purpose | RLS | Key Relationships |
|-------|---------|-----|-------------------|
| `admin_impersonation_sessions` | Platform admin impersonation tracking | ✅ | → tenants |
| `applications` | Driver applications/onboarding | ✅ | → tenants, driver_invites, payees |
| `audit_logs` | Entity change history | ✅ | → tenants |
| `billing_customers` | Stripe customer mapping | ✅ | → tenants |
| `billing_subscriptions` | Subscription records | ✅ | → tenants, plans |
| `broker_credit_checks` | OTR credit check results | ✅ | → tenants, customers |
| `carriers` | Carrier companies | ✅ | → tenants, payees |
| `company_profile` | Tenant company info | ✅ | → tenants, carriers |
| `contacts` | Contact records for entities | ✅ | → tenants |
| `custom_roles` | Custom role definitions | ✅ | → tenants |
| `customers` | Broker/shipper records | ✅ | → tenants |
| `dispatchers` | Dispatcher employees | ✅ | → tenants, payees |
| `driver_invites` | Driver application invites | ✅ | → tenants |
| `email_health_alerts` | Email system alerts | ✅ | → tenants |
| `email_queue` | Gmail message processing queue | ✅ | → tenants |
| `expenses` | Expense records | ✅ | → tenants, expense_categories |
| `feature_flag_audit_log` | Feature flag changes | ✅ | → tenants, feature_flags |
| `gmail_tokens` | Gmail OAuth tokens | ✅ | → tenants |
| `hunt_plans` | Load hunting configurations | ✅ | → tenants, vehicles |
| `invites` | User invitations | ✅ | → tenants |
| `invoices` | Customer invoices | ✅ | → tenants |
| `load_bids` | Bid submissions | ✅ | → tenants |
| `load_documents` | Load-related documents | ✅ | → tenants, loads |
| `load_emails` | Ingested load emails | ✅ | → tenants |
| `load_expenses` | Load-specific expenses | ✅ | → tenants, loads |
| `load_hunt_matches` | Load-to-hunt matches | ✅ | → tenants |
| `load_stops` | Multi-stop load stops | ✅ | → tenants, loads |
| `loads` | Load/shipment records | ✅ | → tenants, customers, vehicles |
| `locations` | Saved locations | ✅ | → tenants |
| `maintenance_records` | Vehicle maintenance | ✅ | → tenants, vehicles |
| `map_load_tracking` | Load map selections | ✅ | → tenants |
| `match_action_history` | Match action audit | ✅ | → tenants |
| `payees` | Payment recipients | ✅ | → tenants |
| `permissions` | Permission definitions | ✅ | → tenants |
| `role_permissions` | Role-permission mapping | ✅ | → tenants |
| `settlements` | Driver settlements | ✅ | → tenants |
| `spend_alerts` | Spending alert configs | ✅ | → tenants |
| `tenant_audit_log` | Tenant config changes | ✅ | → tenants |
| `tenant_feature_access` | User feature grants | ✅ | → tenants |
| `tenant_feature_flags` | Feature flag overrides | ✅ | → tenants, feature_flags |
| `tenant_integrations` | Integration configs | ✅ | → tenants |
| `tenant_invitations` | Tenant join invites | ✅ | → tenants |
| `tenant_preferences` | Tenant settings | ✅ | → tenants |
| `tenant_rate_limits` | API rate limit tracking | ✅ | → tenants |
| `tenant_users` | User-tenant membership | ✅ | → tenants, users |
| `unreviewed_matches` | Pending match reviews | ✅ | → tenants |
| `usage_meter_events` | Usage tracking events | ✅ | → tenants |
| `user_custom_roles` | User role assignments | ✅ | → tenants |
| `vehicle_integrations` | Vehicle integration links | ✅ | → tenants |
| `vehicles` | Fleet vehicles | ✅ | → tenants, carriers |

---

## Global/Shared Tables (41)

These tables are not tenant-scoped (shared across all tenants or system-level).

| Table | Purpose | RLS | Notes |
|-------|---------|-----|-------|
| `ai_usage_tracking` | AI API usage | ✅ | Per-user tracking |
| `carrier_rate_history` | Load carrier rate changes | ✅ | Links to loads |
| `cleanup_job_logs` | Maintenance job logs | ✅ | System-level |
| `directions_api_tracking` | Mapbox directions usage | ✅ | Per-user |
| `email_send_tracking` | Outbound email tracking | ✅ | System-level |
| `email_volume_stats` | Email volume analytics | ✅ | System-level |
| `expense_categories` | Expense category definitions | ✅ | Shared catalog |
| `feature_flags` | Feature flag definitions | ✅ | Global config |
| `gcp_usage_baselines` | GCP cost baselines | ✅ | System-level |
| `geocode_cache` | Geocoding cache | ✅ | Shared cache |
| `geocode_cache_daily_stats` | Cache hit stats | ✅ | System-level |
| `geocoding_api_tracking` | Geocode API usage | ✅ | Per-user |
| `invoice_loads` | Invoice line items | ✅ | Links to invoices |
| `load_emails_archive` | Archived emails | ✅ | System cleanup |
| `load_hunt_matches_archive` | Archived matches | ✅ | System cleanup |
| `loadboard_filters` | Load filter presets | ✅ | Per-user |
| `login_history` | User login records | ✅ | Per-user |
| `mapbox_billing_history` | Mapbox billing | ✅ | System-level |
| `mapbox_monthly_usage` | Monthly map usage | ✅ | System-level |
| `missed_loads_history` | Missed load tracking | ✅ | Links to vehicles |
| `parser_hints` | Email parser hints | ✅ | System-level |
| `pay_structures` | Pay calculation rules | ✅ | Per-user |
| `payment_formulas` | Payment formulas | ✅ | Per-user |
| `plan_features` | Plan feature limits | ✅ | Global config |
| `plans` | Subscription plans | ✅ | Global config |
| `platform_email_config` | Platform email settings | ✅ | System-level |
| `processing_state` | Processing state flags | ✅ | System-level |
| `profiles` | User profiles | ✅ | Per-user |
| `pubsub_tracking` | Gmail Pub/Sub tracking | ✅ | System-level |
| `release_channel_feature_flags` | Channel defaults | ✅ | Global config |
| `screen_share_sessions` | Screen share sessions | ✅ | Per-user |
| `settlement_loads` | Settlement line items | ✅ | Links to settlements |
| `sylectus_type_config` | Sylectus parser config | ✅ | System-level |
| `tenants` | Tenant definitions | ✅ | Core multi-tenant |
| `ui_action_registry` | UI action definitions | ✅ | System-level |
| `user_cost_settings` | Cost calculation prefs | ✅ | Per-user |
| `user_fleet_column_preferences` | UI column prefs | ✅ | Per-user |
| `user_preferences` | User preferences | ✅ | Per-user |
| `user_roles` | User app roles | ✅ | Per-user |
| `vehicle_location_history` | GPS location history | ✅ | Links to vehicles |
| `worker_config` | Worker settings | ✅ | System-level |
| `worker_heartbeats` | Worker health | ✅ | System-level |

---

## Notes

1. **All tables have RLS enabled** - No publicly accessible tables
2. **Tenant-owned tables use membership checks** - `is_tenant_member()` or `can_access_tenant()`
3. **Global tables use authentication checks** - Require valid JWT at minimum
4. **Platform admin bypass** - `is_platform_admin()` allows cross-tenant access
