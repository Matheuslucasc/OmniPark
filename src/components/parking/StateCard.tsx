import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  variant?: 'default' | 'primary' | 'success' | 'warning';
  className?: string;
}

export function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon,
  variant = 'default',
  className 
}: StatCardProps) {
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

  return (
    <div 
      className={cn(
        "p-6 rounded-xl border-2 transition-all hover:shadow-lg",
        variantClasses[variant],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        <div className={cn("p-3 rounded-lg", iconClasses[variant])}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
