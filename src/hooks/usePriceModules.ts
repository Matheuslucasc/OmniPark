import { useState, useEffect, useCallback } from 'react';
import { PriceModule } from '@/types/parking';
import { useLocalStorage } from './useLocalStorage';
import { hasDB } from '@/lib/supabase';
import { dbFetchModules, dbUpsertModule, dbDeleteModule } from '@/lib/db';

const KEY = 'parking_price_modules';

function localId() {
  return `local-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

export function usePriceModules() {
  const [localModules, setLocalModules] = useLocalStorage<PriceModule[]>(KEY, []);
  const [modules, setModules] = useState<PriceModule[]>(localModules);
  const [loading, setLoading] = useState(hasDB());

  useEffect(() => {
    if (!hasDB()) return;
    (async () => {
      try {
        const rows = await dbFetchModules();
        setModules(rows);
      } catch (e) {
        console.error('[OmniPark] Erro ao carregar módulos de preço:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

  return { modules, loading, addModule, saveModule, removeModule };
}
