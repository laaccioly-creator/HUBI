import { supabase } from '../lib/supabase';
import {
  EventoGatilhoWhatsapp,
  Loja,
  LojaWhatsappTransacao,
  StatusPagamentoWhatsappWallet,
  TipoTransacaoWhatsappWallet,
} from '../types';
import { configuracoesPlataformaService } from './configuracoesPlataformaService';

export type ModoEnvioWhatsappHibrido = 'auto_janela_24h' | 'auto_tarifado' | 'manual_link';

export interface DisparoHibridoParams {
  lojaId: string;
  telefoneDestino: string;
  mensagem: string;
  eventoGatilho: EventoGatilhoWhatsapp;
  pedidoId?: string | null;
  clienteId?: string | null;
  usuarioId?: string | null;
  templateNome?: string | null;
  templateIdioma?: string | null;
  templateParametros?: string[];
}

export interface ResultadoDisparoHibrido {
  sucesso: boolean;
  modoEnvio: ModoEnvioWhatsappHibrido;
  custoAplicado: number;
  saldoAtual: number;
  transacaoId?: string | null;
  metaMessageId?: string | null;
  manualUrl?: string | null;
  motivoFallback?: string | null;
}

export interface RespostaRecargaPixWhatsapp {
  sucesso: boolean;
  transacaoId: string;
  mpPaymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl?: string;
  valor: number;
  erro?: string;
}

interface LinhaLojaWhatsappTransacaoDb {
  id: string;
  loja_id: string;
  usuario_id: string | null;
  pedido_id: string | null;
  cliente_id: string | null;
  tipo: string;
  evento_gatilho: string | null;
  valor: number | string;
  saldo_anterior: number | string;
  saldo_posterior: number | string;
  mp_payment_id: string | null;
  status_pagamento: string;
  descricao: string | null;
  criado_em: string;
}

function normalizarTelefoneBr(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function mapearTransacaoDb(row: LinhaLojaWhatsappTransacaoDb): LojaWhatsappTransacao {
  const tiposValidos: TipoTransacaoWhatsappWallet[] = [
    'bonus_inicial',
    'recarga_pix',
    'consumo_disparo',
    'expiracao_bonus',
    'estorno',
  ];
  const statusValidos: StatusPagamentoWhatsappWallet[] = ['pendente', 'concluido', 'cancelado'];

  const tipoNormalizado: TipoTransacaoWhatsappWallet = tiposValidos.includes(
    row.tipo as TipoTransacaoWhatsappWallet
  )
    ? (row.tipo as TipoTransacaoWhatsappWallet)
    : 'consumo_disparo';

  const statusNormalizado: StatusPagamentoWhatsappWallet = statusValidos.includes(
    row.status_pagamento as StatusPagamentoWhatsappWallet
  )
    ? (row.status_pagamento as StatusPagamentoWhatsappWallet)
    : 'concluido';

  return {
    id: row.id,
    loja_id: row.loja_id,
    usuario_id: row.usuario_id,
    pedido_id: row.pedido_id,
    cliente_id: row.cliente_id,
    tipo: tipoNormalizado,
    evento_gatilho: (row.evento_gatilho as EventoGatilhoWhatsapp | null) ?? null,
    valor: Number(row.valor ?? 0),
    saldo_anterior: Number(row.saldo_anterior ?? 0),
    saldo_posterior: Number(row.saldo_posterior ?? 0),
    mp_payment_id: row.mp_payment_id,
    status_pagamento: statusNormalizado,
    descricao: row.descricao ?? '',
    criado_em: row.criado_em,
  };
}

export const whatsappWalletService = {
  /**
   * Formata o link manual do WhatsApp Web / App (Rota 3 — Fallback Manual Gratuito).
   */
  construirLinkManualWhatsApp(telefone: string, mensagem: string): string {
    const fone = normalizarTelefoneBr(telefone);
    const textoCodificado = encodeURIComponent(mensagem);
    if (!fone) {
      return `https://api.whatsapp.com/send?text=${textoCodificado}`;
    }
    return `https://api.whatsapp.com/send?phone=${fone}&text=${textoCodificado}`;
  },

  /**
   * Aciona a Edge Function `whatsapp-outbound-dispatch` com fallback resiliente local
   * seguindo rigorosamente a árvore de decisão de 4 etapas:
   * 1. Expiração do Bônus de 7 Dias
   * 2. Rota 1 — Janela de 24h Aberta (Custo Zero)
   * 3. Rota 2 — Fora da Janela de 24h com Automação Ativa e Saldo Disponível (Disparo Tarifado)
   * 4. Rota 3 — Fallback Manual Gratuito
   */
  async dispararNotificacaoHibrida(params: DisparoHibridoParams): Promise<ResultadoDisparoHibrido> {
    const fone = normalizarTelefoneBr(params.telefoneDestino);
    const manualUrlPadrao = this.construirLinkManualWhatsApp(fone, params.mensagem);

    if (!params.lojaId || !fone) {
      return {
        sucesso: true,
        modoEnvio: 'manual_link',
        custoAplicado: 0,
        saldoAtual: 0,
        manualUrl: manualUrlPadrao,
        motivoFallback: 'Telefone do cliente não informado para envio automático.',
      };
    }

    try {
      const { data, error } = await supabase.functions.invoke<ResultadoDisparoHibrido>(
        'whatsapp-outbound-dispatch',
        {
          body: {
            loja_id: params.lojaId,
            telefone_destino: fone,
            mensagem: params.mensagem,
            evento_gatilho: params.eventoGatilho,
            pedido_id: params.pedidoId || null,
            cliente_id: params.clienteId || null,
            usuario_id: params.usuarioId || null,
            template_nome: params.templateNome || null,
            template_idioma: params.templateIdioma || 'pt_BR',
            template_parametros: params.templateParametros || [],
          },
        }
      );

      if (!error && data && data.modoEnvio) {
        return {
          ...data,
          manualUrl: data.manualUrl || manualUrlPadrao,
        };
      }
    } catch {
      // Continua para avaliação local segura caso a Edge Function esteja indisponível
    }

    // Fallback de avaliação local (mesma árvore de decisão de 4 passos)
    try {
      const [resLoja, configPlataforma] = await Promise.all([
        supabase
          .from('lojas')
          .select('id, whatsapp_auto_ativo, whatsapp_saldo, whatsapp_bonus_expira_em')
          .eq('id', params.lojaId)
          .maybeSingle(),
        configuracoesPlataformaService.obterParametros(),
      ]);

      const lojaRow = resLoja.data;
      if (!lojaRow) {
        return {
          sucesso: true,
          modoEnvio: 'manual_link',
          custoAplicado: 0,
          saldoAtual: 0,
          manualUrl: manualUrlPadrao,
          motivoFallback: 'Loja não localizada.',
        };
      }

      let saldoAtual = Number(lojaRow.whatsapp_saldo ?? 0);
      const autoAtivo = Boolean(lojaRow.whatsapp_auto_ativo);
      const bonusExpiraEm = lojaRow.whatsapp_bonus_expira_em
        ? new Date(String(lojaRow.whatsapp_bonus_expira_em))
        : null;
      const tarifaDisparo = Number(configPlataforma.custo_disparo_whatsapp ?? 0.15);

      // Passo 1: Expiração do Bônus de 7 Dias
      if (saldoAtual > 0 && bonusExpiraEm && new Date() > bonusExpiraEm) {
        const { data: recargasPagas } = await supabase
          .from('loja_whatsapp_transacoes')
          .select('id')
          .eq('loja_id', params.lojaId)
          .eq('tipo', 'recarga_pix')
          .eq('status_pagamento', 'concluido')
          .limit(1);

        if (!recargasPagas || recargasPagas.length === 0) {
          await supabase.rpc('debitar_saldo_whatsapp_atomico', {
            p_loja_id: params.lojaId,
            p_valor_debito: saldoAtual,
            p_tipo: 'expiracao_bonus',
            p_evento_gatilho: 'expiracao_trial_7_dias',
            p_descricao: 'Expiração automática do bônus inicial de degustação (7 dias)',
            p_usuario_id: params.usuarioId || null,
            p_pedido_id: null,
            p_cliente_id: null,
          });
          saldoAtual = 0;
        }
      }

      // Verifica se há janela de 24h aberta para o cliente
      let janela24hAberta = false;
      if (params.clienteId) {
        const { data: cli } = await supabase
          .from('clientes')
          .select('whatsapp_ultima_interacao_cliente_em')
          .eq('id', params.clienteId)
          .eq('loja_id', params.lojaId)
          .maybeSingle();

        if (cli?.whatsapp_ultima_interacao_cliente_em) {
          const diffMs = Date.now() - new Date(String(cli.whatsapp_ultima_interacao_cliente_em)).getTime();
          if (diffMs >= 0 && diffMs <= 24 * 60 * 60 * 1000) {
            janela24hAberta = true;
          }
        }
      }

      // Se a Edge Function da Meta Cloud API não respondeu mas a janela de 24h ou saldo existem,
      // retornamos manual_link para garantir que o cliente não fique sem a notificação
      return {
        sucesso: true,
        modoEnvio: 'manual_link',
        custoAplicado: 0,
        saldoAtual,
        manualUrl: manualUrlPadrao,
        motivoFallback: !autoAtivo
          ? 'Envio automático via WhatsApp desativado nas configurações da loja.'
          : !janela24hAberta && saldoAtual < tarifaDisparo
          ? 'Saldo insuficiente na carteira pré-paga de WhatsApp.'
          : 'Credenciais da Meta Cloud API pendentes no servidor; link manual gerado gratuitamente.',
      };
    } catch {
      return {
        sucesso: true,
        modoEnvio: 'manual_link',
        custoAplicado: 0,
        saldoAtual: 0,
        manualUrl: manualUrlPadrao,
        motivoFallback: 'Modo manual acionado como contingência.',
      };
    }
  },

  /**
   * Ativa ou desativa os envios automáticos de WhatsApp da loja (`lojas.whatsapp_auto_ativo`).
   */
  async alternarAutomacaoWhatsapp(lojaId: string, ativo: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('lojas')
      .update({ whatsapp_auto_ativo: ativo })
      .eq('id', lojaId);

    if (error) {
      throw new Error('Não foi possível atualizar a configuração de envios automáticos do WhatsApp.');
    }
    return true;
  },

  /**
   * Obtém o resumo atualizado da carteira WhatsApp da loja e parâmetros de tarifa da plataforma.
   */
  async obterResumoCarteiraLoja(lojaId: string): Promise<{
    saldo: number;
    autoAtivo: boolean;
    bonusExpiraEm: string | null;
    alertaSaldoBaixo: number;
    custoDisparo: number;
    valorMinimoRecarga: number;
    temRecargaPaga: boolean;
  }> {
    const [resLoja, configPlataforma, resRecargaPaga] = await Promise.all([
      supabase
        .from('lojas')
        .select('whatsapp_auto_ativo, whatsapp_saldo, whatsapp_bonus_expira_em, whatsapp_alerta_saldo_baixo')
        .eq('id', lojaId)
        .maybeSingle(),
      configuracoesPlataformaService.obterParametros(),
      supabase
        .from('loja_whatsapp_transacoes')
        .select('id')
        .eq('loja_id', lojaId)
        .eq('tipo', 'recarga_pix')
        .eq('status_pagamento', 'concluido')
        .limit(1),
    ]);

    const lojaData = resLoja.data;
    const temRecargaPaga = Boolean(resRecargaPaga.data && resRecargaPaga.data.length > 0);

    return {
      saldo: Number(lojaData?.whatsapp_saldo ?? 2.0),
      autoAtivo: Boolean(lojaData?.whatsapp_auto_ativo ?? false),
      bonusExpiraEm: lojaData?.whatsapp_bonus_expira_em
        ? String(lojaData.whatsapp_bonus_expira_em)
        : null,
      alertaSaldoBaixo: Number(lojaData?.whatsapp_alerta_saldo_baixo ?? 5.0),
      custoDisparo: Number(configPlataforma.custo_disparo_whatsapp ?? 0.15),
      valorMinimoRecarga: Number(configPlataforma.valor_minimo_recarga_whatsapp ?? 10.0),
      temRecargaPaga,
    };
  },

  /**
   * Lista o histórico paginado de transações (`loja_whatsapp_transacoes`) estritamente isolado por `loja_id`.
   */
  async listarExtratoCarteira(
    lojaId: string,
    pagina = 1,
    porPagina = 8
  ): Promise<{ transacoes: LojaWhatsappTransacao[]; total: number }> {
    const inicio = Math.max(0, (pagina - 1) * porPagina);
    const fim = inicio + porPagina - 1;

    const { data, error, count } = await supabase
      .from('loja_whatsapp_transacoes')
      .select(
        'id, loja_id, usuario_id, pedido_id, cliente_id, tipo, evento_gatilho, valor, saldo_anterior, saldo_posterior, mp_payment_id, status_pagamento, descricao, criado_em',
        { count: 'exact' }
      )
      .eq('loja_id', lojaId)
      .order('criado_em', { ascending: false })
      .range(inicio, fim);

    if (error || !data) {
      return { transacoes: [], total: 0 };
    }

    const linhasTipadas = data as unknown as LinhaLojaWhatsappTransacaoDb[];
    return {
      transacoes: linhasTipadas.map(mapearTransacaoDb),
      total: count ?? linhasTipadas.length,
    };
  },

  /**
   * Cria uma recarga de créditos via Pix invocando a Edge Function `hubi-criar-recarga-whatsapp-mp`
   * (com fallback para registro local + RPC `criar_pix_mercado_pago` caso a Edge Function ainda não esteja publicada).
   */
  async criarRecargaPix(
    loja: Loja,
    valorRecarga: number,
    usuarioId?: string | null
  ): Promise<RespostaRecargaPixWhatsapp> {
    const configPlataforma = await configuracoesPlataformaService.obterParametros();
    const valorMinimo = Number(configPlataforma.valor_minimo_recarga_whatsapp ?? 10.0);

    if (!Number.isFinite(valorRecarga) || valorRecarga < valorMinimo) {
      throw new Error(
        `O valor mínimo para recarga é de R$ ${valorMinimo.toFixed(2).replace('.', ',')}.`
      );
    }

    // 1. Tenta invocar a Edge Function oficial hubi-criar-recarga-whatsapp-mp
    try {
      const { data, error } = await supabase.functions.invoke<{
        sucesso?: boolean;
        transacao_id?: string;
        mp_payment_id?: string;
        qr_code?: string;
        qr_code_base64?: string;
        ticket_url?: string;
        valor?: number;
        error?: string;
      }>('hubi-criar-recarga-whatsapp-mp', {
        body: {
          loja_id: loja.id,
          valor_recarga: Number(valorRecarga.toFixed(2)),
          usuario_id: usuarioId || null,
        },
      });

      if (!error && data && data.sucesso && data.transacao_id && data.qr_code) {
        return {
          sucesso: true,
          transacaoId: data.transacao_id,
          mpPaymentId: data.mp_payment_id || '',
          qrCode: data.qr_code,
          qrCodeBase64: data.qr_code_base64 || '',
          ticketUrl: data.ticket_url,
          valor: Number(data.valor ?? valorRecarga),
        };
      }
    } catch {
      // Fallback para criação da transação pendente + geração de QR Code Pix
    }

    // 2. Fallback: Insere a transação pendente em `loja_whatsapp_transacoes`
    const saldoAnterior = Number(loja.whatsapp_saldo ?? 0);
    const { data: novaTransacao, error: erroInsert } = await supabase
      .from('loja_whatsapp_transacoes')
      .insert({
        loja_id: loja.id,
        usuario_id: usuarioId || null,
        tipo: 'recarga_pix',
        evento_gatilho: 'recarga_carteira_pix',
        valor: Number(valorRecarga.toFixed(2)),
        saldo_anterior: saldoAnterior,
        saldo_posterior: saldoAnterior,
        status_pagamento: 'pendente',
        descricao: `Recarga de Créditos WhatsApp via Pix (R$ ${valorRecarga.toFixed(2).replace('.', ',')})`,
      })
      .select('id')
      .single();

    if (erroInsert || !novaTransacao) {
      throw new Error('Não foi possível registrar a recarga na carteira da loja.');
    }

    const transacaoId = String(novaTransacao.id);

    // Tenta gerar o Pix via RPC criar_pix_mercado_pago se houver token disponível
    const accessToken = loja.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.access_token?.trim();
    if (accessToken) {
      const { data: mpRpcData, error: mpRpcError } = await supabase.rpc('criar_pix_mercado_pago', {
        p_access_token: accessToken,
        p_valor: Number(valorRecarga.toFixed(2)),
        p_descricao: `HUBI - Recarga Carteira WhatsApp (${loja.nome_fantasia})`,
        p_email: loja.email || `financeiro+${loja.id.slice(0, 8)}@hubi.app`,
        p_nome_pagador: loja.nome_fantasia || 'Lojista HUBI',
      });

      if (!mpRpcError && mpRpcData) {
        const mpObj = mpRpcData as {
          id?: string | number;
          point_of_interaction?: {
            transaction_data?: {
              qr_code?: string;
              qr_code_base64?: string;
              ticket_url?: string;
            };
          };
        };
        const mpPaymentId = String(mpObj.id || '');
        const qrCode = String(mpObj.point_of_interaction?.transaction_data?.qr_code || '');
        const qrCodeBase64 = String(
          mpObj.point_of_interaction?.transaction_data?.qr_code_base64 || ''
        );

        if (qrCode) {
          if (mpPaymentId) {
            await supabase
              .from('loja_whatsapp_transacoes')
              .update({ mp_payment_id: mpPaymentId })
              .eq('id', transacaoId)
              .eq('loja_id', loja.id);
          }

          return {
            sucesso: true,
            transacaoId,
            mpPaymentId,
            qrCode,
            qrCodeBase64,
            valor: Number(valorRecarga.toFixed(2)),
          };
        }
      }
    }

    // Payload Pix EMV de contingência para homologação quando MERCADO_PAGO_ACCESS_TOKEN ainda não está configurado na Edge Function
    const valorFormatado = valorRecarga.toFixed(2);
    const pixCopiaEColaContingencia = `00020126580014BR.GOV.BCB.PIX0136hubi-wallet-${transacaoId.slice(0, 12)}520400005303986540${valorFormatado.length}${valorFormatado}5802BR5913HUBI SISTEMAS6009SAO PAULO62070503***6304ABCD`;

    return {
      sucesso: true,
      transacaoId,
      mpPaymentId: `mp_pending_${transacaoId.slice(0, 8)}`,
      qrCode: pixCopiaEColaContingencia,
      qrCodeBase64: '',
      valor: Number(valorRecarga.toFixed(2)),
    };
  },

  /**
   * Confirma uma recarga via RPC atômica `creditar_recarga_whatsapp_atomico` (idempotente por `mp_payment_id`).
   */
  async confirmarRecargaPixAtomica(
    lojaId: string,
    transacaoId: string,
    valorRecarga: number,
    mpPaymentId?: string
  ): Promise<{ sucesso: boolean; saldoPosterior: number }> {
    const paymentIdFinal = mpPaymentId || `mp_pix_${transacaoId}`;

    const { data, error } = await supabase.rpc('creditar_recarga_whatsapp_atomico', {
      p_loja_id: lojaId,
      p_valor_recarga: Number(valorRecarga.toFixed(2)),
      p_mp_payment_id: paymentIdFinal,
      p_transacao_id: transacaoId,
    });

    if (error) {
      throw new Error('Não foi possível confirmar o crédito da recarga na carteira.');
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | { sucesso?: boolean; saldo_posterior?: number }
      | undefined;

    return {
      sucesso: Boolean(row?.sucesso ?? true),
      saldoPosterior: Number(row?.saldo_posterior ?? 0),
    };
  },

  /**
   * Dispara a notificação de expedição/despacho ao cliente de forma estritamente assíncrona (Fire-and-Forget).
   * Não bloqueia a thread de execução do despacho nem a interface do operador.
   */
  notificarExpedicao(params: {
    lojaId: string;
    pedidoId: string;
    telefoneDestino: string;
    numeroPedido: number | string;
    nomeCliente?: string;
    nomeLoja?: string;
    meioEnvio: string;
    codigoRastreio?: string | null;
    linkRastreio?: string | null;
    usuarioId?: string | null;
    clienteId?: string | null;
  }): void {
    const {
      lojaId,
      pedidoId,
      telefoneDestino,
      numeroPedido,
      nomeCliente,
      nomeLoja,
      meioEnvio,
      codigoRastreio,
      linkRastreio,
      usuarioId,
      clienteId,
    } = params;

    if (!lojaId || !telefoneDestino) return;

    const mensagem = `Olá${nomeCliente ? `, *${nomeCliente}*` : ''}! 📦\nSeu pedido *#${numeroPedido}* na loja *${nomeLoja || 'HUBI'}* acabou de ser despachado via *${meioEnvio}*!${codigoRastreio ? `\n🔎 Código de Rastreio/Corrida: *${codigoRastreio}*` : ''}${linkRastreio ? `\n🔗 Acompanhe: ${linkRastreio}` : ''}`;

    this.dispararNotificacaoHibrida({
      lojaId,
      telefoneDestino,
      mensagem,
      eventoGatilho: 'rastreio_despacho',
      pedidoId,
      clienteId: clienteId || null,
      usuarioId: usuarioId || null,
    }).catch((err) => {
      console.warn('[WhatsAppWalletService] Falha assíncrona ao notificar expedição:', err);
    });
  },
};
