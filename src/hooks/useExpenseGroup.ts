import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Default columns to include in the TRUCK EXPENSE group
const DEFAULT_EXPENSE_COLUMNS = ["fuel", "rental", "insur", "tolls", "wcomp"];

interface ExpenseGroupState {
  isCollapsed: boolean;
  includedColumns: string[];
}

const DEFAULT_STATE: ExpenseGroupState = {
  isCollapsed: false,
  includedColumns: DEFAULT_EXPENSE_COLUMNS,
};

export function useExpenseGroup() {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [localState, setLocalState] = useState<ExpenseGroupState>(DEFAULT_STATE);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  // Fetch settings from database
  const { data: dbSettings, isLoading } = useQuery({
    queryKey: ["expense-group-settings", userId],
    queryFn: async () => {
      if (!userId) return null;
      
      const { data, error } = await supabase
        .from('user_preferences')
        .select('expense_group_columns, expense_group_collapsed')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('[ExpenseGroup] Fetch error:', error);
        return null;
      }
      
      return data;
    },
    enabled: !!userId,
    staleTime: 30000,
  });

  // Sync database settings to local state
  useEffect(() => {
    if (dbSettings) {
      setLocalState({
        isCollapsed: dbSettings.expense_group_collapsed ?? DEFAULT_STATE.isCollapsed,
        includedColumns: dbSettings.expense_group_columns ?? DEFAULT_STATE.includedColumns,
      });
    }
  }, [dbSettings]);

  // Upsert settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<{ expense_group_columns: string[]; expense_group_collapsed: boolean }>) => {
      if (!userId) throw new Error("Not authenticated");
      
      const { data, error } = await supabase
        .from('user_preferences')
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
      queryClient.invalidateQueries({ queryKey: ["expense-group-settings", userId] });
    },
  });

  const toggleCollapsed = useCallback(() => {
    setLocalState((prev) => {
      const newState = { ...prev, isCollapsed: !prev.isCollapsed };
      updateSettingsMutation.mutate({ expense_group_collapsed: newState.isCollapsed });
      return newState;
    });
  }, [updateSettingsMutation]);

  const setIncludedColumns = useCallback((columns: string[]) => {
    setLocalState((prev) => {
      const newState = { ...prev, includedColumns: columns };
      updateSettingsMutation.mutate({ expense_group_columns: columns });
      return newState;
    });
  }, [updateSettingsMutation]);

  const toggleColumn = useCallback((columnId: string) => {
    setLocalState((prev) => {
      const isIncluded = prev.includedColumns.includes(columnId);
      const newColumns = isIncluded
        ? prev.includedColumns.filter((id) => id !== columnId)
        : [...prev.includedColumns, columnId];
      updateSettingsMutation.mutate({ expense_group_columns: newColumns });
      return {
        ...prev,
        includedColumns: newColumns,
      };
    });
  }, [updateSettingsMutation]);

  const resetToDefault = useCallback(() => {
    setLocalState(DEFAULT_STATE);
    updateSettingsMutation.mutate({
      expense_group_columns: DEFAULT_STATE.includedColumns,
      expense_group_collapsed: DEFAULT_STATE.isCollapsed,
    });
  }, [updateSettingsMutation]);

  return {
    isCollapsed: localState.isCollapsed,
    includedColumns: localState.includedColumns,
    toggleCollapsed,
    setIncludedColumns,
    toggleColumn,
    resetToDefault,
    isLoading,
  };
}

// Column IDs that can be merged into truck expense
export const MERGEABLE_EXPENSE_COLUMNS = [
  { id: "mpg", label: "MPG" },
  { id: "factor", label: "Factoring" },
  { id: "disp_pay", label: "Dispatch Pay" },
  { id: "drv_pay", label: "Driver Pay" },
  { id: "wcomp", label: "Workman Comp" },
  { id: "fuel", label: "Fuel" },
  { id: "tolls", label: "Tolls" },
  { id: "rental", label: "RCPD" },
  { id: "rental_per_mile", label: "RCPM" },
  { id: "insur", label: "Insurance" },
  { id: "other", label: "Other" },
  { id: "carr_pay", label: "Carrier Pay" },
  { id: "carr_dollar_per_mile", label: "Carr $/Mi" },
  { id: "net", label: "My Net" },
  { id: "carr_net", label: "Carrier Net" },
  { id: "brokering_net", label: "Brokering Net" },
];
