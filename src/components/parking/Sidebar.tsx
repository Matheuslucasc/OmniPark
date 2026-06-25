import { Car, LogIn, LogOut, History, Settings, BarChart3, Camera, X, Menu, Power, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  occupiedSpots: number;
  totalSpots: number;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function LogoutButton() {
  const { signOut, user } = useAuth();
  if (!user) return null;
  return (
    <button
      type="button"
      onClick={signOut}
      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
    >
      <Power className="w-4 h-4 shrink-0" />
      <span className="truncate">{user.email}</span>
    </button>
  );
}

const menuItems = [
  { id: 'dashboard',  label: 'Dashboard',     icon: Car       },
  { id: 'entry',      label: 'Entrada',        icon: LogIn     },
  { id: 'exit',       label: 'Saída',          icon: LogOut    },
  { id: 'reports',    label: 'Relatórios',     icon: BarChart3 },
  { id: 'history',    label: 'Histórico',      icon: History   },
  { id: 'tarifas',    label: 'Tarifas',        icon: Tag       },
  { id: 'cameras',    label: 'Câmeras',        icon: Camera    },
  { id: 'settings',   label: 'Configurações',  icon: Settings  },
];

export function Sidebar({ activeTab, onTabChange, occupiedSpots, totalSpots, mobileOpen, onMobileClose }: SidebarProps) {
  const occupancyPercent = Math.round((occupiedSpots / Math.max(totalSpots, 1)) * 100);

  const handleTabChange = (tab: string) => {
    onTabChange(tab);
    onMobileClose();
  };

  const content = (
    <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col h-full no-print">
      {/* Logo */}
      <div className="p-5 border-b border-sidebar-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-sidebar-primary rounded-lg">
            <Car className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight">OmniPark</h1>
            <p className="text-xs text-sidebar-foreground/60">Sistema de Estacionamento</p>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          type="button"
          className="md:hidden p-1 rounded hover:bg-sidebar-accent transition-colors"
          onClick={onMobileClose}
          aria-label="Fechar menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Occupancy */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="text-xs text-sidebar-foreground/60 mb-1">Ocupação</div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-2xl font-bold">{occupiedSpots}</span>
          <span className="text-sm text-sidebar-foreground/60">/ {totalSpots} vagas</span>
        </div>
        <div className="h-2 bg-sidebar-accent rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full origin-left transition-all duration-500',
              occupancyPercent > 80 ? 'bg-destructive' :
              occupancyPercent > 50 ? 'bg-warning' : 'bg-accent'
            )}
            style={{ transform: `scaleX(${occupancyPercent / 100})` }}
          />
        </div>
        <div className="text-xs text-sidebar-foreground/50 mt-1 text-right">{occupancyPercent}%</div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {menuItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleTabChange(item.id)}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm',
              activeTab === item.id
                ? 'bg-sidebar-primary text-sidebar-primary-foreground font-semibold'
                : 'hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground'
            )}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Footer / logout */}
      <div className="p-3 border-t border-sidebar-border">
        <LogoutButton />
        <div className="text-xs text-sidebar-foreground/30 text-center mt-2">OmniPark v1.0</div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar — always visible on md+ */}
      <div className="hidden md:flex md:flex-col md:h-screen md:sticky md:top-0 shrink-0">
        {content}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          {/* Drawer */}
          <div className="relative z-10 h-full">
            {content}
          </div>
        </div>
      )}
    </>
  );
}

export { Menu };
