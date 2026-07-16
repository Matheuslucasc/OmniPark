import { Vehicle } from '@/types/parking';
import { formatDateTime, formatDuration, formatPlate, formatTicket } from '@/lib/parking-utils';
import { Clock, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VehicleCardProps {
  vehicle: Vehicle;
  onExit?: (vehicle: Vehicle) => void;
  compact?: boolean;
}

export function VehicleCard({ vehicle, onExit, compact = false }: VehicleCardProps) {
  const entryDate = new Date(vehicle.entryTime);
  const duration = formatDuration(entryDate);

  if (compact) {
    return (
      <div className="flex items-center justify-between p-3 bg-card rounded-lg border border-border hover:border-primary/30 transition-all">
        <div className="flex items-center gap-3">
          <div>
            <div className="font-mono font-bold text-lg tracking-wider">
              {formatPlate(vehicle.plate)}
            </div>
            {vehicle.vehicleName && (
              <div className="text-xs text-muted-foreground">{vehicle.vehicleName}</div>
            )}
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="w-3 h-3" />
            {duration}
          </div>
        </div>
        {onExit && (
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => onExit(vehicle)}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 bg-card rounded-xl border-2 border-border hover:border-primary/30 transition-all hover:shadow-md">
      <div className="flex items-start justify-between mb-3">
        <div>
          {vehicle.dailyTicket != null && (
            <div className="text-xs font-semibold text-primary mb-0.5">Nº {formatTicket(vehicle.dailyTicket)}</div>
          )}
          <div className="font-mono font-bold text-2xl tracking-wider">
            {formatPlate(vehicle.plate)}
          </div>
          {vehicle.vehicleName && (
            <div className="text-sm text-muted-foreground mt-1">{vehicle.vehicleName}</div>
          )}
        </div>
        <div 
          className={cn(
            "px-2 py-1 rounded-full text-xs font-medium",
            vehicle.status === 'parked' 
              ? "bg-success/20 text-success" 
              : "bg-muted text-muted-foreground"
          )}
        >
          {vehicle.status === 'parked' ? 'Estacionado' : 'Saiu'}
        </div>
      </div>
      
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Entrada:</span>
          <span className="font-medium">{formatDateTime(entryDate)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tempo:</span>
          <span className="font-medium flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {duration}
          </span>
        </div>
      </div>

      {onExit && vehicle.status === 'parked' && (
        <Button 
          className="w-full mt-4" 
          onClick={() => onExit(vehicle)}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Registrar Saída
        </Button>
      )}
    </div>
  );
}