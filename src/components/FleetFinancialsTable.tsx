import { useMemo, Fragment } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, isSameDay, isWeekend } from "date-fns";
import { cn } from "@/lib/utils";
import { ShieldCheck, AlertTriangle, GripVertical } from "lucide-react";
import { FleetColumn, useFleetColumns, DragPosition } from "@/hooks/useFleetColumns";

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
}

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
  getWeeklyTotal: (endIndex: number) => number;
  // Column management props
  visibleColumns: FleetColumn[];
  draggedColumn: string | null;
  dragOverColumn: string | null;
  dragPosition: DragPosition | null;
  handleDragStart: (columnId: string, e?: React.MouseEvent) => void;
  handleDragOver: (columnId: string) => void;
  handleDragEnd: () => void;
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
}: {
  column: FleetColumn;
  isEditMode: boolean;
  draggedColumn: string | null;
  dragOverColumn: string | null;
  onDragStart: (id: string, e?: React.MouseEvent) => void;
  onDragOver: (id: string) => void;
}) {
  const isDragging = draggedColumn === column.id;
  const isOver = dragOverColumn === column.id && !isDragging;

  if (!isEditMode) {
    // Normal view - centered text, no truncation
    return (
      <th
        className={cn(
          column.width,
          "px-2 py-2 font-medium whitespace-nowrap text-center"
        )}
      >
        {column.label}
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
        column.align === "right" && "text-right",
        column.align === "center" && "text-center",
        column.align === "left" && "text-left",
        !isDragging && !isOver && "column-edit-mode",
        isDragging && "opacity-30 cell-column-dragging",
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
  navigate,
  draggedColumn,
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
  navigate: (path: string) => void;
  draggedColumn: string | null;
}) {
  const isDraggedColumn = draggedColumn === column.id;
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
  const isApproved = load.carrier_approved === true;
  const payloadChangedAfterApproval = isApproved && load.approved_payload !== null && load.approved_payload !== rate;
  const carrierPayAmount = load.carrier_rate || rate;
  const tolls = 0; // Placeholder for tolls - not yet tracked per load
  const wcomp = 0; // Placeholder for workman's comp - not yet tracked per load
  
  // My Net = Payload - Factoring - Dispatch - driver pay - workman comp - fuel - tolls - rental - insurance - other
  const myNet =
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
  
  // Carr Net = Carr Pay - driver pay - workman comp - fuel - tolls - rental - insurance - other
  const carrierNet =
    (vehicleRequiresApproval && !isApproved ? 0 : carrierPayAmount) -
    drvPay -
    wcomp -
    fuelCost -
    tolls -
    dailyRental -
    dailyInsurance -
    DAILY_OTHER_COST;
  
  // Brokering Net = Payload - Carr Pay - Dispatch Pay - Factoring
  const brokeringNet = rate - carrierPayAmount - dispPay - factoring;
  
  const carrierPerMile = loadedM > 0 ? carrierPayAmount / loadedM : 0;

  const dayName = format(day.date, "EEE");
  const dateStr = format(day.date, "MM/dd");
  
  const dragClass = isDraggedColumn ? "cell-column-dragging" : "";

  switch (column.id) {
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
        <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", dragClass)}>
          {formatNumber(milesPerGallon, 1)}
        </TableCell>
      );
    case "factor":
      return (
        <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", dragClass)}>{formatCurrency(factoring)}</TableCell>
      );
    case "disp_pay":
      return (
        <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", dragClass)}>{formatCurrency(dispPay)}</TableCell>
      );
    case "drv_pay":
      return (
        <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", dragClass)}>{formatCurrency(drvPay)}</TableCell>
      );
    case "wcomp":
      return <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", dragClass)}>$0.00</TableCell>;
    case "fuel":
      return (
        <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", dragClass)}>{formatCurrency(fuelCost)}</TableCell>
      );
    case "tolls":
      return <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", dragClass)}>$0.00</TableCell>;
    case "rental":
      return (
        <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", dragClass)}>{formatCurrency(dailyRental)}</TableCell>
      );
    case "insur":
      return (
        <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", dragClass)}>
          {formatCurrency(dailyInsurance)}
        </TableCell>
      );
    case "other":
      return <TableCell className={cn("text-right text-muted-foreground !px-2 !py-0.5", dragClass)}></TableCell>;
    case "carr_pay":
      return (
        <TableCell className={cn("text-right !px-1 !py-0.5 overflow-hidden", dragClass)}>
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
                            navigate(`/dashboard/load-approval?loadId=${load.id}`);
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
                    className="text-[8px] px-0.5 py-0 scale-[0.85] bg-amber-50 text-amber-700 border-amber-300"
                    title="Pending Approval"
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
      return <TableCell className={cn("text-right !px-2 !py-0.5", dragClass)}>${formatNumber(carrierPerMile, 2)}</TableCell>;
    case "net":
      return (
        <TableCell
          className={cn("text-right font-bold !px-2 !py-0.5", myNet >= 0 ? "text-green-600" : "text-destructive", dragClass)}
        >
          {formatCurrency(myNet)}
        </TableCell>
      );
    case "carr_net":
      return (
        <TableCell
          className={cn("text-right font-bold !px-2 !py-0.5", carrierNet >= 0 ? "text-green-600" : "text-destructive", dragClass)}
        >
          {formatCurrency(carrierNet)}
        </TableCell>
      );
    case "brokering_net":
      return (
        <TableCell
          className={cn("text-right font-bold !px-2 !py-0.5", brokeringNet >= 0 ? "text-green-600" : "text-destructive", dragClass)}
        >
          {formatCurrency(brokeringNet)}
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
}: {
  column: FleetColumn;
  day: DailyData;
  totals: Totals;
  draggedColumn: string | null;
}) {
  const isDraggedColumn = draggedColumn === column.id;
  const isBusinessDay = !isWeekend(day.date);
  const dailyRental = isBusinessDay ? totals.dailyRentalRate : 0;
  const dailyInsurance = totals.dailyInsuranceRate;
  const emptyDayNet = -(dailyRental + dailyInsurance + DAILY_OTHER_COST);
  const isToday = isSameDay(day.date, new Date());
  const dayName = format(day.date, "EEE");
  const dateStr = format(day.date, "MM/dd");

  const dragClass = isDraggedColumn ? "cell-column-dragging" : "";

  switch (column.id) {
    case "pickup_date":
      return (
        <TableCell className={cn("font-medium !px-2 !py-0.5 whitespace-nowrap", isToday && "text-green-600 font-bold", dragClass)}>
          {`${isToday ? "Today" : dayName} ${dateStr}`}
        </TableCell>
      );
    case "rental":
      return (
        <TableCell className={cn("text-right !px-2 !py-0.5", dragClass)}>
          {isBusinessDay && dailyRental > 0 ? formatCurrency(dailyRental) : ""}
        </TableCell>
      );
    case "insur":
      return <TableCell className={cn("text-right !px-2 !py-0.5", dragClass)}>{formatCurrency(dailyInsurance)}</TableCell>;
    case "net":
      return (
        <TableCell className={cn("text-right font-bold text-destructive !px-2 !py-0.5", dragClass)}>
          {formatCurrency(emptyDayNet)}
        </TableCell>
      );
    case "carr_net":
      return (
        <TableCell className={cn("text-right font-bold text-destructive !px-2 !py-0.5", dragClass)}>
          {formatCurrency(emptyDayNet)}
        </TableCell>
      );
    default:
      return <TableCell className={cn("!px-2 !py-0.5", dragClass)}></TableCell>;
  }
}

// Footer cell value renderer
function FooterCellValue({ column, totals, milesPerGallon, draggedColumn }: { column: FleetColumn; totals: Totals; milesPerGallon: number; draggedColumn: string | null }) {
  const isDraggedColumn = draggedColumn === column.id;
  const dragClass = isDraggedColumn ? "cell-column-dragging" : "";
  
  switch (column.id) {
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
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">MPG</div>
          <div className="font-bold">{formatNumber(milesPerGallon, 1)}</div>
        </td>
      );
    case "factor":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">Factor</div>
          <div className="font-bold">{formatCurrency(totals.factoring)}</div>
        </td>
      );
    case "disp_pay":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">Disp Pay</div>
          <div className="font-bold">{formatCurrency(totals.dispatcherPay)}</div>
        </td>
      );
    case "drv_pay":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
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
        </td>
      );
    case "wcomp":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">WComp</div>
          <div className="font-bold">{formatCurrency(totals.workmanComp)}</div>
        </td>
      );
    case "fuel":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">Fuel</div>
          <div className="font-bold">{formatCurrency(totals.fuel)}</div>
        </td>
      );
    case "tolls":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">Tolls</div>
          <div className="font-bold">{formatCurrency(totals.tolls)}</div>
        </td>
      );
    case "rental":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">Rental</div>
          <div className="font-bold">{formatCurrency(totals.rental)}</div>
        </td>
      );
    case "insur":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">Insur</div>
          <div className="font-bold">{formatCurrency(totals.insuranceCost)}</div>
        </td>
      );
    case "other":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">Other</div>
          <div className="font-bold">{formatCurrency(totals.other)}</div>
        </td>
      );
    case "carr_pay":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">Carr Pay</div>
          <div className="font-bold">{formatCurrency(totals.carrierPay)}</div>
        </td>
      );
    case "carr_dollar_per_mile":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">$/Mi</div>
          <div className="font-bold">${formatNumber(totals.carrierPerMile, 2)}</div>
        </td>
      );
    case "net":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">Net</div>
          <div className={cn("font-bold", totals.netProfit >= 0 ? "text-green-600" : "text-red-600")}>
            {formatCurrency(totals.netProfit)}
          </div>
        </td>
      );
    case "carr_net":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">Carr NET</div>
          <div className={cn("font-bold", totals.netProfit >= 0 ? "text-green-600" : "text-red-600")}>
            {formatCurrency(totals.netProfit)}
          </div>
        </td>
      );
    case "brokering_net":
      return (
        <td className={cn("px-2 py-2 text-center", dragClass)}>
          <div className="text-[10px] text-muted-foreground">Broker Net</div>
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
  getWeeklyTotal,
  visibleColumns,
  draggedColumn,
  dragOverColumn,
  dragPosition,
  handleDragStart,
  handleDragOver,
  handleDragEnd,
}: FleetFinancialsTableProps) {
  const navigate = useNavigate();

  const minTableWidth = useMemo(() => {
    // Calculate approximate width from columns
    return visibleColumns.reduce((acc, col) => {
      const width = parseInt(col.width.replace("w-[", "").replace("px]", ""), 10) || 80;
      return acc + width;
    }, 0);
  }, [visibleColumns]);

  // Get the dragged column info for overlay
  const draggedColumnInfo = useMemo(() => {
    if (!draggedColumn) return null;
    return visibleColumns.find(c => c.id === draggedColumn);
  }, [draggedColumn, visibleColumns]);

  return (
    <div className={cn("relative", isEditMode && "edit-mode-active overflow-hidden rounded-lg")}>
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
          showColumnLines ? "[&_td]:border-x [&_td]:border-border/50 [&_th]:border-x [&_th]:border-border/50" : "",
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
            {visibleColumns.map((column) => (
              <ColumnHeader
                key={column.id}
                column={column}
                isEditMode={isEditMode}
                draggedColumn={draggedColumn}
                dragOverColumn={dragOverColumn}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
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
                    {visibleColumns.map((column) => (
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
                        navigate={navigate}
                        draggedColumn={draggedColumn}
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
                  {visibleColumns.map((column) => (
                    <EmptyDayCellValue key={column.id} column={column} day={day} totals={totals} draggedColumn={draggedColumn} />
                  ))}
                </TableRow>
              )}

              {/* Weekly Summary Row */}
              {day.isWeekEnd && (
                <TableRow className="bg-muted/50 border-t-2">
                  <TableCell colSpan={visibleColumns.length - 1} className="text-right font-semibold">
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
          ? "bg-gradient-to-t from-primary/10 to-primary/5 [&_td]:bg-transparent border-t-2 border-primary/30"
          : "bg-muted/95 [&_td]:bg-muted/95"
      )}>
        <tr>
          {visibleColumns.map((column) => (
            <FooterCellValue key={column.id} column={column} totals={totals} milesPerGallon={milesPerGallon} draggedColumn={draggedColumn} />
          ))}
        </tr>
      </tfoot>
    </table>
    </div>
  );
}

export { useFleetColumns };
