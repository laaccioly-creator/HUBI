import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw, Home, ShoppingCart } from 'lucide-react';
import { logger } from '../../services/loggerService';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitulo?: string;
  origem?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

let handlersGlobaisIniciados = false;

/**
 * Inicializa a captura global de exceções não tratadas e rejeições de promises assíncronas
 */
export function inicializarCapturaErrosGlobais(): void {
  if (handlersGlobaisIniciados || typeof window === 'undefined') return;
  handlersGlobaisIniciados = true;

  window.addEventListener('error', (event) => {
    // Ignora erros triviais de extensões de navegador
    if (event.filename && event.filename.includes('chrome-extension://')) return;

    logger.error('WindowOnError', 'unhandled_script_error', event.error || event.message, {
      stack_trace: event.error?.stack || null,
      rota_url: window.location.pathname + window.location.search,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logger.error('UnhandledRejection', 'unhandled_promise_rejection', event.reason, {
      rota_url: window.location.pathname + window.location.search,
    });
  });
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.fatal(
      this.props.origem || 'ErrorBoundary',
      'react_component_crash',
      error,
      {
        stack_trace: errorInfo.componentStack || error.stack || null,
        rota_url: typeof window !== 'undefined' ? window.location.pathname : null,
      }
    );
  }

  private handleTentarNovamente = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleIrParaPdv = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== 'undefined') {
      window.location.href = '/pos';
    }
  };

  private handleRecarregar = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      const mensagemAmigavel =
        this.state.error?.message || 'Ocorreu um erro inesperado na renderização desta interface.';

      return (
        <div className="min-h-[350px] w-full flex items-center justify-center p-4 sm:p-6 bg-slate-950 text-slate-100 rounded-3xl border border-slate-800 shadow-2xl my-4">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 shadow-lg shadow-rose-500/10">
              <AlertOctagon className="w-8 h-8 animate-pulse" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl font-black text-white tracking-tight">
                {this.props.fallbackTitulo || 'Ops! Algo deu errado nesta tela'}
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                A ocorrência foi registrada automaticamente para diagnóstico da equipe técnica.
                Seus dados locais de caixa e carrinho permanecem preservados.
              </p>
            </div>

            {import.meta.env.DEV && (
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-left overflow-x-auto text-[11px] text-rose-300 font-mono max-h-32">
                {mensagemAmigavel}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleTentarNovamente}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Tentar Novamente</span>
              </button>

              <button
                type="button"
                onClick={this.handleIrParaPdv}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition active:scale-95 shadow-lg shadow-emerald-600/20 cursor-pointer"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Ir para o PDV</span>
              </button>
            </div>

            <button
              type="button"
              onClick={this.handleRecarregar}
              className="text-[11px] text-slate-500 hover:text-slate-300 underline underline-offset-2 transition cursor-pointer"
            >
              Recarregar aplicação por completo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
