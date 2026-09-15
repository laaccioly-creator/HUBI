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
        return null;
      }

      return data as LojaShippingConfig | null;
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
    const payload = {
      ...config,
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

    return opcoesTotais;
  }

  /**
   * Cria ou atualiza o registro relacional do pedido em pedido_entregas
   */
  public static async salvarPedidoEntrega(
    pedidoId: string,
    entrega: Partial<PedidoEntrega>
  ): Promise<PedidoEntrega> {
    const payload = {
      ...entrega,
      pedido_id: pedidoId,
      atualizado_em: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('pedido_entregas')
      .upsert(payload, { onConflict: 'pedido_id' })
      .select()
      .single();

    if (error) {
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
