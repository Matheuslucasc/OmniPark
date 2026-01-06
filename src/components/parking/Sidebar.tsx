import { Car, LogIn, LogOut, History, Settings, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  occupiedSpots: number;
  totalSpots: number;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Car },
  { id: 'entry', label: 'Entrada', icon: LogIn },
  { id: 'exit', label: 'Saída', icon: LogOut },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'history', label: 'Histórico', icon: History },
  { id: 'settings', label: 'Configurações', icon: Settings },
];

export function Sidebar({ activeTab, onTabChange, occupiedSpots, totalSpots }: SidebarProps) {
  const occupancyPercent = Math.round((occupiedSpots / totalSpots) * 100);
  
  return (
    <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col h-screen no-print">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-sidebar-primary rounded-lg">
            <Car className="w-6 h-6 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-lg">ParkFlow</h1>
            <p className="text-xs text-sidebar-foreground/60">Sistema de Estacionamento</p>
          </div>
        </div>
      </div>

      {/* Occupancy indicator */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="text-xs text-sidebar-foreground/60 mb-2">Ocupação</div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-2xl font-bold">{occupiedSpots}</span>
          <span className="text-sidebar-foreground/60">/ {totalSpots} vagas</span>
        </div>
        <div className="h-2 bg-sidebar-accent rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full transition-all duration-500",
              occupancyPercent > 80 ? "bg-destructive" : 
              occupancyPercent > 50 ? "bg-warning" : "bg-accent"
            )}
            style={{ width: `${occupancyPercent}%` }}
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
              activeTab === item.id
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground"
            )}
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border text-xs text-sidebar-foreground/40 text-center">
        ParkFlow v1.0
      </div>
    </aside>
  );
}
