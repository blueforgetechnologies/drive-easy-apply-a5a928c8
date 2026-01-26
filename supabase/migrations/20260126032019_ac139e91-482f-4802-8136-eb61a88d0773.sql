-- SECURITY DEFINER RPC to claim/join a screen share session by code
-- This bypasses RLS safely because all validation is done server-side

CREATE OR REPLACE FUNCTION public.screenshare_claim_session(p_session_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_tenant_id uuid;
  v_session RECORD;
  v_result jsonb;
BEGIN
  -- 1. Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- 2. Get user's active tenant (first one for now)
  SELECT tenant_id INTO v_user_tenant_id
  FROM public.tenant_users
  WHERE user_id = v_user_id AND is_active = true
  LIMIT 1;
  
  IF v_user_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active tenant membership');
  END IF;
  
  -- 3. Find pending session by code in user's tenant
  SELECT * INTO v_session
  FROM public.screen_share_sessions
  WHERE session_code = UPPER(p_session_code)
    AND tenant_id = v_user_tenant_id
    AND status = 'pending'
  FOR UPDATE;  -- Lock the row to prevent race conditions
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found, expired, or belongs to a different organization');
  END IF;
  
  -- 4. Check if already claimed
  IF v_session.client_user_id IS NOT NULL AND v_session.admin_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session already has both participants');
  END IF;
  
  -- 5. Prevent joining own session
  IF v_session.admin_user_id = v_user_id OR v_session.client_user_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot join your own session');
  END IF;
  
  -- 6. Claim the session based on who initiated
  IF v_session.initiated_by = 'admin' THEN
    -- Admin created session, client is joining -> set client_user_id
    UPDATE public.screen_share_sessions
    SET 
      client_user_id = v_user_id,
      status = 'active',
      connected_at = now()
    WHERE id = v_session.id;
  ELSE
    -- Client created session, admin is joining -> set admin_user_id
    UPDATE public.screen_share_sessions
    SET 
      admin_user_id = v_user_id,
      status = 'active',
      connected_at = now()
    WHERE id = v_session.id;
  END IF;
  
  -- 7. Return the updated session
  SELECT jsonb_build_object(
    'success', true,
    'session', jsonb_build_object(
      'id', s.id,
      'session_code', s.session_code,
      'status', s.status,
      'initiated_by', s.initiated_by,
      'admin_user_id', s.admin_user_id,
      'client_user_id', s.client_user_id,
      'tenant_id', s.tenant_id,
      'created_at', s.created_at,
      'connected_at', s.connected_at
    ),
    'role', CASE 
      WHEN v_session.initiated_by = 'admin' THEN 'client'
      ELSE 'admin'
    END
  ) INTO v_result
  FROM public.screen_share_sessions s
  WHERE s.id = v_session.id;
  
  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.screenshare_claim_session(text) TO authenticated;