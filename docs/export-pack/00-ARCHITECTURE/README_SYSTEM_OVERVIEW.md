# TMS System Overview

**Generated:** 2026-01-11  
**Version:** 1.0

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React/Vite)                     │
│  - React 18 + TypeScript + TailwindCSS                              │
│  - Shadcn/ui components                                             │
│  - React Query for data fetching                                    │
│  - React Router v6 for navigation                                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      LOVABLE CLOUD (Supabase)                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │ Auth (Supabase) │  │  PostgreSQL DB  │  │   Edge Functions    │ │
│  │ - Email/Pass    │  │  - 91 tables    │  │   - 68 functions    │ │
│  │ - JWT tokens    │  │  - RLS enabled  │  │   - Deno runtime    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘ │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │ Realtime        │  │ Storage Buckets │  │   Secrets Vault     │ │
│  │ (not enabled)   │  │ - company-logos │  │   - 15 secrets      │ │
│  │                 │  │ - load-documents│  │                     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       EXTERNAL INTEGRATIONS                          │
│  - Samsara (vehicle telematics)                                     │
│  - Gmail API (email ingestion via Pub/Sub)                          │
│  - Mapbox (geocoding, maps)                                         │
│  - Stripe (billing - partial)                                       │
│  - OTR Solutions (broker credit checks)                             │
│  - FMCSA (carrier data)                                             │
│  - Resend (transactional email)                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Multi-Tenancy Model

### Tenant Structure

| Entity | Description |
|--------|-------------|
| **Tenant** | An organization (trucking company) |
| **Tenant User** | User membership in a tenant with role |
| **Platform Admin** | Super-admin across all tenants |

### How `tenant_id` is Derived

**UI (Client-Side):**
1. User logs in → `TenantContext` loads their memberships from `tenant_users`
2. Priority: localStorage → single membership → "default" slug → first membership
3. `effectiveTenant` is used for all queries (includes impersonation override)
4. `useTenantId()` hook returns `effectiveTenant?.id`

**Edge Functions (Server-Side):**
1. `assertTenantAccess(authHeader, targetTenantId)` validates:
   - JWT is valid
   - User has active membership in target tenant OR is platform admin
2. `deriveTenantFromJWT(authHeader)` extracts tenant from first active membership
3. Service-role client only used AFTER access is verified

**RLS (Database):**
- Most policies use `is_tenant_member(auth.uid(), tenant_id)` or `can_access_tenant(auth.uid(), tenant_id)`
- Platform admins pass via `is_platform_admin(auth.uid())`

---

## 3. Release Channels

### Current Channels

| Channel | Purpose | Tenants |
|---------|---------|---------|
| `internal` | Development/testing | Default Tenant |
| `pilot` | Early adopter testing | Talbi Logistics LLC |
| `general` | Production release | Future tenants |

### How Channels Work

1. **Tenant has `release_channel` column** in `tenants` table
2. **Feature flags** have per-channel defaults in `release_channel_feature_flags` table
3. **Resolution order:**
   - Killswitch (if globally OFF → always OFF)
   - Tenant override (`tenant_feature_flags`)
   - Channel default (`release_channel_feature_flags`)
   - Global default (`feature_flags.default_enabled`)

### Channel-Based Feature Visibility

| Feature | internal | pilot | general |
|---------|----------|-------|---------|
| Load Hunter | ✅ | ✅ | ❌ |
| Analytics | ✅ | ❌ | ❌ |
| AI Parsing | ✅ | ❌ | ❌ |
| Usage Dashboard | ✅ | ❌ | ❌ |
| Inspector | ✅ (admin) | ❌ | ❌ |

---

## 4. Key Components

### Frontend Context Providers

| Provider | Purpose |
|----------|---------|
| `TenantProvider` | Manages current/effective tenant, impersonation |
| `ImpersonationContext` | Platform admin tenant impersonation |

### Key Hooks

| Hook | Purpose |
|------|---------|
| `useTenantId()` | Returns effective tenant ID for queries |
| `useTenantContext()` | Full tenant context access |
| `useFeatureGate()` | Feature access check (tenant + user level) |
| `useFeatureFlags()` | Raw feature flag resolution |
| `useTenantQuery()` | Tenant-scoped database queries |

### Edge Function Helpers

| Helper | Purpose |
|--------|---------|
| `assertTenantAccess()` | Validates JWT + tenant membership |
| `deriveTenantFromJWT()` | Extracts tenant from user's memberships |
| `assertFeatureEnabled()` | Feature flag gating for functions |
| `assertPlatformAdmin()` | Platform admin check |

---

## 5. Data Flow Example

### Load Creation Flow

```
1. User clicks "New Load" in LoadsTab
2. UI calls useTenantId() → gets effective tenant ID
3. INSERT to loads table with tenant_id
4. RLS policy checks can_access_tenant(auth.uid(), tenant_id)
5. If valid membership → row inserted
6. React Query invalidates loads query
7. New load appears in UI
```

### Load Hunter Email Flow

```
1. Gmail Pub/Sub sends notification to gmail-webhook
2. Webhook queues message in email_queue with tenant_id
3. Worker (process-email-queue) claims batch
4. Calls fetch-gmail-loads per email
5. Parses email → creates load_emails record
6. Matching engine creates load_hunt_matches
7. UI receives matches via React Query
```

---

## 6. Security Layers

| Layer | Mechanism |
|-------|-----------|
| **Authentication** | Supabase Auth (JWT) |
| **Authorization** | RLS policies + tenant membership |
| **API Access** | Edge function access checks |
| **Admin Access** | `is_platform_admin` flag in profiles |
| **Feature Access** | Feature flags + user grants |

---

## 7. Technology Stack

| Category | Technology |
|----------|------------|
| Frontend | React 18, TypeScript, Vite |
| Styling | TailwindCSS, Shadcn/ui |
| State | React Query (TanStack Query) |
| Routing | React Router v6 |
| Backend | Supabase (PostgreSQL, Auth, Edge Functions) |
| Runtime | Deno (Edge Functions) |
| Maps | Mapbox GL JS |
| Charts | Recharts |
| Forms | React Hook Form + Zod |
