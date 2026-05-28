import { useState } from 'react';
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
import { PlateInput } from '@/components/parking/PlateInput';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/parking-utils';
import { Car, DollarSign, LogIn, LogOut, ParkingCircle, Menu } from 'lucide-react';
import { Vehicle } from '@/types/parking';

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  entry:     'Registrar Entrada',
  exit:      'Registrar Saída',
  reports:   'Relatórios',
  history:   'Histórico',
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

  const {
    vehicles,
    parkedVehicles,
    settings,
    stats,
    registerEntry,
    registerExit,
    findVehicleByPlate,
    getHistory,
    updateSettings,
    updatePricing,
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
            <div className="p-4 sm:p-6 bg-card rounded-xl border-2 border-border">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Última Placa Lida (Câmera)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative aspect-video bg-muted rounded-lg overflow-hidden border-2 border-dashed border-border flex items-center justify-center">
                  {plateImageUrl ? (
                    <img
                      src={plateImageUrl}
                      alt="Imagem da placa"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center text-muted-foreground p-4">
                      <Car className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Aguardando imagem da câmera…</p>
                      <p className="text-xs mt-1 opacity-70">Configure câmeras na aba Câmeras</p>
                    </div>
                  )}
                </div>

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
                  {lastReadPlate && (
                    <Button className="w-full" onClick={() => setEntryOpen(true)}>
                      <LogIn className="w-4 h-4 mr-2" />
                      Registrar Esta Placa
                    </Button>
                  )}
                </div>
              </div>
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
        return <HistoryTable getHistory={getHistory} settings={settings} />;

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
          {renderContent()}
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
