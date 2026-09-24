import { supabase } from '../lib/supabase';
import {
  LojaShippingConfig,
  ClienteEndereco,
  PedidoEntrega,
  OpcaoFreteCotada,
  RequisicaoCotacaoOrquestrador,
  NovoEnderecoFormInput,
  ShippingSelectionResult,
  AppEntrega,
  Transportadora
} from '../types/shipping';
import { Loja, Pedido, FormaEntrega } from '../types';
import { UberDirectService } from './uberDirectService';
import { MelhorEnvioService } from './melhorEnvioService';
import { isUuidValido } from './syncService';
import { normalizarTexto } from '../utils/geoUtils';

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
        .select('id, endereco_cep, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_estado')
        .eq('id', clienteId)
        .maybeSingle();

      let listaConsolidada = [...ends];

      if (cli) {
        const cCep = (cli.endereco_cep || '').replace(/\D/g, '');
        const cLogr = (cli.endereco_logradouro || '').trim();
        const cNum = (cli.endereco_numero || 'S/N').trim();

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
              complemento: (cli.endereco_complemento || '').trim() || null,
              bairro: (cli.endereco_bairro || 'Centro').trim(),
              cidade: (cli.endereco_cidade || 'Fortaleza').trim(),
              uf: (cli.endereco_estado || 'CE').trim().toUpperCase(),
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
    input: NovoEnderecoFormInput,
    enderecoIdAtual?: string | null
  ): Promise<ClienteEndereco> {
    if (!clienteId) {
      throw new Error('Cliente não identificado para salvar endereço.');
    }

    const cepLimpo = input.cep.replace(/\D/g, '');
    const numLimpo = input.numero.trim();
    const logrLimpo = input.logradouro.trim();
    const compLimpo = (input.complemento || '').trim();

    // 1. Se estiver editando um endereço existente com UUID real no banco, faz o update
    if (enderecoIdAtual && !enderecoIdAtual.startsWith('cli-') && !enderecoIdAtual.startsWith('end-')) {
      if (input.is_principal) {
        await supabase
          .from('cliente_enderecos')
          .update({ is_principal: false })
          .eq('cliente_id', clienteId);
      }

      const { data: atualizado, error: errUpd } = await supabase
        .from('cliente_enderecos')
        .update({
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
          atualizado_em: new Date().toISOString()
        })
        .eq('id', enderecoIdAtual)
        .select()
        .maybeSingle();

      if (atualizado && !errUpd) {
        return atualizado as ClienteEndereco;
      }
    }

    // 2. Busca endereços existentes para reaproveitamento
    const listaExistentes = await this.listarEnderecosCliente(clienteId);

    const enderecoExistente = listaExistentes.find((e: ClienteEndereco) => {
      if (enderecoIdAtual && e.id === enderecoIdAtual) return false;

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

    // Se já existe um registro físico em cliente_enderecos correspondente, reutiliza e atualiza principal
    if (enderecoExistente && enderecoExistente.id && !enderecoExistente.id.startsWith('cli-') && !enderecoExistente.id.startsWith('end-')) {
      if (input.is_principal) {
        await supabase
          .from('cliente_enderecos')
          .update({ is_principal: false })
          .eq('cliente_id', clienteId);

        await supabase
          .from('cliente_enderecos')
          .update({ is_principal: true, atualizado_em: new Date().toISOString() })
          .eq('id', enderecoExistente.id);
      }
      return {
        ...enderecoExistente,
        is_principal: Boolean(input.is_principal || enderecoExistente.is_principal)
      };
    }

    // 3. Se for principal, desmarca outros como principal antes de inserir
    if (input.is_principal) {
      await supabase
        .from('cliente_enderecos')
        .update({ is_principal: false })
        .eq('cliente_id', clienteId);
    }

    // 4. Inserção do endereço na tabela cliente_enderecos
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
    const { config, destino_cep, destino_logradouro, destino_numero, destino_bairro, destino_cidade, destino_uf, subtotal, itens, pacote } = req;

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

    const promessas: Promise<{ provedor: 'uber' | 'melhor_envio'; valor: any }>[] = [];

    // 1. Uber Direct - APENAS se ativado explicitamente na loja
    if (config?.uber_ativo === true) {
      promessas.push(
        UberDirectService.cotarEntrega(config, enderecoDestinoLinha, itens)
          .then(opcao => ({ provedor: 'uber' as const, valor: opcao }))
          .catch(err => {
            console.warn('[ShippingOrchestrator] Falha rejeitada no Uber Direct:', err);
            return { provedor: 'uber' as const, valor: null };
          })
      );
    }

    // 2. Melhor Envio v2 - APENAS se ativado explicitamente na loja
    if (config?.melhor_envio_ativo === true) {
      promessas.push(
        MelhorEnvioService.cotarFretes(config, destino_cep, subtotal, itens, pacote)
          .then(opcoes => ({ provedor: 'melhor_envio' as const, valor: opcoes }))
          .catch(err => {
            console.warn('[ShippingOrchestrator] Falha rejeitada no Melhor Envio:', err);
            return { provedor: 'melhor_envio' as const, valor: [] };
          })
      );
    }

    if (promessas.length > 0) {
      const resultados = await Promise.allSettled(promessas);
      for (const res of resultados) {
        if (res.status === 'fulfilled' && res.value) {
          if (res.value.provedor === 'uber' && res.value.valor) {
            const opcaoUber: OpcaoFreteCotada = res.value.valor;
            // Se houver erro de bloqueio/cadastro ou conta desativada na Uber, não expor no PDV
            if (opcaoUber.id !== 'uber-blocked' && !opcaoUber.erro) {
              opcoesTotais.push(opcaoUber);
            }
          } else if (res.value.provedor === 'melhor_envio' && Array.isArray(res.value.valor)) {
            opcoesTotais.push(...res.value.valor);
          }
        }
      }
    }

    // 3. Frete Próprio da Loja - APENAS se ativado explicitamente
    if (config?.frete_proprio_ativo === true) {
      const tipoCobranca = config.frete_proprio_tipo_cobranca || 'fixo';
      const ehManual = tipoCobranca === 'manual';
      const valorFreteProprio = (tipoCobranca === 'gratis' || ehManual) 
        ? 0 
        : Number(config.frete_proprio_valor_padrao || 0);

      opcoesTotais.push({
        id: 'opcao_frete_proprio',
        provedor: 'frete_proprio',
        transportadora_nome: 'Frete Próprio',
        servico_codigo: tipoCobranca,
        servico_nome: ehManual ? 'Frete Próprio (Valor Manual)' : (tipoCobranca === 'gratis' ? 'Frete Próprio (Grátis)' : 'Frete Próprio (Fixo)'),
        valor_frete: valorFreteProprio,
        valor_original: valorFreteProprio,
        valor_subsidio: 0,
        is_frete_gratis: tipoCobranca === 'gratis',
        prazo_estimado_texto: 'A combinar com o entregador',
        icone_tipo: 'loja',
        permite_edicao_valor: ehManual,
        tipo_cobranca: tipoCobranca
      });
    }

    // 4. Filtro Inteligente de Modalidades por Município (Origem vs Destino)
    const cidadeOrigemNorm = normalizarTexto(config?.origem_cidade);
    const cidadeDestinoNorm = normalizarTexto(destino_cidade);

    let opcoesFiltradas = opcoesTotais;
    if (cidadeOrigemNorm && cidadeDestinoNorm) {
      const ehMesmaCidade = cidadeOrigemNorm === cidadeDestinoNorm;
      opcoesFiltradas = opcoesTotais.filter(op => {
        if (ehMesmaCidade) {
          // Se Origem === Destino (Mesma Cidade / Entrega Municipal):
          // - Ocultar transportadoras rodoviárias/interestaduais do Melhor Envio (Jadlog, Azul Cargo, Buslog, LATAM Cargo, etc.)
          // - Exibir: Uber Direct e serviços rápidos/locais (ex.: Correios SEDEX e frete próprio/manual)
          if (op.provedor === 'uber') return true;
          if (op.provedor === 'melhor_envio') {
            const texto = `${op.transportadora_nome || ''} ${op.servico_nome || ''}`.toLowerCase();
            const ehRodoviariaInterestadual = ['jadlog', 'azul', 'buslog', 'latam', 'pac'].some(t => texto.includes(t));
            if (ehRodoviariaInterestadual) return false;
            return texto.includes('sedex');
          }
          return true;
        } else {
          // Se Origem !== Destino (Outra Cidade / Intermunicipal / Interestadual):
          // - Ocultar Uber Direct (raio local urbano apenas)
          // - Exibir: Todas as opções de transportadoras integradas do Melhor Envio (Jadlog, Correios PAC/SEDEX, etc.)
          if (op.provedor === 'uber') return false;
          return true;
        }
      });
    }

    return this.aplicarSubsidioFreteGratis(opcoesFiltradas, config, subtotal);
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
        if (opcao.permite_edicao_valor) {
          return opcao;
        }

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

    // Identificar opções válidas (considerando tanto valor_original quanto valor_frete, desconsiderando opções manuais que não possuem valor estático)
    const opcoesValidas = opcoes.filter(o => 
      !o.erro && !o.permite_edicao_valor && (
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
      if (opcao.erro || opcao.permite_edicao_valor) {
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
    } else if (entrega.provedor === 'melhor_envio') {
      provedorFinal = 'melhor_envio';
    } else if (entrega.tipo_operacao === 'app_entrega') {
      provedorFinal = 'frete_proprio';
    } else if (entrega.provedor === 'uber' || (entrega.transportadora_nome || '').toLowerCase().includes('uber direct')) {
      provedorFinal = 'uber';
    } else if (entrega.provedor === 'frete_proprio' || (entrega.transportadora_nome || '').toLowerCase().includes('frete próprio') || (entrega.transportadora_nome || '').toLowerCase().includes('próprio')) {
      provedorFinal = 'frete_proprio';
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

    // Sanitizar campos virtuais ou de precificação que não existem no schema de pedido_entregas
    delete payload.forma_entrega_nome;
    delete payload.is_frete_gratis;
    delete payload.is_upgrade_subsidio;
    delete payload.valor_original;
    delete payload.valor_subsidio;
    delete payload.tipo_entrega;
    delete payload.peso_kg;
    delete payload.largura_cm;
    delete payload.altura_cm;
    delete payload.comprimento_cm;
    delete payload.quantidade_volumes;
    delete payload.pacote;

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
   * Despacha pedido via Uber Direct: chama API da Uber, persiste rastreio/PIN e transiciona status para saiu_para_entrega
   */
  public static async despacharUberDirect(
    loja: Loja,
    config: LojaShippingConfig,
    pedido: Pedido,
    entrega: PedidoEntrega,
    usuarioId?: string | null
  ): Promise<{ link_rastreio: string; pin_entrega?: string | null; delivery_id: string }> {
    if (pedido.status === 'cancelado') {
      throw new Error('Não é permitido despachar pedidos cancelados.');
    }

    const despachadoEm = new Date().toISOString();

    // 1. Hidratação segura de endereço de destino se a entrega estiver incompleta
    let entregaAjustada: PedidoEntrega = { ...entrega, provedor: 'uber' };

    const precisaHidratar = !entregaAjustada.destino_logradouro ||
      !entregaAjustada.destino_numero ||
      !entregaAjustada.destino_cep;

    if (precisaHidratar && (entregaAjustada.cliente_endereco_id || pedido.cliente_id)) {
      try {
        let query = supabase.from('cliente_enderecos').select('*');
        if (entregaAjustada.cliente_endereco_id && isUuidValido(entregaAjustada.cliente_endereco_id)) {
          query = query.eq('id', entregaAjustada.cliente_endereco_id);
        } else if (pedido.cliente_id) {
          query = query.eq('cliente_id', pedido.cliente_id).order('is_principal', { ascending: false }).order('criado_em', { ascending: false });
        }
        const { data: endDb } = await query.limit(1).maybeSingle();
        if (endDb) {
          entregaAjustada.destino_logradouro = entregaAjustada.destino_logradouro || endDb.logradouro;
          entregaAjustada.destino_numero = entregaAjustada.destino_numero || endDb.numero;
          entregaAjustada.destino_complemento = entregaAjustada.destino_complemento || endDb.complemento;
          entregaAjustada.destino_bairro = entregaAjustada.destino_bairro || endDb.bairro;
          entregaAjustada.destino_cidade = entregaAjustada.destino_cidade || endDb.cidade;
          entregaAjustada.destino_uf = entregaAjustada.destino_uf || endDb.uf;
          entregaAjustada.destino_cep = (entregaAjustada.destino_cep || endDb.cep || '').replace(/\D/g, '');
          if (!entregaAjustada.cliente_endereco_id && endDb.id && isUuidValido(endDb.id)) {
            entregaAjustada.cliente_endereco_id = endDb.id;
          }
        }
      } catch (errEnd) {
        console.warn('[ShippingOrchestrator] Falha ao hidratar endereço para despacho Uber:', errEnd);
      }
    }

    if (!entregaAjustada.destino_logradouro && pedido.endereco_entrega) {
      const partes = pedido.endereco_entrega.split(',').map((s: string) => s.trim());
      if (partes.length > 0) entregaAjustada.destino_logradouro = partes[0];
      if (partes.length > 1 && !entregaAjustada.destino_numero) {
        const nMatch = partes[1].match(/\d+/);
        if (nMatch) entregaAjustada.destino_numero = nMatch[0];
      }
    }

    // 2. Garantir hidratação do cliente (nome e telefone) no pedido
    let pedidoAjustado: Pedido = { ...pedido };
    if ((!pedidoAjustado.cliente || !pedidoAjustado.cliente.whatsapp) && pedidoAjustado.cliente_id) {
      try {
        const { data: cliDb } = await supabase.from('clientes').select('*').eq('id', pedidoAjustado.cliente_id).maybeSingle();
        if (cliDb) {
          pedidoAjustado.cliente = cliDb;
        }
      } catch (cliErr) {
        console.warn('[ShippingOrchestrator] Falha ao hidratar cliente para despacho Uber:', cliErr);
      }
    }

    // 3. Chamar API da Uber Direct
    const resultado = await UberDirectService.solicitarCorridaUberDirect({
      loja,
      config,
      pedido: pedidoAjustado,
      entrega: entregaAjustada
    });

    // 4. Persistência canônica em pedido_entregas (com upsert seguro)
    await this.salvarPedidoEntrega(pedido.id, {
      ...entregaAjustada,
      codigo_rastreio: resultado.delivery_id,
      link_rastreio: resultado.link_rastreio,
      pin_entrega: resultado.pin_entrega || null,
      status_envio: 'em_transito',
      despachado_em: despachadoEm,
      despachado_por: usuarioId || null
    });

    // 5. Snapshot e transição de status para saiu_para_entrega
    const textoEndereco = [
      entregaAjustada.destino_logradouro,
      entregaAjustada.destino_numero ? `Nº ${entregaAjustada.destino_numero}` : null,
      entregaAjustada.destino_complemento,
      entregaAjustada.destino_bairro,
      entregaAjustada.destino_cidade && entregaAjustada.destino_uf ? `${entregaAjustada.destino_cidade} - ${entregaAjustada.destino_uf}` : null,
      entregaAjustada.destino_cep ? `CEP ${entregaAjustada.destino_cep.replace(/^(\d{5})(\d{3})$/, '$1-$2')}` : null
    ].filter(Boolean).join(', ') || pedido.endereco_entrega || null;

    const { data: pedDbUber } = await supabase.from('pedidos').select('status').eq('id', pedido.id).maybeSingle();
    const statusDestinoUber = (pedDbUber?.status === 'concluido' || pedido.status === 'concluido')
      ? 'concluido'
      : (pedDbUber?.status === 'cancelado')
        ? 'cancelado'
        : 'enviado';

    await supabase
      .from('pedidos')
      .update({
        status: statusDestinoUber,
        codigo_rastreio: resultado.delivery_id,
        link_rastreio: resultado.link_rastreio,
        pin_entrega: resultado.pin_entrega || null,
        endereco_entrega: textoEndereco,
        despachado_em: despachadoEm,
        despachado_por: usuarioId || null,
        atualizado_em: despachadoEm
      })
      .eq('id', pedido.id);

    return resultado;
  }

  /**
   * Despacha pedido via Melhor Envio: compra etiqueta, gera código de rastreamento e transiciona status para saiu_para_entrega
   */
  public static async despacharMelhorEnvio(
    loja: Loja,
    config: LojaShippingConfig,
    pedido: Pedido,
    entrega: PedidoEntrega,
    usuarioId?: string | null
  ): Promise<{ codigo_rastreio: string; link_etiqueta: string; link_rastreio?: string }> {
    if (pedido.status === 'cancelado') {
      throw new Error('Não é permitido despachar pedidos cancelados.');
    }

    const despachadoEm = new Date().toISOString();
    const resultado = await MelhorEnvioService.solicitarEnvioMelhorEnvio({
      loja,
      config,
      pedido,
      entrega,
      usuarioId
    });

    const urlRastreioOficial = resultado.codigo_rastreio
      ? `https://melhorrastreio.com.br/rastreio/${resultado.codigo_rastreio}`
      : (resultado.link_rastreio || null);

    // 1. Persistência canônica em pedido_entregas (com upsert seguro)
    await this.salvarPedidoEntrega(pedido.id, {
      ...entrega,
      codigo_rastreio: resultado.codigo_rastreio,
      link_rastreio: urlRastreioOficial,
      link_etiqueta: resultado.link_etiqueta,
      status_envio: 'despachado',
      despachado_em: despachadoEm,
      despachado_por: usuarioId || null
    });

    // 2. Snapshot e transição de status para enviado (preservando pedidos já concluídos ou cancelados)
    const { data: pedDbME } = await supabase.from('pedidos').select('status').eq('id', pedido.id).maybeSingle();
    const statusDestinoME = (pedDbME?.status === 'concluido' || pedido.status === 'concluido')
      ? 'concluido'
      : (pedDbME?.status === 'cancelado')
        ? 'cancelado'
        : 'enviado';

    await supabase
      .from('pedidos')
      .update({
        status: statusDestinoME,
        codigo_rastreio: resultado.codigo_rastreio,
        link_rastreio: urlRastreioOficial,
        despachado_em: despachadoEm,
        despachado_por: usuarioId || null,
        atualizado_em: despachadoEm
      })
      .eq('id', pedido.id);

    return resultado;
  }

  /**
   * Despacha pedido via Frete Próprio: grava nome do entregador e transiciona status para saiu_para_entrega
   */
  public static async despacharFreteProprio(
    pedidoId: string,
    entregadorNome?: string | null,
    usuarioId?: string | null
  ): Promise<void> {
    const { data: pedDb } = await supabase.from('pedidos').select('status').eq('id', pedidoId).maybeSingle();
    if (pedDb?.status === 'cancelado') {
      throw new Error('Não é permitido despachar pedidos cancelados.');
    }

    const despachadoEm = new Date().toISOString();

    // 1. Persistência canônica em pedido_entregas
    await supabase
      .from('pedido_entregas')
      .update({
        entregador_nome: entregadorNome || null,
        status_envio: 'despachado',
        despachado_em: despachadoEm,
        despachado_por: usuarioId || null,
        atualizado_em: despachadoEm
      })
      .eq('pedido_id', pedidoId);

    // 2. Snapshot e transição de status para enviado (preservando pedidos já concluídos ou cancelados)
    const statusDestinoProprio = pedDb?.status === 'concluido' ? 'concluido' : 'enviado';

    await supabase
      .from('pedidos')
      .update({
        status: statusDestinoProprio,
        entregador_nome: entregadorNome || null,
        despachado_em: despachadoEm,
        despachado_por: usuarioId || null,
        atualizado_em: despachadoEm
      })
      .eq('id', pedidoId);
  }

  /**
   * Válvula de contingência RBAC: Força o despacho manual para enviado (exclusivo admin/gerente)
   */
  public static async forcarDespachoManual(
    pedidoId: string,
    usuarioLojaId?: string | null
  ): Promise<void> {
    const { data: pedDb } = await supabase.from('pedidos').select('status').eq('id', pedidoId).maybeSingle();
    if (pedDb?.status === 'cancelado') {
      throw new Error('Não é permitido despachar pedidos cancelados.');
    }

    const agora = new Date().toISOString();

    await supabase
      .from('pedido_entregas')
      .update({
        status_envio: 'despachado',
        despachado_em: agora,
        despachado_por: usuarioLojaId || null,
        atualizado_em: agora
      })
      .eq('pedido_id', pedidoId);

    const statusDestinoManual = pedDb?.status === 'concluido' ? 'concluido' : 'enviado';

    await supabase
      .from('pedidos')
      .update({
        status: statusDestinoManual,
        despachado_em: agora,
        despachado_por: usuarioLojaId || null,
        atualizado_em: agora
      })
      .eq('id', pedidoId);
  }

  /**
   * Registra o despacho logístico de um pedido com frete próprio ou transportadora (retrocompatível)
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

  /**
   * Lista todas as formas de entrega cadastradas para a loja.
   * Se a loja ainda não possuir opções, realiza seed idempotente das opções padrão.
   */
  public static async listarFormasEntrega(lojaId: string): Promise<FormaEntrega[]> {
    if (!lojaId) return [];

    try {
      const { data, error } = await supabase
        .from('formas_entrega')
        .select('*')
        .eq('loja_id', lojaId)
        .order('criado_em', { ascending: true });

      if (error) {
        console.warn('[ShippingOrchestrator] Erro ao listar formas de entrega:', error);
        return [];
      }

      if (data && data.length > 0) {
        return data as FormaEntrega[];
      }

      // Seed das opções padrão se não houver registros
      const opcoesPadrao = [
        {
          loja_id: lojaId,
          nome: 'Retirada na Loja',
          tipo: 'retirada' as const,
          valor_taxa: 0.00,
          requer_codigo_rastreio: false,
          requer_entregador: false,
          ativo: true,
          padrao: true
        },
        {
          loja_id: lojaId,
          nome: 'Motoboy / Frota Própria',
          tipo: 'proprio' as const,
          valor_taxa: 0.00,
          requer_codigo_rastreio: false,
          requer_entregador: true,
          ativo: true,
          padrao: false
        },
        {
          loja_id: lojaId,
          nome: 'Uber / 99 Manual',
          tipo: 'proprio' as const,
          valor_taxa: 0.00,
          requer_codigo_rastreio: false,
          requer_entregador: false,
          ativo: true,
          padrao: false
        },
        {
          loja_id: lojaId,
          nome: 'Correios / Transportadora',
          tipo: 'transportadora' as const,
          valor_taxa: 0.00,
          requer_codigo_rastreio: true,
          requer_entregador: false,
          ativo: true,
          padrao: false
        }
      ];

      const { data: seeded, error: seedError } = await supabase
        .from('formas_entrega')
        .insert(opcoesPadrao)
        .select();

      if (seedError) {
        console.warn('[ShippingOrchestrator] Falha ao criar seed de formas_entrega:', seedError);
        return [];
      }

      return (seeded || []) as FormaEntrega[];
    } catch (err: unknown) {
      console.warn('[ShippingOrchestrator] Exceção ao listar formas de entrega:', err);
      return [];
    }
  }

  /**
   * Salva ou atualiza uma forma de entrega relacional para a loja
   */
  public static async salvarFormaEntrega(
    lojaId: string,
    forma: Partial<FormaEntrega>
  ): Promise<FormaEntrega> {
    if (!lojaId) throw new Error('Loja não identificada.');
    if (!forma.nome?.trim()) throw new Error('O nome da forma de entrega é obrigatório.');

    console.log('[DEBUG salvarFormaEntrega] Dados a enviar:', {
      id: forma.id,
      lojaId,
      nome: forma.nome,
      tipo: forma.tipo,
      requer_pin: forma.requer_pin,
      requer_entregador: forma.requer_entregador,
      requer_link_rastreio: forma.requer_link_rastreio,
      requer_codigo_rastreio: forma.requer_codigo_rastreio
    });

    // Sanitização rigorosa do tipo para respeitar a CHECK constraint do banco
    const tiposValidos = [
      'retirada',
      'frota_propria',
      'motoboy',
      'app_entrega',
      'correios',
      'transportadora',
      'proprio',
      'manual',
      'taxa_fixa',
      'bairro',
      'distancia_km'
    ];
    const tipoSanitizado = (forma.tipo && tiposValidos.includes(forma.tipo))
      ? forma.tipo
      : 'frota_propria';

    const agora = new Date().toISOString();

    if (forma.id) {
      const payloadUpdate: any = {
        nome: forma.nome.trim(),
        tipo: tipoSanitizado,
        valor_taxa: Number(forma.valor_taxa || 0),
        requer_entregador: Boolean(forma.requer_entregador),
        requer_codigo_rastreio: Boolean(forma.requer_codigo_rastreio),
        requer_link_rastreio: Boolean(forma.requer_link_rastreio),
        requer_pin: Boolean(forma.requer_pin),
        ativo: forma.ativo !== undefined ? Boolean(forma.ativo) : true,
        atualizado_em: agora
      };

      // Atualizar usando o cliente oficial autenticado
      const { data, error } = await supabase
        .from('formas_entrega')
        .update(payloadUpdate)
        .eq('id', forma.id)
        .select();

      if (error) {
        console.error('[ERRO Supabase UPDATE formas_entrega]:', error);
        throw new Error(`Erro ao atualizar: ${error.message}`);
      }

      if (!data || data.length === 0) {
        console.warn('[AVISO] Linhas afetadas: 0. Verifique RLS ou ID inexistente:', forma.id);
        throw new Error('Nenhum registro atualizado. Verifique se o ID existe ou se a sessão de login está ativa.');
      }

      console.log('[SUCESSO salvarFormaEntrega]:', data);
      return data[0] as FormaEntrega;
    }

    const payloadInsert: any = {
      loja_id: lojaId,
      nome: forma.nome.trim(),
      tipo: tipoSanitizado,
      valor_taxa: Number(forma.valor_taxa || 0),
      requer_entregador: Boolean(forma.requer_entregador),
      requer_codigo_rastreio: Boolean(forma.requer_codigo_rastreio),
      requer_link_rastreio: Boolean(forma.requer_link_rastreio),
      requer_pin: Boolean(forma.requer_pin),
      ativo: forma.ativo !== undefined ? Boolean(forma.ativo) : true,
      padrao: Boolean(forma.padrao),
      criado_em: agora,
      atualizado_em: agora
    };

    const { data, error } = await supabase
      .from('formas_entrega')
      .insert(payloadInsert)
      .select();

    if (error) {
      console.error('[ERRO Supabase INSERT formas_entrega]:', error);
      throw new Error(`Erro ao cadastrar forma de entrega: ${error.message}`);
    }

    if (!data || data.length === 0) {
      throw new Error('Erro ao cadastrar forma de entrega.');
    }

    console.log('[SUCESSO cadastrarFormaEntrega]:', data);
    return data[0] as FormaEntrega;
  }

  /**
   * Alterna status ativo/inativo de uma forma de entrega
   */
  public static async alternarStatusFormaEntrega(
    formaId: string,
    lojaId: string,
    ativo: boolean
  ): Promise<void> {
    const { error } = await supabase
      .from('formas_entrega')
      .update({ ativo, atualizado_em: new Date().toISOString() })
      .eq('id', formaId)
      .eq('loja_id', lojaId);

    if (error) throw error;
  }

  /**
   * Remove uma forma de entrega
   */
  public static async removerFormaEntrega(
    formaId: string,
    lojaId: string
  ): Promise<void> {
    const { error } = await supabase
      .from('formas_entrega')
      .delete()
      .eq('id', formaId)
      .eq('loja_id', lojaId);

    if (error) throw error;
  }

  // =========================================================================
  // GESTÃO DE APPS DE CORRIDA (apps_entrega)
  // =========================================================================
  public static async listarAppsEntrega(lojaId: string): Promise<AppEntrega[]> {
    if (!lojaId) return [];
    try {
      const { data, error } = await supabase
        .from('apps_entrega')
        .select('*')
        .eq('loja_id', lojaId)
        .order('nome', { ascending: true });

      if (error) {
        console.warn('[ShippingOrchestrator] Erro ao listar apps_entrega:', error);
        return [];
      }
      return (data || []) as AppEntrega[];
    } catch (err) {
      console.warn('[ShippingOrchestrator] Falha de conexão ao listar apps_entrega:', err);
      return [];
    }
  }

  private static sanitizarErroLogistica(error: unknown, fallback: string): Error {
    if (!error) return new Error(fallback);
    const msg = typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);

    if (/row-level security|policy|permission denied|42501/i.test(msg)) {
      return new Error('Não foi possível salvar os dados devido a restrições de permissão. Tente novamente.');
    }
    if (/foreign key|violates foreign key|23503/i.test(msg)) {
      return new Error('Registro referenciado não foi encontrado.');
    }
    if (/unique|duplicate key|23505/i.test(msg)) {
      return new Error('Já existe um registro com estes dados.');
    }
    return new Error(fallback);
  }

  public static async criarAppEntrega(lojaId: string, nome: string): Promise<AppEntrega> {
    if (!lojaId) throw new Error('ID da loja é obrigatório.');
    if (!nome.trim()) throw new Error('Nome do aplicativo é obrigatório.');

    const { data, error } = await supabase
      .from('apps_entrega')
      .insert({
        loja_id: lojaId,
        nome: nome.trim(),
        ativo: true
      })
      .select()
      .single();

    if (error) {
      console.error('[ShippingOrchestrator] Erro ao criar app_entrega:', error);
      throw this.sanitizarErroLogistica(error, 'Erro ao cadastrar aplicativo de entrega.');
    }
    return data as AppEntrega;
  }

  public static async atualizarAppEntrega(id: string, lojaId: string, dados: Partial<AppEntrega>): Promise<void> {
    if (!id || !lojaId) return;
    const { error } = await supabase
      .from('apps_entrega')
      .update(dados)
      .eq('id', id)
      .eq('loja_id', lojaId);

    if (error) {
      console.error('[ShippingOrchestrator] Erro ao atualizar app_entrega:', error);
      throw this.sanitizarErroLogistica(error, 'Erro ao atualizar aplicativo.');
    }
  }

  public static async excluirAppEntrega(id: string, lojaId: string): Promise<void> {
    if (!id || !lojaId) return;
    const { error } = await supabase
      .from('apps_entrega')
      .delete()
      .eq('id', id)
      .eq('loja_id', lojaId);

    if (error) {
      console.error('[ShippingOrchestrator] Erro ao excluir app_entrega:', error);
      throw this.sanitizarErroLogistica(error, 'Erro ao excluir aplicativo.');
    }
  }

  // =========================================================================
  // GESTÃO DE TRANSPORTADORAS (transportadoras)
  // =========================================================================
  public static async listarTransportadoras(lojaId: string): Promise<Transportadora[]> {
    if (!lojaId) return [];
    try {
      const { data, error } = await supabase
        .from('transportadoras')
        .select('*')
        .eq('loja_id', lojaId)
        .order('nome', { ascending: true });

      if (error) {
        console.warn('[ShippingOrchestrator] Erro ao listar transportadoras:', error);
        return [];
      }
      return (data || []) as Transportadora[];
    } catch (err) {
      console.warn('[ShippingOrchestrator] Falha de conexão ao listar transportadoras:', err);
      return [];
    }
  }

  public static async buscarTransportadora(id: string, lojaId: string): Promise<Transportadora | null> {
    if (!id || !lojaId) return null;
    try {
      const { data, error } = await supabase
        .from('transportadoras')
        .select('*')
        .eq('id', id)
        .eq('loja_id', lojaId)
        .maybeSingle();

      if (error) {
        console.warn('[ShippingOrchestrator] Erro ao buscar transportadora:', error);
        return null;
      }
      return data as Transportadora | null;
    } catch {
      return null;
    }
  }

  public static async criarTransportadora(
    lojaId: string,
    dados: Omit<Transportadora, 'id' | 'loja_id' | 'criado_em'>
  ): Promise<Transportadora> {
    if (!lojaId) throw new Error('ID da loja é obrigatório.');
    if (!dados.nome.trim()) throw new Error('Nome da transportadora é obrigatório.');

    const { data, error } = await supabase
      .from('transportadoras')
      .insert({
        loja_id: lojaId,
        nome: dados.nome.trim(),
        site: dados.site?.trim() || null,
        url_rastreio: dados.url_rastreio?.trim() || null,
        pessoa_contato: dados.pessoa_contato?.trim() || null,
        telefone: dados.telefone?.trim() || null,
        whatsapp: dados.whatsapp?.trim() || null,
        observacoes: dados.observacoes?.trim() || null,
        ativo: dados.ativo ?? true
      })
      .select()
      .single();

    if (error) {
      console.error('[ShippingOrchestrator] Erro ao criar transportadora:', error);
      throw this.sanitizarErroLogistica(error, 'Erro ao cadastrar transportadora.');
    }
    return data as Transportadora;
  }

  public static async atualizarTransportadora(
    id: string,
    lojaId: string,
    dados: Partial<Transportadora>
  ): Promise<void> {
    if (!id || !lojaId) return;
    const { error } = await supabase
      .from('transportadoras')
      .update(dados)
      .eq('id', id)
      .eq('loja_id', lojaId);

    if (error) {
      console.error('[ShippingOrchestrator] Erro ao atualizar transportadora:', error);
      throw this.sanitizarErroLogistica(error, 'Erro ao atualizar transportadora.');
    }
  }

  public static async excluirTransportadora(id: string, lojaId: string): Promise<void> {
    if (!id || !lojaId) return;
    const { error } = await supabase
      .from('transportadoras')
      .delete()
      .eq('id', id)
      .eq('loja_id', lojaId);

    if (error) {
      console.error('[ShippingOrchestrator] Erro ao excluir transportadora:', error);
      throw this.sanitizarErroLogistica(error, 'Erro ao excluir transportadora.');
    }
  }

  /**
   * Despacho manual simplificado: persiste entregador_nome, codigo_rastreio e link_rastreio
   * e transiciona para 'saiu_para_entrega' tanto em pedidos quanto em pedido_entregas
   */
  public static async despacharEntregaManual(
    pedidoId: string,
    dados: {
      entregadorNome?: string | null;
      codigoRastreio?: string | null;
      linkRastreio?: string | null;
      pinEntrega?: string | null;
      nomeApp?: string | null;
      appEntregaId?: string | null;
      codigoCorrida?: string | null;
      servicoCorreios?: string | null;
      transportadoraId?: string | null;
      nomeTransportadora?: string | null;
      tipoOperacao?: string | null;
      contatoEntregador?: string | null;
      usuarioId?: string | null;
      valorFrete?: number | null;
    }
  ): Promise<void> {
    const { data: pedDb } = await supabase.from('pedidos').select('status').eq('id', pedidoId).maybeSingle();
    if (pedDb?.status === 'cancelado') {
      throw new Error('Não é permitido despachar pedidos cancelados.');
    }

    const despachadoEm = new Date().toISOString();

    // 1. Atualizar pedido_entregas com dados relacionais
    const dadosEntrega: Record<string, any> = {
      entregador_nome: dados.entregadorNome?.trim() || null,
      codigo_rastreio: dados.codigoRastreio?.trim() || null,
      link_rastreio: dados.linkRastreio?.trim() || null,
      pin_entrega: dados.pinEntrega?.trim() || null,
      nome_app: dados.nomeApp?.trim() || null,
      app_entrega_id: dados.appEntregaId || null,
      codigo_corrida: dados.codigoCorrida?.trim() || null,
      transportadora_id: dados.transportadoraId || null,
      servico_correios: dados.servicoCorreios?.trim() || null,
      nome_transportadora: dados.nomeTransportadora?.trim() || null,
      tipo_operacao: dados.tipoOperacao || null,
      contato_entregador: dados.contatoEntregador?.trim() || null,
      status_envio: 'despachado',
      despachado_em: despachadoEm,
      despachado_por: dados.usuarioId || null,
      atualizado_em: despachadoEm
    };

    if (typeof dados.valorFrete === 'number') {
      dadosEntrega.valor_frete = dados.valorFrete;
    }

    await supabase
      .from('pedido_entregas')
      .update(dadosEntrega)
      .eq('pedido_id', pedidoId);

    // 2. Atualizar snapshot relacional em pedidos (preservando status concluído ou cancelado)
    const statusDestinoTransp = pedDb?.status === 'concluido' ? 'concluido' : 'enviado';

    await supabase
      .from('pedidos')
      .update({
        status: statusDestinoTransp,
        entregador_nome: dados.entregadorNome?.trim() || null,
        codigo_rastreio: dados.codigoRastreio?.trim() || null,
        link_rastreio: dados.linkRastreio?.trim() || null,
        pin_entrega: dados.pinEntrega?.trim() || null,
        nome_app: dados.nomeApp?.trim() || null,
        servico_correios: dados.servicoCorreios?.trim() || null,
        nome_transportadora: dados.nomeTransportadora?.trim() || null,
        tipo_operacao: dados.tipoOperacao || null,
        despachado_em: despachadoEm,
        despachado_por: dados.usuarioId || null,
        atualizado_em: despachadoEm
      })
      .eq('id', pedidoId);
  }

  /**
   * Grava a forma de envio escolhida para o pedido e avança o status para 'aguardando_envio'
   */
  public static async definirEnvioPedido(
    pedidoId: string,
    resultado: ShippingSelectionResult,
    usuarioId?: string | null
  ): Promise<void> {
    const agora = new Date().toISOString();
    const pe = resultado.pedido_entrega || {};
    const valorFrete = Number(resultado.valor_frete || pe.valor_frete || 0);

    // 1. Buscar dados atuais do pedido e cliente
    const { data: pedAtual } = await supabase
      .from('pedidos')
      .select('subtotal, valor_desconto, valor_total, valor_pago, metadados, cliente_id, endereco_entrega, status')
      .eq('id', pedidoId)
      .maybeSingle();

    if (pedAtual?.status === 'cancelado') {
      throw new Error('Não é permitido definir ou alterar forma de envio para pedidos cancelados.');
    }

    // 2. Hidratação completa e segura do endereço de entrega do cliente
    let enderecoFinal = resultado.endereco_selecionado || null;
    let clienteEnderecoId = (pe.cliente_endereco_id && isUuidValido(pe.cliente_endereco_id))
      ? pe.cliente_endereco_id
      : (enderecoFinal?.id && isUuidValido(enderecoFinal.id) ? enderecoFinal.id : null);

    const precisaBuscarEndereco = !enderecoFinal?.logradouro ||
      !enderecoFinal?.numero ||
      !enderecoFinal?.cep ||
      !enderecoFinal?.bairro ||
      !enderecoFinal?.cidade;

    if (precisaBuscarEndereco && (clienteEnderecoId || pedAtual?.cliente_id)) {
      try {
        let query = supabase.from('cliente_enderecos').select('*');
        if (clienteEnderecoId) {
          query = query.eq('id', clienteEnderecoId);
        } else if (pedAtual?.cliente_id) {
          query = query.eq('cliente_id', pedAtual.cliente_id).order('is_principal', { ascending: false }).order('criado_em', { ascending: false });
        }
        const { data: endDb } = await query.limit(1).maybeSingle();
        if (endDb) {
          enderecoFinal = {
            ...endDb,
            ...(enderecoFinal || {})
          };
          if (!clienteEnderecoId && endDb.id && isUuidValido(endDb.id)) {
            clienteEnderecoId = endDb.id;
          }
        }
      } catch (errEnd) {
        console.warn('[ShippingOrchestrator] Falha ao buscar endereço do cliente:', errEnd);
      }
    }

    const destinoCepLimpo = (pe.destino_cep || enderecoFinal?.cep || '').replace(/\D/g, '') || null;
    let destinoLogradouro = pe.destino_logradouro || enderecoFinal?.logradouro || null;
    let destinoNumero = pe.destino_numero || enderecoFinal?.numero || null;
    let destinoComplemento = pe.destino_complemento || enderecoFinal?.complemento || null;
    let destinoBairro = pe.destino_bairro || enderecoFinal?.bairro || null;
    let destinoCidade = pe.destino_cidade || enderecoFinal?.cidade || null;
    let destinoUf = pe.destino_uf || enderecoFinal?.uf || null;

    // Fallback de parse de pedAtual.endereco_entrega se ainda faltar logradouro
    if (!destinoLogradouro && pedAtual?.endereco_entrega) {
      const partes = pedAtual.endereco_entrega.split(',').map((s: string) => s.trim());
      if (partes.length > 0) destinoLogradouro = partes[0];
      if (partes.length > 1 && !destinoNumero) {
        const nMatch = partes[1].match(/\d+/);
        if (nMatch) destinoNumero = nMatch[0];
      }
    }

    // Identificação do provedor
    let provedorFinal: 'uber' | 'melhor_envio' | 'retirada_loja' | 'frete_proprio' = 'frete_proprio';
    if (resultado.tipo_atendimento === 'retirada') {
      provedorFinal = 'retirada_loja';
    } else if (
      pe.provedor === 'melhor_envio' ||
      resultado.opcao_frete?.provedor === 'melhor_envio' ||
      (pe.transportadora_nome || '').toLowerCase().includes('melhor envio')
    ) {
      provedorFinal = 'melhor_envio';
    } else if (
      pe.tipo_operacao !== 'app_entrega' && (
        pe.provedor === 'uber' ||
        resultado.opcao_frete?.provedor === 'uber' ||
        ((pe.transportadora_nome || '').toLowerCase().includes('uber direct'))
      )
    ) {
      provedorFinal = 'uber';
    } else if (
      pe.tipo_operacao === 'app_entrega' ||
      pe.tipo_operacao === 'transportadora' ||
      pe.provedor === 'frete_proprio'
    ) {
      provedorFinal = 'frete_proprio';
    }

    // Texto consolidado do endereço para a coluna pedidos.endereco_entrega
    const textoEnderecoEntrega = [
      destinoLogradouro,
      destinoNumero ? `Nº ${destinoNumero}` : null,
      destinoComplemento,
      destinoBairro,
      destinoCidade && destinoUf ? `${destinoCidade} - ${destinoUf}` : (destinoCidade || destinoUf),
      destinoCepLimpo ? `CEP ${destinoCepLimpo.replace(/^(\d{5})(\d{3})$/, '$1-$2')}` : null
    ].filter(Boolean).join(', ') || pedAtual?.endereco_entrega || null;

    const nomeTransportadora = (pe.tipo_operacao === 'app_entrega' && pe.nome_app)
      ? pe.nome_app
      : (pe.transportadora_nome ||
        pe.forma_entrega_nome ||
        resultado.opcao_frete?.transportadora_nome ||
        (provedorFinal === 'uber' ? 'Uber Direct' : null));

    const prazoTexto = pe.prazo_estimado_texto || resultado.opcao_frete?.prazo_estimado_texto || null;

    const dadosEntrega: Partial<PedidoEntrega> = {
      tipo_atendimento: resultado.tipo_atendimento || 'entrega',
      provedor: provedorFinal,
      cliente_endereco_id: clienteEnderecoId,
      transportadora_nome: nomeTransportadora,
      nome_transportadora: nomeTransportadora,
      nome_app: pe.nome_app || (provedorFinal === 'uber' ? 'Uber Direct' : null),
      app_entrega_id: pe.app_entrega_id || null,
      transportadora_id: pe.transportadora_id || null,
      codigo_corrida: pe.codigo_corrida || null,
      codigo_rastreio: pe.codigo_rastreio || null,
      link_rastreio: pe.link_rastreio || null,
      servico_codigo: pe.servico_codigo || (provedorFinal === 'uber' ? 'uber_direct' : null),
      valor_frete: Number(valorFrete || 0),
      prazo_estimado_texto: prazoTexto,
      tipo_operacao: pe.tipo_operacao || (provedorFinal === 'uber' ? 'proprio' : null),
      servico_correios: pe.servico_correios || null,
      pin_entrega: pe.pin_entrega || null,
      entregador_nome: pe.entregador_nome || null,
      contato_entregador: pe.contato_entregador || (pe as any).entregador_telefone || null,
      destino_cep: destinoCepLimpo,
      destino_logradouro: destinoLogradouro,
      destino_numero: destinoNumero,
      destino_complemento: destinoComplemento,
      destino_bairro: destinoBairro,
      destino_cidade: destinoCidade,
      destino_uf: destinoUf,
      destino_latitude: pe.destino_latitude || enderecoFinal?.latitude || null,
      destino_longitude: pe.destino_longitude || enderecoFinal?.longitude || null,
      forma_entrega_id: pe.forma_entrega_id || null,
      status_envio: 'pendente',
      atualizado_em: agora
    };

    // 3. Salvar em pedido_entregas de forma canônica e resiliente
    await this.salvarPedidoEntrega(pedidoId, dadosEntrega);

    // 4. Recalcular valores do pedido e atualizar snapshot
    const subtotalPed = Number(pedAtual?.subtotal || pedAtual?.valor_total || 0);
    const descontoPed = Number(pedAtual?.valor_desconto || 0);
    const novoValorTotal = Math.max(0, subtotalPed - descontoPed + valorFrete);
    const valorPagoPed = Number(pedAtual?.valor_pago || 0);
    const novoSaldoDevedor = Math.max(0, novoValorTotal - valorPagoPed);

    const nomeRealFrete = (pe.tipo_operacao === 'app_entrega' && pe.nome_app)
      ? pe.nome_app
      : (nomeTransportadora || (provedorFinal === 'uber' ? 'Uber Flash' : 'Entrega'));

    const metaAtual = (pedAtual?.metadados && typeof pedAtual.metadados === 'object') ? { ...pedAtual.metadados } : {};
    metaAtual.transportadora_nome = nomeRealFrete;
    metaAtual.nome_app = pe.nome_app || null;
    metaAtual.codigo_corrida = pe.codigo_corrida || null;
    metaAtual.codigo_rastreio = pe.codigo_rastreio || null;
    metaAtual.link_rastreio = pe.link_rastreio || null;
    metaAtual.provedor_frete = provedorFinal;
    metaAtual.servico_frete_codigo = pe.servico_codigo || (provedorFinal === 'uber' ? 'uber_direct' : null);
    metaAtual.tipo_atendimento = resultado.tipo_atendimento || 'entrega';

    const pacRes = (resultado as any)?.pacote;
    if (pacRes || pe.largura_cm || pe.peso_kg) {
      metaAtual.pacote_envio = {
        quantidade_volumes: pacRes?.quantidade_volumes || pe.quantidade_volumes || 1,
        peso_kg: pacRes?.peso_kg || pe.peso_kg || 0.3,
        largura_cm: pacRes?.largura_cm || pe.largura_cm || 15,
        altura_cm: pacRes?.altura_cm || pe.altura_cm || 10,
        comprimento_cm: pacRes?.comprimento_cm || pe.comprimento_cm || 20
      };
    }

    // 5. Atualizar snapshot relacional na tabela pedidos (preservando pedidos concluídos ou cancelados)
    const statusDestinoEnvio = (pedAtual?.status === 'concluido' || pedAtual?.status === 'cancelado')
      ? pedAtual.status
      : 'aguardando_envio';

    const { error: errPed } = await supabase
      .from('pedidos')
      .update({
        status: statusDestinoEnvio,
        endereco_entrega: textoEnderecoEntrega,
        valor_frete: Number(valorFrete || 0),
        valor_total: novoValorTotal,
        saldo_devedor: novoSaldoDevedor,
        forma_entrega_id: pe.forma_entrega_id || null,
        tipo_operacao: pe.tipo_operacao || (provedorFinal === 'uber' ? 'proprio' : null),
        nome_app: pe.nome_app || (provedorFinal === 'uber' ? 'Uber Direct' : null),
        codigo_corrida: pe.codigo_corrida || null,
        codigo_rastreio: pe.codigo_rastreio || null,
        link_rastreio: pe.link_rastreio || null,
        servico_correios: pe.servico_correios || null,
        nome_transportadora: nomeRealFrete,
        entregador_nome: pe.entregador_nome || null,
        contato_entregador: pe.contato_entregador || (pe as any).entregador_telefone || null,
        pin_entrega: pe.pin_entrega || null,
        metadados: metaAtual,
        atualizado_por: usuarioId || null,
        atualizado_em: agora
      })
      .eq('id', pedidoId);

    if (errPed) {
      console.error('[ShippingOrchestrator] Erro ao atualizar pedido:', errPed);
      throw new Error(`Erro ao atualizar pedido: ${errPed.message}`);
    }
  }
}
