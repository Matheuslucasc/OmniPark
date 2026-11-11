import { useState, useEffect, useCallback } from 'react';
import { PriceModule, DEFAULT_SETTINGS } from '@/types/parking';
import { normalizePricing } from '@/lib/parking-utils';
import { useLocalStorage } from './useLocalStorage';
import { hasDB } from '@/lib/supabase';
import { dbFetchModules, dbUpsertModule, dbDeleteModule } from '@/lib/db';

const KEY = 'parking_price_modules';

function localId() {
  return `local-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

export function usePriceModules() {
  const [localModules, setLocalModules] = useLocalStorage<PriceModule[]>(KEY, []);
  // Normaliza tarifas antigas salvas antes de existir o modo de cobrança
  const [modules, setModules] = useState<PriceModule[]>(() =>
    (Array.isArray(localModules) ? localModules : [])
      .filter(m => m && m.pricing)
      .map(m => ({ ...m, pricing: normalizePricing(m.pricing, DEFAULT_SETTINGS.pricing) })),
  );
  const [loading, setLoading] = useState(hasDB());

  /** Recarrega do banco (tarifas criadas/alteradas em outro aparelho). */
  const reload = useCallback(async () => {
    if (!hasDB()) return;
    try {
      setModules(await dbFetchModules());
    } catch (e) {
      console.error('[OmniPark] Erro ao carregar módulos de preço:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // Ao voltar para a aba/app, pega tarifas alteradas em outro aparelho
    const onVisible = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  const saveModule = useCallback(async (m: PriceModule): Promise<void> => {
    if (hasDB()) {
      const saved = await dbUpsertModule(m);
      setModules(prev => {
        const exists = prev.some(x => x.id === m.id);
        return exists ? prev.map(x => x.id === m.id ? saved : x) : [...prev, saved];
      });
    } else {
      const updated = modules.some(x => x.id === m.id)
        ? modules.map(x => x.id === m.id ? m : x)
        : [...modules, m];
      setModules(updated);
      setLocalModules(updated);
    }
  }, [modules, setLocalModules]);

  const addModule = useCallback(async (data: Omit<PriceModule, 'id'>): Promise<void> => {
    await saveModule({ id: localId(), ...data });
  }, [saveModule]);

  const removeModule = useCallback(async (id: string): Promise<void> => {
    if (hasDB()) await dbDeleteModule(id);
    const updated = modules.filter(m => m.id !== id);
    setModules(updated);
    if (!hasDB()) setLocalModules(updated);
  }, [modules, setLocalModules]);

  return { modules, loading, reload, addModule, saveModule, removeModule };
}
