import { useState, useEffect, useCallback, useRef } from "react";

export interface FleetColumn {
  id: string;
  label: string;
  shortLabel?: string;
  width: string;
  align: "left" | "right" | "center";
  visible: boolean;
}

export interface DragPosition {
  x: number;
  y: number;
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
  { id: "rental_per_mile", label: "Rental $/M", width: "w-[75px]", align: "right", visible: true },
  { id: "insur", label: "Insur", width: "w-[62px]", align: "right", visible: true },
  { id: "other", label: "Other", width: "w-[58px]", align: "right", visible: true },
  { id: "carr_pay", label: "Carr Pay", width: "w-[117px]", align: "right", visible: true },
  { id: "carr_dollar_per_mile", label: "$/Mi", shortLabel: "$/Mi", width: "w-[52px]", align: "right", visible: true },
  { id: "net", label: "My Net", width: "w-[80px]", align: "right", visible: true },
  { id: "carr_net", label: "Carr NET", width: "w-[80px]", align: "right", visible: true },
  { id: "brokering_net", label: "Brokering Net", width: "w-[95px]", align: "right", visible: true },
];

const STORAGE_KEY = "fleet-financials-column-order";

export function useFleetColumns() {
  const [columns, setColumns] = useState<FleetColumn[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as FleetColumn[];
        const savedMap = new Map(parsed.map((c) => [c.id, c]));
        const defaultMap = new Map(DEFAULT_COLUMNS.map((c) => [c.id, c]));
        
        const orderedIds = parsed.map(c => c.id).filter(id => defaultMap.has(id));
        const newIds = DEFAULT_COLUMNS.filter(c => !savedMap.has(c.id)).map(c => c.id);
        const allIds = [...orderedIds, ...newIds];
        
        return allIds.map(id => {
          const defaultCol = defaultMap.get(id)!;
          const savedCol = savedMap.get(id);
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
  const [dragPosition, setDragPosition] = useState<DragPosition | null>(null);
  const [dragStartPosition, setDragStartPosition] = useState<DragPosition | null>(null);
  
  // Store expense group columns for handling truck_expense drag
  const expenseGroupColumnsRef = useRef<string[]>([]);
  
  const setExpenseGroupColumns = useCallback((cols: string[]) => {
    expenseGroupColumnsRef.current = cols;
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
    } catch (e) {
      console.error("Failed to save column preferences", e);
    }
  }, [columns]);

  // Track mouse movement during drag
  useEffect(() => {
    if (!draggedColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragPosition({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => {
      if (draggedColumn && dragOverColumn && draggedColumn !== dragOverColumn) {
        setColumns((prev) => {
          const newColumns = [...prev];
          
          // Special handling for truck_expense (collapsed expenses group)
          if (draggedColumn === "truck_expense") {
            const expenseGroupCols = expenseGroupColumnsRef.current;
            if (expenseGroupCols.length === 0) return prev;
            
            // Find target position
            const targetIndex = newColumns.findIndex((c) => c.id === dragOverColumn);
            if (targetIndex === -1) return prev;
            
            // Extract all expense columns (maintaining their relative order)
            const expenseColumns = newColumns.filter(c => expenseGroupCols.includes(c.id));
            const nonExpenseColumns = newColumns.filter(c => !expenseGroupCols.includes(c.id));
            
            // Find where target is in nonExpenseColumns
            const targetInNonExpense = nonExpenseColumns.findIndex(c => c.id === dragOverColumn);
            
            // Insert expense columns as a group at target position
            if (targetInNonExpense !== -1) {
              nonExpenseColumns.splice(targetInNonExpense, 0, ...expenseColumns);
              return nonExpenseColumns;
            }
            
            return prev;
          }
          
          // Normal single column drag
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
      setDragPosition(null);
      setDragStartPosition(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggedColumn, dragOverColumn]);

  const handleDragStart = useCallback((columnId: string, e?: React.MouseEvent) => {
    if (!isEditMode) return;
    if (e) {
      e.preventDefault();
      const pos = { x: e.clientX, y: e.clientY };
      setDragStartPosition(pos);
      setDragPosition(pos);
    } else {
      setDragStartPosition(null);
      setDragPosition(null);
    }
    setDraggedColumn(columnId);
  }, [isEditMode]);

  const handleDragOver = useCallback((columnId: string) => {
    if (!isEditMode) return;
    if (draggedColumn && columnId !== draggedColumn) {
      setDragOverColumn(columnId);
    }
  }, [isEditMode, draggedColumn]);

  const handleDragEnd = useCallback(() => {
    if (!isEditMode) return;
    setDraggedColumn(null);
    setDragOverColumn(null);
    setDragPosition(null);
    setDragStartPosition(null);
  }, [isEditMode]);

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
    dragPosition,
    dragStartPosition,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    toggleColumnVisibility,
    resetColumns,
    toggleEditMode,
    setExpenseGroupColumns,
  };
}
