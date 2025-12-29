import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PaymentFormula {
  id?: string;
  formula_name: string;
  add_columns: string[];
  subtract_columns: string[];
}

export interface PaymentFormulasState {
  carr_net: PaymentFormula | null;
  my_net: PaymentFormula | null;
  brokering_net: PaymentFormula | null;
}

// Available columns for formulas (excluding MPG, loaded, empty, total, $/M columns)
export const AVAILABLE_FORMULA_COLUMNS = [
  { id: "payload", label: "Payload" },
  { id: "carr_pay", label: "Carrier Pay" },
  { id: "disp_pay", label: "Dispatch Pay" },
  { id: "drv_pay", label: "Drv1 Pay" },
  { id: "drv2_pay", label: "Drv2 Pay" },
  { id: "factor", label: "Factoring" },
  { id: "fuel", label: "Fuel" },
  { id: "rental", label: "RCPD (Rental)" },
  { id: "insur", label: "Insurance" },
  { id: "tolls", label: "Tolls" },
  { id: "wcomp", label: "Workman Comp" },
  { id: "other", label: "Other" },
  { id: "rental_per_mile", label: "RCPM (Rental/Mile)" },
];

export function usePaymentFormulas() {
  const [formulas, setFormulas] = useState<PaymentFormulasState>({
    carr_net: null,
    my_net: null,
    brokering_net: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch formulas from database
  const fetchFormulas = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("payment_formulas")
        .select("*");

      if (error) throw error;

      const formulaMap: PaymentFormulasState = {
        carr_net: null,
        my_net: null,
        brokering_net: null,
      };

      data?.forEach((formula) => {
        const key = formula.formula_name as keyof PaymentFormulasState;
        if (key in formulaMap) {
          formulaMap[key] = {
            id: formula.id,
            formula_name: formula.formula_name,
            add_columns: formula.add_columns || [],
            subtract_columns: formula.subtract_columns || [],
          };
        }
      });

      setFormulas(formulaMap);
    } catch (error) {
      console.error("Error fetching payment formulas:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFormulas();
  }, [fetchFormulas]);

  // Save or update a formula
  const saveFormula = useCallback(async (formula: PaymentFormula) => {
    setSaving(true);
    try {
      const existing = formulas[formula.formula_name as keyof PaymentFormulasState];
      
      if (existing?.id) {
        // Update existing
        const { error } = await supabase
          .from("payment_formulas")
          .update({
            add_columns: formula.add_columns,
            subtract_columns: formula.subtract_columns,
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from("payment_formulas")
          .insert({
            formula_name: formula.formula_name,
            add_columns: formula.add_columns,
            subtract_columns: formula.subtract_columns,
          });

        if (error) throw error;
      }

      await fetchFormulas();
      toast.success(`${formula.formula_name.replace(/_/g, " ").toUpperCase()} formula saved`);
    } catch (error) {
      console.error("Error saving formula:", error);
      toast.error("Failed to save formula");
    } finally {
      setSaving(false);
    }
  }, [formulas, fetchFormulas]);

  // Check if a formula is configured
  const isConfigured = useCallback((formulaName: keyof PaymentFormulasState) => {
    const formula = formulas[formulaName];
    return formula && (formula.add_columns.length > 0 || formula.subtract_columns.length > 0);
  }, [formulas]);

  // Calculate a value based on formula
  const calculateFormula = useCallback((
    formulaName: keyof PaymentFormulasState,
    values: Record<string, number>
  ): number | null => {
    const formula = formulas[formulaName];
    if (!formula || (formula.add_columns.length === 0 && formula.subtract_columns.length === 0)) {
      return null; // Not configured
    }

    let result = 0;
    formula.add_columns.forEach((col) => {
      result += values[col] || 0;
    });
    formula.subtract_columns.forEach((col) => {
      result -= values[col] || 0;
    });

    return result;
  }, [formulas]);

  // Get formula preview string
  const getFormulaPreview = useCallback((formulaName: keyof PaymentFormulasState): string => {
    const formula = formulas[formulaName];
    if (!formula || (formula.add_columns.length === 0 && formula.subtract_columns.length === 0)) {
      return "Not configured";
    }

    const getLabel = (id: string) => 
      AVAILABLE_FORMULA_COLUMNS.find((c) => c.id === id)?.label || id;

    const parts: string[] = [];
    formula.add_columns.forEach((col, idx) => {
      parts.push(idx === 0 ? getLabel(col) : `+ ${getLabel(col)}`);
    });
    formula.subtract_columns.forEach((col) => {
      parts.push(`- ${getLabel(col)}`);
    });

    return parts.join(" ") || "Empty formula";
  }, [formulas]);

  return {
    formulas,
    loading,
    saving,
    saveFormula,
    isConfigured,
    calculateFormula,
    getFormulaPreview,
    refetch: fetchFormulas,
  };
}
