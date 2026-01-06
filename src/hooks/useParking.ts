import { useMemo, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { Vehicle, ParkingSettings, ParkingStats, DEFAULT_SETTINGS, HistoryFilters } from '@/types/parking';
import { calculateParkingFee, generateId, isToday } from '@/lib/parking-utils';

const VEHICLES_KEY = 'parking_vehicles';
const SETTINGS_KEY = 'parking_settings';

export function useParking() {
  const [vehicles, setVehicles] = useLocalStorage<Vehicle[]>(VEHICLES_KEY, []);
  const [settings, setSettings] = useLocalStorage<ParkingSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);

  const parkedVehicles = useMemo(() => 
    vehicles.filter(v => v.status === 'parked'),
    [vehicles]
  );

  const stats: ParkingStats = useMemo(() => {
    const occupiedSpots = parkedVehicles.length;
    const todayExited = vehicles.filter(v => 
      v.status === 'exited' && 
      v.exitTime && 
      isToday(new Date(v.exitTime))
    );
    
    return {
      occupiedSpots,
      availableSpots: settings.totalSpots - occupiedSpots,
      todayRevenue: todayExited.reduce((sum, v) => sum + (v.amountPaid || 0), 0),
      todayVehicles: todayExited.length + parkedVehicles.filter(v => isToday(new Date(v.entryTime))).length,
    };
  }, [vehicles, parkedVehicles, settings.totalSpots]);

  const registerEntry = useCallback((plate: string, vehicleName?: string): Vehicle => {
    const normalizedPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    const newVehicle: Vehicle = {
      id: generateId(),
      plate: normalizedPlate,
      vehicleName: vehicleName?.trim() || undefined,
      entryTime: new Date().toISOString(),
      status: 'parked',
    };

    setVehicles(prev => [newVehicle, ...prev]);
    return newVehicle;
  }, [setVehicles]);

  const registerExit = useCallback((vehicleId: string): Vehicle | null => {
    let exitedVehicle: Vehicle | null = null;

    setVehicles(prev => prev.map(vehicle => {
      if (vehicle.id === vehicleId && vehicle.status === 'parked') {
        const exitTime = new Date();
        const amountPaid = calculateParkingFee(
          new Date(vehicle.entryTime),
          exitTime,
          settings.pricing
        );
        
        exitedVehicle = {
          ...vehicle,
          exitTime: exitTime.toISOString(),
          amountPaid,
          status: 'exited',
        };
        return exitedVehicle;
      }
      return vehicle;
    }));

    return exitedVehicle;
  }, [setVehicles, settings.pricing]);

  const findVehicleByPlate = useCallback((plate: string): Vehicle | undefined => {
    const normalizedPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return parkedVehicles.find(v => v.plate === normalizedPlate);
  }, [parkedVehicles]);

  const getHistory = useCallback((filters: HistoryFilters = {}): Vehicle[] => {
    return vehicles.filter(v => {
      if (v.status !== 'exited') return false;
      
      if (filters.plate) {
        const normalizedFilter = filters.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!v.plate.includes(normalizedFilter)) return false;
      }
      
      if (filters.startDate && v.exitTime) {
        if (new Date(v.exitTime) < new Date(filters.startDate)) return false;
      }
      
      if (filters.endDate && v.exitTime) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        if (new Date(v.exitTime) > endDate) return false;
      }
      
      return true;
    }).sort((a, b) => 
      new Date(b.exitTime!).getTime() - new Date(a.exitTime!).getTime()
    );
  }, [vehicles]);

  const updateSettings = useCallback((newSettings: Partial<ParkingSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, [setSettings]);

  const updatePricing = useCallback((pricing: Partial<typeof settings.pricing>) => {
    setSettings(prev => ({
      ...prev,
      pricing: { ...prev.pricing, ...pricing },
    }));
  }, [setSettings]);

  return {
    vehicles,
    parkedVehicles,
    settings,
    stats,
    registerEntry,
    registerExit,
    findVehicleByPlate,
    getHistory,
    updateSettings,
    updatePricing,
  };
}