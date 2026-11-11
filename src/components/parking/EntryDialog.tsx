import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlateInput } from './PlateInput';
import { PlateDisplay } from './PlateDisplay';
import { Vehicle, ParkingSettings } from '@/types/parking';
import { formatDateTime, formatCurrency, isValidPlate, formatTicket } from '@/lib/parking-utils';
import { printEntryTicket } from '@/lib/print';
import { LogIn, LogOut, Printer, Check, Car, AlertTriangle, Ticket } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface EntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (plate: string, vehicleName?: string) => Promise<Vehicle> | Vehicle;
  lastReadPlate?: string;
  plateImageUrl?: string;
  settings: ParkingSettings;
  findVehicleByPlate?: (plate: string) => Vehicle | undefined;
  onRegisterExit?: (vehicle: Vehicle) => void;
  /** Registra a entrada assim que abrir (Enter no campo de placa do dashboard). */
  autoConfirm?: boolean;
}

export function EntryDialog({ open, onOpenChange, onConfirm, lastReadPlate, plateImageUrl, settings, findVehicleByPlate, onRegisterExit, autoConfirm }: EntryDialogProps) {
  const [plate, setPlate] = useState(lastReadPlate || '');
  const [vehicleName, setVehicleName] = useState('');
  const [confirmedVehicle, setConfirmedVehicle] = useState<Vehicle | null>(null);
  const [alreadyParked, setAlreadyParked] = useState<Vehicle | null>(null);
  const { toast } = useToast();

  const [submitting, setSubmitting] = useState(false);

  // Ao abrir, já entra com a última placa lida pela câmera: o operador só
  // confere e confirma (ou corrige digitando).
  useEffect(() => {
    if (open && lastReadPlate) {
      setPlate(lastReadPlate);
      // Enter no dashboard: já registra com a placa digitada
      if (autoConfirm && isValidPlate(lastReadPlate)) void handleConfirm(lastReadPlate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleConfirm = async (placa: string = plate) => {
    if (submitting) return;
    if (!isValidPlate(placa)) {
      toast({
        title: "Placa inválida",
        description: "A placa deve ter 7 caracteres no formato ABC1234 ou ABC1D23.",
        variant: "destructive",
      });
      return;
    }

    // Veículo com bilhete ativo não pode entrar de novo: oferece a saída.
    const estacionado = findVehicleByPlate?.(placa);
    if (estacionado) {
      setAlreadyParked(estacionado);
      return;
    }

    setSubmitting(true);
    try {
      const vehicle = await onConfirm(placa, vehicleName);
      setConfirmedVehicle(vehicle);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[OmniPark] Erro ao registrar entrada:', msg);
      toast({
        title: "Erro ao registrar entrada",
        description: /uq_vehicles_plate_parked|duplicate key/i.test(msg)
          ? 'Esta placa já está no pátio (a entrada acabou de ser registrada em outro aparelho).'
          : msg.includes('row-level') || msg.includes('permission')
            ? 'Sem permissão no banco. Confirme se o seu usuário está aprovado.'
            : /fetch|network|Failed/i.test(msg)
              ? 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
              : msg,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isFixed = settings.pricing.chargeMode === 'fixed';

  const handlePrint = () => {
    if (confirmedVehicle) printEntryTicket(confirmedVehicle, settings);
  };

  const handleRegisterExit = () => {
    if (!alreadyParked) return;
    const veiculo = alreadyParked;
    handleClose();
    onRegisterExit?.(veiculo);
  };

  const handleClose = () => {
    setPlate('');
    setVehicleName('');
    setConfirmedVehicle(null);
    setAlreadyParked(null);
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

        {alreadyParked ? (
          <div className="space-y-4 text-center">
            <div className="p-4 bg-amber-500/10 rounded-xl border-2 border-amber-500/30">
              <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-2" />
              <p className="font-medium">Veículo já está estacionado!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Bilhete ativo desde {formatDateTime(alreadyParked.entryTime)}
              </p>
            </div>

            <PlateDisplay plate={alreadyParked.plate} size="lg" variant="highlight" />

            <p className="text-sm text-muted-foreground">
              Deseja registrar a <strong>saída</strong> deste veículo?
            </p>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setAlreadyParked(null)}>
                Voltar
              </Button>
              <Button className="flex-1" onClick={handleRegisterExit}>
                <LogOut className="w-4 h-4 mr-2" />
                Registrar Saída
              </Button>
            </div>
          </div>
        ) : !confirmedVehicle ? (
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
                onSubmit={() => handleConfirm()}
                enterHint={isValidPlate(plate) ? 'Pressione Enter para registrar' : undefined}
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

            {isFixed && (
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg border-2 border-primary/20 bg-primary/5 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Ticket className="w-4 h-4 text-primary" />
                  Valor fixo (pago na saída)
                </span>
                <span className="font-bold text-primary">{formatCurrency(settings.pricing.fixedPrice)}</span>
              </div>
            )}

            <Button className="w-full" onClick={() => handleConfirm()} disabled={plate.length < 7 || submitting}>
              <LogIn className="w-4 h-4 mr-2" />
              Confirmar Entrada
            </Button>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <div className="p-4 bg-success/10 rounded-xl border-2 border-success/20">
              <Check className="w-12 h-12 text-success mx-auto mb-2" />
              <p className="font-medium text-success">Entrada Registrada!</p>
              {confirmedVehicle.dailyTicket != null && (
                <p className="text-3xl font-bold mt-2">Nº {formatTicket(confirmedVehicle.dailyTicket)}</p>
              )}
            </div>

            <PlateDisplay plate={confirmedVehicle.plate} size="lg" variant="highlight" />
            {confirmedVehicle.vehicleName && (
              <p className="text-lg font-bold text-primary uppercase tracking-wide break-words">
                {confirmedVehicle.vehicleName}
              </p>
            )}

            <div className="text-sm text-muted-foreground">
              Entrada: {formatDateTime(confirmedVehicle.entryTime)}
              {isFixed && (
                <div className="mt-1">
                  Valor a pagar na saída: <strong className="text-foreground">{formatCurrency(settings.pricing.fixedPrice)}</strong>
                </div>
              )}
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