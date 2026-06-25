import { useState, useEffect, lazy, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { useParking } from '@/hooks/useParking';
import { Sidebar } from '@/components/parking/Sidebar';
import { StatCard } from '@/components/parking/StatCard';
import { PlateDisplay } from '@/components/parking/PlateDisplay';
import { VehicleCard } from '@/components/parking/VehicleCard';
import { EntryDialog } from '@/components/parking/EntryDialog';
import { ExitDialog } from '@/components/parking/ExitDialog';
import { PlateInput } from '@/components/parking/PlateInput';

// Telas secundárias carregadas sob demanda (code-splitting) — só baixam
// quando o operador abre a aba, deixando o dashboard inicial mais leve.
const HistoryTable = lazy(() =>
  import('@/components/parking/HistoryTable').then(m => ({ default: m.HistoryTable })));
const SettingsPanel = lazy(() =>
  import('@/components/parking/SettingsPanel').then(m => ({ default: m.SettingsPanel })));
const ReportsPanel = lazy(() =>
  import('@/components/parking/ReportsPanel').then(m => ({ default: m.ReportsPanel })));
const CameraPanel = lazy(() =>
  import('@/components/parking/CameraPanel').then(m => ({ default: m.CameraPanel })));
const PriceModulesPanel = lazy(() =>
  import('@/components/parking/PriceModulesPanel').then(m => ({ default: m.PriceModulesPanel })));
import { Button } from '@/components/ui/button';
import { formatCurrency, formatPlate, formatTime } from '@/lib/parking-utils';
import { Car, DollarSign, LogIn, LogOut, ParkingCircle, Menu, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Vehicle } from '@/types/parking';

interface PlateRead {
  id: string;
  plate: string;       // placa digitada pelo operador (começa vazia no modo só-foto)
  imageUrl?: string;
  at: Date;
}

// Quantas leituras recentes ficam disponíveis no seletor (apenas em memória)
const MAX_RECENT_READS = 3;

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
  // Leituras recentes (foto + placa) ficam só em memória — leves e descartáveis.
  // selectedReadIndex aponta qual leitura está em foco no card (0 = mais recente).
  const [recentPlates, setRecentPlates] = useState<PlateRead[]>([]);
  const [selectedReadIndex, setSelectedReadIndex] = useState(0);

  const selectedRead: PlateRead | undefined = recentPlates[selectedReadIndex];
  const lastReadPlate = selectedRead?.plate ?? '';
  const plateImageUrl = selectedRead?.imageUrl;

  // Adiciona uma leitura nova (vinda da câmera) ao topo do seletor.
  const pushPlateRead = (plate: string, imageUrl?: string) => {
    const normalized = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Precisa de pelo menos uma placa válida OU uma foto.
    if (normalized.length < 6 && !imageUrl) return;
    setRecentPlates(prev => {
      // Não duplica se a leitura mais recente já é a mesma foto/placa.
      const newest = prev[0];
      if (newest && newest.imageUrl === imageUrl && newest.plate === normalized) return prev;
      const entry: PlateRead = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        plate: normalized,
        imageUrl,
        at: new Date(),
      };
      return [entry, ...prev].slice(0, MAX_RECENT_READS);
    });
    setSelectedReadIndex(0); // foca a leitura nova, mas o operador pode voltar
  };

  // Atualiza a placa digitada da leitura em foco (ou cria uma manual se não houver).
  const setLastReadPlate = (val: string) => {
    setRecentPlates(prev => {
      if (prev.length === 0) {
        return [{
          id: `${Date.now()}-manual`,
          plate: val,
          imageUrl: undefined,
          at: new Date(),
        }];
      }
      return prev.map((r, i) => (i === selectedReadIndex ? { ...r, plate: val } : r));
    });
  };

  // ── Supabase Realtime — recebe placas do Python em tempo real ────────────
  useEffect(() => {
    if (!supabase) return;
    const client = supabase; // captura para o closure de cleanup (TS narrowing)

    const channel = client
      .channel('plate_reads_live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'plate_reads' },
        (payload) => {
          const row = payload.new as { plate?: string; image_url?: string };
          // Fluxo "foto + digitação manual": a câmera pode mandar só a foto.
          // Cada leitura entra no seletor; o operador navega e digita a placa.
          if (!row.plate && !row.image_url) return;
          pushPlateRead(row.plate ?? '', row.image_url ?? undefined);
        }
      )
      .subscribe();

    return () => { client.removeChannel(channel); };
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
              selectedRead ? 'border-primary/60 bg-primary/5' : 'border-border'
            }`}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">Leitura de Placa (Câmera)</h3>
                {selectedRead && selectedReadIndex === 0 && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium animate-pulse">
                    Nova leitura
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Foto da placa + seletor das últimas leituras */}
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

                  {/* Navegação entre as últimas leituras (só aparece com 2+) */}
                  {recentPlates.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label="Foto mais recente"
                        disabled={selectedReadIndex === 0}
                        onClick={() => setSelectedReadIndex(i => Math.max(0, i - 1))}
                        className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/55 text-white hover:bg-black/75 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Foto anterior"
                        disabled={selectedReadIndex >= recentPlates.length - 1}
                        onClick={() => setSelectedReadIndex(i => Math.min(recentPlates.length - 1, i + 1))}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/55 text-white hover:bg-black/75 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/55 text-white text-[11px] font-medium">
                        {selectedReadIndex === 0 ? 'Mais recente' : `${selectedReadIndex + 1}ª anterior`}
                        <span className="opacity-70">· {selectedReadIndex + 1}/{recentPlates.length}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Placa atual + entrada */}
                <div className="space-y-3">
                  <PlateDisplay plate={lastReadPlate || '---'} size="xl" variant={lastReadPlate ? 'highlight' : 'default'} />
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Entrada manual / correção:</label>
                    <PlateInput
                      value={lastReadPlate}
                      onChange={setLastReadPlate}
                      placeholder="Digite a placa…"
                    />
                  </div>
                  {selectedRead && (
                    <Button
                      size="lg"
                      className="w-full text-base font-bold shadow-md"
                      onClick={() => setEntryOpen(true)}
                    >
                      <LogIn className="w-5 h-5 mr-2" />
                      {lastReadPlate ? `Dar Entrada — ${lastReadPlate}` : 'Dar Entrada (digitar placa)'}
                    </Button>
                  )}
                </div>
              </div>

              {/* Seletor das últimas leituras (em memória) */}
              {recentPlates.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Últimas leituras (clique para selecionar):
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {recentPlates.map((read, i) => (
                      <div
                        key={read.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedReadIndex(i)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedReadIndex(i); }}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          i === selectedReadIndex
                            ? 'bg-primary/10 border-primary'
                            : 'bg-muted/60 border-border hover:border-primary/40'
                        }`}
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
                          <p className={`font-mono font-bold text-base tracking-widest truncate ${
                            read.plate ? '' : 'text-muted-foreground italic font-normal text-sm tracking-normal'
                          }`}>
                            {read.plate ? formatPlate(read.plate) : 'Aguardando placa…'}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedReadIndex(i);
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
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-24 text-muted-foreground gap-3">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Carregando…
                </div>
              }
            >
              {renderContent()}
            </Suspense>
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
