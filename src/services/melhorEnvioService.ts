import { LojaShippingConfig, OpcaoFreteCotada, CotacaoItemProduto, PedidoEntrega, PacoteEnvioCotacao } from '../types/shipping';
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

interface MelhorEnvioPackagePayload {
  width: number;
  height: number;
  length: number;
  weight: number;
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

interface MelhorEnvioVolumePayload {
  width: number;
  height: number;
  length: number;
  weight: number;
}

interface MelhorEnvioCalculatePayload {
  from: {
    postal_code: string;
  };
  to: {
    postal_code: string;
  };
  volumes?: MelhorEnvioVolumePayload[];
  products?: MelhorEnvioProductPayload[];
  options?: {
    insurance_value?: number;
    receipt?: boolean;
    own_hand?: boolean;
  };
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
    subtotal: number,
    config?: LojaShippingConfig
  ): MelhorEnvioProductPayload[] {
    const defW = config?.embalagem_padrao_largura_cm || 15;
    const defH = config?.embalagem_padrao_altura_cm || 10;
    const defL = config?.embalagem_padrao_comprimento_cm || 20;
    const defPeso = config?.embalagem_padrao_peso_kg || 0.3;

    if (!itens || itens.length === 0) {
      // Pacote padrão mínimo se a cesta estiver vazia ou com itens avulsos
      return [
        {
          id: 'padrao-1',
          width: Math.max(10, defW),
          height: Math.max(4, defH),
          length: Math.max(15, defL),
          weight: Math.max(0.1, defPeso),
          insurance_value: Math.max(1, subtotal),
          quantity: 1
        }
      ];
    }

    return itens.map((it, idx) => ({
      id: `item-${idx + 1}`,
      width: Math.max(10, it.largura_cm || defW),
      height: Math.max(4, it.altura_cm || defH),
      length: Math.max(15, it.comprimento_cm || defL),
      weight: Math.max(0.1, it.peso_kg || defPeso),
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
    valorTotal = 1.00,
    config?: LojaShippingConfig
  ): Array<{ name: string; quantity: number; unitary_value: number; weight: number }> {
    const defPeso = config?.embalagem_padrao_peso_kg || 0.3;

    if (!itens || itens.length === 0) {
      return [
        {
          name: 'Mercadoria',
          quantity: 1,
          unitary_value: Math.max(1.00, Number(valorTotal) || 1.00),
          weight: Math.max(0.1, defPeso)
        }
      ];
    }

    return itens.map((it, idx) => ({
      name: String(it.nome_produto || it.nome || `Produto ${idx + 1}`).trim().slice(0, 100),
      quantity: Math.max(1, Math.round(Number(it.quantidade) || 1)),
      unitary_value: Math.max(0.01, Number(it.preco_venda_unitario ?? it.preco_unitario ?? 1.00)),
      weight: Math.max(0.1, Number(it.peso_kg || defPeso))
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
    itens: CotacaoItemProduto[],
    pacote?: PacoteEnvioCotacao
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
      }
    };

    if (pacote && pacote.peso_kg > 0 && pacote.largura_cm > 0 && pacote.altura_cm > 0 && pacote.comprimento_cm > 0) {
      const qteVols = Math.max(1, pacote.quantidade_volumes || 1);
      const pesoPorVol = Number((pacote.peso_kg / qteVols).toFixed(3));

      payload.volumes = Array.from({ length: qteVols }, () => ({
        width: Math.max(10, Math.round(pacote.largura_cm)),
        height: Math.max(2, Math.round(pacote.altura_cm)),
        length: Math.max(15, Math.round(pacote.comprimento_cm)),
        weight: Math.max(0.01, pesoPorVol)
      }));

      payload.options = {
        insurance_value: Math.max(1, subtotal),
        receipt: false,
        own_hand: false
      };
    } else {
      payload.products = this.formatarProdutosPayload(itens, subtotal, config);
    }

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
        peso_kg: (i as any)?.peso_kg || (i as any)?.produto?.peso_kg || config.embalagem_padrao_peso_kg || 0.3
      })),
      Number(pedido.valor_total || 0),
      config
    );

    const pesoTotal = productsCart.reduce((acc, p) => acc + (p.weight * p.quantity), 0);
    const valorSeguro = productsCart.reduce((acc, p) => acc + (p.unitary_value * p.quantity), 0);

    // -------------------------------------------------------------------------
    // 1. Estruture rigorosamente o nó from (Remetente / Loja):
    // -------------------------------------------------------------------------
    const dadosLoja = {
      nome_fantasia: loja.nome_fantasia || (loja as any).razao_social || (loja as any).nome_loja || 'HOTAMAZON',
      razao_social: (loja as any).razao_social || '',
      telefone: loja.whatsapp || loja.telefone || (config as any).origem_telefone || '',
      email: loja.email || (config as any).origem_email || 'contato@hubi.app',
      cnpj: (loja.numero_documento || (loja as any).cnpj || '').replace(/\D/g, ''),
      cpf: ((loja as any).cpf || '').replace(/\D/g, ''),
      logradouro: config.origem_logradouro || loja.endereco_logradouro || (loja as any).logradouro || 'Rua Bélgica',
      complemento: config.origem_complemento || loja.endereco_complemento || (loja as any).complemento || '',
      numero: config.origem_numero || loja.endereco_numero || (loja as any).numero || '945',
      bairro: config.origem_bairro || loja.endereco_bairro || (loja as any).bairro || 'Maraponga',
      cidade: config.origem_cidade || loja.endereco_cidade || (loja as any).cidade || 'Fortaleza',
      uf: (config.origem_uf || loja.endereco_estado || (loja as any).uf || 'CE').toUpperCase().slice(0, 2),
      inscricao_estadual: (loja as any).inscricao_estadual || '',
      cep: (config.origem_cep || loja.endereco_cep || (loja as any).cep || '60710790').replace(/\D/g, '')
    };

    let nomeRemetente = (dadosLoja.nome_fantasia || dadosLoja.razao_social || 'HOTAMAZON').trim();
    if (nomeRemetente.split(/\s+/).filter(Boolean).length < 2) {
      nomeRemetente = `${nomeRemetente} Loja`.trim();
    }

    // -------------------------------------------------------------------------
    // 2. Estruture rigorosamente o nó to (Destinatário / Cliente de Entrega):
    // Garantir que os dados venham EXCLUSIVAMENTE do endereço de entrega do pedido
    // -------------------------------------------------------------------------
    const cliente: any = pedido.cliente || {};
    let endEntregaRaw: any = pedido.endereco_entrega || (entrega as any)?.endereco || {};
    if (typeof endEntregaRaw === 'string') {
      const trimmed = endEntregaRaw.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try { endEntregaRaw = JSON.parse(trimmed); } catch {}
      } else if (trimmed) {
        const partes = trimmed.split(/,\s*|\s*-\s*/);
        const numMatch = trimmed.match(/(?:n[º°]|n\.|num|número)\s*(\d+[a-zA-Z]?|\bSN\b|\bS\/N\b)/i);
        const cepMatch = trimmed.match(/\b(\d{5})[-.\s]?(\d{3})\b/);
        const ufMatch = trimmed.match(/\b([A-Z]{2})\b/);
        endEntregaRaw = {
          logradouro: partes[0] || trimmed,
          numero: numMatch ? numMatch[1] : (partes[1] || 'SN'),
          bairro: partes[2] || '',
          cidade: partes[3] || '',
          uf: ufMatch ? ufMatch[1] : 'PE',
          cep: cepMatch ? `${cepMatch[1]}${cepMatch[2]}` : ''
        };
      }
    }

    const endEntrega = {
      destinatario: endEntregaRaw.destinatario || endEntregaRaw.nome || pedido.cliente_nome_avulso || cliente.nome || 'Cliente',
      logradouro: endEntregaRaw.logradouro || endEntregaRaw.rua || endEntregaRaw.address || entrega.destino_logradouro || cliente.endereco_logradouro || (cliente as any).logradouro || 'Rua Lindolfo Color',
      numero: endEntregaRaw.numero || endEntregaRaw.number || entrega.destino_numero || cliente.endereco_numero || (cliente as any).numero || 'SN',
      complemento: endEntregaRaw.complemento || endEntregaRaw.complement || entrega.destino_complemento || cliente.endereco_complemento || '',
      bairro: endEntregaRaw.bairro || endEntregaRaw.district || entrega.destino_bairro || cliente.endereco_bairro || (cliente as any).bairro || 'Engenho do Meio',
      cidade: endEntregaRaw.cidade || endEntregaRaw.city || entrega.destino_cidade || cliente.endereco_cidade || (cliente as any).cidade || 'Recife',
      uf: (endEntregaRaw.uf || endEntregaRaw.estado || endEntregaRaw.state_abbr || entrega.destino_uf || cliente.endereco_estado || (cliente as any).uf || 'PE').toUpperCase().slice(0, 2),
      cep: (endEntregaRaw.cep || endEntregaRaw.postal_code || entrega.destino_cep || cliente.endereco_cep || (cliente as any).cep || '').replace(/\D/g, '')
    };

    let nomeCliente = (cliente.nome || endEntrega.destinatario || pedido.cliente_nome_avulso || 'Cliente').trim();
    nomeCliente = nomeCliente.replace(/[\/":;,]/g, ' ').replace(/\s+/g, ' ').trim();
    if (nomeCliente.split(/\s+/).filter(Boolean).length < 2) {
      nomeCliente = `${nomeCliente} Cliente`.trim();
    }

    const sanitizarTexto = (txt?: string | null) => (txt || '').replace(/[\/":]/g, ' ').replace(/,{2,}/g, ',').replace(/\s+/g, ' ').trim();
    const sanitizarNum = (num?: string | null) => {
      const n = sanitizarTexto(num);
      return (!n || n.toUpperCase() === 'S/N' || n.toUpperCase() === 'SN') ? 'SN' : n.substring(0, 20);
    };

    const docRemetenteRaw = (loja as any).numero_documento || (loja as any).cnpj || (loja as any).cpf || docLoja || '';
    const docLimpo = String(docRemetenteRaw).replace(/\D/g, '');
    const isSandboxEnv = Boolean(config.melhor_envio_sandbox_mode);

    const cpfResponsavel = String(
      (loja as any).cpf_responsavel ||
      (config as any).cpf_responsavel ||
      (loja as any).cpf ||
      (loja as any).responsavel_cpf ||
      ''
    ).replace(/\D/g, '');

    let documentoFinalRemetente = '';
    if (docLimpo.length === 11) {
      documentoFinalRemetente = docLimpo;
    } else if (docLimpo.length === 14) {
      if (isSandboxEnv) {
        documentoFinalRemetente = cpfResponsavel.length === 11 ? cpfResponsavel : '45666490400';
      } else {
        documentoFinalRemetente = docLimpo;
      }
    } else {
      documentoFinalRemetente = cpfResponsavel.length === 11 ? cpfResponsavel : '45666490400';
    }

    const docClienteLimpo = (cliente.numero_documento || (cliente as any).cpf || (cliente as any).cnpj || docCliente || '').replace(/\D/g, '');
    const documentoFinalCliente = (docClienteLimpo.length === 11 || docClienteLimpo.length === 14)
      ? (docClienteLimpo === documentoFinalRemetente && isSandboxEnv ? '11144477735' : docClienteLimpo)
      : (isSandboxEnv ? '11144477735' : docClienteLimpo);

    // Payload de inserção no carrinho do Melhor Envio
    const cartPayload = {
      service: Number(entrega.servico_codigo) || 1, // 1: Correios PAC, 2: SEDEX, 3: Jadlog .Package, 4: .Com
      agency: null,
      from: {
        name: nomeRemetente,
        phone: (dadosLoja.telefone || '').replace(/\D/g, '') || '11999999999',
        email: dadosLoja.email || 'contato@hubi.app',
        document: documentoFinalRemetente,
        address: sanitizarTexto(dadosLoja.logradouro) || 'Rua Bélgica',
        complement: sanitizarTexto(dadosLoja.complemento).substring(0, 50),
        number: sanitizarNum(dadosLoja.numero) || '945',
        district: (sanitizarTexto(dadosLoja.bairro) || 'Maraponga').substring(0, 50),
        city: sanitizarTexto(dadosLoja.cidade) || 'Fortaleza',
        state_abbr: (dadosLoja.uf || 'CE').toUpperCase().slice(0, 2),
        state_register: documentoFinalRemetente.length === 11 ? '' : (dadosLoja.inscricao_estadual || ''),
        postal_code: (dadosLoja.cep || '60710790').replace(/\D/g, '')
      },
      to: {
        name: nomeCliente,
        phone: (cliente.telefone || cliente.whatsapp || pedido.cliente_telefone_avulso || dadosLoja.telefone || '').replace(/\D/g, '') || '11999999999',
        email: cliente.email || pedido.cliente_email_avulso || 'cliente@hubi.app',
        document: documentoFinalCliente,
        address: sanitizarTexto(endEntrega.logradouro) || 'Rua Lindolfo Color',
        complement: sanitizarTexto(endEntrega.complemento).substring(0, 50),
        number: sanitizarNum(endEntrega.numero),
        district: (sanitizarTexto(endEntrega.bairro) || 'Engenho do Meio').substring(0, 50),
        city: sanitizarTexto(endEntrega.cidade) || 'Recife',
        state_abbr: (endEntrega.uf || 'PE').toUpperCase().slice(0, 2),
        state_register: '',
        postal_code: (endEntrega.cep || '50730605').replace(/\D/g, '')
      },
      products: productsCart,
      package: {
        height: Math.max(4, Math.round(Number(config.embalagem_padrao_altura_cm || 10))),
        width: Math.max(11, Math.round(Number(config.embalagem_padrao_largura_cm || 15))),
        length: Math.max(16, Math.round(Number(config.embalagem_padrao_comprimento_cm || 20))),
        weight: Math.max(0.1, Number(pesoTotal.toFixed(2)))
      },
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

      console.log('[MelhorEnvio-Front] Resposta da Edge Function:', edgeData);
      if (edgeData) {
        console.warn('[MelhorEnvio-Debug] Retorno Generate:', edgeData.debug_generate);
        console.warn('[MelhorEnvio-Debug] Retorno Print:', edgeData.debug_print);
        if (edgeData.motivo_real_api) {
          console.error('>>> RESPOSTA COMPLETA DA API DO MELHOR ENVIO:', edgeData.motivo_real_api);
        }
      }

      if (!edgeErr && edgeData && edgeData.sucesso) {
        console.log('[MelhorEnvio] Despacho realizado com sucesso via Edge Function.');
        return {
          ordem_id: String(edgeData.ordem_id || edgeData.orderId),
          codigo_rastreio: String(edgeData.codigo_rastreio || ''),
          link_etiqueta: edgeData.link_etiqueta || '',
          link_rastreio: edgeData.codigo_rastreio
            ? `https://melhorrastreio.com.br/rastreio/${edgeData.codigo_rastreio}`
            : (edgeData.link_rastreio || ''),
          transportadora: entrega.transportadora_nome || edgeData.transportadora || 'Melhor Envio'
        };
      }

      if (edgeData && !edgeData.sucesso) {
        console.error('>>> RESPOSTA COMPLETA DA API DO MELHOR ENVIO:', edgeData.motivo_real_api || edgeData);
        let motivoStr = edgeData.erro || edgeData.error || 'Falha ao processar com a API do Melhor Envio.';
        if (edgeData.motivo_real_api) {
          motivoStr += `\n\nDetalhes da API do Melhor Envio:\n` + JSON.stringify(edgeData.motivo_real_api, null, 2);
        }
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert(`[Melhor Envio] Falha no Despacho:\n\n${motivoStr}`);
        }
        throw new Error(motivoStr);
      }

      if (edgeErr) {
        console.error('[MelhorEnvio-Front] Falha detalhada:', edgeErr);
        let detalheErro = edgeErr.message || 'Falha na comunicação com o servidor do Melhor Envio.';
        try {
          if (edgeErr.context && typeof edgeErr.context.json === 'function') {
            const jsonErr = await edgeErr.context.json();
            detalheErro = jsonErr.error || jsonErr.erro || jsonErr.message || JSON.stringify(jsonErr);
            if (jsonErr.motivo_real_api) {
              console.error('>>> RESPOSTA COMPLETA DA API DO MELHOR ENVIO:', jsonErr.motivo_real_api);
              detalheErro += `\n\nDetalhes da API:\n` + JSON.stringify(jsonErr.motivo_real_api, null, 2);
            }
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
          if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(`[Melhor Envio] Erro na Edge Function:\n\n${detalheErro}`);
          }
          throw new Error(detalheErro);
        }
      }
    } catch (eEdge: any) {
      console.error('[MelhorEnvio-Front] Falha detalhada:', eEdge);
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
          link_rastreio: rpcData.codigo_rastreio
            ? `https://melhorrastreio.com.br/rastreio/${rpcData.codigo_rastreio}`
            : (rpcData.link_rastreio || ''),
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
