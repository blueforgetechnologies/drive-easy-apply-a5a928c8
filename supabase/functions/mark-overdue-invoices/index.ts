import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

/**
 * Scheduled function to mark invoices as overdue.
 * Runs daily and updates invoices where:
 * - status = 'sent'
 * - due_date < today
 * - balance_due > 0
 * 
 * This function is secured via x-cron-secret header validation.
 * Configure CRON_SECRET in your Supabase secrets.
 * 
 * Scheduling:
 * Use Supabase pg_cron + pg_net to call this function daily:
 * 
 * SELECT cron.schedule(
 *   'mark-overdue-invoices-daily',
 *   '0 6 * * *',  -- 6 AM daily
 *   $$
 *   SELECT net.http_post(
 *     url := 'https://vvbdmjjovzcfmfqywoty.supabase.co/functions/v1/mark-overdue-invoices',
 *     headers := '{"Content-Type": "application/json", "x-cron-secret": "YOUR_CRON_SECRET"}'::jsonb,
 *     body := '{}'::jsonb
 *   ) AS request_id;
 *   $$
 * );
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate cron secret
    const cronSecret = Deno.env.get('CRON_SECRET');
    const providedSecret = req.headers.get('x-cron-secret');
    
    if (!cronSecret) {
      console.error('[mark-overdue-invoices] CRON_SECRET not configured');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Server configuration error: CRON_SECRET not set' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!providedSecret || providedSecret !== cronSecret) {
      console.warn('[mark-overdue-invoices] Invalid or missing x-cron-secret header');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Unauthorized: Invalid or missing x-cron-secret' 
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const today = new Date().toISOString().split('T')[0];
    
    console.log(`[mark-overdue-invoices] Running overdue check for date: ${today}`);

    // Find and update invoices that are now overdue
    const { data: overdueInvoices, error: selectError } = await adminClient
      .from('invoices')
      .select('id, invoice_number, customer_name, due_date, balance_due')
      .eq('status', 'sent')
      .lt('due_date', today)
      .gt('balance_due', 0);

    if (selectError) {
      throw new Error(`Failed to query invoices: ${selectError.message}`);
    }

    const count = overdueInvoices?.length || 0;
    console.log(`[mark-overdue-invoices] Found ${count} invoices to mark as overdue`);

    if (count > 0) {
      const invoiceIds = overdueInvoices!.map((inv: any) => inv.id);
      
      const { error: updateError } = await adminClient
        .from('invoices')
        .update({ 
          status: 'overdue',
          updated_at: new Date().toISOString()
        })
        .in('id', invoiceIds);

      if (updateError) {
        throw new Error(`Failed to update invoices: ${updateError.message}`);
      }

      console.log(`[mark-overdue-invoices] Successfully marked ${count} invoices as overdue:`);
      overdueInvoices!.forEach((inv: any) => {
        console.log(`  - Invoice ${inv.invoice_number} (${inv.customer_name}) - Due: ${inv.due_date}, Balance: $${inv.balance_due}`);
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        marked_overdue: count,
        date_checked: today,
        invoices: overdueInvoices?.map((inv: any) => ({
          invoice_number: inv.invoice_number,
          customer_name: inv.customer_name,
          due_date: inv.due_date
        })) || []
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[mark-overdue-invoices] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
