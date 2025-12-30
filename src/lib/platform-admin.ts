import { supabase } from "@/integrations/supabase/client";

/**
 * Check if the current authenticated user is a platform admin.
 * Uses the is_platform_admin column on profiles table.
 * Returns false if not authenticated or profile not found.
 */
export async function getIsPlatformAdmin(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return false;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    return false;
  }

  return data.is_platform_admin === true;
}

/**
 * Hook-friendly version that can be used in useEffect
 * Returns { isPlatformAdmin, loading, error }
 */
export async function checkPlatformAdminStatus(): Promise<{
  isPlatformAdmin: boolean;
  userId: string | null;
  error: string | null;
}> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return { isPlatformAdmin: false, userId: null, error: "Not authenticated" };
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", user.id)
      .single();

    if (error) {
      return { isPlatformAdmin: false, userId: user.id, error: error.message };
    }

    return { 
      isPlatformAdmin: data?.is_platform_admin === true, 
      userId: user.id,
      error: null 
    };
  } catch (err) {
    return { 
      isPlatformAdmin: false, 
      userId: null, 
      error: err instanceof Error ? err.message : "Unknown error" 
    };
  }
}
