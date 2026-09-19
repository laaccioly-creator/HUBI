import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Store,
  Truck,
  MapPin,
  Check,
  Loader2,
  Clock,
  AlertCircle,
  MessageCircle,
  Navigation,
  ChevronRight,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import {
  TipoAtendimento,
  LojaShippingConfig,
  ClienteEndereco,
  OpcaoFreteCotada,
  ShippingSelectionResult,
  CotacaoItemProduto
} from '../../types/shipping';
import { FormaEntrega } from '../../types';
import { ShippingOrchestrator } from '../../services/shippingOrchestrator';
import { isUuidValido } from '../../services/syncService';
import { verificarMesmaRegiaoMetropolitana, gerarLinkWhatsAppLocalizacaoLoja } from '../../utils/geoUtils';
import { ModalEscolherOutroEndereco } from './ModalEscolherOutroEndereco';
import { ModalVerNoMapaLoja } from './ModalVerNoMapaLoja';

export interface ShippingFulfillmentSelectorProps {
  lojaId: string;
  loja?: {
    id?: string;
    nome?: string;
    nome_loja?: string;
    endereco_logradouro?: string | null;
    endereco_numero?: string | null;
    endereco_complemento?: string | null;
    endereco_bairro?: string | null;
    endereco_cidade?: string | null;
    endereco_estado?: string | null;
    endereco_cep?: string | null;
    telefone?: string | null;
    whatsapp?: string | null;
  } | null;
  clienteId?: string | null;
  cliente?: {
    id?: string;
    nome?: string;
    telefone?: string | null;
    whatsapp?: string | null;
    cep?: string | null;
    rua?: string | null;
    endereco?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    estado?: string | null;
    endereco_cep?: string | null;
    endereco_logradouro?: string | null;
    endereco_numero?: string | null;
    endereco_complemento?: string | null;
    endereco_bairro?: string | null;
    endereco_cidade?: string | null;
    endereco_estado?: string | null;
  } | null;
  subtotal: number;
  itens: CotacaoItemProduto[];
  valorFreteAtual?: number;
  opcaoSelecionadaId?: string | null;
  tipoAtendimentoAtual?: TipoAtendimento;
  enderecoEntregaAtual?: Partial<ClienteEndereco> | null;
  onSolicitarAtualizarEndereco?: () => void;
  onChange: (resultado: ShippingSelectionResult) => void;
  className?: string;
  modoCompacto?: boolean;
}

export const ShippingFulfillmentSelector: React.FC<ShippingFulfillmentSelectorProps> = ({
  lojaId,
  loja,
  clienteId,
  cliente,
  subtotal,
  itens,
  valorFreteAtual = 0,
  opcaoSelecionadaId,
  tipoAtendimentoAtual,
  enderecoEntregaAtual,
  onSolicitarAtualizarEndereco,
  onChange,
  className = '',
  modoCompacto = false
}) => {
  const [configLoja, setConfigLoja] = useState<LojaShippingConfig | null>(null);
  const [carregandoConfig, setCarregandoConfig] = useState<boolean>(true);

  // Aba ativa: 'retirada' ou 'entrega' (padrão 'retirada' se não informado)
  const [modalidade, setModalidade] = useState<TipoAtendimento>(tipoAtendimentoAtual || 'retirada');

  // Endereço selecionado para entrega
  const [enderecoSelecionado, setEnderecoSelecionado] = useState<ClienteEndereco | null>(null);
  const [carregandoEnderecos, setCarregandoEnderecos] = useState<boolean>(false);
  const [modalEscolherOutroAberto, setModalEscolherOutroAberto] = useState<boolean>(false);
  const [modalMapaLojaAberto, setModalMapaLojaAberto] = useState<boolean>(false);

  const [cotacoes, setCotacoes] = useState<OpcaoFreteCotada[]>([]);
  const [cotacaoEscolhida, setCotacaoEscolhida] = useState<OpcaoFreteCotada | null>(null);
  const [cotando, setCotando] = useState<boolean>(false);
  const [erroCotacaoMsg, setErroCotacaoMsg] = useState<string | null>(null);

  // Formas de Entrega Relacionais cadastradas na loja
  const [formasEntrega, setFormasEntrega] = useState<FormaEntrega[]>([]);

  useEffect(() => {
    let ativo = true;
    async function carregarFormas() {
      if (!lojaId) return;
      try {
        const lista = await ShippingOrchestrator.listarFormasEntrega(lojaId);
        if (ativo) {
          setFormasEntrega(lista.filter(f => f.ativo));
        }
      } catch (err) {
        console.warn('Erro ao carregar formas de entrega no seletor:', err);
      }
    }
    carregarFormas();
    return () => {
      ativo = false;
    };
  }, [lojaId]);

  // Valor digitado para frete próprio manual
  const [valorManualInput, setValorManualInput] = useState<string>(() => {
    if (typeof valorFreteAtual === 'number' && valorFreteAtual > 0) {
      return valorFreteAtual.toString();
    }
    return '';
  });

  // Sincroniza se o valor do frete mudar externamente e a opção for manual
  useEffect(() => {
    if (
      typeof valorFreteAtual === 'number' &&
      valorFreteAtual > 0 &&
      (opcaoSelecionadaId === 'manual' || opcaoSelecionadaId === 'opcao_frete_proprio' || opcaoSelecionadaId === 'frete_proprio')
    ) {
      setValorManualInput(valorFreteAtual.toString());
    }
  }, [valorFreteAtual, opcaoSelecionadaId]);

  // Refs de proteção contra re-renderizações e loops infinitos
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const ultimaCotacaoParamRef = useRef<string>('');
  const ultimoResultadoEmitidoRef = useRef<string>('');

  // Assinatura estável dos itens do carrinho para evitar disparo por recriação de array
  const itensSig = useMemo(() => {
    return (itens || [])
      .map(i => `${i.nome}:${i.quantidade}:${i.preco_unitario}`)
      .join('|');
  }, [itens]);

  // 1. Carregar Configuração da Loja
  useEffect(() => {
    let ativo = true;

    async function buscarConfig() {
      if (!lojaId) return;
      setCarregandoConfig(true);
      try {
        const config = await ShippingOrchestrator.buscarConfigLoja(lojaId);
        if (ativo && config) {
          setConfigLoja(config);
        }
      } catch (err) {
        console.warn('Erro ao carregar configurações de frete:', err);
      } finally {
        if (ativo) setCarregandoConfig(false);
      }
    }

    buscarConfig();

    return () => {
      ativo = false;
    };
  }, [lojaId]);

  // Propriedades primitivas estáveis do cliente para não disparar por objeto literal
  const clienteCep = (cliente?.endereco_cep || cliente?.cep || '').replace(/\D/g, '');
  const clienteLogr = (cliente?.endereco_logradouro || cliente?.rua || cliente?.endereco || '').trim();
  const clienteNum = (cliente?.endereco_numero || cliente?.numero || '').trim();
  const clienteComp = (cliente?.endereco_complemento || cliente?.complemento || '').trim();
  const clienteBairro = (cliente?.endereco_bairro || cliente?.bairro || '').trim();
  const clienteCid = (cliente?.endereco_cidade || cliente?.cidade || '').trim();
  const clienteUf = (cliente?.endereco_estado || cliente?.estado || 'CE').trim().toUpperCase();

  // 2. Carregar Endereço de Entrega (Prioriza endereço ativo do pedido)
  useEffect(() => {
    let ativo = true;

    async function carregarEnderecoInicial() {
      // 1. Se já existe um endereço de entrega ativo no pedido com dados válidos, preservá-lo
      if (enderecoEntregaAtual && (enderecoEntregaAtual.cep || enderecoEntregaAtual.logradouro)) {
        const endAtualFormatado: ClienteEndereco = {
          id: enderecoEntregaAtual.id || 'end-pedido-atual',
          cliente_id: cliente?.id || clienteId || 'temp',
          identificador: enderecoEntregaAtual.identificador || 'Endereço Atual do Pedido',
          cep: (enderecoEntregaAtual.cep || '').replace(/\D/g, ''),
          logradouro: enderecoEntregaAtual.logradouro || '',
          numero: enderecoEntregaAtual.numero || 'S/N',
          complemento: enderecoEntregaAtual.complemento || null,
          bairro: enderecoEntregaAtual.bairro || '',
          cidade: enderecoEntregaAtual.cidade || '',
          uf: enderecoEntregaAtual.uf || 'CE',
          is_principal: Boolean(enderecoEntregaAtual.is_principal)
        };
        if (ativo) {
          setEnderecoSelecionado(endAtualFormatado);
          setCarregandoEnderecos(false);
        }
        return;
      }

      if (clienteId) {
        setCarregandoEnderecos(true);
        try {
          const lista = await ShippingOrchestrator.listarEnderecosCliente(clienteId);
          if (ativo) {
            if (lista.length > 0) {
              const correspondente = (clienteCep || clienteLogr)
                ? lista.find(e => 
                    (clienteCep && (e.cep || '').replace(/\D/g, '') === clienteCep) ||
                    (clienteLogr && (e.logradouro || '').trim().toLowerCase() === clienteLogr.toLowerCase())
                  )
                : null;

              const principal = correspondente || lista.find(e => e.is_principal) || lista[0];
              setEnderecoSelecionado(prev => {
                if (prev) {
                  const aindaExiste = lista.find(e => e.id === prev.id);
                  if (aindaExiste) return aindaExiste;
                  if (prev.id && prev.logradouro) return prev;
                }
                return principal;
              });
            } else if (clienteCep || clienteLogr) {
              const novoEnd: ClienteEndereco = {
                id: 'cli-db-principal',
                cliente_id: cliente?.id || clienteId,
                identificador: 'Principal',
                cep: clienteCep,
                logradouro: clienteLogr || 'Endereço Principal',
                numero: clienteNum || 'S/N',
                complemento: clienteComp || null,
                bairro: clienteBairro || 'Centro',
                cidade: clienteCid || 'Fortaleza',
                uf: clienteUf || 'CE',
                is_principal: true
              };

              setEnderecoSelecionado(prev => {
                if (prev) return prev;
                return novoEnd;
              });
            }
          }
        } catch (err) {
          console.warn('Erro ao buscar endereços do cliente:', err);
        } finally {
          if (ativo) setCarregandoEnderecos(false);
        }
      } else if (clienteCep || clienteLogr) {
        const novoEnd: ClienteEndereco = {
          id: 'temp-cli',
          cliente_id: cliente?.id || 'temp',
          identificador: 'Principal',
          cep: clienteCep,
          logradouro: clienteLogr || 'Endereço Principal',
          numero: clienteNum || 'S/N',
          complemento: clienteComp || null,
          bairro: clienteBairro || 'Centro',
          cidade: clienteCid || 'Fortaleza',
          uf: clienteUf || 'CE',
          is_principal: true
        };

        setEnderecoSelecionado(prev => {
          if (prev) return prev;
          return novoEnd;
        });
      }
    }

    carregarEnderecoInicial();

    return () => {
      ativo = false;
    };
  }, [enderecoEntregaAtual, clienteId, clienteCep, clienteLogr, clienteNum, clienteComp, clienteBairro, clienteCid, clienteUf]);

  // Identificação de integrações ativas ou configuradas (estritamente booleanas)
  const temUber = Boolean(configLoja?.uber_ativo === true);
  const temMelhorEnvio = Boolean(configLoja?.melhor_envio_ativo === true);
  const temFreteProprio = Boolean(configLoja?.frete_proprio_ativo === true);
  const temFormasEntregaEnvio = formasEntrega.some(f => f.tipo !== 'retirada');
  const temIntegracoesAtivas = Boolean(temUber || temMelhorEnvio || temFreteProprio || temFormasEntregaEnvio);
  const permiteRetirada = Boolean(
    configLoja?.retirada_loja_ativa !== false && 
    configLoja?.retirada_balcao_ativa !== false
  );

  // Se a loja não permite retirada, garantir que a modalidade seja estritamente 'entrega'
  useEffect(() => {
    if (configLoja && !permiteRetirada) {
      if (modalidade === 'retirada') {
        setModalidade('entrega');
      }
    }
  }, [configLoja, permiteRetirada, modalidade]);

  // 3. Executar Cotação com Filtro de Região Metropolitana para Uber Direct
  const executarCotacao = useCallback(async (endAlvo: ClienteEndereco, forcar = false) => {
    if (!temUber && !temMelhorEnvio && !temFreteProprio && !temFormasEntregaEnvio) {
      setCotacoes([]);
      return;
    }

    const chaveCotacao = `${endAlvo.cep}_${endAlvo.numero}_${subtotal}_${itensSig}_${configLoja?.id || 'loja'}_${formasEntrega.length}`;
    if (!forcar && ultimaCotacaoParamRef.current === chaveCotacao) {
      return;
    }
    ultimaCotacaoParamRef.current = chaveCotacao;

    setCotando(true);
    setErroCotacaoMsg(null);

    try {
      const runtimeConfig: LojaShippingConfig = {
        ...(configLoja || {
          id: 'temp',
          loja_id: lojaId,
          origem_cep: '',
          origem_logradouro: '',
          origem_numero: '',
          origem_bairro: '',
          origem_cidade: '',
          origem_uf: '',
          uber_sandbox_mode: true,
          uber_ativo: false,
          melhor_envio_sandbox_mode: true,
          melhor_envio_ativo: false,
          permite_retirada_loja: true,
          retirada_balcao_ativa: true,
          frete_gratis_ativo: false,
          frete_gratis_valor_minimo: 0
        }),
        uber_ativo: temUber,
        melhor_envio_ativo: temMelhorEnvio,
        frete_proprio_ativo: temFreteProprio
      };

      const promessaCotacao = (temUber || temMelhorEnvio || temFreteProprio) && configLoja?.origem_cep
        ? ShippingOrchestrator.cotarOpcoesFrete({
            origem_cep: configLoja.origem_cep,
            destino_cep: endAlvo.cep,
            destino_logradouro: endAlvo.logradouro,
            destino_numero: endAlvo.numero,
            destino_bairro: endAlvo.bairro,
            destino_cidade: endAlvo.cidade,
            destino_uf: endAlvo.uf,
            subtotal,
            itens,
            config: runtimeConfig
          })
        : Promise.resolve([] as OpcaoFreteCotada[]);

      const opcoesBrutas = await promessaCotacao;

      // Validação de Região Metropolitana para Uber Direct
      const mesmaRegiao = configLoja ? verificarMesmaRegiaoMetropolitana(
        {
          cidade: configLoja.origem_cidade,
          uf: configLoja.origem_uf,
          latitude: configLoja.origem_latitude,
          longitude: configLoja.origem_longitude
        },
        {
          cidade: endAlvo.cidade,
          uf: endAlvo.uf,
          latitude: endAlvo.latitude,
          longitude: endAlvo.longitude
        }
      ) : true;

      const opcoesFiltradas = opcoesBrutas.filter(op => {
        if (op.provedor === 'uber') {
          return mesmaRegiao;
        }
        return true;
      });

      // Recalcula o benefício de frete grátis/subsídio estritamente sobre as opções que realmente restaram válidas
      const opcoesComSubsidio = ShippingOrchestrator.aplicarSubsidioFreteGratis(
        opcoesFiltradas,
        runtimeConfig,
        subtotal
      );

      // Descartar opções com erro para não poluir a interface do usuário
      const opcoesSemErro = opcoesComSubsidio.filter(o => !o.erro && o.id !== 'uber-blocked');

      // Mapeia opções ativas cadastradas em formas_entrega
      const opcoesFormasEntrega: OpcaoFreteCotada[] = formasEntrega
        .filter(forma => forma.tipo !== 'retirada')
        .map(forma => {
          const ehAtiva =
            opcaoSelecionadaId === forma.id ||
            opcaoSelecionadaId === `forma_${forma.id}` ||
            opcaoSelecionadaId === forma.nome;
          const valorPadrao = Number(forma.valor_taxa || 0);
          const valorInicial = (ehAtiva && typeof valorFreteAtual === 'number' && valorFreteAtual >= 0)
            ? valorFreteAtual
            : (parseFloat(valorManualInput.replace(',', '.')) || valorPadrao);

          return {
            id: `forma_${forma.id}`,
            forma_entrega_id: forma.id,
            provedor: 'frete_proprio' as const,
            transportadora_nome: forma.nome,
            servico_codigo: forma.tipo,
            servico_nome: forma.nome,
            valor_frete: valorInicial,
            valor_original: valorInicial,
            valor_subsidio: 0,
            is_frete_gratis: valorInicial === 0,
            prazo_estimado_texto: forma.tipo === 'transportadora'
              ? (forma.tempo_estimado || 'Envio com rastreamento')
              : (forma.tempo_estimado || 'Entrega com frota própria / motoboy'),
            icone_tipo: forma.tipo === 'transportadora' ? ('padrao' as const) : ('loja' as const),
            permite_edicao_valor: true,
            tipo_cobranca: 'manual' as const
          };
        });

      const todasOpcoesCombinadas = [...opcoesFormasEntrega, ...opcoesSemErro];

      const opcoesAjustadas = todasOpcoesCombinadas.map(o => {
        const ehManual = Boolean(o.permite_edicao_valor || (o.provedor === 'frete_proprio' && o.servico_codigo === 'manual'));
        if (ehManual) {
          const ehOpcaoAtiva = opcaoSelecionadaId === o.id || opcaoSelecionadaId === o.servico_codigo || opcaoSelecionadaId === 'frete_proprio' || opcaoSelecionadaId === 'manual';
          const valorInicial = (ehOpcaoAtiva && typeof valorFreteAtual === 'number' && valorFreteAtual > 0)
            ? valorFreteAtual
            : (parseFloat(valorManualInput.replace(',', '.')) || (o.valor_frete || 0));

          return {
            ...o,
            valor_frete: valorInicial,
            valor_original: valorInicial,
            permite_edicao_valor: true
          };
        }
        return o;
      });

      setCotacoes(opcoesAjustadas);

      const opcoesValidas = opcoesAjustadas.filter(
        o => o.valor_frete > 0 || o.is_frete_gratis || o.permite_edicao_valor || o.servico_codigo === 'manual'
      );

      // Se a modalidade ativa for entrega, seleciona a melhor opção cotada automaticamente
      if (modalidade === 'entrega' && opcoesValidas.length > 0) {
        const opcaoGratis = opcoesValidas.find(o => o.is_frete_gratis);
        const encontrada = (opcaoSelecionadaId
          ? opcoesValidas.find(o => 
              o.id === opcaoSelecionadaId || 
              o.servico_codigo === opcaoSelecionadaId ||
              (opcaoSelecionadaId && (o.id.endsWith(String(opcaoSelecionadaId)) || String(opcaoSelecionadaId).includes(o.servico_codigo)))
            ) 
          : null)
          || opcaoGratis
          || opcoesValidas[0];
        setCotacaoEscolhida(encontrada);

        emitirSelecao(encontrada, endAlvo);
      } else if (modalidade === 'entrega') {
        setCotacaoEscolhida(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('Erro ao realizar cotação de frete:', msg);
      setErroCotacaoMsg('Não foi possível obter cotações para este endereço.');
    } finally {
      setCotando(false);
    }
  }, [configLoja, lojaId, modalidade, subtotal, itensSig, itens, temUber, temMelhorEnvio, temFreteProprio, temFormasEntregaEnvio, formasEntrega, opcaoSelecionadaId, valorFreteAtual, valorManualInput]);

  // Função centralizada para emitir o resultado de entrega padronizado
  const emitirSelecao = useCallback((opcao: OpcaoFreteCotada, endAlvo: ClienteEndereco | null) => {
    if (!endAlvo) return;
    const chaveEmissao = `${opcao.id}_${opcao.valor_frete}_${endAlvo.cep}_${endAlvo.numero}_entrega`;
    if (ultimoResultadoEmitidoRef.current === chaveEmissao) return;
    ultimoResultadoEmitidoRef.current = chaveEmissao;

    onChangeRef.current({
      tipo_atendimento: 'entrega',
      valor_frete: opcao.valor_frete,
      opcao_frete: opcao,
      opcao_selecionada: opcao,
      endereco_selecionado: endAlvo,
      pedido_entrega: {
        pedido_id: '',
        forma_entrega_id: opcao.forma_entrega_id || null,
        tipo_atendimento: 'entrega',
        cliente_endereco_id: endAlvo.id && isUuidValido(endAlvo.id) ? endAlvo.id : null,
        destino_cep: endAlvo.cep,
        destino_logradouro: endAlvo.logradouro,
        destino_numero: endAlvo.numero,
        destino_complemento: endAlvo.complemento,
        destino_bairro: endAlvo.bairro,
        destino_cidade: endAlvo.cidade,
        destino_uf: endAlvo.uf,
        destino_latitude: endAlvo.latitude,
        destino_longitude: endAlvo.longitude,
        provedor: opcao.provedor,
        transportadora_nome: opcao.transportadora_nome,
        servico_codigo: opcao.servico_codigo,
        valor_frete: opcao.valor_frete,
        valor_original: opcao.valor_original ?? opcao.valor_frete,
        valor_subsidio: opcao.valor_subsidio ?? 0,
        is_frete_gratis: opcao.is_frete_gratis ?? (opcao.valor_frete === 0),
        prazo_estimado_texto: opcao.prazo_estimado_texto,
        status_envio: 'pendente'
      }
    });
  }, []);

  // Manipulador de digitação direta de valor manual
  const handleAlterarValorManual = (opcao: OpcaoFreteCotada, novoTexto: string) => {
    setValorManualInput(novoTexto);
    const numVal = parseFloat(novoTexto.replace(',', '.')) || 0;

    const opcaoAtualizada: OpcaoFreteCotada = {
      ...opcao,
      valor_frete: numVal,
      valor_original: numVal
    };

    setCotacoes(prev => prev.map(c => c.id === opcao.id ? opcaoAtualizada : c));
    setModalidade('entrega');
    setCotacaoEscolhida(opcaoAtualizada);
    if (enderecoSelecionado) {
      emitirSelecao(opcaoAtualizada, enderecoSelecionado);
    }
  };

  // Dispara cotação quando o endereço for definido e houver integrações ou formas de entrega ativas
  useEffect(() => {
    if (enderecoSelecionado && (configLoja || temFormasEntregaEnvio) && (temUber || temMelhorEnvio || temFreteProprio || temFormasEntregaEnvio)) {
      executarCotacao(enderecoSelecionado);
    }
  }, [enderecoSelecionado, configLoja, temUber, temMelhorEnvio, temFreteProprio, temFormasEntregaEnvio, executarCotacao]);

  // Selecionar Modalidade de Retirada
  const handleSelecionarRetirada = () => {
    if (!permiteRetirada) return;
    setModalidade('retirada');
    setCotacaoEscolhida(null);

    const formaRetirada = formasEntrega.find(f => f.tipo === 'retirada');
    const chaveEmissao = `retirada_0_${lojaId}`;
    if (ultimoResultadoEmitidoRef.current !== chaveEmissao) {
      ultimoResultadoEmitidoRef.current = chaveEmissao;
      onChangeRef.current({
        tipo_atendimento: 'retirada',
        valor_frete: 0.00,
        opcao_selecionada: null,
        pedido_entrega: {
          pedido_id: '',
          forma_entrega_id: formaRetirada?.id || null,
          tipo_atendimento: 'retirada',
          cliente_endereco_id: null,
          provedor: 'retirada_loja',
          transportadora_nome: formaRetirada?.nome || 'Retirada na Loja',
          servico_codigo: 'retirada_balcao',
          valor_frete: 0.00,
          prazo_estimado_texto: 'Disponível no balcão',
          status_envio: 'pronto_para_retirar'
        }
      });
    }
  };

  // Seleção de uma opção cotada específica
  const handleEscolherCotacao = (opcao: OpcaoFreteCotada) => {
    const cepLimpo = (enderecoSelecionado?.cep || '').replace(/\D/g, '');
    const logrLimpo = (enderecoSelecionado?.logradouro || '').trim();
    const numLimpo = (enderecoSelecionado?.numero || '').trim();

    if (!clienteId || !enderecoSelecionado || cepLimpo.length !== 8 || !logrLimpo || !numLimpo) {
      onSolicitarAtualizarEndereco?.();
      return;
    }

    setModalidade('entrega');

    const ehManual = Boolean(
      opcao.permite_edicao_valor ||
      (opcao.provedor === 'frete_proprio' && opcao.servico_codigo === 'manual')
    );

    let opcaoFinal = opcao;
    if (ehManual) {
      const numVal = valorManualInput !== ''
        ? (parseFloat(valorManualInput.replace(',', '.')) || 0)
        : (typeof opcao.valor_frete === 'number' ? opcao.valor_frete : 0);
      opcaoFinal = {
        ...opcao,
        valor_frete: numVal,
        valor_original: numVal,
        is_frete_gratis: numVal === 0
      };
    }

    setCotacaoEscolhida(opcaoFinal);
    emitirSelecao(opcaoFinal, enderecoSelecionado);
  };

  // Dados da Loja para Retirada
  const dadosLojaFormatados = {
    nome: loja?.nome || loja?.nome_loja || 'Loja Física',
    nome_loja: loja?.nome_loja,
    endereco_logradouro: loja?.endereco_logradouro || configLoja?.origem_logradouro,
    endereco_numero: loja?.endereco_numero || configLoja?.origem_numero,
    endereco_complemento: loja?.endereco_complemento || configLoja?.origem_complemento,
    endereco_bairro: loja?.endereco_bairro || configLoja?.origem_bairro,
    endereco_cidade: loja?.endereco_cidade || configLoja?.origem_cidade,
    endereco_estado: loja?.endereco_estado || configLoja?.origem_uf,
    endereco_cep: loja?.endereco_cep || configLoja?.origem_cep,
    telefone: loja?.telefone,
    whatsapp: loja?.whatsapp
  };

  const linkWhatsAppLoja = `https://wa.me/55${(dadosLojaFormatados.whatsapp || dadosLojaFormatados.telefone || '').replace(/\D/g, '')}?text=${encodeURIComponent('Olá! Gostaria de combinar a entrega do meu pedido.')}`;

  const { link: linkWhatsAppRetirada } = gerarLinkWhatsAppLocalizacaoLoja(
    dadosLojaFormatados,
    cliente?.whatsapp || cliente?.telefone
  );

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 1. CARD DE ENDEREÇO DE ENTREGA */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Calculamos os custos e prazos para este endereço:</span>
        </div>

        {carregandoEnderecos ? (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center gap-2 text-slate-500 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            <span>Carregando dados de endereço...</span>
          </div>
        ) : enderecoSelecionado ? (
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 relative overflow-hidden text-slate-800 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      {enderecoSelecionado.identificador || 'Endereço Principal'}
                    </span>
                    {enderecoSelecionado.is_principal && (
                      <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200">
                        Principal
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-700 mt-1">
                    {enderecoSelecionado.logradouro}, {enderecoSelecionado.numero}{' '}
                    {enderecoSelecionado.complemento ? `(${enderecoSelecionado.complemento})` : ''}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {enderecoSelecionado.bairro}, {enderecoSelecionado.cidade}-{enderecoSelecionado.uf} | CEP: {enderecoSelecionado.cep}
                  </p>
                </div>
              </div>
            </div>

            {/* Botão Escolher Outro Endereço */}
            <div className="pt-2 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setModalEscolherOutroAberto(true)}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer transition hover:underline"
              >
                <span>Escolher outro endereço</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
            <p className="text-xs text-slate-500">Nenhum endereço selecionado.</p>
            {clienteId && (
              <button
                type="button"
                onClick={() => setModalEscolherOutroAberto(true)}
                className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs hover:bg-emerald-100 transition cursor-pointer"
              >
                Selecionar ou Cadastrar Endereço
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2. LISTA ÚNICA E UNIFICADA: OPÇÕES DE ENTREGA E RETIRADA */}
      <div className="space-y-2 pt-1">
        <span className="text-xs font-bold text-slate-700 block">Opções de Entrega e Retirada</span>

        {/* 2.1. PRIMEIRA OPÇÃO: RETIRAR NA LOJA (BALCÃO FÍSICO) */}
        {permiteRetirada && (
          <div className="space-y-2">
            <div
              onClick={handleSelecionarRetirada}
              className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                modalidade === 'retirada'
                  ? 'bg-emerald-50/80 border-2 border-emerald-500 text-slate-900 shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100/70 border border-slate-200 text-slate-800'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                  modalidade === 'retirada'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-purple-50 text-purple-700 border-purple-200'
                }`}>
                  <Store className="w-4 h-4" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-900 truncate">
                      Retirar na Loja
                    </span>
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                      Balcão Físico
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium mt-1">
                    <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="text-slate-600">Disponibilidade Imediata</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <span className="font-extrabold text-sm text-emerald-600">
                    Grátis
                  </span>
                </div>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                  modalidade === 'retirada'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'border-2 border-slate-300'
                }`}>
                  {modalidade === 'retirada' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>
            </div>

            {/* Informações detalhadas da retirada física quando a opção estiver selecionada */}
            {modalidade === 'retirada' && (
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800 space-y-2.5 animate-in fade-in duration-200 text-xs shadow-sm">
                <div className="text-slate-600 leading-relaxed">
                  <strong className="text-slate-800">Endereço para Retirada:</strong>{' '}
                  {[
                    dadosLojaFormatados.endereco_logradouro,
                    dadosLojaFormatados.endereco_numero ? `nº ${dadosLojaFormatados.endereco_numero}` : '',
                    dadosLojaFormatados.endereco_bairro,
                    dadosLojaFormatados.endereco_cidade && dadosLojaFormatados.endereco_estado
                      ? `${dadosLojaFormatados.endereco_cidade}-${dadosLojaFormatados.endereco_estado}`
                      : dadosLojaFormatados.endereco_cidade,
                    dadosLojaFormatados.endereco_cep ? `(CEP: ${dadosLojaFormatados.endereco_cep})` : ''
                  ]
                    .filter(Boolean)
                    .join(', ') || 'Consulte o balcão da loja'}
                </div>

                <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalMapaLojaAberto(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Navigation className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Ver no Mapa</span>
                  </button>

                  <a
                    href={linkWhatsAppRetirada}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Enviar para o WhatsApp</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2.2. OPÇÕES DE ENTREGA: Validação de endereço e cotações */}
        {(!clienteId || !enderecoSelecionado || !(enderecoSelecionado.cep || '').replace(/\D/g, '') || !(enderecoSelecionado.logradouro || '').trim()) ? (
          <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Endereço incompleto</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Para receber via Uber, Melhor Envio ou Correios, atualize o endereço do cliente.
            </p>
            <button
              type="button"
              onClick={() => onSolicitarAtualizarEndereco?.()}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm active:scale-95"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>{clienteId ? 'Atualizar endereço' : 'Identificar / Vincular Cliente'}</span>
            </button>
          </div>
        ) : !carregandoConfig && !temIntegracoesAtivas ? (
          /* Cenário: Nenhuma integração ativa para cotação automática */
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold text-xs block text-amber-900">
                  Cotação Automática de Entrega Não Configurada
                </span>
                <p className="text-xs text-amber-800 leading-relaxed">
                  A loja não possui integrações ativas de entrega automática no momento. Entre em contato para combinar o frete.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-amber-200 flex flex-wrap items-center gap-2">
              <a
                href={linkWhatsAppLoja}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition shadow-md shadow-emerald-600/20"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Falar no WhatsApp da Loja</span>
              </a>
            </div>
          </div>
        ) : cotando ? (
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span>Calculando opções de frete em tempo real...</span>
          </div>
        ) : erroCotacaoMsg ? (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{erroCotacaoMsg}</span>
          </div>
        ) : cotacoes.length === 0 ? (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
            Nenhuma opção de entrega encontrada para este CEP.
          </div>
        ) : (
          /* Cards de Opções de Frete cotadas */
          <div className="space-y-2">
            {cotacoes.map((opcao) => {
              const selecionada = modalidade === 'entrega' && cotacaoEscolhida?.id === opcao.id;
              const ehManual = Boolean(
                opcao.permite_edicao_valor ||
                (opcao.provedor === 'frete_proprio' && opcao.servico_codigo === 'manual')
              );

              return (
                <div
                  key={opcao.id}
                  onClick={() => handleEscolherCotacao(opcao)}
                  className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                    selecionada
                      ? 'bg-emerald-50/80 border-2 border-emerald-500 text-slate-900 shadow-sm'
                      : 'bg-slate-50 hover:bg-slate-100/70 border border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                      opcao.provedor === 'uber'
                        ? 'bg-black text-white font-black text-[11px] border-black'
                        : opcao.provedor === 'frete_proprio'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : 'bg-white text-emerald-600 font-bold text-xs border-slate-200'
                    }`}>
                      {opcao.provedor === 'uber' ? (
                        'UBER'
                      ) : opcao.provedor === 'frete_proprio' ? (
                        <Truck className="w-4 h-4 text-emerald-700" />
                      ) : (
                        <Truck className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {opcao.transportadora_nome}
                        </span>
                        {opcao.servico_nome && opcao.servico_nome !== opcao.transportadora_nome && (
                          <span className="text-[11px] text-slate-600 font-semibold truncate">
                            ({opcao.servico_nome})
                          </span>
                        )}
                        {opcao.is_frete_gratis && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Frete Grátis
                          </span>
                        )}
                        {ehManual && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                            Valor Manual
                          </span>
                        )}
                      </div>
                      {opcao.prazo_estimado_texto && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium mt-1">
                          <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="text-slate-600">{opcao.prazo_estimado_texto}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {ehManual ? (
                      <div
                        className="flex items-center gap-1 bg-white border border-slate-300 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 rounded-xl px-2.5 py-1.5 transition shadow-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-xs font-bold text-slate-500 select-none">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,00"
                          value={selecionada ? valorManualInput : (opcao.valor_frete > 0 ? opcao.valor_frete.toString() : '0.00')}
                          onClick={(e) => e.stopPropagation()}
                          onFocus={(e) => {
                            e.stopPropagation();
                            setValorManualInput(opcao.valor_frete > 0 ? opcao.valor_frete.toString() : '');
                            handleEscolherCotacao(opcao);
                          }}
                          onChange={(e) => handleAlterarValorManual(opcao, e.target.value)}
                          className="w-24 text-right font-extrabold text-sm text-slate-800 focus:text-emerald-600 outline-none bg-transparent"
                        />
                      </div>
                    ) : (
                      <div className="text-right">
                        {opcao.is_frete_gratis ? (
                          <div className="flex flex-col items-end leading-tight">
                            {opcao.valor_original != null && opcao.valor_original > 0 && (
                              <span className="text-xs line-through text-slate-400 font-bold">
                                R$ {opcao.valor_original.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            )}
                            <span className="font-extrabold text-sm text-emerald-600">
                              Grátis
                            </span>
                          </div>
                        ) : opcao.is_upgrade_subsidio ? (
                          <div className="flex flex-col items-end leading-tight">
                            {opcao.valor_original != null && (
                              <span className="text-xs line-through text-slate-400 font-bold">
                                R$ {opcao.valor_original.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            )}
                            <span className="font-extrabold text-sm text-emerald-600">
                              R$ {opcao.valor_frete.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        ) : (
                          <span className="font-extrabold text-sm text-emerald-600">
                            R$ {opcao.valor_frete.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                    )}
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                      selecionada ? 'bg-emerald-600 text-white shadow-sm' : 'border-2 border-slate-300'
                    }`}>
                      {selecionada && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: ESCOLHER OUTRO ENDEREÇO */}
      {clienteId && (
        <ModalEscolherOutroEndereco
          aberto={modalEscolherOutroAberto}
          onFechar={() => setModalEscolherOutroAberto(false)}
          clienteId={clienteId}
          enderecoAtualId={enderecoSelecionado?.id}
          onConfirmarEndereco={(novoEnd) => {
            setEnderecoSelecionado(novoEnd);
            executarCotacao(novoEnd, true);
          }}
        />
      )}

      {/* MODAL: VER NO MAPA */}
      <ModalVerNoMapaLoja
        aberto={modalMapaLojaAberto}
        onFechar={() => setModalMapaLojaAberto(false)}
        loja={dadosLojaFormatados}
        telefoneCliente={cliente?.whatsapp || cliente?.telefone}
      />
    </div>
  );
};
