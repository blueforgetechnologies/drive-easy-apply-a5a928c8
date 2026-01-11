# Routes Index

**Generated:** 2026-01-11

---

## Public Routes
| Path | Component | Purpose |
|------|-----------|---------|
| `/` | Index | Landing page |
| `/auth` | Auth | Login/signup |
| `/apply/:inviteId` | Apply | Driver application |
| `/install` | Install | PWA install |

---

## Dashboard Routes (Authenticated)
| Path | Component | Feature Gate |
|------|-----------|--------------|
| `/dashboard` | Dashboard | - |
| `/dashboard/map` | MapTab | map_view |
| `/dashboard/load-hunter` | LoadHunterTab | load_hunter_enabled |
| `/dashboard/loads` | LoadsTab | - |
| `/dashboard/load/:id` | LoadDetail | - |
| `/dashboard/fleet-financials` | FleetFinancialsTab | fleet_financials |
| `/dashboard/carrier` | CarrierDashboard | carrier_dashboard |
| `/dashboard/operations` | BusinessManagerTab | operations_module |
| `/dashboard/accounting` | AccountingTab | accounting_module |
| `/dashboard/analytics` | LoadAnalyticsTab | analytics |
| `/dashboard/maintenance` | MaintenanceTab | maintenance_module |
| `/dashboard/settings` | SettingsTab | - |
| `/dashboard/usage` | UsageTab | usage_dashboard |
| `/dashboard/development` | DevelopmentTab | development_tools |
| `/dashboard/inspector` | Inspector | inspector_tools |

---

## Tenant Context
- All `/dashboard/*` routes wrapped in `TenantProvider`
- `effectiveTenant` determines data scope
- Impersonation overrides tenant for platform admins
