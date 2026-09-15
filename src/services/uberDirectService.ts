import { LojaShippingConfig, OpcaoFreteCotada, CotacaoItemProduto } from '../types/shipping';
import { supabase } from '../lib/supabase';

interface UberDeliveryQuoteRequest {
  pickup_address: string;
  dropoff_address: string;
}

interface UberDeliveryQuoteResponse {
  id?: string;
  fee?: number; // em centavos ou valor monetário dependendo da versão
  currency_type?: string;
  duration?: number; // em minutos
  pickup_eta?: string;
  dropoff_eta?: string;
  code?: string;
  message?: string;
  kind?: string;
}

export class UberDirectService {
  private static tokenCache: { token: string; expiresAt: number } | null = null;

  private static getBaseUrl(sandbox: boolean): string {
    return sandbox
      ? 'https://sandbox-api.uber.com'
      : 'https://api.uber.com';
  }

  /**
   * Formata e valida a resposta da Uber para o objeto OpcaoFreteCotada
   */
  private static formatarOpcaoUber(responseData: UberDeliveryQuoteResponse): OpcaoFreteCotada | null {
    const msg = (responseData.message || responseData.code || '').toLowerCase();
    if (msg.includes('tax_form_required') || msg.includes('customer_blocked')) {
      console.warn('[UberDirect] Conta com pendência de formulário fiscal em direct.uber.com:', responseData.message);
      return {
        id: 'uber-blocked',
        provedor: 'uber',
        transportadora_nome: 'Uber Direct',
        servico_codigo: 'uber_blocked',
        servico_nome: 'Uber Direct (Aviso Cadastral)',
        valor_frete: 0,
        prazo_estimado_texto: 'Regularize em direct.uber.com',
        icone_tipo: 'uber',
        erro: 'Conta com pendência de formulário fiscal no painel da Uber Direct.'
      };
    }

    if (
      msg.includes('distance') ||
      msg.includes('radius') ||
      msg.includes('coverage') ||
      msg.includes('unsupported')
    ) {
      console.warn('[UberDirect] Entrega indisponível para esta localidade (raio excedido ou fora de cobertura).');
      return null;
    }

    // Uber retorna taxa em centavos na maioria dos endpoints de entrega direta
    const taxaEmReais = typeof responseData.fee === 'number'
      ? (responseData.fee > 100 ? responseData.fee / 100 : responseData.fee)
      : 15.00;

    const duracaoMinutos = responseData.duration || 45;
    const prazoTexto = duracaoMinutos <= 60 
      ? `Aprox. ${duracaoMinutos} min (Entrega Imediata)`
      : `Aprox. ${(duracaoMinutos / 60).toFixed(1)} h (Entrega Imediata)`;

    return {
      id: `uber-direct-${Date.now()}`,
      provedor: 'uber',
      transportadora_nome: 'Uber Direct',
      servico_codigo: 'uber_flash',
      servico_nome: 'Uber Flash / Moto',
      valor_frete: Number(taxaEmReais.toFixed(2)),
      prazo_estimado_texto: prazoTexto,
      icone_tipo: 'uber'
    };
  }

  /**
   * Obtém token de autenticação OAuth2 (Client Credentials)
   */
  public static async obterTokenAutenticacao(config: LojaShippingConfig): Promise<string> {
    const agora = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > agora + 60000) {
      return this.tokenCache.token;
    }

    if (!config.uber_client_id || !config.uber_client_secret) {
      throw new Error('Credenciais Uber Direct não configuradas (Client ID / Client Secret ausentes).');
    }

    // Tenta via Proxy Local / Vite primeiro
    try {
      const proxyTokenRes = await fetch('/api/shipping/uber-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: config.uber_client_id.trim(),
          client_secret: config.uber_client_secret.trim()
        })
      });

      if (proxyTokenRes.ok) {
        const tokenData = await proxyTokenRes.json();
        if (tokenData.access_token) {
          this.tokenCache = {
            token: tokenData.access_token,
            expiresAt: agora + ((tokenData.expires_in || 3600) * 1000)
          };
          return tokenData.access_token;
        }
      }
    } catch {
      // continua para chamada direta
    }

    const tokenUrl = 'https://login.uber.com/oauth/v2/token';
    const params = new URLSearchParams();
    params.append('client_id', config.uber_client_id.trim());
    params.append('client_secret', config.uber_client_secret.trim());
    params.append('grant_type', 'client_credentials');
    params.append('scope', 'eats.deliveries');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Falha na autenticação com Uber Direct (${response.status}): ${errBody}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    this.tokenCache = {
      token: data.access_token,
      expiresAt: agora + (data.expires_in * 1000)
    };

    return data.access_token;
  }

  /**
   * Realiza a cotação de frete imediato com Uber Direct
   */
  public static async cotarEntrega(
    config: LojaShippingConfig,
    destinoEnderecoCompleto: string,
    itens: CotacaoItemProduto[]
  ): Promise<OpcaoFreteCotada | null> {
    if (!config.uber_ativo) {
      return null;
    }

    if (!config.uber_customer_id) {
      return null;
    }

    const enderecoOrigem = [
      config.origem_logradouro,
      config.origem_numero,
      config.origem_bairro,
      config.origem_cidade,
      config.origem_uf,
      config.origem_cep
    ].filter(Boolean).join(', ');

    // -------------------------------------------------------------------------
    // MÉTODO 1: Supabase RPC (PostgreSQL extensions.http) - Sem Bloqueio de CORS
    // -------------------------------------------------------------------------
    try {
      if (config.loja_id) {
        console.log('[UberDirect] Tentando cotação via Supabase RPC (sem CORS)...');
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('cotar_frete_uber_rpc', {
          p_loja_id: config.loja_id,
          p_pickup_address: enderecoOrigem,
          p_dropoff_address: destinoEnderecoCompleto
        });

        if (!rpcErr && rpcRes) {
          if (rpcRes.sucesso && rpcRes.dados) {
            console.log('[UberDirect] Cotação obtida via Supabase RPC com sucesso:', rpcRes.dados);
            return this.formatarOpcaoUber(rpcRes.dados);
          } else if (rpcRes.dados) {
            return this.formatarOpcaoUber(rpcRes.dados);
          }
        }

        if (rpcErr) {
          console.info('[UberDirect] Supabase RPC não instalada ou indisponível:', rpcErr.message);
        }
      }
    } catch (e: any) {
      console.info('[UberDirect] Exceção ao tentar RPC Supabase:', e.message);
    }

    // -------------------------------------------------------------------------
    // MÉTODO 2: Proxy Local / Vite (/api/shipping/uber-quote)
    // -------------------------------------------------------------------------
    try {
      const token = await this.obterTokenAutenticacao(config);
      const baseUrl = this.getBaseUrl(config.uber_sandbox_mode);
      const endpoint = `${baseUrl}/v1/customers/${encodeURIComponent(config.uber_customer_id.trim())}/delivery_quotes`;

      const proxyQuoteRes = await fetch('/api/shipping/uber-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint,
          token,
          payload: {
            pickup_address: enderecoOrigem,
            dropoff_address: destinoEnderecoCompleto
          }
        })
      });

      if (proxyQuoteRes.ok) {
        const quoteData = await proxyQuoteRes.json() as UberDeliveryQuoteResponse;
        console.log('[UberDirect] Cotação obtida via proxy local com sucesso:', quoteData);
        return this.formatarOpcaoUber(quoteData);
      }
    } catch {
      // Proxy local indisponível, segue para chamada direta
    }

    // -------------------------------------------------------------------------
    // MÉTODO 3: Chamada Direta via Browser (pode sofrer CORS em SPAs hospedadas)
    // -------------------------------------------------------------------------
    try {
      const token = await this.obterTokenAutenticacao(config);
      const baseUrl = this.getBaseUrl(config.uber_sandbox_mode);
      const endpoint = `${baseUrl}/v1/customers/${encodeURIComponent(config.uber_customer_id.trim())}/delivery_quotes`;

      const payload: UberDeliveryQuoteRequest = {
        pickup_address: enderecoOrigem,
        dropoff_address: destinoEnderecoCompleto
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseData = await response.json() as UberDeliveryQuoteResponse;

      if (!response.ok) {
        return this.formatarOpcaoUber(responseData);
      }

      return this.formatarOpcaoUber(responseData);
    } catch (err: unknown) {
      const erroMsg = err instanceof Error ? err.message : String(err);
      console.warn('[UberDirect] Falha graciosa na cotação direta (possível bloqueio CORS do navegador):', erroMsg);
      return null;
    }
  }
}
