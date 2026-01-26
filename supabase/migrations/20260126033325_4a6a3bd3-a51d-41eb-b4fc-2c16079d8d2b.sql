-- Atomic ICE candidate append RPC
CREATE OR REPLACE FUNCTION public.screenshare_append_ice(
  p_session_id uuid,
  p_role text,
  p_candidate jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_session RECORD;
BEGIN
  -- 1. Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- 2. Validate role parameter
  IF p_role NOT IN ('admin', 'client') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid role');
  END IF;

  -- 3. Verify user is a participant in this session
  SELECT * INTO v_session
  FROM public.screen_share_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found');
  END IF;

  IF v_session.admin_user_id != v_user_id AND v_session.client_user_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a participant');
  END IF;

  -- 4. Atomic append to the correct column
  IF p_role = 'admin' THEN
    UPDATE public.screen_share_sessions
    SET admin_ice_candidates = COALESCE(admin_ice_candidates, '[]'::jsonb) || jsonb_build_array(p_candidate)
    WHERE id = p_session_id;
  ELSE
    UPDATE public.screen_share_sessions
    SET client_ice_candidates = COALESCE(client_ice_candidates, '[]'::jsonb) || jsonb_build_array(p_candidate)
    WHERE id = p_session_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.screenshare_append_ice(uuid, text, jsonb) TO authenticated;