import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlateInput } from './PlateInput';
import { PlateDisplay } from './PlateDisplay';
import { Vehicle, ParkingSettings } from '@/types/parking';
import { formatDateTime } from '@/lib/parking-utils';
import { printHtml, buildEntryTicketHtml } from '@/lib/print';
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

  // Re-semeia a placa ao abrir o diálogo (o componente fica sempre montado).
  // Depende só de `open` de propósito: se uma nova leitura chegar enquanto o
  // operador digita aqui, não sobrescrevemos o que ele já digitou.
  useEffect(() => {
    if (open) {
      setPlate(lastReadPlate || '');
      setVehicleName('');
      setConfirmedVehicle(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[OmniPark] Erro ao registrar entrada:', msg);
      toast({
        title: "Erro ao registrar entrada",
        description: msg.includes('row-level') || msg.includes('permission')
          ? 'Permissão negada no banco. Execute o SQL de correção no Supabase.'
          : msg,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    if (!confirmedVehicle) return;
    printHtml(
      buildEntryTicketHtml({
        plate:             confirmedVehicle.plate,
        vehicleName:       confirmedVehicle.vehicleName,
        entryTime:         formatDateTime(confirmedVehicle.entryTime),
        id:                confirmedVehicle.id,
        parkingName:       settings.parkingName,
        parkingAddress:    settings.parkingAddress,
        parkingPhone:      settings.parkingPhone,
        ticketObservation: settings.ticketObservation,
      }),
      settings.print,
    );
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