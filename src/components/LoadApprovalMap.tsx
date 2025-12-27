import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { MapPin } from 'lucide-react';

interface LoadApprovalMapProps {
  selectedLoad: {
    id: string;
    pickup_city: string | null;
    pickup_state: string | null;
    delivery_city: string | null;
    delivery_state: string | null;
    rate: number | null;
    estimated_miles: number | null;
    customer?: { name: string | null };
    broker_name?: string | null;
  } | null;
}

export function LoadApprovalMap({ selectedLoad }: LoadApprovalMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const initializingRef = useRef(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || initializingRef.current) return;
    
    initializingRef.current = true;

    const initializeMap = async () => {
      try {
        const { data: tokenData } = await supabase.functions.invoke('get-mapbox-token');
        if (!tokenData?.token) {
          console.error('No Mapbox token available');
          initializingRef.current = false;
          return;
        }

        mapboxgl.accessToken = tokenData.token;

        map.current = new mapboxgl.Map({
          container: mapContainer.current!,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [-98, 39],
          zoom: 3,
        });

        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

        map.current.on('load', () => {
          setMapReady(true);
        });
      } catch (error) {
        console.error('Error initializing map:', error);
        initializingRef.current = false;
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
  }, []);

  // Geocode address
  const geocodeAddress = useCallback(async (city: string, state: string): Promise<[number, number] | null> => {
    try {
      const query = `${city}, ${state}`;
      const { data, error } = await supabase.functions.invoke('geocode', {
        body: { query }
      });

      if (error || !data?.lat || !data?.lng) return null;
      return [data.lng, data.lat];
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }, []);

  // Update map when selected load changes
  useEffect(() => {
    if (!map.current || !mapReady) return;

    // Clear existing markers and route
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    const sourceId = 'route';
    const layerId = 'route-line';
    if (map.current.getLayer(layerId)) {
      map.current.removeLayer(layerId);
    }
    if (map.current.getSource(sourceId)) {
      map.current.removeSource(sourceId);
    }

    if (!selectedLoad?.pickup_city || !selectedLoad?.pickup_state || 
        !selectedLoad?.delivery_city || !selectedLoad?.delivery_state) {
      // Reset to default view
      map.current.flyTo({ center: [-98, 39], zoom: 3 });
      return;
    }

    const updateMap = async () => {
      setLoading(true);
      const bounds = new mapboxgl.LngLatBounds();
      const coordinates: [number, number][] = [];

      // Geocode pickup
      const pickupCoords = await geocodeAddress(selectedLoad.pickup_city!, selectedLoad.pickup_state!);
      if (pickupCoords) {
        coordinates.push(pickupCoords);
        bounds.extend(pickupCoords);

        const pickupEl = document.createElement('div');
        pickupEl.style.width = '28px';
        pickupEl.style.height = '28px';
        pickupEl.style.borderRadius = '50%';
        pickupEl.style.border = '3px solid white';
        pickupEl.style.backgroundColor = '#22c55e';
        pickupEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        pickupEl.style.display = 'flex';
        pickupEl.style.alignItems = 'center';
        pickupEl.style.justifyContent = 'center';
        pickupEl.style.color = 'white';
        pickupEl.style.fontWeight = 'bold';
        pickupEl.style.fontSize = '12px';
        pickupEl.textContent = 'P';

        const pickupPopup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div style="padding: 6px;">
            <div style="font-weight: bold; color: #22c55e;">Pickup</div>
            <div style="font-size: 12px;">${selectedLoad.pickup_city}, ${selectedLoad.pickup_state}</div>
          </div>
        `);

        const pickupMarker = new mapboxgl.Marker({ element: pickupEl })
          .setLngLat(pickupCoords)
          .setPopup(pickupPopup)
          .addTo(map.current!);
        markers.current.push(pickupMarker);
      }

      // Geocode delivery
      const deliveryCoords = await geocodeAddress(selectedLoad.delivery_city!, selectedLoad.delivery_state!);
      if (deliveryCoords) {
        coordinates.push(deliveryCoords);
        bounds.extend(deliveryCoords);

        const deliveryEl = document.createElement('div');
        deliveryEl.style.width = '28px';
        deliveryEl.style.height = '28px';
        deliveryEl.style.borderRadius = '50%';
        deliveryEl.style.border = '3px solid white';
        deliveryEl.style.backgroundColor = '#3b82f6';
        deliveryEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        deliveryEl.style.display = 'flex';
        deliveryEl.style.alignItems = 'center';
        deliveryEl.style.justifyContent = 'center';
        deliveryEl.style.color = 'white';
        deliveryEl.style.fontWeight = 'bold';
        deliveryEl.style.fontSize = '12px';
        deliveryEl.textContent = 'D';

        const deliveryPopup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div style="padding: 6px;">
            <div style="font-weight: bold; color: #3b82f6;">Delivery</div>
            <div style="font-size: 12px;">${selectedLoad.delivery_city}, ${selectedLoad.delivery_state}</div>
          </div>
        `);

        const deliveryMarker = new mapboxgl.Marker({ element: deliveryEl })
          .setLngLat(deliveryCoords)
          .setPopup(deliveryPopup)
          .addTo(map.current!);
        markers.current.push(deliveryMarker);
      }

      // Draw route line
      if (coordinates.length === 2 && map.current) {
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
            'line-color': '#6366f1',
            'line-width': 3,
            'line-opacity': 0.7,
            'line-dasharray': [2, 2],
          },
        });

        map.current.fitBounds(bounds, { padding: 50, maxZoom: 8 });
      }

      setLoading(false);
    };

    updateMap();
  }, [selectedLoad, mapReady, geocodeAddress]);

  return (
    <div className="relative w-full h-full min-h-[200px] rounded-lg overflow-hidden border bg-muted/20">
      <div ref={mapContainer} className="absolute inset-0" />
      
      {/* Legend */}
      <div className="absolute bottom-2 left-2 bg-background/95 backdrop-blur-sm px-2 py-1 rounded text-[10px] flex items-center gap-3 shadow border">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500 border border-white"></div>
          <span>Pickup</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-blue-500 border border-white"></div>
          <span>Delivery</span>
        </div>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
        </div>
      )}

      {/* Empty state */}
      {!selectedLoad && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
          <div className="text-center text-muted-foreground">
            <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">Select a load to view route</p>
          </div>
        </div>
      )}
    </div>
  );
}
