import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

export interface LocationPoint {
  id: string;
  vehicle_id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  odometer: number | null;
  recorded_at: string;
}

export interface VehicleHistoryState {
  loading: boolean;
  points: LocationPoint[];
  selectedDate: Date;
  selectedVehicleId: string | null;
}

export function useVehicleHistory() {
  const [state, setState] = useState<VehicleHistoryState>({
    loading: false,
    points: [],
    selectedDate: new Date(),
    selectedVehicleId: null,
  });

  const fetchHistory = useCallback(async (vehicleId: string, date: Date) => {
    setState(prev => ({ ...prev, loading: true, selectedVehicleId: vehicleId, selectedDate: date }));

    try {
      const dayStart = startOfDay(date).toISOString();
      const dayEnd = endOfDay(date).toISOString();

      const { data, error } = await supabase
        .from('vehicle_location_history')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .gte('recorded_at', dayStart)
        .lte('recorded_at', dayEnd)
        .order('recorded_at', { ascending: true });

      if (error) {
        console.error('Error fetching vehicle history:', error);
        setState(prev => ({ ...prev, loading: false, points: [] }));
        return [];
      }

      const points = (data || []).map(p => ({
        id: p.id,
        vehicle_id: p.vehicle_id,
        latitude: Number(p.latitude),
        longitude: Number(p.longitude),
        speed: p.speed ? Number(p.speed) : null,
        heading: p.heading ? Number(p.heading) : null,
        odometer: p.odometer ? Number(p.odometer) : null,
        recorded_at: p.recorded_at,
      }));

      setState(prev => ({ ...prev, loading: false, points }));
      return points;
    } catch (error) {
      console.error('Error fetching vehicle history:', error);
      setState(prev => ({ ...prev, loading: false, points: [] }));
      return [];
    }
  }, []);

  const setSelectedDate = useCallback((date: Date) => {
    setState(prev => ({ ...prev, selectedDate: date }));
    if (state.selectedVehicleId) {
      fetchHistory(state.selectedVehicleId, date);
    }
  }, [state.selectedVehicleId, fetchHistory]);

  const setSelectedVehicle = useCallback((vehicleId: string | null) => {
    if (vehicleId) {
      fetchHistory(vehicleId, state.selectedDate);
    } else {
      setState(prev => ({ ...prev, selectedVehicleId: null, points: [] }));
    }
  }, [state.selectedDate, fetchHistory]);

  const goToPreviousDay = useCallback(() => {
    const newDate = subDays(state.selectedDate, 1);
    setSelectedDate(newDate);
  }, [state.selectedDate, setSelectedDate]);

  const goToNextDay = useCallback(() => {
    const today = new Date();
    const nextDay = new Date(state.selectedDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    // Don't go past today
    if (nextDay <= today) {
      setSelectedDate(nextDay);
    }
  }, [state.selectedDate, setSelectedDate]);

  const clearHistory = useCallback(() => {
    setState(prev => ({ ...prev, points: [], selectedVehicleId: null }));
  }, []);

  const getAvailableDates = useCallback(async (vehicleId: string): Promise<string[]> => {
    try {
      const { data, error } = await supabase
        .from('vehicle_location_history')
        .select('recorded_at')
        .eq('vehicle_id', vehicleId)
        .order('recorded_at', { ascending: false });

      if (error || !data) return [];

      // Get unique dates
      const uniqueDates = new Set<string>();
      data.forEach(p => {
        uniqueDates.add(format(new Date(p.recorded_at), 'yyyy-MM-dd'));
      });

      return Array.from(uniqueDates);
    } catch {
      return [];
    }
  }, []);

  return {
    ...state,
    fetchHistory,
    setSelectedDate,
    setSelectedVehicle,
    goToPreviousDay,
    goToNextDay,
    clearHistory,
    getAvailableDates,
  };
}
