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

export function calculateParkingFee(
  entryTime: Date,
  exitTime: Date,
  pricing: PricingSettings
): number {
  const diffMs = exitTime.getTime() - entryTime.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  // Within tolerance period - free
  if (diffMinutes <= pricing.toleranceMinutes) {
    return 0;
  }

  // Calculate billable minutes (after tolerance)
  const billableMinutes = diffMinutes - pricing.toleranceMinutes;
  
  // Calculate hours with rounding
  let hours: number;
  const fullHours = Math.floor(billableMinutes / 60);
  const remainingMinutes = billableMinutes % 60;
  
  if (remainingMinutes === 0) {
    hours = fullHours;
  } else if (remainingMinutes >= pricing.roundUpMinutes) {
    hours = fullHours + 1;
  } else {
    hours = fullHours + (remainingMinutes / 60);
  }

  // Minimum 1 hour
  hours = Math.max(1, hours);

  // Calculate price
  let total: number;
  if (hours <= 1) {
    total = pricing.firstHourPrice;
  } else {
    total = pricing.firstHourPrice + ((hours - 1) * pricing.additionalHourPrice);
  }

  // Apply daily maximum
  return Math.min(total, pricing.dailyMaxPrice);
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