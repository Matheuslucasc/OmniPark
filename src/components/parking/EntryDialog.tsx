import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlateInput } from './PlateInput';
import { PlateDisplay } from './PlateDisplay';
import { Vehicle, ParkingSettings } from '@/types/parking';
import { formatDateTime } from '@/lib/parking-utils';
import { LogIn, Printer, Check, Car } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface EntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (plate: string, vehicleName?: string) => Promise<Vehicle> | Vehicle;
  lastReadPlate?: string;
  plateImageUrl?: string;
  settings: ParkingSettings;
}

export function EntryDialog({ open, onOpenChange, onConfirm, lastReadPlate, plateImageUrl, settings }: EntryDialogProps) {
  const [plate, setPlate] = useState(lastReadPlate || '');
  const [vehicleName, setVehicleName] = useState('');
  const [confirmedVehicle, setConfirmedVehicle] = useState<Vehicle | null>(null);
  const { toast } = useToast();

  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (plate.length < 6) {
      toast({
        title: "Placa inválida",
        description: "A placa deve ter pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const vehicle = await onConfirm(plate, vehicleName);
      setConfirmedVehicle(vehicle);
    } catch {
      toast({ title: "Erro ao registrar entrada", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    if (!confirmedVehicle) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Ticket de Entrada</title>
          <style>
            body { font-family: 'Courier New', monospace; padding: 20px; max-width: 300px; margin: 0 auto; }
            .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
            .name { font-size: 16px; font-weight: bold; }
            .address { font-size: 11px; color: #666; }
            .plate { font-size: 32px; font-weight: bold; letter-spacing: 4px; text-align: center; margin: 20px 0; padding: 10px; border: 2px solid #000; }
            .info { margin: 10px 0; }
            .label { font-size: 12px; color: #666; }
            .value { font-size: 14px; font-weight: bold; }
            .observation { text-align: center; font-size: 11px; color: #666; margin-top: 15px; padding: 8px; background: #f5f5f5; border-radius: 4px; }
            .footer { text-align: center; border-top: 2px dashed #000; padding-top: 10px; margin-top: 20px; font-size: 12px; }
            .id { font-size: 10px; color: #999; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="name">${settings.parkingName || 'ESTACIONAMENTO'}</div>
            ${settings.parkingAddress ? `<div class="address">${settings.parkingAddress}</div>` : ''}
            ${settings.parkingPhone ? `<div class="address">Tel: ${settings.parkingPhone}</div>` : ''}
            <p>TICKET DE ENTRADA</p>
          </div>
          <div class="plate">${confirmedVehicle.plate}</div>
          ${confirmedVehicle.vehicleName ? `<div style="text-align: center; color: #666; margin-bottom: 10px;">${confirmedVehicle.vehicleName}</div>` : ''}
          <div class="info">
            <div class="label">Data/Hora Entrada:</div>
            <div class="value">${formatDateTime(confirmedVehicle.entryTime)}</div>
          </div>
          ${settings.ticketObservation ? `<div class="observation">${settings.ticketObservation}</div>` : ''}
          <div class="footer">
            <p>Guarde este ticket</p>
            <p class="id">ID: ${confirmedVehicle.id.slice(0, 8)}</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleClose = () => {
    setPlate('');
    setVehicleName('');
    setConfirmedVehicle(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="w-5 h-5 text-success" />
            Registrar Entrada
          </DialogTitle>
        </DialogHeader>

        {!confirmedVehicle ? (
          <div className="space-y-4">
            {plateImageUrl && (
              <div className="rounded-lg overflow-hidden border-2 border-border bg-black/5">
                <img 
                  src={plateImageUrl} 
                  alt="Imagem da placa" 
                  className="w-full h-auto object-contain max-h-32"
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">Placa do Veículo</label>
              <PlateInput
                value={plate}
                onChange={setPlate}
                onSubmit={handleConfirm}
                autoFocus
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                <Car className="w-4 h-4" />
                Veículo (opcional)
              </label>
              <Input
                value={vehicleName}
                onChange={(e) => setVehicleName(e.target.value)}
                placeholder="Ex: Civic Preto, Onix Branco..."
                className="font-medium"
              />
            </div>

            {lastReadPlate && plate !== lastReadPlate && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setPlate(lastReadPlate)}
              >
                Usar última placa lida: <PlateDisplay plate={lastReadPlate} size="sm" className="ml-2" />
              </Button>
            )}

            <Button className="w-full" onClick={handleConfirm} disabled={plate.length < 6 || submitting}>
              <LogIn className="w-4 h-4 mr-2" />
              Confirmar Entrada
            </Button>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <div className="p-4 bg-success/10 rounded-xl border-2 border-success/20">
              <Check className="w-12 h-12 text-success mx-auto mb-2" />
              <p className="font-medium text-success">Entrada Registrada!</p>
            </div>

            <PlateDisplay plate={confirmedVehicle.plate} size="lg" variant="highlight" />

            <div className="text-sm text-muted-foreground">
              Entrada: {formatDateTime(confirmedVehicle.entryTime)}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                Imprimir Ticket
              </Button>
              <Button className="flex-1" onClick={handleClose}>
                Concluir
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}