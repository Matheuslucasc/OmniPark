import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PlateInput } from './PlateInput';
import { PlateDisplay } from './PlateDisplay';
import { Vehicle, PricingSettings, ParkingSettings } from '@/types/parking';
import { formatDateTime, formatDuration, formatCurrency, calculateParkingFee } from '@/lib/parking-utils';
import { LogOut, Printer, Check, Clock, DollarSign, Search } from 'lucide-react';

interface ExitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (vehicleId: string) => Vehicle | null;
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

  const handleConfirm = () => {
    if (!foundVehicle) return;
    const exited = onConfirm(foundVehicle.id);
    if (exited) {
      setExitedVehicle(exited);
    }
  };

  const handlePrint = () => {
    if (!exitedVehicle) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const duration = formatDuration(
      new Date(exitedVehicle.entryTime), 
      new Date(exitedVehicle.exitTime!)
    );

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Comprovante de Saída</title>
          <style>
            body { font-family: 'Courier New', monospace; padding: 20px; max-width: 300px; margin: 0 auto; }
            .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
            .name { font-size: 16px; font-weight: bold; }
            .address { font-size: 11px; color: #666; }
            .plate { font-size: 28px; font-weight: bold; letter-spacing: 4px; text-align: center; margin: 15px 0; padding: 8px; border: 2px solid #000; }
            .info { margin: 8px 0; display: flex; justify-content: space-between; }
            .label { font-size: 12px; }
            .value { font-size: 12px; font-weight: bold; }
            .total { font-size: 24px; font-weight: bold; text-align: center; margin: 20px 0; padding: 10px; background: #000; color: #fff; }
            .observation { text-align: center; font-size: 11px; color: #666; margin-top: 15px; padding: 8px; background: #f5f5f5; border-radius: 4px; }
            .footer { text-align: center; border-top: 2px dashed #000; padding-top: 10px; margin-top: 20px; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="name">${settings.parkingName || 'ESTACIONAMENTO'}</div>
            ${settings.parkingAddress ? `<div class="address">${settings.parkingAddress}</div>` : ''}
            ${settings.parkingPhone ? `<div class="address">Tel: ${settings.parkingPhone}</div>` : ''}
            <p>COMPROVANTE DE SAÍDA</p>
          </div>
          <div class="plate">${exitedVehicle.plate}</div>
          ${exitedVehicle.vehicleName ? `<div style="text-align: center; color: #666; margin-bottom: 10px;">${exitedVehicle.vehicleName}</div>` : ''}
          <div class="info">
            <span class="label">Entrada:</span>
            <span class="value">${formatDateTime(exitedVehicle.entryTime)}</span>
          </div>
          <div class="info">
            <span class="label">Saída:</span>
            <span class="value">${formatDateTime(exitedVehicle.exitTime!)}</span>
          </div>
          <div class="info">
            <span class="label">Permanência:</span>
            <span class="value">${duration}</span>
          </div>
          <div class="total">TOTAL: ${formatCurrency(exitedVehicle.amountPaid || 0)}</div>
          ${settings.ticketObservation ? `<div class="observation">${settings.ticketObservation}</div>` : ''}
          <div class="footer">
            <p>Obrigado pela preferência!</p>
            <p>Volte sempre</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
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
                  <Button className="flex-1" onClick={handleConfirm}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Confirmar Saída
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
