import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';

interface LoadRouteMapProps {
  stops: any[];
}

export default function LoadRouteMap({ stops }: LoadRouteMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);

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
  }, [stops]);

  const updateMarkersAndRoute = () => {
    if (!map.current) return;

    // Clear existing markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    const coordinates: [number, number][] = [];
    const bounds = new mapboxgl.LngLatBounds();

    // Sort stops by sequence
    const sortedStops = [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);

    sortedStops.forEach((stop, index) => {
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

        // Fit bounds after all markers are added
        if (index === sortedStops.length - 1 && coordinates.length > 0) {
          map.current!.fitBounds(bounds, { padding: 100, maxZoom: 10 });
        }
      });
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
        'line-color': '#6366f1',
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
    <div className="relative w-full h-[600px] rounded-lg overflow-hidden border">
      <div ref={mapContainer} className="absolute inset-0" />
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
        </div>
      </div>
    </div>
  );
}
