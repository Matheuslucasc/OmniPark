import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParking } from '@/hooks/useParking';
import { Sidebar } from '@/components/parking/Sidebar';
import { StatCard } from '@/components/parking/StatCard';
import { PlateDisplay } from '@/components/parking/PlateDisplay';
import { VehicleCard } from '@/components/parking/VehicleCard';
import { EntryDialog } from '@/components/parking/EntryDialog';
import { ExitDialog } from '@/components/parking/ExitDialog';
import { HistoryTable } from '@/components/parking/HistoryTable';
import { SettingsPanel } from '@/components/parking/SettingsPanel';
import { ReportsPanel } from '@/components/parking/ReportsPanel';
import { CameraPanel } from '@/components/parking/CameraPanel';
import { PriceModulesPanel } from '@/components/parking/PriceModulesPanel';
import { PlateInput } from '@/components/parking/PlateInput';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatPlate, formatTime } from '@/lib/parking-utils';
import { Car, DollarSign, LogIn, LogOut, ParkingCircle, Menu, Clock } from 'lucide-react';
import { Vehicle } from '@/types/parking';

interface PlateRead {
  plate: string;
  imageUrl?: string;
  at: Date;
}

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  entry:     'Registrar Entrada',
  exit:      'Registrar Saída',
  reports:   'Relatórios',
  history:   'Histórico',
  tarifas:   'Tarifas Especiais',
  cameras:   'Câmeras',
  settings:  'Configurações',
};

const Index = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [lastReadPlate, setLastReadPlate] = useState('');
  const [plateImageUrl, setPlateImageUrl] = useState<string | undefined>();
  const [recentPlates, setRecentPlates] = useState<PlateRead[]>([]);

  const pushPlateRead = (plate: string, imageUrl?: string) => {
    const normalized = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (normalized.length < 6) return;
    setRecentPlates(prev => {
      // não duplica se a placa mais recente for a mesma
      if (prev[0]?.plate === normalized) return prev;
      return [{ plate: normalized, imageUrl, at: new Date() }, ...prev].slice(0, 2);
    });
  };

  // ── Supabase Realtime — recebe placas do Python em tempo real ────────────
  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel('plate_reads_live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'plate_reads' },
        (payload) => {
          const row = payload.new as { plate: string; image_url?: string };
          if (!row.plate) return;
          setLastReadPlate(row.plate);
          setPlateImageUrl(row.image_url ?? undefined);
          pushPlateRead(row.plate, row.image_url ?? undefined);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    vehicles,
    parkedVehicles,
    settings,
    stats,
    isLoading,
    registerEntry,
    registerExit,
    findVehicleByPlate,
    getHistory,
    updateSettings,
    updatePricing,
    deleteVehicle,
  } = useParking();

  const handleVehicleExit = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setExitOpen(true);
  };

  const renderContent = () => {
    switch (activeTab) {

      case 'dashboard':
        return (
          <div className="space-y-5">
            {/* Stats grid */}
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Estacionados"
                value={stats.occupiedSpots}
                subtitle={`de ${settings.totalSpots} vagas`}
                icon={Car}
                variant="primary"
              />
              <StatCard
                title="Disponíveis"
                value={stats.availableSpots}
                icon={ParkingCircle}
                variant="success"
              />
              <StatCard
                title="Faturamento Hoje"
                value={formatCurrency(stats.todayRevenue)}
                icon={DollarSign}
              />
              <StatCard
                title="Veículos Hoje"
                value={stats.todayVehicles}
                icon={Car}
              />
            </div>

            {/* Quick Actions */}
            <div className="flex gap-3">
              <Button size="lg" onClick={() => setEntryOpen(true)} className="flex-1">
                <LogIn className="w-5 h-5 mr-2" />
                <span className="hidden sm:inline">Registrar </span>Entrada
              </Button>
              <Button size="lg" variant="outline" onClick={() => setExitOpen(true)} className="flex-1">
                <LogOut className="w-5 h-5 mr-2" />
                <span className="hidden sm:inline">Registrar </span>Saída
              </Button>
            </div>

            {/* Camera read area */}
            <div className={`p-4 sm:p-6 bg-card rounded-xl border-2 space-y-4 transition-colors ${
              lastReadPlate ? 'border-primary/60 bg-primary/5' : 'border-border'
            }`}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">Leitura de Placa (Câmera)</h3>
                {lastReadPlate && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium animate-pulse">
                    Nova leitura
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Foto da placa */}
                <div className="relative aspect-video bg-muted rounded-lg overflow-hidden border-2 border-dashed border-border flex items-center justify-center">
                  {plateImageUrl ? (
                    <img
                      src={plateImageUrl}
                      alt="Foto da placa"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center text-muted-foreground p-4">
                      <Car className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Aguardando foto da câmera…</p>
                      <p className="text-xs mt-1 opacity-70">O Python enviará a foto aqui</p>
                    </div>
                  )}
                </div>

                {/* Placa atual + entrada */}
                <div className="space-y-3">
                  <PlateDisplay plate={lastReadPlate || '---'} size="xl" variant={lastReadPlate ? 'highlight' : 'default'} />
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Entrada manual / correção:</label>
                    <PlateInput
                      value={lastReadPlate}
                      onChange={(val) => {
                        setLastReadPlate(val);
                        pushPlateRead(val, plateImageUrl);
                      }}
                      placeholder="Digite a placa…"
                    />
                  </div>
                  {lastReadPlate && (
                    <Button
                      size="lg"
                      className="w-full text-base font-bold shadow-md"
                      onClick={() => setEntryOpen(true)}
                    >
                      <LogIn className="w-5 h-5 mr-2" />
                      Dar Entrada — {lastReadPlate}
                    </Button>
                  )}
                </div>
              </div>

              {/* Últimas 2 placas lidas */}
              {recentPlates.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Últimas placas lidas:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {recentPlates.map((read, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-3 bg-muted/60 rounded-lg border border-border hover:border-primary/40 transition-colors"
                      >
                        {/* Miniatura da imagem ou ícone */}
                        <div className="w-16 h-10 rounded overflow-hidden bg-background border border-border shrink-0 flex items-center justify-center">
                          {read.imageUrl ? (
                            <img src={read.imageUrl} alt="placa" className="w-full h-full object-contain" />
                          ) : (
                            <Car className="w-5 h-5 text-muted-foreground opacity-50" />
                          )}
                        </div>

                        {/* Placa + horário */}
                        <div className="flex-1 min-w-0">
                          <p className="font-mono font-bold text-base tracking-widest truncate">
                            {formatPlate(read.plate)}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {formatTime(read.at)}
                          </p>
                        </div>

                        {/* Botão rápido */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => {
                            setLastReadPlate(read.plate);
                            setEntryOpen(true);
                          }}
                        >
                          <LogIn className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Parked vehicles */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-3">
                Veículos Estacionados ({parkedVehicles.length})
              </h3>
              {parkedVehicles.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm border-2 border-dashed rounded-xl">
                  Nenhum veículo estacionado no momento
                </div>
              ) : (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                  {parkedVehicles.slice(0, 9).map(vehicle => (
                    <VehicleCard key={vehicle.id} vehicle={vehicle} onExit={handleVehicleExit} />
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case 'entry':
        return (
          <div className="max-w-md mx-auto">
            <EntryDialog
              open
              onOpenChange={() => setActiveTab('dashboard')}
              onConfirm={registerEntry}
              lastReadPlate={lastReadPlate}
              settings={settings}
            />
          </div>
        );

      case 'exit':
        return (
          <div className="max-w-md mx-auto">
            <ExitDialog
              open
              onOpenChange={() => setActiveTab('dashboard')}
              onConfirm={registerExit}
              findVehicle={findVehicleByPlate}
              pricing={settings.pricing}
              settings={settings}
            />
          </div>
        );

      case 'reports':
        return <ReportsPanel vehicles={vehicles} />;

      case 'history':
        return <HistoryTable getHistory={getHistory} onDelete={deleteVehicle} settings={settings} />;

      case 'tarifas':
        return <PriceModulesPanel defaultPricing={settings.pricing} />;

      case 'cameras':
        return <CameraPanel />;

      case 'settings':
        return (
          <div className="max-w-2xl">
            <SettingsPanel
              settings={settings}
              onUpdateSettings={updateSettings}
              onUpdatePricing={updatePricing}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        occupiedSpots={stats.occupiedSpots}
        totalSpots={settings.totalSpots}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b bg-background sticky top-0 z-40 no-print">
          <button
            type="button"
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="font-semibold text-base truncate">{pageTitles[activeTab] ?? 'OmniPark'}</h2>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          {/* Desktop page title */}
          <h2 className="hidden md:block text-2xl font-bold mb-6">{pageTitles[activeTab]}</h2>
          {isLoading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground gap-3">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Carregando dados do banco…
            </div>
          ) : (
            renderContent()
          )}
        </main>
      </div>

      <EntryDialog
        open={entryOpen}
        onOpenChange={setEntryOpen}
        onConfirm={registerEntry}
        lastReadPlate={lastReadPlate}
        plateImageUrl={plateImageUrl}
        settings={settings}
      />
      <ExitDialog
        open={exitOpen}
        onOpenChange={(open) => {
          setExitOpen(open);
          if (!open) setSelectedVehicle(null);
        }}
        onConfirm={registerExit}
        findVehicle={findVehicleByPlate}
        pricing={settings.pricing}
        settings={settings}
        preSelectedVehicle={selectedVehicle}
      />
    </div>
  );
};

export default Index;
