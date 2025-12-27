import { useMemo, Fragment, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, isSameDay, isWeekend } from "date-fns";
import { cn } from "@/lib/utils";
import { ShieldCheck, AlertTriangle, GripVertical, Info } from "lucide-react";
import { FleetColumn, useFleetColumns, DragPosition } from "@/hooks/useFleetColumns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Load {
  id: string;
  load_number: string;
  pickup_date: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  rate: number | null;
  carrier_rate: number | null;
  carrier_approved: boolean | null;
  approved_payload: number | null;
  estimated_miles: number | null;
  empty_miles: number | null;
  assigned_vehicle_id: string | null;
  assigned_dispatcher_id: string | null;
  customer_id: string | null;
  status: string | null;
  fuel_surcharge: number | null;
  accessorial_charges: number | null;
  detention_charges: number | null;
  other_charges: number | null;
  truck_type_at_booking: string | null;
}

interface DailyData {
  date: Date;
  dayOfWeek: number;
  loads: Load[];
  isWeekEnd: boolean;
}

interface Vehicle {
  id: string;
  vehicle_number: string;
  carrier: string | null;
  insurance_cost_per_month: number | null;
  monthly_payment: number | null;
  driver_1_id: string | null;
  requires_load_approval: boolean | null;
  asset_ownership?: string | null;
  cents_per_mile?: number | null;
  truck_type?: string | null;
}

interface Totals {
  payload: number;
  emptyMiles: number;
  loadedMiles: number;
  totalMiles: number;
  dollarPerMile: number;
  factoring: number;
  dispatcherPay: number;
  driverPay: number;
  workmanComp: number;
  fuel: number;
  tolls: number;
  rental: number;
  rentalPerMileCost: number;
  dailyRentalRate: number;
  businessDaysInMonth: number;
  insuranceCost: number;
  dailyInsuranceRate: number;
  vehicleCost: number;
  other: number;
  carrierPay: number;
  carrierPerMile: number;
  netProfit: number;
  driverPayMethod: string | null;
  driverPayActive: boolean;
  driverName: string | null;
  driverPayPercentage: number | null;
}

type FormulaName = "carr_net" | "my_net" | "brokering_net";

interface FleetFinancialsTableProps {
  dailyData: DailyData[];
  totals: Totals;
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  milesPerGallon: number;
  dollarPerGallon: number;
  factoringPercentage: number;
  showColumnLines: boolean;
  isEditMode: boolean;
  getCustomerName: (customerId: string | null) => string;
  getDispatcherPay: (load: Load) => number;
  getDriverPay: (load: Load) => number;
  getDispatcherName: (dispatcherId: string | null) => string;
  getWeeklyTotal: (endIndex: number) => number;
  // Column management props
  visibleColumns: FleetColumn[];
  draggedColumn: string | null;
  dragOverColumn: string | null;
  dragPosition: DragPosition | null;
  dragStartPosition: DragPosition | null;
  handleDragStart: (columnId: string, e?: React.MouseEvent) => void;
  handleDragOver: (columnId: string) => void;
  handleDragEnd: () => void;
  // Expense group props
  expenseGroupCollapsed: boolean;
  expenseGroupColumns: string[];
  // Payment formula props
  calculateFormula?: (formulaName: FormulaName, values: Record<string, number>) => number | null;
}

const DAILY_OTHER_COST = 0;

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
};

const formatNumber = (value: number, decimals = 1) => {
  return value.toFixed(decimals);
};

// Column header component - draggable only in edit mode with high-tech effects
function ColumnHeader({
  column,
  isEditMode,
  draggedColumn,
  dragOverColumn,
  onDragStart,
  onDragOver,
  isFirstExpense,
  isLastExpense,
}: {
  column: FleetColumn;
  isEditMode: boolean;
  draggedColumn: string | null;
  dragOverColumn: string | null;
  onDragStart: (id: string, e?: React.MouseEvent) => void;
  onDragOver: (id: string) => void;
  isFirstExpense?: boolean;
  isLastExpense?: boolean;
}) {
  const isDragging = draggedColumn === column.id;
  const isOver = dragOverColumn === column.id && !isDragging;

  // Determine expense rail CSS class based on position
  const getExpenseRailClass = () => {
    const isCollapsedExpense = column.id === "truck_expense";
    const hasLeftRail = isCollapsedExpense || isFirstExpense;
    const hasRightRail = isCollapsedExpense || isLastExpense;
    
    if (hasLeftRail && hasRightRail) return "expense-rail-both";
    if (hasLeftRail) return "expense-rail-left";
    if (hasRightRail) return "expense-rail-right";
    return "";
  };

  if (!isEditMode) {
    // Normal view - centered text, no truncation
    return (
      <th
        className={cn(
          column.width,
          "px-2 py-2 font-medium whitespace-nowrap text-center",
          getExpenseRailClass()
        )}
      >
        <div className="flex items-center justify-center gap-0.5">
          <span>{column.label}</span>
          {column.tooltip && (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[320px] whitespace-normal">
                  <p className="text-xs leading-relaxed">{column.tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </th>
    );
  }

  // Edit mode - draggable with high-tech effects using mouse events
  return (
    <th
      onMouseDown={(e) => {
        e.preventDefault();
        onDragStart(column.id, e);
      }}
      onMouseEnter={() => {
        if (draggedColumn) {
          onDragOver(column.id);
        }
      }}
      className={cn(
        column.width,
        "px-2 py-2.5 font-medium whitespace-nowrap select-none column-draggable cursor-grab transition-all duration-150",
        getExpenseRailClass(),
        column.align === "right" && "text-right",
        column.align === "center" && "text-center",
        column.align === "left" && "text-left",
        !isDragging && !isOver && "column-edit-mode",
        isDragging && "column-dragging cell-column-dragging cursor-grabbing",
        isOver && "column-drop-target"
      )}
    >
      <div className={cn(
        "flex flex-col items-center gap-0.5 px-1 py-0.5 rounded transition-all duration-200",
      )}>
        <GripVertical className={cn(
          "h-3 w-3 flex-shrink-0 grip-handle transition-all duration-200 rotate-90",
          "opacity-50"
        )} />
        <span 
          className="font-semibold text-xs uppercase tracking-wide text-center whitespace-normal leading-tight"
          title={column.label}
        >
          {column.label}
        </span>
      </div>
    </th>
  );
}

// Cell value renderer based on column type
function CellValue({
  column,
  load,
  loadIndex,
  day,
  totals,
  milesPerGallon,
  dollarPerGallon,
  factoringPercentage,
  vehicles,
  selectedVehicleId,
  getCustomerName,
  getDispatcherPay,
  getDriverPay,
  getDispatcherName,
  navigate,
  draggedColumn,
  dragOverColumn,
  expenseGroupColumns,
  isFirstExpense,
  isLastExpense,
  calculateFormula,
}: {
  column: FleetColumn;
  load: Load;
  loadIndex: number;
  day: DailyData;
  totals: Totals;
  milesPerGallon: number;
  dollarPerGallon: number;
  factoringPercentage: number;
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  getCustomerName: (customerId: string | null) => string;
  getDispatcherPay: (load: Load) => number;
  getDriverPay: (load: Load) => number;
  getDispatcherName: (dispatcherId: string | null) => string;
  navigate: (path: string) => void;
  draggedColumn: string | null;
  dragOverColumn: string | null;
  expenseGroupColumns: string[];
  isFirstExpense?: boolean;
  isLastExpense?: boolean;
  calculateFormula?: (formulaName: FormulaName, values: Record<string, number>) => number | null;
}) {
  const isDraggedColumn = draggedColumn === column.id;
  const isDropTarget = dragOverColumn === column.id && dragOverColumn !== draggedColumn;
  
  // Determine expense rail CSS class based on position
  const getExpenseRailClass = () => {
    const isCollapsedExpense = column.id === "truck_expense";
    const hasLeftRail = isCollapsedExpense || isFirstExpense;
    const hasRightRail = isCollapsedExpense || isLastExpense;
    
    if (hasLeftRail && hasRightRail) return "expense-rail-both";
    if (hasLeftRail) return "expense-rail-left";
    if (hasRightRail) return "expense-rail-right";
    return "";
  };
  const expenseRailClass = getExpenseRailClass();
  
  const dragClass = cn(isDraggedColumn && "cell-column-dragging", isDropTarget && "cell-drop-target");
  const rate = load.rate || 0;
  const emptyM = load.empty_miles || 0;
  const loadedM = load.estimated_miles || 0;
  const totalM = emptyM + loadedM;
  const dollarPerMile = totalM > 0 ? rate / totalM : 0;
  const factoring = rate * (factoringPercentage / 100);
  const dispPay = getDispatcherPay(load);
  const drvPay = getDriverPay(load);
  const fuelCost = totalM > 0 ? (totalM / milesPerGallon) * dollarPerGallon : 0;
  const isBusinessDay = !isWeekend(day.date);
  const dailyRental = isBusinessDay ? totals.dailyRentalRate : 0;
  const dailyInsurance = totals.dailyInsuranceRate;
  const isToday = isSameDay(day.date, new Date());

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);
  const vehicleRequiresApproval = selectedVehicle?.requires_load_approval;
  const currentTruckType = selectedVehicle?.truck_type || 'my_truck';
  const loadTruckType = load.truck_type_at_booking || currentTruckType; // Default to current if not set
  const isTruckTypeMismatch = loadTruckType !== currentTruckType;
  const isApproved = load.carrier_approved === true;
  const payloadChangedAfterApproval = isApproved && load.approved_payload !== null && load.approved_payload !== rate;
  const carrierPayAmount = load.carrier_rate || rate;
  const tolls = 0; // Placeholder for tolls - not yet tracked per load
  const wcomp = 0; // Placeholder for workman's comp - not yet tracked per load
  
  // Build the values object for formula calculation
  const formulaValues: Record<string, number> = {
    payload: rate,
    carr_pay: vehicleRequiresApproval && !isApproved ? 0 : carrierPayAmount,
    disp_pay: dispPay,
    drv_pay: drvPay,
    factor: factoring,
    fuel: fuelCost,
    rental: dailyRental,
    insur: dailyInsurance,
    tolls: tolls,
    wcomp: wcomp,
    other: DAILY_OTHER_COST,
    rental_per_mile: selectedVehicle?.asset_ownership === 'leased' && selectedVehicle?.cents_per_mile
      ? selectedVehicle.cents_per_mile * totalM
      : 0,
  };
  
  // Fallback calculations for when formulas aren't configured
  const defaultMyNet =
    rate -
    factoring -
    dispPay -
    drvPay -
    wcomp -
    fuelCost -
    tolls -
    dailyRental -
    dailyInsurance -
    DAILY_OTHER_COST;
  
  const defaultCarrierNet =
    (vehicleRequiresApproval && !isApproved ? 0 : carrierPayAmount) -
    drvPay -
    wcomp -
    fuelCost -
    tolls -
    dailyRental -
    dailyInsurance -
    DAILY_OTHER_COST;
  
  const defaultBrokeringNet = rate - carrierPayAmount - dispPay - factoring;
  
  // Use calculateFormula if available, otherwise use fallback
  const myNet = calculateFormula ? calculateFormula("my_net", formulaValues) : defaultMyNet;
  const carrierNet = calculateFormula ? calculateFormula("carr_net", formulaValues) : defaultCarrierNet;
  const brokeringNet = calculateFormula ? calculateFormula("brokering_net", formulaValues) : defaultBrokeringNet;
  
  const carrierPerMile = loadedM > 0 ? carrierPayAmount / loadedM : 0;

  const dayName = format(day.date, "EEE");
  const dateStr = format(day.date, "MM/dd");
  
  

  // Calculate collapsed expenses total - sum of all selected expense columns
  // Calculate rental per mile cost for this load ($ per mile × total miles)
  const loadRentalPerMileCost = selectedVehicle?.asset_ownership === 'leased' && selectedVehicle?.cents_per_mile
    ? selectedVehicle.cents_per_mile * totalM
    : 0;
  
  const collapsedExpenseTotal = 
    (expenseGroupColumns.includes("mpg") ? (totalM > 0 ? totalM / milesPerGallon : 0) : 0) + // MPG as gallons used
    (expenseGroupColumns.includes("factor") ? factoring : 0) +
    (expenseGroupColumns.includes("disp_pay") ? dispPay : 0) +
    (expenseGroupColumns.includes("drv_pay") ? drvPay : 0) +
    (expenseGroupColumns.includes("wcomp") ? wcomp : 0) +
    (expenseGroupColumns.includes("fuel") ? fuelCost : 0) +
    (expenseGroupColumns.includes("tolls") ? tolls : 0) +
    (expenseGroupColumns.includes("rental") ? dailyRental : 0) +
    (expenseGroupColumns.includes("rental_per_mile") ? loadRentalPerMileCost : 0) +
    (expenseGroupColumns.includes("insur") ? dailyInsurance : 0) +
    (expenseGroupColumns.includes("other") ? DAILY_OTHER_COST : 0) +
    (expenseGroupColumns.includes("carr_pay") ? carrierPayAmount : 0) +
    (expenseGroupColumns.includes("carr_dollar_per_mile") ? carrierPerMile : 0) +
    (expenseGroupColumns.includes("net") ? myNet : 0) +
    (expenseGroupColumns.includes("carr_net") ? carrierNet : 0) +
    (expenseGroupColumns.includes("brokering_net") ? brokeringNet : 0);

  switch (column.id) {
    case "truck_expense":
      return (
        <TableCell
          className={cn(
            "text-right text-muted-foreground font-medium !px-2 !py-0.5 expense-rail-both",
            dragClass
          )}
        >
          {formatCurrency(collapsedExpenseTotal)}
        </TableCell>
      );
    case "pickup_date":
      return (
        <TableCell
          className={cn(
            "font-medium !px-2 !py-0.5 whitespace-nowrap cursor-pointer hover:text-primary hover:underline",
            isToday ? "text-green-600 font-bold" : "text-muted-foreground",
            dragClass
          )}
          onClick={() => navigate(`/dashboard/load/${load.id}`)}
        >
          {loadIndex === 0 && `${isToday ? "Today" : dayName} ${dateStr}`}
        </TableCell>
      );
    case "customer":
      return (
        <TableCell className={cn("truncate max-w-[140px] !px-2 !py-0.5", dragClass)} title={getCustomerName(load.customer_id)}>
          {getCustomerName(load.customer_id)}
        </TableCell>
      );
    case "route":
      return (
        <TableCell className={cn("text-xs !px-2 !py-0.5", dragClass)}>
          {load.pickup_state}→{load.delivery_state}
        </TableCell>
      );
    case "payload":
      return <TableCell className={cn("text-right font-semibold !px-2 !py-0.5", dragClass)}>{formatCurrency(rate)}</TableCell>;
    case "empty":
      return <TableCell className={cn("text-right !px-2 !py-0.5", dragClass)}>{formatNumber(emptyM, 0)}</TableCell>;
    case "loaded":
      return <TableCell className={cn("text-right !px-2 !py-0.5", dragClass)}>{formatNumber(loadedM, 0)}</TableCell>;
    case "total":
      return <TableCell className={cn("text-right font-medium !px-2 !py-0.5", dragClass)}>{formatNumber(totalM, 0)}</TableCell>;
    case "dollar_per_mile":
      return <TableCell className={cn("text-right !px-2 !py-0.5", dragClass)}>${formatNumber(dollarPerMile, 2)}</TableCell>;
    case "mpg":
      return (
        <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", expenseRailClass, dragClass)}>
          {formatNumber(milesPerGallon, 1)}
        </TableCell>
      );
    case "factor":
      return (
        <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", expenseRailClass, dragClass)}>{formatCurrency(factoring)}</TableCell>
      );
    case "disp_pay":
      return (
        <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", expenseRailClass, dragClass)}>{formatCurrency(dispPay)}</TableCell>
      );
    case "drv_pay":
      return (
        <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", expenseRailClass, dragClass)}>
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help">{formatCurrency(drvPay)}</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[250px]">
                <div className="text-xs space-y-1">
                  <div className="font-semibold">{totals.driverName || "No driver assigned"}</div>
                  {totals.driverPayPercentage != null && totals.driverPayMethod === "percentage" && (
                    <div className="text-muted-foreground">Pay Rate: {totals.driverPayPercentage}%</div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableCell>
      );
    case "wcomp":
      return <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", expenseRailClass, dragClass)}>$0.00</TableCell>;
    case "fuel":
      return (
        <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", expenseRailClass, dragClass)}>{formatCurrency(fuelCost)}</TableCell>
      );
    case "tolls":
      return <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", expenseRailClass, dragClass)}>$0.00</TableCell>;
    case "rental":
      return (
        <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", expenseRailClass, dragClass)}>{formatCurrency(dailyRental)}</TableCell>
      );
    case "rental_per_mile":
      // RCPM = load's total miles × cents_per_mile (rental cost per mile)
      return (
        <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", expenseRailClass, dragClass)}>
          {loadRentalPerMileCost > 0 ? formatCurrency(loadRentalPerMileCost) : ""}
        </TableCell>
      );
    case "insur":
      return (
        <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", expenseRailClass, dragClass)}>
          {formatCurrency(dailyInsurance)}
        </TableCell>
      );
    case "other":
      return <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", expenseRailClass, dragClass)}></TableCell>;
    case "carr_pay":
      return (
        <TableCell className={cn("text-right !px-1 !py-0.5 overflow-hidden", expenseRailClass, dragClass)}>
          {vehicleRequiresApproval ? (
            <div className="flex items-center justify-end gap-0.5 whitespace-nowrap">
              {isApproved ? (
                <>
                  <span
                    className={cn(
                      "font-bold",
                      payloadChangedAfterApproval ? "line-through text-destructive" : "text-green-600"
                    )}
                  >
                    {formatCurrency(carrierPayAmount)}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[8px] px-0.5 py-0 scale-[0.85]",
                      payloadChangedAfterApproval
                        ? "bg-red-50 text-red-700 border-red-300 cursor-pointer hover:bg-red-100"
                        : "bg-green-50 text-green-700 border-green-300"
                    )}
                    title={payloadChangedAfterApproval ? "Click to approve - Payload changed" : "Load Approved"}
                    onClick={
                      payloadChangedAfterApproval
                        ? (e) => {
                            e.stopPropagation();
                            const params = new URLSearchParams({ loadId: load.id });
                            const carrierIdForLoad = vehicles.find((v) => v.id === load.assigned_vehicle_id)?.carrier;
                            if (carrierIdForLoad) params.set("carrierId", carrierIdForLoad);
                            if (load.assigned_vehicle_id) params.set("vehicleId", load.assigned_vehicle_id);
                            navigate(`/dashboard/load-approval?${params.toString()}`);
                          }
                        : undefined
                    }
                  >
                    {payloadChangedAfterApproval ? (
                      <AlertTriangle className="h-2 w-2 mr-0.5" />
                    ) : (
                      <ShieldCheck className="h-2 w-2 mr-0.5" />
                    )}
                    LA
                  </Badge>
                </>
              ) : (
                <>
                  <span className="text-orange-600 font-bold">$0.00</span>
                  <Badge
                    variant="outline"
                    className="text-[8px] px-0.5 py-0 scale-[0.85] bg-amber-50 text-amber-700 border-amber-300 cursor-pointer hover:bg-amber-100"
                    title="Click to approve load"
                    onClick={(e) => {
                      e.stopPropagation();
                      const params = new URLSearchParams({ loadId: load.id });
                      const carrierIdForLoad = vehicles.find((v) => v.id === load.assigned_vehicle_id)?.carrier;
                      if (carrierIdForLoad) params.set("carrierId", carrierIdForLoad);
                      if (load.assigned_vehicle_id) params.set("vehicleId", load.assigned_vehicle_id);
                      navigate(`/dashboard/load-approval?${params.toString()}`);
                    }}
                  >
                    <ShieldCheck className="h-2 w-2 mr-0.5" />
                    LA
                  </Badge>
                </>
              )}
            </div>
          ) : (
            formatCurrency(carrierPayAmount)
          )}
        </TableCell>
      );
    case "carr_dollar_per_mile":
      return <TableCell className={cn("text-right !px-2 !py-0.5", expenseRailClass, dragClass)}>${formatNumber(carrierPerMile, 2)}</TableCell>;
    case "net":
      // Show N/A if current truck type is contractor but load was booked as my_truck
      if (currentTruckType === 'contractor_truck' && !isTruckTypeMismatch) {
        // Current is contractor, load is also contractor - hide my net
        return <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", expenseRailClass, dragClass)}>—</TableCell>;
      }
      if (isTruckTypeMismatch && currentTruckType === 'my_truck') {
        // Current is my_truck but load was booked as contractor - show N/A
        return <TableCell className={cn("text-right text-muted-foreground italic !px-2 !py-0.5", expenseRailClass, dragClass)}>N/A</TableCell>;
      }
      return (
        <TableCell
          className={cn("text-right font-bold !px-2 !py-0.5", myNet === null ? "text-muted-foreground" : myNet >= 0 ? "text-green-600" : "text-destructive", expenseRailClass, dragClass)}
        >
          {myNet === null ? "Config" : formatCurrency(myNet)}
        </TableCell>
      );
    case "carr_net":
      // Show N/A if current truck type is my_truck but load was booked as contractor
      if (currentTruckType === 'my_truck' && !isTruckTypeMismatch) {
        // Current is my_truck, load is also my_truck - hide carr net
        return <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", expenseRailClass, dragClass)}>—</TableCell>;
      }
      if (isTruckTypeMismatch && currentTruckType === 'contractor_truck') {
        // Current is contractor but load was booked as my_truck - show N/A
        return <TableCell className={cn("text-right text-muted-foreground italic !px-2 !py-0.5", expenseRailClass, dragClass)}>N/A</TableCell>;
      }
      return (
        <TableCell
          className={cn("text-right font-bold !px-2 !py-0.5", carrierNet === null ? "text-muted-foreground" : carrierNet >= 0 ? "text-green-600" : "text-destructive", expenseRailClass, dragClass)}
        >
          {carrierNet === null ? "Config" : formatCurrency(carrierNet)}
        </TableCell>
      );
    case "brokering_net":
      // Show N/A if current truck type is my_truck but load was booked as contractor
      if (currentTruckType === 'my_truck' && !isTruckTypeMismatch) {
        // Current is my_truck, load is also my_truck - hide brokering net
        return <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", expenseRailClass, dragClass)}>—</TableCell>;
      }
      if (isTruckTypeMismatch && currentTruckType === 'contractor_truck') {
        // Current is contractor but load was booked as my_truck - show N/A
        return <TableCell className={cn("text-right text-muted-foreground italic !px-2 !py-0.5", expenseRailClass, dragClass)}>N/A</TableCell>;
      }
      return (
        <TableCell
          className={cn("text-right font-bold !px-2 !py-0.5", brokeringNet === null ? "text-muted-foreground" : brokeringNet >= 0 ? "text-green-600" : "text-destructive", expenseRailClass, dragClass)}
        >
          {brokeringNet === null ? "Config" : formatCurrency(brokeringNet)}
        </TableCell>
      );
    case "load_owner":
      return (
        <TableCell className={cn("truncate max-w-[100px] !px-2 !py-0.5", dragClass)} title={getDispatcherName(load.assigned_dispatcher_id)}>
          {getDispatcherName(load.assigned_dispatcher_id)}
        </TableCell>
      );
    default:
      return <TableCell className={cn("!px-2 !py-0.5", dragClass)}>-</TableCell>;
  }
}

// Empty day cell renderer
function EmptyDayCellValue({
  column,
  day,
  totals,
  draggedColumn,
  dragOverColumn,
  expenseGroupColumns,
  isFirstExpense,
  isLastExpense,
}: {
  column: FleetColumn;
  day: DailyData;
  totals: Totals;
  draggedColumn: string | null;
  dragOverColumn: string | null;
  expenseGroupColumns: string[];
  isFirstExpense?: boolean;
  isLastExpense?: boolean;
}) {
  const isDraggedColumn = draggedColumn === column.id;
  const isDropTarget = dragOverColumn === column.id && dragOverColumn !== draggedColumn;
  const isBusinessDay = !isWeekend(day.date);
  const dailyRental = isBusinessDay ? totals.dailyRentalRate : 0;
  const dailyInsurance = totals.dailyInsuranceRate;
  const emptyDayNet = -(dailyRental + dailyInsurance + DAILY_OTHER_COST);
  const isToday = isSameDay(day.date, new Date());
  const dayName = format(day.date, "EEE");
  const dateStr = format(day.date, "MM/dd");

  const dragClass = cn(isDraggedColumn && "cell-column-dragging", isDropTarget && "cell-drop-target");
  
  // Determine expense rail CSS class based on position
  const getExpenseRailClass = () => {
    const isCollapsedExpense = column.id === "truck_expense";
    const hasLeftRail = isCollapsedExpense || isFirstExpense;
    const hasRightRail = isCollapsedExpense || isLastExpense;
    
    if (hasLeftRail && hasRightRail) return "expense-rail-both";
    if (hasLeftRail) return "expense-rail-left";
    if (hasRightRail) return "expense-rail-right";
    return "";
  };
  const expenseRailClass = getExpenseRailClass();
  
  // Calculate collapsed expenses total for empty days (only rental/insurance apply)
  const collapsedExpenseTotal = 
    (expenseGroupColumns.includes("rental") ? dailyRental : 0) +
    (expenseGroupColumns.includes("insur") ? dailyInsurance : 0) +
    (expenseGroupColumns.includes("other") ? DAILY_OTHER_COST : 0) +
    (expenseGroupColumns.includes("net") ? emptyDayNet : 0) +
    (expenseGroupColumns.includes("carr_net") ? emptyDayNet : 0);
  switch (column.id) {
    case "truck_expense":
      return (
        <TableCell
          className={cn(
            "text-right text-muted-foreground font-medium !px-2 !py-0.5",
            expenseRailClass,
            dragClass
          )}
        >
          {collapsedExpenseTotal !== 0 ? formatCurrency(collapsedExpenseTotal) : ""}
        </TableCell>
      );
    case "pickup_date":
      return (
        <TableCell className={cn("font-medium !px-2 !py-0.5 whitespace-nowrap", isToday && "text-green-600 font-bold", dragClass)}>
          {`${isToday ? "Today" : dayName} ${dateStr}`}
        </TableCell>
      );
    case "rental":
      return (
        <TableCell className={cn("text-right !px-2 !py-0.5", expenseRailClass, dragClass)}>
          {isBusinessDay && dailyRental > 0 ? formatCurrency(dailyRental) : ""}
        </TableCell>
      );
    case "rental_per_mile":
      // No per-mile cost on empty days (no miles driven)
      return <TableCell className={cn("text-right !px-2 !py-0.5", expenseRailClass, dragClass)}></TableCell>;
    case "insur":
      return <TableCell className={cn("text-right !px-2 !py-0.5", expenseRailClass, dragClass)}>{formatCurrency(dailyInsurance)}</TableCell>;
    case "net":
      return (
        <TableCell className={cn("text-right font-bold text-destructive !px-2 !py-0.5", expenseRailClass, dragClass)}>
          {formatCurrency(emptyDayNet)}
        </TableCell>
      );
    case "carr_net":
      return (
        <TableCell className={cn("text-right font-bold text-destructive !px-2 !py-0.5", expenseRailClass, dragClass)}>
          {formatCurrency(emptyDayNet)}
        </TableCell>
      );
    default:
      return <TableCell className={cn("!px-2 !py-0.5", expenseRailClass, dragClass)}></TableCell>;
  }
}

// Footer cell value renderer
function FooterCellValue({ 
  column, 
  totals, 
  milesPerGallon, 
  draggedColumn, 
  dragOverColumn, 
  expenseGroupColumns,
  isFirstExpense,
  isLastExpense,
}: { 
  column: FleetColumn; 
  totals: Totals; 
  milesPerGallon: number; 
  draggedColumn: string | null; 
  dragOverColumn: string | null; 
  expenseGroupColumns: string[];
  isFirstExpense?: boolean;
  isLastExpense?: boolean;
}) {
  const isDraggedColumn = draggedColumn === column.id;
  const isDropTarget = dragOverColumn === column.id && dragOverColumn !== draggedColumn;
  const dragClass = cn(isDraggedColumn && "cell-column-dragging", isDropTarget && "cell-drop-target");
  
  // Determine expense rail CSS class based on position
  const getExpenseRailClass = () => {
    const isCollapsedExpense = column.id === "truck_expense";
    const hasLeftRail = isCollapsedExpense || isFirstExpense;
    const hasRightRail = isCollapsedExpense || isLastExpense;
    
    if (hasLeftRail && hasRightRail) return "expense-rail-both";
    if (hasLeftRail) return "expense-rail-left";
    if (hasRightRail) return "expense-rail-right";
    return "";
  };
  const expenseRailClass = getExpenseRailClass();
  
  // Calculate collapsed expenses total for footer - sum all selected columns
  // Note: carrierNet and brokeringNet need to be calculated since they're not in totals
  const carrierNetTotal = totals.carrierPay - totals.driverPay - totals.workmanComp - totals.fuel - totals.tolls - totals.rental - totals.insuranceCost - totals.other;
  const brokeringNetTotal = totals.payload - totals.carrierPay - totals.dispatcherPay - totals.factoring;
  
  const collapsedExpenseFooterTotal = 
    (expenseGroupColumns.includes("mpg") ? (totals.totalMiles > 0 ? totals.totalMiles / milesPerGallon : 0) : 0) +
    (expenseGroupColumns.includes("factor") ? totals.factoring : 0) +
    (expenseGroupColumns.includes("disp_pay") ? totals.dispatcherPay : 0) +
    (expenseGroupColumns.includes("drv_pay") ? totals.driverPay : 0) +
    (expenseGroupColumns.includes("wcomp") ? totals.workmanComp : 0) +
    (expenseGroupColumns.includes("fuel") ? totals.fuel : 0) +
    (expenseGroupColumns.includes("tolls") ? totals.tolls : 0) +
    (expenseGroupColumns.includes("rental") ? totals.rental : 0) +
    (expenseGroupColumns.includes("rental_per_mile") ? totals.rentalPerMileCost : 0) +
    (expenseGroupColumns.includes("insur") ? totals.insuranceCost : 0) +
    (expenseGroupColumns.includes("other") ? totals.other : 0) +
    (expenseGroupColumns.includes("carr_pay") ? totals.carrierPay : 0) +
    (expenseGroupColumns.includes("carr_dollar_per_mile") ? (totals.loadedMiles > 0 ? totals.carrierPay / totals.loadedMiles : 0) : 0) +
    (expenseGroupColumns.includes("net") ? totals.netProfit : 0) +
    (expenseGroupColumns.includes("carr_net") ? carrierNetTotal : 0) +
    (expenseGroupColumns.includes("brokering_net") ? brokeringNetTotal : 0);
  
  switch (column.id) {
    case "truck_expense":
      return (
        <td
          className={cn(
            "px-2 py-2 text-center",
            expenseRailClass,
            dragClass
          )}
        >
          <div className="text-[10px] text-muted-foreground">COLLAPSED</div>
          <div className="font-bold">{formatCurrency(collapsedExpenseFooterTotal)}</div>
        </td>
      );
    case "pickup_date":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">P/U Date</div>
          <div className="font-bold">-</div>
        </td>
      );
    case "customer":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">Customer</div>
          <div className="font-bold">-</div>
        </td>
      );
    case "route":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">Route</div>
          <div className="font-bold">-</div>
        </td>
      );
    case "payload":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">Payload</div>
          <div className="font-bold text-primary">{formatCurrency(totals.payload)}</div>
        </td>
      );
    case "empty":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">Empty</div>
          <div className="font-bold">{formatNumber(totals.emptyMiles, 1)}</div>
        </td>
      );
    case "loaded":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">Loaded</div>
          <div className="font-bold">{formatNumber(totals.loadedMiles, 1)}</div>
        </td>
      );
    case "total":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">Total</div>
          <div className="font-bold">{formatNumber(totals.totalMiles, 0)}</div>
        </td>
      );
    case "dollar_per_mile":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">$/Mi</div>
          <div className="font-bold">${formatNumber(totals.dollarPerMile, 2)}</div>
        </td>
      );
    case "mpg":
      return (
        <td className={cn("px-2 py-2 text-center", expenseRailClass, dragClass)}>
          <div className="text-[10px] text-muted-foreground">MPG</div>
          <div className="font-bold">{formatNumber(milesPerGallon, 1)}</div>
        </td>
      );
    case "factor":
      return (
        <td className={cn("px-2 py-2 text-center", expenseRailClass, dragClass)}>
          <div className="text-[10px] text-muted-foreground">Factor</div>
          <div className="font-bold">{formatCurrency(totals.factoring)}</div>
        </td>
      );
    case "disp_pay":
      return (
        <td className={cn("px-2 py-2 text-center", expenseRailClass, dragClass)}>
          <div className="text-[10px] text-muted-foreground">Disp Pay</div>
          <div className="font-bold">{formatCurrency(totals.dispatcherPay)}</div>
        </td>
      );
    case "drv_pay":
      return (
        <td className={cn("px-2 py-2 text-center", expenseRailClass, dragClass)}>
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-help">
                  <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                    Drv Pay
                    {totals.driverPayActive && (
                      <span className="text-[8px] text-emerald-500">
                        ({totals.driverPayMethod === "percentage"
                          ? "%"
                          : totals.driverPayMethod === "mileage"
                          ? "$/mi"
                          : totals.driverPayMethod === "hourly"
                          ? "$/hr"
                          : totals.driverPayMethod === "hybrid"
                          ? "hyb"
                          : "$"})
                      </span>
                    )}
                  </div>
                  <div className={cn("font-bold", totals.driverPayActive ? "text-foreground" : "text-muted-foreground")}>
                    {formatCurrency(totals.driverPay)}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[250px]">
                <div className="text-xs space-y-1">
                  <div className="font-semibold">{totals.driverName || "No driver assigned"}</div>
                  {totals.driverPayPercentage != null && totals.driverPayMethod === "percentage" && (
                    <div className="text-muted-foreground">Pay Rate: {totals.driverPayPercentage}%</div>
                  )}
                  {totals.driverPayMethod && (
                    <div className="text-muted-foreground capitalize">Method: {totals.driverPayMethod}</div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </td>
      );
    case "wcomp":
      return (
        <td className={cn("px-2 py-2 text-center", expenseRailClass, dragClass)}>
          <div className="text-[10px] text-muted-foreground">WComp</div>
          <div className="font-bold">{formatCurrency(totals.workmanComp)}</div>
        </td>
      );
    case "fuel":
      return (
        <td className={cn("px-2 py-2 text-center", expenseRailClass, dragClass)}>
          <div className="text-[10px] text-muted-foreground">Fuel</div>
          <div className="font-bold">{formatCurrency(totals.fuel)}</div>
        </td>
      );
    case "tolls":
      return (
        <td className={cn("px-2 py-2 text-center", expenseRailClass, dragClass)}>
          <div className="text-[10px] text-muted-foreground">Tolls</div>
          <div className="font-bold">{formatCurrency(totals.tolls)}</div>
        </td>
      );
    case "rental":
      return (
        <td className={cn("px-2 py-2 text-center", expenseRailClass, dragClass)}>
          <div className="text-[10px] text-muted-foreground">RCPD</div>
          <div className="font-bold">{formatCurrency(totals.rental)}</div>
        </td>
      );
    case "rental_per_mile":
      return (
        <td className={cn("px-2 py-2 text-center", expenseRailClass, dragClass)}>
          <div className="text-[10px] text-muted-foreground">RCPM</div>
          <div className="font-bold">{formatCurrency(totals.rentalPerMileCost || 0)}</div>
        </td>
      );
    case "insur":
      return (
        <td className={cn("px-2 py-2 text-center", expenseRailClass, dragClass)}>
          <div className="text-[10px] text-muted-foreground">Insur</div>
          <div className="font-bold">{formatCurrency(totals.insuranceCost)}</div>
        </td>
      );
    case "other":
      return (
        <td className={cn("px-2 py-2 text-center", expenseRailClass, dragClass)}>
          <div className="text-[10px] text-muted-foreground">Other</div>
          <div className="font-bold">{formatCurrency(totals.other)}</div>
        </td>
      );
    case "carr_pay":
      return (
        <td className={cn("px-2 py-2 text-center", expenseRailClass, dragClass)}>
          <div className="text-[10px] text-muted-foreground">Carr Pay</div>
          <div className="font-bold">{formatCurrency(totals.carrierPay)}</div>
        </td>
      );
    case "carr_dollar_per_mile":
      return (
        <td className={cn("px-2 py-2 text-center", expenseRailClass, dragClass)}>
          <div className="text-[10px] text-muted-foreground">$/Mi</div>
          <div className="font-bold">${formatNumber(totals.carrierPerMile, 2)}</div>
        </td>
      );
    case "net":
      return (
        <td className={cn("px-2 py-2 text-center", expenseRailClass, dragClass)}>
          <div className="text-[10px] text-muted-foreground">Net</div>
          <div className={cn("font-bold", totals.netProfit >= 0 ? "text-green-600" : "text-red-600")}>
            {formatCurrency(totals.netProfit)}
          </div>
        </td>
      );
    case "carr_net":
      return (
        <td className={cn("px-2 py-2 text-center", expenseRailClass, dragClass)}>
          <div className="text-[10px] text-muted-foreground">Carr NET</div>
          <div className={cn("font-bold", totals.netProfit >= 0 ? "text-green-600" : "text-red-600")}>
            {formatCurrency(totals.netProfit)}
          </div>
        </td>
      );
    case "brokering_net":
      return (
        <td className={cn("px-2 py-2 text-center", expenseRailClass, dragClass)}>
          <div className="text-[10px] text-muted-foreground">Broker Net</div>
          <div className="font-bold">-</div>
        </td>
      );
    case "load_owner":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">Load Owner</div>
          <div className="font-bold">-</div>
        </td>
      );
    default:
      return <td className={cn("px-2 py-2 text-center", dragClass)}>-</td>;
  }
}

export function FleetFinancialsTable({
  dailyData,
  totals,
  vehicles,
  selectedVehicleId,
  milesPerGallon,
  dollarPerGallon,
  factoringPercentage,
  showColumnLines,
  isEditMode,
  getCustomerName,
  getDispatcherPay,
  getDriverPay,
  getDispatcherName,
  getWeeklyTotal,
  visibleColumns,
  draggedColumn,
  dragOverColumn,
  dragPosition,
  dragStartPosition,
  handleDragStart,
  handleDragOver,
  handleDragEnd,
  expenseGroupCollapsed,
  expenseGroupColumns,
  calculateFormula,
}: FleetFinancialsTableProps) {
  const navigate = useNavigate();

  // Build the effective columns list - replace expense columns with merged column when collapsed
  const effectiveColumns = useMemo(() => {
    if (!expenseGroupCollapsed) {
      return visibleColumns;
    }
    
    // Find the first expense column's position to insert the merged column there
    let firstExpenseIndex = -1;
    const nonExpenseColumns: FleetColumn[] = [];
    
    for (let i = 0; i < visibleColumns.length; i++) {
      const col = visibleColumns[i];
      if (expenseGroupColumns.includes(col.id)) {
        if (firstExpenseIndex === -1) {
          firstExpenseIndex = nonExpenseColumns.length;
        }
        // Skip this column - it will be merged
      } else {
        nonExpenseColumns.push(col);
      }
    }
    
    // If no expense columns found, return original
    if (firstExpenseIndex === -1) {
      return visibleColumns;
    }
    
    // Insert the merged column at the first expense column position
    const mergedColumn: FleetColumn = {
      id: "truck_expense",
      label: "COLLAPSED EXP",
      width: "w-[100px]",
      align: "right",
      visible: true,
    };
    
    const result = [...nonExpenseColumns];
    result.splice(firstExpenseIndex, 0, mergedColumn);
    return result;
  }, [visibleColumns, expenseGroupCollapsed, expenseGroupColumns]);

  const minTableWidth = useMemo(() => {
    // Calculate approximate width from columns
    return effectiveColumns.reduce((acc, col) => {
      const width = parseInt(col.width.replace("w-[", "").replace("px]", ""), 10) || 80;
      return acc + width;
    }, 0);
  }, [effectiveColumns]);

  const dragVars = useMemo<CSSProperties | undefined>(() => {
    if (!draggedColumn || !dragPosition || !dragStartPosition) return undefined;
    const dx = dragPosition.x - dragStartPosition.x;
    const dy = dragPosition.y - dragStartPosition.y;
    return {
      ["--ff-drag-x" as any]: `${dx}px`,
      ["--ff-drag-y" as any]: `${dy}px`,
    } as CSSProperties;
  }, [draggedColumn, dragPosition, dragStartPosition]);

  // Get the dragged column info for overlay
  const draggedColumnInfo = useMemo(() => {
    if (!draggedColumn) return null;
    return effectiveColumns.find((c) => c.id === draggedColumn);
  }, [draggedColumn, effectiveColumns]);

  // Calculate which columns are first/last in the expense group (for orange rails when expanded)
  const expenseBoundaries = useMemo(() => {
    if (expenseGroupCollapsed) return { first: null, last: null };
    
    // Find the first and last expense columns in the visible columns order
    let firstExpenseCol: string | null = null;
    let lastExpenseCol: string | null = null;
    
    for (const col of effectiveColumns) {
      if (expenseGroupColumns.includes(col.id)) {
        if (firstExpenseCol === null) firstExpenseCol = col.id;
        lastExpenseCol = col.id;
      }
    }
    
    return { first: firstExpenseCol, last: lastExpenseCol };
  }, [effectiveColumns, expenseGroupColumns, expenseGroupCollapsed]);

  return (
    <div
      className={cn(
        "relative",
        isEditMode && "edit-mode-active rounded-lg",
        draggedColumn && dragPosition && dragStartPosition && "ff-dragging"
      )}
      style={dragVars}
    >
      {/* Floating drag overlay that follows mouse */}
      {draggedColumn && dragPosition && draggedColumnInfo && createPortal(
        <div 
          className="fixed pointer-events-none z-[9999] transition-none"
          style={{
            left: dragPosition.x,
            top: dragPosition.y,
            transform: 'translate(-50%, -20px)',
          }}
        >
          <div className="column-drag-overlay flex flex-col items-center animate-scale-in">
            <div className="bg-gradient-to-b from-success/30 to-success/50 backdrop-blur-sm border-2 border-success rounded-lg px-4 py-3 shadow-2xl min-w-[80px]">
              <GripVertical className="h-4 w-4 mx-auto text-success mb-1 rotate-90" />
              <div className="text-xs font-bold text-success-foreground text-center uppercase tracking-wide">
                {draggedColumnInfo.label}
              </div>
            </div>
            <div className="w-1 h-8 bg-gradient-to-b from-success to-success/30 rounded-full" />
            <div className="text-[10px] text-muted-foreground bg-background/90 px-2 py-0.5 rounded border shadow-sm">
              Drop on target column
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* High-tech overlay effect when in edit mode */}
      {isEditMode && (
        <div className="absolute inset-0 pointer-events-none z-20 bg-gradient-to-b from-primary/5 via-transparent to-primary/5 rounded-lg" />
      )}
      
      <table
        className={cn(
          "table-glossy w-full caption-bottom text-sm table-fixed",
          showColumnLines && "table-column-lines",
          isEditMode && "relative z-10"
        )}
        style={{ minWidth: `${minTableWidth}px` }}
      >
        {/* Sticky Header with edit mode styling */}
        <thead className={cn(
          "sticky top-0 z-30 shadow-sm [&_th]:sticky [&_th]:top-0 [&_th]:z-30",
          isEditMode 
            ? "bg-gradient-to-b from-primary/10 to-primary/5 [&_th]:bg-transparent" 
            : "bg-muted [&_th]:bg-muted"
        )}>
          <tr className={cn(isEditMode && "border-b-2 border-primary/30")}>
            {effectiveColumns.map((column) => (
              <ColumnHeader
                key={column.id}
                column={column}
                isEditMode={isEditMode}
                draggedColumn={draggedColumn}
                dragOverColumn={dragOverColumn}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                isFirstExpense={column.id === expenseBoundaries.first}
                isLastExpense={column.id === expenseBoundaries.last}
              />
            ))}
          </tr>
        </thead>

      <TableBody>
        {dailyData.map((day, index) => {
          const hasLoads = day.loads.length > 0;
          const isToday = isSameDay(day.date, new Date());

          return (
            <Fragment key={day.date.toISOString()}>
              {hasLoads ? (
                day.loads.map((load, loadIndex) => (
                  <TableRow
                    key={load.id}
                    className={cn(
                      "hover:bg-muted/30 h-[25px]",
                      isToday && "!bg-none !bg-yellow-100 dark:!bg-yellow-500/20"
                    )}
                  >
                    {effectiveColumns.map((column) => (
                      <CellValue
                        key={column.id}
                        column={column}
                        load={load}
                        loadIndex={loadIndex}
                        day={day}
                        totals={totals}
                        milesPerGallon={milesPerGallon}
                        dollarPerGallon={dollarPerGallon}
                        factoringPercentage={factoringPercentage}
                        vehicles={vehicles}
                        selectedVehicleId={selectedVehicleId}
                        getCustomerName={getCustomerName}
                        getDispatcherPay={getDispatcherPay}
                        getDriverPay={getDriverPay}
                        getDispatcherName={getDispatcherName}
                        navigate={navigate}
                        draggedColumn={draggedColumn}
                        dragOverColumn={dragOverColumn}
                        expenseGroupColumns={expenseGroupColumns}
                        isFirstExpense={column.id === expenseBoundaries.first}
                        isLastExpense={column.id === expenseBoundaries.last}
                        calculateFormula={calculateFormula}
                      />
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow
                  className={cn(
                    "text-muted-foreground h-[25px]",
                    isToday && "!bg-none !bg-yellow-100 dark:!bg-yellow-500/20"
                  )}
                >
                  {effectiveColumns.map((column) => (
                    <EmptyDayCellValue 
                      key={column.id} 
                      column={column} 
                      day={day} 
                      totals={totals} 
                      draggedColumn={draggedColumn} 
                      dragOverColumn={dragOverColumn} 
                      expenseGroupColumns={expenseGroupColumns}
                      isFirstExpense={column.id === expenseBoundaries.first}
                      isLastExpense={column.id === expenseBoundaries.last}
                    />
                  ))}
                </TableRow>
              )}

              {/* Weekly Summary Row */}
              {day.isWeekEnd && (
                <TableRow className="bg-muted/50 border-t-2">
                  <TableCell colSpan={effectiveColumns.length - 1} className="text-right font-semibold">
                    Weekly Total:
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-bold",
                      getWeeklyTotal(index) >= 0 ? "text-green-600" : "text-destructive"
                    )}
                  >
                    {formatCurrency(getWeeklyTotal(index))}
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>

      {/* Sticky Footer */}
      <tfoot className={cn(
        "sticky bottom-0 z-30 border-t shadow-md [&_td]:sticky [&_td]:bottom-0 [&_td]:z-30",
        isEditMode 
          ? "bg-muted border-t-2 border-primary/30 [&_td]:bg-muted"
          : "bg-muted/95 [&_td]:bg-muted/95"
      )}>
          <tr>
            {effectiveColumns.map((column) => (
              <FooterCellValue 
                key={column.id} 
                column={column} 
                totals={totals} 
                milesPerGallon={milesPerGallon} 
                draggedColumn={draggedColumn} 
                dragOverColumn={dragOverColumn} 
                expenseGroupColumns={expenseGroupColumns}
                isFirstExpense={column.id === expenseBoundaries.first}
                isLastExpense={column.id === expenseBoundaries.last}
              />
            ))}
          </tr>
      </tfoot>
    </table>
    </div>
  );
}

export { useFleetColumns };
