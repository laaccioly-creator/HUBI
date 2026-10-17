import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Loader2,
  Unlink,
  Percent,
  Layers,
  HelpCircle,
  ArrowRight
} from 'lucide-react';
import { mercadoLivreService, MarketplaceContaLoja } from '../../services/mercadoLivreService';
import { useFeedbackModal } from '../../contexts/FeedbackContext';

interface CardConexaoMercadoLivreProps {
  lojaId?: string;
  isDark?: boolean;
}

export const CardConexaoMercadoLivre: React.FC<CardConexaoMercadoLivreProps> = ({
  lojaId,
  isDark = true,
}) => {
  const { mostrarErro, mostrarSucesso, mostrarAviso } = useFeedbackModal();
  const [conta, setConta] = useState<MarketplaceContaLoja | null>(null);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [conectando, setConectando] = useState<boolean>(false);
  const [desconectando, setDesconectando] = useState<boolean>(false);
  const [salvandoConfig, setSalvandoConfig] = useState<boolean>(false);

  // Estados de Configuração da Conta
  const [syncEstoque, setSyncEstoque] = useState<boolean>(true);
  const [importarPedidos, setImportarPedidos] = useState<boolean>(true);
  const [comissaoPercentual, setComissaoPercentual] = useState<number>(16.0);
  const [taxaFixa, setTaxaFixa] = useState<number>(6.0);

  const carregarDadosConta = async () => {
    if (!lojaId) return;
    try {
      setCarregando(true);
      const dadosConta = await mercadoLivreService.obterConta(lojaId);
      setConta(dadosConta);
      if (dadosConta) {
        setSyncEstoque(dadosConta.sincronizar_estoque_automatico);
        setImportarPedidos(dadosConta.importar_pedidos_automatico);
        setComissaoPercentual(dadosConta.taxa_comissao_padrao_percentual || 16.0);
        setTaxaFixa(dadosConta.taxa_fixa_padrao || 6.0);
      }
    } catch (e: any) {
      console.error('[CardConexaoMercadoLivre] Erro ao carregar conta:', e);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDadosConta();
  }, [lojaId]);

  // Listener para capturar retorno de OAuth se aberto via popup ou callback de URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (code && state && params.get('origin') === 'mercadolivre') {
      const processarAuth = async () => {
        try {
          setCarregando(true);
          const contaSalva = await mercadoLivreService.processarCallbackCodigo(code, state);
          setConta(contaSalva);
          mostrarSucesso(`Conta @${contaSalva.ml_nickname} vinculada com sucesso ao HUBI!`, 'Mercado Livre Conectado');
          // Limpa query params da barra de endereço para higiene da URL
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (err: any) {
          mostrarErro(err.message || 'Falha ao concluir autenticação com o Mercado Livre.', 'Erro OAuth');
        } finally {
          setCarregando(false);
        }
      };
      processarAuth();
    }
  }, []);

  const handleIniciarConexao = async () => {
    if (!lojaId) {
      mostrarAviso('Identificador da loja não localizado. Atualize a página e tente novamente.', 'Atenção');
      return;
    }

    try {
      setConectando(true);
      const authUrl = await mercadoLivreService.obterUrlAutorizacao(lojaId);
      // Redireciona o lojista com segurança para a tela oficial de autorização do Mercado Livre
      window.location.href = authUrl;
    } catch (err: any) {
      mostrarErro(err.message || 'Não foi possível iniciar o login com o Mercado Livre.', 'Erro de Conexão');
      setConectando(false);
    }
  };

  const handleDesconectar = async () => {
    if (!lojaId) return;
    if (!window.confirm('Tem certeza de que deseja desconectar o Mercado Livre desta loja? A baixa automática de estoque físico será pausada.')) {
      return;
    }

    try {
      setDesconectando(true);
      await mercadoLivreService.desconectarConta(lojaId);
      setConta(null);
      mostrarSucesso('A integração com o Mercado Livre foi desconectada.', 'Conta Desconectada');
    } catch (err: any) {
      mostrarErro(err.message || 'Erro ao desconectar conta do Mercado Livre.', 'Erro');
    } finally {
      setDesconectando(false);
    }
  };

  const handleSalvarPreferencias = async () => {
    if (!lojaId || !conta) return;
    try {
      setSalvandoConfig(true);
      await mercadoLivreService.salvarConfiguracoes(lojaId, {
        sincronizar_estoque_automatico: syncEstoque,
        importar_pedidos_automatico: importarPedidos,
        taxa_comissao_padrao_percentual: Number(comissaoPercentual),
        taxa_fixa_padrao: Number(taxaFixa),
      });
      mostrarSucesso('Preferências de estoque e comissão salvas com sucesso!', 'Configurações Atualizadas');
      await carregarDadosConta();
    } catch (err: any) {
      mostrarErro(err.message || 'Erro ao salvar preferências.', 'Erro');
    } finally {
      setSalvandoConfig(false);
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
          <div className="w-12 h-12 rounded-2xl bg-[#FFE600] flex items-center justify-center text-slate-950 font-black shadow-xs shrink-0">
            <ShoppingBag className="w-6 h-6 text-[#2D3277]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`font-black text-sm sm:text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Mercado Livre
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
                  Não Conectado
                </span>
              )}
            </div>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Sincronização de estoque local na loja física, recebimento automático de vendas e etiquetas Mercado Envios.
            </p>
          </div>
        </div>

        {/* BOTÃO PRINCIPAL DE AÇÃO */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {carregando ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
              <span>Carregando...</span>
            </div>
          ) : isConectado ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDesconectar}
                disabled={desconectando}
                className="px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Desconectar do Mercado Livre"
              >
                {desconectando ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Unlink className="w-3.5 h-3.5" />
                )}
                <span>Desconectar</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleIniciarConexao}
              disabled={conectando}
              className="px-4 py-2.5 rounded-xl bg-[#FFE600] hover:bg-[#F5DC00] text-slate-950 font-black text-xs transition flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {conectando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Conectando...</span>
                </>
              ) : (
                <>
                  <span>Conectar com Mercado Livre</span>
                  <ArrowRight className="w-4 h-4 text-slate-950" />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* DETALHES DA CONTA CONECTADA & CONFIGURAÇÕES */}
      {isConectado && (
        <div className="mt-4 space-y-4 animate-in fade-in">
          {/* Informações da Conta */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-[11px] font-bold text-slate-500 block">Conta do Vendedor</span>
              <span className="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">
                @{conta.ml_nickname} (ID: {conta.ml_user_id})
              </span>
            </div>
            {conta.ultima_sincronizacao_em && (
              <div className="text-right">
                <span className="text-[11px] font-bold text-slate-500 block">Última Sincronização</span>
                <span className="text-xs text-slate-700 dark:text-slate-300">
                  {new Date(conta.ultima_sincronizacao_em).toLocaleString('pt-BR')}
                </span>
              </div>
            )}
          </div>

          {/* Opções de Sincronia e Políticas de Preço */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {/* Toggle Estoque Local -> ML */}
            <label className="flex items-center justify-between p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer shadow-xs">
              <div className="space-y-0.5 max-w-[80%]">
                <span className="font-bold text-xs text-slate-900 dark:text-slate-100 block">
                  Abater Anúncio ao Vender no PDV
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block leading-tight">
                  Atualiza automaticamente o saldo do anúncio no Mercado Livre quando o produto é vendido no balcão físico.
                </span>
              </div>
              <input
                type="checkbox"
                checked={syncEstoque}
                onChange={(e) => setSyncEstoque(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
            </label>

            {/* Toggle Pedidos ML -> HUBI */}
            <label className="flex items-center justify-between p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer shadow-xs">
              <div className="space-y-0.5 max-w-[80%]">
                <span className="font-bold text-xs text-slate-900 dark:text-slate-100 block">
                  Baixar Estoque Físico ao Vender no ML
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block leading-tight">
                  Vendas aprovadas no Mercado Livre caem na tela de pedidos e abatem o saldo local imediatamente.
                </span>
              </div>
              <input
                type="checkbox"
                checked={importarPedidos}
                onChange={(e) => setImportarPedidos(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
            </label>

            {/* Margem / Taxa de Comissão Padrão */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-xs">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Comissão Padrão do Marketplace (%)</span>
                <span className="text-[10px] text-slate-400">Ex: 16% Clássico / 19% Premium</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  value={comissaoPercentual}
                  onChange={(e) => setComissaoPercentual(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-bold focus:border-emerald-500 outline-hidden"
                />
                <Percent className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
              </div>
            </div>

            {/* Taxa Fixa ML (produtos abaixo de R$ 79) */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5 shadow-xs">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>Custo Fixo por Venda (R$)</span>
                <span className="text-[10px] text-slate-400">Para itens &lt; R$ 79,00</span>
              </label>
              <input
                type="number"
                min="0"
                max="30"
                step="0.5"
                value={taxaFixa}
                onChange={(e) => setTaxaFixa(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-bold focus:border-emerald-500 outline-hidden"
              />
            </div>
          </div>

          {/* Botão de Salvar Preferências */}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleSalvarPreferencias}
              disabled={salvandoConfig}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              {salvandoConfig ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Salvar Preferências Mercado Livre</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Caso sessão esteja expirada */}
      {conta?.status_conexao === 'expirado' && (
        <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
            <span>A permissão com o Mercado Livre expirou. Clique em Reconectar para renovar os tokens.</span>
          </div>
          <button
            type="button"
            onClick={handleIniciarConexao}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] transition shrink-0 cursor-pointer"
          >
            Reconectar
          </button>
        </div>
      )}
    </div>
  );
};
