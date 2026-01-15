# Customer Onboarding Guide

This guide explains how to onboard new customers (tenants) so they can receive load emails through the system.

## Quick Overview

Each customer gets a **unique email address** that routes their loadboard emails to their account. There are two ways to set this up:

1. **Gmail Plus-Addressing** (Recommended) - Give them an email like `yourloads+acmetrucking@gmail.com`
2. **Custom Inbound Address** - Register their existing email (e.g., `dispatch@acmetrucking.com`) to route to their account

---

## Method 1: Gmail Plus-Addressing (Recommended)

### How It Works

Gmail ignores everything after a `+` in an email address. So emails sent to:
- `yourloads+acme@gmail.com`
- `yourloads+talbi@gmail.com`
- `yourloads+xyz123@gmail.com`

All arrive in the same `yourloads@gmail.com` inbox, but our system reads the `+alias` part to route to the correct customer.

### Step-by-Step Setup

1. **Navigate to Customer Onboarding**
   - Go to `/dashboard/admin/customers`
   - Or Platform Admin → Customer Onboarding

2. **Click "Add Customer"**

3. **Enter Customer Info**
   - **MC Number (Optional)**: Enter their MC number and click 🔍 to auto-fill from FMCSA
   - **Company Name**: Required - e.g., "Acme Trucking LLC"
   - **Gmail Alias**: Auto-generated, but you can customize it

4. **Click "Create Customer"**

5. **Copy the Email Address**
   - The table shows their unique email (e.g., `yourloads+acmetrucking123456@gmail.com`)
   - Click to copy it

6. **Give to Customer**
   - Tell the customer to use this email as their **load notification destination** in Sylectus/FullCircle TMS

---

## Method 2: Custom Inbound Address

Use this when a customer already has emails forwarding to a specific address and you want to route them.

### Step-by-Step

1. **Find the Customer** in the Customer Onboarding table

2. **Click "+ Add"** under Custom Addresses

3. **Enter Their Email**
   - e.g., `p.d@talbilogistics.com` or `dispatch@acmetrucking.com`
   - Add optional notes

4. **Click "Add Address"**

Now any email from/to that address will route to the customer's account.

---

## Troubleshooting

### Emails Not Routing

1. **Check if address is registered**
   - View the customer in the table
   - Verify their Gmail alias or custom address is active

2. **Check quarantine**
   - Go to Inspector → Email Routing
   - Look for quarantined emails with "No alias found"

3. **Add the address**
   - If emails are quarantined with a specific `delivered_to_header`, add that as a custom inbound address

### Customer is Paused

- Paused customers don't receive new loads
- Click the Play ▶️ button to resume

### Duplicate Alias Error

- Each alias must be unique
- The system checks availability before creation
- Choose a different alias if taken

---

## Architecture Reference

### How Routing Works

```
Loadboard (Sylectus/FullCircle)
        ↓ sends email to
Gmail Inbox (yourloads@gmail.com)
        ↓ webhook triggers
gmail-webhook Edge Function
        ↓ extracts alias
Routing Decision:
  1. Check +alias in Delivered-To/To headers → tenants.gmail_alias
  2. Fallback: Check from/to address → tenant_inbound_addresses
  3. If no match → quarantine in unroutable_emails
        ↓ if routed
email_queue (with tenant_id)
        ↓ processed by
process-email-queue → Creates load_emails → Matches to hunt_plans
```

### Database Tables

| Table | Purpose |
|-------|---------|
| `tenants` | Customer accounts with `gmail_alias` column |
| `tenant_inbound_addresses` | Custom email addresses mapped to tenants |
| `email_queue` | Incoming emails with `tenant_id` |
| `unroutable_emails` | Quarantined emails that couldn't be routed |

---

## Admin Actions

### Pause/Resume Customer

- **Pause**: Stops processing new emails (existing loads remain)
- **Resume**: Resumes email processing

### View Customer Settings

- Click ⚙️ Settings on any customer
- Adjust rate limits, feature flags, etc.

### Delete Customer

- Not recommended - data is preserved
- Instead, pause the customer

---

## FAQ

**Q: Can a customer have multiple email addresses?**
A: Yes! They have one Gmail alias plus unlimited custom inbound addresses.

**Q: What happens to emails before the address was set up?**
A: They're quarantined in `unroutable_emails`. You can view them in Inspector.

**Q: Can I change a customer's Gmail alias?**
A: Yes, in their tenant settings. But tell the customer to update their loadboard settings.

**Q: How do I know if routing is working?**
A: Check the "Last Email" column - it shows when their last email was received.
