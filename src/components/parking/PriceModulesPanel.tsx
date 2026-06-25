import { useState } from 'react';
import { PriceModule, PricingSettings } from '@/types/parking';
import { usePriceModules } from '@/hooks/usePriceModules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/parking-utils';
import { Plus, Trash2, Edit2, Save, X, Tag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function PriceModulesPanel({ defaultPricing }: { defaultPricing: PricingSettings }) {
  const { modules, addModule, saveModule, removeModule } = usePriceModules();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const emptyForm = () => ({
    name: '',
    description: '',
    pricing: { ...defaultPricing },
    isActive: true,
  });

  const [form, setForm] = useState(emptyForm());
  const [editForm, setEditForm] = useState<PriceModule | null>(null);

  const handleAdd = async () => {
    if (!form.name.trim()) { toast({ title: 'Informe o nome da tarifa', variant: 'destructive' }); return; }
    await addModule(form);
    setForm(emptyForm());
    setShowAdd(false);
    toast({ title: 'Tarifa adicionada' });
  };

  const handleSave = async () => {
    if (!editForm) return;
    await saveModule(editForm);
    setEditId(null);
    setEditForm(null);
    toast({ title: 'Tarifa atualizada' });
  };

  const handleRemove = async (id: string) => {
    await removeModule(id);
    toast({ title: 'Tarifa removida' });
  };

  const PricingFields = ({
    pricing,
    onChange,
  }: {
    pricing: PricingSettings;
    onChange: (p: Partial<PricingSettings>) => void;
  }) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label className="text-xs">1ª hora (R$)</Label>
        <Input type="number" min={0} step={0.5} value={pricing.firstHourPrice}
          onChange={e => onChange({ firstHourPrice: parseFloat(e.target.value) || 0 })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Hora adicional (R$)</Label>
        <Input type="number" min={0} step={0.5} value={pricing.additionalHourPrice}
          onChange={e => onChange({ additionalHourPrice: parseFloat(e.target.value) || 0 })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Máximo diário (R$)</Label>
        <Input type="number" min={0} step={1} value={pricing.dailyMaxPrice}
          onChange={e => onChange({ dailyMaxPrice: parseFloat(e.target.value) || 0 })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Tolerância (min)</Label>
        <Input type="number" min={0} max={60} value={pricing.toleranceMinutes}
          onChange={e => onChange({ toleranceMinutes: parseInt(e.target.value) || 0 })} />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Tarifas Especiais</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ex: Festa do Pinhão, Show, Feriado. Selecionável na hora da saída.
          </p>
        </div>
        <Button size="sm" onClick={() => { setShowAdd(true); setForm(emptyForm()); }}>
          <Plus className="w-4 h-4 mr-1" />
          Nova tarifa
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card className="border-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Nova tarifa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Nome *</Label>
                <Input placeholder="Ex: Festa do Pinhão" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Descrição</Label>
                <Input placeholder="Opcional" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <PricingFields
              pricing={form.pricing}
              onChange={p => setForm(f => ({ ...f, pricing: { ...f.pricing, ...p } }))}
            />
            <div className="flex gap-2 pt-1">
              <Button onClick={handleAdd} className="flex-1"><Save className="w-4 h-4 mr-1" />Salvar</Button>
              <Button variant="outline" onClick={() => setShowAdd(false)}><X className="w-4 h-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {modules.length === 0 && !showAdd && (
        <div className="text-center py-10 border-2 border-dashed rounded-xl text-muted-foreground text-sm">
          <Tag className="w-8 h-8 mx-auto mb-2 opacity-40" />
          Nenhuma tarifa especial cadastrada
        </div>
      )}

      {modules.map(mod =>
        editId === mod.id && editForm ? (
          <Card key={mod.id} className="border-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Editando: {mod.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Nome</Label>
                  <Input value={editForm.name}
                    onChange={e => setEditForm(f => f ? { ...f, name: e.target.value } : f)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descrição</Label>
                  <Input value={editForm.description ?? ''}
                    onChange={e => setEditForm(f => f ? { ...f, description: e.target.value } : f)} />
                </div>
              </div>
              <PricingFields
                pricing={editForm.pricing}
                onChange={p => setEditForm(f => f ? { ...f, pricing: { ...f.pricing, ...p } } : f)}
              />
              <div className="flex gap-2 pt-1">
                <Button onClick={handleSave} className="flex-1"><Save className="w-4 h-4 mr-1" />Salvar</Button>
                <Button variant="outline" onClick={() => { setEditId(null); setEditForm(null); }}><X className="w-4 h-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card key={mod.id}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{mod.name}</span>
                    <Badge variant="secondary" className="text-xs">Especial</Badge>
                  </div>
                  {mod.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                    <span>1ª hora: <strong>{formatCurrency(mod.pricing.firstHourPrice)}</strong></span>
                    <span>Adic.: <strong>{formatCurrency(mod.pricing.additionalHourPrice)}</strong></span>
                    <span>Máx.: <strong>{formatCurrency(mod.pricing.dailyMaxPrice)}</strong></span>
                    <span>Tolerância: <strong>{mod.pricing.toleranceMinutes}min</strong></span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7"
                    onClick={() => { setEditId(mod.id); setEditForm({ ...mod }); }}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleRemove(mod.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
