import { useState, useEffect } from "react";

export interface FleetColumn {
  id: string;
  label: string;
  shortLabel?: string;
  width: string;
  align: "left" | "right" | "center";
  visible: boolean;
}

const DEFAULT_COLUMNS: FleetColumn[] = [
  { id: "pickup_date", label: "P/U Date", width: "w-[88px]", align: "left", visible: true },
  { id: "customer", label: "Customer", width: "w-[140px]", align: "left", visible: true },
  { id: "route", label: "Route", width: "w-[65px]", align: "left", visible: true },
  { id: "payload", label: "Payload", width: "w-[78px]", align: "right", visible: true },
  { id: "empty", label: "Empty", width: "w-[60px]", align: "right", visible: true },
  { id: "loaded", label: "Loaded", width: "w-[62px]", align: "right", visible: true },
  { id: "total", label: "Total", width: "w-[55px]", align: "right", visible: true },
  { id: "dollar_per_mile", label: "$/Mi", width: "w-[52px]", align: "right", visible: true },
  { id: "mpg", label: "MPG", width: "w-[48px]", align: "right", visible: true },
  { id: "factor", label: "Factor", width: "w-[68px]", align: "right", visible: true },
  { id: "disp_pay", label: "Disp Pay", width: "w-[75px]", align: "right", visible: true },
  { id: "drv_pay", label: "Drv Pay", width: "w-[70px]", align: "right", visible: true },
  { id: "wcomp", label: "WComp", width: "w-[62px]", align: "right", visible: true },
  { id: "fuel", label: "Fuel", width: "w-[55px]", align: "right", visible: true },
  { id: "tolls", label: "Tolls", width: "w-[55px]", align: "right", visible: true },
  { id: "rental", label: "Rental", width: "w-[58px]", align: "right", visible: true },
  { id: "insur", label: "Insur", width: "w-[62px]", align: "right", visible: true },
  { id: "other", label: "Other", width: "w-[58px]", align: "right", visible: true },
  { id: "carr_pay", label: "Carr Pay", width: "w-[117px]", align: "right", visible: true },
  { id: "carr_dollar_per_mile", label: "$/Mi", shortLabel: "$/Mi", width: "w-[52px]", align: "right", visible: true },
  { id: "net", label: "Net", width: "w-[80px]", align: "right", visible: true },
  { id: "carr_net", label: "Carr NET", width: "w-[80px]", align: "right", visible: true },
];

const STORAGE_KEY = "fleet-financials-column-order";

export function useFleetColumns() {
  const [columns, setColumns] = useState<FleetColumn[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as FleetColumn[];
        // Create a map of saved columns for order/visibility, but use default widths
        const savedMap = new Map(parsed.map((c) => [c.id, c]));
        const defaultMap = new Map(DEFAULT_COLUMNS.map((c) => [c.id, c]));
        
        // Preserve saved order, merge with defaults for new columns and updated widths
        const orderedIds = parsed.map(c => c.id).filter(id => defaultMap.has(id));
        const newIds = DEFAULT_COLUMNS.filter(c => !savedMap.has(c.id)).map(c => c.id);
        const allIds = [...orderedIds, ...newIds];
        
        return allIds.map(id => {
          const defaultCol = defaultMap.get(id)!;
          const savedCol = savedMap.get(id);
          // Use default width always, but preserve saved visibility
          return {
            ...defaultCol,
            visible: savedCol?.visible ?? defaultCol.visible,
          };
        });
      }
    } catch (e) {
      console.error("Failed to load column preferences", e);
    }
    return DEFAULT_COLUMNS;
  });

  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
    } catch (e) {
      console.error("Failed to save column preferences", e);
    }
  }, [columns]);

  const handleDragStart = (columnId: string) => {
    if (!isEditMode) return;
    setDraggedColumn(columnId);
  };

  const handleDragOver = (columnId: string) => {
    if (!isEditMode) return;
    if (draggedColumn && columnId !== draggedColumn) {
      setDragOverColumn(columnId);
    }
  };

  const handleDragEnd = () => {
    if (!isEditMode) return;
    if (draggedColumn && dragOverColumn && draggedColumn !== dragOverColumn) {
      setColumns((prev) => {
        const newColumns = [...prev];
        const draggedIndex = newColumns.findIndex((c) => c.id === draggedColumn);
        const targetIndex = newColumns.findIndex((c) => c.id === dragOverColumn);
        
        if (draggedIndex !== -1 && targetIndex !== -1) {
          const [removed] = newColumns.splice(draggedIndex, 1);
          newColumns.splice(targetIndex, 0, removed);
        }
        
        return newColumns;
      });
    }
    setDraggedColumn(null);
    setDragOverColumn(null);
  };

  const toggleColumnVisibility = (columnId: string) => {
    setColumns((prev) =>
      prev.map((col) => (col.id === columnId ? { ...col, visible: !col.visible } : col))
    );
  };

  const resetColumns = () => {
    setColumns(DEFAULT_COLUMNS);
    localStorage.removeItem(STORAGE_KEY);
  };

  const toggleEditMode = () => {
    setIsEditMode((prev) => !prev);
  };

  return {
    columns,
    visibleColumns: columns.filter((c) => c.visible),
    draggedColumn,
    dragOverColumn,
    isEditMode,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    toggleColumnVisibility,
    resetColumns,
    toggleEditMode,
  };
}
