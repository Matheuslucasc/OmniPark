import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlateInput } from './PlateInput';
import { PlateDisplay } from './PlateDisplay';
import { Vehicle, PricingSettings, ParkingSettings, PriceModule } from '@/types/parking';
import { formatDateTime, formatDuration, formatCurrency, calculateParkingFee } from '@/lib/parking-utils';
import { printHtml, buildExitReceiptHtml } from '@/lib/print';
import { usePriceModules } from '@/hooks/usePriceModules';
import { LogOut, Printer, Check, Clock, DollarSign, Search, Tag, ChevronDown } from 'lucide-react';

interface ExitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (vehicleId: string, customPricing?: PricingSettings) => Promise<Vehicle | null> | Vehicle | null;
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
  const [showModules, setShowModules] = useState(false);
  const [selectedModule, setSelectedModule] = useState<PriceModule | null>(null);
  const { modules } = usePriceModules();

  const activePricing = selectedModule ? selectedModule.pricing : pricing;

  useEffect(() => {
    if (open && preSelectedVehicle) {
      setPlate(preSelectedVehicle.plate);
      setFoundVehicle(preSelectedVehicle);
    }
    if (!open) {
      setSelectedModule(null);
      setShowModules(false);
    }
  }, [open, preSelectedVehicle]);

  useEffect(() => {
    if (foundVehicle) {
      const fee = calculateParkingFee(
        new Date(foundVehicle.entryTime),
        new Date(),
        activePricing
      );
      setEstimatedFee(fee);
    }
  }, [foundVehicle, activePricing]);

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
      const exited = await onConfirm(foundVehicle.id, selectedModule ? selectedModule.pricing : undefined);
      if (exited) setExitedVehicle(exited);
    } catch {
      // silently handled
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

                {/* Seletor de tarifa */}
                {modules.length > 0 && (
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-between"
                      onClick={() => setShowModules(v => !v)}
                    >
                      <span className="flex items-center gap-2">
                        <Tag className="w-3.5 h-3.5" />
                        {selectedModule ? selectedModule.name : 'Tarifa padrão'}
                      </span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showModules ? 'rotate-180' : ''}`} />
                    </Button>
                    {showModules && (
                      <div className="mt-1 border rounded-lg overflow-hidden">
                        <button
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${!selectedModule ? 'bg-primary/10 font-medium' : ''}`}
                          onClick={() => { setSelectedModule(null); setShowModules(false); }}
                        >
                          Tarifa padrão — {formatCurrency(pricing.firstHourPrice)}/h
                        </button>
                        {modules.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors border-t ${selectedModule?.id === m.id ? 'bg-primary/10 font-medium' : ''}`}
                            onClick={() => { setSelectedModule(m); setShowModules(false); }}
                          >
                            <span className="font-medium">{m.name}</span>
                            <span className="text-muted-foreground ml-2">
                              {formatCurrency(m.pricing.firstHourPrice)}/h
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="p-4 bg-primary/10 rounded-xl border-2 border-primary/20">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Valor a Pagar
                      {selectedModule && (
                        <Badge variant="secondary" className="text-xs">{selectedModule.name}</Badge>
                      )}
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
                    onClick={() => { setFoundVehicle(null); setPlate(''); }}
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
