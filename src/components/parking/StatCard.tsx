import { useState } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon, Eye, EyeOff } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  variant?: 'default' | 'primary' | 'success' | 'warning';
  className?: string;
  /** Mostra um botão de olho para ocultar/exibir o valor (lembra a escolha). */
  hideable?: boolean;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = 'default',
  className,
  hideable = false,
}: StatCardProps) {
  const storageKey = `omnipark:hidden:${title}`;
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(storageKey) === '1';
  });

  const toggleHidden = () => {
    setHidden(prev => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        /* localStorage indisponível: mantém só em memória */
      }
      return next;
    });
  };

  const variantClasses = {
    default: 'bg-card border-border',
    primary: 'bg-primary/10 border-primary/20',
    success: 'bg-success/10 border-success/20',
    warning: 'bg-warning/10 border-warning/20',
  };

  const iconClasses = {
    default: 'bg-secondary text-foreground',
    primary: 'bg-primary text-primary-foreground',
    success: 'bg-success text-success-foreground',
    warning: 'bg-warning text-warning-foreground',
  };

  const shownValue = hideable && hidden ? '••••••' : value;

  return (
    <div
      className={cn(
        'p-4 sm:p-6 rounded-xl border-2 transition-all hover:shadow-lg',
        variantClasses[variant],
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm text-muted-foreground font-medium truncate">{title}</p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-2xl sm:text-3xl font-bold truncate">{shownValue}</p>
            {hideable && (
              <button
                type="button"
                onClick={toggleHidden}
                aria-label={hidden ? 'Mostrar valor' : 'Ocultar valor'}
                title={hidden ? 'Mostrar valor' : 'Ocultar valor'}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              >
                {hidden
                  ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" />
                  : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            )}
          </div>
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        <div className={cn('p-2 sm:p-3 rounded-lg shrink-0', iconClasses[variant])}>
          <Icon className="w-4 h-4 sm:w-6 sm:h-6" />
        </div>
      </div>
    </div>
  );
}
