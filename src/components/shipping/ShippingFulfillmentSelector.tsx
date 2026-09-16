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
  onChange,
  className = '',
  modoCompacto = false
}) => {
  const [configLoja, setConfigLoja] = useState<LojaShippingConfig | null>(null);
  const [carregandoConfig, setCarregandoConfig] = useState<boolean>(true);

  // Aba ativa: 'retirada' ou 'entrega'
  const [modalidade, setModalidade] = useState<TipoAtendimento>(tipoAtendimentoAtual || 'entrega');

  // Endereço selecionado para entrega
  const [enderecoSelecionado, setEnderecoSelecionado] = useState<ClienteEndereco | null>(null);
  const [carregandoEnderecos, setCarregandoEnderecos] = useState<boolean>(false);
  const [modalEscolherOutroAberto, setModalEscolherOutroAberto] = useState<boolean>(false);
  const [modalMapaLojaAberto, setModalMapaLojaAberto] = useState<boolean>(false);

  // Cotações
  const [cotacoes, setCotacoes] = useState<OpcaoFreteCotada[]>([]);
  const [cotacaoEscolhida, setCotacaoEscolhida] = useState<OpcaoFreteCotada | null>(null);
  const [cotando, setCotando] = useState<boolean>(false);
  const [erroCotacaoMsg, setErroCotacaoMsg] = useState<string | null>(null);

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

  // 2. Carregar Endereço Principal do Cliente
  useEffect(() => {
    let ativo = true;

    async function carregarEnderecoInicial() {
      if (clienteId) {
        setCarregandoEnderecos(true);
        try {
          const lista = await ShippingOrchestrator.listarEnderecosCliente(clienteId);
          if (ativo) {
            if (clienteCep && clienteLogr && clienteCid) {
              const correspondente = lista.find(e => 
                (e.cep || '').replace(/\D/g, '') === clienteCep &&
                (e.numero || '').trim().toLowerCase() === clienteNum.toLowerCase()
              );

              const novoEnd = correspondente || {
                id: 'cli-db-principal',
                cliente_id: cliente?.id || clienteId,
                identificador: 'Principal',
                cep: clienteCep,
                logradouro: clienteLogr,
                numero: clienteNum || 'S/N',
                complemento: clienteComp || null,
                bairro: clienteBairro,
                cidade: clienteCid,
                uf: clienteUf,
                is_principal: true
              };

              setEnderecoSelecionado(prev => {
                if (prev && prev.cep === novoEnd.cep && prev.numero === novoEnd.numero) {
                  return prev;
                }
                return novoEnd;
              });
            } else if (lista.length > 0) {
              const principal = lista.find(e => e.is_principal) || lista[0];
              setEnderecoSelecionado(prev => {
                if (prev && prev.id === principal.id) return prev;
                return principal;
              });
            }
          }
        } catch (err) {
          console.warn('Erro ao buscar endereços do cliente:', err);
        } finally {
          if (ativo) setCarregandoEnderecos(false);
        }
      } else if (clienteCep && clienteCid) {
        const novoEnd = {
          id: 'temp-cli',
          cliente_id: cliente?.id || 'temp',
          identificador: 'Principal',
          cep: clienteCep,
          logradouro: clienteLogr,
          numero: clienteNum || 'S/N',
          complemento: clienteComp || null,
          bairro: clienteBairro,
          cidade: clienteCid,
          uf: clienteUf,
          is_principal: true
        };

        setEnderecoSelecionado(prev => {
          if (prev && prev.cep === novoEnd.cep && prev.numero === novoEnd.numero) {
            return prev;
          }
          return novoEnd;
        });
      }
    }

    carregarEnderecoInicial();

    return () => {
      ativo = false;
    };
  }, [clienteId, clienteCep, clienteLogr, clienteNum, clienteComp, clienteBairro, clienteCid, clienteUf]);

  // Identificação de integrações ativas ou configuradas
  const temUber = Boolean(
    configLoja?.uber_ativo || 
    (configLoja?.uber_client_id && configLoja?.uber_customer_id)
  );
  const temMelhorEnvio = Boolean(
    configLoja?.melhor_envio_ativo || 
    configLoja?.melhor_envio_token
  );
  const temIntegracoesAtivas = Boolean(temUber || temMelhorEnvio);

  // 3. Executar Cotação com Filtro de Região Metropolitana para Uber Direct
  const executarCotacao = useCallback(async (endAlvo: ClienteEndereco, forcar = false) => {
    if (!configLoja) return;

    if (!temUber && !temMelhorEnvio) {
      setCotacoes([]);
      return;
    }

    const chaveCotacao = `${modalidade}_${endAlvo.cep}_${endAlvo.numero}_${subtotal}_${itensSig}_${configLoja.id}`;
    if (!forcar && ultimaCotacaoParamRef.current === chaveCotacao) {
      return;
    }
    ultimaCotacaoParamRef.current = chaveCotacao;

    setCotando(true);
    setErroCotacaoMsg(null);

    try {
      const runtimeConfig: LojaShippingConfig = {
        ...configLoja,
        uber_ativo: temUber,
        melhor_envio_ativo: temMelhorEnvio
      };

      const opcoesBrutas = await ShippingOrchestrator.cotarOpcoesFrete({
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
      });

      // Validação de Região Metropolitana para Uber Direct
      const mesmaRegiao = verificarMesmaRegiaoMetropolitana(
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
      );

      const opcoesFiltradas = opcoesBrutas.filter(op => {
        if (op.provedor === 'uber') {
          return mesmaRegiao;
        }
        return true;
      });

      setCotacoes(opcoesFiltradas);

      const opcoesValidas = opcoesFiltradas.filter(o => !o.erro && o.valor_frete > 0);

      if (opcoesValidas.length > 0) {
        const encontrada = opcoesValidas.find(o => 
          o.id === opcaoSelecionadaId || 
          o.servico_codigo === opcaoSelecionadaId ||
          (opcaoSelecionadaId && (o.id.endsWith(String(opcaoSelecionadaId)) || String(opcaoSelecionadaId).includes(o.servico_codigo)))
        ) || opcoesValidas[0];
        setCotacaoEscolhida(encontrada);

        const chaveEmissao = `${encontrada.id}_${encontrada.valor_frete}_${endAlvo.cep}_${endAlvo.numero}_entrega`;
        if (ultimoResultadoEmitidoRef.current !== chaveEmissao) {
          ultimoResultadoEmitidoRef.current = chaveEmissao;
          onChangeRef.current({
            tipo_atendimento: 'entrega',
            valor_frete: encontrada.valor_frete,
            opcao_selecionada: encontrada,
            pedido_entrega: {
              pedido_id: '',
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
              provedor: encontrada.provedor,
              transportadora_nome: encontrada.transportadora_nome,
              servico_codigo: encontrada.servico_codigo,
              valor_frete: encontrada.valor_frete,
              prazo_estimado_texto: encontrada.prazo_estimado_texto,
              status_envio: 'pendente'
            }
          });
        }
      } else {
        setCotacaoEscolhida(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('Erro ao realizar cotação de frete:', msg);
      setErroCotacaoMsg('Não foi possível obter cotações para este endereço.');
    } finally {
      setCotando(false);
    }
  }, [configLoja, modalidade, subtotal, itensSig, itens, temUber, temMelhorEnvio, opcaoSelecionadaId]);

  // Dispara cotação quando o endereço for definido na aba de entrega
  useEffect(() => {
    if (modalidade === 'entrega' && enderecoSelecionado && configLoja) {
      executarCotacao(enderecoSelecionado);
    }
  }, [modalidade, enderecoSelecionado, configLoja, executarCotacao]);

  // Troca de Modalidade
  const handleSelecionarModalidade = (novaModalidade: TipoAtendimento) => {
    setModalidade(novaModalidade);

    if (novaModalidade === 'retirada') {
      const resultadoRetirada: ShippingSelectionResult = {
        tipo_atendimento: 'retirada',
        valor_frete: 0.00,
        opcao_selecionada: null,
        pedido_entrega: {
          pedido_id: '',
          tipo_atendimento: 'retirada',
          cliente_endereco_id: null,
          provedor: 'retirada_loja',
          transportadora_nome: 'Retirada na Loja',
          servico_codigo: 'retirada_balcao',
          valor_frete: 0.00,
          prazo_estimado_texto: 'Disponível no balcão',
          status_envio: 'pronto_para_retirar'
        }
      };
      onChange(resultadoRetirada);
    } else if (enderecoSelecionado) {
      executarCotacao(enderecoSelecionado);
    }
  };

  // Seleção de uma opção cotada específica
  const handleEscolherCotacao = (opcao: OpcaoFreteCotada) => {
    setCotacaoEscolhida(opcao);
    if (!enderecoSelecionado) return;

    const chaveEmissao = `${opcao.id}_${opcao.valor_frete}_${enderecoSelecionado.cep}_${enderecoSelecionado.numero}_entrega`;
    ultimoResultadoEmitidoRef.current = chaveEmissao;

    onChange({
      tipo_atendimento: 'entrega',
      valor_frete: opcao.valor_frete,
      opcao_selecionada: opcao,
      pedido_entrega: {
        pedido_id: '',
        tipo_atendimento: 'entrega',
        cliente_endereco_id: enderecoSelecionado.id && isUuidValido(enderecoSelecionado.id)
          ? enderecoSelecionado.id
          : null,
        destino_cep: enderecoSelecionado.cep,
        destino_logradouro: enderecoSelecionado.logradouro,
        destino_numero: enderecoSelecionado.numero,
        destino_complemento: enderecoSelecionado.complemento,
        destino_bairro: enderecoSelecionado.bairro,
        destino_cidade: enderecoSelecionado.cidade,
        destino_uf: enderecoSelecionado.uf,
        destino_latitude: enderecoSelecionado.latitude,
        destino_longitude: enderecoSelecionado.longitude,
        provedor: opcao.provedor,
        transportadora_nome: opcao.transportadora_nome,
        servico_codigo: opcao.servico_codigo,
        valor_frete: opcao.valor_frete,
        prazo_estimado_texto: opcao.prazo_estimado_texto,
        status_envio: 'pendente'
      }
    });
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
      {/* SELEÇÃO ENTREGA x RETIRADA */}
      <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
        <button
          type="button"
          onClick={() => handleSelecionarModalidade('entrega')}
          className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
            modalidade === 'entrega'
              ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Receber por Entrega</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelecionarModalidade('retirada')}
          className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
            modalidade === 'retirada'
              ? 'bg-purple-500 text-slate-950 shadow-md shadow-purple-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>Retirar Compra (Grátis)</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* FLUXO: RECEBER POR ENTREGA */}
      {/* ========================================================================= */}
      {modalidade === 'entrega' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          {/* Cenário: Loja NÃO configurou nem Uber nem Melhor Envio */}
          {!carregandoConfig && !temIntegracoesAtivas ? (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-xs block text-amber-200">
                    Cotação Automática de Entrega Não Configurada
                  </span>
                  <p className="text-xs text-amber-300/90 leading-relaxed">
                    A loja ainda não configurou as integrações automáticas com Uber Direct ou Melhor Envio.
                    Favor entrar em contato com a loja para combinar a forma e o valor de entrega.
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-amber-500/20 flex flex-wrap items-center gap-2">
                <a
                  href={linkWhatsAppLoja}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition shadow-md shadow-emerald-600/20"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Falar no WhatsApp da Loja</span>
                </a>

                <button
                  type="button"
                  onClick={() => handleSelecionarModalidade('retirada')}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                >
                  Mudar para Retirada na Loja
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Mensagem e Card do Endereço de Entrega */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Calculamos os custos e prazos para este endereço:</span>
                </div>

                {carregandoEnderecos ? (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center gap-2 text-slate-400 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                    <span>Carregando dados de endereço...</span>
                  </div>
                ) : enderecoSelecionado ? (
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-2 relative overflow-hidden">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-100">
                              {enderecoSelecionado.identificador || 'Endereço Principal'}
                            </span>
                            {enderecoSelecionado.is_principal && (
                              <span className="text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-500/30">
                                Principal
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-200 mt-1">
                            {enderecoSelecionado.logradouro}, {enderecoSelecionado.numero}{' '}
                            {enderecoSelecionado.complemento ? `(${enderecoSelecionado.complemento})` : ''}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {enderecoSelecionado.bairro}, {enderecoSelecionado.cidade}-{enderecoSelecionado.uf} | CEP: {enderecoSelecionado.cep}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Botão Escolher Outro Endereço */}
                    <div className="pt-2 border-t border-slate-800/80 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setModalEscolherOutroAberto(true)}
                        className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer transition hover:underline"
                      >
                        <span>Escolher outro endereço</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-2">
                    <p className="text-xs text-slate-400">Nenhum endereço selecionado.</p>
                    {clienteId && (
                      <button
                        type="button"
                        onClick={() => setModalEscolherOutroAberto(true)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold text-xs"
                      >
                        Selecionar ou Cadastrar Endereço
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Lista de Opções de Frete Cotadas */}
              <div className="space-y-2 pt-1">
                <span className="text-xs font-bold text-slate-300 block">Opções de Frete Disponíveis</span>

                {cotando ? (
                  <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                    <span>Calculando opções de frete em tempo real...</span>
                  </div>
                ) : erroCotacaoMsg ? (
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{erroCotacaoMsg}</span>
                  </div>
                ) : cotacoes.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
                    Nenhuma opção de frete retornada para este CEP.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cotacoes.map((opcao) => {
                      if (opcao.erro) {
                        return (
                          <div
                            key={opcao.id}
                            className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-3"
                          >
                            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                              <AlertCircle className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 space-y-0.5">
                              <span className="text-xs font-bold text-amber-200 block">
                                {opcao.transportadora_nome}: {opcao.servico_nome}
                              </span>
                              <p className="text-[11px] text-amber-300/90 leading-relaxed">
                                {opcao.erro}
                              </p>
                              {opcao.prazo_estimado_texto && (
                                <span className="text-[10px] text-amber-400 font-semibold block pt-0.5">
                                  {opcao.prazo_estimado_texto}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      }

                      const selecionada = cotacaoEscolhida?.id === opcao.id;
                      return (
                        <div
                          key={opcao.id}
                          onClick={() => handleEscolherCotacao(opcao)}
                          className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                            selecionada
                              ? 'bg-emerald-500/10 border-emerald-500 text-slate-100 shadow-md shadow-emerald-500/10'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              opcao.provedor === 'uber'
                                ? 'bg-slate-800 text-emerald-400 font-black text-[11px]'
                                : 'bg-slate-800 text-indigo-400 font-bold text-xs'
                            }`}>
                              {opcao.provedor === 'uber' ? 'UBER' : <Truck className="w-4 h-4" />}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-100 truncate">
                                  {opcao.transportadora_nome}
                                </span>
                                {opcao.servico_nome && opcao.servico_nome !== opcao.transportadora_nome && (
                                  <span className="text-[10px] text-slate-400 font-medium truncate">
                                    ({opcao.servico_nome})
                                  </span>
                                )}
                              </div>
                              {opcao.prazo_estimado_texto && (
                                <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                                  <Clock className="w-3 h-3 text-emerald-400 shrink-0" />
                                  <span>{opcao.prazo_estimado_texto}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-extrabold text-sm text-emerald-400">
                              R$ {opcao.valor_frete.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                              selecionada ? 'bg-emerald-500 text-slate-950' : 'border border-slate-600'
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
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* FLUXO: RETIRAR COMPRA (RETIRADA NA LOJA) */}
      {/* ========================================================================= */}
      {modalidade === 'retirada' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/30 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0 border border-purple-500/30">
                <Store className="w-5 h-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-purple-200">
                    Retirada no Balcão da Loja
                  </span>
                  <span className="text-[10px] uppercase font-black bg-purple-500/30 text-purple-200 px-2 py-0.2 rounded-full">
                    Frete Grátis
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Seu pedido será preparado e ficará disponível para retirada no balcão da loja física.
                </p>
                <div className="pt-1.5 text-xs text-slate-300 font-medium">
                  <strong>Endereço da Loja:</strong>{' '}
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
              </div>
            </div>

            {/* Ações: Ver no mapa e Enviar para WhatsApp */}
            <div className="pt-3 border-t border-purple-500/20 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setModalMapaLojaAberto(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-purple-300 hover:text-purple-200 border border-purple-500/30 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Navigation className="w-3.5 h-3.5 text-purple-400" />
                <span>Ver no Mapa</span>
              </button>

              <a
                href={linkWhatsAppRetirada}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Enviar para o WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ESCOLHER OUTRO ENDEREÇO */}
      {clienteId && (
        <ModalEscolherOutroEndereco
          aberto={modalEscolherOutroAberto}
          onFechar={() => setModalEscolherOutroAberto(false)}
          clienteId={clienteId}
          enderecoAtualId={enderecoSelecionado?.id}
          onConfirmarEndereco={(novoEnd) => {
            setEnderecoSelecionado(novoEnd);
            executarCotacao(novoEnd);
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
