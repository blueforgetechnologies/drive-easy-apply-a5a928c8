import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';

const MapTab = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    loadVehicles();
    
    // Auto-refresh vehicle positions every 30 seconds
    const refreshInterval = setInterval(() => {
      loadVehicles();
    }, 30000);

    return () => {
      clearInterval(refreshInterval);
    };
  }, []);

  const loadVehicles = async () => {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .not('last_location', 'is', null);

    if (!error && data) {
      setVehicles(data);
      setLastUpdate(new Date());
    }
  };

  useEffect(() => {
    const initializeMap = async () => {
      if (!mapContainer.current || map.current) return;

      // Fetch Mapbox token from backend
      const { data: tokenData, error: tokenError } = await supabase.functions.invoke('get-mapbox-token');
      
      if (tokenError || !tokenData?.token) {
        console.error('Failed to fetch Mapbox token:', tokenError);
        return;
      }

      // Initialize map with token from backend
      mapboxgl.accessToken = tokenData.token;
      
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-98, 39], // Center of USA
        zoom: 4,
      });

      map.current.addControl(
        new mapboxgl.NavigationControl({
          visualizePitch: true,
        }),
        'top-right'
      );
    };

    initializeMap();

    return () => {
      markersRef.current.forEach(marker => marker.remove());
      map.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!map.current || vehicles.length === 0) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add markers for each vehicle with GPS data
    const bounds = new mapboxgl.LngLatBounds();
    
    vehicles.forEach(vehicle => {
      // Parse location from last_location field or use direct lat/lng if available
      let lat, lng;
      
      if (vehicle.last_location) {
        // Try to parse coordinates from location string
        const coordMatch = vehicle.last_location.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
        if (coordMatch) {
          lat = parseFloat(coordMatch[1]);
          lng = parseFloat(coordMatch[2]);
        }
      }

      // If we have valid coordinates, add marker
      if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
        const el = document.createElement('div');
        el.className = 'vehicle-marker';
        el.style.cssText = `
          background-color: hsl(var(--primary));
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 3px solid hsl(var(--background));
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          color: hsl(var(--primary-foreground));
          font-size: 12px;
        `;
        el.textContent = vehicle.vehicle_number || '?';

        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div style="padding: 8px;">
            <h3 style="font-weight: bold; margin-bottom: 4px;">${vehicle.vehicle_number || 'Unknown'}</h3>
            <p style="margin: 2px 0;"><strong>Status:</strong> ${vehicle.stopped_status || 'Unknown'}</p>
            <p style="margin: 2px 0;"><strong>Speed:</strong> ${vehicle.speed || 0} mph</p>
            <p style="margin: 2px 0;"><strong>Location:</strong> ${vehicle.last_location || 'Unknown'}</p>
            ${vehicle.odometer ? `<p style="margin: 2px 0;"><strong>Odometer:</strong> ${vehicle.odometer.toLocaleString()} mi</p>` : ''}
          </div>
        `);

        const marker = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map.current!);

        markersRef.current.push(marker);
        bounds.extend([lng, lat]);
      }
    });

    // Fit map to show all markers
    if (markersRef.current.length > 0) {
      map.current.fitBounds(bounds, {
        padding: 50,
        maxZoom: 12,
      });
    }
  }, [vehicles]);


  return (
    <div className="h-[calc(100vh-120px)] relative">
      <div ref={mapContainer} className="absolute inset-0 rounded-lg" />
      <div className="absolute top-4 left-4 bg-background/95 backdrop-blur p-4 rounded-lg shadow-lg">
        <h3 className="font-semibold mb-2">Fleet Overview</h3>
        <p className="text-sm text-muted-foreground">
          {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} tracked
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Last updated: {lastUpdate.toLocaleTimeString()}
        </p>
        <p className="text-xs text-muted-foreground">
          Auto-refresh: every 30s
        </p>
      </div>
    </div>
  );
};

export default MapTab;
