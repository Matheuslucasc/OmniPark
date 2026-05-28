import { ParkingSettings, PricingSettings } from '@/types/parking';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Save, Building, DollarSign, Clock, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/parking-utils';
import { TicketPreview } from './TicketPreview';

interface SettingsPanelProps {
  settings: ParkingSettings;
  onUpdateSettings: (settings: Partial<ParkingSettings>) => void;
  onUpdatePricing: (pricing: Partial<PricingSettings>) => void;
}

export function SettingsPanel({ settings, onUpdateSettings, onUpdatePricing }: SettingsPanelProps) {
  const [localSettings, setLocalSettings] = useState(settings);
  const { toast } = useToast();

  // Sincroniza quando o banco carrega as configurações salvas
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = () => {
    // passa tudo de uma vez para evitar race condition entre dois setSettings separados
    onUpdateSettings(localSettings);

    toast({
      title: "Configurações salvas",
      description: "As alterações foram aplicadas com sucesso.",
    });
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
                onChange={(e) => setLocalSettings(s => ({ ...s, parkingName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={localSettings.parkingPhone}
                onChange={(e) => setLocalSettings(s => ({ ...s, parkingPhone: e.target.value }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Endereço</Label>
              <Input
                id="address"
                value={localSettings.parkingAddress}
                onChange={(e) => setLocalSettings(s => ({ ...s, parkingAddress: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                value={localSettings.parkingCNPJ}
                onChange={(e) => setLocalSettings(s => ({ ...s, parkingCNPJ: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spots">Total de Vagas</Label>
              <Input
                id="spots"
                type="number"
                min={1}
                value={localSettings.totalSpots}
                onChange={(e) => setLocalSettings(s => ({ ...s, totalSpots: parseInt(e.target.value) || 1 }))}
              />
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
              onChange={(e) => setLocalSettings(s => ({ ...s, ticketObservation: e.target.value }))}
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
            Configure os valores cobrados por hora
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstHour">Primeira Hora (R$)</Label>
              <Input
                id="firstHour"
                type="number"
                min={0}
                step={0.5}
                value={localSettings.pricing.firstHourPrice}
                onChange={(e) => setLocalSettings(s => ({
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
                onChange={(e) => setLocalSettings(s => ({
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
                onChange={(e) => setLocalSettings(s => ({
                  ...s,
                  pricing: { ...s.pricing, dailyMaxPrice: parseFloat(e.target.value) || 0 }
                }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tolerance */}
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
                onChange={(e) => setLocalSettings(s => ({
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
                onChange={(e) => setLocalSettings(s => ({
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

      <Button onClick={handleSave} className="w-full" size="lg">
        <Save className="w-4 h-4 mr-2" />
        Salvar Configurações
      </Button>
    </div>
  );
}
