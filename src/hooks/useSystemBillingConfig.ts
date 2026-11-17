import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SystemBillingValues } from '../lib/validations';
import { configuracoesPlataformaService } from '../services/configuracoesPlataformaService';

export interface UseSystemBillingConfigReturn extends SystemBillingValues {
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly recarregar: () => Promise<void>;
}

const VALORES_INICIAIS_VAZIOS: SystemBillingValues = {
  valorMensalAnual: 0,
  valorTotalAnual: 0,
  valorMensalAvulso: 0,
  maxParcelas: 0,
  parcelasSemJuros: 0,
  descontoPix: 0,
  aceitaCartaoDebito: false,
  diasTrial: 0,
};

interface BillingHookState {
  readonly values: SystemBillingValues;
  readonly isLoading: boolean;
  readonly error: string | null;
}

/**
 * Hook centralizador de leitura dos parâmetros comerciais de assinatura e condições de pagamento.
 * Nunca expõe valores financeiros antigos/chumbados enquanto `isLoading` for `true`.
 */
export function useSystemBillingConfig(): UseSystemBillingConfigReturn {
  const [estado, setEstado] = useState<BillingHookState>(() => {
    const emCache = configuracoesPlataformaService.obterCacheConfiguracaoCobranca();
    if (emCache) {
      return { values: emCache, isLoading: false, error: null };
    }
    return { values: VALORES_INICIAIS_VAZIOS, isLoading: true, error: null };
  });

  const carregar = useCallback(async (forcarAtualizacao = false): Promise<void> => {
    if (forcarAtualizacao || !configuracoesPlataformaService.obterCacheConfiguracaoCobranca()) {
      setEstado((prev) => ({ ...prev, isLoading: true, error: null }));
    }

    const resultado = await configuracoesPlataformaService.obterConfiguracaoCobranca(forcarAtualizacao);
    if (resultado.ok) {
      setEstado({ values: resultado.data, isLoading: false, error: null });
    } else {
      setEstado({
        values: VALORES_INICIAIS_VAZIOS,
        isLoading: false,
        error: resultado.error.mensagem,
      });
    }
  }, []);

  useEffect(() => {
    let ativo = true;

    const executarLeitura = async (forcarAtualizacao: boolean) => {
      if (forcarAtualizacao || !configuracoesPlataformaService.obterCacheConfiguracaoCobranca()) {
        if (ativo) {
          setEstado((prev) => ({ ...prev, isLoading: true, error: null }));
        }
      }
      const resultado = await configuracoesPlataformaService.obterConfiguracaoCobranca(forcarAtualizacao);
      if (!ativo) return;

      if (resultado.ok) {
        setEstado({ values: resultado.data, isLoading: false, error: null });
      } else {
        setEstado({
          values: VALORES_INICIAIS_VAZIOS,
          isLoading: false,
          error: resultado.error.mensagem,
        });
      }
    };

    void executarLeitura(false);

    const cancelarAssinaturaConfig = configuracoesPlataformaService.assinarAtualizacoesConfiguracaoCobranca(() => {
      void executarLeitura(true);
    });

    const { data: authSubscription } = supabase.auth.onAuthStateChange((evento) => {
      if (!ativo) return;
      if (evento === 'SIGNED_OUT') {
        configuracoesPlataformaService.limparCacheConfiguracaoCobranca();
        setEstado({ values: VALORES_INICIAIS_VAZIOS, isLoading: false, error: null });
        return;
      }
      if (evento === 'SIGNED_IN' || evento === 'TOKEN_REFRESHED') {
        void executarLeitura(true);
      }
    });

    return () => {
      ativo = false;
      cancelarAssinaturaConfig();
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  const recarregar = useCallback(async () => {
    await carregar(true);
  }, [carregar]);

  return {
    ...estado.values,
    isLoading: estado.isLoading,
    error: estado.error,
    recarregar,
  };
}
