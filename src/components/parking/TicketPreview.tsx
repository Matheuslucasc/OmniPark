import { ParkingSettings } from '@/types/parking';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Ticket } from 'lucide-react';

interface TicketPreviewProps {
  settings: ParkingSettings;
}

export function TicketPreview({ settings }: TicketPreviewProps) {
  const currentDate = new Date();
  const formattedDate = currentDate.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const formattedTime = currentDate.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ticket className="w-5 h-5" />
          Preview do Ticket
        </CardTitle>
        <CardDescription>
          Visualize como o ticket ficará ao ser impresso
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="bg-white text-black rounded-lg border-2 border-dashed border-border p-4 max-w-[280px] mx-auto font-sans font-bold text-sm shadow-lg">
          {/* Header */}
          <div className="text-center border-b-2 border-dashed border-gray-300 pb-3 mb-3">
            <div className="font-bold text-base">
              {settings.parkingName || 'NOME DO ESTACIONAMENTO'}
            </div>
            {settings.parkingAddress && (
              <div className="text-[10px] text-black mt-1">
                {settings.parkingAddress}
              </div>
            )}
            {settings.parkingPhone && (
              <div className="text-[10px] text-black">
                Tel: {settings.parkingPhone}
              </div>
            )}
            {settings.parkingCNPJ && (
              <div className="text-[10px] text-black">
                CNPJ: {settings.parkingCNPJ}
              </div>
            )}
            <div className="mt-2 text-xs font-semibold text-black">
              TICKET DE ENTRADA
            </div>
          </div>

          {/* Plate */}
          <div className="text-center my-4">
            <div className="inline-block border-2 border-black px-4 py-2 font-bold text-xl tracking-[4px]">
              ABC1D23
            </div>
            <div className="mt-2 border-2 border-black rounded px-2 py-1 font-bold text-base uppercase">
              Civic Preto
            </div>
          </div>

          {/* Info */}
          <div className="space-y-1 mb-3">
            <div className="text-[10px] text-black">Data/Hora Entrada:</div>
            <div className="text-xs font-bold">{formattedDate}, {formattedTime}</div>
            {settings.pricing.chargeMode === 'fixed' && (
              <>
                <div className="text-[10px] text-black pt-1">Valor (fixo) — pagamento na saída:</div>
                <div className="text-xs font-bold">
                  {settings.pricing.fixedPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </>
            )}
          </div>

          {/* Observation */}
          {settings.ticketObservation && (
            <div className="text-center text-[10px] text-black border border-black rounded p-2 my-3">
              {settings.ticketObservation}
            </div>
          )}

          {/* Footer */}
          <div className="text-center border-t-2 border-dashed border-gray-300 pt-3 mt-3">
            <div className="text-[10px]">Guarde este ticket</div>
            <div className="text-[9px] text-black mt-1">ID: a1b2c3d4</div>
          </div>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-4">
          * Este é apenas um exemplo visual. Os dados reais serão preenchidos ao registrar um veículo.
        </p>
      </CardContent>
    </Card>
  );
}
