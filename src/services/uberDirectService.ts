import { LojaShippingConfig, OpcaoFreteCotada, CotacaoItemProduto } from '../types/shipping';

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
        // Tratamento gracioso de erro: raio excedido ou endereço não coberto
        const msg = (responseData.message || responseData.code || '').toLowerCase();
        if (
          response.status === 400 ||
          response.status === 422 ||
          msg.includes('distance') ||
          msg.includes('radius') ||
          msg.includes('coverage') ||
          msg.includes('unsupported')
        ) {
          console.warn('[UberDirect] Entrega indisponível para esta localidade (raio excedido ou fora de cobertura).');
          return null;
        }

        console.warn(`[UberDirect] Erro na cotação (${response.status}):`, responseData);
        return null;
      }

      // Uber retorna taxa em centavos na maioria dos endpoints de entrega direta
      const taxaEmReais = typeof responseData.fee === 'number'
        ? (responseData.fee > 100 ? responseData.fee / 100 : responseData.fee)
        : 15.00; // Fallback se retornado sem taxa explícita

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
    } catch (err: unknown) {
      const erroMsg = err instanceof Error ? err.message : String(err);
      console.warn('[UberDirect] Falha graciosa na cotação:', erroMsg);
      return null;
    }
  }
}
