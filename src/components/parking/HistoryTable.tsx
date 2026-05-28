import { useState, useMemo } from 'react';
import { Vehicle, ParkingSettings } from '@/types/parking';
import { formatDateTime, formatDuration, formatCurrency, formatPlate, formatDate } from '@/lib/parking-utils';
import { printHtml, buildExitReceiptHtml } from '@/lib/print';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarIcon, Search, Download, FileText, Printer, Trash2 } from 'lucide-react';
import { useState as useConfirmState } from 'react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface HistoryTableProps {
  getHistory: (filters: { startDate?: string; endDate?: string; plate?: string }) => Vehicle[];
  onDelete: (vehicleId: string) => Promise<void>;
  settings: ParkingSettings;
}

export function HistoryTable({ getHistory, onDelete, settings }: HistoryTableProps) {
  const [plateFilter, setPlateFilter] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [confirmDeleteId, setConfirmDeleteId] = useConfirmState<string | null>(null);

  const filteredHistory = useMemo(() => {
    return getHistory({
      plate: plateFilter,
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
    });
  }, [getHistory, plateFilter, startDate, endDate]);

  const totalRevenue = useMemo(() => 
    filteredHistory.reduce((sum, v) => sum + (v.amountPaid || 0), 0),
    [filteredHistory]
  );

  const handleExport = () => {
    const headers = ['Placa', 'Entrada', 'Saída', 'Permanência', 'Valor'];
    const rows = filteredHistory.map(v => [
      formatPlate(v.plate),
      formatDateTime(v.entryTime),
      v.exitTime ? formatDateTime(v.exitTime) : '-',
      v.exitTime ? formatDuration(new Date(v.entryTime), new Date(v.exitTime)) : '-',
      formatCurrency(v.amountPaid || 0),
    ]);

    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historico-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintReceipt = (vehicle: Vehicle) => {
    if (!vehicle.exitTime) return;
    const duration = formatDuration(new Date(vehicle.entryTime), new Date(vehicle.exitTime));
    printHtml(
      buildExitReceiptHtml({
        plate:             formatPlate(vehicle.plate),
        vehicleName:       vehicle.vehicleName,
        entryTime:         formatDateTime(vehicle.entryTime),
        exitTime:          formatDateTime(vehicle.exitTime),
        duration,
        amountPaid:        vehicle.amountPaid ?? 0,
        id:                vehicle.id,
        parkingName:       settings.parkingName,
        parkingAddress:    settings.parkingAddress,
        parkingPhone:      settings.parkingPhone,
        ticketObservation: settings.ticketObservation,
      }),
      settings.print,
    );
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por placa..."
            value={plateFilter}
            onChange={(e) => setPlateFilter(e.target.value.toUpperCase())}
            className="pl-10 font-mono"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn(!startDate && "text-muted-foreground")}>
              <CalendarIcon className="w-4 h-4 mr-2" />
              {startDate ? format(startDate, 'dd/MM/yyyy') : 'Data inicial'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={setStartDate}
              locale={ptBR}
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn(!endDate && "text-muted-foreground")}>
              <CalendarIcon className="w-4 h-4 mr-2" />
              {endDate ? format(endDate, 'dd/MM/yyyy') : 'Data final'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={setEndDate}
              locale={ptBR}
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        <Button variant="outline" onClick={handleExport} disabled={filteredHistory.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between p-4 bg-secondary rounded-lg">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-muted-foreground" />
          <span className="font-medium">{filteredHistory.length} registros encontrados</span>
        </div>
        <div className="text-lg font-bold">
          Total: {formatCurrency(totalRevenue)}
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <Table className="min-w-[600px]">
          <TableHeader>
            <TableRow>
              <TableHead>Placa</TableHead>
              <TableHead>Entrada</TableHead>
              <TableHead>Saída</TableHead>
              <TableHead>Permanência</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredHistory.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum registro encontrado
                </TableCell>
              </TableRow>
            ) : (
              filteredHistory.map((vehicle) => (
                <TableRow key={vehicle.id}>
                  <TableCell className="font-mono font-bold">
                    {formatPlate(vehicle.plate)}
                  </TableCell>
                  <TableCell>{formatDateTime(vehicle.entryTime)}</TableCell>
                  <TableCell>
                    {vehicle.exitTime ? formatDateTime(vehicle.exitTime) : '-'}
                  </TableCell>
                  <TableCell>
                    {vehicle.exitTime 
                      ? formatDuration(new Date(vehicle.entryTime), new Date(vehicle.exitTime))
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(vehicle.amountPaid || 0)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handlePrintReceipt(vehicle)}
                        title="Reimprimir comprovante"
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                      {confirmDeleteId === vehicle.id ? (
                        <>
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-8 w-8"
                            title="Confirmar exclusão"
                            onClick={async () => {
                              await onDelete(vehicle.id);
                              setConfirmDeleteId(null);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setConfirmDeleteId(null)}
                            title="Cancelar"
                          >
                            ✕
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Excluir registro"
                          onClick={() => setConfirmDeleteId(vehicle.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
