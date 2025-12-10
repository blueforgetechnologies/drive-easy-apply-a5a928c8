import { useMemo } from "react";

interface Pallet {
  quantity: number;
  length: number;
  width: number;
  height: number;
}

interface FreightVisualizationProps {
  pallets: Pallet[];
  truckLength: number;
  truckWidth: number;
  truckHeight: number;
  fits: boolean;
  isStackable?: boolean;
}

interface PlacedPallet {
  x: number;
  z: number;
  length: number;
  width: number;
  height: number;
  stackLevel: number;
  color: string;
  label: string;
  stackedOn?: PlacedPallet[]; // Pallets stacked on top of this one
}

const PALLET_COLORS = [
  "#3B82F6", // Blue
  "#10B981", // Green
  "#8B5CF6", // Purple
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#06B6D4", // Cyan
  "#EC4899", // Pink
  "#84CC16", // Lime
];

export function FreightVisualization({
  pallets,
  truckLength,
  truckWidth,
  truckHeight,
  fits,
  isStackable = false,
}: FreightVisualizationProps) {
  // Scale to fit container - horizontal layout (length is horizontal, width is vertical)
  const containerWidth = 400;
  const containerHeight = 200;
  const padding = 40;
  
  const scaleX = (containerWidth - padding * 2) / truckLength;
  const scaleY = (containerHeight - padding * 2) / truckWidth;
  const scale = Math.min(scaleX, scaleY);

  const scaledTruck = {
    length: truckLength * scale,
    width: truckWidth * scale,
  };

  // Total pallet count
  const totalPalletCount = pallets.reduce((sum, p) => sum + p.quantity, 0);

  // Place pallets in truck space
  const { placedPallets, overflowPallets, usedLength } = useMemo(() => {
    const placed: PlacedPallet[] = [];
    const overflow: PlacedPallet[] = [];
    let maxUsedLength = 0;

    // Expand pallets into individual units with labels
    const units: { length: number; width: number; height: number; colorIdx: number; unitNum: number }[] = [];
    let unitCounter = 0;
    pallets.forEach((pallet, palletIdx) => {
      for (let i = 0; i < pallet.quantity; i++) {
        unitCounter++;
        units.push({
          length: pallet.length,
          width: pallet.width,
          height: pallet.height,
          colorIdx: palletIdx % PALLET_COLORS.length,
          unitNum: unitCounter,
        });
      }
    });

    // Sort by height descending when stacking (put taller items on bottom first)
    const sortedUnits = isStackable 
      ? [...units].sort((a, b) => b.height - a.height)
      : [...units];

    // Track placed base pallets with their current stack height
    interface PlacedBase {
      pallet: PlacedPallet;
      currentHeight: number;
      x: number;
      z: number;
      length: number;
      width: number;
    }
    const basePallets: PlacedBase[] = [];

    // Simple row-based packing
    let currentX = 0;
    let currentZ = 0;
    let rowMaxLength = 0;

    for (const unit of sortedUnits) {
      let { length, width, height, colorIdx, unitNum } = unit;
      let placed_this = false;

      // If stackable, first try to stack on existing pallets
      if (isStackable) {
        for (const base of basePallets) {
          // Check if this pallet can stack on the base
          // Footprint must fit and height must not exceed truck height
          const fitsOnBase = (
            (length <= base.length && width <= base.width) ||
            (width <= base.length && length <= base.width) // rotated
          );
          
          if (fitsOnBase && base.currentHeight + height <= truckHeight) {
            // Stack it!
            const stackedPallet: PlacedPallet = {
              x: base.x,
              z: base.z,
              length: length <= base.length ? length : width,
              width: length <= base.length ? width : length,
              height,
              stackLevel: base.pallet.stackedOn ? base.pallet.stackedOn.length + 1 : 1,
              color: PALLET_COLORS[colorIdx],
              label: `${unitNum}`,
            };
            
            if (!base.pallet.stackedOn) {
              base.pallet.stackedOn = [];
            }
            base.pallet.stackedOn.push(stackedPallet);
            base.currentHeight += height;
            placed_this = true;
            break;
          }
        }
      }

      if (!placed_this) {
        // Try to place as new base pallet
        // Check if we need to start a new row
        if (currentZ + width > truckWidth) {
          // Try rotation
          if (currentZ + length <= truckWidth) {
            [length, width] = [width, length];
          } else {
            // Start new row
            currentX += rowMaxLength;
            currentZ = 0;
            rowMaxLength = 0;
          }
        }

        // Try both orientations
        const orientations = [
          { l: length, w: width },
          { l: width, w: length }
        ];

        for (const orient of orientations) {
          if (currentX + orient.l <= truckLength && 
              currentZ + orient.w <= truckWidth &&
              height <= truckHeight) {
            
            const newPallet: PlacedPallet = {
              x: currentX,
              z: currentZ,
              length: orient.l,
              width: orient.w,
              height,
              stackLevel: 0,
              color: PALLET_COLORS[colorIdx],
              label: `${unitNum}`,
              stackedOn: [],
            };
            placed.push(newPallet);
            
            basePallets.push({
              pallet: newPallet,
              currentHeight: height,
              x: currentX,
              z: currentZ,
              length: orient.l,
              width: orient.w,
            });

            currentZ += orient.w;
            rowMaxLength = Math.max(rowMaxLength, orient.l);
            maxUsedLength = Math.max(maxUsedLength, currentX + orient.l);
            placed_this = true;
            break;
          }
        }

        // If still not placed, try starting a new row
        if (!placed_this && currentZ > 0) {
          currentX += rowMaxLength;
          currentZ = 0;
          rowMaxLength = 0;

          for (const orient of orientations) {
            if (currentX + orient.l <= truckLength && 
                currentZ + orient.w <= truckWidth &&
                height <= truckHeight) {
              
              const newPallet: PlacedPallet = {
                x: currentX,
                z: currentZ,
                length: orient.l,
                width: orient.w,
                height,
                stackLevel: 0,
                color: PALLET_COLORS[colorIdx],
                label: `${unitNum}`,
                stackedOn: [],
              };
              placed.push(newPallet);
              
              basePallets.push({
                pallet: newPallet,
                currentHeight: height,
                x: currentX,
                z: currentZ,
                length: orient.l,
                width: orient.w,
              });

              currentZ += orient.w;
              rowMaxLength = Math.max(rowMaxLength, orient.l);
              maxUsedLength = Math.max(maxUsedLength, currentX + orient.l);
              placed_this = true;
              break;
            }
          }
        }
      }

      // If couldn't place, add to overflow
      if (!placed_this) {
        overflow.push({
          x: 0,
          z: 0,
          length,
          width,
          height,
          stackLevel: 0,
          color: PALLET_COLORS[colorIdx],
          label: `${unitNum}`,
        });
      }
    }

    return { placedPallets: placed, overflowPallets: overflow, usedLength: maxUsedLength };
  }, [pallets, truckLength, truckWidth, truckHeight, isStackable]);

  const offsetX = (containerWidth - scaledTruck.length) / 2;
  const offsetY = (containerHeight - scaledTruck.width) / 2;

  return (
    <div className="relative w-full bg-slate-900 rounded-xl overflow-hidden" style={{ minHeight: "280px" }}>
      {/* Title */}
      <div className="absolute top-3 left-3 text-white/70 text-xs font-medium">
        Top-Down View (looking through roof)
      </div>

      {/* Fit indicator - account for overflow pallets */}
      {(() => {
        const actuallyFits = fits && overflowPallets.length === 0;
        return (
          <div className={`absolute top-3 right-3 px-3 py-1.5 rounded-full text-sm font-bold flex items-center gap-1.5 ${
            actuallyFits 
              ? "bg-green-500/90 text-white shadow-lg shadow-green-500/30" 
              : "bg-red-500/90 text-white shadow-lg shadow-red-500/30"
          }`}>
            {actuallyFits ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
                FITS
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
                NO FIT
              </>
            )}
          </div>
        );
      })()}

      {/* SVG Container */}
      <svg 
        viewBox={`0 0 ${containerWidth} ${containerHeight}`}
        className="w-full"
        style={{ minHeight: "220px" }}
      >
        {/* Truck floor */}
        <g transform={`translate(${offsetX}, ${offsetY})`}>
          {/* Floor background */}
          <rect
            x={0}
            y={0}
            width={scaledTruck.length}
            height={scaledTruck.width}
            fill="#1E293B"
            stroke="#475569"
            strokeWidth={2}
            rx={4}
          />

          {/* Floor grid */}
          {Array.from({ length: Math.floor(truckLength / 48) + 1 }).map((_, i) => (
            <line
              key={`vgrid-${i}`}
              x1={i * 48 * scale}
              y1={0}
              x2={i * 48 * scale}
              y2={scaledTruck.width}
              stroke="#334155"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          ))}
          {Array.from({ length: Math.floor(truckWidth / 48) + 1 }).map((_, i) => (
            <line
              key={`hgrid-${i}`}
              x1={0}
              y1={i * 48 * scale}
              x2={scaledTruck.length}
              y2={i * 48 * scale}
              stroke="#334155"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          ))}

          {/* Door opening indicator (at the end, looking from back) */}
          <rect
            x={scaledTruck.length - 4}
            y={0}
            width={4}
            height={scaledTruck.width}
            fill="#059669"
            opacity={0.6}
          />
          <text
            x={scaledTruck.length + 8}
            y={scaledTruck.width / 2}
            fill="#10B981"
            fontSize={10}
            textAnchor="start"
            dominantBaseline="middle"
            transform={`rotate(90, ${scaledTruck.length + 8}, ${scaledTruck.width / 2})`}
          >
            DOOR
          </text>

          {/* Pallets - only base pallets, with stacked items shown as smaller squares */}
          {placedPallets.map((pallet, idx) => {
            const pW = pallet.length * scale;
            const pH = pallet.width * scale;
            const pX = pallet.x * scale;
            const pY = pallet.z * scale;
            const hasStacked = pallet.stackedOn && pallet.stackedOn.length > 0;

            return (
              <g key={idx}>
                {/* Base pallet rectangle */}
                <rect
                  x={pX + 1}
                  y={pY + 1}
                  width={pW - 2}
                  height={pH - 2}
                  fill={pallet.color}
                  stroke="rgba(0,0,0,0.3)"
                  strokeWidth={1}
                  rx={2}
                  opacity={0.9}
                />

                {/* Diagonal lines for base pallet */}
                <line
                  x1={pX + 3}
                  y1={pY + 3}
                  x2={pX + pW - 3}
                  y2={pY + pH - 3}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth={1}
                />
                <line
                  x1={pX + pW - 3}
                  y1={pY + 3}
                  x2={pX + 3}
                  y2={pY + pH - 3}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth={1}
                />

                {/* Pallet dimensions label */}
                {pW > 30 && pH > 20 && (
                  <text
                    x={pX + pW / 2}
                    y={pY + pH / 2 - (hasStacked ? 10 : 0)}
                    fill="white"
                    fontSize={pW > 50 ? 9 : 7}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontWeight="bold"
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                  >
                    {pallet.length}"×{pallet.width}"
                  </text>
                )}


                {/* Show stacked pallet dimensions as small text labels */}
                {hasStacked && pallet.stackedOn?.map((stacked, sIdx) => {
                  const stackCount = pallet.stackedOn!.length;
                  const labelY = pY + pH / 2 + 6 + sIdx * 10;
                  const dimText = `${stacked.length}"×${stacked.width}"`;

                  return (
                    <g key={`stack-label-${sIdx}`}>
                      <rect
                        x={pX + 3}
                        y={labelY - 6}
                        width={pW - 6}
                        height={10}
                        fill={stacked.color}
                        stroke="white"
                        strokeWidth={1.5}
                        rx={2}
                        opacity={0.9}
                      />
                      <text
                        x={pX + pW / 2}
                        y={labelY}
                        fill="white"
                        fontSize={7}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontWeight="bold"
                        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
                      >
                        {dimText}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Dimension arrows */}
          {/* Length arrow (horizontal) */}
          <line
            x1={0}
            y1={scaledTruck.width + 15}
            x2={scaledTruck.length}
            y2={scaledTruck.width + 15}
            stroke="#94A3B8"
            strokeWidth={1}
            markerEnd="url(#arrowhead)"
            markerStart="url(#arrowhead-start)"
          />
          <text
            x={scaledTruck.length / 2}
            y={scaledTruck.width + 28}
            fill="#94A3B8"
            fontSize={11}
            textAnchor="middle"
            fontWeight="500"
          >
            {truckLength}" length
          </text>

          {/* Width arrow (vertical) */}
          <line
            x1={-15}
            y1={0}
            x2={-15}
            y2={scaledTruck.width}
            stroke="#94A3B8"
            strokeWidth={1}
          />
          <text
            x={-25}
            y={scaledTruck.width / 2}
            fill="#94A3B8"
            fontSize={11}
            textAnchor="middle"
            fontWeight="500"
            transform={`rotate(-90, -25, ${scaledTruck.width / 2})`}
          >
            {truckWidth}" width
          </text>
        </g>

        {/* Arrow markers */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6 Z" fill="#94A3B8" />
          </marker>
          <marker
            id="arrowhead-start"
            markerWidth="6"
            markerHeight="6"
            refX="1"
            refY="3"
            orient="auto"
          >
            <path d="M6,0 L0,3 L6,6 Z" fill="#94A3B8" />
          </marker>
        </defs>
      </svg>

      {/* Bottom info bar */}
      {(() => {
        // Calculate total placed including stacked
        const stackedCount = placedPallets.reduce((sum, p) => sum + (p.stackedOn?.length || 0), 0);
        const totalPlaced = placedPallets.length + stackedCount;
        
        return (
          <div className="flex justify-between items-center px-4 py-2 bg-black/30 border-t border-white/10">
            <div className="flex items-center gap-4">
              <div className="text-white text-sm">
                <span className="text-white/60">Placed:</span>{" "}
                <span className="font-bold">{totalPlaced}</span>
                <span className="text-white/60"> / {totalPalletCount}</span>
                {stackedCount > 0 && (
                  <span className="text-amber-400 ml-1">({stackedCount} stacked)</span>
                )}
              </div>
              <div className="text-cyan-400 text-sm font-medium">
                <span className="text-white/60">Cargo depth:</span>{" "}
                <span className="font-bold">{usedLength}"</span>
                <span className="text-white/60"> / {truckLength}"</span>
                <span className="text-cyan-300 ml-1">({Math.round((usedLength / truckLength) * 100)}%)</span>
              </div>
              {overflowPallets.length > 0 && (
                <div className="text-red-400 text-xs flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {overflowPallets.length} won't fit
                </div>
              )}
              {isStackable && stackedCount > 0 && (
                <div className="text-amber-400 text-xs flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-amber-500 flex items-center justify-center text-[9px] text-white font-bold">+{stackedCount}</div>
                  = stacked on base
                </div>
              )}
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {pallets.map((pallet, idx) => (
                <div key={idx} className="flex items-center gap-1 text-xs text-white/80">
                  <div 
                    className="w-3 h-3 rounded-sm" 
                    style={{ background: PALLET_COLORS[idx % PALLET_COLORS.length] }}
                  />
                  <span>{pallet.quantity}× {pallet.length}"×{pallet.width}"×{pallet.height}"</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Overflow pallets indicator */}
      {overflowPallets.length > 0 && (
        <div className="px-4 py-2 bg-red-500/20 border-t border-red-500/30">
          <div className="text-red-400 text-xs font-medium mb-1">
            These pallets don't fit in the truck:
          </div>
          <div className="flex gap-2 flex-wrap">
            {overflowPallets.map((pallet, idx) => (
              <div 
                key={idx}
                className="px-2 py-1 rounded text-xs font-mono"
                style={{ 
                  background: pallet.color,
                  opacity: 0.7
                }}
              >
                #{pallet.label}: {pallet.length}"×{pallet.width}"×{pallet.height}"
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
