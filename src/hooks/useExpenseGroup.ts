import { useState, useEffect, useCallback } from "react";

// Default columns to include in the TRUCK EXPENSE group
const DEFAULT_EXPENSE_COLUMNS = ["fuel", "rental", "insur", "tolls", "wcomp"];

const STORAGE_KEY = "fleet-financials-expense-group";

interface ExpenseGroupState {
  isCollapsed: boolean;
  includedColumns: string[];
}

const DEFAULT_STATE: ExpenseGroupState = {
  isCollapsed: false,
  includedColumns: DEFAULT_EXPENSE_COLUMNS,
};

export function useExpenseGroup() {
  const [state, setState] = useState<ExpenseGroupState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved) as ExpenseGroupState;
      }
    } catch (e) {
      console.error("Failed to load expense group preferences", e);
    }
    return DEFAULT_STATE;
  });

  // Persist to localStorage whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Failed to save expense group preferences", e);
    }
  }, [state]);

  const toggleCollapsed = useCallback(() => {
    setState((prev) => ({ ...prev, isCollapsed: !prev.isCollapsed }));
  }, []);

  const setIncludedColumns = useCallback((columns: string[]) => {
    setState((prev) => ({ ...prev, includedColumns: columns }));
  }, []);

  const toggleColumn = useCallback((columnId: string) => {
    setState((prev) => {
      const isIncluded = prev.includedColumns.includes(columnId);
      return {
        ...prev,
        includedColumns: isIncluded
          ? prev.includedColumns.filter((id) => id !== columnId)
          : [...prev.includedColumns, columnId],
      };
    });
  }, []);

  const resetToDefault = useCallback(() => {
    setState(DEFAULT_STATE);
  }, []);

  return {
    isCollapsed: state.isCollapsed,
    includedColumns: state.includedColumns,
    toggleCollapsed,
    setIncludedColumns,
    toggleColumn,
    resetToDefault,
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
  { id: "rental", label: "Rental" },
  { id: "insur", label: "Insurance" },
  { id: "other", label: "Other" },
  { id: "carr_pay", label: "Carrier Pay" },
  { id: "carr_dollar_per_mile", label: "Carr $/Mi" },
  { id: "net", label: "My Net" },
  { id: "carr_net", label: "Carrier Net" },
  { id: "brokering_net", label: "Brokering Net" },
];
