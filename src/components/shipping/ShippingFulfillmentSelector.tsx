import React, { useState, useEffect, useCallback } from 'react';
import {
  Store,
  Truck,
  MapPin,
  Plus,
  Check,
  Loader2,
  Clock,
  AlertCircle
} from 'lucide-react';
import {
  TipoAtendimento,
  LojaShippingConfig,
  ClienteEndereco,
  OpcaoFreteCotada,
  ShippingSelectionResult,
  NovoEnderecoFormInput,
  CotacaoItemProduto
} from '../../types/shipping';
import { ShippingOrchestrator } from '../../services/shippingOrchestrator';

export interface ShippingFulfillmentSelectorProps {
  lojaId: string;
  clienteId?: string | null;
  subtotal: number;
  itens: CotacaoItemProduto[];
  valorFreteAtual?: number;
  opcaoSelecionadaId?: string | null;
  onChange: (resultado: ShippingSelectionResult) => void;
  className?: string;
  modoCompacto?: boolean;
}
export const ShippingFulfillmentSelector: React.FC<ShippingFulfillmentSelectorProps> = ({
  lojaId,
  clienteId,
  subtotal,
  itens,
  valorFreteAtual = 0,
  opcaoSelecionadaId,
  onChange,
  className = '',
  modoCompacto = false
}) => {
  const [configLoja, setConfigLoja] = useState<LojaShippingConfig | null>(null);
  const [carregandoConfig, setCarregandoConfig] = useState<boolean>(true);

  const [modalidade, setModalidade] = useState<TipoAtendimento>('retirada');

  const [enderecos, setEnderecos] = useState<ClienteEndereco[]>([]);
  const [carregandoEnderecos, setCarregandoEnderecos] = useState<boolean>(false);
  const [enderecoSelecionado, setEnderecoSelecionado] = useState<ClienteEndereco | null>(null);
  const [exibirFormNovoEndereco, setExibirFormNovoEndereco] = useState<boolean>(false);

  const [novoIdentificador, setNovoIdentificador] = useState<string>('Casa');
  const [novoCep, setNovoCep] = useState<string>('');
  const [novoLogradouro, setNovoLogradouro] = useState<string>('');
  const [novoNumero, setNovoNumero] = useState<string>('');
  const [novoComplemento, setNovoComplemento] = useState<string>('');
  const [novoBairro, setNovoBairro] = useState<string>('');
  const [novoCidade, setNovoCidade] = useState<string>('');
  const [novoUf, setNovoUf] = useState<string>('');
  const [salvandoEndereco, setSalvandoEndereco] = useState<boolean>(false);
  const [buscandoCep, setBuscandoCep] = useState<boolean>(false);
  const [erroEnderecoMsg, setErroEnderecoMsg] = useState<string | null>(null);

  const [cotacoes, setCotacoes] = useState<OpcaoFreteCotada[]>([]);
  const [cotacaoEscolhida, setCotacaoEscolhida] = useState<OpcaoFreteCotada | null>(null);
  const [cotando, setCotando] = useState<boolean>(false);
  const [erroCotacaoMsg, setErroCotacaoMsg] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    async function buscarConfig() {
      if (!lojaId) return;
      setCarregandoConfig(true);
      try {
        const config = await ShippingOrchestrator.buscarConfigLoja(lojaId);
        if (ativo && config) {
          setConfigLoja(config);
          if (!config.permite_retirada_loja) {
            setModalidade('entrega');
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar config da loja:', err);
      } finally {
        if (ativo) setCarregandoConfig(false);
      }
    }

    buscarConfig();

    return () => {
      ativo = false;
    };
  }, [lojaId]);
  useEffect(() => {
    let ativo = true;

    async function buscarEnderecos() {
      if (modalidade !== 'entrega') return;

      if (!clienteId) {
        if (ativo) {
          setEnderecos([]);
          setEnderecoSelecionado(null);
          setExibirFormNovoEndereco(true);
        }
        return;
      }

      setCarregandoEnderecos(true);
      try {
        const lista = await ShippingOrchestrator.listarEnderecosCliente(clienteId);
        if (ativo) {
          setEnderecos(lista);
          if (lista.length === 1) {
            setEnderecoSelecionado(lista[0]);
            setExibirFormNovoEndereco(false);
          } else if (lista.length > 1) {
            const principal = lista.find(e => e.is_principal) || lista[0];
            setEnderecoSelecionado(principal);
            setExibirFormNovoEndereco(false);
          } else {
            setEnderecoSelecionado(null);
            setExibirFormNovoEndereco(true);
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar endereços do cliente:', err);
      } finally {
        if (ativo) setCarregandoEnderecos(false);
      }
    }

    buscarEnderecos();

    return () => {
      ativo = false;
    };
  }, [modalidade, clienteId]);

  const executarCotacao = useCallback(async (endAlvo: ClienteEndereco) => {
    if (!configLoja) return;

    setCotando(true);
    setErroCotacaoMsg(null);
    setCotacoes([]);

    try {
      const opcoes = await ShippingOrchestrator.cotarOpcoesFrete({
        origem_cep: configLoja.origem_cep,
        destino_cep: endAlvo.cep,
        destino_logradouro: endAlvo.logradouro,
        destino_numero: endAlvo.numero,
        destino_bairro: endAlvo.bairro,
        destino_cidade: endAlvo.cidade,
        destino_uf: endAlvo.uf,
        subtotal,
        itens,
        config: configLoja
      });

      setCotacoes(opcoes);

      if (opcoes.length > 0) {
        const selecionada = (opcaoSelecionadaId ? opcoes.find(o => o.id === opcaoSelecionadaId) : null) || opcoes[0];
        setCotacaoEscolhida(selecionada);

        onChange({
          tipo_atendimento: 'entrega',
          endereco_selecionado: endAlvo,
          opcao_frete: selecionada,
          pedido_entrega: {
            tipo_atendimento: 'entrega',
            cliente_endereco_id: endAlvo.id,
            destino_cep: endAlvo.cep,
            destino_logradouro: endAlvo.logradouro,
            destino_numero: endAlvo.numero,
            destino_complemento: endAlvo.complemento,
            destino_bairro: endAlvo.bairro,
            destino_cidade: endAlvo.cidade,
            destino_uf: endAlvo.uf,
            provedor: selecionada.provedor,
            transportadora_nome: selecionada.transportadora_nome,
            servico_codigo: selecionada.servico_codigo,
            valor_frete: selecionada.valor_frete,
            prazo_estimado_texto: selecionada.prazo_estimado_texto,
            status_envio: 'pendente'
          },
          valor_frete: selecionada.valor_frete
        });
      } else {
        setErroCotacaoMsg('Nenhuma transportadora disponível para o endereço informado ou credenciais não ativadas.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErroCotacaoMsg(`Erro na cotação: ${msg}`);
    } finally {
      setCotando(false);
    }
  }, [configLoja, subtotal, itens, opcaoSelecionadaId, onChange]);

  useEffect(() => {
    if (modalidade === 'entrega' && enderecoSelecionado && !exibirFormNovoEndereco) {
      executarCotacao(enderecoSelecionado);
    }
  }, [modalidade, enderecoSelecionado, exibirFormNovoEndereco, executarCotacao]);
  const handleSelecionarModalidade = (novaModalidade: TipoAtendimento) => {
    setModalidade(novaModalidade);

    if (novaModalidade === 'retirada') {
      const opcaoRetirada = ShippingOrchestrator.gerarOpcaoRetirada(configLoja);
      setCotacaoEscolhida(opcaoRetirada);
      setCotacoes([opcaoRetirada]);

      onChange({
        tipo_atendimento: 'retirada',
        endereco_selecionado: null,
        opcao_frete: opcaoRetirada,
        pedido_entrega: {
          tipo_atendimento: 'retirada',
          cliente_endereco_id: null,
          provedor: 'retirada_loja',
          transportadora_nome: 'Retirada na Loja Física',
          servico_codigo: 'retirada',
          valor_frete: 0,
          prazo_estimado_texto: 'Disponível no balcão',
          status_envio: 'pendente'
        },
        valor_frete: 0
      });
    } else {
      if (enderecoSelecionado) {
        executarCotacao(enderecoSelecionado);
      }
    }
  };

  const handleSelecionarCotacao = (opcao: OpcaoFreteCotada) => {
    setCotacaoEscolhida(opcao);

    if (modalidade === 'retirada') {
      onChange({
        tipo_atendimento: 'retirada',
        endereco_selecionado: null,
        opcao_frete: opcao,
        pedido_entrega: {
          tipo_atendimento: 'retirada',
          cliente_endereco_id: null,
          provedor: 'retirada_loja',
          transportadora_nome: 'Retirada na Loja Física',
          servico_codigo: 'retirada',
          valor_frete: 0,
          prazo_estimado_texto: opcao.prazo_estimado_texto,
          status_envio: 'pendente'
        },
        valor_frete: 0
      });
    } else if (enderecoSelecionado) {
      onChange({
        tipo_atendimento: 'entrega',
        endereco_selecionado: enderecoSelecionado,
        opcao_frete: opcao,
        pedido_entrega: {
          tipo_atendimento: 'entrega',
          cliente_endereco_id: enderecoSelecionado.id,
          destino_cep: enderecoSelecionado.cep,
          destino_logradouro: enderecoSelecionado.logradouro,
          destino_numero: enderecoSelecionado.numero,
          destino_complemento: enderecoSelecionado.complemento,
          destino_bairro: enderecoSelecionado.bairro,
          destino_cidade: enderecoSelecionado.cidade,
          destino_uf: enderecoSelecionado.uf,
          provedor: opcao.provedor,
          transportadora_nome: opcao.transportadora_nome,
          servico_codigo: opcao.servico_codigo,
          valor_frete: opcao.valor_frete,
          prazo_estimado_texto: opcao.prazo_estimado_texto,
          status_envio: 'pendente'
        },
        valor_frete: opcao.valor_frete
      });
    }
  };

  const handleBuscarCepNovo = async (cepInformado: string) => {
    const cepLimpo = cepInformado.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;

    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setNovoLogradouro(data.logradouro || '');
        setNovoBairro(data.bairro || '');
        setNovoCidade(data.localidade || '');
        setNovoUf(data.uf || '');
      }
    } catch (err) {
      console.warn('Erro ao consultar ViaCEP:', err);
    } finally {
      setBuscandoCep(false);
    }
  };

  const handleSalvarNovoEndereco = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroEnderecoMsg(null);

    if (!novoCep.trim() || !novoLogradouro.trim() || !novoNumero.trim() || !novoBairro.trim() || !novoCidade.trim() || !novoUf.trim()) {
      setErroEnderecoMsg('Por favor, preencha todos os campos obrigatórios do endereço.');
      return;
    }

    setSalvandoEndereco(true);

    try {
      const input: NovoEnderecoFormInput = {
        identificador: novoIdentificador.trim() || 'Entrega',
        cep: novoCep.replace(/\D/g, ''),
        logradouro: novoLogradouro.trim(),
        numero: novoNumero.trim(),
        complemento: novoComplemento.trim(),
        bairro: novoBairro.trim(),
        cidade: novoCidade.trim(),
        uf: novoUf.trim().toUpperCase(),
        is_principal: enderecos.length === 0
      };

      let enderecoSalvo: ClienteEndereco;

      if (clienteId) {
        enderecoSalvo = await ShippingOrchestrator.salvarNovoEnderecoCliente(clienteId, input);
        setEnderecos(prev => [enderecoSalvo, ...prev]);
      } else {
        enderecoSalvo = {
          id: `temp-${Date.now()}`,
          cliente_id: 'avulso',
          identificador: input.identificador,
          cep: input.cep,
          logradouro: input.logradouro,
          numero: input.numero,
          complemento: input.complemento,
          bairro: input.bairro,
          cidade: input.cidade,
          uf: input.uf,
          is_principal: true
        };
      }

      setEnderecoSelecionado(enderecoSalvo);
      setExibirFormNovoEndereco(false);

      setNovoCep('');
      setNovoLogradouro('');
      setNovoNumero('');
      setNovoComplemento('');
      setNovoBairro('');
      setNovoCidade('');
      setNovoUf('');

      executarCotacao(enderecoSalvo);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErroEnderecoMsg(`Erro ao salvar endereço: ${msg}`);
    } finally {
      setSalvandoEndereco(false);
    }
  };
  if (carregandoConfig) {
    return (
      <div className="flex items-center justify-center p-6 space-x-2">
        <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
        <span className="text-xs text-slate-500">Carregando opções de frete...</span>
      </div>
    );
  }

  const permiteRetirada = configLoja?.permite_retirada_loja ?? true;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 1. SELETOR DE MODALIDADE DE ATENDIMENTO */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800/70 rounded-xl">
        {permiteRetirada && (
          <button
            type="button"
            onClick={() => handleSelecionarModalidade('retirada')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all ${
              modalidade === 'retirada'
                ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Retirar na Loja (Grátis)</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => handleSelecionarModalidade('entrega')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all ${
            modalidade === 'entrega'
              ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Enviar para meu Endereço</span>
        </button>
      </div>

      {/* 2. CONTEÚDO SE RETIRADA NA LOJA */}
      {modalidade === 'retirada' && (
        <div className="p-4 rounded-xl bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 space-y-2">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 mt-0.5">
              <Store className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-purple-900 dark:text-purple-200">
                  Retirada no Balcão da Loja
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Grátis (R$ 0,00)
                </span>
              </div>
              <p className="text-xs text-purple-700 dark:text-purple-300/80 mt-1">
                {configLoja ? (
                  [
                    configLoja.origem_logradouro,
                    configLoja.origem_numero,
                    configLoja.origem_bairro,
                    configLoja.origem_cidade,
                    configLoja.origem_uf
                  ].filter(Boolean).join(', ')
                ) : (
                  'Endereço físico cadastrado da loja.'
                )}
              </p>
              <p className="text-[11px] text-purple-600 dark:text-purple-400 mt-1">
                O pedido ficará disponível para retirada assim que confirmado pela equipe.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. CONTEÚDO SE ENTREGA */}
      {modalidade === 'entrega' && (
        <div className="space-y-4">
          {carregandoEnderecos ? (
            <div className="flex items-center justify-center p-6 gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
              <span className="text-xs text-slate-500">Localizando endereços do cliente...</span>
            </div>
          ) : exibirFormNovoEndereco ? (
            /* CENÁRIO C: FORMULÁRIO DE NOVO ENDEREÇO */
            <form
              onSubmit={handleSalvarNovoEndereco}
              className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                  Cadastrar Endereço de Entrega
                </span>
                {enderecos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExibirFormNovoEndereco(false)}
                    className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline"
                  >
                    Voltar aos meus endereços
                  </button>
                )}
              </div>

              {erroEnderecoMsg && (
                <div className="p-2 rounded-lg bg-rose-50 text-rose-700 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{erroEnderecoMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="col-span-2 sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                    Identificador (Ex: Casa, Trabalho)
                  </label>
                  <input
                    type="text"
                    value={novoIdentificador}
                    onChange={e => setNovoIdentificador(e.target.value)}
                    placeholder="Casa"
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="col-span-2 sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                    CEP *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={9}
                      value={novoCep}
                      onChange={e => {
                        setNovoCep(e.target.value);
                        if (e.target.value.replace(/\D/g, '').length === 8) {
                          handleBuscarCepNovo(e.target.value);
                        }
                      }}
                      placeholder="00000-000"
                      className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                      required
                    />
                    {buscandoCep && (
                      <div className="absolute right-2.5 top-1.5">
                        <Loader2 className="w-3.5 h-3.5 text-emerald-500 animate-spin" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                    Logradouro / Rua *
                  </label>
                  <input
                    type="text"
                    value={novoLogradouro}
                    onChange={e => setNovoLogradouro(e.target.value)}
                    placeholder="Rua das Flores"
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                    Número *
                  </label>
                  <input
                    type="text"
                    value={novoNumero}
                    onChange={e => setNovoNumero(e.target.value)}
                    placeholder="123"
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                    Complemento
                  </label>
                  <input
                    type="text"
                    value={novoComplemento}
                    onChange={e => setNovoComplemento(e.target.value)}
                    placeholder="Apto 101"
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                    Bairro *
                  </label>
                  <input
                    type="text"
                    value={novoBairro}
                    onChange={e => setNovoBairro(e.target.value)}
                    placeholder="Centro"
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                    Cidade *
                  </label>
                  <input
                    type="text"
                    value={novoCidade}
                    onChange={e => setNovoCidade(e.target.value)}
                    placeholder="São Paulo"
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                    UF *
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    value={novoUf}
                    onChange={e => setNovoUf(e.target.value.toUpperCase())}
                    placeholder="SP"
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500 uppercase"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={salvandoEndereco}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {salvandoEndereco ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Salvando Endereço...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Salvar e Cotar Frete
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : enderecos.length === 1 ? (
            /* CENÁRIO A: APENAS 1 ENDEREÇO */
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Entregar em: {enderecoSelecionado?.identificador || 'Endereço Principal'}
                    </span>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      {enderecoSelecionado?.logradouro}, {enderecoSelecionado?.numero}
                      {enderecoSelecionado?.complemento ? ` - ${enderecoSelecionado.complemento}` : ''}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {enderecoSelecionado?.bairro}, {enderecoSelecionado?.cidade} - {enderecoSelecionado?.uf} (CEP {enderecoSelecionado?.cep})
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setExibirFormNovoEndereco(true)}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 shrink-0"
                >
                  Cadastrar novo
                </button>
              </div>
            </div>
          ) : (
            /* CENÁRIO B: MÚLTIPLOS ENDEREÇOS */
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Selecione o Endereço de Entrega:
                </span>
                <button
                  type="button"
                  onClick={() => setExibirFormNovoEndereco(true)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar novo endereço
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                {enderecos.map(end => {
                  const isSelected = enderecoSelecionado?.id === end.id;
                  return (
                    <div
                      key={end.id}
                      onClick={() => setEnderecoSelecionado(end)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="cliente_endereco_selecionado"
                        checked={isSelected}
                        onChange={() => setEnderecoSelecionado(end)}
                        className="mt-1 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {end.identificador || 'Endereço'}
                          </span>
                          {end.is_principal && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              Principal
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                          {end.logradouro}, {end.numero} {end.complemento ? `(${end.complemento})` : ''}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {end.bairro}, {end.cidade} - {end.uf} | CEP {end.cep}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. OPÇÕES DE FRETE COTADAS */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span>Opções de Envio Disponíveis:</span>
              {cotando && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-normal">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Calculando rotas...
                </span>
              )}
            </span>

            {erroCotacaoMsg && !cotando && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{erroCotacaoMsg}</span>
              </div>
            )}

            {!cotando && cotacoes.length > 0 && (
              <div className="space-y-2">
                {cotacoes.map(opcao => {
                  const isChecked = cotacaoEscolhida?.id === opcao.id;
                  const isUber = opcao.provedor === 'uber';

                  return (
                    <div
                      key={opcao.id}
                      onClick={() => handleSelecionarCotacao(opcao)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                        isChecked
                          ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                            isUber
                              ? 'bg-black text-emerald-400'
                              : opcao.icone_tipo === 'jadlog'
                              ? 'bg-rose-600 text-white'
                              : opcao.icone_tipo === 'correios'
                              ? 'bg-yellow-400 text-blue-900'
                              : 'bg-slate-700 text-white'
                          }`}
                        >
                          {isUber ? 'UB' : opcao.icone_tipo === 'jadlog' ? 'JD' : opcao.icone_tipo === 'correios' ? 'COR' : 'LOG'}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {opcao.servico_nome}
                            </span>
                            {isUber && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-black text-emerald-400">
                                Flash
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {opcao.prazo_estimado_texto}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                          R$ {opcao.valor_frete.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
