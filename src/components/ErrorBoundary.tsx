import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Eraser } from 'lucide-react';

// Chaves de dados TEMPORÁRIOS deste aparelho (fila de impressão, preferências).
// Nunca inclui os veículos/configurações do modo local — só o que é seguro apagar.
const CHAVES_TEMPORARIAS = ['parking_pending_prints', 'parking_last_tariff'];

interface State { error: Error | null }

/**
 * Se qualquer tela quebrar, mostra uma tela de recuperação em vez de deixar o
 * operador com a página em branco (que antes persistia mesmo recarregando, se
 * a causa fosse um dado salvo no aparelho).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[OmniPark] Erro na tela:', error, info.componentStack);
  }

  private limparTemporarios = () => {
    try {
      CHAVES_TEMPORARIAS.forEach(k => localStorage.removeItem(k));
      Object.keys(localStorage)
        .filter(k => k.startsWith('omnipark:hidden:'))
        .forEach(k => localStorage.removeItem(k));
    } catch { /* sem acesso ao storage */ }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-xl border-2 border-destructive/30 bg-card p-6 space-y-4 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-destructive" />
          <div>
            <h1 className="text-lg font-bold">Algo deu errado nesta tela</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Os dados do estacionamento estão seguros. Tente recarregar; se o erro voltar,
              limpe os dados temporários deste aparelho.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 inline-flex items-center justify-center h-10 rounded-md bg-primary text-primary-foreground font-medium"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Recarregar
            </button>
            <button
              type="button"
              onClick={this.limparTemporarios}
              className="flex-1 inline-flex items-center justify-center h-10 rounded-md border font-medium"
            >
              <Eraser className="w-4 h-4 mr-2" />
              Limpar temporários
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground break-words">{this.state.error.message}</p>
        </div>
      </div>
    );
  }
}
