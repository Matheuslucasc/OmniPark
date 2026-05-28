export interface Vehicle {
  id: string;
  plate: string;
  vehicleName?: string; // Nome/modelo do veículo (opcional)
  entryTime: string; // ISO string
  exitTime?: string; // ISO string
  amountPaid?: number;
  status: 'parked' | 'exited';
}

export interface PricingSettings {
  toleranceMinutes: number;
  firstHourPrice: number;
  additionalHourPrice: number;
  dailyMaxPrice: number;
  roundUpMinutes: number; // Round up to next hour after X minutes
}

export interface ParkingSettings {
  totalSpots: number;
  parkingName: string;
  parkingAddress: string;
  parkingPhone: string;
  parkingCNPJ: string;
  ticketObservation: string;
  pricing: PricingSettings;
}

export interface ParkingStats {
  occupiedSpots: number;
  availableSpots: number;
  todayRevenue: number;
  todayVehicles: number;
}

export interface HistoryFilters {
  startDate?: string;
  endDate?: string;
  plate?: string;
}

export interface CameraConfig {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  protocol: 'rtsp' | 'http' | 'https';
  streamPath: string;
  username?: string;
  password?: string;
  location?: string;
  isActive: boolean;
}

export const DEFAULT_CAMERA: Omit<CameraConfig, 'id'> = {
  name: 'Câmera Entrada',
  ipAddress: '192.168.1.100',
  port: 554,
  protocol: 'rtsp',
  streamPath: '/stream',
  username: '',
  password: '',
  location: 'Entrada',
  isActive: true,
};

export const DEFAULT_SETTINGS: ParkingSettings = {
  totalSpots: 50,
  parkingName: 'Estacionamento Central',
  parkingAddress: 'Rua Principal, 123 - Centro',
  parkingPhone: '(11) 99999-9999',
  parkingCNPJ: '00.000.000/0001-00',
  ticketObservation: 'Horário de funcionamento: Seg-Sex 07h às 22h | Sáb 08h às 18h',
  pricing: {
    toleranceMinutes: 15,
    firstHourPrice: 10,
    additionalHourPrice: 5,
    dailyMaxPrice: 50,
    roundUpMinutes: 10,
  },
};