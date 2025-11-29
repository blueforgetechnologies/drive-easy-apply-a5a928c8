import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from './ui/card';
import { DollarSign, Leaf } from 'lucide-react';

interface LoadRouteMapProps {
  stops: any[];
  optimizedStops?: any[];
  requiredBreaks?: any[];
  vehicle?: any;
  onOptimize?: () => void;
  optimizing?: boolean;
}

export default function LoadRouteMap({ stops, optimizedStops, requiredBreaks = [], vehicle, onOptimize, optimizing = false }: LoadRouteMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const [routeDistance, setRouteDistance] = useState<number>(0);
  const [fuelEstimate, setFuelEstimate] = useState<any>(null);

  useEffect(() => {
    if (!mapContainer.current || stops.length === 0) return;

    const initializeMap = async () => {
      try {
        // Fetch Mapbox token
        const { data: tokenData } = await supabase.functions.invoke('get-mapbox-token');
        if (!tokenData?.token) {
          console.error('No Mapbox token available');
          return;
        }

        mapboxgl.accessToken = tokenData.token;

        // Initialize map
        map.current = new mapboxgl.Map({
          container: mapContainer.current!,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [-98, 39],
          zoom: 4,
        });

        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

        map.current.on('load', () => {
          updateMarkersAndRoute();
        });
      } catch (error) {
        console.error('Error initializing map:', error);
      }
    };

    initializeMap();

    return () => {
      markers.current.forEach(marker => marker.remove());
      map.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (map.current && map.current.isStyleLoaded()) {
      updateMarkersAndRoute();
    }
  }, [stops, optimizedStops, requiredBreaks]);

  const updateMarkersAndRoute = () => {
    if (!map.current) return;

    // Clear existing markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    const coordinates: [number, number][] = [];
    const bounds = new mapboxgl.LngLatBounds();

    // Use optimized stops if available, otherwise use original stops
    const stopsToDisplay = optimizedStops && optimizedStops.length > 0 
      ? optimizedStops 
      : [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);

    stopsToDisplay.forEach((stop, index) => {
      // Skip stops without location data
      if (!stop.location_city || !stop.location_state) return;

      // Geocode the address (simplified - using city/state as fallback)
      // In production, you'd want to use proper geocoding
      geocodeAddress(stop).then(coords => {
        if (!coords) return;

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

        // Draw route line if we have enough points
        if (coordinates.length > 1) {
          drawRoute(coordinates);
        }

        // Fit bounds and calculate distance after all markers are added
        if (index === stopsToDisplay.length - 1 && coordinates.length > 0) {
          // Calculate total route distance
          calculateRouteDistance(coordinates);
          
          // Add break markers if available
          if (requiredBreaks.length > 0) {
            addBreakMarkers(requiredBreaks);
          }
          
          map.current!.fitBounds(bounds, { padding: 100, maxZoom: 10 });
        }
      });
    });
  };

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

  const geocodeAddress = async (stop: any): Promise<[number, number] | null> => {
    try {
      // Use Mapbox Geocoding API
      const query = `${stop.location_address || ''} ${stop.location_city || ''} ${stop.location_state || ''} ${stop.location_zip || ''}`.trim();
      if (!query) return null;

      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxgl.accessToken}&limit=1`
      );
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        return data.features[0].center as [number, number];
      }
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
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
    <div className="space-y-4">
      <div className="relative w-full h-[600px] rounded-lg overflow-hidden border">
        <div ref={mapContainer} className="absolute inset-0" />
        
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
