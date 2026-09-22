import { LojaShippingConfig, OpcaoFreteCotada, CotacaoItemProduto, PedidoEntrega } from '../types/shipping';
import { Loja, Pedido } from '../types';
import { supabase } from '../lib/supabase';

export interface SolicitacaoMelhorEnvioParams {
  loja: Loja;
  config: LojaShippingConfig;
  pedido: Pedido;
  entrega: PedidoEntrega;
  usuarioId?: string | null;
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
   * Converte itens do pedido para o formato de produtos do carrinho da API v2 do Melhor Envio
   * Exige: name, quantity, unitary_value, weight
   */
  private static formatarProdutosCartPayload(
    itens?: Array<{ nome_produto?: string; nome?: string; quantidade?: number; preco_venda_unitario?: number; preco_unitario?: number; peso_kg?: number }>,
    valorTotal = 1.00
  ): Array<{ name: string; quantity: number; unitary_value: number; weight: number }> {
    if (!itens || itens.length === 0) {
      return [
        {
          name: 'Mercadoria',
          quantity: 1,
          unitary_value: Math.max(1.00, Number(valorTotal) || 1.00),
          weight: 0.5
        }
      ];
    }

    return itens.map((it, idx) => ({
      name: String(it.nome_produto || it.nome || `Produto ${idx + 1}`).trim().slice(0, 100),
      quantity: Math.max(1, Math.round(Number(it.quantidade) || 1)),
      unitary_value: Math.max(0.01, Number(it.preco_venda_unitario ?? it.preco_unitario ?? 1.00)),
      weight: Math.max(0.1, Number(it.peso_kg || 0.3))
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
   * através de Supabase Edge Function ou RPC segura (sem bloqueio de CORS no navegador).
   */
  public static async solicitarEnvioMelhorEnvio(
    params: SolicitacaoMelhorEnvioParams
  ): Promise<ResultadoSolicitacaoMelhorEnvio> {
    const { loja, config, pedido, entrega, usuarioId } = params;

    if (!config.melhor_envio_ativo || !config.melhor_envio_token) {
      throw new Error('A integração com Melhor Envio está inativa ou o token não foi configurado.');
    }

    const cepOrigemLimpo = this.limparCep(config.origem_cep || loja.endereco_cep || '');
    const cepDestinoLimpo = this.limparCep(entrega.destino_cep || '');

    if (cepOrigemLimpo.length !== 8 || cepDestinoLimpo.length !== 8) {
      throw new Error('CEPs de origem ou destino inválidos para geração de etiqueta no Melhor Envio.');
    }

    const baseUrl = this.getBaseUrl(config.melhor_envio_sandbox_mode);

    const isSandbox = Boolean(config.melhor_envio_sandbox_mode);

    // Validação de Documento da Loja (Remetente)
    let docLoja = (loja.numero_documento || '').replace(/\D/g, '');
    if (!docLoja || (docLoja.length !== 11 && docLoja.length !== 14)) {
      if (isSandbox) {
        docLoja = '16571723000105'; // CNPJ homologado de testes para sandbox
      } else {
        throw new Error('A sua loja precisa de um CNPJ ou CPF válido cadastrado para emitir fretes no Melhor Envio. Atualize os dados da loja nas configurações.');
      }
    }

    // Validação de Documento do Cliente (Destinatário)
    let docCliente = (pedido.cliente?.numero_documento || pedido.cliente_documento_avulso || '').replace(/\D/g, '');
    if (!docCliente || (docCliente.length !== 11 && docCliente.length !== 14)) {
      if (isSandbox && !docCliente) {
        docCliente = '01234567890'; // CPF de testes
      } else {
        throw new Error('O CPF/CNPJ do cliente é obrigatório para emissão de frete via Melhor Envio.');
      }
    }

    const productsCart = this.formatarProdutosCartPayload(
      (pedido.itens || []).map(i => ({
        nome_produto: i.nome_produto,
        quantidade: Number(i.quantidade || 1),
        preco_venda_unitario: Number(i.preco_venda_unitario || 0),
        peso_kg: 0.3
      })),
      Number(pedido.valor_total || 0)
    );

    const pesoTotal = productsCart.reduce((acc, p) => acc + (p.weight * p.quantity), 0);
    const valorSeguro = productsCart.reduce((acc, p) => acc + (p.unitary_value * p.quantity), 0);

    // Payload de inserção no carrinho do Melhor Envio
    const cartPayload = {
      service: Number(entrega.servico_codigo) || 1, // 1: Correios PAC, 2: SEDEX, 3: Jadlog .Package, 4: .Com
      agency: null,
      from: {
        name: loja.nome_fantasia || 'HUBI PDV',
        phone: loja.whatsapp ? loja.whatsapp.replace(/\D/g, '') : '11999999999',
        email: loja.email || 'contato@loja.com.br',
        document: docLoja,
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
        document: docCliente,
        address: entrega.destino_logradouro || 'Rua',
        complement: entrega.destino_complemento || '',
        number: entrega.destino_numero || 'S/N',
        district: entrega.destino_bairro || 'Bairro',
        city: entrega.destino_cidade || 'Cidade',
        state_abbr: entrega.destino_uf || 'SP',
        postal_code: cepDestinoLimpo
      },
      products: productsCart,
      volumes: [
        {
          height: 10,
          width: 15,
          length: 20,
          weight: Math.max(0.1, Number(pesoTotal.toFixed(2)))
        }
      ],
      options: {
        insurance_value: Number(valorSeguro.toFixed(2)),
        receipt: false,
        own_hand: false,
        reverse: false,
        non_commercial: true
      }
    };

    // -------------------------------------------------------------------------
    // MÉTODO 1: Supabase Edge Function 'melhor-envio-despacho' (Backend Deno sem CORS)
    // -------------------------------------------------------------------------
    try {
      console.log('[MelhorEnvio] Invocando Edge Function melhor-envio-despacho...');
      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('melhor-envio-despacho', {
        body: {
          pedidoId: pedido.id,
          loja_id: config.loja_id,
          usuarioId: usuarioId || null,
          isSandbox: Boolean(config.melhor_envio_sandbox_mode),
          payload: cartPayload
        }
      });

      if (!edgeErr && edgeData && edgeData.sucesso) {
        console.log('[MelhorEnvio] Despacho realizado com sucesso via Edge Function.');
        return {
          ordem_id: String(edgeData.ordem_id),
          codigo_rastreio: String(edgeData.codigo_rastreio),
          link_etiqueta: edgeData.link_etiqueta || `${baseUrl}/painel/envios`,
          link_rastreio: edgeData.link_rastreio || `https://melhorrastreio.com.br/rastreio/${edgeData.codigo_rastreio}`,
          transportadora: edgeData.transportadora || entrega.transportadora_nome || 'Melhor Envio'
        };
      }

      if (edgeErr) {
        let detalheErro = edgeErr.message || 'Falha na comunicação com o servidor do Melhor Envio.';
        try {
          if (edgeErr.context && typeof edgeErr.context.json === 'function') {
            const jsonErr = await edgeErr.context.json();
            detalheErro = jsonErr.error || jsonErr.message || JSON.stringify(jsonErr);
          }
        } catch {
          // Mantém mensagem padrão
        }

        // Se a Edge Function não estiver instalada (404 / Function not found / network error), faz fallback para a RPC do Supabase
        const errLower = detalheErro.toLowerCase();
        if (
          errLower.includes('function not found') ||
          errLower.includes('404') ||
          errLower.includes('failed to send a request') ||
          errLower.includes('functionsfetcherror')
        ) {
          console.info('[MelhorEnvio] Edge Function indisponível. Tentando fallback para Supabase RPC despachar_melhor_envio_rpc...');
        } else {
          throw new Error(detalheErro);
        }
      } else if (edgeData && !edgeData.sucesso && edgeData.error) {
        throw new Error(edgeData.error);
      }
    } catch (eEdge: any) {
      const msgEdge = eEdge.message || String(eEdge);
      if (
        !msgEdge.toLowerCase().includes('function not found') &&
        !msgEdge.toLowerCase().includes('404') &&
        !msgEdge.toLowerCase().includes('failed to send a request') &&
        !msgEdge.toLowerCase().includes('functionsfetcherror')
      ) {
        throw eEdge;
      }
    }

    // -------------------------------------------------------------------------
    // MÉTODO 2: Supabase RPC (PostgreSQL extensions.http) - Sem Bloqueio de CORS
    // -------------------------------------------------------------------------
    try {
      console.log('[MelhorEnvio] Executando despacho via Supabase RPC despachar_melhor_envio_rpc...');
      const { data: rpcData, error: rpcError } = await supabase.rpc('despachar_melhor_envio_rpc', {
        p_loja_id: config.loja_id,
        p_pedido_id: pedido.id,
        p_payload: cartPayload
      });

      if (!rpcError && rpcData && rpcData.sucesso) {
        console.log('[MelhorEnvio] Despacho realizado com sucesso via Supabase RPC.');
        return {
          ordem_id: String(rpcData.ordem_id),
          codigo_rastreio: String(rpcData.codigo_rastreio),
          link_etiqueta: rpcData.link_etiqueta || `${baseUrl}/painel/envios`,
          link_rastreio: rpcData.link_rastreio || `https://melhorrastreio.com.br/rastreio/${rpcData.codigo_rastreio}`,
          transportadora: entrega.transportadora_nome || 'Melhor Envio'
        };
      }

      if (rpcError) {
        console.error('[MelhorEnvio] Erro na chamada RPC:', rpcError.message);
        throw new Error(`Falha no servidor ao gerar envio: ${rpcError.message}`);
      }

      if (rpcData && !rpcData.sucesso) {
        throw new Error(rpcData.erro || 'Falha ao processar etiqueta no Melhor Envio.');
      }
    } catch (eRpc: any) {
      console.error('[MelhorEnvio] Exceção no fallback RPC:', eRpc);
      throw eRpc;
    }

    throw new Error('Não foi possível se comunicar com o Melhor Envio. Verifique sua conexão e configurações.');
  }
}
