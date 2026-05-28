import { useAuth } from '@/hooks/useAuth';
import Login from '@/pages/Login';
import { Car } from 'lucide-react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="p-3 bg-primary/10 rounded-xl">
          <Car className="w-8 h-8 text-primary" />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Carregando…
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' || status === 'pending_approval') {
    return <Login />;
  }

  return <>{children}</>;
}
