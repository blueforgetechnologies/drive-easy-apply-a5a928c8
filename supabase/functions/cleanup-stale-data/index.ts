import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CleanupResult {
  job_name: string;
  records_affected: number;
  success: boolean;
  error_message?: string;
  duration_ms: number;
}

async function runCleanupJob(jobName: string, rpcName: string): Promise<CleanupResult> {
  const startTime = Date.now();
  
  try {
    console.log(`🧹 Starting cleanup job: ${jobName}`);
    
    const { data, error } = await supabase.rpc(rpcName);
    
    if (error) {
      console.error(`❌ ${jobName} failed:`, error);
      return {
        job_name: jobName,
        records_affected: 0,
        success: false,
        error_message: error.message,
        duration_ms: Date.now() - startTime
      };
    }
    
    const count = data || 0;
    console.log(`✅ ${jobName} completed: ${count} records cleaned`);
    
    return {
      job_name: jobName,
      records_affected: count,
      success: true,
      duration_ms: Date.now() - startTime
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`❌ ${jobName} exception:`, message);
    return {
      job_name: jobName,
      records_affected: 0,
      success: false,
      error_message: message,
      duration_ms: Date.now() - startTime
    };
  }
}

async function logCleanupResult(result: CleanupResult) {
  await supabase.from('cleanup_job_logs').insert({
    job_name: result.job_name,
    records_affected: result.records_affected,
    success: result.success,
    error_message: result.error_message || null,
    duration_ms: result.duration_ms
  });
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Starting stale data cleanup process...');
    
    // Parse request body for specific jobs (optional)
    let specificJobs: string[] | null = null;
    try {
      const body = await req.json();
      if (body.jobs && Array.isArray(body.jobs)) {
        specificJobs = body.jobs;
      }
    } catch {
      // No body or invalid JSON - run all jobs
    }

    const allJobs = [
      { name: 'email_queue_cleanup', rpc: 'cleanup_email_queue', batched: false },
      { name: 'pubsub_tracking_cleanup', rpc: 'cleanup_pubsub_tracking', batched: false },
      { name: 'vehicle_location_cleanup', rpc: 'cleanup_vehicle_location_history', batched: false },
      { name: 'email_archive', rpc: 'archive_old_load_emails_batched', batched: true },
      { name: 'rate_limit_cleanup', rpc: 'cleanup_tenant_rate_limits', batched: false },
      { name: 'unroutable_emails_cleanup', rpc: 'cleanup_unroutable_emails', batched: false }
    ];

    // Filter jobs if specific ones requested
    const jobsToRun = specificJobs 
      ? allJobs.filter(j => specificJobs!.includes(j.name))
      : allJobs;

    console.log(`📋 Running ${jobsToRun.length} cleanup jobs...`);

    // Run all cleanup jobs
    const results: CleanupResult[] = [];
    
    for (const job of jobsToRun) {
      // For batched jobs, run multiple iterations
      if (job.batched) {
        let totalAffected = 0;
        let batchCount = 0;
        const maxBatches = 50; // Max 50 batches per run (50k records) - edge functions can run ~150s
        
        while (batchCount < maxBatches) {
          const result = await runCleanupJob(`${job.name}_batch_${batchCount + 1}`, job.rpc);
          
          if (!result.success || result.records_affected === 0) {
            break;
          }
          
          totalAffected += result.records_affected;
          batchCount++;
        }
        
        const finalResult: CleanupResult = {
          job_name: job.name,
          records_affected: totalAffected,
          success: true,
          duration_ms: 0
        };
        
        results.push(finalResult);
        await logCleanupResult(finalResult);
        console.log(`✅ ${job.name} completed: ${totalAffected} records in ${batchCount} batches`);
      } else {
        const result = await runCleanupJob(job.name, job.rpc);
        results.push(result);
        await logCleanupResult(result);
      }
    }

    // Calculate summary
    const totalCleaned = results.reduce((sum, r) => sum + r.records_affected, 0);
    const allSuccessful = results.every(r => r.success);
    const totalDuration = results.reduce((sum, r) => sum + r.duration_ms, 0);

    console.log(`\n📊 Cleanup Summary:`);
    console.log(`   Total records cleaned: ${totalCleaned}`);
    console.log(`   All jobs successful: ${allSuccessful}`);
    console.log(`   Total duration: ${totalDuration}ms`);

    return new Response(
      JSON.stringify({
        success: allSuccessful,
        summary: {
          total_records_cleaned: totalCleaned,
          jobs_run: results.length,
          total_duration_ms: totalDuration
        },
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('❌ Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
