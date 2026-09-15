import { LojaShippingConfig, OpcaoFreteCotada, CotacaoItemProduto } from '../types/shipping';

import { supabase } from '../lib/supabase';

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
}
