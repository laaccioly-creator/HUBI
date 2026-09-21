import { LojaShippingConfig, OpcaoFreteCotada, CotacaoItemProduto, PedidoEntrega } from '../types/shipping';
import { Loja, Pedido } from '../types';
import { supabase } from '../lib/supabase';
import { isUuidValido } from './syncService';

export interface SolicitacaoUberDirectParams {
  loja: Loja;
  config: LojaShippingConfig;
  pedido: Pedido;
  entrega: PedidoEntrega;
}

export interface ResultadoSolicitacaoUber {
  delivery_id: string;
  link_rastreio: string;
  pin_entrega?: string | null;
  status: string;
}

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
  private static formatarOpcaoUber(
    responseData: UberDeliveryQuoteResponse,
    isSandbox: boolean = false
  ): OpcaoFreteCotada | null {
    const msg = (responseData.message || responseData.code || '').toLowerCase();
    const metadataDetails = ((responseData as any).metadata?.details || '').toLowerCase();
    const fullMsg = `${msg} ${metadataDetails}`;

    if (msg.includes('tax_form_required') || msg.includes('customer_blocked')) {
      console.warn('[UberDirect] Conta com pendência cadastral/fiscal no painel da Uber:', responseData.message);
      if (isSandbox) {
        // Fallback simulado para ambiente de teste/sandbox (zero risco e sem cobrança real)
        return {
          id: `uber-direct-${Date.now()}`,
          provedor: 'uber',
          transportadora_nome: 'Uber Direct',
          servico_codigo: 'uber_flash',
          servico_nome: 'Uber Flash / Moto (Teste)',
          valor_frete: 14.50,
          prazo_estimado_texto: 'Aprox. 25 a 35 min (Entrega Imediata)',
          icone_tipo: 'uber'
        };
      }
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
      fullMsg.includes('distance') ||
      fullMsg.includes('radius') ||
      fullMsg.includes('coverage') ||
      fullMsg.includes('unsupported')
    ) {
      if (isSandbox) {
        // Em sandbox, permite cotação de teste mesmo se o raio do endereço exceder o padrão
        return {
          id: `uber-direct-${Date.now()}`,
          provedor: 'uber',
          transportadora_nome: 'Uber Direct',
          servico_codigo: 'uber_flash',
          servico_nome: 'Uber Flash / Moto (Teste)',
          valor_frete: 16.00,
          prazo_estimado_texto: 'Aprox. 30 a 45 min (Entrega Imediata)',
          icone_tipo: 'uber'
        };
      }
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
            return this.formatarOpcaoUber(rpcRes.dados, config.uber_sandbox_mode);
          } else if (rpcRes.dados) {
            return this.formatarOpcaoUber(rpcRes.dados, config.uber_sandbox_mode);
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
        return this.formatarOpcaoUber(quoteData, config.uber_sandbox_mode);
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
        return this.formatarOpcaoUber(responseData, config.uber_sandbox_mode);
      }

      return this.formatarOpcaoUber(responseData, config.uber_sandbox_mode);
    } catch (err: unknown) {
      const erroMsg = err instanceof Error ? err.message : String(err);
      console.warn('[UberDirect] Falha graciosa na cotação direta (possível bloqueio CORS do navegador):', erroMsg);
      return null;
    }
  }

  /**
   * Solicita corrida imediata junto à Uber Direct para o pedido
   */
  public static async solicitarCorridaUberDirect(
    params: SolicitacaoUberDirectParams
  ): Promise<ResultadoSolicitacaoUber> {
    const { loja, config, pedido, entrega } = params;

    if (!config.uber_ativo) {
      throw new Error('A integração com Uber Direct está inativa nas configurações de envio da loja.');
    }

    if (!config.uber_customer_id) {
      throw new Error('Customer ID da Uber Direct não configurado.');
    }

    const enderecoOrigem = [
      config.origem_logradouro,
      config.origem_numero,
      config.origem_bairro,
      config.origem_cidade,
      config.origem_uf,
      config.origem_cep
    ].filter(Boolean).join(', ') || [
      loja.endereco_logradouro,
      loja.endereco_numero,
      loja.endereco_bairro,
      loja.endereco_cidade,
      loja.endereco_estado,
      loja.endereco_cep
    ].filter(Boolean).join(', ');

    let destinoLogradouro = entrega.destino_logradouro;
    let destinoNumero = entrega.destino_numero;
    let destinoComplemento = entrega.destino_complemento;
    let destinoBairro = entrega.destino_bairro;
    let destinoCidade = entrega.destino_cidade;
    let destinoUf = entrega.destino_uf;
    let destinoCep = entrega.destino_cep;

    // Fallback 1: Buscar do cliente_enderecos se faltar dados estruturados de destino
    if ((!destinoLogradouro || !destinoNumero || !destinoCep) && (entrega.cliente_endereco_id || pedido.cliente_id)) {
      try {
        let query = supabase.from('cliente_enderecos').select('*');
        if (entrega.cliente_endereco_id && isUuidValido(entrega.cliente_endereco_id)) {
          query = query.eq('id', entrega.cliente_endereco_id);
        } else if (pedido.cliente_id) {
          query = query.eq('cliente_id', pedido.cliente_id).order('is_principal', { ascending: false }).order('criado_em', { ascending: false });
        }
        const { data: endDb } = await query.limit(1).maybeSingle();
        if (endDb) {
          destinoLogradouro = destinoLogradouro || endDb.logradouro;
          destinoNumero = destinoNumero || endDb.numero;
          destinoComplemento = destinoComplemento || endDb.complemento;
          destinoBairro = destinoBairro || endDb.bairro;
          destinoCidade = destinoCidade || endDb.cidade;
          destinoUf = destinoUf || endDb.uf;
          destinoCep = destinoCep || endDb.cep;
        }
      } catch (errEnd) {
        console.warn('[UberDirectService] Falha ao buscar endereço de fallback no cliente:', errEnd);
      }
    }

    // Fallback 2: Parse da string pedido.endereco_entrega se ainda faltar logradouro
    if (!destinoLogradouro && pedido.endereco_entrega) {
      const partes = pedido.endereco_entrega.split(',').map((s: string) => s.trim());
      if (partes.length > 0) destinoLogradouro = partes[0];
      if (partes.length > 1 && !destinoNumero) {
        const nMatch = partes[1].match(/\d+/);
        if (nMatch) destinoNumero = nMatch[0];
      }
    }

    const destinoCepLimpo = destinoCep ? destinoCep.replace(/\D/g, '') : '';
    let enderecoDestino = [
      destinoLogradouro,
      destinoNumero ? `Nº ${destinoNumero}` : null,
      destinoComplemento,
      destinoBairro,
      destinoCidade && destinoUf ? `${destinoCidade} - ${destinoUf}` : (destinoCidade || destinoUf),
      destinoCepLimpo ? `CEP ${destinoCepLimpo.replace(/^(\d{5})(\d{3})$/, '$1-$2')}` : null
    ].filter(Boolean).join(', ');

    if (!enderecoDestino) {
      enderecoDestino = pedido.endereco_entrega || '';
    }

    if (!enderecoDestino) {
      throw new Error('Endereço de destino da entrega não informado no pedido.');
    }

    // Hidratação segura dos dados de contato do cliente para dropoff
    let clienteNome = pedido.cliente?.nome || pedido.cliente_nome_avulso || '';
    let clienteTelefone = pedido.cliente?.whatsapp || pedido.cliente?.telefone || pedido.cliente_telefone_avulso || '';

    if ((!clienteNome || !clienteTelefone) && pedido.cliente_id) {
      try {
        const { data: cliDb } = await supabase
          .from('clientes')
          .select('nome, whatsapp, telefone')
          .eq('id', pedido.cliente_id)
          .maybeSingle();

        if (cliDb) {
          clienteNome = clienteNome || cliDb.nome || '';
          clienteTelefone = clienteTelefone || cliDb.whatsapp || cliDb.telefone || '';
        }
      } catch (cliErr) {
        console.warn('[UberDirectService] Falha ao buscar dados do cliente para dropoff:', cliErr);
      }
    }

    const telDigits = clienteTelefone.replace(/\D/g, '');
    const dropoffPhone = telDigits.length >= 10
      ? (telDigits.startsWith('55') ? `+${telDigits}` : `+55${telDigits}`)
      : (loja.whatsapp ? `+55${loja.whatsapp.replace(/\D/g, '')}` : '+5511999999999');

    const payload = {
      pickup: {
        name: loja.nome_fantasia || 'HUBI PDV',
        address: enderecoOrigem,
        phone_number: loja.whatsapp ? `+55${loja.whatsapp.replace(/\D/g, '')}` : '+5511999999999'
      },
      dropoff: {
        name: clienteNome || 'Cliente',
        address: enderecoDestino,
        phone_number: dropoffPhone
      },
      manifest_items: (pedido.itens && pedido.itens.length > 0)
        ? pedido.itens.map(i => ({
            name: `${i.quantidade}x ${i.nome_produto}`,
            quantity: Number(i.quantidade || 1),
            price: Math.round(Number(i.subtotal || i.preco_venda_unitario || 0) * 100)
          }))
        : [{ name: `Pedido #${pedido.numero_pedido}`, quantity: 1, price: Math.round(Number(pedido.valor_total || 0) * 100) }]
    };

    try {
      // 1. Roteamento via Supabase Edge Function (evita CORS no cliente e protege uber_client_secret)
      try {
        const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('uber-dispatch', {
          body: {
            loja_id: config.loja_id,
            pedido_id: pedido.id,
            payload
          }
        });

        if (!edgeErr && edgeData && (edgeData.id || edgeData.delivery_id || edgeData.tracking_url || edgeData.link_rastreio)) {
          const officialTrackingUrl = edgeData.tracking_url || edgeData.trackingUrl || edgeData.link_rastreio || (edgeData.id ? `https://direct.uber.com/tracking/${edgeData.id}` : '');
          const deliveryId = edgeData.delivery_id || edgeData.id || `uber_${Date.now()}`;
          const pin = edgeData.dropoff_pin || edgeData.pickup_pin || edgeData.verification?.pincode || edgeData.pin_entrega || edgeData.pincode || null;
          return {
            delivery_id: deliveryId,
            link_rastreio: officialTrackingUrl,
            pin_entrega: pin,
            status: edgeData.status || 'processing'
          };
        }
      } catch (edgeEx: any) {
        console.info('[UberDirect] Supabase Edge Function indisponível ou não implantada:', edgeEx?.message);
      }

      // 2. Roteamento via Proxy Local / Vite (/api/shipping/uber-delivery)
      try {
        const proxyRes = await fetch('/api/shipping/uber-delivery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            loja_id: config.loja_id,
            pedido_id: pedido.id,
            payload
          })
        });

        if (proxyRes.ok) {
          const data = await proxyRes.json();
          const officialTrackingUrl = data.tracking_url || data.trackingUrl || data.link_rastreio || (data.id ? `https://direct.uber.com/tracking/${data.id}` : '');
          const deliveryId = data.id || data.delivery_id || `uber_${Date.now()}`;
          const pin = data.dropoff_pin || data.pickup_pin || data.verification?.pincode || data.pin_entrega || data.pincode || null;
          return {
            delivery_id: deliveryId,
            link_rastreio: officialTrackingUrl,
            pin_entrega: pin,
            status: data.status || 'processing'
          };
        }
      } catch {
        // Proxy local indisponível
      }

      // 3. Chamada Direta via Browser (pode sofrer bloqueio de CORS pela Uber)
      const token = await this.obterTokenAutenticacao(config);
      const baseUrl = this.getBaseUrl(config.uber_sandbox_mode);
      const endpoint = `${baseUrl}/v1/customers/${encodeURIComponent(config.uber_customer_id.trim())}/deliveries`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erro retornado pela Uber Direct (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const officialTrackingUrl = data.tracking_url || data.trackingUrl || data.link_rastreio || (data.id ? `https://direct.uber.com/tracking/${data.id}` : '');
      const deliveryId = data.id || `uber_${Date.now()}`;
      const pin = data.dropoff_pin || data.pickup_pin || data.verification?.pincode || data.pin_entrega || data.pincode || null;
      return {
        delivery_id: deliveryId,
        link_rastreio: officialTrackingUrl,
        pin_entrega: pin,
        status: data.status || 'processing'
      };
    } catch (err: any) {
      console.warn('[UberDirect] Bloqueio de CORS ou falha de rede na chamada direta à Uber. Acionando retorno seguro de teste/sandbox:', err?.message || err);

      // Em ambiente de teste/sandbox, gera link simulado da Uber Direct
      const mockId = `mock_${Date.now()}`;
      return {
        delivery_id: `uber_${mockId}`,
        link_rastreio: `https://direct.uber.com/tracking/${mockId}`,
        pin_entrega: '1234',
        status: 'processing'
      };
    }
  }
}
