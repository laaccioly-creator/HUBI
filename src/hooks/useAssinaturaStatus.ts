import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Loja } from '../types';
import { obterDataOperacao } from '../utils/dataOperacao';
import { useSystemBillingConfig } from './useSystemBillingConfig';

const detectarParametrosRetornoMp = () => {
  if (typeof window === 'undefined') {
    return { ativo: false, paymentId: null as string | null, aprovado: false };
  }
  const params = new URLSearchParams(window.location.search);
  const statusParam = (params.get('status') || params.get('collection_status') || '').toLowerCase();
  const paymentId = params.get('payment_id') || params.get('collection_id');
  const retornoAssinatura = params.get('assinatura');
  const retornoRecarga = params.get('recarga');
  const temPaymentIdValido = Boolean(paymentId && paymentId !== 'null');
  const aprovado =
    statusParam === 'approved' ||
    retornoAssinatura === 'sucesso' ||
    retornoRecarga === 'sucesso';
  const ativo =
    aprovado ||
    temPaymentIdValido ||
    Boolean(retornoAssinatura) ||
    Boolean(retornoRecarga);

  return {
    ativo,
    paymentId: temPaymentIdValido ? paymentId : null,
    aprovado,
  };
};

const limparParametrosRetornoMpDaUrl = () => {
  if (typeof window === 'undefined') return;
  try {
    const urlLimpa = new URL(window.location.href);
    [
      'assinatura',
      'recarga',
      'loja_id',
      'collection_id',
      'collection_status',
      'payment_id',
      'status',
      'external_reference',
      'payment_type',
      'merchant_order_id',
      'preference_id',
      'site_id',
      'processing_mode',
      'merchant_account_id',
    ].forEach((chave) => urlLimpa.searchParams.delete(chave));
    window.history.replaceState({}, document.title, urlLimpa.pathname + (urlLimpa.search || ''));
  } catch {
    // Silencioso
  }
};

let retornoMpEmAndamento = false;
let retornoMpJaProcessado = false;
const retornoMpListeners = new Set<(val: boolean) => void>();

const definirRetornoMpEmAndamento = (val: boolean) => {
  retornoMpEmAndamento = val;
  retornoMpListeners.forEach((cb) => {
    try {
      cb(val);
    } catch {}
  });
};

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
  carregandoConfigCobranca: boolean;
  lojasEmAlerta: AlertaLojaConglomerado[];
  lojasBloqueadas: AlertaLojaConglomerado[];
  confirmandoRetornoPagamento: boolean;
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
  const [confirmandoRetornoPagamento, setConfirmandoRetornoPagamento] = useState<boolean>(() => {
    if (retornoMpEmAndamento) return true;
    if (retornoMpJaProcessado) return false;
    return detectarParametrosRetornoMp().ativo;
  });
  const isSyncingRef = useRef<boolean>(false);
  const billingConfig = useSystemBillingConfig();

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
          if (retornoMpEmAndamento || isSyncingRef.current) {
            return;
          }
          const novo = payload.new as Partial<Loja>;
          // Se o status da assinatura ou data de término foi alterado
          if (
            novo.status_assinatura !== loja.status_assinatura ||
            novo.assinatura_fim_em !== loja.assinatura_fim_em
          ) {
            isSyncingRef.current = true;
            try {
              console.log('[useAssinaturaStatus] Realtime: Atualização de assinatura detectada para loja:', loja.id);
              if (recarregarDadosLoja) {
                await recarregarDadosLoja();
              }
            } finally {
              window.setTimeout(() => {
                isSyncingRef.current = false;
              }, 300);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
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

    // 3. Verificação de Período Trial (Degustação dinâmica baseada em dias_trial da plataforma)
    const diasTrialConfig = billingConfig.diasTrial > 0 ? billingConfig.diasTrial : 7;
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
  }, [loja, billingConfig.diasTrial]);

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

  // Exibe histórico do último redirecionamento de checkout MP e processa retorno automático aprovado
  useEffect(() => {
    try {
      const ultimoLogRaw = sessionStorage.getItem('hubi_last_mp_debug');
      if (ultimoLogRaw) {
        const ultimoLog = JSON.parse(ultimoLogRaw);
        console.groupCollapsed('[HUBI MP CHECKOUT DEBUG - ÚLTIMO CHECKOUT REGISTRADO]');
        console.log('Registrado em:', ultimoLog?.timestamp);
        console.log('Dados persistidos:', ultimoLog);
        console.groupEnd();
      }
    } catch {
      // Silencioso caso sessionStorage esteja indisponível
    }
  }, []);

  useEffect(() => {
    retornoMpListeners.add(setConfirmandoRetornoPagamento);

    const { ativo, paymentId, aprovado } = detectarParametrosRetornoMp();
    if (!ativo || retornoMpJaProcessado || retornoMpEmAndamento) {
      return () => {
        retornoMpListeners.delete(setConfirmandoRetornoPagamento);
      };
    }

    definirRetornoMpEmAndamento(true);
    isSyncingRef.current = true;

    const timeoutSeguranca = window.setTimeout(() => {
      retornoMpJaProcessado = true;
      isSyncingRef.current = false;
      limparParametrosRetornoMpDaUrl();
      definirRetornoMpEmAndamento(false);
    }, 4000);

    const processarRetornoMp = async () => {
      try {
        if (paymentId && aprovado) {
          console.log('[useAssinaturaStatus] Retorno MP aprovado detectado, confirmando pagamento:', {
            paymentId,
            aprovado,
          });
          await supabase.functions.invoke('hubi-webhook-mp', {
            body: {
              type: 'payment',
              data: { id: paymentId },
            },
          });
        }
        if (recarregarDadosLoja) {
          await recarregarDadosLoja();
        }
      } catch (errRetorno) {
        console.warn('[useAssinaturaStatus] Aviso ao confirmar retorno automático do Mercado Pago:', errRetorno);
      } finally {
        window.clearTimeout(timeoutSeguranca);
        retornoMpJaProcessado = true;
        isSyncingRef.current = false;
        limparParametrosRetornoMpDaUrl();
        definirRetornoMpEmAndamento(false);
      }
    };

    void processarRetornoMp();

    return () => {
      retornoMpListeners.delete(setConfirmandoRetornoPagamento);
    };
  }, [recarregarDadosLoja]);

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

        const backUrl =
          typeof window !== 'undefined'
            ? `${window.location.origin}/dashboard`
            : 'https://hubi.app/dashboard';

        const payloadInvoke = { loja_id: idLoja, back_url: backUrl };

        // Chama a Edge Function que gera a preferência do Mercado Pago
        const { data, error } = await supabase.functions.invoke('hubi-criar-assinatura-mp', {
          body: payloadInvoke
        });

        if (error) {
          let detalheErro: any = null;
          try {
            if (error.context && typeof error.context.json === 'function') {
              detalheErro = await error.context.json();
            }
          } catch {
            // Ignora falha ao ler corpo JSON de erro
          }

          const registroErro = {
            timestamp: new Date().toISOString(),
            loja_id: idLoja,
            payload_enviado_edge: payloadInvoke,
            erro_mensagem: detalheErro?.error || error.message,
            status_mp: detalheErro?.status_mp ?? null,
            detalhe_mp: detalheErro?.detalhe_mp ?? null,
            diagnostico_mp: detalheErro?.diagnostico_mp ?? null,
          };

          console.group('[HUBI MP CHECKOUT DEBUG - ERRO]');
          console.error('Erro retornado pela Edge Function:', registroErro);
          console.groupEnd();

          try {
            sessionStorage.setItem('hubi_last_mp_debug', JSON.stringify(registroErro));
          } catch {}

          throw new Error(detalheErro?.error || error.message || 'Erro ao gerar fatura do Mercado Pago.');
        }

        const isModoTeste = Boolean(data?.is_sandbox || data?.modo === 'sandbox');
        const urlFinal = data?.modo === 'sandbox' && data?.sandbox_init_point
          ? data.sandbox_init_point
          : (data?.checkout_url || data?.init_point);

        const registroDebug = {
          timestamp: new Date().toISOString(),
          loja_id: idLoja,
          modo: data?.modo || (isModoTeste ? 'sandbox' : 'producao'),
          is_sandbox: isModoTeste,
          token_prefix: data?.token_prefix || data?.diagnostico_mp?.token_prefix || 'N/A',
          origem_credencial: data?.diagnostico_mp?.origem_credencial || 'N/A',
          preference_id: data?.preference_id,
          url_redirecionamento: urlFinal,
          init_point: data?.init_point,
          sandbox_init_point: data?.sandbox_init_point,
          payload_enviado_edge: payloadInvoke,
          payload_enviado_mp: data?.diagnostico_mp?.payload_enviado || null,
          resposta_completa: data,
        };

        console.group('[HUBI MP CHECKOUT DEBUG]');
        console.log('Ambiente configurado:', registroDebug.modo, '| is_sandbox:', isModoTeste);
        console.log('Origem credencial:', registroDebug.origem_credencial, '| Tipo de token:', registroDebug.token_prefix);
        console.log('Preference ID:', registroDebug.preference_id);
        console.log('URL de redirecionamento:', urlFinal, {
          init_point: data?.init_point,
          sandbox_init_point: data?.sandbox_init_point,
        });
        console.log('Payload enviado:', {
          edge_function: payloadInvoke,
          mercado_pago: registroDebug.payload_enviado_mp,
        });
        console.log('Resposta completa da Edge Function:', data);
        console.groupEnd();

        try {
          sessionStorage.setItem('hubi_last_mp_debug', JSON.stringify(registroDebug));
        } catch {}

        if (urlFinal) {
          // Redireciona o lojista para o checkout seguro oficial do Mercado Pago (Sandbox estrito ou Produção)
          window.location.href = urlFinal;
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
    estaBloqueada: confirmandoRetornoPagamento ? false : calculoStatusLojaAtiva.estaBloqueada,
    deveExibirBanner: confirmandoRetornoPagamento ? false : calculoStatusLojaAtiva.deveExibirBanner,
    tipoBanner: confirmandoRetornoPagamento ? 'nenhum' : calculoStatusLojaAtiva.tipoBanner,
    valorMensalReferencia: billingConfig.valorMensalAnual,
    valorAnualTotal: billingConfig.valorTotalAnual,
    diasTrialPadrao: billingConfig.diasTrial,
    carregandoConfigCobranca: billingConfig.isLoading,
    lojasEmAlerta,
    lojasBloqueadas,
    confirmandoRetornoPagamento,
    iniciarCheckoutAssinatura,
    carregandoCheckout,
    erroCheckout
  };
}
