import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlateInput } from './PlateInput';
import { PlateDisplay } from './PlateDisplay';
import { Vehicle, PricingSettings, ParkingSettings, PriceModule } from '@/types/parking';
import { formatDateTime, formatDuration, formatCurrency, calculateParkingFee, formatTicket } from '@/lib/parking-utils';
import { printHtml, buildExitReceiptHtml } from '@/lib/print';
import { usePriceModules } from '@/hooks/usePriceModules';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { LogOut, Printer, Check, Clock, DollarSign, Search, Tag } from 'lucide-react';

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
  preSelectedVehicle,
}: ExitDialogProps) {
  const [plate, setPlate] = useState('');
  const [foundVehicle, setFoundVehicle] = useState<Vehicle | null>(null);
  const [exitedVehicle, setExitedVehicle] = useState<Vehicle | null>(null);
  const [selectedModule, setSelectedModule] = useState<PriceModule | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tick, setTick] = useState(0);
  const { modules } = usePriceModules();
  // Lembra a última tarifa escolhida entre saídas ('padrao' ou id do módulo).
  const [lastTariffId, setLastTariffId] = useLocalStorage<string>('parking_last_tariff', 'padrao');

  const handleSelectTariff = (id: string) => {
    const mod = id === 'padrao' ? null : (modules.find(m => m.id === id) ?? null);
    setSelectedModule(mod);
    setLastTariffId(id);
  };

  // Tick a cada 30s para atualizar duração e preço
  useEffect(() => {
    if (!foundVehicle) return;
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, [foundVehicle]);

  // Preço e duração calculados sempre frescos — reagem a qualquer mudança
  const activePricing = selectedModule?.pricing ?? pricing;
  const fee = foundVehicle
    ? calculateParkingFee(new Date(foundVehicle.entryTime), new Date(), activePricing)
    : 0;
  const duration = foundVehicle
    ? formatDuration(new Date(foundVehicle.entryTime), new Date())
    : '';

  useEffect(() => {
    if (open && preSelectedVehicle) {
      setPlate(preSelectedVehicle.plate);
      setFoundVehicle(preSelectedVehicle);
    }
    if (!open) {
      setSelectedModule(null);
      setPlate('');
      setFoundVehicle(null);
      setExitedVehicle(null);
    }
  }, [open, preSelectedVehicle]);

  // Ao abrir com um veículo (ou quando os módulos carregam), aplica a última
  // tarifa que o operador usou.
  useEffect(() => {
    if (!open || !foundVehicle) return;
    const mod = lastTariffId === 'padrao'
      ? null
      : (modules.find(m => m.id === lastTariffId) ?? null);
    setSelectedModule(mod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, foundVehicle, modules]);

  const handleSearch = () => {
    const v = findVehicle(plate);
    setFoundVehicle(v ?? null);
  };

  const handleConfirm = async () => {
    if (!foundVehicle) return;
    setSubmitting(true);
    try {
      const exited = await onConfirm(foundVehicle.id, selectedModule?.pricing);
      if (exited) setExitedVehicle(exited);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    if (!exitedVehicle) return;
    printHtml(
      buildExitReceiptHtml({
        plate:             exitedVehicle.plate,
        vehicleName:       exitedVehicle.vehicleName,
        entryTime:         formatDateTime(exitedVehicle.entryTime),
        exitTime:          formatDateTime(exitedVehicle.exitTime!),
        duration:          formatDuration(new Date(exitedVehicle.entryTime), new Date(exitedVehicle.exitTime!)),
        amountPaid:        exitedVehicle.amountPaid ?? 0,
        id:                exitedVehicle.id,
        ticketNumber:      formatTicket(exitedVehicle.dailyTicket),
        parkingName:       settings.parkingName,
        parkingAddress:    settings.parkingAddress,
        parkingPhone:      settings.parkingPhone,
        ticketObservation: settings.ticketObservation,
      }),
      settings.print,
    );
  };

  return (
    <Dialog open={open} onOpenChange={() => onOpenChange(false)}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="w-5 h-5 text-primary" />
            Registrar Saída
          </DialogTitle>
        </DialogHeader>

        {!exitedVehicle ? (
          <div className="space-y-4">
            {/* ── Busca de placa ── */}
            {!foundVehicle ? (
              <>
                <div>
                  <label className="text-sm font-medium mb-2 block">Buscar por placa ou nº do ticket</label>
                  <PlateInput
                    value={plate}
                    onChange={val => { setPlate(val); setFoundVehicle(null); }}
                    onSubmit={handleSearch}
                    autoFocus
                  />
                </div>
                <Button className="w-full" onClick={handleSearch} disabled={plate.length < 6}>
                  <Search className="w-4 h-4 mr-2" />
                  Buscar Veículo
                </Button>
                {plate.length >= 6 && (
                  <p className="text-xs text-muted-foreground text-center">
                    Pressione Enter ou clique em Buscar
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-4">
                {/* ── Info do veículo ── */}
                <div className="p-4 bg-secondary rounded-xl">
                  {foundVehicle.dailyTicket != null && (
                    <p className="text-center text-sm font-semibold text-muted-foreground mb-1">
                      Ticket Nº {formatTicket(foundVehicle.dailyTicket)}
                    </p>
                  )}
                  <PlateDisplay plate={foundVehicle.plate} size="lg" className="w-full justify-center" />
                  {foundVehicle.vehicleName && (
                    <p className="text-center text-sm text-muted-foreground mt-1">{foundVehicle.vehicleName}</p>
                  )}
                  <div className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Entrada
                      </span>
                      <span className="font-medium">{formatDateTime(foundVehicle.entryTime)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Permanência</span>
                      <span className="font-medium">{duration}</span>
                    </div>
                  </div>
                </div>

                {/* ── Seletor de tabela de preços ── */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-2">
                    <Tag className="w-3.5 h-3.5" />
                    Tabela de Preços
                  </label>
                  <Select value={selectedModule?.id ?? 'padrao'} onValueChange={handleSelectTariff}>
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="padrao">Tarifa Padrão</SelectItem>
                      {modules.map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}{m.description ? ` — ${m.description}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Resumo compacto da tarifa selecionada */}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-xs text-muted-foreground">
                    <span>1ª hora: <strong className="text-foreground">{formatCurrency(activePricing.firstHourPrice)}</strong></span>
                    <span>Adic.: <strong className="text-foreground">{formatCurrency(activePricing.additionalHourPrice)}</strong></span>
                    <span>Máx.: <strong className="text-foreground">{formatCurrency(activePricing.dailyMaxPrice)}</strong></span>
                    {activePricing.toleranceMinutes > 0 && (
                      <span>Tolerância: <strong className="text-foreground">{activePricing.toleranceMinutes}min</strong></span>
                    )}
                  </div>
                </div>

                {/* ── Valor calculado ── */}
                <div className="p-4 bg-primary/10 rounded-xl border-2 border-primary/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                        <DollarSign className="w-4 h-4" />
                        Valor a Cobrar
                      </div>
                      {selectedModule && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Tarifa: {selectedModule.name}
                        </p>
                      )}
                    </div>
                    <span className="text-3xl font-bold text-primary">
                      {formatCurrency(fee)}
                    </span>
                  </div>
                </div>

                {/* ── Ações ── */}
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
          /* ── Confirmação ── */
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
                <span className="font-medium">Total Cobrado:</span>
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
              <Button className="flex-1" onClick={() => onOpenChange(false)}>
                Concluir
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
