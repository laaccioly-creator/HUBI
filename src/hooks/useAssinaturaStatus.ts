import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Loja, ConfiguracoesPlataformaHubi } from '../types';
import { obterDataOperacao } from '../utils/dataOperacao';
import { configuracoesPlataformaService, CONFIG_PLATAFORMA_PADRAO } from '../services/configuracoesPlataformaService';

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
  valorMensalReferencia: number;
  valorAnualTotal: number;
  diasTrialPadrao: number;
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
  const [configPlataforma, setConfigPlataforma] = useState<ConfiguracoesPlataformaHubi>(CONFIG_PLATAFORMA_PADRAO);

  // Carrega os parâmetros comerciais globais da plataforma
  useEffect(() => {
    let montado = true;
    configuracoesPlataformaService.obterParametros().then((res) => {
      if (montado && res) {
        setConfigPlataforma(res);
      }
    });
    return () => {
      montado = false;
    };
  }, []);

  // Escuta alterações em tempo real via Supabase Realtime para a loja ativa
  useEffect(() => {
    if (!loja?.id) return;

    // Sufixo exclusivo para evitar colisão entre múltiplos componentes que usam o hook simultaneamente
    const canalNome = `loja_assinatura_${loja.id}_${Math.random().toString(36).substring(2, 9)}`;

    const canal = supabase
      .channel(canalNome)
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
          // Se o status da assinatura ou data de término foi alterado
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
      supabase.removeChannel(canal);
    };
  }, [loja?.id, recarregarDadosLoja]);

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

    // 3. Verificação de Período Trial (Degustação dinâmica baseada em dias_trial da plataforma)
    const diasTrialConfig = configPlataforma.dias_trial || 7;
    let trialFimMs: number | null = null;

    if (loja.criado_em) {
      // Cálculo determinístico: data de criação da loja + dias configurados na plataforma
      trialFimMs = new Date(loja.criado_em).getTime() + (diasTrialConfig * 24 * 60 * 60 * 1000);
    } else if (loja.trial_fim_em) {
      // Fallback caso não haja criado_em
      trialFimMs = new Date(loja.trial_fim_em).getTime();
    }

    if (trialFimMs) {
      // Diferença em dias inteiros considerando o final do dia
      const diffTrialDias = Math.ceil((trialFimMs - agoraMs) / (1000 * 60 * 60 * 24));

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

      // Em período de trial ativo com contagem regressiva precisa (respeitando teto do prazo configurado)
      return {
        status: 'TRIAL_ATIVO' as StatusCicloAssinatura,
        diasRestantesTrial: Math.min(diasTrialConfig, Math.max(1, diffTrialDias)),
        diasRestantesAnuidade: 0,
        estaBloqueada: false,
        deveExibirBanner: true,
        tipoBanner: 'trial' as const
      };
    }

    // Fallback padrão se não houver nenhuma data registrada
    return {
      status: 'TRIAL_ATIVO' as StatusCicloAssinatura,
      diasRestantesTrial: diasTrialConfig,
      diasRestantesAnuidade: 0,
      estaBloqueada: false,
      deveExibirBanner: true,
      tipoBanner: 'trial' as const
    };
  }, [loja, configPlataforma]);

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
      } else {
        const trialMs = l.trial_fim_em
          ? new Date(l.trial_fim_em).getTime()
          : (l.criado_em ? new Date(l.criado_em).getTime() + 7 * 24 * 60 * 60 * 1000 : null);
        if (trialMs) {
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
    valorMensalReferencia: configPlataforma.valor_mensal_anual,
    valorAnualTotal: configPlataforma.valor_anual_total,
    diasTrialPadrao: configPlataforma.dias_trial,
    lojasEmAlerta,
    lojasBloqueadas,
    iniciarCheckoutAssinatura,
    carregandoCheckout,
    erroCheckout
  };
}
