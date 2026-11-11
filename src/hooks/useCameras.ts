import { useState, useEffect, useCallback } from 'react';
import { CameraConfig } from '@/types/parking';
import { useLocalStorage } from './useLocalStorage';
import { hasDB } from '@/lib/supabase';
import {
  dbFetchCameras,
  dbUpsertCamera,
  dbDeleteCamera,
  dbSetActiveCamera,
} from '@/lib/db';

const KEY = 'parking_cameras';

function localId() {
  return `cam-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Gerencia as câmeras de leitura. Com Supabase, as câmeras ficam no banco e o
 * leitor Python lê a ativa via /api/active-camera. Sem banco (fallback), usa o
 * localStorage do navegador.
 */
export function useCameras() {
  const [localCameras, setLocalCameras] = useLocalStorage<CameraConfig[]>(KEY, []);
  const [cameras, setCameras] = useState<CameraConfig[]>(localCameras);
  const [loading, setLoading] = useState(hasDB());

  useEffect(() => {
    if (!hasDB()) return;
    (async () => {
      try {
        setCameras(await dbFetchCameras());
      } catch (e) {
        console.error('[OmniPark] Erro ao carregar câmeras:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const reload = useCallback(async () => {
    if (hasDB()) setCameras(await dbFetchCameras());
  }, []);

  const addCamera = useCallback(async (data: Omit<CameraConfig, 'id'>): Promise<void> => {
    const primeira = cameras.length === 0;
    if (hasDB()) {
      const saved = await dbUpsertCamera({ id: localId(), ...data });
      if (primeira || data.isActive) await dbSetActiveCamera(saved.id);
      await reload();
    } else {
      const nova: CameraConfig = { id: localId(), ...data, isActive: primeira || data.isActive };
      const updated = (primeira || data.isActive)
        ? [...cameras.map(c => ({ ...c, isActive: false })), nova]
        : [...cameras, nova];
      setCameras(updated);
      setLocalCameras(updated);
    }
  }, [cameras, reload, setLocalCameras]);

  const saveCamera = useCallback(async (cam: CameraConfig): Promise<void> => {
    if (hasDB()) {
      await dbUpsertCamera(cam);
      if (cam.isActive) await dbSetActiveCamera(cam.id);
      await reload();
    } else {
      const updated = cameras.map(c => {
        if (c.id !== cam.id) return cam.isActive ? { ...c, isActive: false } : c;
        return cam;
      });
      setCameras(updated);
      setLocalCameras(updated);
    }
  }, [cameras, reload, setLocalCameras]);

  const removeCamera = useCallback(async (id: string): Promise<void> => {
    if (hasDB()) {
      await dbDeleteCamera(id);
      await reload();
    } else {
      const remaining = cameras.filter(c => c.id !== id);
      if (remaining.length > 0 && !remaining.some(c => c.isActive)) {
        remaining[0].isActive = true;
      }
      setCameras(remaining);
      setLocalCameras(remaining);
    }
  }, [cameras, reload, setLocalCameras]);

  const setActiveCamera = useCallback(async (id: string): Promise<void> => {
    if (hasDB()) {
      await dbSetActiveCamera(id);
      await reload();
    } else {
      const updated = cameras.map(c => ({ ...c, isActive: c.id === id }));
      setCameras(updated);
      setLocalCameras(updated);
    }
  }, [cameras, reload, setLocalCameras]);

  return { cameras, loading, addCamera, saveCamera, removeCamera, setActiveCamera };
}
