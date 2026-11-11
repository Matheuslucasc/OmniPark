import { PricingSettings } from '@/types/parking';

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/** Completa campos ausentes (dados antigos do localStorage/banco sem modo de cobrança). */
export function normalizePricing(p: Partial<PricingSettings> | undefined, fallback: PricingSettings): PricingSettings {
  const merged = { ...fallback, ...(p ?? {}) };
  return {
    ...merged,
    chargeMode: merged.chargeMode === 'fixed' ? 'fixed' : 'hourly',
    fixedPrice: Number.isFinite(merged.fixedPrice) ? merged.fixedPrice : fallback.fixedPrice,
  };
}

/** Resumo curto da tarifa para exibir em cards (ex: "Valor fixo: R$ 20,00"). */
export function describePricing(p: PricingSettings): string[] {
  if (p.chargeMode === 'fixed') {
    return [`Valor fixo: ${formatCurrency(p.fixedPrice)}`];
  }
  const parts = [
    `1ª hora: ${formatCurrency(p.firstHourPrice)}`,
    `Adic.: ${formatCurrency(p.additionalHourPrice)}`,
    `Máx.: ${formatCurrency(p.dailyMaxPrice)}`,
  ];
  if (p.toleranceMinutes > 0) parts.push(`Tolerância: ${p.toleranceMinutes}min`);
  return parts;
}

/** Formata o número do ticket diário: 1 -> "001". Vazio se não houver número. */
export function formatTicket(n?: number): string {
  return n != null ? String(n).padStart(3, '0') : '';
}

export function calculateParkingFee(
  entryTime: Date,
  exitTime: Date,
  pricing: PricingSettings
): number {
  // Modo evento: valor fixo independente do tempo de permanência
  if (pricing.chargeMode === 'fixed') {
    return Math.max(0, pricing.fixedPrice || 0);
  }

  const diffMinutes = Math.floor((exitTime.getTime() - entryTime.getTime()) / 60000);

  // Dentro da tolerância (ou relógio inconsistente): não cobra
  if (diffMinutes <= pricing.toleranceMinutes) return 0;

  // O "valor máximo diário" vale para CADA período de 24h: cada dia completo
  // custa no máximo uma diária, e o restante é cobrado pela tabela por hora.
  const DIA = 24 * 60;
  const diasCompletos = Math.floor(diffMinutes / DIA);
  const restante = diffMinutes - diasCompletos * DIA;

  const total = diasCompletos > 0
    ? diasCompletos * pricing.dailyMaxPrice + (restante > 0 ? cobrancaPorHora(restante, pricing) : 0)
    : cobrancaPorHora(diffMinutes - pricing.toleranceMinutes, pricing);

  // Valor cheio (sem centavos) — evita cobranças como R$ 10,42.
  return Math.round(total);
}

/**
 * Cobrança por hora de um período de até 24h, já limitada à diária máxima.
 * Regra de arredondamento: o excedente de uma hora só é cobrado como hora cheia
 * a partir de `roundUpMinutes`; abaixo disso, não cobra nada a mais.
 */
function cobrancaPorHora(minutos: number, pricing: PricingSettings): number {
  const horasCheias = Math.floor(minutos / 60);
  const resto = minutos % 60;
  const arredondaParaCima = resto > 0 && resto >= pricing.roundUpMinutes;
  const horas = Math.max(1, arredondaParaCima ? horasCheias + 1 : horasCheias);
  const valor = pricing.firstHourPrice + (horas - 1) * pricing.additionalHourPrice;
  return Math.min(valor, pricing.dailyMaxPrice);
}

export function formatDuration(entryTime: Date, exitTime?: Date): string {
  const end = exitTime || new Date();
  const diffMs = end.getTime() - entryTime.getTime();
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours === 0) {
    return `${minutes}min`;
  }
  
  return `${hours}h ${minutes}min`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function isValidPlate(plate: string): boolean {
  // Exige os 7 caracteres: formato antigo (ABC1234) ou Mercosul (ABC1D23)
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate.toUpperCase());
}

export function formatPlate(plate: string): string {
  // Handle both old (AAA-1234) and Mercosul (AAA1A23) formats
  const clean = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  if (clean.length === 7) {
    // Old format: AAA-1234
    if (/^[A-Z]{3}[0-9]{4}$/.test(clean)) {
      return `${clean.slice(0, 3)}-${clean.slice(3)}`;
    }
    // Mercosul format: AAA1A23
    return clean;
  }
  
  return clean;
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
  }).format(d);
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('pt-BR', {
    timeStyle: 'short',
  }).format(d);
}