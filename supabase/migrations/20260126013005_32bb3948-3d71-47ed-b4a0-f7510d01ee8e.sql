BEGIN;

-- Step 1: Add tenant_id column (nullable initially)
ALTER TABLE public.screen_share_sessions
ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);

-- Step 2: Create indexes for performance
CREATE INDEX idx_screen_share_sessions_tenant_id 
ON public.screen_share_sessions(tenant_id);

CREATE INDEX idx_screen_share_sessions_tenant_session_code
ON public.screen_share_sessions(tenant_id, session_code);

-- Step 3: Backfill with DETERMINISTIC rule
-- Uses most recent active tenant_users membership (by created_at DESC)
UPDATE public.screen_share_sessions s
SET tenant_id = (
  SELECT tu.tenant_id 
  FROM public.tenant_users tu
  WHERE tu.user_id = COALESCE(s.admin_user_id, s.client_user_id)
    AND tu.is_active = true
  ORDER BY tu.created_at DESC
  LIMIT 1
);

-- Step 4: Delete orphan rows (no tenant could be inferred)
DELETE FROM public.screen_share_sessions
WHERE tenant_id IS NULL;

-- Step 5: Make tenant_id NOT NULL after cleanup
ALTER TABLE public.screen_share_sessions
ALTER COLUMN tenant_id SET NOT NULL;

-- Step 6: Enable RLS
ALTER TABLE public.screen_share_sessions ENABLE ROW LEVEL SECURITY;

-- Step 7: DROP existing policies if any
DROP POLICY IF EXISTS "screen_share_sessions_select" ON public.screen_share_sessions;
DROP POLICY IF EXISTS "screen_share_sessions_insert" ON public.screen_share_sessions;
DROP POLICY IF EXISTS "screen_share_sessions_update" ON public.screen_share_sessions;
DROP POLICY IF EXISTS "screen_share_sessions_delete" ON public.screen_share_sessions;
DROP POLICY IF EXISTS "Participant or platform admin can view session" ON public.screen_share_sessions;
DROP POLICY IF EXISTS "Creator must be authenticated participant in current tenant" ON public.screen_share_sessions;
DROP POLICY IF EXISTS "Participant or platform admin can update session" ON public.screen_share_sessions;
DROP POLICY IF EXISTS "Participant or platform admin can delete session" ON public.screen_share_sessions;

-- Step 8: SELECT: Participant + Tenant access, OR platform admin
CREATE POLICY "Participant or platform admin can view session"
  ON public.screen_share_sessions FOR SELECT
  USING (
    is_platform_admin(auth.uid()) 
    OR (
      can_access_tenant(auth.uid(), tenant_id) 
      AND (auth.uid() = admin_user_id OR auth.uid() = client_user_id)
    )
  );

-- Step 9: INSERT: Strict creator validation (NO platform admin bypass)
CREATE POLICY "Creator must be authenticated participant in current tenant"
  ON public.screen_share_sessions FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND tenant_id = get_current_tenant_id()
    AND (
      (initiated_by = 'admin' AND admin_user_id = auth.uid() AND client_user_id IS NULL)
      OR
      (initiated_by = 'client' AND client_user_id = auth.uid() AND admin_user_id IS NULL)
    )
  );

-- Step 10: UPDATE: Participant + Tenant access, OR platform admin
CREATE POLICY "Participant or platform admin can update session"
  ON public.screen_share_sessions FOR UPDATE
  USING (
    is_platform_admin(auth.uid()) 
    OR (
      can_access_tenant(auth.uid(), tenant_id) 
      AND (auth.uid() = admin_user_id OR auth.uid() = client_user_id)
    )
  );

-- Step 11: DELETE: Participant + Tenant access, OR platform admin
CREATE POLICY "Participant or platform admin can delete session"
  ON public.screen_share_sessions FOR DELETE
  USING (
    is_platform_admin(auth.uid()) 
    OR (
      can_access_tenant(auth.uid(), tenant_id) 
      AND (auth.uid() = admin_user_id OR auth.uid() = client_user_id)
    )
  );

COMMIT;