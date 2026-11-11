import { ParkingSettings, PricingSettings, PaperSize, DEFAULT_SETTINGS } from '@/types/parking';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Building, DollarSign, Clock, FileText, Printer } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/parking-utils';
import { printHtml, buildEntryTicketHtml } from '@/lib/print';
import { TicketPreview } from './TicketPreview';
import { ChargeModeSelector, FixedPriceField } from './ChargeModeFields';

interface SettingsPanelProps {
  settings: ParkingSettings;
  onUpdateSettings: (settings: Partial<ParkingSettings>) => Promise<void> | void;
  onUpdatePricing: (pricing: Partial<PricingSettings>) => Promise<void> | void;
}

export function SettingsPanel({ settings, onUpdateSettings }: SettingsPanelProps) {
  const [localSettings, setLocalSettings] = useState(settings);
  const { toast } = useToast();

  // Alterações ainda não salvas: enquanto existirem, uma atualização vinda de
  // outro aparelho (ou de voltar para a aba) não apaga o que está sendo editado.
  const [alterado, setAlterado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const editar: typeof setLocalSettings = (valor) => { setAlterado(true); setLocalSettings(valor); };

  // Sincroniza o formulário com as configurações oficiais (banco/outros
  // aparelhos) sempre que não houver edição pendente — inclusive logo após salvar.
  useEffect(() => {
    if (alterado) return;
    setLocalSettings(settings);
  }, [settings, alterado]);

  const isFixed = localSettings.pricing.chargeMode === 'fixed';

  const handleSave = async () => {
    setSalvando(true);
    try {
      // passa tudo de uma vez para evitar race condition entre dois setSettings separados
      await onUpdateSettings(localSettings);
      setAlterado(false);
      toast({
        title: "Configurações salvas",
        description: localSettings.pricing.chargeMode === 'fixed'
          ? `Cobrança em valor fixo: ${formatCurrency(localSettings.pricing.fixedPrice)} por veículo.`
          : "Valem agora em todos os aparelhos.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[OmniPark] Erro ao salvar configurações:', msg);
      toast({
        title: "Não foi possível salvar",
        description: /fetch|network|Failed/i.test(msg)
          ? 'Sem conexão com o servidor. As alterações continuam na tela: tente salvar de novo.'
          : `O servidor recusou: ${msg}`,
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Parking Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="w-5 h-5" />
            Dados do Estacionamento
          </CardTitle>
          <CardDescription>
            Informações que aparecerão nos tickets impressos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={localSettings.parkingName}
                onChange={(e) => editar(s => ({ ...s, parkingName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={localSettings.parkingPhone}
                onChange={(e) => editar(s => ({ ...s, parkingPhone: e.target.value }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Endereço</Label>
              <Input
                id="address"
                value={localSettings.parkingAddress}
                onChange={(e) => editar(s => ({ ...s, parkingAddress: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                value={localSettings.parkingCNPJ}
                onChange={(e) => editar(s => ({ ...s, parkingCNPJ: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spots">Total de Vagas</Label>
              <Input
                id="spots"
                type="number"
                min={1}
                value={localSettings.totalSpots}
                onChange={(e) => editar(s => ({ ...s, totalSpots: parseInt(e.target.value) || 1 }))}
              />
              <p className="text-xs text-muted-foreground">
                Padrão: {DEFAULT_SETTINGS.totalSpots} vagas
                {localSettings.totalSpots !== DEFAULT_SETTINGS.totalSpots && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      className="underline hover:text-foreground"
                      onClick={() => editar(s => ({ ...s, totalSpots: DEFAULT_SETTINGS.totalSpots }))}
                    >
                      restaurar
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ticket Observation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Observação do Ticket
          </CardTitle>
          <CardDescription>
            Texto adicional que aparecerá nos tickets impressos (ex: horário de funcionamento)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="observation">Observação</Label>
            <Textarea
              id="observation"
              placeholder="Ex: Horário de funcionamento: Seg-Sex 07h às 22h | Sáb 08h às 18h"
              value={localSettings.ticketObservation}
              onChange={(e) => editar(s => ({ ...s, ticketObservation: e.target.value }))}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Ticket Preview */}
      <TicketPreview settings={localSettings} />

      {/* Pricing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Tabela de Preços
          </CardTitle>
          <CardDescription>
            Escolha como cobrar: por hora (padrão) ou valor fixo por veículo (eventos)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ChargeModeSelector
            value={localSettings.pricing.chargeMode}
            onChange={(chargeMode) => editar(s => ({ ...s, pricing: { ...s.pricing, chargeMode } }))}
          />

          {isFixed ? (
            <div className="space-y-3">
              <FixedPriceField
                pricing={localSettings.pricing}
                onChange={(p) => editar(s => ({ ...s, pricing: { ...s.pricing, ...p } }))}
              />
              <div className="p-3 bg-secondary rounded-lg text-sm">
                Todo veículo registrado pagará{' '}
                <span className="font-semibold">{formatCurrency(localSettings.pricing.fixedPrice)}</span>{' '}
                na saída. Os valores por hora continuam guardados para quando você voltar ao modo
                &quot;Por hora&quot;.
              </div>
            </div>
          ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstHour">Primeira Hora (R$)</Label>
              <Input
                id="firstHour"
                type="number"
                min={0}
                step={0.5}
                value={localSettings.pricing.firstHourPrice}
                onChange={(e) => editar(s => ({
                  ...s,
                  pricing: { ...s.pricing, firstHourPrice: parseFloat(e.target.value) || 0 }
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="additionalHour">Hora Adicional (R$)</Label>
              <Input
                id="additionalHour"
                type="number"
                min={0}
                step={0.5}
                value={localSettings.pricing.additionalHourPrice}
                onChange={(e) => editar(s => ({
                  ...s,
                  pricing: { ...s.pricing, additionalHourPrice: parseFloat(e.target.value) || 0 }
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dailyMax">Valor Máximo Diário (R$)</Label>
              <Input
                id="dailyMax"
                type="number"
                min={0}
                step={1}
                value={localSettings.pricing.dailyMaxPrice}
                onChange={(e) => editar(s => ({
                  ...s,
                  pricing: { ...s.pricing, dailyMaxPrice: parseFloat(e.target.value) || 0 }
                }))}
              />
            </div>
          </div>
          )}
        </CardContent>
      </Card>

      {/* Tolerance (só faz sentido na cobrança por hora) */}
      {!isFixed && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Tolerância e Arredondamento
          </CardTitle>
          <CardDescription>
            Configure o tempo de tolerância e regras de arredondamento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tolerance">Tolerância (minutos)</Label>
              <Input
                id="tolerance"
                type="number"
                min={0}
                max={60}
                value={localSettings.pricing.toleranceMinutes}
                onChange={(e) => editar(s => ({
                  ...s,
                  pricing: { ...s.pricing, toleranceMinutes: parseInt(e.target.value) || 0 }
                }))}
              />
              <p className="text-xs text-muted-foreground">
                Tempo gratuito antes de começar a cobrar
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="roundUp">Arredondar após (minutos)</Label>
              <Input
                id="roundUp"
                type="number"
                min={0}
                max={60}
                value={localSettings.pricing.roundUpMinutes}
                onChange={(e) => editar(s => ({
                  ...s,
                  pricing: { ...s.pricing, roundUpMinutes: parseInt(e.target.value) || 0 }
                }))}
              />
              <p className="text-xs text-muted-foreground">
                Ex: após 10 min, cobra a hora cheia
              </p>
            </div>
          </div>

          {/* Preview */}
          <div className="p-4 bg-secondary rounded-lg space-y-2">
            <p className="font-medium text-sm">Exemplo de cobrança:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Até {localSettings.pricing.toleranceMinutes} min: <span className="text-success font-medium">Grátis</span></li>
              <li>• 1 hora: <span className="font-medium">{formatCurrency(localSettings.pricing.firstHourPrice)}</span></li>
              <li>• 2 horas: <span className="font-medium">{formatCurrency(localSettings.pricing.firstHourPrice + localSettings.pricing.additionalHourPrice)}</span></li>
              <li>• Máximo diário: <span className="font-medium">{formatCurrency(localSettings.pricing.dailyMaxPrice)}</span></li>
            </ul>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Printer Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="w-5 h-5" />
            Impressora
          </CardTitle>
          <CardDescription>
            Configure o formato do papel e o tamanho da fonte dos tickets
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Tamanho do papel</Label>
              <Select
                value={localSettings.print?.paperSize ?? 'thermal80'}
                onValueChange={(v) =>
                  editar(s => ({ ...s, print: { ...s.print, paperSize: v as PaperSize } }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="thermal80">Bobina 80mm (padrão)</SelectItem>
                  <SelectItem value="thermal58">Bobina 58mm</SelectItem>
                  <SelectItem value="a4">A4 / Folha comum</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tamanho da fonte (pt)</Label>
              <Input
                type="number"
                min={8}
                max={18}
                value={localSettings.print?.fontSize ?? 12}
                onChange={(e) =>
                  editar(s => ({ ...s, print: { ...s.print, fontSize: parseInt(e.target.value) || 12 } }))
                }
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Nome da impressora (lembrete)</Label>
              <Input
                placeholder="Ex: EPSON TM-T20 na recepção"
                value={localSettings.print?.printerName ?? ''}
                onChange={(e) =>
                  editar(s => ({ ...s, print: { ...s.print, printerName: e.target.value } }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Apenas um lembrete para o operador. Para definir a impressora padrão, selecione-a
                uma vez no diálogo de impressão do navegador — ele vai lembrar nas próximas vezes.
              </p>
            </div>

            <div className="md:col-span-2 flex items-start justify-between gap-4 p-3 rounded-lg border bg-secondary/50">
              <div className="space-y-1">
                <Label htmlFor="autoPrintRemote" className="cursor-pointer">
                  Imprimir automaticamente entradas de outros aparelhos
                </Label>
                <p className="text-xs text-muted-foreground">
                  Ligue <strong>só no computador que tem a impressora</strong>. Quando alguém registrar
                  uma entrada pelo celular, o ticket sai aqui sozinho. Desligado, aparece um aviso com o
                  botão &quot;Imprimir&quot;. Vale só para este aparelho. Para imprimir sem abrir a janela
                  de impressão, abra o Chrome com <code>--kiosk-printing</code>.
                </p>
              </div>
              <Switch
                id="autoPrintRemote"
                checked={!!localSettings.print?.autoPrintRemoteEntries}
                onCheckedChange={(checked) =>
                  editar(s => ({ ...s, print: { ...s.print, autoPrintRemoteEntries: checked } }))
                }
              />
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() =>
              printHtml(
                buildEntryTicketHtml({
                  plate: 'ABC1D23',
                  entryTime: new Date().toLocaleString('pt-BR'),
                  id: 'teste-123',
                  parkingName: localSettings.parkingName,
                  parkingAddress: localSettings.parkingAddress,
                  parkingPhone: localSettings.parkingPhone,
                  ticketObservation: localSettings.ticketObservation,
                  fixedPrice: isFixed ? localSettings.pricing.fixedPrice : undefined,
                }),
                localSettings.print ?? { paperSize: 'thermal80', fontSize: 12, printerName: '' },
              )
            }
          >
            <Printer className="w-4 h-4 mr-2" />
            Imprimir ticket de teste
          </Button>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-1 px-1 pb-2 pt-2 bg-background/95 backdrop-blur">
        {alterado && (
          <p className="text-xs text-center text-warning font-medium mb-1.5">
            Há alterações não salvas
          </p>
        )}
        <Button onClick={handleSave} className="w-full" size="lg" disabled={salvando}>
          <Save className="w-4 h-4 mr-2" />
          {salvando ? 'Salvando…' : 'Salvar Configurações'}
        </Button>
      </div>
    </div>
  );
}
