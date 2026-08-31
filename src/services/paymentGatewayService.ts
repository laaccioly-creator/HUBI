/**
 * HUBI - Serviço de Integração com Gateways de Pagamentos Digitais
 * Suporte a Mercado Pago, PagSeguro, Google Pay e projeções de Maquininhas.
 */

import { Loja, PagamentosDigitaisConfig, PrazosTaxasMaquininha } from '../types';
import { supabase } from '../lib/supabase';

export interface PixDinamicoResponse {
  sucesso: boolean;
  transacaoId?: string;
  qrCode?: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  valorTotal: number;
  expiraEm?: string;
  mensagem?: string;
}

export interface LinkPagamentoResponse {
  sucesso: boolean;
  linkPagamento?: string;
  preferenceId?: string;
  mensagem?: string;
}

export interface PrevisaoRecebimentoCalculada {
  valorBruto: number;
  taxaPercentual: number;
  valorTaxa: number;
  valorLiquido: number;
  prazoDias: number;
  dataPrevisaoRecebimento: string; // YYYY-MM-DD
}

class PaymentGatewayService {
  /**
   * Gera cobrança Pix dinâmica pelo Mercado Pago
   * Prioriza execução Server-Side via Supabase RPC para contornar restrições de CORS do navegador.
   */
  async gerarPixMercadoPago(params: {
    loja: Loja;
    valor: number;
    descricao: string;
    pedidoNumero: number;
    emailCliente?: string;
    nomeCliente?: string;
  }): Promise<PixDinamicoResponse> {
    const { loja, valor, descricao, pedidoNumero, emailCliente, nomeCliente } = params;
    const mpConfig = loja.configuracoes_extras?.pagamentos_digitais?.mercado_pago;

    if (!mpConfig?.access_token) {
      return {
        sucesso: false,
        valorTotal: valor,
        mensagem: 'Access Token do Mercado Pago não configurado na loja.'
      };
    }

    // 1. Tenta via Supabase RPC (execução server-side, 100% livre de bloqueio de CORS)
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('criar_pix_mercado_pago', {
        p_loja_id: loja.id,
        p_valor: Number(valor.toFixed(2)),
        p_descricao: descricao || `Pedido #${pedidoNumero} - ${loja.nome_fantasia}`,
        p_pedido_numero: pedidoNumero,
        p_email_cliente: emailCliente || 'cliente@hubi.app',
        p_nome_cliente: nomeCliente || 'Cliente'
      });

      if (!rpcError && rpcData) {
        if (rpcData.sucesso) {
          return {
            sucesso: true,
            transacaoId: rpcData.transacaoId,
            qrCode: rpcData.qrCode,
            qrCodeBase64: rpcData.qrCodeBase64,
            ticketUrl: rpcData.ticketUrl,
            valorTotal: valor,
            expiraEm: rpcData.expiraEm,
            mensagem: rpcData.mensagem || 'QR Code Pix gerado com sucesso!'
          };
        } else if (rpcData.mensagem) {
          console.warn('Mercado Pago RPC retornou erro:', rpcData.mensagem);
          return {
            sucesso: false,
            valorTotal: valor,
            mensagem: rpcData.mensagem
          };
        }
      }
    } catch (rpcErr) {
      console.warn('Tentativa via RPC criar_pix_mercado_pago não disponível, tentando fallback:', rpcErr);
    }

    // 2. Fallback: Chamada HTTP Direta (funciona em ambientes com proxy ou mobile webview)
    try {
      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mpConfig.access_token.trim()}`,
          'X-Idempotency-Key': `hubi_${loja.id}_${pedidoNumero}_${Date.now()}`
        },
        body: JSON.stringify({
          transaction_amount: Number(valor.toFixed(2)),
          description: descricao || `Pedido #${pedidoNumero} - ${loja.nome_fantasia}`,
          payment_method_id: 'pix',
          payer: {
            email: emailCliente || 'cliente@hubi.app',
            first_name: nomeCliente || 'Cliente',
          },
          external_reference: `PEDIDO_${pedidoNumero}`,
          notification_url: typeof window !== 'undefined' ? `${window.location.origin}/api/webhook/mercadopago` : undefined
        })
      });

      const data = await response.json();

      if (!response.ok || !data.id) {
        throw new Error(data.message || 'Falha ao comunicar com o Mercado Pago.');
      }

      const pointOfInteraction = data.point_of_interaction?.transaction_data;

      return {
        sucesso: true,
        transacaoId: String(data.id),
        qrCode: pointOfInteraction?.qr_code,
        qrCodeBase64: pointOfInteraction?.qr_code_base64,
        ticketUrl: pointOfInteraction?.ticket_url,
        valorTotal: valor,
        expiraEm: data.date_of_expiration,
        mensagem: 'QR Code Pix gerado com sucesso!'
      };
    } catch (err: any) {
      console.error('Erro Mercado Pago Pix:', err);
      const isCors = err?.message?.includes('Failed to fetch') || err?.name === 'TypeError';
      return {
        sucesso: false,
        valorTotal: valor,
        mensagem: isCors
          ? 'Bloqueio de CORS do navegador. Execute a função SQL criar_pix_mercado_pago no Supabase para habilitar o Pix.'
          : (err.message || 'Erro ao gerar Pix no Mercado Pago.')
      };
    }
  }

  /**
   * Gera Link de Pagamento / Checkout do Mercado Pago
   */
  async gerarLinkMercadoPago(params: {
    loja: Loja;
    itens: Array<{ titulo: string; quantidade: number; precoUnitario: number }>;
    pedidoNumero: number;
    clienteEmail?: string;
  }): Promise<LinkPagamentoResponse> {
    const { loja, itens, pedidoNumero, clienteEmail } = params;
    const mpConfig = loja.configuracoes_extras?.pagamentos_digitais?.mercado_pago;

    if (!mpConfig?.access_token) {
      return {
        sucesso: false,
        mensagem: 'Mercado Pago não está conectado com Access Token.'
      };
    }

    const tokenMascarado = mpConfig.access_token ? `${mpConfig.access_token.slice(0, 14)}...${mpConfig.access_token.slice(-6)}` : 'NÃO CONFIGURADO';
    const isModoSandbox = mpConfig.ambiente !== 'producao';

    console.group('💳 [Mercado Pago] Criando Link de Pagamento (Preference)');
    console.info('Ambiente Configurado:', isModoSandbox ? 'TESTE (Sandbox)' : 'PRODUÇÃO (Real)');
    console.info('Token da Loja:', tokenMascarado);
    console.info('E-mail do Pagador:', clienteEmail || '(não informado)');
    console.info('Itens do Pedido:', itens);
    console.groupEnd();

    // 1. Tenta via Supabase RPC (execução server-side, livre de CORS)
    try {
      console.log('⚡ [Mercado Pago] Chamando RPC criar_link_mercado_pago no Supabase...');
      const { data: rpcData, error: rpcError } = await supabase.rpc('criar_link_mercado_pago', {
        p_loja_id: loja.id,
        p_itens: itens.map(i => ({
          title: i.titulo,
          quantity: i.quantidade,
          currency_id: 'BRL',
          unit_price: Number(i.precoUnitario.toFixed(2))
        })),
        p_pedido_numero: pedidoNumero,
        p_cliente_email: clienteEmail || 'cliente@hubi.app',
        p_back_url: typeof window !== 'undefined' ? `${window.location.origin}/catalog/${loja.slug_catalogo}` : undefined
      });

      if (rpcError) {
        console.warn('⚠️ [Mercado Pago] RPC retornou erro ou não existe:', rpcError);
      } else {
        console.log('✅ [Mercado Pago] Resposta do RPC Supabase:', rpcData);
      }

      if (!rpcError && rpcData?.sucesso && rpcData?.linkPagamento) {
        console.info('🌐 [Mercado Pago] Link Final Aberto pelo Cliente (padrão TSB):', rpcData.linkPagamento);
        return {
          sucesso: true,
          preferenceId: rpcData.preferenceId,
          linkPagamento: rpcData.linkPagamento,
          mensagem: rpcData.mensagem || 'Link de pagamento gerado com sucesso!'
        };
      }
    } catch (rpcErr) {
      console.warn('Tentativa via RPC criar_link_mercado_pago falhou, tentando fallback direto:', rpcErr);
    }

    // 2. Fallback: Chamada Direta (Exatamente como no TSB)
    try {
      console.log('🌐 [Mercado Pago Direct] Executando fetch direto para https://api.mercadopago.com/checkout/preferences...');
      const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mpConfig.access_token.trim()}`
        },
        body: JSON.stringify({
          items: itens.map(i => ({
            title: i.titulo,
            quantity: i.quantidade,
            currency_id: 'BRL',
            unit_price: Number(i.precoUnitario.toFixed(2))
          })),
          external_reference: `PEDIDO_${pedidoNumero}`,
          back_urls: typeof window !== 'undefined' ? {
            success: `${window.location.origin}/catalog/${loja.slug_catalogo}?status=aprovado&pedido=${pedidoNumero}`,
            failure: `${window.location.origin}/catalog/${loja.slug_catalogo}?status=falha&pedido=${pedidoNumero}`,
            pending: `${window.location.origin}/catalog/${loja.slug_catalogo}?status=pendente&pedido=${pedidoNumero}`
          } : undefined,
          auto_return: 'approved'
        })
      });

      const data = await response.json();
      console.log('📦 [Mercado Pago Direct] Resposta da API:', data);

      if (!response.ok || !data.init_point) {
        throw new Error(data.message || 'Erro ao gerar link de pagamento.');
      }

      console.info('🚀 [Mercado Pago Direct] Link Final Selecionado (padrão TSB):', data.init_point);

      return {
        sucesso: true,
        preferenceId: data.id,
        linkPagamento: data.init_point,
        mensagem: 'Link de pagamento criado com sucesso!'
      };
    } catch (err: any) {
      console.error('❌ [Mercado Pago Direct] Erro ao criar preference:', err);
      return {
        sucesso: false,
        mensagem: err.message || 'Falha ao criar link no Mercado Pago.'
      };
    }
  }

  /**
   * Consulta status de pagamento no Mercado Pago
   */
  async consultarStatusMercadoPago(transacaoId: string, accessToken: string): Promise<string> {
    try {
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${transacaoId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken.trim()}`
        }
      });
      const data = await res.json();
      return data.status || 'pendente'; // approved, pending, in_process, rejected, cancelled
    } catch (err) {
      console.error('Erro ao consultar status:', err);
      return 'pendente';
    }
  }

  /**
   * Projeção Financeira e Cálculo de Prazos & Taxas de Maquininhas
   * Utilizado para calcular recebimento líquido e datas previstas de compensação bancária
   */
  calcularPrevisaoRecebimento(
    valor: number,
    tipo: 'credito' | 'debito' | 'pix',
    configLoja?: Loja
  ): PrevisaoRecebimentoCalculada {
    const prazosMaquininha: PrazosTaxasMaquininha = configLoja?.configuracoes_extras?.prazos_taxas_maquininhas || {};

    let taxaPercentual = 0;
    let prazoDias = 0;

    if (tipo === 'credito') {
      taxaPercentual = Number(prazosMaquininha.credito_taxa_percentual ?? 2.99);
      prazoDias = Number(prazosMaquininha.credito_dias ?? 30);
    } else if (tipo === 'debito') {
      taxaPercentual = Number(prazosMaquininha.debito_taxa_percentual ?? 1.49);
      prazoDias = Number(prazosMaquininha.debito_dias ?? 1);
    } else if (tipo === 'pix') {
      taxaPercentual = Number(configLoja?.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.taxa_pix_percentual ?? 0.99);
      prazoDias = 0;
    }

    const valorTaxa = (valor * taxaPercentual) / 100;
    const valorLiquido = Math.max(0, valor - valorTaxa);

    const dataPrev = new Date();
    dataPrev.setDate(dataPrev.getDate() + prazoDias);
    const dataPrevisaoRecebimento = dataPrev.toISOString().split('T')[0];

    return {
      valorBruto: valor,
      taxaPercentual,
      valorTaxa,
      valorLiquido,
      prazoDias,
      dataPrevisaoRecebimento
    };
  }
}

export const paymentGatewayService = new PaymentGatewayService();
