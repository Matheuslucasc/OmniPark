import { supabase } from './supabase';
import type { Vehicle, ParkingSettings, CameraConfig } from '@/types/parking';

// ── Mapeamento banco (snake_case) → app (camelCase) ──────────────────────────

function rowToVehicle(row: Record<string, unknown>): Vehicle {
  return {
    id:          row.id as string,
    plate:       row.plate as string,
    vehicleName: row.vehicle_name as string | undefined,
    entryTime:   row.entry_time as string,
    exitTime:    row.exit_time as string | undefined,
    amountPaid:  row.amount_paid != null ? Number(row.amount_paid) : undefined,
    status:      row.status as 'parked' | 'exited',
    dailyTicket: row.daily_ticket != null ? Number(row.daily_ticket) : undefined,
  };
}

// ── Vehicles ─────────────────────────────────────────────────────────────────

export async function dbFetchVehicles(): Promise<Vehicle[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .order('entry_time', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToVehicle);
}

export async function dbInsertVehicle(
  vehicle: Omit<Vehicle, 'id'>
): Promise<Vehicle> {
  if (!supabase) throw new Error('Supabase não configurado');
  const base = {
    plate:        vehicle.plate,
    vehicle_name: vehicle.vehicleName ?? null,
    entry_time:   vehicle.entryTime,
    status:       vehicle.status,
  };
  let res = await supabase
    .from('vehicles')
    .insert({ ...base, daily_ticket: vehicle.dailyTicket ?? null })
    .select()
    .single();
  // Se a coluna daily_ticket ainda não foi criada no banco, insere sem ela
  // (a entrada nunca deve falhar por causa desse recurso opcional).
  if (res.error && /daily_ticket/.test(res.error.message)) {
    res = await supabase.from('vehicles').insert(base).select().single();
  }
  if (res.error) throw res.error;
  return rowToVehicle(res.data);
}

export async function dbUpdateVehicleExit(
  id: string,
  exitTime: string,
  amountPaid: number
): Promise<Vehicle> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('vehicles')
    .update({ exit_time: exitTime, amount_paid: amountPaid, status: 'exited' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return rowToVehicle(data);
}

export async function dbDeleteVehicle(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('vehicles').delete().eq('id', id);
  if (error) throw error;
}

// ── Price Modules ─────────────────────────────────────────────────────────────

import type { PriceModule } from '@/types/parking';

function rowToModule(row: Record<string, unknown>): PriceModule {
  return {
    id:          String(row.id),
    name:        row.name as string,
    description: row.description as string | undefined,
    isActive:    row.is_active as boolean,
    pricing: {
      toleranceMinutes:    Number(row.tolerance_minutes),
      firstHourPrice:      Number(row.first_hour_price),
      additionalHourPrice: Number(row.additional_hour_price),
      dailyMaxPrice:       Number(row.daily_max_price),
      roundUpMinutes:      Number(row.round_up_minutes),
    },
  };
}

export async function dbFetchModules(): Promise<PriceModule[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('price_modules')
    .select('*')
    .order('id');
  if (error) throw error;
  return (data ?? []).map(rowToModule);
}

export async function dbUpsertModule(m: PriceModule): Promise<PriceModule> {
  if (!supabase) throw new Error('Supabase não configurado');
  const payload = {
    name:                 m.name,
    description:          m.description ?? null,
    is_active:            m.isActive,
    tolerance_minutes:    m.pricing.toleranceMinutes,
    first_hour_price:     m.pricing.firstHourPrice,
    additional_hour_price: m.pricing.additionalHourPrice,
    daily_max_price:      m.pricing.dailyMaxPrice,
    round_up_minutes:     m.pricing.roundUpMinutes,
  };
  const isNew = m.id.startsWith('local-');
  if (isNew) {
    const { data, error } = await supabase.from('price_modules').insert(payload).select().single();
    if (error) throw error;
    return rowToModule(data);
  }
  const { data, error } = await supabase
    .from('price_modules')
    .update(payload)
    .eq('id', Number(m.id))
    .select()
    .single();
  if (error) throw error;
  return rowToModule(data);
}

export async function dbDeleteModule(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('price_modules').delete().eq('id', Number(id));
  if (error) throw error;
}

// ── Settings ──────────────────────────────────────────────────────────────────

function rowToSettings(row: Record<string, unknown>): ParkingSettings {
  return {
    totalSpots:        Number(row.total_spots),
    parkingName:       (row.parking_name as string) ?? '',
    parkingAddress:    (row.parking_address as string) ?? '',
    parkingPhone:      (row.parking_phone as string) ?? '',
    parkingCNPJ:       (row.parking_cnpj as string) ?? '',
    ticketObservation: (row.ticket_observation as string) ?? '',
    pricing: {
      toleranceMinutes:    Number(row.tolerance_minutes),
      firstHourPrice:      Number(row.first_hour_price),
      additionalHourPrice: Number(row.additional_hour_price),
      dailyMaxPrice:       Number(row.daily_max_price),
      roundUpMinutes:      Number(row.round_up_minutes),
    },
    // print é device-specific, não vem do banco
    print: { paperSize: 'thermal80', fontSize: 12, printerName: '' },
  };
}

/**
 * Retorna as settings do banco.
 * `userSaved = true` indica que o usuário já salvou ao menos uma vez
 * (updated_at > created_at via trigger), ou seja, não são os defaults do schema.
 */
export async function dbFetchSettings(): Promise<{ settings: ParkingSettings; userSaved: boolean } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('parking_settings')
    .select('*')
    .limit(1)
    .single();
  if (error || !data) return null;
  const userSaved = data.updated_at !== data.created_at;
  return { settings: rowToSettings(data), userSaved };
}

export async function dbUpsertSettings(s: ParkingSettings): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('parking_settings')
    .upsert(
      {
        id:                    1,
        total_spots:           s.totalSpots,
        parking_name:          s.parkingName,
        parking_address:       s.parkingAddress,
        parking_phone:         s.parkingPhone,
        parking_cnpj:          s.parkingCNPJ,
        ticket_observation:    s.ticketObservation,
        tolerance_minutes:     s.pricing.toleranceMinutes,
        first_hour_price:      s.pricing.firstHourPrice,
        additional_hour_price: s.pricing.additionalHourPrice,
        daily_max_price:       s.pricing.dailyMaxPrice,
        round_up_minutes:      s.pricing.roundUpMinutes,
      },
      { onConflict: 'id' }
    );
  if (error) throw error;
}

// ── Câmeras ───────────────────────────────────────────────────────────────────

function rowToCamera(row: Record<string, unknown>): CameraConfig {
  return {
    id:         String(row.id),
    name:       row.name as string,
    ipAddress:  row.ip_address as string,
    port:       Number(row.port),
    protocol:   row.protocol as CameraConfig['protocol'],
    streamPath: (row.stream_path as string) ?? '/stream',
    username:   (row.username as string) ?? '',
    password:   (row.password as string) ?? '',
    location:   (row.location as string) ?? '',
    isActive:   row.is_active as boolean,
  };
}

function cameraToRow(cam: Omit<CameraConfig, 'id' | 'isActive'>) {
  return {
    name:        cam.name,
    ip_address:  cam.ipAddress,
    port:        cam.port,
    protocol:    cam.protocol,
    stream_path: cam.streamPath,
    username:    cam.username || null,
    password:    cam.password || null,
    location:    cam.location || null,
  };
}

export async function dbFetchCameras(): Promise<CameraConfig[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('camera_settings')
    .select('*')
    .order('id');
  if (error) throw error;
  return (data ?? []).map(rowToCamera);
}

export async function dbUpsertCamera(cam: CameraConfig): Promise<CameraConfig> {
  if (!supabase) throw new Error('Supabase não configurado');
  const isNew = !/^\d+$/.test(cam.id); // id do banco é numérico; ids locais têm prefixo
  if (isNew) {
    const { data, error } = await supabase
      .from('camera_settings')
      .insert({ ...cameraToRow(cam), is_active: false })
      .select()
      .single();
    if (error) throw error;
    return rowToCamera(data);
  }
  const { data, error } = await supabase
    .from('camera_settings')
    .update(cameraToRow(cam))
    .eq('id', Number(cam.id))
    .select()
    .single();
  if (error) throw error;
  return rowToCamera(data);
}

export async function dbDeleteCamera(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('camera_settings').delete().eq('id', Number(id));
  if (error) throw error;
}

/**
 * Marca uma câmera como ativa. O índice único do banco só permite uma ativa,
 * então primeiro zera todas e depois ativa a escolhida.
 */
export async function dbSetActiveCamera(id: string): Promise<void> {
  if (!supabase) return;
  const off = await supabase
    .from('camera_settings')
    .update({ is_active: false })
    .neq('id', 0); // atinge todas as linhas
  if (off.error) throw off.error;
  const on = await supabase
    .from('camera_settings')
    .update({ is_active: true })
    .eq('id', Number(id));
  if (on.error) throw on.error;
}

// ── Correções de placa (dataset para melhorar a precisão) ────────────────────

function normalizarPlaca(p: string): string {
  return p.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Registra o que o OCR leu vs. a placa que o operador confirmou. Chamado ao
 * registrar uma entrada originada de leitura de câmera. Falha em silêncio
 * (não deve atrapalhar o registro da entrada).
 */
export async function dbLogCorrection(
  ocrPlate: string,
  finalPlate: string,
  imageUrl?: string,
  cameraId?: number | null,
): Promise<void> {
  if (!supabase) return;
  const ocr = normalizarPlaca(ocrPlate);
  const fin = normalizarPlaca(finalPlate);
  if (!fin) return;
  const { error } = await supabase.from('plate_corrections').insert({
    ocr_plate:     ocr || null,
    final_plate:   fin,
    was_corrected: ocr !== fin,
    image_url:     imageUrl ?? null,
    camera_id:     cameraId ?? null,
  });
  if (error) throw error;
}
