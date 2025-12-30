# Feature Gate Verification – Developer Notes

> **Owner:** Platform / Release Control  
> **Status:** 🔒 Locked – do not refactor casually

---

## Purpose

This document explains why the feature-gate verification system is structured the way it is and what **must not be changed** to avoid regressions such as global error popups or false failures.

**This applies to:**
- Inspector → Release Control
- Live Feature Gate Verification
- All feature-gated Supabase Edge Functions

---

## Key Principle

> ### A 403 from a feature gate is a valid expected result, not an error.

The UI, SDK, and browser must **never** treat expected 403 responses as runtime failures.

---

## Critical Rules (Do Not Break)

### 1. Never let the browser receive raw 403 responses for verification tests

- `supabase.functions.invoke()` treats non-2xx responses as errors
- Lovable's global error boundary will display a **Runtime Error** popup if a 403 escapes

**Solution used:**

- All verification calls go through an admin-only proxy (`inspector-invoke-proxy`)
- The proxy **always** returns HTTP 200
- The real status is returned inside JSON:

```json
{ "status": 403, "body": { ... } }
```

- The UI evaluates pass/fail based on `status`, not HTTP code.

---

### 2. Feature-gated Edge Functions MUST return structured JSON on denial

All feature-gated functions must return:

```typescript
return new Response(
  JSON.stringify({
    error: 'Feature disabled',
    flag_key,
    reason: 'release_channel',
    channel
  }),
  { status: 403 }
);
```

**Never throw. Never allow uncaught exceptions.**

---

### 3. `assertFeatureEnabled` must never throw

The shared feature gate helper:

- Wraps everything in `try/catch`
- Uses `.maybeSingle()` instead of `.single()`
- Always returns `{ allowed, response? }`

> **If this function throws, it is a bug.**

---

### 4. Never use `JSON.stringify()` directly in render paths

This will crash the Inspector UI if the payload contains:

- non-serializable objects
- Response-like objects
- circular references

**Always use:**

```typescript
safeStringify(value)
```

This helper must:
- **never throw**
- gracefully stringify unknown payloads

---

### 5. Verification logic expectations

| Tenant Channel    | Expected Result |
|-------------------|-----------------|
| `general`         | 403 Blocked     |
| `pilot`           | 200 Allowed     |
| `internal`        | 200 Allowed     |
| tenant override   | Override wins   |

A test **passes** when the result matches the expected channel behavior.

---

## Why This Matters

**Without these rules:**
- Lovable shows runtime error overlays
- Expected behavior looks like failure
- Feature rollout testing becomes unreliable

**With these rules:**
- Feature gating is provable
- Rollouts are safe
- Inspectors remain stable

---

## Pre-Merge Checklist

Before merging any changes to this system, verify:

- [ ] General tenant → all tests return 403 (PASS)
- [ ] Pilot tenant → all tests return 200 (PASS)
- [ ] No runtime popup appears
- [ ] Inspector renders payload safely

> **If any of the above fail, revert immediately.**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Inspector UI (Release Control)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐    HTTP 200 always    ┌──────────────────┐   │
│   │ Verification │ ──────────────────▶  │ invoke-proxy     │   │
│   │ Test Runner  │                      │ (Edge Function)  │   │
│   └─────────────┘                       └────────┬─────────┘   │
│         │                                        │              │
│         │ { status: 403, body: {...} }           │              │
│         ▼                                        ▼              │
│   ┌─────────────┐                       ┌──────────────────┐   │
│   │ safeStringify│                      │ Target Function  │   │
│   │ (no throws)  │                      │ (geocode, etc)   │   │
│   └─────────────┘                       └────────┬─────────┘   │
│                                                  │              │
│                                                  ▼              │
│                                         ┌──────────────────┐   │
│                                         │assertFeatureEnabled│  │
│                                         │ (never throws)   │   │
│                                         └──────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Related Files

| File | Purpose |
|------|---------|
| `supabase/functions/inspector-invoke-proxy/index.ts` | HTTP 200 wrapper proxy |
| `supabase/functions/_shared/assertFeatureEnabled.ts` | Feature gate helper |
| `src/components/inspector/ReleaseControlTab.tsx` | Verification UI |

---

## Quick Reference

```typescript
// ✅ CORRECT: Use proxy for verification
const result = await invokeEdgeFunctionRaw('inspector-invoke-proxy', token, {
  endpoint: 'geocode',
  body: testPayload,
  overrideTenantId: tenantId
});
// result.status contains actual status (200 or 403)

// ❌ WRONG: Direct invoke causes error overlays
const { data, error } = await supabase.functions.invoke('geocode', {...});
// 403 triggers global error handler!
```

```typescript
// ✅ CORRECT: Safe rendering
<pre>{safeStringify(result.body)}</pre>

// ❌ WRONG: Can throw on non-serializable objects
<pre>{JSON.stringify(result.body, null, 2)}</pre>
```
