import { useMemo, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, isSameDay, isWeekend } from "date-fns";
import { cn } from "@/lib/utils";
import { ShieldCheck, AlertTriangle, GripVertical } from "lucide-react";
import { FleetColumn, useFleetColumns } from "@/hooks/useFleetColumns";

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
  getCustomerName: (customerId: string | null) => string;
  getDispatcherPay: (load: Load) => number;
  getDriverPay: (load: Load) => number;
  getWeeklyTotal: (endIndex: number) => number;
}

const DAILY_OTHER_COST = 0;

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
};

const formatNumber = (value: number, decimals = 1) => {
  return value.toFixed(decimals);
};

// Draggable column header component
function DraggableHeader({
  column,
  draggedColumn,
  dragOverColumn,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  column: FleetColumn;
  draggedColumn: string | null;
  dragOverColumn: string | null;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDragEnd: () => void;
}) {
  const isDragging = draggedColumn === column.id;
  const isOver = dragOverColumn === column.id;

  return (
    <th
      draggable
      onDragStart={() => onDragStart(column.id)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(column.id);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        column.width,
        "px-2 py-2 font-medium whitespace-nowrap cursor-grab select-none transition-all group",
        column.align === "right" && "text-right",
        column.align === "center" && "text-center",
        column.align === "left" && "text-left",
        isDragging && "opacity-50 bg-primary/10",
        isOver && "bg-primary/20 border-l-2 border-primary"
      )}
    >
      <div className="flex items-center gap-0.5">
        <GripVertical className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity flex-shrink-0" />
        <span className={cn("flex-1", column.align === "right" && "text-right")}>{column.label}</span>
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
}) {
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
  const carrierNet =
    (vehicleRequiresApproval && !isApproved ? 0 : carrierPayAmount) -
    factoring -
    dispPay -
    drvPay -
    fuelCost -
    dailyRental -
    dailyInsurance -
    DAILY_OTHER_COST;
  const carrierPerMile = loadedM > 0 ? carrierPayAmount / loadedM : 0;

  const dayName = format(day.date, "EEE");
  const dateStr = format(day.date, "MM/dd");

  switch (column.id) {
    case "pickup_date":
      return (
        <TableCell
          className={cn(
            "font-medium !px-2 !py-0.5 whitespace-nowrap cursor-pointer hover:text-primary hover:underline",
            isToday ? "text-green-600 font-bold" : "text-muted-foreground"
          )}
          onClick={() => navigate(`/dashboard/load/${load.id}`)}
        >
          {loadIndex === 0 && `${isToday ? "Today" : dayName} ${dateStr}`}
        </TableCell>
      );
    case "customer":
      return (
        <TableCell className="truncate max-w-[140px] !px-2 !py-0.5" title={getCustomerName(load.customer_id)}>
          {getCustomerName(load.customer_id)}
        </TableCell>
      );
    case "route":
      return (
        <TableCell className="text-xs !px-2 !py-0.5">
          {load.pickup_state}→{load.delivery_state}
        </TableCell>
      );
    case "payload":
      return <TableCell className="text-right font-semibold !px-2 !py-0.5">{formatCurrency(rate)}</TableCell>;
    case "empty":
      return <TableCell className="text-right !px-2 !py-0.5">{formatNumber(emptyM, 0)}</TableCell>;
    case "loaded":
      return <TableCell className="text-right !px-2 !py-0.5">{formatNumber(loadedM, 0)}</TableCell>;
    case "total":
      return <TableCell className="text-right font-medium !px-2 !py-0.5">{formatNumber(totalM, 0)}</TableCell>;
    case "dollar_per_mile":
      return <TableCell className="text-right !px-2 !py-0.5">${formatNumber(dollarPerMile, 2)}</TableCell>;
    case "mpg":
      return (
        <TableCell className="text-right text-muted-foreground !px-2 !py-0.5">
          {formatNumber(milesPerGallon, 1)}
        </TableCell>
      );
    case "factor":
      return (
        <TableCell className="text-right text-muted-foreground !px-2 !py-0.5">{formatCurrency(factoring)}</TableCell>
      );
    case "disp_pay":
      return (
        <TableCell className="text-right text-muted-foreground !px-2 !py-0.5">{formatCurrency(dispPay)}</TableCell>
      );
    case "drv_pay":
      return (
        <TableCell className="text-right text-muted-foreground !px-2 !py-0.5">{formatCurrency(drvPay)}</TableCell>
      );
    case "wcomp":
      return <TableCell className="text-right text-muted-foreground !px-2 !py-0.5">$0.00</TableCell>;
    case "fuel":
      return (
        <TableCell className="text-right text-muted-foreground !px-2 !py-0.5">{formatCurrency(fuelCost)}</TableCell>
      );
    case "tolls":
      return <TableCell className="text-right text-muted-foreground !px-2 !py-0.5">$0.00</TableCell>;
    case "rental":
      return (
        <TableCell className="text-right text-muted-foreground !px-2 !py-0.5">{formatCurrency(dailyRental)}</TableCell>
      );
    case "insur":
      return (
        <TableCell className="text-right text-muted-foreground !px-2 !py-0.5">
          {formatCurrency(dailyInsurance)}
        </TableCell>
      );
    case "other":
      return <TableCell className="text-right text-muted-foreground !px-2 !py-0.5"></TableCell>;
    case "carr_pay":
      return (
        <TableCell className="text-right !px-2 !py-0.5">
          {vehicleRequiresApproval ? (
            <div className="flex items-center justify-end gap-1">
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
      return <TableCell className="text-right !px-2 !py-0.5">${formatNumber(carrierPerMile, 2)}</TableCell>;
    case "net":
      return (
        <TableCell
          className={cn("text-right font-bold !px-2 !py-0.5", carrierNet >= 0 ? "text-green-600" : "text-destructive")}
        >
          {formatCurrency(carrierNet)}
        </TableCell>
      );
    case "carr_net":
      return (
        <TableCell
          className={cn("text-right font-bold !px-2 !py-0.5", carrierNet >= 0 ? "text-green-600" : "text-destructive")}
        >
          {formatCurrency(carrierNet)}
        </TableCell>
      );
    default:
      return <TableCell className="!px-2 !py-0.5">-</TableCell>;
  }
}

// Empty day cell renderer
function EmptyDayCellValue({
  column,
  day,
  totals,
}: {
  column: FleetColumn;
  day: DailyData;
  totals: Totals;
}) {
  const isBusinessDay = !isWeekend(day.date);
  const dailyRental = isBusinessDay ? totals.dailyRentalRate : 0;
  const dailyInsurance = totals.dailyInsuranceRate;
  const emptyDayNet = -(dailyRental + dailyInsurance + DAILY_OTHER_COST);
  const isToday = isSameDay(day.date, new Date());
  const dayName = format(day.date, "EEE");
  const dateStr = format(day.date, "MM/dd");

  switch (column.id) {
    case "pickup_date":
      return (
        <TableCell className={cn("font-medium !px-2 !py-0.5 whitespace-nowrap", isToday && "text-green-600 font-bold")}>
          {`${isToday ? "Today" : dayName} ${dateStr}`}
        </TableCell>
      );
    case "rental":
      return (
        <TableCell className="text-right !px-2 !py-0.5">
          {isBusinessDay && dailyRental > 0 ? formatCurrency(dailyRental) : ""}
        </TableCell>
      );
    case "insur":
      return <TableCell className="text-right !px-2 !py-0.5">{formatCurrency(dailyInsurance)}</TableCell>;
    case "net":
      return (
        <TableCell className="text-right font-bold text-destructive !px-2 !py-0.5">
          {formatCurrency(emptyDayNet)}
        </TableCell>
      );
    case "carr_net":
      return (
        <TableCell className="text-right font-bold text-destructive !px-2 !py-0.5">
          {formatCurrency(emptyDayNet)}
        </TableCell>
      );
    default:
      return <TableCell className="!px-2 !py-0.5"></TableCell>;
  }
}

// Footer cell value renderer
function FooterCellValue({ column, totals, milesPerGallon }: { column: FleetColumn; totals: Totals; milesPerGallon: number }) {
  switch (column.id) {
    case "pickup_date":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">P/U Date</div>
          <div className="font-bold">-</div>
        </td>
      );
    case "customer":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">Customer</div>
          <div className="font-bold">-</div>
        </td>
      );
    case "route":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">Route</div>
          <div className="font-bold">-</div>
        </td>
      );
    case "payload":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">Payload</div>
          <div className="font-bold text-primary">{formatCurrency(totals.payload)}</div>
        </td>
      );
    case "empty":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">Empty</div>
          <div className="font-bold">{formatNumber(totals.emptyMiles, 1)}</div>
        </td>
      );
    case "loaded":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">Loaded</div>
          <div className="font-bold">{formatNumber(totals.loadedMiles, 1)}</div>
        </td>
      );
    case "total":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">Total</div>
          <div className="font-bold">{formatNumber(totals.totalMiles, 0)}</div>
        </td>
      );
    case "dollar_per_mile":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">$/Mi</div>
          <div className="font-bold">${formatNumber(totals.dollarPerMile, 2)}</div>
        </td>
      );
    case "mpg":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">MPG</div>
          <div className="font-bold">{formatNumber(milesPerGallon, 1)}</div>
        </td>
      );
    case "factor":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">Factor</div>
          <div className="font-bold">{formatCurrency(totals.factoring)}</div>
        </td>
      );
    case "disp_pay":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">Disp Pay</div>
          <div className="font-bold">{formatCurrency(totals.dispatcherPay)}</div>
        </td>
      );
    case "drv_pay":
      return (
        <td className="px-2 py-2 text-center">
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
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">WComp</div>
          <div className="font-bold">{formatCurrency(totals.workmanComp)}</div>
        </td>
      );
    case "fuel":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">Fuel</div>
          <div className="font-bold">{formatCurrency(totals.fuel)}</div>
        </td>
      );
    case "tolls":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">Tolls</div>
          <div className="font-bold">{formatCurrency(totals.tolls)}</div>
        </td>
      );
    case "rental":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">Rental</div>
          <div className="font-bold">{formatCurrency(totals.rental)}</div>
        </td>
      );
    case "insur":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">Insur</div>
          <div className="font-bold">{formatCurrency(totals.insuranceCost)}</div>
        </td>
      );
    case "other":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">Other</div>
          <div className="font-bold">{formatCurrency(totals.other)}</div>
        </td>
      );
    case "carr_pay":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">Carr Pay</div>
          <div className="font-bold">{formatCurrency(totals.carrierPay)}</div>
        </td>
      );
    case "carr_dollar_per_mile":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">$/Mi</div>
          <div className="font-bold">${formatNumber(totals.carrierPerMile, 2)}</div>
        </td>
      );
    case "net":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">Net</div>
          <div className={cn("font-bold", totals.netProfit >= 0 ? "text-green-600" : "text-red-600")}>
            {formatCurrency(totals.netProfit)}
          </div>
        </td>
      );
    case "carr_net":
      return (
        <td className="px-2 py-2 text-center">
          <div className="text-[10px] text-muted-foreground">Carr NET</div>
          <div className={cn("font-bold", totals.netProfit >= 0 ? "text-green-600" : "text-red-600")}>
            {formatCurrency(totals.netProfit)}
          </div>
        </td>
      );
    default:
      return <td className="px-2 py-2 text-center">-</td>;
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
  getCustomerName,
  getDispatcherPay,
  getDriverPay,
  getWeeklyTotal,
}: FleetFinancialsTableProps) {
  const navigate = useNavigate();
  const {
    visibleColumns,
    draggedColumn,
    dragOverColumn,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  } = useFleetColumns();

  const minTableWidth = useMemo(() => {
    // Calculate approximate width from columns
    return visibleColumns.reduce((acc, col) => {
      const width = parseInt(col.width.replace("w-[", "").replace("px]", ""), 10) || 80;
      return acc + width;
    }, 0);
  }, [visibleColumns]);

  return (
    <table
      className={cn(
        "table-glossy w-full caption-bottom text-sm table-fixed",
        showColumnLines ? "[&_td]:border-x [&_td]:border-border/50 [&_th]:border-x [&_th]:border-border/50" : ""
      )}
      style={{ minWidth: `${minTableWidth}px` }}
    >
      {/* Sticky Header */}
      <thead className="sticky top-0 z-30 bg-muted shadow-sm [&_th]:sticky [&_th]:top-0 [&_th]:z-30 [&_th]:bg-muted">
        <tr>
          {visibleColumns.map((column) => (
            <DraggableHeader
              key={column.id}
              column={column}
              draggedColumn={draggedColumn}
              dragOverColumn={dragOverColumn}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
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
                    <EmptyDayCellValue key={column.id} column={column} day={day} totals={totals} />
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
      <tfoot className="sticky bottom-0 z-30 bg-muted/95 border-t shadow-md [&_td]:sticky [&_td]:bottom-0 [&_td]:z-30 [&_td]:bg-muted/95">
        <tr>
          {visibleColumns.map((column) => (
            <FooterCellValue key={column.id} column={column} totals={totals} milesPerGallon={milesPerGallon} />
          ))}
        </tr>
      </tfoot>
    </table>
  );
}

export { useFleetColumns };
