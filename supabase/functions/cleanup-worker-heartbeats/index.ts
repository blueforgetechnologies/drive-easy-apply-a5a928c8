import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertPlatformAdmin } from '../_shared/assertFeatureEnabled.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type RequestBody = {
  cutoff_hours?: number
}

function clampCutoffHours(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 24
  // Safety bounds: 1 hour .. 30 days
  return Math.min(24 * 30, Math.max(1, Math.floor(n)))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const adminCheck = await assertPlatformAdmin(authHeader)
    if (!adminCheck.allowed) return adminCheck.response!

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body: RequestBody = {}
    try {
      body = (await req.json()) ?? {}
    } catch {
      // No body is fine
    }

    const cutoffHours = clampCutoffHours(body.cutoff_hours)
    const cutoffIso = new Date(Date.now() - cutoffHours * 60 * 60 * 1000).toISOString()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Count first (fast head query)
    const { count, error: countError } = await supabase
      .from('worker_heartbeats')
      .select('id', { count: 'exact', head: true })
      .lt('last_heartbeat', cutoffIso)

    if (countError) {
      console.error('[cleanup-worker-heartbeats] Count error:', countError)
      return new Response(JSON.stringify({ error: 'Failed to count stale workers' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const staleCount = count ?? 0
    if (staleCount === 0) {
      return new Response(
        JSON.stringify({ deleted: 0, cutoff_hours: cutoffHours, cutoff_iso: cutoffIso }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { count: deletedCount, error: deleteError } = await supabase
      .from('worker_heartbeats')
      .delete({ count: 'exact' })
      .lt('last_heartbeat', cutoffIso)

    if (deleteError) {
      console.error('[cleanup-worker-heartbeats] Delete error:', deleteError)
      return new Response(JSON.stringify({ error: 'Failed to delete stale workers' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        deleted: deletedCount ?? staleCount,
        cutoff_hours: cutoffHours,
        cutoff_iso: cutoffIso,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[cleanup-worker-heartbeats] Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
