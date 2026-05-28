import { useState, useMemo } from 'react';
import { Vehicle, ParkingSettings } from '@/types/parking';
import { formatDateTime, formatDuration, formatCurrency, formatPlate, formatDate } from '@/lib/parking-utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarIcon, Search, Download, FileText, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface HistoryTableProps {
  getHistory: (filters: { startDate?: string; endDate?: string; plate?: string }) => Vehicle[];
  settings: ParkingSettings;
}

export function HistoryTable({ getHistory, settings }: HistoryTableProps) {
  const [plateFilter, setPlateFilter] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

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
    const duration = vehicle.exitTime 
      ? formatDuration(new Date(vehicle.entryTime), new Date(vehicle.exitTime))
      : '-';
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Comprovante - ${formatPlate(vehicle.plate)}</title>
            <style>
              body { font-family: monospace; padding: 20px; max-width: 300px; margin: 0 auto; }
              .header { text-align: center; margin-bottom: 20px; }
              .title { font-size: 18px; font-weight: bold; }
              .divider { border-top: 1px dashed #000; margin: 10px 0; }
              .row { display: flex; justify-content: space-between; margin: 5px 0; }
              .plate { font-size: 24px; font-weight: bold; text-align: center; margin: 15px 0; letter-spacing: 2px; }
              .vehicle-name { text-align: center; color: #666; margin-bottom: 10px; }
              .total { font-size: 20px; font-weight: bold; text-align: center; margin: 15px 0; }
              .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title">${settings.parkingName || 'Estacionamento'}</div>
              ${settings.parkingAddress ? `<div>${settings.parkingAddress}</div>` : ''}
              ${settings.parkingPhone ? `<div>Tel: ${settings.parkingPhone}</div>` : ''}
            </div>
            <div class="divider"></div>
            <div class="plate">${formatPlate(vehicle.plate)}</div>
            ${vehicle.vehicleName ? `<div class="vehicle-name">${vehicle.vehicleName}</div>` : ''}
            <div class="divider"></div>
            <div class="row"><span>Entrada:</span><span>${formatDateTime(vehicle.entryTime)}</span></div>
            ${vehicle.exitTime ? `<div class="row"><span>Saída:</span><span>${formatDateTime(vehicle.exitTime)}</span></div>` : ''}
            <div class="row"><span>Permanência:</span><span>${duration}</span></div>
            <div class="divider"></div>
            <div class="total">Total: ${formatCurrency(vehicle.amountPaid || 0)}</div>
            <div class="divider"></div>
            <div class="footer">
              <div>Obrigado pela preferência!</div>
              <div style="margin-top: 5px;">2ª Via - ${formatDateTime(new Date())}</div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
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
              <TableHead className="w-[80px]"></TableHead>
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
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handlePrintReceipt(vehicle)}
                      title="Reimprimir comprovante"
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
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
