import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { Vehicle, ParkingSettings, ParkingStats, DEFAULT_SETTINGS, HistoryFilters } from '@/types/parking';
import { calculateParkingFee, generateId, isToday, normalizePricing } from '@/lib/parking-utils';
import { hasDB, supabase } from '@/lib/supabase';
import { rowToVehicle, rowToSettings, VehicleAlreadyExitedError, dbFetchVehicles, dbInsertVehicle, dbUpdateVehicleExit, dbDeleteVehicle, dbFetchSettings, dbUpsertSettings } from '@/lib/db';

const VEHICLES_KEY = 'parking_vehicles';
const SETTINGS_KEY = 'parking_settings';

/** Insere ou substitui pelo id (evita duplicar quando o Realtime e o insert local chegam juntos). */
function upsertById(list: Vehicle[], v: Vehicle): Vehicle[] {
  return list.some(x => x.id === v.id) ? list.map(x => (x.id === v.id ? { ...x, ...v } : x)) : [v, ...list];
}

interface UseParkingOptions {
  /** Chamado quando outro aparelho registra uma entrada (via Supabase Realtime). */
  onRemoteEntry?: (vehicle: Vehicle) => void;
}

export function useParking({ onRemoteEntry }: UseParkingOptions = {}) {
  const [localVehicles, setLocalVehicles] = useLocalStorage<Vehicle[]>(VEHICLES_KEY, []);
  const [localSettings, setLocalSettings] = useLocalStorage<ParkingSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);

  // Garante que settings antigos sem o campo print não quebrem
  const mergedLocal: ParkingSettings = {
    ...DEFAULT_SETTINGS,
    ...localSettings,
    print: { ...DEFAULT_SETTINGS.print, ...(localSettings?.print ?? {}) },
    pricing: normalizePricing(localSettings?.pricing, DEFAULT_SETTINGS.pricing),
  };

  // Live state (mirrors DB or localStorage)
  const [vehicles, setVehicles] = useState<Vehicle[]>(() =>
    Array.isArray(localVehicles) ? localVehicles.filter(v => v && typeof v.id === 'string') : []);
  const [settings, setSettings] = useState<ParkingSettings>(mergedLocal);
  const [isLoading, setIsLoading] = useState(hasDB());

  // ── Initial load from Supabase ──────────────────────────────────────────────
  useEffect(() => {
    if (!hasDB()) return;

    (async () => {
      try {
        const [dbVehicles, dbSettingsResult] = await Promise.all([
          dbFetchVehicles(),
          dbFetchSettings(),
        ]);

        setVehicles(dbVehicles);

        if (dbSettingsResult?.userSaved) {
          // O usuário já salvou configurações no banco — usa os valores do Supabase
          // mas mantém as print settings locais (device-specific)
          const synced: ParkingSettings = {
            ...dbSettingsResult.settings,
            print: mergedLocal.print,
          };
          setSettings(synced);
          setLocalSettings(synced);
        } else if (dbSettingsResult && !dbSettingsResult.userSaved) {
          // Banco tem apenas os defaults do schema — envia as configs locais para o banco
          try { await dbUpsertSettings(mergedLocal); } catch { /* ignora */ }
        }
      } catch (err) {
        console.error('[OmniPark] Erro ao carregar dados do banco:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sincronização entre aparelhos (Supabase Realtime) ──────────────────────
  // Placas sendo registradas NESTE aparelho: o evento de INSERT pode chegar antes
  // da resposta do insert, então marcamos pela placa para não tratar como remota.
  const localPlatesRef = useRef<Set<string>>(new Set());
  const onRemoteEntryRef = useRef(onRemoteEntry);
  onRemoteEntryRef.current = onRemoteEntry;

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    const channel = client
      .channel('vehicles_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id;
          if (id) setVehicles(prev => prev.filter(v => v.id !== id));
          return;
        }
        const v = rowToVehicle(payload.new as Record<string, unknown>);
        setVehicles(prev => upsertById(prev, v));
        if (payload.eventType === 'INSERT' && !localPlatesRef.current.has(v.plate)) {
          onRemoteEntryRef.current?.(v);
        }
      })
      .subscribe();

    // Configurações/preços alterados em outro aparelho (ex.: ligar o valor fixo
    // no começo do evento) valem na hora em todos — mantendo a impressora local.
    // Canal separado: se o banco ainda não liberou o Realtime desta tabela, a
    // sincronização dos veículos (canal acima) não é afetada.
    const settingsChannel = client
      .channel('settings_live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'parking_settings' }, (payload) => {
        const novo = rowToSettings(payload.new as Record<string, unknown>);
        setSettings(prev => ({ ...novo, print: prev.print }));
      })
      .subscribe();

    // Rede: ao voltar para a aba (ou o celular acordar), recarrega a lista para
    // cobrir eventos perdidos enquanto a conexão estava parada.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      dbFetchVehicles().then(setVehicles).catch(() => { /* mantém a lista atual */ });
      dbFetchSettings()
        .then(r => { if (r?.userSaved) setSettings(prev => ({ ...r.settings, print: prev.print })); })
        .catch(() => { /* mantém as atuais */ });
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      client.removeChannel(channel);
      client.removeChannel(settingsChannel);
    };
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
    // Número sequencial do dia: maior número de hoje + 1 (zera à meia-noite).
    // Usa o máximo (e não a contagem) para não colidir se algum registro do dia
    // for excluído.
    const ticketsHoje = vehicles
      .filter(v => isToday(new Date(v.entryTime)))
      .map(v => v.dailyTicket ?? 0);
    const dailyTicket = Math.max(0, ...ticketsHoje) + 1;
    const draft: Omit<Vehicle, 'id'> = {
      plate:       normalized,
      vehicleName: vehicleName?.trim() || undefined,
      entryTime:   new Date().toISOString(),
      status:      'parked',
      dailyTicket,
    };

    if (hasDB()) {
      localPlatesRef.current.add(normalized);
      setTimeout(() => localPlatesRef.current.delete(normalized), 30_000);
      const saved = await dbInsertVehicle(draft);
      // Garante o número mesmo se a coluna ainda não existir no banco.
      const withTicket = { ...saved, dailyTicket: saved.dailyTicket ?? dailyTicket };
      setVehicles(prev => upsertById(prev, withTicket));
      return withTicket;
    }

    const newVehicle: Vehicle = { id: generateId(), ...draft };
    syncVehicleLocally([newVehicle, ...vehicles]);
    return newVehicle;
  // syncVehicleLocally é estável; deps intencionalmente limitadas a `vehicles`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles]);

  const registerExit = useCallback(async (vehicleId: string, customPricing?: typeof settings.pricing, overrideAmount?: number): Promise<Vehicle | null> => {
    const target = vehicles.find(v => v.id === vehicleId && v.status === 'parked');
    if (!target) throw new VehicleAlreadyExitedError();

    const exitTime = new Date();
    // `overrideAmount` = o valor que o operador VIU na tela (calculado ou editado
    // à mão). Gravar exatamente esse valor evita cobrar diferente do informado
    // ao cliente se a hora "virar" entre abrir a tela e confirmar.
    const amountPaid = overrideAmount != null
      ? overrideAmount
      : calculateParkingFee(new Date(target.entryTime), exitTime, customPricing ?? settings.pricing);

    if (hasDB()) {
      try {
        const updated = await dbUpdateVehicleExit(vehicleId, exitTime.toISOString(), amountPaid);
        setVehicles(prev => prev.map(v => v.id === vehicleId ? updated : v));
        return updated;
      } catch (e) {
        // Já saiu por outro aparelho: atualiza a lista para refletir o banco
        if (e instanceof VehicleAlreadyExitedError) dbFetchVehicles().then(setVehicles).catch(() => {});
        throw e;
      }
    }

    const exited: Vehicle = {
      ...target,
      exitTime:   exitTime.toISOString(),
      amountPaid,
      status:     'exited',
    };
    syncVehicleLocally(vehicles.map(v => v.id === vehicleId ? exited : v));
    return exited;
  // syncVehicleLocally é estável; deps intencionalmente limitadas.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, settings.pricing]);

  const findVehicleByPlate = useCallback((termo: string): Vehicle | undefined => {
    const normalized = termo.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Só dígitos: tenta pelo número do ticket do dia (ex.: "5" ou "005").
    if (/^\d+$/.test(normalized)) {
      const numero = parseInt(normalized, 10);
      const porTicket = parkedVehicles
        .filter(v => v.dailyTicket === numero)
        .sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime())[0];
      if (porTicket) return porTicket;
    }
    return parkedVehicles.find(v => v.plate === normalized);
  }, [parkedVehicles]);

  const getHistory = useCallback((filters: HistoryFilters = {}): Vehicle[] => {
    return vehicles
      .filter(v => {
        if (v.status !== 'exited') return false;
        if (filters.plate) {
          const term = filters.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (term) {
            const okPlaca = v.plate.includes(term);
            const okTicket = v.dailyTicket != null &&
              (String(v.dailyTicket).padStart(3, '0').includes(term) ||
               String(v.dailyTicket) === term.replace(/^0+/, ''));
            if (!okPlaca && !okTicket) return false;
          }
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

  const deleteVehicle = useCallback(async (vehicleId: string): Promise<void> => {
    if (hasDB()) {
      await dbDeleteVehicle(vehicleId);
    }
    setVehicles(prev => prev.filter(v => v.id !== vehicleId));
    if (!hasDB()) setLocalVehicles(prev => prev.filter(v => v.id !== vehicleId));
  }, [setLocalVehicles]);

  const updateSettings = useCallback((newSettings: Partial<ParkingSettings>) => {
    const merged = { ...settings, ...newSettings };
    setSettings(merged);
    setLocalSettings(merged);
    if (hasDB()) {
      dbUpsertSettings(merged).catch(e => console.error('[OmniPark] Erro ao salvar settings:', e));
    }
  }, [settings, setLocalSettings]);

  const updatePricing = useCallback((pricing: Partial<typeof settings.pricing>) => {
    const merged = { ...settings, pricing: { ...settings.pricing, ...pricing } };
    setSettings(merged);
    setLocalSettings(merged);
    if (hasDB()) {
      dbUpsertSettings(merged).catch(e => console.error('[OmniPark] Erro ao salvar preços:', e));
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
    deleteVehicle,
  };
}
