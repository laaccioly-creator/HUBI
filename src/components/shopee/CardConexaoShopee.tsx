import React, { useState, useEffect } from 'react';
import {
  Store,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Unlink,
  Percent,
  ArrowRight,
  ClipboardList,
  Copy,
  Check,
} from 'lucide-react';
import { shopeeService, ShopeeContaLoja } from '../../services/shopeeService';
import { shopeePublicacaoMassaService } from '../../services/shopeePublicacaoMassaService';
import { useFeedbackModal } from '../../contexts/FeedbackContext';
import { formatarDataHoraLocal } from '../../utils/dateTime';
import { supabaseFunctionsBaseUrl } from '../../lib/supabase';

interface CardConexaoShopeeProps {
  lojaId?: string;
  isDark?: boolean;
}

export const CardConexaoShopee: React.FC<CardConexaoShopeeProps> = ({
  lojaId,
  isDark = true,
}) => {
  const { mostrarErro, mostrarSucesso } = useFeedbackModal();
  const [conta, setConta] = useState<ShopeeContaLoja | null>(null);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [conectando, setConectando] = useState<boolean>(false);
  const [desconectando, setDesconectando] = useState<boolean>(false);
  const [salvandoConfig, setSalvandoConfig] = useState<boolean>(false);
  const [erroConexao, setErroConexao] = useState<string | null>(null);
  const [webhookCopiado, setWebhookCopiado] = useState<boolean>(false);

  const [syncEstoque, setSyncEstoque] = useState<boolean>(true);
  const [importarPedidos, setImportarPedidos] = useState<boolean>(true);
  const [comissaoPercentual, setComissaoPercentual] = useState<number>(20.0);
  const [taxaFixa, setTaxaFixa] = useState<number>(4.0);

  const webhookUrl = `${supabaseFunctionsBaseUrl}/shopee-webhook`;

  const carregarDadosConta = async () => {
    if (!lojaId) return;
    try {
      setCarregando(true);
      const dadosConta = await shopeeService.obterConta(lojaId);
      setConta(dadosConta);
      if (dadosConta) {
        setSyncEstoque(dadosConta.sincronizar_estoque_automatico);
        setImportarPedidos(dadosConta.importar_pedidos_automatico);
        setComissaoPercentual(Number(dadosConta.taxa_comissao_padrao_percentual ?? 20.0));
        setTaxaFixa(Number(dadosConta.taxa_fixa_padrao ?? 4.0));
      }
    } catch (e: any) {
      console.error('[CardConexaoShopee] Erro ao carregar conta:', e);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void carregarDadosConta();
  }, [lojaId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shopeeStatus = params.get('shopee_status');
    const shopeeMsg = params.get('shopee_msg');
    const shopName = params.get('shop_name');

    if (shopeeStatus === 'success') {
      const nomeLojaShopee = shopName || 'Shopee';
      mostrarSucesso(
        `Loja ${nomeLojaShopee} conectada com sucesso ao Rubi!`,
        'Shopee Conectada'
      );
      void carregarDadosConta();
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (shopeeStatus === 'error') {
      const msg = shopeeMsg || 'Não foi possível concluir a autorização com a Shopee.';
      setErroConexao(msg);
      mostrarErro(msg, 'Erro OAuth Shopee');
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    const code = params.get('code');
    const shopId = params.get('shop_id');
    const state = params.get('state');
    if (code && shopId && state && !params.get('origin')) {
      const processarAuth = async () => {
        try {
          setCarregando(true);
          const contaSalva = await shopeeService.processarCallbackCodigo(code, shopId, state);
          setConta(contaSalva);
          mostrarSucesso(
            `Loja ${contaSalva.ml_nickname} vinculada com sucesso à Shopee!`,
            'Shopee Conectada'
          );
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (err: any) {
          mostrarErro(err?.message || 'Falha ao concluir autenticação com a Shopee.', 'Erro OAuth');
        } finally {
          setCarregando(false);
        }
      };
      void processarAuth();
    }
  }, []);

  const handleIniciarConexao = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setErroConexao(null);

    if (!lojaId) {
      const msg = 'Identificador da loja não localizado. Atualize a página e tente novamente.';
      setErroConexao(msg);
      mostrarErro(msg, 'Atenção');
      return;
    }

    try {
      setConectando(true);
      const authUrl = await shopeeService.obterUrlAutorizacao(lojaId);
      window.location.href = authUrl;
    } catch (err: any) {
      const msgErro = err?.message || 'Não foi possível iniciar o login com a Shopee.';
      setErroConexao(msgErro);
      mostrarErro(msgErro, 'Erro de Conexão Shopee');
      setConectando(false);
    }
  };

  const handleDesconectar = async () => {
    if (!lojaId) return;
    if (
      !window.confirm(
        'Tem certeza de que deseja desconectar a Shopee desta loja? A sincronização automática de estoque e pedidos será pausada.'
      )
    ) {
      return;
    }

    try {
      setDesconectando(true);
      await shopeeService.desconectarConta(lojaId);
      setConta(null);
      mostrarSucesso('A integração com a Shopee foi desconectada.', 'Conta Desconectada');
    } catch (err: any) {
      mostrarErro(err?.message || 'Erro ao desconectar conta da Shopee.', 'Erro');
    } finally {
      setDesconectando(false);
    }
  };

  const handleSalvarPreferencias = async () => {
    if (!lojaId || !conta) return;
    try {
      setSalvandoConfig(true);
      await shopeeService.salvarConfiguracoes(lojaId, {
        sincronizar_estoque_automatico: syncEstoque,
        importar_pedidos_automatico: importarPedidos,
        taxa_comissao_padrao_percentual: Number(comissaoPercentual),
        taxa_fixa_padrao: Number(taxaFixa),
      });
      mostrarSucesso(
        'Preferências da Shopee atualizadas com sucesso!',
        'Configurações Atualizadas'
      );
      await carregarDadosConta();
    } catch (err: any) {
      mostrarErro(err?.message || 'Erro ao salvar preferências da Shopee.', 'Erro');
    } finally {
      setSalvandoConfig(false);
    }
  };

  const handleCopiarWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setWebhookCopiado(true);
      window.setTimeout(() => setWebhookCopiado(false), 2000);
    } catch {
      mostrarErro('Não foi possível copiar a URL do webhook.');
    }
  };

  const isConectado = conta && conta.status_conexao === 'conectado';

  return (
    <div
      className={`p-5 rounded-2xl border transition-all duration-200 shadow-xs ${
        isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
      }`}
    >
      {/* CABEÇALHO DO CARD */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#EE4D2D] flex items-center justify-center text-white font-black shadow-xs shrink-0">
            <Store className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`font-black text-sm sm:text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Shopee
              </h3>
              {carregando ? (
                <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full font-bold animate-pulse">
                  Verificando...
                </span>
              ) : isConectado ? (
                <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-black flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  Conectado
                </span>
              ) : conta?.status_conexao === 'expirado' ? (
                <span className="text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 text-amber-500" />
                  Sessão Expirada
                </span>
              ) : (
                <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full font-bold">
                  Desconectado
                </span>
              )}
            </div>
            <p className={`text-sm leading-relaxed font-medium mt-0.5 ${isDark ? 'text-slate-300' : 'text-black'}`}>
              Publicação rápida de anúncios, sincronização automática de estoque e importação em tempo real de pedidos da Shopee.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          {!carregando && (
            <button
              type="button"
              onClick={() => shopeePublicacaoMassaService.abrirRelatorios()}
              className="hubi-btn-neutral px-3 py-2 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 text-black text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Consultar histórico e relatórios das publicações em massa na Shopee"
            >
              <ClipboardList className="w-3.5 h-3.5 text-black" />
              <span>Relatórios de Publicação</span>
            </button>
          )}
          {carregando ? (
            <div className={`flex items-center gap-2 text-sm font-medium ${isDark ? 'text-slate-300' : 'text-black'}`}>
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
              <span>Carregando...</span>
            </div>
          ) : isConectado ? (
            <button
              type="button"
              onClick={handleDesconectar}
              disabled={desconectando}
              className="px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Desconectar conta da Shopee"
            >
              {desconectando ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Unlink className="w-3.5 h-3.5" />
              )}
              <span>Desconectar</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => handleIniciarConexao(e)}
              disabled={conectando}
              className="px-4 py-2.5 rounded-xl bg-[#EE4D2D] hover:bg-[#D73211] text-white font-semibold text-xs transition flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {conectando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Conectando...</span>
                </>
              ) : (
                <>
                  <span>Conectar Conta Shopee</span>
                  <ArrowRight className="w-4 h-4 text-white" />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {erroConexao && (
        <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Falha ao conectar com a Shopee:</p>
            <p className="mt-0.5 opacity-90">{erroConexao}</p>
          </div>
        </div>
      )}

      {/* URL DO WEBHOOK COPIÁVEL */}
      <div className="mt-4 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-black dark:text-slate-200">
            URL do Webhook Push Shopee (Open Platform)
          </span>
          <button
            type="button"
            onClick={handleCopiarWebhook}
            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-black text-xs font-bold flex items-center gap-1 cursor-pointer transition"
          >
            {webhookCopiado ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700" />
                <span>Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-black" />
                <span>Copiar URL</span>
              </>
            )}
          </button>
        </div>
        <p className="text-xs font-mono break-all text-slate-800 dark:text-slate-300 bg-slate-100 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
          {webhookUrl}
        </p>
      </div>

      {isConectado && (
        <div className="mt-4 space-y-4 animate-in fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-sm leading-relaxed font-semibold text-black dark:text-slate-300 block">
                Loja Shopee Conectada
              </span>
              <span className="text-sm font-black text-black dark:text-slate-100 font-mono">
                {conta.ml_nickname} (Shop ID: {conta.seller_id || conta.ml_user_id})
              </span>
            </div>
            {conta.ultima_sincronizacao_em && (
              <div className="text-right">
                <span className="text-sm leading-relaxed font-semibold text-black dark:text-slate-300 block">
                  Última Sincronização
                </span>
                <span className="text-sm leading-relaxed font-medium text-black dark:text-slate-300">
                  {formatarDataHoraLocal(conta.ultima_sincronizacao_em)}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <label className="flex items-center justify-between p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer shadow-xs">
              <div className="space-y-0.5 max-w-[80%]">
                <span className="font-bold text-sm text-black dark:text-slate-100 block">
                  Abater Anúncio ao Vender no PDV
                </span>
                <span className="text-sm leading-relaxed font-medium text-black dark:text-slate-300 block">
                  Atualiza automaticamente o saldo do anúncio na Shopee quando o item é vendido no balcão físico.
                </span>
              </div>
              <input
                type="checkbox"
                checked={syncEstoque}
                onChange={(e) => setSyncEstoque(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
            </label>

            <label className="flex items-center justify-between p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer shadow-xs">
              <div className="space-y-0.5 max-w-[80%]">
                <span className="font-bold text-sm text-black dark:text-slate-100 block">
                  Baixar Estoque Físico ao Vender na Shopee
                </span>
                <span className="text-sm leading-relaxed font-medium text-black dark:text-slate-300 block">
                  Pedidos pagos na Shopee são importados para o Rubi e abatem o saldo local automaticamente.
                </span>
              </div>
              <input
                type="checkbox"
                checked={importarPedidos}
                onChange={(e) => setImportarPedidos(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
            </label>

            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-xs">
              <label className="text-sm font-semibold text-black dark:text-slate-200 flex items-center justify-between gap-2 flex-wrap">
                <span>Margem / Comissão Shopee (%)</span>
                <span className="text-sm leading-relaxed font-medium text-black dark:text-slate-300">
                  Ex: 14% padrão / 20% frete grátis
                </span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  value={comissaoPercentual}
                  onChange={(e) => setComissaoPercentual(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-black dark:text-slate-100 font-bold focus:border-emerald-500 outline-hidden"
                />
                <Percent className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-xs">
              <label className="text-sm font-semibold text-black dark:text-slate-200 flex items-center justify-between gap-2 flex-wrap">
                <span>Taxa Fixa por Item Shopee (R$)</span>
                <span className="text-sm leading-relaxed font-medium text-black dark:text-slate-300">
                  Ex: R$ 4,00 por unidade vendida
                </span>
              </label>
              <input
                type="number"
                min="0"
                max="30"
                step="0.5"
                value={taxaFixa}
                onChange={(e) => setTaxaFixa(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-black dark:text-slate-100 font-bold focus:border-emerald-500 outline-hidden"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleSalvarPreferencias}
              disabled={salvandoConfig}
              className="px-4 py-2 rounded-xl bg-emerald-300 hover:bg-emerald-400 text-black font-black text-xs flex items-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              {salvandoConfig ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-black" />
                  <span>Salvar Preferências Shopee</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {conta?.status_conexao === 'expirado' && (
        <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-sm leading-relaxed font-medium flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
            <span>A autorização com a Shopee expirou. Clique em Reconectar para renovar o token.</span>
          </div>
          <button
            type="button"
            onClick={(e) => handleIniciarConexao(e)}
            className="px-3 py-1.5 rounded-lg bg-[#EE4D2D] hover:bg-[#D73211] text-white font-semibold text-xs transition shrink-0 cursor-pointer"
          >
            Reconectar
          </button>
        </div>
      )}
    </div>
  );
};
