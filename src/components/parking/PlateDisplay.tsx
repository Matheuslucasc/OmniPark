import { formatPlate } from '@/lib/parking-utils';
import { cn } from '@/lib/utils';

interface PlateDisplayProps {
  plate: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'mercosul' | 'highlight';
  className?: string;
}

export function PlateDisplay({ 
  plate, 
  size = 'md', 
  variant = 'default',
  className 
}: PlateDisplayProps) {
  const formattedPlate = formatPlate(plate);
  
  const sizeClasses = {
    sm: 'text-lg px-3 py-1',
    md: 'text-2xl px-4 py-2',
    lg: 'text-4xl px-6 py-3',
    xl: 'text-5xl px-8 py-4',
  };

  const variantClasses = {
    default: 'bg-secondary border-2 border-border text-foreground',
    mercosul: 'bg-[hsl(210,100%,20%)] border-2 border-[hsl(210,100%,40%)] text-white',
    highlight: 'bg-primary border-2 border-primary text-primary-foreground animate-pulse-glow',
  };

  return (
    <div 
      className={cn(
        "inline-block font-mono font-bold tracking-[0.2em] rounded-lg",
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
    >
      {formattedPlate || '---'}
    </div>
  );
}
