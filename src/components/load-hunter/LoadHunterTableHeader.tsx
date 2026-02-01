import React from "react";
import { TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus, Minus } from "lucide-react";
import type { ActiveFilter, LoadHunterTheme } from "@/types/loadHunter";

interface LoadHunterTableHeaderProps {
  activeFilter: ActiveFilter;
  loadHunterTheme: LoadHunterTheme;
  showIdColumns: boolean;
  onToggleIdColumns: () => void;
}

export function LoadHunterTableHeader({
  activeFilter,
  loadHunterTheme,
  showIdColumns,
  onToggleIdColumns,
}: LoadHunterTableHeaderProps) {
  const headerStyle = loadHunterTheme === 'aurora' 
    ? { 
        background: 'linear-gradient(180deg, #a78bfa 0%, #8b5cf6 40%, #7c3aed 100%)',
        borderBottom: '3px solid #5b21b6',
        boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.15), 0 4px 8px rgba(91,33,182,0.35)',
        textShadow: 'none'
      } 
    : undefined;

  const rowStyle = loadHunterTheme === 'aurora' 
    ? { 
        background: 'transparent', 
        boxShadow: 'none',
        textShadow: 'none'
      } 
    : undefined;

  const cellClass = loadHunterTheme === 'aurora' 
    ? '!text-white font-medium uppercase !tracking-normal [text-shadow:none]' 
    : 'text-white font-semibold tracking-wide';

  const cellStyle = loadHunterTheme === 'aurora' ? { textShadow: 'none' } : undefined;

  return (
    <TableHeader 
      className={loadHunterTheme === 'aurora' ? 'rounded-t-lg' : ''}
      style={headerStyle}
    >
      <TableRow 
        className={loadHunterTheme === 'aurora' ? 'h-12' : 'h-9'}
        style={rowStyle}
      >
        {/* Expand/collapse button cell */}
        <TableHead className={`w-0 p-0 relative ${cellClass}`} style={cellStyle}>
          <Button
            variant="ghost"
            size="sm"
            className={`absolute left-0 top-1/2 -translate-y-1/2 h-4 w-4 p-0 ${loadHunterTheme === 'aurora' ? 'text-white hover:bg-white/20' : 'text-white hover:bg-white/20'}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleIdColumns();
            }}
            title={showIdColumns ? "Hide ID columns" : "Show ID columns"}
          >
            {showIdColumns ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          </Button>
        </TableHead>

        {/* ID columns */}
        {showIdColumns && (
          <>
            <TableHead className={`w-[80px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Order #</TableHead>
            <TableHead className={`w-[110px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Load ID</TableHead>
            {activeFilter !== 'all' && (
              <TableHead className={`w-[100px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Match ID</TableHead>
            )}
          </>
        )}

        {/* Truck column - expanded width */}
        {activeFilter !== 'all' && (
          <TableHead className={`w-[240px] min-w-[240px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Truck - Drivers<br/>Carrier</TableHead>
        )}

        {/* Customer - expanded width */}
        <TableHead className={`w-[220px] min-w-[220px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Customer</TableHead>

        {/* Received/Expires */}
        {activeFilter !== 'mybids' && activeFilter !== 'booked' && (
          <TableHead className={`w-[95px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Received<br/>Expires</TableHead>
        )}

        {/* Times */}
        <TableHead className={`w-[115px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Pickup Time<br/>Deliver Time</TableHead>

        {/* Locations */}
        <TableHead className={`w-[130px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Origin<br/>Destination</TableHead>

        {/* Miles */}
        <TableHead className={`w-[60px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Empty<br/>Loaded</TableHead>

        {/* Vehicle Type */}
        <TableHead className={`w-[100px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Vehicle Type<br/>Weight</TableHead>

        {/* Pieces */}
        <TableHead className={`w-[70px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Pieces<br/>Dims</TableHead>

        {/* Avail */}
        <TableHead className={`w-[45px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Avail<br/>Posted</TableHead>

        {/* Source */}
        <TableHead className={`w-[65px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Source</TableHead>

        {/* Actions for non-mybids/booked */}
        {activeFilter !== 'mybids' && activeFilter !== 'booked' && (
          <TableHead className={`w-[85px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Actions</TableHead>
        )}

        {/* My Bids extra columns */}
        {activeFilter === 'mybids' && (
          <>
            <TableHead className={`w-[70px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Rate</TableHead>
            <TableHead className={`w-[90px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Dispatcher</TableHead>
            <TableHead className={`w-[60px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Award</TableHead>
            <TableHead className={`w-[80px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Bid Time</TableHead>
          </>
        )}

        {/* Booked extra columns */}
        {activeFilter === 'booked' && (
          <>
            <TableHead className={`w-[70px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Rate</TableHead>
            <TableHead className={`w-[90px] py-2 text-[12px] leading-[1.1] ${cellClass}`} style={cellStyle}>Dispatcher</TableHead>
          </>
        )}
      </TableRow>
    </TableHeader>
  );
}
