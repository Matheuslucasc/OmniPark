import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { Vehicle, ParkingSettings, ParkingStats, DEFAULT_SETTINGS, HistoryFilters } from '@/types/parking';
import { calculateParkingFee, generateId, isToday } from '@/lib/parking-utils';
import { hasDB } from '@/lib/supabase';
import { dbFetchVehicles, dbInsertVehicle, dbUpdateVehicleExit, dbFetchSettings, dbUpsertSettings } from '@/lib/db';

const VEHICLES_KEY = 'parking_vehicles';
const SETTINGS_KEY = 'parking_settings';

export function useParking() {
  const [localVehicles, setLocalVehicles] = useLocalStorage<Vehicle[]>(VEHICLES_KEY, []);
  const [localSettings, setLocalSettings] = useLocalStorage<ParkingSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);

  // Live state (mirrors DB or localStorage)
  const [vehicles, setVehicles] = useState<Vehicle[]>(localVehicles);
  const [settings, setSettings] = useState<ParkingSettings>(localSettings);
  const [isLoading, setIsLoading] = useState(hasDB());

  // ── Initial load from Supabase ──────────────────────────────────────────────
  useEffect(() => {
    if (!hasDB()) return;

    (async () => {
      try {
        const [dbVehicles, dbSettings] = await Promise.all([
          dbFetchVehicles(),
          dbFetchSettings(),
        ]);
        setVehicles(dbVehicles);
        if (dbSettings) setSettings(dbSettings);
      } catch (err) {
        console.error('[OmniPark] Erro ao carregar dados do banco:', err);
        // Fall back to localStorage data already in state
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const parkedVehicles = useMemo(
    () => vehicles.filter(v => v.status === 'parked'),
    [vehicles]
  );

  const stats: ParkingStats = useMemo(() => {
    const occupiedSpots = parkedVehicles.length;
    const todayExited = vehicles.filter(
      v => v.status === 'exited' && v.exitTime && isToday(new Date(v.exitTime))
    );
    return {
      occupiedSpots,
      availableSpots: settings.totalSpots - occupiedSpots,
      todayRevenue: todayExited.reduce((sum, v) => sum + (v.amountPaid || 0), 0),
      todayVehicles:
        todayExited.length +
        parkedVehicles.filter(v => isToday(new Date(v.entryTime))).length,
    };
  }, [vehicles, parkedVehicles, settings.totalSpots]);

  // ── Write helpers ────────────────────────────────────────────────────────────

  const syncVehicleLocally = (updated: Vehicle[]) => {
    setVehicles(updated);
    if (!hasDB()) setLocalVehicles(updated);
  };

  // ── Actions ──────────────────────────────────────────────────────────────────

  const registerEntry = useCallback(async (plate: string, vehicleName?: string): Promise<Vehicle> => {
    const normalized = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const draft: Omit<Vehicle, 'id'> = {
      plate:       normalized,
      vehicleName: vehicleName?.trim() || undefined,
      entryTime:   new Date().toISOString(),
      status:      'parked',
    };

    if (hasDB()) {
      const saved = await dbInsertVehicle(draft);
      setVehicles(prev => [saved, ...prev]);
      return saved;
    }

    const newVehicle: Vehicle = { id: generateId(), ...draft };
    syncVehicleLocally([newVehicle, ...vehicles]);
    return newVehicle;
  }, [vehicles]);

  const registerExit = useCallback(async (vehicleId: string): Promise<Vehicle | null> => {
    const target = vehicles.find(v => v.id === vehicleId && v.status === 'parked');
    if (!target) return null;

    const exitTime = new Date();
    const amountPaid = calculateParkingFee(
      new Date(target.entryTime),
      exitTime,
      settings.pricing
    );

    if (hasDB()) {
      const updated = await dbUpdateVehicleExit(vehicleId, exitTime.toISOString(), amountPaid);
      setVehicles(prev => prev.map(v => v.id === vehicleId ? updated : v));
      return updated;
    }

    const exited: Vehicle = {
      ...target,
      exitTime:   exitTime.toISOString(),
      amountPaid,
      status:     'exited',
    };
    syncVehicleLocally(vehicles.map(v => v.id === vehicleId ? exited : v));
    return exited;
  }, [vehicles, settings.pricing]);

  const findVehicleByPlate = useCallback((plate: string): Vehicle | undefined => {
    const normalized = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return parkedVehicles.find(v => v.plate === normalized);
  }, [parkedVehicles]);

  const getHistory = useCallback((filters: HistoryFilters = {}): Vehicle[] => {
    return vehicles
      .filter(v => {
        if (v.status !== 'exited') return false;
        if (filters.plate) {
          const norm = filters.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (!v.plate.includes(norm)) return false;
        }
        if (filters.startDate && v.exitTime) {
          if (new Date(v.exitTime) < new Date(filters.startDate)) return false;
        }
        if (filters.endDate && v.exitTime) {
          const end = new Date(filters.endDate);
          end.setHours(23, 59, 59, 999);
          if (new Date(v.exitTime) > end) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.exitTime!).getTime() - new Date(a.exitTime!).getTime());
  }, [vehicles]);

  const updateSettings = useCallback(async (newSettings: Partial<ParkingSettings>) => {
    const merged = { ...settings, ...newSettings };
    setSettings(merged);
    setLocalSettings(merged); // sempre persiste localmente como fallback
    if (hasDB()) {
      try { await dbUpsertSettings(merged); } catch (e) { console.error('[OmniPark] Erro ao salvar configurações:', e); }
    }
  }, [settings, setLocalSettings]);

  const updatePricing = useCallback(async (pricing: Partial<typeof settings.pricing>) => {
    const merged = { ...settings, pricing: { ...settings.pricing, ...pricing } };
    setSettings(merged);
    setLocalSettings(merged); // sempre persiste localmente como fallback
    if (hasDB()) {
      try { await dbUpsertSettings(merged); } catch (e) { console.error('[OmniPark] Erro ao salvar preços:', e); }
    }
  }, [settings, setLocalSettings]);

  return {
    vehicles,
    parkedVehicles,
    settings,
    stats,
    isLoading,
    registerEntry,
    registerExit,
    findVehicleByPlate,
    getHistory,
    updateSettings,
    updatePricing,
  };
}
