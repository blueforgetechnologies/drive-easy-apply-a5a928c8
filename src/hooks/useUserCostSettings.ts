import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

interface UserCostSettings {
  cloud_calibrated_rate: number | null;
  mapbox_calibrated_multiplier: number | null;
  monthly_budget: number;
}

export function useUserCostSettings() {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  // Fetch settings from database
  const { data: settings, isLoading, refetch } = useQuery({
    queryKey: ["user-cost-settings", userId],
    queryFn: async () => {
      if (!userId) return null;
      
      const { data, error } = await supabase
        .from('user_cost_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('[UserCostSettings] Fetch error:', error);
        return null;
      }
      
      return data as UserCostSettings | null;
    },
    enabled: !!userId,
    staleTime: 30000,
  });

  // Upsert settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<UserCostSettings>) => {
      if (!userId) throw new Error("Not authenticated");
      
      const { data, error } = await supabase
        .from('user_cost_settings')
        .upsert({
          user_id: userId,
          ...updates,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-cost-settings", userId] });
    },
  });

  const updateCloudRate = (rate: number | null) => {
    updateSettingsMutation.mutate({ cloud_calibrated_rate: rate });
  };

  const updateMapboxMultiplier = (multiplier: number | null) => {
    updateSettingsMutation.mutate({ mapbox_calibrated_multiplier: multiplier });
  };

  const updateMonthlyBudget = (budget: number) => {
    updateSettingsMutation.mutate({ monthly_budget: budget });
  };

  return {
    settings,
    isLoading,
    refetch,
    cloudCalibratedRate: settings?.cloud_calibrated_rate ?? null,
    mapboxCalibratedMultiplier: settings?.mapbox_calibrated_multiplier ?? null,
    monthlyBudget: settings?.monthly_budget ?? 100,
    updateCloudRate,
    updateMapboxMultiplier,
    updateMonthlyBudget,
    isUpdating: updateSettingsMutation.isPending,
  };
}
