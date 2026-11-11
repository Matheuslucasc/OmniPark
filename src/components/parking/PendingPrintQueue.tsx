import { Vehicle } from '@/types/parking';
import { formatPlate, formatTicket, formatTime } from '@/lib/parking-utils';
import { Printer, X, Car, Clock, Smartphone } from 'lucide-react';

interface PendingPrintQueueProps {
  items: Vehicle[];                     // mais recente primeiro
  onPrint: (v: Vehicle) => void;
  onPrintAll: () => void;
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
}

/**
 * Pilha de avisos amarelos com as entradas feitas em OUTROS aparelhos que ainda
 * não tiveram o ticket impresso aqui. Cada card só some quando é impresso ou
 * dispensado — com muitas entradas seguidas, elas se acumulam e o operador
 * imprime no ritmo dele (ou todas de uma vez).
 */
export function PendingPrintQueue({ items, onPrint, onPrintAll, onDismiss, onDismissAll }: PendingPrintQueueProps) {
  if (items.length === 0) return null;

  return (
    <section
      aria-label="Tickets aguardando impressão"
      aria-live="polite"
      className="fixed z-50 bottom-4 right-4 left-4 sm:left-auto sm:w-[380px] flex flex-col gap-2 no-print"
    >
      {/* Cabeçalho da fila (2+ pendentes) */}
      {items.length > 1 && (
        <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-yellow-600 bg-yellow-400 text-yellow-950 px-3 py-2 shadow-lg">
          <span className="text-sm font-bold leading-tight">
            {items.length} aguardando impressão
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onPrintAll}
              className="inline-flex items-center whitespace-nowrap h-8 px-3 rounded-md bg-yellow-950 text-yellow-50 text-sm font-semibold hover:bg-yellow-900 focus:outline-none focus:ring-2 focus:ring-yellow-700"
            >
              <Printer className="w-4 h-4 mr-1.5" />
              Imprimir todos
            </button>
            <button
              type="button"
              onClick={onDismissAll}
              aria-label="Dispensar todos"
              title="Dispensar todos"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-yellow-950/70 hover:bg-yellow-500/50 hover:text-yellow-950"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Cards (rolam se forem muitos) */}
      <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto overscroll-contain p-1 -m-1">
        {items.map(v => (
          <article
            key={v.id}
            className="relative rounded-xl border-2 border-yellow-500 bg-yellow-300 text-yellow-950 shadow-lg ring-4 ring-yellow-400/40 p-3 pr-9 animate-in slide-in-from-bottom-2 fade-in"
          >
            <button
              type="button"
              onClick={() => onDismiss(v.id)}
              aria-label={`Dispensar ${formatPlate(v.plate)}`}
              title="Dispensar (não imprimir)"
              className="absolute top-2 right-2 h-7 w-7 inline-flex items-center justify-center rounded-md text-yellow-950/70 hover:bg-yellow-400 hover:text-yellow-950"
            >
              <X className="w-4 h-4" />
            </button>

            <p className="text-xs font-semibold flex items-center gap-1 opacity-80">
              <Smartphone className="w-3.5 h-3.5" />
              Entrada em outro aparelho
              <span className="inline-flex items-center gap-0.5 ml-1 font-normal">
                <Clock className="w-3 h-3" />
                {formatTime(v.entryTime)}
              </span>
            </p>

            <div className="flex items-end justify-between gap-3 mt-1">
              <div className="min-w-0">
                <p className="font-mono font-bold text-xl tracking-wider leading-tight">
                  {v.dailyTicket != null && (
                    <span className="text-sm font-sans font-bold mr-1.5">Nº {formatTicket(v.dailyTicket)}</span>
                  )}
                  {formatPlate(v.plate)}
                </p>
                {v.vehicleName && (
                  <p className="mt-0.5 font-bold text-base uppercase flex items-center gap-1 truncate">
                    <Car className="w-4 h-4 shrink-0" />
                    <span className="truncate">{v.vehicleName}</span>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onPrint(v)}
                className="shrink-0 inline-flex items-center whitespace-nowrap h-9 px-3 rounded-md bg-yellow-950 text-yellow-50 text-sm font-semibold hover:bg-yellow-900 focus:outline-none focus:ring-2 focus:ring-yellow-700"
              >
                <Printer className="w-4 h-4 mr-1.5" />
                Imprimir
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
