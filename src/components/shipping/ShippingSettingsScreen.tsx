import React, { useState, useEffect } from 'react';
import {
  Truck,
  MapPin,
  Store,
  HelpCircle,
  Save,
  Check,
  Loader2,
  Key,
  ShieldCheck,
  Building2,
  AlertCircle,
  Gift,
  Plus,
  Edit,
  Trash2,
  X
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFeedbackModal } from '../../contexts/FeedbackContext';
import { ShippingOrchestrator } from '../../services/shippingOrchestrator';
import { LojaShippingConfig } from '../../types/shipping';
import { FormaEntrega, TipoEntrega } from '../../types';
import { ModalTutorialUberDirect } from './ModalTutorialUberDirect';
import { ModalTutorialMelhorEnvio } from './ModalTutorialMelhorEnvio';

export const ShippingSettingsScreen: React.FC = () => {
  const { loja } = useAuth();
  const { mostrarSucesso, mostrarErro } = useFeedbackModal();

  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [sucesso, setSucesso] = useState<boolean>(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  // Modais de tutorial
  const [modalUberAberto, setModalUberAberto] = useState<boolean>(false);
  const [modalMelhorEnvioAberto, setModalMelhorEnvioAberto] = useState<boolean>(false);

  // Estados dos Campos
  // 1. Origem
  const [origemCep, setOrigemCep] = useState<string>('');
  const [origemLogradouro, setOrigemLogradouro] = useState<string>('');
  const [origemNumero, setOrigemNumero] = useState<string>('');
  const [origemComplemento, setOrigemComplemento] = useState<string>('');
  const [origemBairro, setOrigemBairro] = useState<string>('');
  const [origemCidade, setOrigemCidade] = useState<string>('');
  const [origemUf, setOrigemUf] = useState<string>('');
  const [origemLatitude, setOrigemLatitude] = useState<string>('');
  const [origemLongitude, setOrigemLongitude] = useState<string>('');
  const [buscandoCep, setBuscandoCep] = useState<boolean>(false);

  // 2. Uber Direct
  const [uberAtivo, setUberAtivo] = useState<boolean>(false);
  const [uberSandboxMode, setUberSandboxMode] = useState<boolean>(true);
  const [uberCustomerId, setUberCustomerId] = useState<string>('');
  const [uberClientId, setUberClientId] = useState<string>('');
  const [uberClientSecret, setUberClientSecret] = useState<string>('');

  // 3. Melhor Envio
  const [melhorEnvioAtivo, setMelhorEnvioAtivo] = useState<boolean>(false);
  const [melhorEnvioSandboxMode, setMelhorEnvioSandboxMode] = useState<boolean>(true);
  const [melhorEnvioToken, setMelhorEnvioToken] = useState<string>('');

  // 4. Retirada
  const [permiteRetiradaLoja, setPermiteRetiradaLoja] = useState<boolean>(true);
  const [retiradaBalcaoAtiva, setRetiradaBalcaoAtiva] = useState<boolean>(true);

  // 5. Frete Grátis com Subsídio em Upgrade
  const [freteGratisAtivo, setFreteGratisAtivo] = useState<boolean>(false);
  const [freteGratisValorMinimo, setFreteGratisValorMinimo] = useState<string>('');

  // 6. Gestão de Formas de Entrega Relacionais (formas_entrega)
  const [formasEntrega, setFormasEntrega] = useState<FormaEntrega[]>([]);
  const [carregandoFormas, setCarregandoFormas] = useState<boolean>(false);
  const [modalFormaAberto, setModalFormaAberto] = useState<boolean>(false);
  const [formaEditando, setFormaEditando] = useState<FormaEntrega | null>(null);
  const [salvandoForma, setSalvandoForma] = useState<boolean>(false);

  const [formaNome, setFormaNome] = useState<string>('');
  const [formaTipo, setFormaTipo] = useState<TipoEntrega>('proprio');
  const [formaValorTaxa, setFormaValorTaxa] = useState<string>('0.00');
  const [formaRequerEntregador, setFormaRequerEntregador] = useState<boolean>(false);
  const [formaRequerRastreio, setFormaRequerRastreio] = useState<boolean>(false);
  const [formaRequerLinkRastreio, setFormaRequerLinkRastreio] = useState<boolean>(false);
  const [formaRequerPin, setFormaRequerPin] = useState<boolean>(false);

  const carregarFormasEntrega = async () => {
    if (!loja?.id) return;
    setCarregandoFormas(true);
    try {
      const lista = await ShippingOrchestrator.listarFormasEntrega(loja.id);
      setFormasEntrega(lista);
    } catch (err) {
      console.warn('Erro ao carregar formas de entrega:', err);
    } finally {
      setCarregandoFormas(false);
    }
  };

  const handleMudarTipo = (novoTipo: TipoEntrega) => {
    setFormaTipo(novoTipo);
    if (novoTipo === 'retirada') {
      setFormaRequerEntregador(false);
      setFormaRequerRastreio(false);
      setFormaRequerLinkRastreio(false);
      setFormaRequerPin(false);
    } else if (novoTipo === 'frota_propria' || novoTipo === 'motoboy' || novoTipo === 'proprio') {
      setFormaRequerEntregador(true);
      setFormaRequerRastreio(false);
      setFormaRequerLinkRastreio(false);
      setFormaRequerPin(false);
    } else if (novoTipo === 'app_entrega') {
      setFormaRequerEntregador(false);
      setFormaRequerRastreio(false);
      setFormaRequerLinkRastreio(true);
      setFormaRequerPin(true);
    } else if (novoTipo === 'correios' || novoTipo === 'transportadora') {
      setFormaRequerEntregador(false);
      setFormaRequerRastreio(true);
      setFormaRequerLinkRastreio(false);
      setFormaRequerPin(false);
    }
  };

  const abrirModalNovaForma = () => {
    setFormaEditando(null);
    setFormaNome('');
    setFormaTipo('frota_propria');
    setFormaValorTaxa('0.00');
    setFormaRequerEntregador(true);
    setFormaRequerRastreio(false);
    setFormaRequerLinkRastreio(false);
    setFormaRequerPin(false);
    setModalFormaAberto(true);
  };

  const abrirModalEditarForma = (forma: FormaEntrega) => {
    setFormaEditando(forma);
    setFormaNome(forma.nome);
    const tipoMapeado = (forma.tipo === 'proprio' ? 'frota_propria' : forma.tipo) as TipoEntrega;
    setFormaTipo(tipoMapeado);
    setFormaValorTaxa(forma.valor_taxa != null ? String(forma.valor_taxa) : '0.00');
    setFormaRequerEntregador(Boolean(forma.requer_entregador));
    setFormaRequerRastreio(Boolean(forma.requer_codigo_rastreio));
    setFormaRequerLinkRastreio(Boolean(forma.requer_link_rastreio));
    setFormaRequerPin(Boolean(forma.requer_pin));
    setModalFormaAberto(true);
  };

  const handleSalvarForma = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id) {
      mostrarErro('Loja não identificada.');
      return;
    }
    if (!formaNome.trim()) {
      mostrarErro('O nome da modalidade de entrega é obrigatório.');
      return;
    }

    console.log('[DEBUG handleSalvarForma] Salvando forma de entrega:', {
      formaEditandoId: formaEditando?.id,
      lojaId: loja.id,
      formaNome: formaNome.trim(),
      formaTipo,
      formaValorTaxa,
      formaRequerPin,
      formaRequerEntregador,
      formaRequerLinkRastreio,
      formaRequerRastreio
    });

    try {
      setSalvandoForma(true);
      await ShippingOrchestrator.salvarFormaEntrega(loja.id, {
        ...(formaEditando?.id ? { id: formaEditando.id } : {}),
        loja_id: loja.id,
        nome: formaNome.trim(),
        tipo: formaTipo,
        valor_taxa: parseFloat(formaValorTaxa.replace(',', '.')) || 0,
        requer_entregador: Boolean(formaRequerEntregador),
        requer_codigo_rastreio: Boolean(formaRequerRastreio),
        requer_link_rastreio: Boolean(formaRequerLinkRastreio),
        requer_pin: Boolean(formaRequerPin),
        ativo: formaEditando ? formaEditando.ativo : true,
        atualizado_em: new Date().toISOString()
      });

      // Recarregar imediatamente a listagem atualizada e fechar o modal
      await carregarFormasEntrega();
      setModalFormaAberto(false);
      setFormaEditando(null);
      mostrarSucesso(formaEditando ? 'Forma de envio atualizada com sucesso!' : 'Forma de envio cadastrada com sucesso!');
    } catch (err: unknown) {
      console.error('[ERRO handleSalvarForma]:', err);
      const msg = err instanceof Error ? err.message : 'Erro ao salvar forma de entrega.';
      mostrarErro(msg);
    } finally {
      setSalvandoForma(false);
    }
  };

  const handleAlternarStatusForma = async (forma: FormaEntrega) => {
    if (!loja?.id) return;
    try {
      const novoAtivo = !forma.ativo;
      setFormasEntrega(prev => prev.map(f => f.id === forma.id ? { ...f, ativo: novoAtivo } : f));
      await ShippingOrchestrator.alternarStatusFormaEntrega(forma.id, loja.id, novoAtivo);
    } catch (err) {
      console.error('Erro ao alternar status da forma de entrega:', err);
      carregarFormasEntrega();
    }
  };

  const handleExcluirForma = async (forma: FormaEntrega) => {
    if (!loja?.id || forma.padrao) return;
    if (!confirm(`Deseja realmente remover a forma de entrega "${forma.nome}"?`)) return;

    try {
      setFormasEntrega(prev => prev.filter(f => f.id !== forma.id));
      await ShippingOrchestrator.removerFormaEntrega(forma.id, loja.id);
    } catch (err) {
      console.error('Erro ao remover forma de entrega:', err);
      carregarFormasEntrega();
    }
  };

  // Carregar configurações
  useEffect(() => {
    let ativo = true;

    async function carregarDados() {
      if (!loja?.id) return;
      setCarregando(true);
      setErroMsg(null);
      carregarFormasEntrega();

      try {
        const config = await ShippingOrchestrator.buscarConfigLoja(loja.id);
        if (ativo && config) {
          setOrigemCep(config.origem_cep || '');
          setOrigemLogradouro(config.origem_logradouro || '');
          setOrigemNumero(config.origem_numero || '');
          setOrigemComplemento(config.origem_complemento || '');
          setOrigemBairro(config.origem_bairro || '');
          setOrigemCidade(config.origem_cidade || '');
          setOrigemUf(config.origem_uf || '');
          setOrigemLatitude(config.origem_latitude != null ? String(config.origem_latitude) : '');
          setOrigemLongitude(config.origem_longitude != null ? String(config.origem_longitude) : '');

          setUberAtivo(Boolean(config.uber_ativo));
          setUberSandboxMode(Boolean(config.uber_sandbox_mode));
          setUberCustomerId(config.uber_customer_id || '');
          setUberClientId(config.uber_client_id || '');
          setUberClientSecret(config.uber_client_secret || '');

          setMelhorEnvioAtivo(Boolean(config.melhor_envio_ativo));
          setMelhorEnvioSandboxMode(Boolean(config.melhor_envio_sandbox_mode));
          setMelhorEnvioToken(config.melhor_envio_token || '');

          const retiradaAtiva = Boolean(config.retirada_balcao_ativa ?? config.retirada_loja_ativa ?? config.permite_retirada_loja ?? false);
          setPermiteRetiradaLoja(retiradaAtiva);
          setRetiradaBalcaoAtiva(retiradaAtiva);

          setFreteGratisAtivo(Boolean(config.frete_gratis_ativo));
          setFreteGratisValorMinimo(config.frete_gratis_valor_minimo != null ? String(config.frete_gratis_valor_minimo) : '');
        } else if (ativo && loja) {
          // Preenchimento inicial inteligente com os dados cadastrais da loja
          setOrigemCep(loja.endereco_cep || '');
          setOrigemLogradouro(loja.endereco_logradouro || '');
          setOrigemNumero(loja.endereco_numero || '');
          setOrigemComplemento(loja.endereco_complemento || '');
          setOrigemBairro(loja.endereco_bairro || '');
          setOrigemCidade(loja.endereco_cidade || '');
          setOrigemUf(loja.endereco_estado || '');
        }
      } catch (err: unknown) {
        if (ativo) {
          console.error('Erro ao carregar configurações de frete:', err);
          setErroMsg('Não foi possível carregar as configurações de frete.');
        }
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    carregarDados();

    return () => {
      ativo = false;
    };
  }, [loja]);

  // Consulta automática de CEP
  const handleBuscarCep = async (cepParaBuscar: string) => {
    const cepLimpo = cepParaBuscar.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;

    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setOrigemLogradouro(data.logradouro || '');
        setOrigemBairro(data.bairro || '');
        setOrigemCidade(data.localidade || '');
        setOrigemUf(data.uf || '');
      }
    } catch (err) {
      console.warn('Erro ao consultar ViaCEP:', err);
    } finally {
      setBuscandoCep(false);
    }
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id) return;

    setSalvando(true);
    setSucesso(false);
    setErroMsg(null);

    // Validações básicas de endereço
    if (!origemCep.trim() || !origemLogradouro.trim() || !origemNumero.trim() || !origemBairro.trim() || !origemCidade.trim() || !origemUf.trim()) {
      setErroMsg('Por favor, preencha todos os campos obrigatórios do Endereço de Origem da Loja.');
      setSalvando(false);
      return;
    }

    try {
      const payload: Partial<LojaShippingConfig> = {
        origem_cep: origemCep.replace(/\D/g, ''),
        origem_logradouro: origemLogradouro.trim(),
        origem_numero: origemNumero.trim(),
        origem_complemento: origemComplemento.trim() || null,
        origem_bairro: origemBairro.trim(),
        origem_cidade: origemCidade.trim(),
        origem_uf: origemUf.trim().toUpperCase(),
        origem_latitude: origemLatitude.trim() ? parseFloat(origemLatitude) : null,
        origem_longitude: origemLongitude.trim() ? parseFloat(origemLongitude) : null,

        uber_ativo: uberAtivo,
        uber_sandbox_mode: uberSandboxMode,
        uber_customer_id: uberCustomerId.trim() || null,
        uber_client_id: uberClientId.trim() || null,
        uber_client_secret: uberClientSecret.trim() || null,

        melhor_envio_ativo: melhorEnvioAtivo,
        melhor_envio_sandbox_mode: melhorEnvioSandboxMode,
        melhor_envio_token: melhorEnvioToken.trim() || null,

        permite_retirada_loja: retiradaBalcaoAtiva,
        retirada_balcao_ativa: retiradaBalcaoAtiva,

        frete_gratis_ativo: freteGratisAtivo,
        frete_gratis_valor_minimo: freteGratisValorMinimo.trim() ? parseFloat(freteGratisValorMinimo.replace(',', '.')) : 0
      };

      await ShippingOrchestrator.salvarConfigLoja(loja.id, payload);

      setSucesso(true);
      setTimeout(() => setSucesso(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErroMsg(`Falha ao salvar configurações: ${msg}`);
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Carregando configurações de frete e entrega...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Modais de Tutorial Guiado */}
      <ModalTutorialUberDirect
        aberto={modalUberAberto}
        onClose={() => setModalUberAberto(false)}
      />
      <ModalTutorialMelhorEnvio
        aberto={modalMelhorEnvioAberto}
        onClose={() => setModalMelhorEnvioAberto(false)}
      />

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <Truck className="w-7 h-7 text-emerald-500" />
            Configurações de Frete e Entregas
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure o endereço de despacho, credenciais da Uber Direct e Melhor Envio para cotação automatizada.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSalvar}
          disabled={salvando}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50"
        >
          {salvando ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Salvando...
            </>
          ) : sucesso ? (
            <>
              <Check className="w-4 h-4" />
              Salvo com Sucesso!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Salvar Alterações
            </>
          )}
        </button>
      </div>

      {erroMsg && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center gap-3 text-sm text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{erroMsg}</span>
        </div>
      )}

      <form onSubmit={handleSalvar} className="space-y-8">
        {/* BLOCO 1: Endereço de Origem da Loja */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                1. Endereço de Origem da Loja
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ponto de partida para cálculo das rotas (Uber e transportadoras) e local exibido para Retirada na Loja.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                CEP de Origem *
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={9}
                  placeholder="00000-000"
                  value={origemCep}
                  onChange={(e) => {
                    setOrigemCep(e.target.value);
                    if (e.target.value.replace(/\D/g, '').length === 8) {
                      handleBuscarCep(e.target.value);
                    }
                  }}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                />
                {buscandoCep && (
                  <div className="absolute right-3 top-2.5">
                    <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
                  </div>
                )}
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Logradouro / Rua *
              </label>
              <input
                type="text"
                placeholder="Ex: Av. Paulista"
                value={origemLogradouro}
                onChange={(e) => setOrigemLogradouro(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Número *
              </label>
              <input
                type="text"
                placeholder="1000"
                value={origemNumero}
                onChange={(e) => setOrigemNumero(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Complemento
              </label>
              <input
                type="text"
                placeholder="Sala 12, Galpão A"
                value={origemComplemento}
                onChange={(e) => setOrigemComplemento(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Bairro *
              </label>
              <input
                type="text"
                placeholder="Centro"
                value={origemBairro}
                onChange={(e) => setOrigemBairro(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Cidade *
              </label>
              <input
                type="text"
                placeholder="São Paulo"
                value={origemCidade}
                onChange={(e) => setOrigemCidade(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                UF (Estado) *
              </label>
              <input
                type="text"
                maxLength={2}
                placeholder="SP"
                value={origemUf}
                onChange={(e) => setOrigemUf(e.target.value.toUpperCase())}
                className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none uppercase"
                required
              />
            </div>
          </div>
        </div>

        {/* BLOCO 2: Uber Direct */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-900 font-bold text-sm">
                UB
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  2. Integração Uber Direct (Entregas Instantâneas / Flash)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Despachos automáticos com motoboys parceiros da Uber para entregas em minutos no mesmo dia.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setModalUberAberto(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700"
            >
              <HelpCircle className="w-3.5 h-3.5 text-emerald-500" />
              Como obter credenciais da Uber?
            </button>
          </div>

          <div className="flex flex-wrap gap-6 items-center p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
            <label className="flex items-center gap-3 cursor-pointer select-none group">
              <div className="relative flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={uberAtivo}
                  onChange={(e) => setUberAtivo(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                    uberAtivo
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 group-hover:border-emerald-400'
                  }`}
                >
                  {uberAtivo && <Check className="w-3.5 h-3.5 stroke-[3] text-white" />}
                </div>
              </div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Ativar Uber Direct no Checkout
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer select-none group">
              <div className="relative flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={uberSandboxMode}
                  onChange={(e) => setUberSandboxMode(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                    uberSandboxMode
                      ? 'bg-amber-500 border-amber-500 text-white shadow-sm shadow-amber-500/30'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 group-hover:border-amber-400'
                  }`}
                >
                  {uberSandboxMode && <Check className="w-3.5 h-3.5 stroke-[3] text-white" />}
                </div>
              </div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Modo Sandbox (Ambiente de Testes)
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Customer ID (Organização)
              </label>
              <input
                type="text"
                placeholder="Ex: 11111111-2222-3333-4444-555555555555"
                value={uberCustomerId}
                onChange={(e) => setUberCustomerId(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl text-sm font-mono border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Client ID (App)
              </label>
              <input
                type="text"
                placeholder="Ex: abcdef123456"
                value={uberClientId}
                onChange={(e) => setUberClientId(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl text-sm font-mono border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Client Secret
              </label>
              <input
                type="password"
                placeholder="••••••••••••••••"
                value={uberClientSecret}
                onChange={(e) => setUberClientSecret(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl text-sm font-mono border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* BLOCO 3: Melhor Envio */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-sky-600 text-white font-bold text-sm">
                ME
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  3. Integração Melhor Envio (Jadlog, Correios, Loggi e mais)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cotações simultâneas de transportadoras com desconto de contrato integrado.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setModalMelhorEnvioAberto(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700"
            >
              <HelpCircle className="w-3.5 h-3.5 text-sky-500" />
              Como obter o Token do Melhor Envio?
            </button>
          </div>

          <div className="flex flex-wrap gap-6 items-center p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
            <label className="flex items-center gap-3 cursor-pointer select-none group">
              <div className="relative flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={melhorEnvioAtivo}
                  onChange={(e) => setMelhorEnvioAtivo(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                    melhorEnvioAtivo
                      ? 'bg-sky-600 border-sky-600 text-white shadow-sm shadow-sky-600/30'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 group-hover:border-sky-400'
                  }`}
                >
                  {melhorEnvioAtivo && <Check className="w-3.5 h-3.5 stroke-[3] text-white" />}
                </div>
              </div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Ativar Melhor Envio no Checkout
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer select-none group">
              <div className="relative flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={melhorEnvioSandboxMode}
                  onChange={(e) => setMelhorEnvioSandboxMode(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                    melhorEnvioSandboxMode
                      ? 'bg-amber-500 border-amber-500 text-white shadow-sm shadow-amber-500/30'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 group-hover:border-amber-400'
                  }`}
                >
                  {melhorEnvioSandboxMode && <Check className="w-3.5 h-3.5 stroke-[3] text-white" />}
                </div>
              </div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Modo Sandbox (Ambiente de Testes)
              </span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Token de Acesso Pessoal (JWT Bearer Token com escopo &apos;shipping-calculate&apos;)
            </label>
            <input
              type="password"
              placeholder="Cole aqui o token JWT gerado no painel do Melhor Envio (começa com eyJ...)"
              value={melhorEnvioToken}
              onChange={(e) => setMelhorEnvioToken(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl text-sm font-mono border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
            />
          </div>
        </div>

        {/* BLOCO 4: Retirada na Loja */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              <Store className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                4. Retirada na Loja
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Permita que os clientes retirem o pedido diretamente no balcão da sua loja física.
              </p>
            </div>
          </div>

          <label className="flex items-start gap-3.5 cursor-pointer select-none p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 group">
            <div className="relative flex items-center justify-center mt-0.5">
              <input
                type="checkbox"
                checked={retiradaBalcaoAtiva}
                onChange={(e) => {
                  setRetiradaBalcaoAtiva(e.target.checked);
                  setPermiteRetiradaLoja(e.target.checked);
                }}
                className="sr-only"
              />
              <div
                className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                  retiradaBalcaoAtiva
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 group-hover:border-emerald-400'
                }`}
              >
                {retiradaBalcaoAtiva && <Check className="w-3.5 h-3.5 stroke-[3] text-white" />}
              </div>
            </div>
            <div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">
                Permitir opção de &quot;Retirar na Loja&quot;
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Quando ativada, os clientes podem optar por buscar a mercadoria na loja. Se desativada, a opção de retirada não será exibida no Catálogo Online ou PDV.
              </span>
            </div>
          </label>
        </div>

        {/* BLOCO 5: Frete Grátis com Subsídio em Upgrade */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                5. Frete Grátis com Subsídio em Upgrade
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Incentive carrinhos maiores oferecendo entrega gratuita ou descontada com subsídio inteligente.
              </p>
            </div>
          </div>

          <label className="flex items-start gap-3.5 cursor-pointer select-none p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 group">
            <div className="relative flex items-center justify-center mt-0.5">
              <input
                type="checkbox"
                checked={freteGratisAtivo}
                onChange={(e) => setFreteGratisAtivo(e.target.checked)}
                className="sr-only"
              />
              <div
                className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                  freteGratisAtivo
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 group-hover:border-emerald-400'
                }`}
              >
                {freteGratisAtivo && <Check className="w-3.5 h-3.5 stroke-[3] text-white" />}
              </div>
            </div>
            <div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">
                Ativar Frete Grátis por Valor Mínimo de Pedido
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Ao atingir a meta no carrinho, o menor frete válido torna-se 100% gratuito (R$ 0,00) e os métodos expressos/mais caros recebem o mesmo valor como desconto (cobrando apenas a diferença).
              </span>
            </div>
          </label>

          {freteGratisAtivo && (
            <div className="pt-2 pl-2 sm:pl-4 border-l-2 border-emerald-500/30 space-y-3">
              <div className="max-w-xs">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Valor Mínimo do Pedido (R$) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-sm font-bold text-slate-400 dark:text-slate-500">
                    R$
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={freteGratisValorMinimo}
                    onChange={(e) => setFreteGratisValorMinimo(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                💡 Exemplo: Se o valor mínimo for R$ 150,00 e o cliente atingir esse valor, uma entrega econômica de R$ 21,00 sai <strong>Grátis</strong>, e um frete expresso de R$ 49,00 receberá R$ 21,00 de desconto, saindo por apenas <strong>R$ 28,00</strong>.
              </p>
            </div>
          )}
        </div>

        {/* 6. GESTÃO RELACIONAL DE FORMAS DE ENTREGA (formas_entrega) */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Formas de Envio e Entrega da Loja
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cadastre e personalize os meios de entrega próprios ou parceiros oferecidos no checkout
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={abrirModalNovaForma}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 transition cursor-pointer shadow-sm active:scale-95 self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Forma de Envio</span>
            </button>
          </div>

          {carregandoFormas ? (
            <div className="p-8 flex items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>Carregando formas de entrega...</span>
            </div>
          ) : formasEntrega.length === 0 ? (
            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Nenhuma forma de envio cadastrada. Clique em "Nova Forma de Envio" para adicionar.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {formasEntrega.map((forma) => (
                <div
                  key={forma.id}
                  className={`p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 ${
                    forma.ativo
                      ? 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60'
                      : 'bg-slate-100/40 dark:bg-slate-900/30 border-slate-200/50 dark:border-slate-800 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      forma.tipo === 'retirada'
                        ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                        : forma.tipo === 'transportadora'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {forma.tipo === 'retirada' ? <Store className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {forma.nome}
                        </span>
                        {forma.padrao && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            Padrão
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                          {forma.tipo === 'retirada' ? 'Retirada na Loja' :
                           forma.tipo === 'frota_propria' || forma.tipo === 'proprio' ? 'Frota Própria' :
                           forma.tipo === 'motoboy' ? 'Motoboy' :
                           forma.tipo === 'app_entrega' ? 'App de Corrida' :
                           forma.tipo === 'correios' ? 'Correios' :
                           forma.tipo === 'transportadora' ? 'Transportadora' : forma.tipo}
                        </span>
                        {forma.requer_entregador && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/40">
                            Requer Motoboy
                          </span>
                        )}
                        {forma.requer_codigo_rastreio && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40">
                            Requer Rastreio
                          </span>
                        )}
                        {forma.requer_link_rastreio && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40">
                            Link Corrida
                          </span>
                        )}
                        {forma.requer_pin && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/40">
                            Requer PIN
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => abrirModalEditarForma(forma)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition cursor-pointer"
                      title="Editar forma de envio"
                    >
                      <Edit className="w-4 h-4" />
                    </button>

                    {!forma.padrao && (
                      <button
                        type="button"
                        onClick={() => handleExcluirForma(forma)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
                        title="Excluir forma de envio"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                    <label className="relative inline-flex items-center cursor-pointer ml-1">
                      <input
                        type="checkbox"
                        checked={forma.ativo}
                        onChange={() => handleAlternarStatusForma(forma)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Botão de Salvar Inferior */}
        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={salvando}
            className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-50"
          >
            {salvando ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Salvando Configurações...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Salvar Todas as Configurações
              </>
            )}
          </button>
        </div>
      </form>

      {/* MODAL CADASTRAR / EDITAR FORMA DE ENTREGA */}
      {modalFormaAberto && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Truck className="w-5 h-5" />
                </div>
                <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">
                  {formaEditando ? 'Editar Forma de Envio' : 'Nova Forma de Envio'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalFormaAberto(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarForma} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Nome da Modalidade *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Transportadora Regional, Motoboy Terceirizado"
                  value={formaNome}
                  onChange={(e) => setFormaNome(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Tipo de Operação *
                </label>
                <select
                  value={formaTipo}
                  onChange={(e) => handleMudarTipo(e.target.value as TipoEntrega)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="retirada">Retirada na Loja (Balcão Físico)</option>
                  <option value="frota_propria">Frota Própria (Entrega Local)</option>
                  <option value="motoboy">Motoboy Terceirizado</option>
                  <option value="app_entrega">App de Corrida (Uber / 99)</option>
                  <option value="correios">Correios (PAC / SEDEX)</option>
                  <option value="transportadora">Transportadora</option>
                </select>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div
                  role="checkbox"
                  aria-checked={formaRequerEntregador}
                  tabIndex={0}
                  onClick={() => setFormaRequerEntregador(prev => !prev)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      setFormaRequerEntregador(prev => !prev);
                    }
                  }}
                  className="flex items-center gap-3 cursor-pointer select-none group"
                >
                  <div
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                      formaRequerEntregador
                        ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 group-hover:border-slate-400'
                    }`}
                  >
                    {formaRequerEntregador && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                  </div>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                    Requer registrar nome do entregador no despacho
                  </span>
                </div>

                <div
                  role="checkbox"
                  aria-checked={formaRequerRastreio}
                  tabIndex={0}
                  onClick={() => setFormaRequerRastreio(prev => !prev)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      setFormaRequerRastreio(prev => !prev);
                    }
                  }}
                  className="flex items-center gap-3 cursor-pointer select-none group"
                >
                  <div
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                      formaRequerRastreio
                        ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 group-hover:border-slate-400'
                    }`}
                  >
                    {formaRequerRastreio && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                  </div>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                    Requer código de rastreamento no despacho
                  </span>
                </div>

                <div
                  role="checkbox"
                  aria-checked={formaRequerLinkRastreio}
                  tabIndex={0}
                  onClick={() => setFormaRequerLinkRastreio(prev => !prev)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      setFormaRequerLinkRastreio(prev => !prev);
                    }
                  }}
                  className="flex items-center gap-3 cursor-pointer select-none group"
                >
                  <div
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                      formaRequerLinkRastreio
                        ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 group-hover:border-slate-400'
                    }`}
                  >
                    {formaRequerLinkRastreio && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                  </div>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                    Requer link de rastreio da corrida no despacho (ex: Uber Flash, 99 Entregas)
                  </span>
                </div>

                <div
                  role="checkbox"
                  aria-checked={formaRequerPin}
                  tabIndex={0}
                  onClick={() => setFormaRequerPin(prev => !prev)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      setFormaRequerPin(prev => !prev);
                    }
                  }}
                  className="flex items-center gap-3 cursor-pointer select-none group"
                >
                  <div
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                      formaRequerPin
                        ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 group-hover:border-slate-400'
                    }`}
                  >
                    {formaRequerPin && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                  </div>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                    Requer código PIN de confirmação (4 dígitos)
                  </span>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalFormaAberto(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoForma}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition cursor-pointer shadow-md shadow-blue-600/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {salvandoForma && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{formaEditando ? 'Salvar Alterações' : 'Cadastrar Forma'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
