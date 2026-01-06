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
import { PlateInput } from '@/components/parking/PlateInput';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/parking-utils';
import { Car, DollarSign, LogIn, LogOut, ParkingCircle } from 'lucide-react';
import { Vehicle } from '@/types/parking';

const Index = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
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
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
              <StatCard
                title="Veículos Estacionados"
                value={stats.occupiedSpots}
                subtitle={`de ${settings.totalSpots} vagas`}
                icon={Car}
                variant="primary"
              />
              <StatCard
                title="Vagas Disponíveis"
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
            <div className="flex gap-4">
              <Button size="lg" onClick={() => setEntryOpen(true)} className="flex-1">
                <LogIn className="w-5 h-5 mr-2" />
                Registrar Entrada
              </Button>
              <Button size="lg" variant="outline" onClick={() => setExitOpen(true)} className="flex-1">
                <LogOut className="w-5 h-5 mr-2" />
                Registrar Saída
              </Button>
            </div>

            {/* Last Read Plate - Área para câmera em tempo real */}
            <div className="p-6 bg-card rounded-xl border-2 border-border">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Última Placa Lida (Câmera)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Área da imagem da placa - será preenchida pelo Python */}
                <div className="relative aspect-video bg-muted rounded-lg overflow-hidden border-2 border-dashed border-border flex items-center justify-center">
                  {plateImageUrl ? (
                    <img 
                      src={plateImageUrl} 
                      alt="Imagem da placa" 
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center text-muted-foreground p-4">
                      <Car className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Aguardando imagem da câmera...</p>
                      <p className="text-xs mt-1">O Python enviará a imagem aqui</p>
                    </div>
                  )}
                </div>
                
                {/* Placa detectada e entrada manual */}
                <div className="space-y-4">
                  <PlateDisplay plate={lastReadPlate || '---'} size="xl" variant={lastReadPlate ? 'highlight' : 'default'} />
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Entrada Manual / Correção:</label>
                    <PlateInput
                      value={lastReadPlate}
                      onChange={setLastReadPlate}
                      placeholder="Digite a placa..."
                    />
                  </div>
                  {lastReadPlate && (
                    <Button 
                      className="w-full" 
                      onClick={() => setEntryOpen(true)}
                    >
                      <LogIn className="w-4 h-4 mr-2" />
                      Registrar Esta Placa
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Parked Vehicles */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Veículos Estacionados ({parkedVehicles.length})</h3>
              {parkedVehicles.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  Nenhum veículo estacionado no momento
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
            <h2 className="text-2xl font-bold mb-6">Registrar Entrada</h2>
            <EntryDialog open onOpenChange={() => setActiveTab('dashboard')} onConfirm={registerEntry} lastReadPlate={lastReadPlate} settings={settings} />
          </div>
        );

      case 'exit':
        return (
          <div className="max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-6">Registrar Saída</h2>
            <ExitDialog open onOpenChange={() => setActiveTab('dashboard')} onConfirm={registerExit} findVehicle={findVehicleByPlate} pricing={settings.pricing} settings={settings} />
          </div>
        );

      case 'reports':
        return (
          <div>
            <h2 className="text-2xl font-bold mb-6">Relatórios</h2>
            <ReportsPanel vehicles={vehicles} />
          </div>
        );

      case 'history':
        return (
          <div>
            <h2 className="text-2xl font-bold mb-6">Histórico de Veículos</h2>
            <HistoryTable getHistory={getHistory} settings={settings} />
          </div>
        );

      case 'settings':
        return (
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold mb-6">Configurações</h2>
            <SettingsPanel settings={settings} onUpdateSettings={updateSettings} onUpdatePricing={updatePricing} />
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
      />
      
      <main className="flex-1 p-8 overflow-auto">
        {renderContent()}
      </main>

      <EntryDialog open={entryOpen} onOpenChange={setEntryOpen} onConfirm={registerEntry} lastReadPlate={lastReadPlate} plateImageUrl={plateImageUrl} settings={settings} />
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