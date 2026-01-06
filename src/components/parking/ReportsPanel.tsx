import { useMemo } from 'react';
import { Vehicle } from '@/types/parking';
import { formatCurrency, formatDate, isToday } from '@/lib/parking-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, Car, DollarSign, Calendar } from 'lucide-react';

interface ReportsPanelProps {
  vehicles: Vehicle[];
}

export function ReportsPanel({ vehicles }: ReportsPanelProps) {
  const stats = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const exitedVehicles = vehicles.filter(v => v.status === 'exited' && v.exitTime);

    const todayVehicles = exitedVehicles.filter(v => 
      new Date(v.exitTime!) >= today
    );

    const weekVehicles = exitedVehicles.filter(v => 
      new Date(v.exitTime!) >= weekAgo
    );

    const monthVehicles = exitedVehicles.filter(v => 
      new Date(v.exitTime!) >= monthAgo
    );

    const todayRevenue = todayVehicles.reduce((sum, v) => sum + (v.amountPaid || 0), 0);
    const weekRevenue = weekVehicles.reduce((sum, v) => sum + (v.amountPaid || 0), 0);
    const monthRevenue = monthVehicles.reduce((sum, v) => sum + (v.amountPaid || 0), 0);

    // Calculate average stay time
    const avgStayMinutes = exitedVehicles.length > 0
      ? exitedVehicles.reduce((sum, v) => {
          const entry = new Date(v.entryTime).getTime();
          const exit = new Date(v.exitTime!).getTime();
          return sum + (exit - entry) / (1000 * 60);
        }, 0) / exitedVehicles.length
      : 0;

    const avgStayHours = Math.floor(avgStayMinutes / 60);
    const avgStayMins = Math.round(avgStayMinutes % 60);

    // Daily breakdown for the last 7 days
    const dailyBreakdown = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
      
      const dayVehicles = exitedVehicles.filter(v => {
        const exitDate = new Date(v.exitTime!);
        return exitDate >= date && exitDate < nextDate;
      });

      dailyBreakdown.push({
        date,
        vehicles: dayVehicles.length,
        revenue: dayVehicles.reduce((sum, v) => sum + (v.amountPaid || 0), 0),
      });
    }

    // Average ticket
    const avgTicket = exitedVehicles.length > 0
      ? exitedVehicles.reduce((sum, v) => sum + (v.amountPaid || 0), 0) / exitedVehicles.length
      : 0;

    return {
      today: { count: todayVehicles.length, revenue: todayRevenue },
      week: { count: weekVehicles.length, revenue: weekRevenue },
      month: { count: monthVehicles.length, revenue: monthRevenue },
      avgStay: `${avgStayHours}h ${avgStayMins}min`,
      avgTicket,
      dailyBreakdown,
      totalVehicles: exitedVehicles.length,
    };
  }, [vehicles]);

  const maxRevenue = Math.max(...stats.dailyBreakdown.map(d => d.revenue), 1);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.today.revenue)}</div>
            <p className="text-xs text-muted-foreground">{stats.today.count} veículos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Últimos 7 dias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.week.revenue)}</div>
            <p className="text-xs text-muted-foreground">{stats.week.count} veículos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Últimos 30 dias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.month.revenue)}</div>
            <p className="text-xs text-muted-foreground">{stats.month.count} veículos</p>
          </CardContent>
        </Card>
      </div>

      {/* Additional Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Car className="w-4 h-4" />
              Tempo Médio de Permanência
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgStay}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Ticket Médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.avgTicket)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Faturamento dos Últimos 7 Dias
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-end gap-2">
            {stats.dailyBreakdown.map((day, i) => {
              const height = (day.revenue / maxRevenue) * 100;
              const isCurrentDay = isToday(day.date);
              
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div className="text-xs font-medium">{formatCurrency(day.revenue)}</div>
                  <div className="w-full h-48 bg-secondary rounded-t-lg overflow-hidden flex items-end">
                    <div 
                      className={`w-full transition-all duration-500 rounded-t-lg ${
                        isCurrentDay ? 'bg-primary' : 'bg-primary/60'
                      }`}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {day.date.toLocaleDateString('pt-BR', { weekday: 'short' })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {day.vehicles} veíc.
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
