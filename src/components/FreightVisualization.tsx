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
}

const PALLET_COLORS = [
  "hsl(200, 70%, 50%)",
  "hsl(150, 70%, 45%)",
  "hsl(280, 60%, 55%)",
  "hsl(30, 80%, 50%)",
  "hsl(340, 70%, 55%)",
  "hsl(180, 60%, 45%)",
  "hsl(60, 70%, 45%)",
  "hsl(220, 60%, 55%)",
];

export function FreightVisualization({
  pallets,
  truckLength,
  truckWidth,
  truckHeight,
  fits,
  isStackable = false,
}: FreightVisualizationProps) {
  // Calculate scale to fit visualization
  const maxDim = Math.max(truckLength, truckWidth, truckHeight);
  const scale = 180 / maxDim;

  // Place pallets in truck space using simple row-based packing
  const placedPallets = useMemo(() => {
    const placed: PlacedPallet[] = [];
    let currentX = 0;
    let currentZ = 0;
    let rowMaxLength = 0;
    let colorIndex = 0;

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
      // Allow rotation - pick orientation that fits better
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
        placed.push({
          x: currentX,
          y: baseHeight,
          z: currentZ,
          length,
          width,
          height,
          color: PALLET_COLORS[colorIdx],
        });

        if (isStackable) {
          heightMap.set(gridKey, baseHeight + height);
        }

        currentZ += width;
        rowMaxLength = Math.max(rowMaxLength, length);
      } else if (currentX + length <= truckLength) {
        // Start new row
        currentX += rowMaxLength;
        currentZ = 0;
        rowMaxLength = length;

        if (currentX + length <= truckLength) {
          placed.push({
            x: currentX,
            y: 0,
            z: currentZ,
            length,
            width,
            height,
            color: PALLET_COLORS[colorIdx],
          });
          currentZ += width;
        }
      }
    });

    return placed;
  }, [pallets, truckLength, truckWidth, truckHeight, isStackable]);

  return (
    <div className="relative w-full aspect-square flex items-center justify-center overflow-hidden bg-gradient-to-b from-muted/30 to-muted/60 rounded-lg">
      {/* 3D Scene */}
      <div
        className="relative"
        style={{
          perspective: "800px",
          transformStyle: "preserve-3d",
        }}
      >
        <div
          style={{
            transform: "rotateX(-25deg) rotateY(-35deg)",
            transformStyle: "preserve-3d",
          }}
        >
          {/* Truck Container - Wireframe Style */}
          {/* Floor */}
          <div
            className="absolute border-2 border-muted-foreground/40 bg-muted/20"
            style={{
              width: `${truckLength * scale}px`,
              height: `${truckWidth * scale}px`,
              transform: `translateZ(0px)`,
              transformStyle: "preserve-3d",
            }}
          />
          
          {/* Left Wall */}
          <div
            className="absolute border-2 border-muted-foreground/30 bg-muted/10"
            style={{
              width: `${truckLength * scale}px`,
              height: `${truckHeight * scale}px`,
              transform: `rotateX(90deg) translateZ(${truckWidth * scale}px)`,
              transformOrigin: "bottom",
              transformStyle: "preserve-3d",
            }}
          />
          
          {/* Right Wall */}
          <div
            className="absolute border-2 border-muted-foreground/30 bg-muted/10"
            style={{
              width: `${truckLength * scale}px`,
              height: `${truckHeight * scale}px`,
              transform: `rotateX(90deg) translateZ(0px)`,
              transformOrigin: "bottom",
              transformStyle: "preserve-3d",
            }}
          />
          
          {/* Back Wall */}
          <div
            className="absolute border-2 border-muted-foreground/30 bg-muted/10"
            style={{
              width: `${truckWidth * scale}px`,
              height: `${truckHeight * scale}px`,
              transform: `rotateX(90deg) rotateY(90deg) translateZ(0px)`,
              transformOrigin: "bottom left",
              transformStyle: "preserve-3d",
            }}
          />

          {/* Ceiling (dashed outline) */}
          <div
            className="absolute border-2 border-dashed border-muted-foreground/20"
            style={{
              width: `${truckLength * scale}px`,
              height: `${truckWidth * scale}px`,
              transform: `translateZ(${truckHeight * scale}px)`,
              transformStyle: "preserve-3d",
            }}
          />

          {/* Pallets */}
          {placedPallets.map((pallet, idx) => (
            <div
              key={idx}
              className="absolute transition-all duration-300"
              style={{
                width: `${pallet.length * scale}px`,
                height: `${pallet.width * scale}px`,
                transform: `translate(${pallet.x * scale}px, ${pallet.z * scale}px) translateZ(${pallet.y * scale}px)`,
                transformStyle: "preserve-3d",
              }}
            >
              {/* Pallet Box - Bottom */}
              <div
                className="absolute inset-0 border border-black/20"
                style={{
                  background: pallet.color,
                  opacity: 0.9,
                }}
              />
              
              {/* Pallet Box - Top */}
              <div
                className="absolute border border-black/20"
                style={{
                  width: `${pallet.length * scale}px`,
                  height: `${pallet.width * scale}px`,
                  background: pallet.color,
                  opacity: 0.95,
                  transform: `translateZ(${pallet.height * scale}px)`,
                  filter: "brightness(1.1)",
                }}
              />
              
              {/* Pallet Box - Front */}
              <div
                className="absolute border border-black/20"
                style={{
                  width: `${pallet.length * scale}px`,
                  height: `${pallet.height * scale}px`,
                  background: pallet.color,
                  opacity: 0.85,
                  transform: `rotateX(90deg) translateZ(${pallet.width * scale}px)`,
                  transformOrigin: "bottom",
                  filter: "brightness(0.9)",
                }}
              />
              
              {/* Pallet Box - Side */}
              <div
                className="absolute border border-black/20"
                style={{
                  width: `${pallet.width * scale}px`,
                  height: `${pallet.height * scale}px`,
                  background: pallet.color,
                  opacity: 0.8,
                  transform: `rotateX(90deg) rotateY(90deg) translateZ(${pallet.length * scale}px)`,
                  transformOrigin: "bottom left",
                  filter: "brightness(0.8)",
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Labels */}
      <div className="absolute bottom-2 left-2 text-xs text-muted-foreground space-y-0.5">
        <div>L: {truckLength}" × W: {truckWidth}" × H: {truckHeight}"</div>
        <div>{placedPallets.length} pallets placed</div>
      </div>

      {/* Fit indicator */}
      <div className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium ${
        fits 
          ? "bg-green-500/20 text-green-600 dark:text-green-400" 
          : "bg-red-500/20 text-red-600 dark:text-red-400"
      }`}>
        {fits ? "✓ Fits" : "✗ No Fit"}
      </div>
    </div>
  );
}
