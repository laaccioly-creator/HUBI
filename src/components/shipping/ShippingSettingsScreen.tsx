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
  Package,
  X,
  Navigation,
  ChevronRight,
  Layers,
  PackageCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useFeedbackModal } from '../../contexts/FeedbackContext';
import { ShippingOrchestrator } from '../../services/shippingOrchestrator';
import { LojaShippingConfig } from '../../types/shipping';
import { ModalTutorialUberDirect } from './ModalTutorialUberDirect';
import { ModalTutorialMelhorEnvio } from './ModalTutorialMelhorEnvio';

export const ShippingSettingsScreen: React.FC = () => {
  const { loja } = useAuth();
  const navigate = useNavigate();
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
  const [embalagemPadraoPesoKg, setEmbalagemPadraoPesoKg] = useState<string>('0.3');
  const [embalagemPadraoAlturaCm, setEmbalagemPadraoAlturaCm] = useState<string>('4');
  const [embalagemPadraoLarguraCm, setEmbalagemPadraoLarguraCm] = useState<string>('12');
  const [embalagemPadraoComprimentoCm, setEmbalagemPadraoComprimentoCm] = useState<string>('17');

  // 4. Retirada
  const [permiteRetiradaLoja, setPermiteRetiradaLoja] = useState<boolean>(true);
  const [retiradaBalcaoAtiva, setRetiradaBalcaoAtiva] = useState<boolean>(true);

  // 5. Frete Grátis com Subsídio em Upgrade
  const [freteGratisAtivo, setFreteGratisAtivo] = useState<boolean>(false);
  const [freteGratisValorMinimo, setFreteGratisValorMinimo] = useState<string>('');

  // Carregar configurações
  useEffect(() => {
    let ativo = true;

    async function carregarDados() {
      if (!loja?.id) return;
      setCarregando(true);
      setErroMsg(null);

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
          if (config.embalagem_padrao_peso_kg != null) setEmbalagemPadraoPesoKg(String(config.embalagem_padrao_peso_kg));
          if (config.embalagem_padrao_altura_cm != null) setEmbalagemPadraoAlturaCm(String(config.embalagem_padrao_altura_cm));
          if (config.embalagem_padrao_largura_cm != null) setEmbalagemPadraoLarguraCm(String(config.embalagem_padrao_largura_cm));
          if (config.embalagem_padrao_comprimento_cm != null) setEmbalagemPadraoComprimentoCm(String(config.embalagem_padrao_comprimento_cm));

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
        embalagem_padrao_peso_kg: embalagemPadraoPesoKg.trim() ? parseFloat(embalagemPadraoPesoKg.replace(',', '.')) : 0.3,
        embalagem_padrao_altura_cm: embalagemPadraoAlturaCm.trim() ? parseFloat(embalagemPadraoAlturaCm.replace(',', '.')) : 4,
        embalagem_padrao_largura_cm: embalagemPadraoLarguraCm.trim() ? parseFloat(embalagemPadraoLarguraCm.replace(',', '.')) : 12,
        embalagem_padrao_comprimento_cm: embalagemPadraoComprimentoCm.trim() ? parseFloat(embalagemPadraoComprimentoCm.replace(',', '.')) : 17,

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

          {/* Sub-bloco: Embalagem Padrão para Cotações */}
          <div className="pt-4 border-t border-slate-150 dark:border-slate-800/80 space-y-3">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-sky-500" />
              <div>
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Embalagem Padrão para Envios (Fallback para Cotações Jadlog / Correios)
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Valores padrão utilizados quando o produto ou pedido não possuir dimensões/peso individualmente definidos.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Peso Padrão (kg)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.05"
                  placeholder="0.30"
                  value={embalagemPadraoPesoKg}
                  onChange={(e) => setEmbalagemPadraoPesoKg(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Altura (cm)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="2"
                  placeholder="4"
                  value={embalagemPadraoAlturaCm}
                  onChange={(e) => setEmbalagemPadraoAlturaCm(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Largura (cm)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="10"
                  placeholder="12"
                  value={embalagemPadraoLarguraCm}
                  onChange={(e) => setEmbalagemPadraoLarguraCm(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Comprimento (cm)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="15"
                  placeholder="17"
                  value={embalagemPadraoComprimentoCm}
                  onChange={(e) => setEmbalagemPadraoComprimentoCm(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>
            </div>
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

        {/* 6. ATALHOS PARA CADASTROS & TABELAS DE LOGÍSTICA */}
        <div className="p-6 rounded-3xl bg-linear-to-br from-slate-900 to-slate-950 border border-slate-800 shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-black">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Tabelas e Cadastros de Entrega
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Centralizado
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Os cadastros de modalidades, aplicativos de corrida e transportadoras agora ficam reunidos em Cadastros & Tabelas
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('/cadastros?tab=formas_envio')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer self-start sm:self-auto"
            >
              <span>Abrir Central de Cadastros</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Atalho 1: Formas de Envio */}
            <div
              onClick={() => navigate('/cadastros?tab=formas_envio')}
              className="p-4 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/70 hover:border-blue-500/50 transition cursor-pointer group flex flex-col justify-between space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Truck className="w-4 h-4" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors">
                  Formas de Envio da Loja
                </h4>
                <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                  Modalidades próprias, balcão, motoboy e regras de despacho.
                </p>
              </div>
            </div>

            {/* Atalho 2: Apps de Corrida */}
            <div
              onClick={() => navigate('/cadastros?tab=apps_corrida')}
              className="p-4 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/70 hover:border-amber-500/50 transition cursor-pointer group flex flex-col justify-between space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Navigation className="w-4 h-4" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">
                  Apps de Corrida & Flash
                </h4>
                <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                  Uber Flash, 99 Entrega, Lalamove, Borzo e links rápidos.
                </p>
              </div>
            </div>

            {/* Atalho 3: Transportadoras */}
            <div
              onClick={() => navigate('/cadastros?tab=transportadoras')}
              className="p-4 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/70 hover:border-purple-500/50 transition cursor-pointer group flex flex-col justify-between space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <PackageCheck className="w-4 h-4" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white group-hover:text-purple-400 transition-colors">
                  Transportadoras & Cargas
                </h4>
                <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                  Braspress, Jadlog, Total Express, URLs de rastreio e SAC.
                </p>
              </div>
            </div>
          </div>
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






    </div>
  );
};
