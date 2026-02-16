import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from './ui/card';
import { DollarSign, Leaf, Loader2 } from 'lucide-react';
import { useMapLoadTracker } from '@/hooks/useMapLoadTracker';
import { Skeleton } from './ui/skeleton';

// Global token cache - persists across component mounts
let cachedMapboxToken: string | null = null;
let tokenFetchPromise: Promise<string | null> | null = null;

// Prefetch token function - call this early in the app
export const prefetchMapboxToken = async (): Promise<string | null> => {
  if (cachedMapboxToken) return cachedMapboxToken;
  if (tokenFetchPromise) return tokenFetchPromise;
  
  tokenFetchPromise = (async () => {
    try {
      const { data: tokenData } = await supabase.functions.invoke('get-mapbox-token');
      if (tokenData?.token) {
        cachedMapboxToken = tokenData.token;
        return cachedMapboxToken;
      }
      return null;
    } catch (error) {
      console.error('Error prefetching Mapbox token:', error);
      return null;
    } finally {
      tokenFetchPromise = null;
    }
  })();
  
  return tokenFetchPromise;
};

// Get token (uses cache if available)
const getMapboxToken = async (): Promise<string | null> => {
  if (cachedMapboxToken) return cachedMapboxToken;
  return prefetchMapboxToken();
};

interface Stop {
  location_city?: string;
  location_state?: string;
  location_address?: string;
  location_zip?: string;
  stop_type: string;
  stop_sequence?: number;
  scheduled_date?: string;
  location_name?: string;
  // Pre-geocoded coordinates - if provided, skip geocoding API call
  lat?: number;
  lng?: number;
}

interface LoadRouteMapProps {
  stops: Stop[];
  optimizedStops?: Stop[];
  requiredBreaks?: any[];
  vehicle?: any;
  onOptimize?: () => void;
  optimizing?: boolean;
}

// Create stable stop key for comparison
const getStopsKey = (stops: Stop[]): string => {
  return stops
    .map(s => `${s.location_city || ''}-${s.location_state || ''}-${s.stop_type}`)
    .join('|');
};

function LoadRouteMapComponent({ stops, optimizedStops, requiredBreaks = [], vehicle, onOptimize, optimizing = false }: LoadRouteMapProps) {
  useMapLoadTracker('LoadRouteMap');
  
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const [routeDistance, setRouteDistance] = useState<number>(0);
  const [fuelEstimate, setFuelEstimate] = useState<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const initializingRef = useRef(false);
  
  // Track last processed stops to avoid redundant updates
  const lastStopsKeyRef = useRef<string>('');

  // Initialize map only once
  useEffect(() => {
    if (!mapContainer.current || stops.length === 0 || initializingRef.current) return;
    
    initializingRef.current = true;

    const initializeMap = async () => {
      try {
        // Use cached token - much faster on subsequent loads
        const token = await getMapboxToken();
        if (!token) {
          console.error('No Mapbox token available');
          initializingRef.current = false;
          setMapLoading(false);
          return;
        }

        mapboxgl.accessToken = token;

        // Initialize map
        map.current = new mapboxgl.Map({
          container: mapContainer.current!,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [-98, 39],
          zoom: 4,
        });

        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

        map.current.on('load', () => {
          setMapReady(true);
          setMapLoading(false);
        });
      } catch (error) {
        console.error('Error initializing map:', error);
        initializingRef.current = false;
        setMapLoading(false);
      }
    };

    initializeMap();

    return () => {
      markers.current.forEach(marker => marker.remove());
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      initializingRef.current = false;
      setMapReady(false);
    };
  }, []); // Only run once on mount

  // Geocode address function - uses pre-geocoded coords if available,
  // then tries direct geocode_cache lookup (instant), falls back to edge function
  const geocodeAddress = useCallback(async (stop: Stop): Promise<[number, number] | null> => {
    try {
      // FAST PATH 1: If stop already has coordinates, use them directly (no API call!)
      if (stop.lat && stop.lng) {
        return [stop.lng, stop.lat];
      }
      
      const city = stop.location_city?.trim();
      const state = stop.location_state?.trim();
      
      // FAST PATH 2: Direct geocode_cache table lookup (no edge function overhead)
      if (city && state) {
        const locationKey = `${city}, ${state}`.toLowerCase();
        const { data: cached } = await supabase
          .from('geocode_cache')
          .select('latitude, longitude')
          .ilike('location_key', locationKey)
          .limit(1)
          .maybeSingle();
        
        if (cached?.latitude && cached?.longitude) {
          return [cached.longitude, cached.latitude];
        }
      }

      // SLOW PATH: Fall back to edge function (geocodes + caches for next time)
      const query = `${stop.location_address || ''} ${city || ''} ${state || ''} ${stop.location_zip || ''}`.trim();
      if (!query) return null;

      const { data, error } = await supabase.functions.invoke('geocode', {
        body: { query }
      });

      if (error) {
        console.error('Geocode edge function error:', error);
        return null;
      }

      if (data && data.lat && data.lng) {
        return [data.lng, data.lat];
      }
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }, []);

  // Update markers when stops change AND map is ready
  useEffect(() => {
    if (!map.current || !mapReady) return;
    
    // Create a key from current stops to check if we need to update
    const currentStopsKey = getStopsKey(stops);
    const optimizedKey = optimizedStops ? getStopsKey(optimizedStops) : '';
    const combinedKey = `${currentStopsKey}|${optimizedKey}`;
    
    // Skip if stops haven't actually changed
    if (combinedKey === lastStopsKeyRef.current) {
      return;
    }
    lastStopsKeyRef.current = combinedKey;

    const updateMarkersAndRoute = async () => {
      // Clear existing markers
      markers.current.forEach(marker => marker.remove());
      markers.current = [];

      const bounds = new mapboxgl.LngLatBounds();

      // Use optimized stops if available, otherwise use original stops
      const stopsToDisplay = optimizedStops && optimizedStops.length > 0 
        ? optimizedStops 
        : [...stops].sort((a, b) => (a.stop_sequence || 0) - (b.stop_sequence || 0));

      // Filter stops that have location data
      const validStops = stopsToDisplay.filter(
        stop => stop.location_city && stop.location_state
      );

      // PARALLEL geocode all stops at once for speed
      const geocodePromises = validStops.map(stop => geocodeAddress(stop));
      const geocodeResults = await Promise.all(geocodePromises);

      // Build coordinates array and markers
      const coordinates: [number, number][] = [];
      
      geocodeResults.forEach((coords, index) => {
        if (!coords || !map.current) return;
        
        const stop = validStops[index];
        coordinates.push(coords);
        bounds.extend(coords);

        // Create marker color based on stop type
        const markerColor = stop.stop_type === 'pickup' ? '#22c55e' : '#3b82f6';
        
        // Create marker element
        const el = document.createElement('div');
        el.className = 'custom-marker';
        el.style.width = '32px';
        el.style.height = '32px';
        el.style.borderRadius = '50%';
        el.style.border = '3px solid white';
        el.style.backgroundColor = markerColor;
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.color = 'white';
        el.style.fontWeight = 'bold';
        el.style.fontSize = '14px';
        el.textContent = `${index + 1}`;

        // Create popup
        const popupContent = `
          <div style="padding: 8px;">
            <div style="font-weight: bold; margin-bottom: 4px;">
              Stop ${index + 1}: ${stop.stop_type === 'pickup' ? 'Pickup' : 'Delivery'}
            </div>
            <div style="font-size: 13px; color: #666;">
              ${stop.location_name || 'Unknown Location'}
            </div>
            <div style="font-size: 12px; color: #888; margin-top: 4px;">
              ${stop.location_address || ''}<br/>
              ${stop.location_city}, ${stop.location_state} ${stop.location_zip || ''}
            </div>
            ${stop.scheduled_date ? `
              <div style="font-size: 12px; color: #888; margin-top: 4px;">
                Scheduled: ${stop.scheduled_date}
              </div>
            ` : ''}
          </div>
        `;

        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(popupContent);

        // Add marker
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(coords)
          .setPopup(popup)
          .addTo(map.current!);

        markers.current.push(marker);
      });

      // Draw route and fit bounds after all markers
      if (coordinates.length > 1) {
        drawRoute(coordinates);
        calculateRouteDistance(coordinates);
      }

      // Add break markers if available
      if (requiredBreaks.length > 0) {
        addBreakMarkers(requiredBreaks);
      }

      if (coordinates.length > 0 && map.current) {
        map.current.fitBounds(bounds, { padding: 100, maxZoom: 10 });
      }
    };

    updateMarkersAndRoute();
  }, [stops, optimizedStops, requiredBreaks, mapReady, geocodeAddress]);

  // Calculate total route distance using Haversine formula
  const calculateRouteDistance = (coordinates: [number, number][]) => {
    let totalDistance = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
      const [lon1, lat1] = coordinates[i];
      const [lon2, lat2] = coordinates[i + 1];
      totalDistance += getDistanceBetweenPoints(lat1, lon1, lat2, lon2);
    }
    setRouteDistance(totalDistance);
  };

  // Haversine formula to calculate distance between two points in miles
  const getDistanceBetweenPoints = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3958.8; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Calculate fuel estimates when route distance and vehicle data changes
  useEffect(() => {
    if (routeDistance > 0 && vehicle?.fuel_efficiency_mpg && vehicle?.fuel_type) {
      const fuelPrices: { [key: string]: number } = {
        diesel: 3.85,
        gasoline: 3.25,
        electric: 0.13,
      };

      const emissionFactors: { [key: string]: number } = {
        diesel: 22.38,
        gasoline: 19.64,
        electric: 0,
      };

      const fuelConsumption = routeDistance / vehicle.fuel_efficiency_mpg;
      const fuelCost = fuelConsumption * (fuelPrices[vehicle.fuel_type] || 3.50);
      const carbonEmissionsLbs = fuelConsumption * (emissionFactors[vehicle.fuel_type] || 20);
      const carbonEmissionsKg = carbonEmissionsLbs * 0.453592;

      setFuelEstimate({
        fuelType: vehicle.fuel_type,
        vehicleMpg: vehicle.fuel_efficiency_mpg,
        estimatedFuelGallons: fuelConsumption,
        estimatedFuelCost: fuelCost,
        carbonEmissionsLbs,
        carbonEmissionsKg,
      });
    } else {
      setFuelEstimate(null);
    }
  }, [routeDistance, vehicle]);

  const addBreakMarkers = (breaks: any[]) => {
    if (!map.current) return;

    breaks.forEach((breakItem, index) => {
      if (!breakItem.coordinates) return;

      // Create break marker element
      const el = document.createElement('div');
      el.className = 'break-marker';
      el.style.width = '40px';
      el.style.height = '40px';
      el.style.borderRadius = '50%';
      el.style.border = '3px solid white';
      el.style.backgroundColor = '#f97316'; // orange
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.color = 'white';
      el.style.fontWeight = 'bold';
      el.style.fontSize = '20px';
      el.innerHTML = '⏸';

      // Create popup
      const popupContent = `
        <div style="padding: 8px;">
          <div style="font-weight: bold; margin-bottom: 4px; color: #f97316;">
            Required Break #${index + 1}
          </div>
          <div style="font-size: 13px; color: #666;">
            ${breakItem.location}
          </div>
          <div style="font-size: 12px; color: #888; margin-top: 4px;">
            Duration: ${breakItem.duration} minutes
          </div>
          <div style="font-size: 11px; color: #888; margin-top: 2px;">
            ${breakItem.reason}
          </div>
        </div>
      `;

      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(popupContent);

      // Add marker
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(breakItem.coordinates)
        .setPopup(popup)
        .addTo(map.current!);

      markers.current.push(marker);
    });
  };

  const drawRoute = (coordinates: [number, number][]) => {
    if (!map.current) return;

    const sourceId = 'route';
    const layerId = 'route-line';

    // Remove existing route if present
    if (map.current.getLayer(layerId)) {
      map.current.removeLayer(layerId);
    }
    if (map.current.getSource(sourceId)) {
      map.current.removeSource(sourceId);
    }

    // Add route line
    map.current.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coordinates,
        },
      },
    });

    map.current.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': optimizedStops && optimizedStops.length > 0 ? '#22c55e' : '#6366f1',
        'line-width': 4,
        'line-opacity': 0.8,
      },
    });
  };

  if (stops.length === 0) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-muted/20 rounded-lg">
        <div className="text-center text-muted-foreground">
          <p>No stops added yet</p>
          <p className="text-sm mt-2">Add pickup and delivery stops to see the route map</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full">
      <div className="relative w-full h-full min-h-[200px] rounded-lg overflow-hidden">
        <div ref={mapContainer} className="absolute inset-0" />
        
        {/* Loading overlay */}
        {mapLoading && (
          <div className="absolute inset-0 bg-muted/80 backdrop-blur-sm flex items-center justify-center z-20">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Loading map...</span>
            </div>
          </div>
        )}
        
        {onOptimize && (
          <div className="absolute top-4 right-4 z-10">
            <button
              onClick={onOptimize}
              disabled={optimizing || stops.length < 2}
              className="bg-background/95 backdrop-blur-sm hover:bg-background border shadow-lg px-4 py-2 rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {optimizing ? "Optimizing..." : "Optimize Route"}
            </button>
          </div>
        )}
        
        <div className="absolute top-4 left-4 bg-background/95 backdrop-blur-sm p-3 rounded-lg shadow-lg border">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow-sm"></div>
              <span>Pickup</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-sm"></div>
              <span>Delivery</span>
            </div>
            {requiredBreaks.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-orange-500 border-2 border-white shadow-sm flex items-center justify-center text-white text-xs">⏸</div>
                <span>Required Break</span>
              </div>
            )}
            {optimizedStops && optimizedStops.length > 0 && (
              <div className="flex items-center gap-2 ml-2 pl-2 border-l">
                <div className="w-8 h-1 bg-green-500 rounded"></div>
                <span className="text-green-600 font-medium">Optimized</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fuel Cost & Emissions Estimate Card */}
      {fuelEstimate && routeDistance > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Route Fuel & Environmental Estimate</h3>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Route Distance</p>
                <p className="text-lg font-bold">{routeDistance.toFixed(1)} mi</p>
              </div>
              
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Fuel Type</p>
                <p className="text-lg font-bold capitalize">{fuelEstimate.fuelType}</p>
                <p className="text-xs text-muted-foreground">@ {fuelEstimate.vehicleMpg} MPG</p>
              </div>
              
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Fuel Needed</p>
                <p className="text-lg font-bold">{fuelEstimate.estimatedFuelGallons.toFixed(1)} gal</p>
              </div>
              
              <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-xs text-muted-foreground mb-1">Estimated Cost</p>
                <p className="text-lg font-bold text-green-700 dark:text-green-400">
                  ${fuelEstimate.estimatedFuelCost.toFixed(2)}
                </p>
              </div>
              
              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Leaf className="h-3 w-3" />
                  CO₂ Emissions
                </p>
                <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
                  {fuelEstimate.carbonEmissionsLbs.toFixed(0)} lbs
                </p>
                <p className="text-xs text-muted-foreground">{fuelEstimate.carbonEmissionsKg.toFixed(1)} kg</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!vehicle && stops.length > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950">
          <CardContent className="pt-6">
            <p className="text-sm text-orange-700 dark:text-orange-400">
              Assign a vehicle to this load to see fuel cost and emissions estimates.
            </p>
          </CardContent>
        </Card>
      )}

      {vehicle && !vehicle.fuel_efficiency_mpg && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950">
          <CardContent className="pt-6">
            <p className="text-sm text-orange-700 dark:text-orange-400">
              Add fuel type and MPG efficiency to the vehicle to see fuel estimates.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Memoize the component to prevent unnecessary re-renders
const LoadRouteMap = React.memo(LoadRouteMapComponent, (prevProps, nextProps) => {
  // Custom comparison - only re-render if stops actually changed by value
  const prevKey = getStopsKey(prevProps.stops);
  const nextKey = getStopsKey(nextProps.stops);
  const prevOptKey = prevProps.optimizedStops ? getStopsKey(prevProps.optimizedStops) : '';
  const nextOptKey = nextProps.optimizedStops ? getStopsKey(nextProps.optimizedStops) : '';
  
  return prevKey === nextKey && 
         prevOptKey === nextOptKey && 
         prevProps.optimizing === nextProps.optimizing &&
         prevProps.requiredBreaks?.length === nextProps.requiredBreaks?.length;
});

export default LoadRouteMap;
