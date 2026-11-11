import { PricingSettings, ChargeMode } from '@/types/parking';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock, Ticket, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChargeModeSelectorProps {
  value: ChargeMode;
  onChange: (mode: ChargeMode) => void;
  compact?: boolean;
}

const OPTIONS: { mode: ChargeMode; title: string; hint: string; Icon: typeof Clock }[] = [
  { mode: 'hourly', title: 'Por hora',    hint: 'Cobra pelo tempo de permanência', Icon: Clock },
  { mode: 'fixed',  title: 'Valor fixo',  hint: 'Mesmo valor para todos (eventos)', Icon: Ticket },
];

/**
 * Seletor de modo de cobrança — dois botões grandes lado a lado,
 * fáceis de tocar no celular e claros no computador.
 */
export function ChargeModeSelector({ value, onChange, compact }: ChargeModeSelectorProps) {
  return (
    <div role="radiogroup" aria-label="Modo de cobrança" className="grid grid-cols-2 gap-2 sm:gap-3">
      {OPTIONS.map(({ mode, title, hint, Icon }) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(mode)}
            className={cn(
              'relative text-left rounded-xl border-2 transition-all min-h-[56px]',
              compact ? 'p-2.5' : 'p-3 sm:p-4',
              active
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border bg-card hover:border-primary/40',
            )}
          >
            {active && <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-primary" />}
            <Icon className={cn('w-5 h-5 mb-1', active ? 'text-primary' : 'text-muted-foreground')} />
            <div className={cn('font-semibold', compact ? 'text-xs' : 'text-sm')}>{title}</div>
            {!compact && <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{hint}</div>}
          </button>
        );
      })}
    </div>
  );
}

interface FixedPriceFieldProps {
  pricing: PricingSettings;
  onChange: (p: Partial<PricingSettings>) => void;
  id?: string;
  small?: boolean;
}

export function FixedPriceField({ pricing, onChange, id = 'fixedPrice', small }: FixedPriceFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={small ? 'text-xs' : undefined}>Valor fixo por veículo (R$)</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={0.5}
        value={pricing.fixedPrice}
        onChange={e => onChange({ fixedPrice: parseFloat(e.target.value) || 0 })}
        className="text-lg font-semibold"
      />
      <p className="text-xs text-muted-foreground">
        Cobrado na saída, independente do tempo de permanência (tolerância não se aplica).
      </p>
    </div>
  );
}
