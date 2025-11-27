import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';

const MapTab = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    loadVehicles();
  }, []);

  const loadVehicles = async () => {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .not('last_location', 'is', null);

    if (!error && data) {
      setVehicles(data);
    }
  };

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Initialize map with Mapbox token from environment or user input
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || '';
    
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

  if (!import.meta.env.VITE_MAPBOX_TOKEN) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Mapbox Configuration Required</h2>
          <p className="text-muted-foreground mb-4">
            To display the vehicle tracking map, you need to add your Mapbox public token.
          </p>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium mb-2">Step 1: Get your Mapbox token</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-4">
                <li>Visit <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noopener noreferrer" className="text-primary underline">Mapbox Access Tokens</a></li>
                <li>Sign up or log in to your account</li>
                <li>Copy your default public token</li>
              </ol>
            </div>
            <div>
              <h3 className="font-medium mb-2">Step 2: Add the token</h3>
              <p className="text-sm text-muted-foreground ml-4">
                Contact your administrator to add the <code className="bg-muted px-1 py-0.5 rounded">VITE_MAPBOX_TOKEN</code> to your backend configuration.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-120px)] relative">
      <div ref={mapContainer} className="absolute inset-0 rounded-lg" />
      <div className="absolute top-4 left-4 bg-background/95 backdrop-blur p-4 rounded-lg shadow-lg">
        <h3 className="font-semibold mb-2">Fleet Overview</h3>
        <p className="text-sm text-muted-foreground">
          {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} tracked
        </p>
      </div>
    </div>
  );
};

export default MapTab;
