import { LojaShippingConfig, OpcaoFreteCotada, CotacaoItemProduto, PedidoEntrega } from '../types/shipping';
import { Loja, Pedido } from '../types';
import { supabase } from '../lib/supabase';

export interface SolicitacaoMelhorEnvioParams {
  loja: Loja;
  config: LojaShippingConfig;
  pedido: Pedido;
  entrega: PedidoEntrega;
}

export interface ResultadoSolicitacaoMelhorEnvio {
  ordem_id: string;
  codigo_rastreio: string;
  link_etiqueta: string;
  link_rastreio: string;
  transportadora: string;
}

interface MelhorEnvioProductPayload {
  id: string;
  width: number;
  height: number;
  length: number;
  weight: number;
  insurance_value: number;
  quantity: number;
}

interface MelhorEnvioCalculatePayload {
  from: {
    postal_code: string;
  };
  to: {
    postal_code: string;
  };
  products: MelhorEnvioProductPayload[];
}

interface MelhorEnvioServiceDeliveryResponse {
  id?: number;
  name?: string;
  price?: string | number;
  custom_price?: string | number;
  discount?: string | number;
  currency?: string;
  delivery_time?: number;
  delivery_range?: {
    min: number;
    max: number;
  };
  company?: {
    id: number;
    name: string;
    picture?: string;
  };
  error?: string;
}

export class MelhorEnvioService {
  private static getBaseUrl(sandbox: boolean): string {
    return sandbox
      ? 'https://sandbox.melhorenvio.com.br'
      : 'https://melhorenvio.com.br';
  }

  /**
   * Sanitiza CEP removendo traços e espaços
   */
  private static limparCep(cep: string): string {
    return (cep || '').replace(/\D/g, '');
  }

  /**
   * Converte itens do pedido para pacotes dimensionais do Melhor Envio
   */
  private static formatarProdutosPayload(
    itens: CotacaoItemProduto[],
    subtotal: number
  ): MelhorEnvioProductPayload[] {
    if (!itens || itens.length === 0) {
      // Pacote padrão mínimo se a cesta estiver vazia ou com itens avulsos
      return [
        {
          id: 'padrao-1',
          width: 15,
          height: 10,
          length: 20,
          weight: 0.5,
          insurance_value: Math.max(1, subtotal),
          quantity: 1
        }
      ];
    }

    return itens.map((it, idx) => ({
      id: `item-${idx + 1}`,
      width: Math.max(10, it.largura_cm || 15),
      height: Math.max(5, it.altura_cm || 10),
      length: Math.max(15, it.comprimento_cm || 20),
      weight: Math.max(0.1, it.peso_kg || 0.3),
      insurance_value: Math.max(1, it.preco_unitario),
      quantity: Math.max(1, it.quantidade)
    }));
  }

  /**
   * Processa e normaliza as opções retornadas pelo Melhor Envio
   */
  private static processarResultadoCotacoes(cotacoesRaw: MelhorEnvioServiceDeliveryResponse[]): OpcaoFreteCotada[] {
    if (!Array.isArray(cotacoesRaw)) {
      return [];
    }

    const resultadosValidos: OpcaoFreteCotada[] = [];

    for (const cotacao of cotacoesRaw) {
      if (cotacao.error) {
        continue;
      }

      const valor = Number(cotacao.custom_price || cotacao.price);
      if (isNaN(valor) || valor <= 0) {
        continue;
      }

      const diasMin = cotacao.delivery_range?.min || cotacao.delivery_time || 1;
      const diasMax = cotacao.delivery_range?.max || cotacao.delivery_time || diasMin;
      const prazoTexto = diasMin === diasMax
        ? `${diasMin} dia${diasMin > 1 ? 's' : ''} útei${diasMin > 1 ? 's' : 'l'}`
        : `${diasMin} a ${diasMax} dias úteis`;

      const transportadora = cotacao.company?.name || 'Transportadora';
      const nomeServico = cotacao.name || 'Envio Padrão';

      let icone: OpcaoFreteCotada['icone_tipo'] = 'padrao';
      const lowerTransp = transportadora.toLowerCase();
      if (lowerTransp.includes('jadlog')) icone = 'jadlog';
      else if (lowerTransp.includes('correios')) icone = 'correios';

      const idFinal = cotacao.id ? String(cotacao.id) : `${transportadora}-${nomeServico}`;

      resultadosValidos.push({
        id: `melhor-envio-${idFinal}`,
        provedor: 'melhor_envio',
        transportadora_nome: transportadora,
        servico_codigo: String(cotacao.id || nomeServico),
        servico_nome: `${transportadora} (${nomeServico})`,
        valor_frete: Number(valor.toFixed(2)),
        prazo_dias_min: diasMin,
        prazo_dias_max: diasMax,
        prazo_estimado_texto: prazoTexto,
        icone_tipo: icone
      });
    }

    resultadosValidos.sort((a, b) => a.valor_frete - b.valor_frete);
    return resultadosValidos;
  }

  /**
   * Executa a cotação com a API v2 do Melhor Envio
   */
  public static async cotarFretes(
    config: LojaShippingConfig,
    destinoCep: string,
    subtotal: number,
    itens: CotacaoItemProduto[]
  ): Promise<OpcaoFreteCotada[]> {
    if (!config.melhor_envio_ativo || !config.melhor_envio_token) {
      return [];
    }

    const cepOrigemLimpo = this.limparCep(config.origem_cep);
    const cepDestinoLimpo = this.limparCep(destinoCep);

    if (cepOrigemLimpo.length !== 8 || cepDestinoLimpo.length !== 8) {
      console.warn('[MelhorEnvio] CEPs inválidos para cotação:', { origem: cepOrigemLimpo, destino: cepDestinoLimpo });
      return [];
    }

    const payload: MelhorEnvioCalculatePayload = {
      from: {
        postal_code: cepOrigemLimpo
      },
      to: {
        postal_code: cepDestinoLimpo
      },
      products: this.formatarProdutosPayload(itens, subtotal)
    };

    // -------------------------------------------------------------------------
    // MÉTODO 1: Supabase RPC (PostgreSQL extensions.http) - Sem Bloqueio de CORS
    // -------------------------------------------------------------------------
    try {
      if (config.loja_id) {
        console.log('[MelhorEnvio] Tentando cotação via Supabase RPC (sem CORS)...');
        const { data: rpcData, error: rpcError } = await supabase.rpc('cotar_frete_melhor_envio_rpc', {
          p_loja_id: config.loja_id,
          p_payload: payload
        });

        if (!rpcError && rpcData && rpcData.sucesso && Array.isArray(rpcData.dados)) {
          console.log(`[MelhorEnvio] Cotação obtida via Supabase RPC com sucesso (${rpcData.dados.length} opções).`);
          return this.processarResultadoCotacoes(rpcData.dados);
        }

        if (rpcError) {
          console.info('[MelhorEnvio] Supabase RPC não instalada ou indisponível:', rpcError.message);
        }
      }
    } catch (e: any) {
      console.info('[MelhorEnvio] Exceção ao tentar RPC Supabase:', e.message);
    }

    // -------------------------------------------------------------------------
    // MÉTODO 2: Proxy Local / Vite (/api/shipping/melhor-envio)
    // -------------------------------------------------------------------------
    let baseUrl = this.getBaseUrl(config.melhor_envio_sandbox_mode);
    let endpoint = `${baseUrl}/api/v2/me/shipment/calculate`;

    try {
      const proxyRes = await fetch('/api/shipping/melhor-envio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint,
          token: config.melhor_envio_token.trim(),
          payload
        })
      });

      if (proxyRes.ok) {
        const proxyData = await proxyRes.json();
        if (Array.isArray(proxyData)) {
          console.log(`[MelhorEnvio] Cotação obtida via proxy local com sucesso (${proxyData.length} opções).`);
          return this.processarResultadoCotacoes(proxyData);
        }
      }
    } catch {
      // Proxy local não disponível neste ambiente, continua para chamada direta
    }

    // -------------------------------------------------------------------------
    // MÉTODO 3: Chamada Direta via Browser (pode sofrer CORS em SPAs hospedadas)
    // -------------------------------------------------------------------------
    try {
      console.log(`[MelhorEnvio] Disparando cotação direta (${baseUrl}) CEP Origem: ${cepOrigemLimpo} -> CEP Destino: ${cepDestinoLimpo}`);

      let response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.melhor_envio_token.trim()}`,
          'User-Agent': 'HUBI Sistema (suporte@hubi.app)'
        },
        body: JSON.stringify(payload)
      });

      // Fallback automático se retornar 401
      if (response.status === 401) {
        const fallbackBase = config.melhor_envio_sandbox_mode
          ? 'https://melhorenvio.com.br'
          : 'https://sandbox.melhorenvio.com.br';
        console.warn(`[MelhorEnvio] 401 Unauthenticated em ${baseUrl}. Tentando fallback em: ${fallbackBase}`);
        
        response = await fetch(`${fallbackBase}/api/v2/me/shipment/calculate`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.melhor_envio_token.trim()}`,
            'User-Agent': 'HUBI Sistema (suporte@hubi.app)'
          },
          body: JSON.stringify(payload)
        });
      }

      if (!response.ok) {
        const erroTexto = await response.text();
        console.warn(`[MelhorEnvio] Resposta com erro da API (${response.status}):`, erroTexto);
        return [];
      }

      const cotacoesRaw = await response.json() as MelhorEnvioServiceDeliveryResponse[];
      return this.processarResultadoCotacoes(cotacoesRaw);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[MelhorEnvio] Exceção durante a cotação de fretes direta (possível bloqueio CORS do navegador):', msg);
      return [];
    }
  }

  /**
   * Realiza a compra da etiqueta e geração do código de rastreamento no Melhor Envio
   */
  public static async solicitarEnvioMelhorEnvio(
    params: SolicitacaoMelhorEnvioParams
  ): Promise<ResultadoSolicitacaoMelhorEnvio> {
    const { loja, config, pedido, entrega } = params;

    if (!config.melhor_envio_ativo || !config.melhor_envio_token) {
      throw new Error('A integração com Melhor Envio está inativa ou o token não foi configurado.');
    }

    const cepOrigemLimpo = this.limparCep(config.origem_cep || loja.endereco_cep || '');
    const cepDestinoLimpo = this.limparCep(entrega.destino_cep || '');

    if (cepOrigemLimpo.length !== 8 || cepDestinoLimpo.length !== 8) {
      throw new Error('CEPs de origem ou destino inválidos para geração de etiqueta no Melhor Envio.');
    }

    const baseUrl = this.getBaseUrl(config.melhor_envio_sandbox_mode);
    const token = config.melhor_envio_token.trim();

    // Payload de inserção no carrinho do Melhor Envio
    const cartPayload = {
      service: Number(entrega.servico_codigo) || 1, // 1: Correios PAC, 2: SEDEX, 3: Jadlog .Package, 4: .Com
      agency: null,
      from: {
        name: loja.nome_fantasia || 'HUBI PDV',
        phone: loja.whatsapp ? loja.whatsapp.replace(/\D/g, '') : '11999999999',
        email: loja.email || 'contato@loja.com.br',
        document: loja.numero_documento ? loja.numero_documento.replace(/\D/g, '') : '00000000000',
        address: config.origem_logradouro || loja.endereco_logradouro || 'Rua Principal',
        complement: config.origem_complemento || '',
        number: config.origem_numero || loja.endereco_numero || '100',
        district: config.origem_bairro || loja.endereco_bairro || 'Centro',
        city: config.origem_cidade || loja.endereco_cidade || 'São Paulo',
        state_abbr: config.origem_uf || loja.endereco_estado || 'SP',
        postal_code: cepOrigemLimpo
      },
      to: {
        name: pedido.cliente?.nome || pedido.cliente_nome_avulso || 'Cliente',
        phone: pedido.cliente?.whatsapp ? pedido.cliente.whatsapp.replace(/\D/g, '') : '11999999999',
        email: pedido.cliente?.email || 'cliente@hubi.app',
        document: pedido.cliente?.numero_documento ? pedido.cliente.numero_documento.replace(/\D/g, '') : '00000000000',
        address: entrega.destino_logradouro || 'Rua',
        complement: entrega.destino_complemento || '',
        number: entrega.destino_numero || 'S/N',
        district: entrega.destino_bairro || 'Bairro',
        city: entrega.destino_cidade || 'Cidade',
        state_abbr: entrega.destino_uf || 'SP',
        postal_code: cepDestinoLimpo
      },
      products: this.formatarProdutosPayload(
        (pedido.itens || []).map(i => ({
          nome: i.nome_produto,
          quantidade: Number(i.quantidade || 1),
          preco_unitario: Number(i.preco_venda_unitario || 0),
          peso_kg: 0.3
        })),
        Number(pedido.valor_total || 0)
      )
    };

    try {
      const cartResponse = await fetch(`${baseUrl}/api/v2/me/cart`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'HUBI Sistema (suporte@hubi.app)'
        },
        body: JSON.stringify(cartPayload)
      });

      if (!cartResponse.ok) {
        const errText = await cartResponse.text();
        throw new Error(`Erro ao adicionar envio ao Melhor Envio (${cartResponse.status}): ${errText}`);
      }

      const cartData = await cartResponse.json();
      const orderId = cartData.id;

      // Executa checkout da etiqueta
      const checkoutRes = await fetch(`${baseUrl}/api/v2/me/shipment/checkout`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'HUBI Sistema (suporte@hubi.app)'
        },
        body: JSON.stringify({ orders: [orderId] })
      });

      if (!checkoutRes.ok) {
        const checkoutErr = await checkoutRes.text();
        console.warn('[MelhorEnvio] Aviso ao executar checkout da etiqueta:', checkoutErr);
      }

      // Solicita geração da etiqueta
      const generateRes = await fetch(`${baseUrl}/api/v2/me/shipment/generate`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'HUBI Sistema (suporte@hubi.app)'
        },
        body: JSON.stringify({ orders: [orderId] })
      });

      if (!generateRes.ok) {
        const genErr = await generateRes.text();
        console.warn('[MelhorEnvio] Aviso ao solicitar geração da etiqueta:', genErr);
      }

      // Consulta os dados atualizados do pedido para obter o código de rastreio oficial gerado
      let codigoRastreio = cartData.tracking || cartData.protocol || '';
      if (!codigoRastreio) {
        try {
          const orderRes = await fetch(`${baseUrl}/api/v2/me/orders/${orderId}`, {
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${token}`,
              'User-Agent': 'HUBI Sistema (suporte@hubi.app)'
            }
          });
          if (orderRes.ok) {
            const orderData = await orderRes.json();
            codigoRastreio = orderData.tracking || orderData.protocol || '';
          }
        } catch (eOrder) {
          console.warn('[MelhorEnvio] Aviso ao consultar tracking oficial da ordem:', eOrder);
        }
      }

      if (!codigoRastreio) {
        codigoRastreio = String(orderId);
      }

      const linkRastreioOficial = `https://melhorrastreio.com.br/rastreio/${codigoRastreio}`;
      const linkEtiqueta = `${baseUrl}/painel/envios`;

      return {
        ordem_id: String(orderId),
        codigo_rastreio: String(codigoRastreio),
        link_etiqueta: linkEtiqueta,
        link_rastreio: linkRastreioOficial,
        transportadora: entrega.transportadora_nome || 'Melhor Envio'
      };
    } catch (err: any) {
      console.error('[MelhorEnvio] Erro na solicitação de despacho:', err);
      throw err;
    }
  }
}
