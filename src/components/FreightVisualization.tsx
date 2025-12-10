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
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
  color: string;
  darkColor: string;
  lightColor: string;
}

const PALLET_COLORS = [
  { main: "#3B82F6", dark: "#2563EB", light: "#60A5FA" }, // Blue
  { main: "#10B981", dark: "#059669", light: "#34D399" }, // Green
  { main: "#8B5CF6", dark: "#7C3AED", light: "#A78BFA" }, // Purple
  { main: "#F59E0B", dark: "#D97706", light: "#FBBF24" }, // Amber
  { main: "#EF4444", dark: "#DC2626", light: "#F87171" }, // Red
  { main: "#06B6D4", dark: "#0891B2", light: "#22D3EE" }, // Cyan
  { main: "#EC4899", dark: "#DB2777", light: "#F472B6" }, // Pink
  { main: "#84CC16", dark: "#65A30D", light: "#A3E635" }, // Lime
];

export function FreightVisualization({
  pallets,
  truckLength,
  truckWidth,
  truckHeight,
  fits,
  isStackable = false,
}: FreightVisualizationProps) {
  // Calculate scale to fit visualization - larger base size
  const baseSize = 280;
  const maxDim = Math.max(truckLength, truckWidth, truckHeight);
  const scale = baseSize / maxDim;

  // Place pallets in truck space using simple row-based packing
  const placedPallets = useMemo(() => {
    const placed: PlacedPallet[] = [];
    let currentX = 0;
    let currentZ = 0;
    let rowMaxLength = 0;

    // Expand pallets into individual units
    const units: { length: number; width: number; height: number; colorIdx: number }[] = [];
    pallets.forEach((pallet, palletIdx) => {
      for (let i = 0; i < pallet.quantity; i++) {
        units.push({
          length: pallet.length,
          width: pallet.width,
          height: pallet.height,
          colorIdx: palletIdx % PALLET_COLORS.length,
        });
      }
    });

    // Sort by width descending for better packing
    units.sort((a, b) => b.width - a.width);

    // Stack tracking for stackable mode
    const heightMap: Map<string, number> = new Map();

    units.forEach((unit) => {
      let { length, width, height, colorIdx } = unit;
      
      // Check if we need to start a new row
      if (currentZ + width > truckWidth) {
        currentX += rowMaxLength;
        currentZ = 0;
        rowMaxLength = 0;
      }

      // Try rotation if it doesn't fit
      if (currentZ + width > truckWidth && currentZ + length <= truckWidth) {
        [length, width] = [width, length];
      }

      // Check stacking
      const gridKey = `${Math.floor(currentX / 24)}-${Math.floor(currentZ / 24)}`;
      const baseHeight = isStackable ? (heightMap.get(gridKey) || 0) : 0;

      // Check if fits in truck
      if (currentX + length <= truckLength && 
          currentZ + width <= truckWidth && 
          baseHeight + height <= truckHeight) {
        const colors = PALLET_COLORS[colorIdx];
        placed.push({
          x: currentX,
          y: baseHeight,
          z: currentZ,
          length,
          width,
          height,
          color: colors.main,
          darkColor: colors.dark,
          lightColor: colors.light,
        });

        if (isStackable) {
          heightMap.set(gridKey, baseHeight + height);
        }

        currentZ += width;
        rowMaxLength = Math.max(rowMaxLength, length);
      } else if (currentX + length <= truckLength) {
        currentX += rowMaxLength;
        currentZ = 0;
        rowMaxLength = length;

        if (currentX + length <= truckLength) {
          const colors = PALLET_COLORS[colorIdx];
          placed.push({
            x: currentX,
            y: 0,
            z: currentZ,
            length,
            width,
            height,
            color: colors.main,
            darkColor: colors.dark,
            lightColor: colors.light,
          });
          currentZ += width;
        }
      }
    });

    return placed;
  }, [pallets, truckLength, truckWidth, truckHeight, isStackable]);

  const scaledTruck = {
    length: truckLength * scale,
    width: truckWidth * scale,
    height: truckHeight * scale,
  };

  return (
    <div className="relative w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl overflow-hidden" style={{ minHeight: "320px" }}>
      {/* Grid pattern background */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: "20px 20px",
        }}
      />

      {/* 3D Scene Container */}
      <div className="flex items-center justify-center py-8" style={{ minHeight: "280px" }}>
        <div
          style={{
            perspective: "1000px",
            perspectiveOrigin: "50% 40%",
          }}
        >
          <div
            style={{
              transform: "rotateX(-20deg) rotateY(-30deg) rotateZ(0deg)",
              transformStyle: "preserve-3d",
              position: "relative",
            }}
          >
            {/* Floor with gradient */}
            <div
              style={{
                position: "absolute",
                width: `${scaledTruck.length}px`,
                height: `${scaledTruck.width}px`,
                background: "linear-gradient(135deg, #374151 0%, #1F2937 100%)",
                border: "2px solid #4B5563",
                boxShadow: "inset 0 0 30px rgba(0,0,0,0.3)",
                transform: "translateZ(0px)",
                transformStyle: "preserve-3d",
              }}
            >
              {/* Floor grid lines */}
              <div 
                className="absolute inset-0"
                style={{
                  backgroundImage: `
                    linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
                  `,
                  backgroundSize: `${48 * scale}px ${48 * scale}px`,
                }}
              />
            </div>

            {/* Left Wall */}
            <div
              style={{
                position: "absolute",
                width: `${scaledTruck.length}px`,
                height: `${scaledTruck.height}px`,
                background: "linear-gradient(180deg, rgba(55,65,81,0.6) 0%, rgba(31,41,55,0.8) 100%)",
                borderLeft: "2px solid #4B5563",
                borderTop: "2px solid #4B5563",
                borderRight: "2px solid #4B5563",
                transform: `rotateX(90deg) translateZ(${scaledTruck.width}px)`,
                transformOrigin: "bottom",
                transformStyle: "preserve-3d",
              }}
            />

            {/* Right Wall */}
            <div
              style={{
                position: "absolute",
                width: `${scaledTruck.length}px`,
                height: `${scaledTruck.height}px`,
                background: "linear-gradient(180deg, rgba(75,85,99,0.4) 0%, rgba(55,65,81,0.6) 100%)",
                borderLeft: "2px solid #6B7280",
                borderTop: "2px solid #6B7280",
                borderRight: "2px solid #6B7280",
                transform: `rotateX(90deg) translateZ(0px)`,
                transformOrigin: "bottom",
                transformStyle: "preserve-3d",
              }}
            />

            {/* Back Wall */}
            <div
              style={{
                position: "absolute",
                width: `${scaledTruck.width}px`,
                height: `${scaledTruck.height}px`,
                background: "linear-gradient(180deg, rgba(55,65,81,0.5) 0%, rgba(31,41,55,0.7) 100%)",
                borderTop: "2px solid #4B5563",
                borderLeft: "2px solid #4B5563",
                borderRight: "2px solid #4B5563",
                transform: `rotateX(90deg) rotateY(90deg) translateZ(0px)`,
                transformOrigin: "bottom left",
                transformStyle: "preserve-3d",
              }}
            />

            {/* Ceiling frame (dashed) */}
            <div
              style={{
                position: "absolute",
                width: `${scaledTruck.length}px`,
                height: `${scaledTruck.width}px`,
                border: "2px dashed rgba(107,114,128,0.5)",
                transform: `translateZ(${scaledTruck.height}px)`,
                transformStyle: "preserve-3d",
              }}
            />

            {/* Height indicator line */}
            <div
              style={{
                position: "absolute",
                width: "2px",
                height: `${scaledTruck.height}px`,
                background: "linear-gradient(180deg, #9CA3AF 0%, #6B7280 100%)",
                left: `${scaledTruck.length + 8}px`,
                top: "0",
                transform: `rotateX(90deg)`,
                transformOrigin: "bottom",
              }}
            />

            {/* Pallets */}
            {placedPallets.map((pallet, idx) => {
              const pW = pallet.length * scale;
              const pD = pallet.width * scale;
              const pH = pallet.height * scale;
              const pX = pallet.x * scale;
              const pZ = pallet.z * scale;
              const pY = pallet.y * scale;

              return (
                <div
                  key={idx}
                  style={{
                    position: "absolute",
                    width: `${pW}px`,
                    height: `${pD}px`,
                    transform: `translate(${pX}px, ${pZ}px) translateZ(${pY}px)`,
                    transformStyle: "preserve-3d",
                  }}
                >
                  {/* Bottom face */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: pallet.darkColor,
                      border: "1px solid rgba(0,0,0,0.3)",
                    }}
                  />

                  {/* Top face */}
                  <div
                    style={{
                      position: "absolute",
                      width: `${pW}px`,
                      height: `${pD}px`,
                      background: `linear-gradient(135deg, ${pallet.lightColor} 0%, ${pallet.color} 100%)`,
                      border: "1px solid rgba(0,0,0,0.2)",
                      transform: `translateZ(${pH}px)`,
                      boxShadow: "inset 0 0 10px rgba(255,255,255,0.2)",
                    }}
                  />

                  {/* Front face */}
                  <div
                    style={{
                      position: "absolute",
                      width: `${pW}px`,
                      height: `${pH}px`,
                      background: `linear-gradient(180deg, ${pallet.color} 0%, ${pallet.darkColor} 100%)`,
                      border: "1px solid rgba(0,0,0,0.2)",
                      transform: `rotateX(90deg) translateZ(${pD}px)`,
                      transformOrigin: "bottom",
                    }}
                  />

                  {/* Right side face */}
                  <div
                    style={{
                      position: "absolute",
                      width: `${pD}px`,
                      height: `${pH}px`,
                      background: `linear-gradient(180deg, ${pallet.darkColor} 0%, ${pallet.darkColor} 100%)`,
                      border: "1px solid rgba(0,0,0,0.2)",
                      transform: `rotateX(90deg) rotateY(90deg) translateZ(${pW}px)`,
                      transformOrigin: "bottom left",
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dimension Labels */}
      <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 text-white">
        <div className="text-xs font-medium text-white/70 mb-1">Truck Dimensions</div>
        <div className="text-sm font-mono">
          {truckLength}" L × {truckWidth}" W × {truckHeight}" H
        </div>
      </div>

      {/* Pallet count */}
      <div className="absolute bottom-3 right-3 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 text-white">
        <div className="text-xs font-medium text-white/70 mb-1">Pallets Placed</div>
        <div className="text-lg font-bold">{placedPallets.length}</div>
      </div>

      {/* Fit indicator */}
      <div className={`absolute top-3 right-3 px-3 py-1.5 rounded-full text-sm font-bold flex items-center gap-1.5 ${
        fits 
          ? "bg-green-500/90 text-white shadow-lg shadow-green-500/30" 
          : "bg-red-500/90 text-white shadow-lg shadow-red-500/30"
      }`}>
        {fits ? (
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

      {/* Legend */}
      {pallets.length > 0 && (
        <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2">
          <div className="text-xs font-medium text-white/70 mb-1.5">Pallet Types</div>
          <div className="flex flex-wrap gap-1.5">
            {pallets.map((pallet, idx) => (
              <div 
                key={idx} 
                className="flex items-center gap-1.5 text-xs text-white"
              >
                <div 
                  className="w-3 h-3 rounded-sm shadow-sm" 
                  style={{ background: PALLET_COLORS[idx % PALLET_COLORS.length].main }}
                />
                <span className="font-mono">{pallet.quantity}×</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
