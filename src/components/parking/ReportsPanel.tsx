import { useMemo, useState, type ReactNode } from 'react';
import { Vehicle } from '@/types/parking';
import { formatCurrency, formatPlate, formatTicket, formatDateTime } from '@/lib/parking-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart3, Car, DollarSign, Clock, ChevronLeft, ChevronRight, Download,
  ArrowUpRight, ArrowDownRight, Minus, Table2, Receipt,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReportsPanelProps {
  vehicles: Vehicle[];
}

// ── Helpers de mês ────────────────────────────────────────────────────────────

/** Chave "AAAA-MM" de uma data local. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m - 1 };
}

function monthLabel(key: string, style: 'long' | 'short' = 'long'): string {
  const { year, month } = parseMonthKey(key);
  const txt = new Date(year, month, 1).toLocaleDateString('pt-BR', {
    month: style,
    year: 'numeric',
  });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function shiftMonth(key: string, delta: number): string {
  const { year, month } = parseMonthKey(key);
  return monthKey(new Date(year, month + delta, 1));
}

function formatMinutes(min: number): string {
  if (!min) return '0min';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

/** Rótulo do eixo: inteiro quando possível, senão 1 casa decimal. */
function formatAxisNumber(v: number): string {
  if (v >= 1000) return `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/** Arredonda o máximo do eixo para um número "redondo" (10, 20, 50, 100...). */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

// ── Estatísticas de um mês ────────────────────────────────────────────────────

interface DayStat {
  day: number;
  date: Date;
  vehicles: number;
  revenue: number;
}

interface MonthStats {
  exited: Vehicle[];
  revenue: number;
  count: number;
  avgTicket: number;
  avgStayMin: number;
  days: DayStat[];
  hours: number[]; // entradas por hora (0-23)
  entries: number;
}

/** `untilDay` limita ao período 1..untilDay (para comparar mês em andamento). */
function computeMonth(vehicles: Vehicle[], key: string, untilDay?: number): MonthStats {
  const { year, month } = parseMonthKey(key);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const inRange = (d: Date) => monthKey(d) === key && (untilDay == null || d.getDate() <= untilDay);

  // Faturamento conta pela SAÍDA (quando o pagamento acontece).
  const exited = vehicles.filter(
    v => v.status === 'exited' && v.exitTime && inRange(new Date(v.exitTime)),
  );
  // Movimento por horário conta pela ENTRADA (inclui quem ainda está no pátio).
  const entered = vehicles.filter(v => inRange(new Date(v.entryTime)));

  const days: DayStat[] = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    date: new Date(year, month, i + 1),
    vehicles: 0,
    revenue: 0,
  }));
  let revenue = 0;
  let stayTotal = 0;
  for (const v of exited) {
    const exit = new Date(v.exitTime!);
    const d = days[exit.getDate() - 1];
    d.vehicles += 1;
    d.revenue += v.amountPaid || 0;
    revenue += v.amountPaid || 0;
    stayTotal += (exit.getTime() - new Date(v.entryTime).getTime()) / 60000;
  }

  const hours = Array.from({ length: 24 }, () => 0);
  for (const v of entered) hours[new Date(v.entryTime).getHours()] += 1;

  const count = exited.length;
  return {
    exited,
    revenue,
    count,
    avgTicket: count ? revenue / count : 0,
    avgStayMin: count ? stayTotal / count : 0,
    days,
    hours,
    entries: entered.length,
  };
}

// ── Componentes visuais ───────────────────────────────────────────────────────

function Delta({ current, previous, prevLabel }: { current: number; previous: number; prevLabel: string }) {
  if (previous === 0 && current === 0) {
    return <p className="text-xs text-muted-foreground">Sem movimento em {prevLabel}</p>;
  }
  if (previous === 0) {
    return <p className="text-xs text-muted-foreground">Sem base em {prevLabel}</p>;
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct);
  const Icon = rounded > 0 ? ArrowUpRight : rounded < 0 ? ArrowDownRight : Minus;
  return (
    <p className="text-xs text-muted-foreground flex items-center gap-1">
      <span
        className={cn(
          'inline-flex items-center font-semibold',
          rounded > 0 && 'text-success',
          rounded < 0 && 'text-destructive',
        )}
      >
        <Icon className="w-3.5 h-3.5" aria-hidden />
        {rounded > 0 ? '+' : ''}{rounded}%
      </span>
      vs {prevLabel}
    </p>
  );
}

function StatTile({
  icon: Icon, title, value, children,
}: { icon: typeof Car; title: string; value: string; children?: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-1 p-4">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Icon className="w-4 h-4 shrink-0" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-1">
        <div className="text-xl sm:text-2xl font-bold tabular-nums">{value}</div>
        {children}
      </CardContent>
    </Card>
  );
}

interface ColumnDatum {
  key: string;
  axisLabel: string;      // rótulo curto no eixo X ('' = oculto)
  value: number;
  title: string;          // 1ª linha do tooltip (ex: "Sex, 14/11")
  valueText: string;      // valor formatado (destaque do tooltip)
  detail?: string;        // 2ª linha (ex: "8 veículos")
  highlight?: boolean;    // ex: dia de hoje
}

/**
 * Gráfico de colunas simples (uma série): barras finas com topo arredondado,
 * grade discreta, tooltip ao passar o mouse / tocar / focar com teclado e
 * rótulo direto só no maior valor.
 */
function ColumnChart({
  data, formatAxis, emptyText, ariaLabel,
}: {
  data: ColumnDatum[];
  formatAxis: (v: number) => string;
  emptyText: string;
  ariaLabel: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map(d => d.value), 0));
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? 0) ? i : best), 0);
  const hasData = data.some(d => d.value > 0);
  const ticks = [max, max / 2, 0];

  if (!hasData) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
        {emptyText}
      </div>
    );
  }

  const act = active != null ? data[active] : null;

  return (
    <div className="relative" role="group" aria-label={ariaLabel}>
      <div className="flex gap-2">
        {/* Eixo Y */}
        <div className="relative h-48 w-8 text-[10px] text-muted-foreground tabular-nums text-right shrink-0">
          {ticks.map((t, i) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2 leading-none"
              style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
            >
              {formatAxis(t)}
            </span>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          {/* Área de plotagem */}
          <div className="relative h-48">
            {/* Grade */}
            {ticks.map((t, i) => (
              <div
                key={t}
                className={cn('absolute inset-x-0 border-t', i === ticks.length - 1 ? 'border-border' : 'border-border/50 border-dashed')}
                style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
              />
            ))}

            <div className="absolute inset-0 flex items-end" onMouseLeave={() => setActive(null)}>
              {data.map((d, i) => {
                const h = (d.value / max) * 100;
                const isActive = active === i;
                return (
                  <button
                    key={d.key}
                    type="button"
                    className="group relative flex-1 h-full flex items-end justify-center px-[1px] focus:outline-none"
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    onClick={() => setActive(isActive ? null : i)}
                    aria-label={`${d.title}: ${d.valueText}${d.detail ? `, ${d.detail}` : ''}`}
                  >
                    {/* Rótulo direto só no pico */}
                    {i === peak && d.value > 0 && !isActive && (
                      <span
                        className="absolute text-[10px] font-semibold text-foreground whitespace-nowrap pointer-events-none"
                        style={{ bottom: `calc(${h}% + 4px)` }}
                      >
                        {d.valueText}
                      </span>
                    )}
                    <span
                      className={cn(
                        'block w-full max-w-[24px] rounded-t-[4px] transition-colors',
                        d.highlight ? 'bg-primary' : 'bg-primary/70',
                        isActive && 'bg-primary ring-2 ring-primary/30',
                        'group-focus-visible:ring-2 group-focus-visible:ring-ring',
                      )}
                      style={{ height: d.value > 0 ? `max(${h}%, 2px)` : 0 }}
                    />
                  </button>
                );
              })}
            </div>

            {/* Tooltip */}
            {act && active != null && (
              <div
                className="absolute z-10 -translate-x-1/2 pointer-events-none rounded-lg border bg-popover text-popover-foreground shadow-md px-2.5 py-1.5 text-xs whitespace-nowrap"
                style={{
                  left: `clamp(56px, ${((active + 0.5) / data.length) * 100}%, calc(100% - 56px))`,
                  bottom: `calc(${(act.value / max) * 100}% + 8px)`,
                }}
                role="status"
              >
                <div className="font-bold text-sm tabular-nums">{act.valueText}</div>
                <div className="text-muted-foreground">{act.title}</div>
                {act.detail && <div className="text-muted-foreground">{act.detail}</div>}
              </div>
            )}
          </div>

          {/* Eixo X */}
          <div className="flex mt-1">
            {data.map(d => (
              <div key={d.key} className="flex-1 text-center text-[10px] text-muted-foreground tabular-nums overflow-visible whitespace-nowrap">
                {d.axisLabel}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CSV ───────────────────────────────────────────────────────────────────────

function exportCsv(rows: Vehicle[], key: string) {
  const header = ['Ticket', 'Placa', 'Veículo', 'Entrada', 'Saída', 'Permanência (min)', 'Valor (R$)'];
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [...rows]
    .sort((a, b) => new Date(a.exitTime!).getTime() - new Date(b.exitTime!).getTime())
    .map(v => {
      const stay = Math.round((new Date(v.exitTime!).getTime() - new Date(v.entryTime).getTime()) / 60000);
      return [
        formatTicket(v.dailyTicket),
        formatPlate(v.plate),
        v.vehicleName ?? '',
        formatDateTime(v.entryTime),
        formatDateTime(v.exitTime!),
        String(stay),
        (v.amountPaid ?? 0).toFixed(2).replace('.', ','),
      ].map(esc).join(';');
    });
  // BOM + ";" para o Excel em português abrir com acentos e colunas certas
  const csv = '﻿' + [header.map(esc).join(';'), ...lines].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `omnipark-relatorio-${key}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Painel ────────────────────────────────────────────────────────────────────

export function ReportsPanel({ vehicles }: ReportsPanelProps) {
  const currentKey = monthKey(new Date());
  const [selected, setSelected] = useState(currentKey);
  const [showTable, setShowTable] = useState(false);

  // Meses disponíveis: do primeiro registro até o mês atual (mais recente primeiro).
  const months = useMemo(() => {
    let first = currentKey;
    for (const v of vehicles) {
      const k = monthKey(new Date(v.entryTime));
      if (k < first) first = k;
    }
    const list: string[] = [];
    for (let k = currentKey; k >= first; k = shiftMonth(k, -1)) list.push(k);
    return list;
  }, [vehicles, currentKey]);

  const stats = useMemo(() => computeMonth(vehicles, selected), [vehicles, selected]);
  const prevKey = shiftMonth(selected, -1);
  const isCurrent = selected === currentKey;
  // Mês em andamento: compara com o MESMO período do mês anterior (1 até hoje),
  // senão o mês parcial sempre pareceria uma queda.
  const untilDay = isCurrent ? new Date().getDate() : undefined;
  const prev = useMemo(() => computeMonth(vehicles, prevKey, untilDay), [vehicles, prevKey, untilDay]);
  const prevShort = monthLabel(prevKey, 'short').replace(' de ', '/').replace('.', '');
  const prevLabel = untilDay != null
    ? `1–${untilDay}/${prevShort.split('/')[0].toLowerCase()}`
    : prevShort;
  const idx = months.indexOf(selected);
  const today = new Date();

  const bestDay = stats.days.reduce<DayStat | null>((b, d) => (d.revenue > (b?.revenue ?? 0) ? d : b), null);
  const activeDays = stats.days.filter(d => d.vehicles > 0).length;

  const dayData: ColumnDatum[] = stats.days.map(d => ({
    key: String(d.day),
    // No celular, rotula só alguns dias para não embolar
    axisLabel: d.day === 1 || d.day % 5 === 0 ? String(d.day) : '',
    value: d.revenue,
    title: d.date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
    valueText: formatCurrency(d.revenue),
    detail: `${d.vehicles} veículo${d.vehicles === 1 ? '' : 's'}`,
    highlight: isCurrent && d.day === today.getDate(),
  }));

  const hourData: ColumnDatum[] = stats.hours.map((n, h) => ({
    key: String(h),
    axisLabel: h % 3 === 0 ? `${h}h` : '',
    value: n,
    title: `${String(h).padStart(2, '0')}:00 – ${String(h).padStart(2, '0')}:59`,
    valueText: `${n} entrada${n === 1 ? '' : 's'}`,
  }));
  const peakHour = stats.hours.reduce((b, n, h) => (n > stats.hours[b] ? h : b), 0);

  return (
    <div className="space-y-5">
      {/* ── Seletor de mês ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            aria-label="Mês anterior"
            disabled={idx < 0 || idx >= months.length - 1}
            onClick={() => setSelected(months[idx + 1])}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="h-10 w-full sm:w-56 font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map(k => (
                <SelectItem key={k} value={k}>
                  {monthLabel(k)}{k === currentKey ? ' (atual)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            aria-label="Próximo mês"
            disabled={idx <= 0}
            onClick={() => setSelected(months[idx - 1])}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <Button
          variant="outline"
          className="h-10"
          disabled={stats.count === 0}
          onClick={() => exportCsv(stats.exited, selected)}
        >
          <Download className="w-4 h-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* ── Indicadores do mês ── */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile icon={DollarSign} title="Faturamento" value={formatCurrency(stats.revenue)}>
          <Delta current={stats.revenue} previous={prev.revenue} prevLabel={prevLabel} />
        </StatTile>
        <StatTile icon={Car} title="Saídas" value={String(stats.count)}>
          <Delta current={stats.count} previous={prev.count} prevLabel={prevLabel} />
          <p className="text-xs text-muted-foreground">
            {stats.entries} {stats.entries === 1 ? 'entrada' : 'entradas'} no mês
          </p>
        </StatTile>
        <StatTile icon={Receipt} title="Ticket médio" value={formatCurrency(stats.avgTicket)}>
          <Delta current={stats.avgTicket} previous={prev.avgTicket} prevLabel={prevLabel} />
        </StatTile>
        <StatTile icon={Clock} title="Permanência média" value={formatMinutes(stats.avgStayMin)}>
          <p className="text-xs text-muted-foreground">
            {prev.count ? `${formatMinutes(prev.avgStayMin)} em ${prevLabel}` : `Sem dados em ${prevLabel}`}
          </p>
        </StatTile>
      </div>

      {/* ── Destaques ── */}
      {stats.count > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground px-1">
          <span>
            Dias com movimento: <strong className="text-foreground">{activeDays}</strong>
          </span>
          {bestDay && (
            <span>
              Melhor dia:{' '}
              <strong className="text-foreground">
                {bestDay.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · {formatCurrency(bestDay.revenue)}
              </strong>
            </span>
          )}
          {activeDays > 0 && (
            <span>
              Média por dia com movimento:{' '}
              <strong className="text-foreground">{formatCurrency(stats.revenue / activeDays)}</strong>
            </span>
          )}
        </div>
      )}

      {/* ── Faturamento por dia ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <BarChart3 className="w-5 h-5" />
            Faturamento por dia — {monthLabel(selected)}
          </CardTitle>
          <CardDescription>Passe o mouse ou toque na barra para ver o valor e os veículos do dia.</CardDescription>
        </CardHeader>
        <CardContent>
          <ColumnChart
            data={dayData}
            formatAxis={formatAxisNumber}
            emptyText="Nenhuma saída registrada neste mês"
            ariaLabel={`Faturamento diário de ${monthLabel(selected)}`}
          />

          <div className="mt-4">
            <Button variant="ghost" size="sm" className="px-2" onClick={() => setShowTable(s => !s)}>
              <Table2 className="w-4 h-4 mr-2" />
              {showTable ? 'Ocultar tabela por dia' : 'Ver tabela por dia'}
            </Button>
            {showTable && (
              <div className="mt-2 rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Dia</th>
                      <th className="text-right font-medium px-3 py-2">Veículos</th>
                      <th className="text-right font-medium px-3 py-2">Faturamento</th>
                      <th className="text-right font-medium px-3 py-2 hidden sm:table-cell">Ticket médio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.days.filter(d => d.vehicles > 0).map(d => (
                      <tr key={d.day} className="border-t">
                        <td className="px-3 py-2">
                          {d.date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{d.vehicles}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(d.revenue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">
                          {formatCurrency(d.revenue / d.vehicles)}
                        </td>
                      </tr>
                    ))}
                    {activeDays === 0 && (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Sem movimento</td></tr>
                    )}
                  </tbody>
                  {activeDays > 0 && (
                    <tfoot className="bg-muted/40 font-semibold">
                      <tr className="border-t">
                        <td className="px-3 py-2">Total</td>
                        <td className="px-3 py-2 text-right tabular-nums">{stats.count}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(stats.revenue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">{formatCurrency(stats.avgTicket)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Entradas por horário ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Clock className="w-5 h-5" />
            Entradas por horário
          </CardTitle>
          <CardDescription>
            {stats.entries > 0
              ? <>Horário de pico: <strong className="text-foreground">{String(peakHour).padStart(2, '0')}h</strong> · {stats.entries} entradas no mês</>
              : 'Quantidade de veículos que entraram em cada hora do dia, no mês.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ColumnChart
            data={hourData}
            formatAxis={formatAxisNumber}
            emptyText="Nenhuma entrada registrada neste mês"
            ariaLabel={`Entradas por horário em ${monthLabel(selected)}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
