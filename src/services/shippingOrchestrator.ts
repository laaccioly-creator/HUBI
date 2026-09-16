import { supabase } from '../lib/supabase';
import {
  LojaShippingConfig,
  ClienteEndereco,
  PedidoEntrega,
  OpcaoFreteCotada,
  RequisicaoCotacaoOrquestrador,
  NovoEnderecoFormInput
} from '../types/shipping';
import { UberDirectService } from './uberDirectService';
import { MelhorEnvioService } from './melhorEnvioService';
import { isUuidValido } from './syncService';

export class ShippingOrchestrator {
  /**
   * Busca a configuração de frete ativa para a loja
   */
  public static async buscarConfigLoja(lojaId: string): Promise<LojaShippingConfig | null> {
    try {
      const { data, error } = await supabase
        .from('loja_shipping_configs')
        .select('*')
        .eq('loja_id', lojaId)
        .maybeSingle();

      if (error) {
        console.warn('[ShippingOrchestrator] Erro ao carregar config da loja:', error);
      }

      if (data) {
        const conf = data as LojaShippingConfig;
        const retiradaAtiva = conf.retirada_loja_ativa ?? conf.retirada_balcao_ativa ?? conf.permite_retirada_loja ?? false;
        conf.retirada_loja_ativa = retiradaAtiva;
        conf.retirada_balcao_ativa = retiradaAtiva;
        conf.permite_retirada_loja = retiradaAtiva;
        return conf;
      }

      // Fallback: carregar diretamente da tabela lojas caso loja_shipping_configs ainda não tenha sido criada
      const { data: dadosLoja } = await supabase
        .from('lojas')
        .select('id, retirada_loja_ativa, frete_gratis_ativo, frete_gratis_valor_minimo, endereco_cep, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_estado')
        .eq('id', lojaId)
        .maybeSingle();

      if (dadosLoja) {
        const retiradaAtiva = Boolean(dadosLoja.retirada_loja_ativa);
        return {
          id: 'loja-base',
          loja_id: lojaId,
          origem_cep: dadosLoja.endereco_cep || '',
          origem_logradouro: dadosLoja.endereco_logradouro || '',
          origem_numero: dadosLoja.endereco_numero || '',
          origem_complemento: null,
          origem_bairro: dadosLoja.endereco_bairro || '',
          origem_cidade: dadosLoja.endereco_cidade || '',
          origem_uf: dadosLoja.endereco_estado || '',
          origem_latitude: null,
          origem_longitude: null,
          uber_customer_id: null,
          uber_client_id: null,
          uber_client_secret: null,
          uber_sandbox_mode: true,
          uber_ativo: false,
          melhor_envio_token: null,
          melhor_envio_sandbox_mode: true,
          melhor_envio_ativo: false,
          permite_retirada_loja: retiradaAtiva,
          retirada_balcao_ativa: retiradaAtiva,
          retirada_loja_ativa: retiradaAtiva,
          frete_gratis_ativo: Boolean(dadosLoja.frete_gratis_ativo),
          frete_gratis_valor_minimo: Number(dadosLoja.frete_gratis_valor_minimo || 0)
        };
      }

      return null;
    } catch (err: unknown) {
      console.warn('[ShippingOrchestrator] Exceção ao carregar config da loja:', err);
      return null;
    }
  }

  /**
   * Salva ou atualiza a configuração de frete da loja
   */
  public static async salvarConfigLoja(
    lojaId: string,
    config: Partial<LojaShippingConfig>
  ): Promise<LojaShippingConfig> {
    const retiradaAtiva = config.retirada_loja_ativa ?? config.retirada_balcao_ativa ?? config.permite_retirada_loja;

    const payload: Record<string, unknown> = {
      ...config,
      ...(retiradaAtiva !== undefined ? {
        retirada_loja_ativa: retiradaAtiva,
        retirada_balcao_ativa: retiradaAtiva,
        permite_retirada_loja: retiradaAtiva
      } : {}),
      loja_id: lojaId,
      atualizado_em: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('loja_shipping_configs')
      .upsert(payload, { onConflict: 'loja_id' })
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao salvar configurações de frete: ${error.message}`);
    }

    // Sincroniza também diretamente na tabela lojas para consistência relacional total
    try {
      const updatesLoja: Record<string, unknown> = {};
      if (retiradaAtiva !== undefined) updatesLoja.retirada_loja_ativa = retiradaAtiva;
      if (config.frete_gratis_ativo !== undefined) updatesLoja.frete_gratis_ativo = config.frete_gratis_ativo;
      if (config.frete_gratis_valor_minimo !== undefined) updatesLoja.frete_gratis_valor_minimo = config.frete_gratis_valor_minimo;

      if (Object.keys(updatesLoja).length > 0) {
        await supabase.from('lojas').update(updatesLoja).eq('id', lojaId);
      }
    } catch (e) {
      console.warn('[ShippingOrchestrator] Falha ao espelhar em lojas:', e);
    }

    return data as LojaShippingConfig;
  }

  /**
   * Busca todos os endereços vinculados a um cliente
   */
  public static async listarEnderecosCliente(clienteId: string): Promise<ClienteEndereco[]> {
    if (!clienteId) return [];

    try {
      const { data, error } = await supabase
        .from('cliente_enderecos')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('is_principal', { ascending: false })
        .order('criado_em', { ascending: false });

      if (error) {
        console.warn('[ShippingOrchestrator] Erro ao buscar endereços do cliente:', error);
        return [];
      }

      return (data || []) as ClienteEndereco[];
    } catch (err: unknown) {
      console.warn('[ShippingOrchestrator] Exceção ao buscar endereços do cliente:', err);
      return [];
    }
  }

  /**
   * Salva um novo endereço imediatamente no banco de dados e retorna o registro criado
   */
  public static async salvarNovoEnderecoCliente(
    clienteId: string,
    input: NovoEnderecoFormInput
  ): Promise<ClienteEndereco> {
    if (!clienteId) {
      throw new Error('Cliente não identificado para salvar endereço.');
    }

    const cepLimpo = input.cep.replace(/\D/g, '');
    const numLimpo = input.numero.trim();
    const logrLimpo = input.logradouro.trim();

    // 1. Buscar endereços já existentes para este cliente para evitar duplicações
    const { data: existentes } = await supabase
      .from('cliente_enderecos')
      .select('*')
      .eq('cliente_id', clienteId);

    const enderecoExistente = (existentes || []).find((e: ClienteEndereco) => {
      const eCep = (e.cep || '').replace(/\D/g, '');
      const eNum = (e.numero || '').trim().toLowerCase();
      const eLogr = (e.logradouro || '').trim().toLowerCase();
      return (eCep === cepLimpo && eNum === numLimpo.toLowerCase()) || 
             (eLogr === logrLimpo.toLowerCase() && eNum === numLimpo.toLowerCase());
    });

    // Se for principal, desmarca anteriores
    if (input.is_principal) {
      await supabase
        .from('cliente_enderecos')
        .update({ is_principal: false })
        .eq('cliente_id', clienteId);
    }

    if (enderecoExistente) {
      // Atualiza o endereço existente em vez de duplicar
      const payloadAtualizacao = {
        identificador: input.identificador || enderecoExistente.identificador || (input.is_principal ? 'Principal' : 'Entrega'),
        cep: cepLimpo,
        logradouro: logrLimpo,
        numero: numLimpo,
        complemento: input.complemento?.trim() || null,
        bairro: input.bairro.trim(),
        cidade: input.cidade.trim(),
        uf: input.uf.trim().toUpperCase(),
        latitude: input.latitude !== undefined ? input.latitude : enderecoExistente.latitude,
        longitude: input.longitude !== undefined ? input.longitude : enderecoExistente.longitude,
        is_principal: Boolean(input.is_principal),
        atualizado_em: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('cliente_enderecos')
        .update(payloadAtualizacao)
        .eq('id', enderecoExistente.id)
        .select()
        .single();

      if (error) {
        throw new Error(`Erro ao atualizar endereço do cliente: ${error.message}`);
      }

      return data as ClienteEndereco;
    }

    // Se for novo endereço, insere
    const payload = {
      cliente_id: clienteId,
      identificador: input.identificador || (input.is_principal ? 'Principal' : 'Entrega'),
      cep: cepLimpo,
      logradouro: logrLimpo,
      numero: numLimpo,
      complemento: input.complemento?.trim() || null,
      bairro: input.bairro.trim(),
      cidade: input.cidade.trim(),
      uf: input.uf.trim().toUpperCase(),
      latitude: input.latitude || null,
      longitude: input.longitude || null,
      is_principal: Boolean(input.is_principal),
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('cliente_enderecos')
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao cadastrar endereço do cliente: ${error.message}`);
    }

    return data as ClienteEndereco;
  }

  /**
   * Orquestra cotações paralelas entre Uber Direct e Melhor Envio API v2
   * com tratamento gracioso de exceções
   */
  public static async cotarOpcoesFrete(
    req: RequisicaoCotacaoOrquestrador
  ): Promise<OpcaoFreteCotada[]> {
    const { config, destino_cep, destino_logradouro, destino_numero, destino_bairro, destino_cidade, destino_uf, subtotal, itens } = req;

    const opcoesTotais: OpcaoFreteCotada[] = [];

    // Formatar endereço completo para Uber Direct
    const enderecoDestinoLinha = [
      destino_logradouro,
      destino_numero,
      destino_bairro,
      destino_cidade,
      destino_uf,
      destino_cep
    ].filter(Boolean).join(', ');

    // Disparo concorrente com Promise.allSettled
    const resultados = await Promise.allSettled([
      // 1. Uber Direct
      UberDirectService.cotarEntrega(config, enderecoDestinoLinha, itens),
      // 2. Melhor Envio v2
      MelhorEnvioService.cotarFretes(config, destino_cep, subtotal, itens)
    ]);

    // Tratar Uber Direct
    const resUber = resultados[0];
    if (resUber.status === 'fulfilled' && resUber.value) {
      opcoesTotais.push(resUber.value);
    } else if (resUber.status === 'rejected') {
      console.warn('[ShippingOrchestrator] Falha rejeitada no Uber Direct:', resUber.reason);
    }

    // Tratar Melhor Envio
    const resMelhorEnvio = resultados[1];
    if (resMelhorEnvio.status === 'fulfilled' && Array.isArray(resMelhorEnvio.value)) {
      opcoesTotais.push(...resMelhorEnvio.value);
    } else if (resMelhorEnvio.status === 'rejected') {
      console.warn('[ShippingOrchestrator] Falha rejeitada no Melhor Envio:', resMelhorEnvio.reason);
    }

    return this.aplicarSubsidioFreteGratis(opcoesTotais, config, subtotal);
  }

  /**
   * Aplica a política de Frete Grátis com Subsídio em Upgrade:
   * 1. Quando frete_gratis_ativo = true e subtotal >= frete_gratis_valor_minimo:
   *    - A opção mais econômica torna-se 100% gratuita (valor_frete = 0.00).
   *    - As opções superiores pagam apenas a diferença (valor_frete = opcao.valor - menorPreco).
   */
  public static aplicarSubsidioFreteGratis(
    opcoes: OpcaoFreteCotada[],
    config: LojaShippingConfig | null | undefined,
    subtotal: number
  ): OpcaoFreteCotada[] {
    if (!config || !config.frete_gratis_ativo || !Array.isArray(opcoes) || opcoes.length === 0) {
      return opcoes;
    }

    const valorMinimo = Number(config.frete_gratis_valor_minimo) || 0;
    if (subtotal < valorMinimo) {
      return opcoes;
    }

    // Identificar opções válidas e com valor positivo
    const opcoesValidas = opcoes.filter(o => !o.erro && typeof o.valor_frete === 'number' && o.valor_frete > 0);
    if (opcoesValidas.length === 0) {
      return opcoes;
    }

    // Menor preço entre as opções disponíveis é o valor subsidiado pela loja
    const menorPreco = Math.min(...opcoesValidas.map(o => o.valor_frete));

    return opcoes.map(opcao => {
      if (opcao.erro || typeof opcao.valor_frete !== 'number' || opcao.valor_frete <= 0) {
        return opcao;
      }

      const precoOriginal = opcao.valor_original ?? opcao.valor_frete;

      if (precoOriginal === menorPreco) {
        return {
          ...opcao,
          valor_original: precoOriginal,
          valor_subsidio: menorPreco,
          valor_frete: 0.00,
          is_frete_gratis: true,
          is_upgrade_subsidio: false
        };
      }

      // Upgrade para opção mais rápida/cara
      const diferenca = Math.max(0, precoOriginal - menorPreco);
      return {
        ...opcao,
        valor_original: precoOriginal,
        valor_subsidio: menorPreco,
        valor_frete: diferenca,
        is_frete_gratis: false,
        is_upgrade_subsidio: true
      };
    });
  }

  /**
   * Cria ou atualiza o registro relacional do pedido em pedido_entregas
   */
  public static async salvarPedidoEntrega(
    pedidoId: string,
    entrega: Partial<PedidoEntrega>
  ): Promise<PedidoEntrega> {
    const clienteEnderecoIdSanitizado = (entrega.cliente_endereco_id && isUuidValido(entrega.cliente_endereco_id))
      ? entrega.cliente_endereco_id
      : null;

    const idSanitizado = (entrega.id && isUuidValido(entrega.id))
      ? entrega.id
      : undefined;

    // Assegura conformidade com o CHECK (provedor IN ('uber', 'melhor_envio', 'retirada_loja'))
    let provedorFinal: 'uber' | 'melhor_envio' | 'retirada_loja' = 'melhor_envio';
    if (entrega.tipo_atendimento === 'retirada' || entrega.provedor === 'retirada_loja') {
      provedorFinal = 'retirada_loja';
    } else if (entrega.provedor === 'uber' || (entrega.transportadora_nome || '').toLowerCase().includes('uber')) {
      provedorFinal = 'uber';
    } else {
      provedorFinal = 'melhor_envio';
    }

    const payload: any = {
      ...entrega,
      pedido_id: pedidoId,
      cliente_endereco_id: clienteEnderecoIdSanitizado,
      provedor: provedorFinal,
      atualizado_em: new Date().toISOString()
    };

    if (!idSanitizado) {
      delete payload.id;
    }

    let { data, error } = await supabase
      .from('pedido_entregas')
      .upsert(payload, { onConflict: 'pedido_id' })
      .select()
      .single();

    // Fallback caso ocorra restrição de integridade referencial com cliente_endereco_id
    if (error && (error.code === '23503' || error.message?.includes('foreign key') || error.message?.includes('cliente_endereco_id'))) {
      console.warn('[ShippingOrchestrator] Falha de FK em cliente_endereco_id, tentando salvar com null:', error.message);
      payload.cliente_endereco_id = null;
      const retry = await supabase
        .from('pedido_entregas')
        .upsert(payload, { onConflict: 'pedido_id' })
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('[ShippingOrchestrator] Erro ao salvar dados de entrega:', error);
      throw new Error(`Erro ao salvar dados de entrega do pedido: ${error.message}`);
    }

    return data as PedidoEntrega;
  }

  /**
   * Busca a entrega vinculada a um pedido
   */
  public static async buscarPedidoEntrega(pedidoId: string): Promise<PedidoEntrega | null> {
    if (!pedidoId) return null;

    try {
      const { data, error } = await supabase
        .from('pedido_entregas')
        .select('*')
        .eq('pedido_id', pedidoId)
        .maybeSingle();

      if (error) {
        console.warn('[ShippingOrchestrator] Erro ao carregar entrega do pedido:', error);
        return null;
      }

      return data as PedidoEntrega | null;
    } catch (err: unknown) {
      console.warn('[ShippingOrchestrator] Exceção ao carregar entrega do pedido:', err);
      return null;
    }
  }

  /**
   * Gera a opção padrão de Retirada na Loja (R$ 0,00)
   */
  public static gerarOpcaoRetirada(config?: LojaShippingConfig | null): OpcaoFreteCotada {
    const enderecoFormatado = config
      ? [config.origem_logradouro, config.origem_numero, config.origem_bairro, config.origem_cidade].filter(Boolean).join(', ')
      : 'Balcão da Loja';

    return {
      id: 'retirada-loja-gratis',
      provedor: 'retirada_loja',
      transportadora_nome: 'Retirada no Balcão',
      servico_codigo: 'retirada',
      servico_nome: 'Retirar na Loja (Grátis)',
      valor_frete: 0,
      prazo_estimado_texto: `Disponível no local (${enderecoFormatado})`,
      icone_tipo: 'loja'
    };
  }
}
