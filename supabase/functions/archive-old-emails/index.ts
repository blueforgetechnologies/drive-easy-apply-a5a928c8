/**
 * Daily Database Cleanup (Midnight ET)
 * 
 * Consolidates all cleanup tasks into a single daily run:
 * 1. Archive load_emails older than 8 days → load_emails_archive
 * 2. Purge completed/skipped gmail_stubs older than 7 days
 * 3. Purge old email_queue rows (7 days)
 * 4. Purge old pubsub_tracking rows (7 days)
 * 5. Purge old vehicle_location_history (8 days)
 * 6. Auto-archive rejected applications (36h)
 * 7. Purge old load_emails_archive (30 days)
 * 
 * Triggered via pg_cron at midnight ET (5 AM UTC).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing config' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const startTime = Date.now();
  const results: Record<string, { count: number; error?: string }> = {};

  console.log('🧹 Starting daily cleanup (midnight ET)...');

  // 1. Archive load_emails older than 8 days (batched to avoid timeouts)
  try {
    let totalArchived = 0;
    let batchCount = 0;
    const maxBatches = 50; // Safety limit

    while (batchCount < maxBatches) {
      const { data, error } = await supabase.rpc('archive_old_load_emails_batched', { batch_size: 2000 });
      if (error) {
        console.error('❌ Archive batch error:', error.message);
        results['archive_load_emails'] = { count: totalArchived, error: error.message };
        break;
      }
      const archived = data || 0;
      totalArchived += archived;
      batchCount++;
      if (archived === 0) break; // No more to archive
      console.log(`📦 Archived batch ${batchCount}: ${archived} emails (total: ${totalArchived})`);
    }

    results['archive_load_emails'] = { count: totalArchived };
    console.log(`✅ Archived ${totalArchived} load_emails in ${batchCount} batches`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results['archive_load_emails'] = { count: 0, error: msg };
    console.error('❌ Archive error:', msg);
  }

  // 2. Purge completed/skipped gmail_stubs older than 7 days
  try {
    const { data, error } = await supabase
      .from('gmail_stubs')
      .delete()
      .in('status', ['completed', 'skipped'])
      .lt('queued_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .select('id', { count: 'exact', head: true });

    // Use count from response
    const { count, error: countErr } = await supabase
      .from('gmail_stubs')
      .delete()
      .in('status', ['completed', 'skipped'])
      .lt('queued_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    // Since delete doesn't return count easily, use RPC
    const purgeResult = await supabase.rpc('cleanup_gmail_stubs_old');
    results['purge_gmail_stubs'] = { count: purgeResult.data || 0, error: purgeResult.error?.message };
    console.log(`✅ Purged ${purgeResult.data || 0} gmail_stubs`);
  } catch (e) {
    // Fallback: try direct SQL-based cleanup
    results['purge_gmail_stubs'] = { count: 0, error: 'cleanup function may not exist' };
    console.warn('⚠️ gmail_stubs cleanup skipped (RPC may not exist yet)');
  }

  // 3. Cleanup email_queue (7 days)
  try {
    const { data, error } = await supabase.rpc('cleanup_email_queue');
    results['cleanup_email_queue'] = { count: data || 0, error: error?.message };
    console.log(`✅ Cleaned ${data || 0} email_queue rows`);
  } catch (e) {
    results['cleanup_email_queue'] = { count: 0, error: String(e) };
  }

  // 4. Cleanup pubsub_tracking (7 days)
  try {
    const { data, error } = await supabase.rpc('cleanup_pubsub_tracking');
    results['cleanup_pubsub_tracking'] = { count: data || 0, error: error?.message };
    console.log(`✅ Cleaned ${data || 0} pubsub_tracking rows`);
  } catch (e) {
    results['cleanup_pubsub_tracking'] = { count: 0, error: String(e) };
  }

  // 5. Cleanup vehicle_location_history (8 days)
  try {
    const { data, error } = await supabase.rpc('cleanup_vehicle_location_history');
    results['cleanup_vehicle_location_history'] = { count: data || 0, error: error?.message };
    console.log(`✅ Cleaned ${data || 0} vehicle_location_history rows`);
  } catch (e) {
    results['cleanup_vehicle_location_history'] = { count: 0, error: String(e) };
  }

  // 6. Auto-archive rejected applications (36h)
  try {
    const { error } = await supabase.rpc('auto_archive_rejected_applications');
    results['archive_rejected_applications'] = { count: 0, error: error?.message };
    if (!error) console.log('✅ Auto-archived rejected applications');
  } catch (e) {
    results['archive_rejected_applications'] = { count: 0, error: String(e) };
  }

  // 7. Purge old load_emails_archive (30 days)
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('load_emails_archive')
      .delete()
      .lt('archived_at', cutoff);

    results['purge_old_archives'] = { count: 0, error: error?.message };
    if (!error) console.log('✅ Purged load_emails_archive older than 30 days');
  } catch (e) {
    results['purge_old_archives'] = { count: 0, error: String(e) };
  }

  // 8. Cleanup tenant rate limits (2 days)
  try {
    const { data, error } = await supabase.rpc('cleanup_tenant_rate_limits');
    results['cleanup_rate_limits'] = { count: data || 0, error: error?.message };
    console.log(`✅ Cleaned ${data || 0} rate limit rows`);
  } catch (e) {
    results['cleanup_rate_limits'] = { count: 0, error: String(e) };
  }

  // 9. Purge old storage files from email-payloads (60 days)
  try {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    let totalDeleted = 0;

    // List and delete in batches from email-payloads bucket
    for (let offset = 0; offset < 5000; offset += 100) {
      const { data: files, error } = await supabase.storage
        .from('email-payloads')
        .list('', { limit: 100, offset, sortBy: { column: 'created_at', order: 'asc' } });

      if (error || !files || files.length === 0) break;

      const oldFiles = files.filter(f => {
        const created = new Date(f.created_at);
        return created < cutoff;
      });

      if (oldFiles.length === 0) break;

      const paths = oldFiles.map(f => f.name);
      const { error: delError } = await supabase.storage
        .from('email-payloads')
        .remove(paths);

      if (delError) {
        console.error('❌ Storage purge error:', delError.message);
        break;
      }
      totalDeleted += paths.length;
    }

    results['purge_storage_payloads'] = { count: totalDeleted };
    console.log(`✅ Purged ${totalDeleted} old email-payload files`);
  } catch (e) {
    results['purge_storage_payloads'] = { count: 0, error: String(e) };
  }

  // 10. Purge old storage files from email-content bucket (60 days)
  try {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    let totalDeleted = 0;

    // email-content uses subdirectories like gmail/{hash_prefix}/
    // List top-level folders first
    const { data: providers } = await supabase.storage
      .from('email-content')
      .list('', { limit: 100 });

    if (providers) {
      for (const provider of providers) {
        if (!provider.id) continue; // skip files, process folders
        const { data: prefixes } = await supabase.storage
          .from('email-content')
          .list(provider.name, { limit: 1000 });

        if (!prefixes) continue;

        for (const prefix of prefixes) {
          const folderPath = `${provider.name}/${prefix.name}`;
          const { data: files } = await supabase.storage
            .from('email-content')
            .list(folderPath, { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } });

          if (!files) continue;

          const oldFiles = files.filter(f => {
            const created = new Date(f.created_at);
            return created < cutoff;
          });

          if (oldFiles.length > 0) {
            const paths = oldFiles.map(f => `${folderPath}/${f.name}`);
            const { error: delError } = await supabase.storage
              .from('email-content')
              .remove(paths);

            if (!delError) totalDeleted += paths.length;
          }
        }
      }
    }

    results['purge_storage_content'] = { count: totalDeleted };
    console.log(`✅ Purged ${totalDeleted} old email-content files`);
  } catch (e) {
    results['purge_storage_content'] = { count: 0, error: String(e) };
  }

  // Get final table sizes for reporting
  const [mainCount, archiveCount] = await Promise.all([
    supabase.from('load_emails').select('id', { count: 'exact', head: true }),
    supabase.from('load_emails_archive').select('id', { count: 'exact', head: true })
  ]);

  const elapsed = Date.now() - startTime;
  
  const summary = {
    success: true,
    elapsed_ms: elapsed,
    results,
    table_counts: {
      load_emails: mainCount.count || 0,
      load_emails_archive: archiveCount.count || 0,
    },
  };

  console.log(`🧹 Daily cleanup complete in ${elapsed}ms:`, JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
