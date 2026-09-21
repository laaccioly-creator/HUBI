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
  ShieldCheck,
  Zap,
  PenLine,
  Bike,
  Package
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
  permiteRetirada?: boolean;
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
  permiteRetirada: permiteRetiradaProp,
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

  // Sub-via de entrega: 'cotar' (integrações automáticas) ou 'manual' (formas cadastradas)
  const [viaEntrega, setViaEntrega] = useState<'cotar' | 'manual'>('cotar');

  // Estados isolados por ID da modalidade manual (chave: forma.id)
  const [valoresManuais, setValoresManuais] = useState<Record<string, string>>({});
  const [entregadores, setEntregadores] = useState<Record<string, string>>({});
  const [contatosEntregadores, setContatosEntregadores] = useState<Record<string, string>>({});
  const [codigosRastreio, setCodigosRastreio] = useState<Record<string, string>>({});
  const [linksRastreio, setLinksRastreio] = useState<Record<string, string>>({});
  const [pinsEntrega, setPinsEntrega] = useState<Record<string, string>>({});
  const [nomesApp, setNomesApp] = useState<Record<string, string>>({});
  const [servicosCorreios, setServicosCorreios] = useState<Record<string, 'PAC' | 'SEDEX'>>({});
  const [nomesTransportadora, setNomesTransportadora] = useState<Record<string, string>>({});

  // ID da forma de entrega manual atualmente selecionada
  const [formaManualEscolhidaId, setFormaManualEscolhidaId] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    async function carregarFormas() {
      if (!lojaId) return;
      try {
        const lista = await ShippingOrchestrator.listarFormasEntrega(lojaId);
        if (ativo) {
          const ativas = lista.filter(f => f.ativo);
          setFormasEntrega(ativas);

          // Inicializa mapeamento de valores manuais por ID de forma isolada
          setValoresManuais(prev => {
            const next = { ...prev };
            ativas.forEach(f => {
              if (next[f.id] === undefined) {
                const ehOpcaoAtiva = (
                  opcaoSelecionadaId === f.id ||
                  opcaoSelecionadaId === `forma_${f.id}` ||
                  opcaoSelecionadaId === f.tipo ||
                  opcaoSelecionadaId === f.nome
                );
                if (ehOpcaoAtiva && typeof valorFreteAtual === 'number' && valorFreteAtual >= 0) {
                  next[f.id] = valorFreteAtual.toString();
                } else {
                  next[f.id] = (f.valor_taxa !== undefined && f.valor_taxa !== null && f.valor_taxa > 0)
                    ? f.valor_taxa.toString()
                    : '';
                }
              }
            });
            return next;
          });

          // Detecta se a opção atual do pedido era manual
          const formaAtiva = ativas.find(f => 
            f.tipo !== 'retirada' && (
              opcaoSelecionadaId === f.id ||
              opcaoSelecionadaId === `forma_${f.id}` ||
              opcaoSelecionadaId === f.tipo ||
              opcaoSelecionadaId === f.nome ||
              opcaoSelecionadaId === 'manual' ||
              opcaoSelecionadaId === 'frete_proprio'
            )
          );
          if (formaAtiva) {
            setFormaManualEscolhidaId(formaAtiva.id);
            setViaEntrega('manual');
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar formas de entrega no seletor:', err);
      }
    }
    carregarFormas();
    return () => {
      ativo = false;
    };
  }, [lojaId, opcaoSelecionadaId, valorFreteAtual]);

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
      // 1. Se já existe um endereço de entrega ativo no pedido com dados completos, preservá-lo
      const cepLimpoAtual = (enderecoEntregaAtual?.cep || '').replace(/\D/g, '');
      const temEnderecoCompleto = Boolean(
        enderecoEntregaAtual &&
        cepLimpoAtual.length === 8 &&
        enderecoEntregaAtual.logradouro &&
        enderecoEntregaAtual.numero &&
        enderecoEntregaAtual.numero !== 'S/N'
      );

      if (temEnderecoCompleto && enderecoEntregaAtual) {
        const endAtualFormatado: ClienteEndereco = {
          id: enderecoEntregaAtual.id || 'end-pedido-atual',
          cliente_id: cliente?.id || clienteId || 'temp',
          identificador: enderecoEntregaAtual.identificador || 'Endereço Atual do Pedido',
          cep: cepLimpoAtual,
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
  const permiteRetirada = permiteRetiradaProp !== undefined ? permiteRetiradaProp : Boolean(
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

  // 3. Executar Cotação Automática (Uber Direct e Melhor Envio)
  const executarCotacao = useCallback(async (endAlvo: ClienteEndereco, forcar = false) => {
    if (!temUber && !temMelhorEnvio) {
      setCotacoes([]);
      return;
    }

    const chaveCotacao = `${endAlvo.cep}_${endAlvo.numero}_${subtotal}_${itensSig}_${configLoja?.id || 'loja'}`;
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
        frete_proprio_ativo: false
      };

      const promessaCotacao = configLoja?.origem_cep
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

      // Recalcula o benefício de frete grátis/subsídio estritamente sobre as opções válidas
      const opcoesComSubsidio = ShippingOrchestrator.aplicarSubsidioFreteGratis(
        opcoesFiltradas,
        runtimeConfig,
        subtotal
      );

      // Descartar opções com erro para não poluir a interface do usuário
      const opcoesSemErro = opcoesComSubsidio.filter(o => !o.erro && o.id !== 'uber-blocked');

      setCotacoes(opcoesSemErro);

      // Apenas pré-seleciona se houver uma opção selecionada previamente e explicitamente solicitada
      if (modalidade === 'entrega' && viaEntrega === 'cotar' && opcoesSemErro.length > 0 && opcaoSelecionadaId) {
        const encontrada = opcoesSemErro.find(o => 
          o.id === opcaoSelecionadaId || 
          o.servico_codigo === opcaoSelecionadaId ||
          (o.id.endsWith(String(opcaoSelecionadaId)) || String(opcaoSelecionadaId).includes(o.servico_codigo))
        );
        if (encontrada) {
          setCotacaoEscolhida(encontrada);
          emitirSelecao(encontrada, endAlvo);
        } else {
          setCotacaoEscolhida(null);
        }
      } else if (modalidade === 'entrega' && viaEntrega === 'cotar') {
        setCotacaoEscolhida(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('Erro ao realizar cotação de frete:', msg);
      setErroCotacaoMsg('Não foi possível obter cotações automáticas para este endereço.');
    } finally {
      setCotando(false);
    }
  }, [configLoja, lojaId, modalidade, viaEntrega, subtotal, itensSig, itens, temUber, temMelhorEnvio, opcaoSelecionadaId]);

  // Emissão de cotação automática padronizada
  const emitirSelecao = useCallback((opcao: OpcaoFreteCotada, endAlvo: ClienteEndereco | null) => {
    if (!endAlvo) return;
    const chaveEmissao = `${opcao.id}_${opcao.valor_frete}_${endAlvo.cep}_${endAlvo.numero}_entrega_auto`;
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
        forma_entrega_nome: opcao.transportadora_nome,
        tipo_entrega: opcao.provedor === 'uber' ? 'proprio' : 'transportadora',
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

  // Emissão de forma de entrega manual isolada
  const emitirSelecaoManual = useCallback((
    forma: FormaEntrega,
    valorStr: string,
    endAlvo: ClienteEndereco | null,
    dadosAdicionais?: {
      entregador?: string;
      contatoEntregador?: string;
      rastreio?: string;
      link?: string;
      pin?: string;
      nomeApp?: string;
      servicoCorreios?: 'PAC' | 'SEDEX';
      nomeTransportadora?: string;
    }
  ) => {
    if (!endAlvo) return;
    const numVal = parseFloat(valorStr.replace(',', '.')) || 0;

    let tipoEntregaCalculado: 'proprio' | 'transportadora' | 'manual' = 'manual';
    if (forma.tipo === 'proprio' || forma.tipo === 'frota_propria' || forma.tipo === 'motoboy' || forma.tipo === 'taxa_fixa') {
      tipoEntregaCalculado = 'proprio';
    } else if (forma.tipo === 'transportadora' || forma.tipo === 'correios') {
      tipoEntregaCalculado = 'transportadora';
    } else {
      tipoEntregaCalculado = 'manual';
    }

    const provedorFinal = (forma.tipo === 'transportadora' || forma.tipo === 'correios') ? 'melhor_envio' : 'frete_proprio';

    const entregadorFinal = dadosAdicionais?.entregador !== undefined
      ? dadosAdicionais.entregador
      : (entregadores[forma.id] || null);

    const contatoFinal = dadosAdicionais?.contatoEntregador !== undefined
      ? dadosAdicionais.contatoEntregador
      : (contatosEntregadores[forma.id] || null);

    const rastreioFinal = dadosAdicionais?.rastreio !== undefined
      ? dadosAdicionais.rastreio
      : (codigosRastreio[forma.id] || null);

    const linkFinal = dadosAdicionais?.link !== undefined
      ? dadosAdicionais.link
      : (linksRastreio[forma.id] || null);

    const pinFinal = dadosAdicionais?.pin !== undefined
      ? dadosAdicionais.pin
      : (pinsEntrega[forma.id] || null);

    const nomeAppFinal = dadosAdicionais?.nomeApp !== undefined
      ? dadosAdicionais.nomeApp
      : (nomesApp[forma.id] || (forma.tipo === 'app_entrega' ? 'Uber' : null));

    const servicoCorreiosFinal = dadosAdicionais?.servicoCorreios !== undefined
      ? dadosAdicionais.servicoCorreios
      : (servicosCorreios[forma.id] || (forma.tipo === 'correios' ? 'SEDEX' : null));

    const nomeTransportadoraFinal = dadosAdicionais?.nomeTransportadora !== undefined
      ? dadosAdicionais.nomeTransportadora
      : (nomesTransportadora[forma.id] || null);

    const opcaoManual: OpcaoFreteCotada = {
      id: `forma_${forma.id}`,
      forma_entrega_id: forma.id,
      provedor: provedorFinal,
      transportadora_nome: nomeTransportadoraFinal || forma.nome,
      servico_codigo: forma.tipo,
      servico_nome: forma.nome,
      valor_frete: numVal,
      valor_original: numVal,
      valor_subsidio: 0,
      is_frete_gratis: numVal === 0,
      prazo_estimado_texto: forma.tempo_estimado || 'Entrega combinada',
      icone_tipo: (forma.tipo === 'transportadora' || forma.tipo === 'correios') ? 'padrao' : 'loja',
      permite_edicao_valor: true,
      tipo_cobranca: 'manual'
    };

    const chaveEmissao = `manual_${forma.id}_${numVal}_${endAlvo.cep}_${endAlvo.numero}_${entregadorFinal || ''}_${rastreioFinal || ''}_${linkFinal || ''}_${pinFinal || ''}_${nomeAppFinal || ''}_${servicoCorreiosFinal || ''}_${nomeTransportadoraFinal || ''}`;
    if (ultimoResultadoEmitidoRef.current === chaveEmissao) return;
    ultimoResultadoEmitidoRef.current = chaveEmissao;

    onChangeRef.current({
      tipo_atendimento: 'entrega',
      valor_frete: numVal,
      opcao_frete: opcaoManual,
      opcao_selecionada: opcaoManual,
      endereco_selecionado: endAlvo,
      pedido_entrega: {
        pedido_id: '',
        forma_entrega_id: forma.id,
        forma_entrega_nome: forma.nome,
        tipo_entrega: tipoEntregaCalculado,
        tipo_operacao: forma.tipo,
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
        provedor: provedorFinal,
        transportadora_nome: nomeTransportadoraFinal || forma.nome,
        servico_codigo: forma.tipo,
        valor_frete: numVal,
        valor_original: numVal,
        valor_subsidio: 0,
        is_frete_gratis: numVal === 0,
        prazo_estimado_texto: forma.tempo_estimado || 'Entrega combinada',
        entregador_nome: entregadorFinal,
        contato_entregador: contatoFinal,
        codigo_rastreio: rastreioFinal,
        link_rastreio: linkFinal,
        pin_entrega: pinFinal,
        nome_app: nomeAppFinal,
        servico_correios: servicoCorreiosFinal,
        nome_transportadora: nomeTransportadoraFinal,
        status_envio: 'pendente'
      }
    });
  }, [entregadores, contatosEntregadores, codigosRastreio, linksRastreio, pinsEntrega, nomesApp, servicosCorreios, nomesTransportadora]);

  // Manipulador de digitação direta de valor na modalidade manual (estritamente isolado por forma.id)
  const handleAlterarValorManualForma = (forma: FormaEntrega, novoTexto: string) => {
    setValoresManuais(prev => ({ ...prev, [forma.id]: novoTexto }));
    setFormaManualEscolhidaId(forma.id);
    setModalidade('entrega');
    setViaEntrega('manual');
    if (enderecoSelecionado) {
      emitirSelecaoManual(forma, novoTexto, enderecoSelecionado);
    }
  };

  const handleAlterarEntregador = (forma: FormaEntrega, valor: string) => {
    setEntregadores(prev => ({ ...prev, [forma.id]: valor }));
    if (enderecoSelecionado && formaManualEscolhidaId === forma.id) {
      const preco = valoresManuais[forma.id] ?? (forma.valor_taxa > 0 ? forma.valor_taxa.toString() : '0');
      emitirSelecaoManual(forma, preco, enderecoSelecionado, { entregador: valor });
    }
  };

  const handleAlterarContatoEntregador = (forma: FormaEntrega, valor: string) => {
    setContatosEntregadores(prev => ({ ...prev, [forma.id]: valor }));
    if (enderecoSelecionado && formaManualEscolhidaId === forma.id) {
      const preco = valoresManuais[forma.id] ?? (forma.valor_taxa > 0 ? forma.valor_taxa.toString() : '0');
      emitirSelecaoManual(forma, preco, enderecoSelecionado, { contatoEntregador: valor });
    }
  };

  const handleAlterarCodigoRastreio = (forma: FormaEntrega, valor: string) => {
    setCodigosRastreio(prev => ({ ...prev, [forma.id]: valor }));
    if (enderecoSelecionado && formaManualEscolhidaId === forma.id) {
      const preco = valoresManuais[forma.id] ?? (forma.valor_taxa > 0 ? forma.valor_taxa.toString() : '0');
      emitirSelecaoManual(forma, preco, enderecoSelecionado, { rastreio: valor });
    }
  };

  const handleAlterarLinkRastreio = (forma: FormaEntrega, valor: string) => {
    setLinksRastreio(prev => ({ ...prev, [forma.id]: valor }));
    if (enderecoSelecionado && formaManualEscolhidaId === forma.id) {
      const preco = valoresManuais[forma.id] ?? (forma.valor_taxa > 0 ? forma.valor_taxa.toString() : '0');
      emitirSelecaoManual(forma, preco, enderecoSelecionado, { link: valor });
    }
  };

  const handleAlterarPin = (forma: FormaEntrega, valor: string) => {
    const limpo = valor.replace(/\D/g, '').slice(0, 4);
    setPinsEntrega(prev => ({ ...prev, [forma.id]: limpo }));
    if (enderecoSelecionado && formaManualEscolhidaId === forma.id) {
      const preco = valoresManuais[forma.id] ?? (forma.valor_taxa > 0 ? forma.valor_taxa.toString() : '0');
      emitirSelecaoManual(forma, preco, enderecoSelecionado, { pin: limpo });
    }
  };

  const handleAlterarNomeApp = (forma: FormaEntrega, valor: string) => {
    setNomesApp(prev => ({ ...prev, [forma.id]: valor }));
    if (enderecoSelecionado && formaManualEscolhidaId === forma.id) {
      const preco = valoresManuais[forma.id] ?? (forma.valor_taxa > 0 ? forma.valor_taxa.toString() : '0');
      emitirSelecaoManual(forma, preco, enderecoSelecionado, { nomeApp: valor });
    }
  };

  const handleAlterarServicoCorreios = (forma: FormaEntrega, valor: 'PAC' | 'SEDEX') => {
    setServicosCorreios(prev => ({ ...prev, [forma.id]: valor }));
    if (enderecoSelecionado && formaManualEscolhidaId === forma.id) {
      const preco = valoresManuais[forma.id] ?? (forma.valor_taxa > 0 ? forma.valor_taxa.toString() : '0');
      emitirSelecaoManual(forma, preco, enderecoSelecionado, { servicoCorreios: valor });
    }
  };

  const handleAlterarNomeTransportadora = (forma: FormaEntrega, valor: string) => {
    setNomesTransportadora(prev => ({ ...prev, [forma.id]: valor }));
    if (enderecoSelecionado && formaManualEscolhidaId === forma.id) {
      const preco = valoresManuais[forma.id] ?? (forma.valor_taxa > 0 ? forma.valor_taxa.toString() : '0');
      emitirSelecaoManual(forma, preco, enderecoSelecionado, { nomeTransportadora: valor });
    }
  };

  const handleSelecionarFormaManual = (forma: FormaEntrega) => {
    const cepLimpo = (enderecoSelecionado?.cep || '').replace(/\D/g, '');
    const logrLimpo = (enderecoSelecionado?.logradouro || '').trim();
    const numLimpo = (enderecoSelecionado?.numero || '').trim();

    if (!clienteId || !enderecoSelecionado || cepLimpo.length !== 8 || !logrLimpo || !numLimpo) {
      onSolicitarAtualizarEndereco?.();
      return;
    }

    setModalidade('entrega');
    setViaEntrega('manual');
    setFormaManualEscolhidaId(forma.id);
    const preco = valoresManuais[forma.id] ?? (forma.valor_taxa > 0 ? forma.valor_taxa.toString() : '0');
    emitirSelecaoManual(forma, preco, enderecoSelecionado);
  };

  // Dispara cotação automática quando o endereço for definido e houver integrações ativas
  useEffect(() => {
    if (enderecoSelecionado && configLoja && (temUber || temMelhorEnvio)) {
      executarCotacao(enderecoSelecionado);
    }
  }, [enderecoSelecionado, configLoja, temUber, temMelhorEnvio, executarCotacao]);

  // Selecionar Modalidade de Retirada (Balcão Físico - Grátis)
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
          forma_entrega_nome: formaRetirada?.nome || 'Retirada na Loja',
          tipo_entrega: 'retirada',
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
    setViaEntrega('cotar');
    setCotacaoEscolhida(opcao);
    emitirSelecao(opcao, enderecoSelecionado);
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
      {/* 1. CARD DE ENDEREÇO DE ENTREGA (Exibido apenas quando há endereço válido ou durante carregamento) */}
      {carregandoEnderecos ? (
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center gap-2 text-slate-500 text-xs">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
          <span>Carregando dados de endereço...</span>
        </div>
      ) : (enderecoSelecionado && (enderecoSelecionado.cep || '').replace(/\D/g, '') && (enderecoSelecionado.logradouro || '').trim()) ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Calculamos os custos e prazos para este endereço:</span>
          </div>

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
        </div>
      ) : null}

      {/* 2. FORMAS DE ATENDIMENTO (RETIRADA E ENTREGA) */}
      <div className="space-y-4 pt-1">
        {/* ========================================================================= */}
        {/* BLOCO 1: RETIRADA NA LOJA (BALCÃO FÍSICO) - CUSTO R$ 0,00 (GRÁTIS)        */}
        {/* ========================================================================= */}
        {permiteRetirada && (
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700 block">Balcão da Loja Física</span>
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
                    Grátis (R$ 0,00)
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

            {/* Informações detalhadas da retirada física quando selecionada */}
            {modalidade === 'retirada' && (
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800 space-y-2.5 animate-in fade-in duration-200 text-xs shadow-sm">
                <div className="text-slate-600 leading-relaxed">
                  <strong className="text-slate-800">Endereço da Loja:</strong>{' '}
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

        {/* ========================================================================= */}
        {/* BLOCO 2: ENTREGA NO ENDEREÇO DO CLIENTE (DUAS VIAS CLARAS)                */}
        {/* ========================================================================= */}
        <div className="space-y-3 pt-2 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 block">
              Entrega no Endereço do Cliente
            </span>
          </div>

          {/* Validação de Endereço do Cliente */}
          {(!clienteId || !enderecoSelecionado || !(enderecoSelecionado.cep || '').replace(/\D/g, '') || !(enderecoSelecionado.logradouro || '').trim()) ? (
            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Endereço incompleto para entrega</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Para calcular e despachar entregas, atualize o endereço do cliente.
              </p>
              <button
                type="button"
                onClick={() => onSolicitarAtualizarEndereco?.()}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm active:scale-95"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Atualizar Endereço</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Seletor de Duas Vias de Entrega */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setModalidade('entrega');
                    setViaEntrega('cotar');
                  }}
                  className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                    modalidade === 'entrega' && viaEntrega === 'cotar'
                      ? 'bg-white text-emerald-700 shadow-sm border border-emerald-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="truncate">Cotar Frete (Automático)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalidade('entrega');
                    setViaEntrega('manual');
                  }}
                  className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                    modalidade === 'entrega' && viaEntrega === 'manual'
                      ? 'bg-white text-emerald-700 shadow-sm border border-emerald-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <PenLine className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="truncate">Informar Frete (Manual)</span>
                </button>
              </div>

              {/* VIA A: COTAÇÃO AUTOMÁTICA EM TEMPO REAL (UBER DIRECT / MELHOR ENVIO) */}
              {viaEntrega === 'cotar' && (
                <div className="space-y-2">
                  {!carregandoConfig && !temUber && !temMelhorEnvio ? (
                    /* Alerta Amigável de Ausência de Integração Ativa */
                    <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-900 space-y-3">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <span className="font-bold text-xs block text-amber-950">
                            Cotação Automática de Entrega Não Configurada
                          </span>
                          <p className="text-xs text-amber-800 leading-relaxed">
                            Sua loja ainda não possui integração com Uber Direct ou Melhor Envio / Transportadoras. Acesse <strong>Configurações &gt; Frete</strong> para conectar sua conta ou utilize a opção <strong>"Informar Frete Manualmente"</strong>.
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-amber-200/60 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setModalidade('entrega');
                            setViaEntrega('manual');
                            const formasManuais = formasEntrega.filter(f => f.tipo !== 'retirada');
                            if (formasManuais.length > 0 && !formaManualEscolhidaId) {
                              const primeira = formasManuais[0];
                              setFormaManualEscolhidaId(primeira.id);
                              const val = valoresManuais[primeira.id] ?? (primeira.valor_taxa > 0 ? primeira.valor_taxa.toString() : '');
                              emitirSelecaoManual(primeira, val, enderecoSelecionado);
                            }
                          }}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer active:scale-95"
                        >
                          <PenLine className="w-3.5 h-3.5" />
                          <span>Informar Frete Manualmente</span>
                        </button>
                      </div>
                    </div>
                  ) : cotando ? (
                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
                      <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                      <span>Calculando opções de frete via API em tempo real...</span>
                    </div>
                  ) : erroCotacaoMsg ? (
                    <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{erroCotacaoMsg}</span>
                    </div>
                  ) : cotacoes.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 space-y-1">
                      <p className="font-semibold text-slate-700">Nenhuma cotação automática disponível para este endereço.</p>
                      <p>Utilize a aba "Informar Frete (Manual)" para definir o frete manualmente.</p>
                    </div>
                  ) : (
                    /* Lista de Cotações Automáticas */
                    <div className="space-y-2">
                      {cotacoes.map((opcao) => {
                        const selecionada = modalidade === 'entrega' && viaEntrega === 'cotar' && cotacaoEscolhida?.id === opcao.id;

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
                                  : 'bg-white text-emerald-600 font-bold text-xs border-slate-200'
                              }`}>
                                {opcao.provedor === 'uber' ? (
                                  'UBER'
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
                                ) : (
                                  <span className="font-extrabold text-sm text-emerald-600">
                                    R$ {opcao.valor_frete.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                )}
                              </div>
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
              )}

              {/* VIA B: INFORMAR FRETE MANUALMENTE (FORMAS RELACIONAIS CADASTRADAS) */}
              {viaEntrega === 'manual' && (
                <div className="space-y-2.5">
                  {formasEntrega.filter(f => f.tipo !== 'retirada').length === 0 ? (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-1.5">
                      <Truck className="w-6 h-6 text-slate-400 mx-auto" />
                      <p className="text-xs font-bold text-slate-700">Nenhuma forma de entrega manual ativa</p>
                      <p className="text-xs text-slate-500">
                        Acesse <strong>Configurações &gt; Frete</strong> para cadastrar modalidades manuais como Motoboy Próprio, Uber Flash Avulso ou Sedex.
                      </p>
                    </div>
                  ) : (
                    formasEntrega
                      .filter(forma => forma.tipo !== 'retirada')
                      .map((forma) => {
                        const selecionada = modalidade === 'entrega' && viaEntrega === 'manual' && formaManualEscolhidaId === forma.id;
                        const valorForma = valoresManuais[forma.id] ?? '';

                        // Rótulo descritivo do tipo relacional
                        let rotuloTipo = 'Manual';
                        if (forma.tipo === 'frota_propria' || forma.tipo === 'proprio') rotuloTipo = 'Frota Própria';
                        else if (forma.tipo === 'motoboy') rotuloTipo = 'Motoboy';
                        else if (forma.tipo === 'app_entrega') rotuloTipo = 'App de Corrida';
                        else if (forma.tipo === 'correios') rotuloTipo = 'Correios';
                        else if (forma.tipo === 'transportadora') rotuloTipo = 'Transportadora';
                        else if (forma.tipo === 'taxa_fixa') rotuloTipo = 'Taxa Fixa';
                        else if (forma.tipo === 'bairro') rotuloTipo = 'Por Bairro';
                        else if (forma.tipo === 'distancia_km') rotuloTipo = 'Por Km';

                        return (
                          <div
                            key={forma.id}
                            onClick={() => handleSelecionarFormaManual(forma)}
                            className={`p-3.5 rounded-2xl border transition cursor-pointer ${
                              selecionada
                                ? 'bg-emerald-50/80 border-2 border-emerald-500 text-slate-900 shadow-sm'
                                : 'bg-slate-50 hover:bg-slate-100/70 border border-slate-200 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                                  selecionada
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}>
                                  {forma.tipo === 'motoboy' || forma.tipo === 'frota_propria' || forma.tipo === 'proprio' ? (
                                    <Bike className="w-4 h-4" />
                                  ) : forma.tipo === 'transportadora' || forma.tipo === 'correios' ? (
                                    <Package className="w-4 h-4" />
                                  ) : forma.tipo === 'app_entrega' ? (
                                    <Navigation className="w-4 h-4" />
                                  ) : (
                                    <Truck className="w-4 h-4" />
                                  )}
                                </div>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-bold text-slate-900 truncate">
                                      {forma.nome}
                                    </span>
                                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-700 border border-slate-300">
                                      {rotuloTipo}
                                    </span>
                                  </div>
                                  {forma.tempo_estimado && (
                                    <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium mt-1">
                                      <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      <span className="text-slate-600">{forma.tempo_estimado}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-3 shrink-0">
                                {/* Input com estado isolado por ID da modalidade */}
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
                                    value={valorForma}
                                    onClick={(e) => e.stopPropagation()}
                                    onFocus={(e) => {
                                      e.stopPropagation();
                                      handleSelecionarFormaManual(forma);
                                    }}
                                    onChange={(e) => handleAlterarValorManualForma(forma, e.target.value)}
                                    className="w-24 text-right font-extrabold text-sm text-slate-800 focus:text-emerald-600 outline-none bg-transparent"
                                  />
                                </div>

                                <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                                  selecionada ? 'bg-emerald-600 text-white shadow-sm' : 'border-2 border-slate-300'
                                }`}>
                                  {selecionada && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                </div>
                              </div>
                            </div>

                            {/* Campos especializados por modalidade de operação quando selecionada */}
                            {selecionada && (
                              <div className="pt-3 mt-3 border-t border-emerald-200/60 space-y-3 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                                {/* MEIO: Frota Própria / Motoboy */}
                                {(forma.tipo === 'frota_propria' || forma.tipo === 'motoboy' || forma.tipo === 'proprio' || forma.requer_entregador) && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div>
                                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                        Nome do Entregador / Motoboy:
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="Ex: Carlos"
                                        value={entregadores[forma.id] || ''}
                                        onChange={(e) => handleAlterarEntregador(forma, e.target.value)}
                                        className="w-full px-3 py-1.5 text-xs rounded-xl bg-white border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition text-slate-800"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                        Contato (Telefone / WhatsApp):
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="Ex: (85) 99999-0000"
                                        value={contatosEntregadores[forma.id] || ''}
                                        onChange={(e) => handleAlterarContatoEntregador(forma, e.target.value)}
                                        className="w-full px-3 py-1.5 text-xs rounded-xl bg-white border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition text-slate-800"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* MEIO: App de Entrega (Uber / 99 / Lalamove) */}
                                {(forma.tipo === 'app_entrega' || forma.requer_link_rastreio) && (
                                  <div className="space-y-2.5">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                      <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                          App de Entrega:
                                        </label>
                                        <select
                                          value={nomesApp[forma.id] || 'Uber'}
                                          onChange={(e) => handleAlterarNomeApp(forma, e.target.value)}
                                          className="w-full px-3 py-1.5 text-xs rounded-xl bg-white border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition text-slate-800 font-medium"
                                        >
                                          <option value="Uber">Uber Flash</option>
                                          <option value="99">99 Entregas</option>
                                          <option value="Lalamove">Lalamove</option>
                                          <option value="Outro">Outro Aplicativo</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                                          <span>PIN de Entrega (4 dígitos):</span>
                                          <span className="text-[10px] text-emerald-700 font-bold uppercase">Código da corrida</span>
                                        </label>
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          maxLength={4}
                                          placeholder="Ex: 4892"
                                          value={pinsEntrega[forma.id] || ''}
                                          onChange={(e) => handleAlterarPin(forma, e.target.value)}
                                          className="w-full px-3 py-1.5 text-xs rounded-xl bg-white border-2 border-emerald-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500 outline-none transition text-emerald-800 font-black tracking-widest text-center text-sm"
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                        Link de Rastreio da Corrida:
                                      </label>
                                      <input
                                        type="url"
                                        placeholder="https://trip.uber.com/... ou https://99app.com/..."
                                        value={linksRastreio[forma.id] || ''}
                                        onChange={(e) => handleAlterarLinkRastreio(forma, e.target.value)}
                                        className="w-full px-3 py-1.5 text-xs rounded-xl bg-white border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition text-slate-800"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* MEIO: Correios */}
                                {forma.tipo === 'correios' && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div>
                                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                        Serviço dos Correios:
                                      </label>
                                      <select
                                        value={servicosCorreios[forma.id] || 'SEDEX'}
                                        onChange={(e) => handleAlterarServicoCorreios(forma, e.target.value as 'PAC' | 'SEDEX')}
                                        className="w-full px-3 py-1.5 text-xs rounded-xl bg-white border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition text-slate-800 font-medium"
                                      >
                                        <option value="SEDEX">SEDEX</option>
                                        <option value="PAC">PAC</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                        Código de Rastreamento:
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="Ex: QB123456789BR"
                                        value={codigosRastreio[forma.id] || ''}
                                        onChange={(e) => handleAlterarCodigoRastreio(forma, e.target.value)}
                                        className="w-full px-3 py-1.5 text-xs rounded-xl bg-white border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition uppercase text-slate-800 font-mono font-bold"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* MEIO: Transportadora Geral */}
                                {forma.tipo === 'transportadora' && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div>
                                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                        Nome da Transportadora:
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="Ex: Jadlog, Total Express, Braspress"
                                        value={nomesTransportadora[forma.id] || ''}
                                        onChange={(e) => handleAlterarNomeTransportadora(forma, e.target.value)}
                                        className="w-full px-3 py-1.5 text-xs rounded-xl bg-white border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition text-slate-800 font-medium"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                        Código de Rastreio:
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="Ex: JAD12345678"
                                        value={codigosRastreio[forma.id] || ''}
                                        onChange={(e) => handleAlterarCodigoRastreio(forma, e.target.value)}
                                        className="w-full px-3 py-1.5 text-xs rounded-xl bg-white border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition uppercase text-slate-800 font-mono font-bold"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Fallback genérico de rastreio se a forma requer rastreio mas não é correios/transportadora */}
                                {forma.requer_codigo_rastreio && forma.tipo !== 'correios' && forma.tipo !== 'transportadora' && (
                                  <div>
                                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                      Código de Rastreamento:
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="Ex: AA123456789BR"
                                      value={codigosRastreio[forma.id] || ''}
                                      onChange={(e) => handleAlterarCodigoRastreio(forma, e.target.value)}
                                      className="w-full px-3 py-1.5 text-xs rounded-xl bg-white border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition uppercase text-slate-800 font-mono"
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                  )}
                </div>
              )}
            </div>
          )}
        </div>
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
