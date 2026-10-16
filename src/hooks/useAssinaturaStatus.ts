import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Loja } from '../types';
import { obterDataOperacao } from '../utils/dataOperacao';

export type StatusCicloAssinatura =
  | 'TRIAL_ATIVO'
  | 'ANUIDADE_ATIVA'
  | 'ALERTA_RENOVACAO'
  | 'BLOQUEADO';

export interface AlertaLojaConglomerado {
  lojaId: string;
  nomeLoja: string;
  tipo: 'trial' | 'renovacao' | 'bloqueado';
  diasRestantes: number;
}

export interface UseAssinaturaStatusReturn {
  status: StatusCicloAssinatura;
  diasRestantesTrial: number;
  diasRestantesAnuidade: number;
  estaBloqueada: boolean;
  deveExibirBanner: boolean;
  tipoBanner: 'trial' | 'renovacao' | 'nenhum';
  lojasEmAlerta: AlertaLojaConglomerado[];
  lojasBloqueadas: AlertaLojaConglomerado[];
  iniciarCheckoutAssinatura: (lojaAlvoId?: string) => Promise<void>;
  carregandoCheckout: boolean;
  erroCheckout: string | null;
}

/**
 * Hook centralizador do ciclo de vida de assinaturas por loja e do conglomerado
 */
export function useAssinaturaStatus(): UseAssinaturaStatusReturn {
  const { loja, lojasDisponiveis, recarregarDadosLoja } = useAuth();
  const [carregandoCheckout, setCarregandoCheckout] = useState<boolean>(false);
  const [erroCheckout, setErroCheckout] = useState<string | null>(null);

  // Escuta alterações em tempo real via Supabase Realtime para a loja ativa
  useEffect(() => {
    if (!loja?.id) return;

    const channel = supabase
      .channel(`realtime:loja_assinatura_${loja.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'lojas',
          filter: `id=eq.${loja.id}`
        },
        async (payload) => {
          const novo = payload.new as Partial<Loja>;
          // Se o status da assinatura ou data de fim foi alterado (ex: confirmação de pagamento do MP)
          if (
            novo.status_assinatura !== loja.status_assinatura ||
            novo.assinatura_fim_em !== loja.assinatura_fim_em
          ) {
            console.log('[useAssinaturaStatus] Realtime: Atualização de assinatura detectada para loja:', loja.id);
            if (recarregarDadosLoja) {
              await recarregarDadosLoja();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loja?.id, loja?.status_assinatura, loja?.assinatura_fim_em, recarregarDadosLoja]);

  // Avaliação do status da loja ativa
  const calculoStatusLojaAtiva = useMemo(() => {
    if (!loja) {
      return {
        status: 'TRIAL_ATIVO' as StatusCicloAssinatura,
        diasRestantesTrial: 7,
        diasRestantesAnuidade: 365,
        estaBloqueada: false,
        deveExibirBanner: false,
        tipoBanner: 'nenhum' as const
      };
    }

    const agora = obterDataOperacao();
    const agoraMs = agora.getTime();

    // 1. Verificação de status forçado no banco
    if (loja.status_assinatura === 'bloqueado') {
      return {
        status: 'BLOQUEADO' as StatusCicloAssinatura,
        diasRestantesTrial: 0,
        diasRestantesAnuidade: 0,
        estaBloqueada: true,
        deveExibirBanner: false,
        tipoBanner: 'nenhum' as const
      };
    }

    // 2. Verificação de Anuidade Paga
    if (loja.assinatura_fim_em) {
      const fimMs = new Date(loja.assinatura_fim_em).getTime();
      const diffDias = Math.ceil((fimMs - agoraMs) / (1000 * 60 * 60 * 24));

      if (diffDias <= 0) {
        // Anuidade venceu sem renovação
        return {
          status: 'BLOQUEADO' as StatusCicloAssinatura,
          diasRestantesTrial: 0,
          diasRestantesAnuidade: 0,
          estaBloqueada: true,
          deveExibirBanner: false,
          tipoBanner: 'nenhum' as const
        };
      }

      if (diffDias <= 7) {
        // Últimos 7 dias da anuidade: régua de alerta de renovação
        return {
          status: 'ALERTA_RENOVACAO' as StatusCicloAssinatura,
          diasRestantesTrial: 0,
          diasRestantesAnuidade: diffDias,
          estaBloqueada: false,
          deveExibirBanner: true,
          tipoBanner: 'renovacao' as const
        };
      }

      // Anuidade ativa com mais de 7 dias
      return {
        status: 'ANUIDADE_ATIVA' as StatusCicloAssinatura,
        diasRestantesTrial: 0,
        diasRestantesAnuidade: diffDias,
        estaBloqueada: false,
        deveExibirBanner: false,
        tipoBanner: 'nenhum' as const
      };
    }

    // 3. Verificação de Período Trial (Degustação de 7 dias)
    if (loja.trial_fim_em) {
      const trialMs = new Date(loja.trial_fim_em).getTime();
      const diffTrialDias = Math.ceil((trialMs - agoraMs) / (1000 * 60 * 60 * 24));

      if (diffTrialDias <= 0) {
        // Trial expirou
        return {
          status: 'BLOQUEADO' as StatusCicloAssinatura,
          diasRestantesTrial: 0,
          diasRestantesAnuidade: 0,
          estaBloqueada: true,
          deveExibirBanner: false,
          tipoBanner: 'nenhum' as const
        };
      }

      // Em período de trial
      return {
        status: 'TRIAL_ATIVO' as StatusCicloAssinatura,
        diasRestantesTrial: Math.max(1, diffTrialDias),
        diasRestantesAnuidade: 0,
        estaBloqueada: false,
        deveExibirBanner: true,
        tipoBanner: 'trial' as const
      };
    }

    // Fallback padrão seguro para novas lojas sem coluna preenchida
    return {
      status: 'TRIAL_ATIVO' as StatusCicloAssinatura,
      diasRestantesTrial: 7,
      diasRestantesAnuidade: 0,
      estaBloqueada: false,
      deveExibirBanner: true,
      tipoBanner: 'trial' as const
    };
  }, [loja]);

  // Mapeamento dos status de todas as lojas do conglomerado para alertas globais
  const { lojasEmAlerta, lojasBloqueadas } = useMemo(() => {
    const alertas: AlertaLojaConglomerado[] = [];
    const bloqueadas: AlertaLojaConglomerado[] = [];
    const agora = obterDataOperacao();
    const agoraMs = agora.getTime();

    lojasDisponiveis.forEach((l) => {
      if (l.status_assinatura === 'bloqueado') {
        bloqueadas.push({
          lojaId: l.id,
          nomeLoja: l.nome_fantasia,
          tipo: 'bloqueado',
          diasRestantes: 0
        });
        return;
      }

      if (l.assinatura_fim_em) {
        const fimMs = new Date(l.assinatura_fim_em).getTime();
        const diff = Math.ceil((fimMs - agoraMs) / (1000 * 60 * 60 * 24));
        if (diff <= 0) {
          bloqueadas.push({
            lojaId: l.id,
            nomeLoja: l.nome_fantasia,
            tipo: 'bloqueado',
            diasRestantes: 0
          });
        } else if (diff <= 7) {
          alertas.push({
            lojaId: l.id,
            nomeLoja: l.nome_fantasia,
            tipo: 'renovacao',
            diasRestantes: diff
          });
        }
      } else if (l.trial_fim_em) {
        const trialMs = new Date(l.trial_fim_em).getTime();
        const diffTrial = Math.ceil((trialMs - agoraMs) / (1000 * 60 * 60 * 24));
        if (diffTrial <= 0) {
          bloqueadas.push({
            lojaId: l.id,
            nomeLoja: l.nome_fantasia,
            tipo: 'bloqueado',
            diasRestantes: 0
          });
        } else if (diffTrial <= 3) {
          // Alerta no conglomerado se restarem 3 dias ou menos de trial
          alertas.push({
            lojaId: l.id,
            nomeLoja: l.nome_fantasia,
            tipo: 'trial',
            diasRestantes: diffTrial
          });
        }
      }
    });

    return { lojasEmAlerta: alertas, lojasBloqueadas: bloqueadas };
  }, [lojasDisponiveis]);

  // Função para acionar o checkout do Mercado Pago
  const iniciarCheckoutAssinatura = useCallback(
    async (lojaAlvoId?: string) => {
      const idLoja = lojaAlvoId || loja?.id;
      if (!idLoja) {
        setErroCheckout('Nenhuma loja selecionada para faturamento.');
        return;
      }

      try {
        setCarregandoCheckout(true);
        setErroCheckout(null);

        // Chama a Edge Function que gera a preferência do Mercado Pago
        const { data, error } = await supabase.functions.invoke('hubi-criar-assinatura-mp', {
          body: {
            loja_id: idLoja
          }
        });

        if (error) {
          throw new Error(error.message || 'Erro ao gerar fatura do Mercado Pago.');
        }

        if (data?.init_point) {
          // Redireciona o lojista para o checkout seguro oficial do Mercado Pago
          window.location.href = data.init_point;
        } else {
          throw new Error('Link de pagamento não retornado pelo gateway.');
        }
      } catch (err: any) {
        console.error('[useAssinaturaStatus] Erro ao iniciar checkout:', err);
        setErroCheckout(err.message || 'Não foi possível iniciar o checkout. Tente novamente.');
      } finally {
        setCarregandoCheckout(false);
      }
    },
    [loja?.id]
  );

  return {
    status: calculoStatusLojaAtiva.status,
    diasRestantesTrial: calculoStatusLojaAtiva.diasRestantesTrial,
    diasRestantesAnuidade: calculoStatusLojaAtiva.diasRestantesAnuidade,
    estaBloqueada: calculoStatusLojaAtiva.estaBloqueada,
    deveExibirBanner: calculoStatusLojaAtiva.deveExibirBanner,
    tipoBanner: calculoStatusLojaAtiva.tipoBanner,
    lojasEmAlerta,
    lojasBloqueadas,
    iniciarCheckoutAssinatura,
    carregandoCheckout,
    erroCheckout
  };
}
