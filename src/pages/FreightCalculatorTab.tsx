import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Calculator, Upload, CheckCircle2, XCircle, Truck, Package, AlertTriangle, Loader2 } from "lucide-react";

interface Pallet {
  quantity: number;
  length: number;
  width: number;
  height: number;
  weight?: number;
}

interface Vehicle {
  id: string;
  vehicle_number: string;
  asset_type: string | null;
  vehicle_size: number | null;
  dimensions_length: number | null;
  dimensions_width: number | null;
  dimensions_height: number | null;
  door_dims_width: number | null;
  door_dims_height: number | null;
}

interface FitResult {
  fits: boolean;
  totalPallets: number;
  totalWeight: number;
  totalFloorSpace: number;
  truckFloorSpace: number;
  maxHeight: number;
  truckHeight: number;
  utilization: number;
  warnings: string[];
}

export default function FreightCalculatorTab() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [dimensionsText, setDimensionsText] = useState("");
  const [parsedPallets, setParsedPallets] = useState<Pallet[]>([]);
  const [fitResult, setFitResult] = useState<FitResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isParsingImage, setIsParsingImage] = useState(false);
  const [isStackable, setIsStackable] = useState(false);

  useEffect(() => {
    loadVehicles();
  }, []);

  const loadVehicles = async () => {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id, vehicle_number, asset_type, vehicle_size, dimensions_length, dimensions_width, dimensions_height, door_dims_width, door_dims_height")
      .eq("status", "active")
      .order("vehicle_number");

    if (data && !error) {
      setVehicles(data);
    }
  };

  // Parse dimensions text - supports multiple formats:
  // - 3@48 x 48 x 52 or 3@48x48x52 (@ notation for quantity)
  // - 48x48x48 or 48-48-48 (no quantity = 1)
  // - 2-48x52x23 (quantity prefix with dash)
  // - (2)48x48x45 (quantity in parentheses)
  // - 40 x 73 x 63 @ 364lbs (dimensions @ weight - quantity = 1)
  // - Comma or newline separated entries
  const parseDimensions = useCallback((text: string): Pallet[] => {
    const pallets: Pallet[] = [];
    
    // Split by newlines and commas, then process each entry
    const entries = text.split(/[\n,]/).map(e => e.trim()).filter(e => e);

    for (const entry of entries) {
      // Skip header lines like "10 skids / 2,928#"
      if (/skids?|pallets?|total|#$/i.test(entry) && !/[xX×-]\s*\d+\s*[xX×-]/.test(entry)) {
        continue;
      }

      let quantity = 1;
      let dims: number[] = [];
      let weight: number | undefined;

      // Pattern 1: "40 x 73 x 63 @ 364lbs" (dimensions @ weight - each is 1 pallet)
      const dimsWithWeightMatch = entry.match(/^([\d.]+)\s*[xX×]\s*([\d.]+)\s*[xX×]\s*([\d.]+)\s*@\s*([\d,.]+)\s*(lbs?|#)?/i);
      if (dimsWithWeightMatch) {
        quantity = 1;
        dims = [parseFloat(dimsWithWeightMatch[1]), parseFloat(dimsWithWeightMatch[2]), parseFloat(dimsWithWeightMatch[3])];
        weight = parseFloat(dimsWithWeightMatch[4].replace(/,/g, ''));
      }

      // Pattern 2: "3@48x48x52" or "3@48 x 48 x 52" (@ notation for quantity - must have @ before dims)
      if (dims.length === 0) {
        const atMatch = entry.match(/^(\d+)\s*@\s*([\d.]+)\s*[xX×-]\s*([\d.]+)\s*[xX×-]\s*([\d.]+)/i);
        if (atMatch) {
          quantity = parseInt(atMatch[1]);
          dims = [parseFloat(atMatch[2]), parseFloat(atMatch[3]), parseFloat(atMatch[4])];
        }
      }
      
      // Pattern 3: "(2)48x48x45" (parentheses quantity)
      if (dims.length === 0) {
        const parenMatch = entry.match(/^\((\d+)\)\s*([\d.]+)\s*[xX×-]\s*([\d.]+)\s*[xX×-]\s*([\d.]+)/i);
        if (parenMatch) {
          quantity = parseInt(parenMatch[1]);
          dims = [parseFloat(parenMatch[2]), parseFloat(parenMatch[3]), parseFloat(parenMatch[4])];
        }
      }
      
      // Pattern 4: "2-48x52x23" (quantity-dimensions with leading dash)
      if (dims.length === 0) {
        const dashPrefixMatch = entry.match(/^(\d+)-([\d.]+)\s*[xX×]\s*([\d.]+)\s*[xX×]\s*([\d.]+)/i);
        if (dashPrefixMatch) {
          quantity = parseInt(dashPrefixMatch[1]);
          dims = [parseFloat(dashPrefixMatch[2]), parseFloat(dashPrefixMatch[3]), parseFloat(dashPrefixMatch[4])];
        }
      }
      
      // Pattern 5: "48x48x48" or "48-48-48" (no quantity, any separator)
      if (dims.length === 0) {
        const simpleMatch = entry.match(/^([\d.]+)\s*[xX×-]\s*([\d.]+)\s*[xX×-]\s*([\d.]+)/i);
        if (simpleMatch) {
          quantity = 1;
          dims = [parseFloat(simpleMatch[1]), parseFloat(simpleMatch[2]), parseFloat(simpleMatch[3])];
        }
      }

      if (dims.length === 3) {
        pallets.push({
          quantity,
          length: dims[0],
          width: dims[1],
          height: dims[2],
          weight
        });
      }
    }

    return pallets;
  }, []);

  useEffect(() => {
    if (dimensionsText) {
      const parsed = parseDimensions(dimensionsText);
      setParsedPallets(parsed);
    } else {
      setParsedPallets([]);
    }
    setFitResult(null);
  }, [dimensionsText, parseDimensions]);

  const handleImageDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      await parseImageWithAI(file);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await parseImageWithAI(file);
    }
  };

  const parseImageWithAI = async (file: File) => {
    setIsParsingImage(true);
    try {
      // Convert image to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Call edge function to parse with AI
      const { data, error } = await supabase.functions.invoke('parse-freight-dimensions', {
        body: { imageBase64: base64 }
      });

      if (error) throw error;

      if (data?.dimensions) {
        setDimensionsText(data.dimensions);
        toast.success("Dimensions extracted from image");
      } else {
        toast.error("Could not extract dimensions from image");
      }
    } catch (error) {
      console.error("Error parsing image:", error);
      toast.error("Failed to parse image");
    } finally {
      setIsParsingImage(false);
    }
  };

  const calculateFit = () => {
    if (!selectedVehicleId || parsedPallets.length === 0) {
      toast.error("Please select a truck and enter freight dimensions");
      return;
    }

    setIsLoading(true);

    const vehicle = vehicles.find(v => v.id === selectedVehicleId);
    if (!vehicle) {
      toast.error("Vehicle not found");
      setIsLoading(false);
      return;
    }

    // Get truck dimensions (convert feet to inches if needed)
    let truckLength = vehicle.dimensions_length || 0;
    let truckWidth = vehicle.dimensions_width || 96; // Default trailer width 96"
    let truckHeight = vehicle.dimensions_height || 96; // Default trailer height 96"
    
    // Door dimensions - freight must fit through the door
    const doorWidth = vehicle.door_dims_width || truckWidth;
    const doorHeight = vehicle.door_dims_height || truckHeight;

    // If vehicle_size is set (in feet) and no dimensions_length, use it
    if (!truckLength && vehicle.vehicle_size) {
      truckLength = vehicle.vehicle_size * 12; // Convert feet to inches
    }

    if (truckLength === 0) {
      toast.error("Vehicle has no dimensions set. Please update vehicle dimensions first.");
      setIsLoading(false);
      return;
    }

    // Calculate total floor space needed with optimized row packing
    let totalPallets = 0;
    let totalWeight = 0;
    let maxHeight = 0;
    let totalLengthNeeded = 0;
    const warnings: string[] = [];

    // Expand all pallets into individual units for optimal packing
    // Each unit can be rotated (swap length/width) but height is fixed
    interface PalletUnit { 
      length: number; 
      width: number; 
      height: number; 
      weight: number;
      // Store original dimensions so we can try rotation
      origLength: number;
      origWidth: number;
    }
    const allUnits: PalletUnit[] = [];
    
    for (const pallet of parsedPallets) {
      for (let i = 0; i < pallet.quantity; i++) {
        allUnits.push({
          length: pallet.length,
          width: pallet.width,
          height: pallet.height,
          weight: pallet.weight || 0,
          origLength: pallet.length,
          origWidth: pallet.width
        });
      }
    }

    totalPallets = allUnits.length;
    totalWeight = allUnits.reduce((sum, p) => sum + p.weight, 0);
    maxHeight = Math.max(...allUnits.map(p => p.height), 0);

    // Check for oversized pallets - must fit through door AND inside truck
    // Freight must be strictly smaller than door opening to fit through
    const validUnits = allUnits.filter(p => {
      const minDim = Math.min(p.origLength, p.origWidth);
      const maxDim = Math.max(p.origLength, p.origWidth);
      
      // Check if pallet can fit through door (must be strictly smaller, can rotate L/W)
      const fitsThruDoorNormal = minDim < doorWidth && p.height < doorHeight;
      const fitsThruDoorRotated = maxDim < doorWidth && p.height < doorHeight;
      
      if (!fitsThruDoorNormal && !fitsThruDoorRotated) {
        warnings.push(`Pallet ${p.origLength}"x${p.origWidth}"x${p.height}" cannot fit through door (${doorWidth}"x${doorHeight}" - freight must be smaller than door opening)`);
        return false;
      }
      
      // Check if pallet fits inside truck width
      if (minDim > truckWidth) {
        warnings.push(`Pallet ${p.origLength}"x${p.origWidth}" cannot fit - both dimensions exceed truck width ${truckWidth}"`);
        return false;
      }
      return true;
    });

    // Helper function to pack pallets with rotation and stacking optimization
    const packWithRotation = (units: PalletUnit[], allowStacking: boolean): number => {
      interface PackablePallet extends PalletUnit {
        altLength: number;
        altWidth: number;
      }
      
      const remaining: PackablePallet[] = units.map(p => ({
        ...p,
        length: Math.max(p.origLength, p.origWidth),
        width: Math.min(p.origLength, p.origWidth),
        altLength: Math.min(p.origLength, p.origWidth),
        altWidth: Math.max(p.origLength, p.origWidth)
      }));

      // Sort by height descending when stacking, then by width
      if (allowStacking) {
        remaining.sort((a, b) => b.height - a.height || b.width - a.width);
      } else {
        remaining.sort((a, b) => b.width - a.width);
      }

      let lengthNeeded = 0;
      
      while (remaining.length > 0) {
        const first = remaining.shift()!;
        
        let bestRowLength = Infinity;
        let bestRowConfig: { usedIndices: number[], stackedIndices: number[], length: number } | null = null;
        
        for (const firstOrientation of [
          { length: first.length, width: first.width },
          { length: first.altLength, width: first.altWidth }
        ]) {
          if (firstOrientation.width > truckWidth) continue;
          
          let rowWidth = firstOrientation.width;
          let rowLength = firstOrientation.length;
          const usedIndices: number[] = [];
          const rowPallets: { index: number, height: number, width: number, length: number }[] = [
            { index: -1, height: first.height, width: firstOrientation.width, length: firstOrientation.length }
          ];
          
          // Try to add more pallets side-by-side
          for (let i = 0; i < remaining.length; i++) {
            const candidate = remaining[i];
            
            if (rowWidth + candidate.width <= truckWidth) {
              rowWidth += candidate.width;
              rowLength = Math.max(rowLength, candidate.length);
              usedIndices.push(i);
              rowPallets.push({ index: i, height: candidate.height, width: candidate.width, length: candidate.length });
            } else if (rowWidth + candidate.altWidth <= truckWidth) {
              rowWidth += candidate.altWidth;
              rowLength = Math.max(rowLength, candidate.altLength);
              usedIndices.push(i);
              rowPallets.push({ index: i, height: candidate.height, width: candidate.altWidth, length: candidate.altLength });
            }
          }
          
          // If stacking allowed, try to stack pallets on top of this row
          const stackedIndices: number[] = [];
          if (allowStacking && rowPallets.length > 0) {
            // Calculate available stacking height for each position
            const usedHeights = rowPallets.map(p => p.height);
            const minHeight = Math.min(...usedHeights);
            const stackableHeight = truckHeight - minHeight;
            
            // Find pallets that can stack on this row
            for (let i = remaining.length - 1; i >= 0; i--) {
              if (usedIndices.includes(i) || stackedIndices.includes(i)) continue;
              
              const candidate = remaining[i];
              // Can stack if height fits and footprint fits within row
              if (candidate.height <= stackableHeight) {
                const candWidth = Math.min(candidate.width, candidate.altWidth);
                if (candWidth <= rowWidth) {
                  stackedIndices.push(i);
                }
              }
            }
          }
          
          if (rowLength < bestRowLength) {
            bestRowLength = rowLength;
            bestRowConfig = { usedIndices, stackedIndices, length: rowLength };
          }
        }
        
        if (bestRowConfig) {
          lengthNeeded += bestRowConfig.length;
          // Remove stacked and used pallets in reverse order
          const allRemoved = [...bestRowConfig.usedIndices, ...bestRowConfig.stackedIndices];
          allRemoved.sort((a, b) => b - a).forEach(idx => remaining.splice(idx, 1));
        } else {
          lengthNeeded += Math.min(first.length, first.altLength);
        }
      }
      
      return lengthNeeded;
    };

    totalLengthNeeded = packWithRotation(validUnits, isStackable);


    const truckFloorSpace = truckLength * truckWidth;
    const totalFloorSpace = totalLengthNeeded * truckWidth;
    const utilization = Math.round((totalLengthNeeded / truckLength) * 100);

    // Check if it fits
    const heightFits = maxHeight <= truckHeight;
    const lengthFits = totalLengthNeeded <= truckLength;
    const fits = heightFits && lengthFits && warnings.length === 0;

    if (!heightFits) {
      warnings.push(`Max pallet height ${maxHeight}" exceeds truck height ${truckHeight}"`);
    }
    if (!lengthFits) {
      warnings.push(`Total length needed ${totalLengthNeeded}" exceeds truck length ${truckLength}" by ${totalLengthNeeded - truckLength}"`);
    }

    setFitResult({
      fits,
      totalPallets,
      totalWeight,
      totalFloorSpace,
      truckFloorSpace,
      maxHeight,
      truckHeight,
      utilization: Math.min(utilization, 100),
      warnings
    });

    setIsLoading(false);
  };

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Calculator className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Freight Fit Calculator</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Input Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5" />
              Freight Dimensions
            </CardTitle>
            <CardDescription>
              Paste dimensions or drop a screenshot
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Drop Zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleImageDrop}
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center hover:border-primary/50 transition-colors cursor-pointer"
            >
              <input
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
                id="image-upload"
              />
              <label htmlFor="image-upload" className="cursor-pointer">
                {isParsingImage ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Parsing image with AI...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Drop screenshot here or click to upload
                    </span>
                  </div>
                )}
              </label>
            </div>

            {/* Text Input */}
            <Textarea
              value={dimensionsText}
              onChange={(e) => setDimensionsText(e.target.value)}
              placeholder={`Enter dimensions (one per line):
3@48 x 48 x 52
1@48 x 48 x 59
8@47 x 24 x 59`}
              className="min-h-[150px] font-mono text-sm"
            />

            {/* Parsed Preview */}
            {parsedPallets.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <div className="text-sm font-medium">Parsed Pallets:</div>
                {parsedPallets.map((pallet, idx) => (
                  <div key={idx} className="text-sm flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono">
                      {pallet.quantity}x
                    </Badge>
                    <span className="font-mono">
                      {pallet.length}" × {pallet.width}" × {pallet.height}"
                      {pallet.weight && <span className="text-muted-foreground ml-1">@ {pallet.weight} lbs</span>}
                    </span>
                  </div>
                ))}
                <div className="text-sm pt-2 border-t border-border mt-2 space-y-1">
                  <div className="font-medium">
                    Total: {parsedPallets.reduce((sum, p) => sum + p.quantity, 0)} pallets
                  </div>
                  {parsedPallets.some(p => p.weight) && (
                    <div className="text-muted-foreground">
                      Weight: {parsedPallets.reduce((sum, p) => sum + (p.weight || 0) * p.quantity, 0).toLocaleString()} lbs
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Truck Selection & Result */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Select Truck
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stackable Toggle */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">Stackable Freight?</span>
              <div className="flex gap-1">
                <Button
                  variant={isStackable ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIsStackable(true)}
                  className="h-7 px-3"
                >
                  Yes
                </Button>
                <Button
                  variant={!isStackable ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIsStackable(false)}
                  className="h-7 px-3"
                >
                  No
                </Button>
              </div>
            </div>

            <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a truck..." />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>
                    <span className="font-medium">{vehicle.vehicle_number}</span>
                    <span className="text-muted-foreground ml-2">
                      {vehicle.asset_type}
                      {vehicle.vehicle_size && ` - ${vehicle.vehicle_size}'`}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedVehicle && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                <div className="font-medium">{selectedVehicle.vehicle_number}</div>
                <div className="text-muted-foreground">
                  {selectedVehicle.asset_type}
                </div>
                <div className="font-mono text-xs pt-2 space-y-1">
                  {selectedVehicle.vehicle_size && (
                    <div>Length: {selectedVehicle.vehicle_size}' ({selectedVehicle.vehicle_size * 12}")</div>
                  )}
                  {selectedVehicle.dimensions_length && (
                    <div>Length: {selectedVehicle.dimensions_length}"</div>
                  )}
                  {selectedVehicle.dimensions_width && (
                    <div>Width: {selectedVehicle.dimensions_width}"</div>
                  )}
                  {selectedVehicle.dimensions_height && (
                    <div>Height: {selectedVehicle.dimensions_height}"</div>
                  )}
                  {(selectedVehicle.door_dims_width || selectedVehicle.door_dims_height) && (
                    <div className="pt-1 border-t border-border mt-1 text-amber-600">
                      Door Opening: {selectedVehicle.door_dims_width || '?'}" × {selectedVehicle.door_dims_height || '?'}"
                    </div>
                  )}
                </div>
              </div>
            )}

            <Button
              onClick={calculateFit}
              disabled={!selectedVehicleId || parsedPallets.length === 0 || isLoading}
              className="w-full"
              size="lg"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Calculator className="h-4 w-4 mr-2" />
              )}
              Calculate Fit
            </Button>

            {/* Result Display */}
            {fitResult && (
              <div className={`rounded-lg p-4 border-2 ${
                fitResult.fits 
                  ? "bg-green-500/10 border-green-500/30" 
                  : "bg-red-500/10 border-red-500/30"
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  {fitResult.fits ? (
                    <>
                      <CheckCircle2 className="h-6 w-6 text-green-500" />
                      <span className="text-lg font-bold text-green-500">FITS!</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-6 w-6 text-red-500" />
                      <span className="text-lg font-bold text-red-500">DOES NOT FIT</span>
                    </>
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Pallets:</span>
                    <span className="font-medium">{fitResult.totalPallets}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Pallet Height:</span>
                    <span className="font-medium">{fitResult.maxHeight}"</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Truck Height:</span>
                    <span className="font-medium">{fitResult.truckHeight}"</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Space Utilization:</span>
                    <span className="font-medium">{fitResult.utilization}%</span>
                  </div>
                  {fitResult.totalWeight > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Weight:</span>
                      <span className="font-medium">{fitResult.totalWeight.toLocaleString()} lbs</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stackable:</span>
                    <span className="font-medium">{isStackable ? "Yes" : "No"}</span>
                  </div>
                </div>

                {fitResult.warnings.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border space-y-1">
                    {fitResult.warnings.map((warning, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm text-yellow-600 dark:text-yellow-500">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
