import { supabase } from './supabase';
import type { Vehicle, ParkingSettings, PricingSettings } from '@/types/parking';

// ── Helpers de tarifa (comuns a parking_settings e price_modules) ─────────────

function rowToPricing(row: Record<string, unknown>): PricingSettings {
  return {
    chargeMode:          row.charge_mode === 'fixed' ? 'fixed' : 'hourly',
    fixedPrice:          row.fixed_price != null ? Number(row.fixed_price) : 0,
    toleranceMinutes:    Number(row.tolerance_minutes),
    firstHourPrice:      Number(row.first_hour_price),
    additionalHourPrice: Number(row.additional_hour_price),
    dailyMaxPrice:       Number(row.daily_max_price),
    roundUpMinutes:      Number(row.round_up_minutes),
  };
}

function pricingToRow(p: PricingSettings) {
  return {
    charge_mode:           p.chargeMode,
    fixed_price:           p.fixedPrice,
    tolerance_minutes:     p.toleranceMinutes,
    first_hour_price:      p.firstHourPrice,
    additional_hour_price: p.additionalHourPrice,
    daily_max_price:       p.dailyMaxPrice,
    round_up_minutes:      p.roundUpMinutes,
  };
}

/**
 * Se a migração das colunas charge_mode/fixed_price ainda não rodou no Supabase,
 * o PostgREST recusa o payload. Nesse caso tentamos de novo sem elas para não
 * quebrar o resto do salvamento (o modo fixo fica só neste dispositivo).
 */
function isMissingChargeColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST204' && /charge_mode|fixed_price/.test(error.message ?? '');
}

function withoutChargeColumns<T extends Record<string, unknown>>(payload: T) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { charge_mode, fixed_price, ...rest } = payload;
  console.warn('[OmniPark] Colunas charge_mode/fixed_price não existem no banco — rode a migração do schema.sql.');
  return rest;
}

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
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      plate:        vehicle.plate,
      vehicle_name: vehicle.vehicleName ?? null,
      entry_time:   vehicle.entryTime,
      status:       vehicle.status,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToVehicle(data);
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
    pricing:     rowToPricing(row),
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
    ...pricingToRow(m.pricing),
  };
  const isNew = m.id.startsWith('local-');
  const write = (body: Record<string, unknown>) => {
    const client = supabase!;
    return isNew
      ? client.from('price_modules').insert(body).select().single()
      : client.from('price_modules').update(body).eq('id', Number(m.id)).select().single();
  };
  let { data, error } = await write(payload);
  if (isMissingChargeColumn(error)) {
    ({ data, error } = await write(withoutChargeColumns(payload)));
    if (!error && data) return { ...rowToModule(data), pricing: m.pricing };
  }
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
    pricing:           rowToPricing(row),
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
  const payload = {
    id:                 1,
    total_spots:        s.totalSpots,
    parking_name:       s.parkingName,
    parking_address:    s.parkingAddress,
    parking_phone:      s.parkingPhone,
    parking_cnpj:       s.parkingCNPJ,
    ticket_observation: s.ticketObservation,
    ...pricingToRow(s.pricing),
  };
  const upsert = (body: Record<string, unknown>) =>
    supabase!.from('parking_settings').upsert(body, { onConflict: 'id' });

  let { error } = await upsert(payload);
  if (isMissingChargeColumn(error)) ({ error } = await upsert(withoutChargeColumns(payload)));
  if (error) throw error;
}
