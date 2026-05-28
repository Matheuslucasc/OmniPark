import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PlateInput } from './PlateInput';
import { PlateDisplay } from './PlateDisplay';
import { Vehicle, PricingSettings, ParkingSettings } from '@/types/parking';
import { formatDateTime, formatDuration, formatCurrency, calculateParkingFee } from '@/lib/parking-utils';
import { printHtml, buildExitReceiptHtml } from '@/lib/print';
import { LogOut, Printer, Check, Clock, DollarSign, Search } from 'lucide-react';

interface ExitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (vehicleId: string) => Promise<Vehicle | null> | Vehicle | null;
  findVehicle: (plate: string) => Vehicle | undefined;
  pricing: PricingSettings;
  settings: ParkingSettings;
  preSelectedVehicle?: Vehicle | null;
}

export function ExitDialog({ 
  open, 
  onOpenChange, 
  onConfirm, 
  findVehicle,
  pricing,
  settings,
  preSelectedVehicle 
}: ExitDialogProps) {
  const [plate, setPlate] = useState('');
  const [foundVehicle, setFoundVehicle] = useState<Vehicle | null>(null);
  const [exitedVehicle, setExitedVehicle] = useState<Vehicle | null>(null);
  const [estimatedFee, setEstimatedFee] = useState(0);

  useEffect(() => {
    if (open && preSelectedVehicle) {
      setPlate(preSelectedVehicle.plate);
      setFoundVehicle(preSelectedVehicle);
    }
  }, [open, preSelectedVehicle]);

  useEffect(() => {
    if (foundVehicle) {
      const fee = calculateParkingFee(
        new Date(foundVehicle.entryTime),
        new Date(),
        pricing
      );
      setEstimatedFee(fee);
    }
  }, [foundVehicle, pricing]);

  const handleSearch = () => {
    const vehicle = findVehicle(plate);
    if (vehicle) {
      setFoundVehicle(vehicle);
    } else {
      setFoundVehicle(null);
    }
  };

  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!foundVehicle) return;
    setSubmitting(true);
    try {
      const exited = await onConfirm(foundVehicle.id);
      if (exited) setExitedVehicle(exited);
    } catch {
      // error silently — toast can be added here if needed
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    if (!exitedVehicle) return;
    const duration = formatDuration(new Date(exitedVehicle.entryTime), new Date(exitedVehicle.exitTime!));
    printHtml(
      buildExitReceiptHtml({
        plate:             exitedVehicle.plate,
        vehicleName:       exitedVehicle.vehicleName,
        entryTime:         formatDateTime(exitedVehicle.entryTime),
        exitTime:          formatDateTime(exitedVehicle.exitTime!),
        duration,
        amountPaid:        exitedVehicle.amountPaid ?? 0,
        id:                exitedVehicle.id,
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
    setFoundVehicle(null);
    setExitedVehicle(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="w-5 h-5 text-primary" />
            Registrar Saída
          </DialogTitle>
        </DialogHeader>

        {!exitedVehicle ? (
          <div className="space-y-4">
            {!foundVehicle ? (
              <>
                <div>
                  <label className="text-sm font-medium mb-2 block">Buscar Placa</label>
                  <PlateInput
                    value={plate}
                    onChange={(val) => {
                      setPlate(val);
                      setFoundVehicle(null);
                    }}
                    onSubmit={handleSearch}
                    autoFocus
                  />
                </div>

                <Button className="w-full" onClick={handleSearch} disabled={plate.length < 6}>
                  <Search className="w-4 h-4 mr-2" />
                  Buscar Veículo
                </Button>

                {plate.length >= 6 && !foundVehicle && (
                  <p className="text-sm text-muted-foreground text-center">
                    Pressione Enter ou clique em Buscar
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-secondary rounded-xl">
                  <PlateDisplay plate={foundVehicle.plate} size="lg" className="w-full justify-center" />
                  
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="w-4 h-4" /> Entrada
                      </span>
                      <span className="font-medium">{formatDateTime(foundVehicle.entryTime)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Permanência</span>
                      <span className="font-medium">{formatDuration(new Date(foundVehicle.entryTime))}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-primary/10 rounded-xl border-2 border-primary/20">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <DollarSign className="w-4 h-4" /> Valor a Pagar
                    </span>
                    <span className="text-2xl font-bold text-primary">
                      {formatCurrency(estimatedFee)}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => {
                      setFoundVehicle(null);
                      setPlate('');
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button className="flex-1" onClick={handleConfirm} disabled={submitting}>
                    <LogOut className="w-4 h-4 mr-2" />
                    {submitting ? 'Registrando…' : 'Confirmar Saída'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <div className="p-4 bg-success/10 rounded-xl border-2 border-success/20">
              <Check className="w-12 h-12 text-success mx-auto mb-2" />
              <p className="font-medium text-success">Saída Registrada!</p>
            </div>

            <PlateDisplay plate={exitedVehicle.plate} size="lg" />

            <div className="p-4 bg-secondary rounded-xl space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Permanência:</span>
                <span className="font-medium">
                  {formatDuration(new Date(exitedVehicle.entryTime), new Date(exitedVehicle.exitTime!))}
                </span>
              </div>
              <div className="flex justify-between text-lg">
                <span className="font-medium">Total Pago:</span>
                <span className="font-bold text-primary">
                  {formatCurrency(exitedVehicle.amountPaid || 0)}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                Imprimir
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
