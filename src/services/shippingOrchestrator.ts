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
    if (!lojaId) return null;

    try {
      // 1. Busca em paralelo na tabela especializada loja_shipping_configs e na tabela lojas
      const [resShipping, resLoja] = await Promise.all([
        supabase
          .from('loja_shipping_configs')
          .select('*')
          .eq('loja_id', lojaId)
          .maybeSingle(),
        supabase
          .from('lojas')
          .select('id, retirada_loja_ativa, frete_gratis_ativo, frete_gratis_valor_minimo, endereco_cep, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_estado')
          .eq('id', lojaId)
          .maybeSingle()
      ]);

      const dadosShipping = resShipping.data as LojaShippingConfig | null;
      const dadosLoja = resLoja.data;

      // Prioridade absoluta para as configurações especializadas de envio (loja_shipping_configs), com fallback para lojas
      const freteGratisAtivo = dadosShipping?.frete_gratis_ativo !== undefined && dadosShipping?.frete_gratis_ativo !== null
        ? Boolean(dadosShipping.frete_gratis_ativo)
        : Boolean(dadosLoja?.frete_gratis_ativo);

      const freteGratisValorMinimo = dadosShipping?.frete_gratis_valor_minimo !== undefined && dadosShipping?.frete_gratis_valor_minimo !== null
        ? Number(dadosShipping.frete_gratis_valor_minimo)
        : Number(dadosLoja?.frete_gratis_valor_minimo || 0);

      const retiradaAtiva = dadosShipping?.retirada_loja_ativa !== undefined && dadosShipping?.retirada_loja_ativa !== null
        ? Boolean(dadosShipping.retirada_loja_ativa)
        : (dadosShipping?.retirada_balcao_ativa !== undefined && dadosShipping?.retirada_balcao_ativa !== null
          ? Boolean(dadosShipping.retirada_balcao_ativa)
          : (dadosShipping?.permite_retirada_loja !== undefined && dadosShipping?.permite_retirada_loja !== null
            ? Boolean(dadosShipping.permite_retirada_loja)
            : Boolean(dadosLoja?.retirada_loja_ativa)));

      if (dadosShipping) {
        return {
          ...dadosShipping,
          retirada_loja_ativa: retiradaAtiva,
          retirada_balcao_ativa: retiradaAtiva,
          permite_retirada_loja: retiradaAtiva,
          frete_gratis_ativo: freteGratisAtivo,
          frete_gratis_valor_minimo: freteGratisValorMinimo
        };
      }

      if (dadosLoja) {
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
          frete_gratis_ativo: freteGratisAtivo,
          frete_gratis_valor_minimo: freteGratisValorMinimo
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

    // 1. Verifica se já existe registro na tabela loja_shipping_configs
    const { data: existente } = await supabase
      .from('loja_shipping_configs')
      .select('id')
      .eq('loja_id', lojaId)
      .maybeSingle();

    let data;
    let error;

    if (existente?.id) {
      const resUpdate = await supabase
        .from('loja_shipping_configs')
        .update(payload)
        .eq('loja_id', lojaId)
        .select()
        .single();
      data = resUpdate.data;
      error = resUpdate.error;
    } else {
      // Busca dados cadastrais da loja para não violar NOT NULL no insert inicial
      const { data: loja } = await supabase
        .from('lojas')
        .select('endereco_cep, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_estado')
        .eq('id', lojaId)
        .maybeSingle();

      const insertPayload = {
        origem_cep: (payload.origem_cep as string) || loja?.endereco_cep || '60710790',
        origem_logradouro: (payload.origem_logradouro as string) || loja?.endereco_logradouro || 'Rua Principal',
        origem_numero: (payload.origem_numero as string) || loja?.endereco_numero || 'S/N',
        origem_bairro: (payload.origem_bairro as string) || loja?.endereco_bairro || 'Centro',
        origem_cidade: (payload.origem_cidade as string) || loja?.endereco_cidade || 'Fortaleza',
        origem_uf: (payload.origem_uf as string) || loja?.endereco_estado || 'CE',
        ...payload
      };

      const resInsert = await supabase
        .from('loja_shipping_configs')
        .insert(insertPayload)
        .select()
        .single();
      data = resInsert.data;
      error = resInsert.error;
    }

    if (error) {
      console.error('Erro ao atualizar loja_shipping_configs:', error);
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

      const ends = (data || []) as ClienteEndereco[];

      // Sempre busca o endereço cadastral original na tabela clientes para consolidar
      const { data: cli } = await supabase
        .from('clientes')
        .select('id, endereco_cep, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_estado, cep, rua, numero, complemento, bairro, cidade, estado')
        .eq('id', clienteId)
        .maybeSingle();

      let listaConsolidada = [...ends];

      if (cli) {
        const cCep = (cli.endereco_cep || cli.cep || '').replace(/\D/g, '');
        const cLogr = (cli.endereco_logradouro || cli.rua || '').trim();
        const cNum = (cli.endereco_numero || cli.numero || 'S/N').trim();

        if (cCep || cLogr) {
          const jaExiste = ends.some(e => {
            const eCep = (e.cep || '').replace(/\D/g, '');
            const eNum = (e.numero || '').trim().toLowerCase();
            const eLogr = (e.logradouro || '').trim().toLowerCase();
            return (eCep && eCep === cCep && eNum === cNum.toLowerCase()) || (eLogr && eLogr === cLogr.toLowerCase() && eNum === cNum.toLowerCase());
          });

          if (!jaExiste) {
            const temPrincipalEmEnds = ends.some(e => e.is_principal);
            const endCli: ClienteEndereco = {
              id: 'cli-principal',
              cliente_id: clienteId,
              identificador: 'Principal',
              cep: cCep,
              logradouro: cLogr || 'Endereço Principal',
              numero: cNum,
              complemento: (cli.endereco_complemento || cli.complemento || '').trim() || null,
              bairro: (cli.endereco_bairro || cli.bairro || 'Centro').trim(),
              cidade: (cli.endereco_cidade || cli.cidade || 'Fortaleza').trim(),
              uf: (cli.endereco_estado || cli.estado || 'CE').trim().toUpperCase(),
              is_principal: !temPrincipalEmEnds,
              criado_em: new Date(0).toISOString()
            };

            if (endCli.is_principal) {
              listaConsolidada = [endCli, ...ends];
            } else {
              listaConsolidada = [...ends, endCli];
            }
          }
        }
      }

      // Se nenhum endereço estiver marcado como principal, define o primeiro como principal
      if (listaConsolidada.length > 0 && !listaConsolidada.some(e => e.is_principal)) {
        listaConsolidada[0] = { ...listaConsolidada[0], is_principal: true };
      }

      // Ordena com o principal no topo
      return listaConsolidada.sort((a, b) => {
        if (a.is_principal && !b.is_principal) return -1;
        if (!a.is_principal && b.is_principal) return 1;
        return 0;
      });
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
    const compLimpo = (input.complemento || '').trim();

    // 1. Validação Prévia de Duplicidade contra todos os endereços do cliente
    const listaExistentes = await this.listarEnderecosCliente(clienteId);

    const ehDuplicado = listaExistentes.some((e: ClienteEndereco) => {
      const eCep = (e.cep || '').replace(/\D/g, '');
      const eNum = (e.numero || '').trim().toLowerCase();
      const eComp = (e.complemento || '').trim().toLowerCase();

      const nCep = cepLimpo;
      const nNum = numLimpo.toLowerCase();
      const nComp = compLimpo.toLowerCase();

      if (eCep === nCep && eNum === nNum) {
        if (eComp && nComp) return eComp === nComp;
        if (!eComp && !nComp) return true;
        return false;
      }
      return false;
    });

    if (ehDuplicado) {
      throw new Error('Este endereço já está cadastrado na sua lista.');
    }

    // 2. Se for principal, desmarca anteriores
    if (input.is_principal) {
      await supabase
        .from('cliente_enderecos')
        .update({ is_principal: false })
        .eq('cliente_id', clienteId);
    }

    // 3. Inserção Relacional sem Limite de Quantidade (cliente_enderecos)
    const { data: novoEndereco, error } = await supabase
      .from('cliente_enderecos')
      .insert({
        cliente_id: clienteId,
        identificador: input.identificador?.trim() || (input.is_principal ? 'Principal' : 'Outro'),
        cep: cepLimpo,
        logradouro: logrLimpo,
        numero: numLimpo,
        bairro: input.bairro.trim(),
        cidade: input.cidade.trim(),
        uf: input.uf.trim().toUpperCase(),
        complemento: compLimpo || null,
        latitude: input.latitude || null,
        longitude: input.longitude || null,
        is_principal: Boolean(input.is_principal),
        criado_em: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[ShippingOrchestrator] Erro ao cadastrar novo endereço:', error);
      throw new Error(`Erro ao cadastrar novo endereço: ${error.message}`);
    }

    return novoEndereco as ClienteEndereco;
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

    // 3. Frete Próprio da Loja
    if (config?.frete_proprio_ativo) {
      const tipoCobranca = config.frete_proprio_tipo_cobranca || 'fixo';
      const valorFreteProprio = tipoCobranca === 'gratis' 
        ? 0 
        : Number(config.frete_proprio_valor_padrao || 0);

      opcoesTotais.push({
        id: 'opcao_frete_proprio',
        provedor: 'frete_proprio',
        transportadora_nome: 'Frete Próprio',
        servico_codigo: tipoCobranca,
        servico_nome: tipoCobranca === 'manual' ? 'Frete Próprio (Valor Manual)' : (tipoCobranca === 'gratis' ? 'Frete Próprio (Grátis)' : 'Frete Próprio (Fixo)'),
        valor_frete: valorFreteProprio,
        valor_original: valorFreteProprio,
        valor_subsidio: 0,
        is_frete_gratis: tipoCobranca === 'gratis',
        prazo_estimado_texto: 'A combinar com o entregador',
        icone_tipo: 'loja'
      });
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
    if (!Array.isArray(opcoes) || opcoes.length === 0) {
      return opcoes;
    }

    const freteGratisAtivo = Boolean(config?.frete_gratis_ativo);
    const valorMinimo = Number(config?.frete_gratis_valor_minimo) || 0;

    // Se frete grátis não está ativo ou o subtotal não alcançou a régua de gratuidade
    if (!freteGratisAtivo || subtotal < valorMinimo) {
      return opcoes.map(opcao => {
        const precoOriginal = (typeof opcao.valor_original === 'number' && opcao.valor_original > 0)
          ? opcao.valor_original
          : opcao.valor_frete;

        return {
          ...opcao,
          valor_frete: precoOriginal,
          valor_subsidio: 0,
          is_frete_gratis: false,
          is_upgrade_subsidio: false
        };
      });
    }

    // Identificar opções válidas (considerando tanto valor_original quanto valor_frete)
    const opcoesValidas = opcoes.filter(o => 
      !o.erro && (
        (typeof o.valor_original === 'number' && o.valor_original > 0) || 
        (typeof o.valor_frete === 'number' && o.valor_frete > 0) ||
        o.is_frete_gratis
      )
    );
    if (opcoesValidas.length === 0) {
      return opcoes;
    }

    // Menor preço entre as opções disponíveis é o valor original mais baixo
    const menorPreco = Math.min(...opcoesValidas.map(o => 
      (typeof o.valor_original === 'number' && o.valor_original > 0) ? o.valor_original : o.valor_frete
    ));

    let gratisDefinido = false;

    return opcoes.map(opcao => {
      if (opcao.erro) {
        return opcao;
      }

      const precoOriginal = (typeof opcao.valor_original === 'number' && opcao.valor_original > 0)
        ? opcao.valor_original
        : opcao.valor_frete;

      if (typeof precoOriginal !== 'number' || precoOriginal <= 0) {
        return opcao;
      }

      // Se é o menor preço (e ainda não marcou uma opção gratuita), zera esta opção
      if (!gratisDefinido && Math.abs(precoOriginal - menorPreco) < 0.01) {
        gratisDefinido = true;
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

    // Assegura conformidade com o CHECK (provedor IN ('uber', 'melhor_envio', 'retirada_loja', 'frete_proprio'))
    let provedorFinal: 'uber' | 'melhor_envio' | 'retirada_loja' | 'frete_proprio' = 'melhor_envio';
    if (entrega.tipo_atendimento === 'retirada' || entrega.provedor === 'retirada_loja') {
      provedorFinal = 'retirada_loja';
    } else if (entrega.provedor === 'frete_proprio' || (entrega.transportadora_nome || '').toLowerCase().includes('frete próprio') || (entrega.transportadora_nome || '').toLowerCase().includes('próprio')) {
      provedorFinal = 'frete_proprio';
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
   * Registra o despacho logístico de um pedido com frete próprio ou transportadora
   */
  public static async despacharPedido(
    pedidoId: string,
    dadosDespacho: {
      entregador_nome?: string | null;
      link_rastreio?: string | null;
      pin_entrega?: string | null;
      despachado_por?: string | null;
    }
  ): Promise<void> {
    const despachadoEm = new Date().toISOString();

    // 1. Persistência canônica em pedido_entregas
    await supabase
      .from('pedido_entregas')
      .update({
        entregador_nome: dadosDespacho.entregador_nome || null,
        link_rastreio: dadosDespacho.link_rastreio || null,
        pin_entrega: dadosDespacho.pin_entrega || null,
        despachado_em: despachadoEm,
        despachado_por: dadosDespacho.despachado_por || null,
        status_envio: 'entregue',
        atualizado_em: despachadoEm
      })
      .eq('pedido_id', pedidoId);

    // 2. Snapshot derivado em pedidos e conclusão de status
    await supabase
      .from('pedidos')
      .update({
        status: 'concluido',
        entregador_nome: dadosDespacho.entregador_nome || null,
        link_rastreio: dadosDespacho.link_rastreio || null,
        despachado_em: despachadoEm,
        despachado_por: dadosDespacho.despachado_por || null,
        atualizado_em: despachadoEm
      })
      .eq('id', pedidoId);
  }

  /**
   * Válvula de contingência RBAC: Força a conclusão manual de entrega (exclusivo admin/gerente)
   */
  public static async forcarConclusaoManual(
    pedidoId: string,
    usuarioLojaId?: string | null
  ): Promise<void> {
    const agora = new Date().toISOString();

    await supabase
      .from('pedido_entregas')
      .update({
        status_envio: 'entregue',
        despachado_em: agora,
        despachado_por: usuarioLojaId || null,
        atualizado_em: agora
      })
      .eq('pedido_id', pedidoId);

    await supabase
      .from('pedidos')
      .update({
        status: 'concluido',
        despachado_em: agora,
        despachado_por: usuarioLojaId || null,
        atualizado_em: agora
      })
      .eq('id', pedidoId);
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
