import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface PlateInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export function PlateInput({ 
  value, 
  onChange, 
  onSubmit,
  placeholder = "Digite a placa",
  autoFocus = false,
  className 
}: PlateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Limit to 7 characters (standard Brazilian plate)
    onChange(raw.slice(0, 7));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && onSubmit && value.length >= 7) {
      onSubmit();
    }
  };

  const formatDisplayValue = (val: string): string => {
    if (val.length <= 3) return val;
    // Old format: AAA-1234
    if (/^[A-Z]{3}[0-9]{4}$/.test(val)) {
      return `${val.slice(0, 3)}-${val.slice(3)}`;
    }
    // Mercosul or partial: just show as-is
    return val;
  };

  return (
    <div className={cn("relative", className)}>
      <Input
        ref={inputRef}
        value={formatDisplayValue(value)}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="font-mono text-2xl tracking-[0.15em] text-center h-14 uppercase"
        maxLength={8}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        {value.length}/7
      </div>
    </div>
  );
}
