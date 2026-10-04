import React, { useState, useEffect } from 'react';
import {
  Target,
  DollarSign,
  ShoppingBag,
  TrendingUp,
  Receipt,
  AlertTriangle,
  RotateCcw,
  Save,
  CheckCircle2,
  Lock,
  X,
  ArrowLeft,
  Loader2,
  Percent,
  HelpCircle,
  ShieldAlert
} from 'lucide-react';
import { LojaMetas } from '../../types';
import { dashboardService, METAS_PADRAO_LOJA } from '../../services/dashboardService';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useFeedbackModal } from '../../contexts/FeedbackContext';

export interface ConfiguracoesMetasProps {
  lojaId?: string;
  onVoltar?: () => void;
  isModal?: boolean;
  onClose?: () => void;
  onSucessoSalvar?: (novasMetas: LojaMetas) => void;
}

export const ConfiguracoesMetas: React.FC<ConfiguracoesMetasProps> = ({
  lojaId: propLojaId,
  onVoltar,
  isModal = false,
  onClose,
  onSucessoSalvar
}) => {
  const { loja } = useAuth();
  const permissions = usePermissions();
  const { mostrarSucesso, mostrarErro } = useFeedbackModal();

  const idLojaAlvo = propLojaId || loja?.id;

  // Permissão de edição restrita a gestores
  const podeEditar =
    permissions.ehOwner ||
    permissions.ehAdmin ||
    permissions.ehGerente ||
    permissions.podeAcessarConfig;

  // Estados dos campos de metas
  const [metaFaturamento, setMetaFaturamento] = useState<number>(METAS_PADRAO_LOJA.meta_faturamento);
  const [metaPedidos, setMetaPedidos] = useState<number>(METAS_PADRAO_LOJA.meta_pedidos);
  const [metaLucroLiquido, setMetaLucroLiquido] = useState<number>(METAS_PADRAO_LOJA.meta_lucro_liquido);
  const [metaTicketMedio, setMetaTicketMedio] = useState<number>(METAS_PADRAO_LOJA.meta_ticket_medio);
  const [metaInadimplenciaMaxima, setMetaInadimplenciaMaxima] = useState<number>(METAS_PADRAO_LOJA.meta_inadimplencia_maxima);
  const [metaSaudeEstoqueRuptura, setMetaSaudeEstoqueRuptura] = useState<number>(METAS_PADRAO_LOJA.meta_saude_estoque_max_ruptura ?? 0);

  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  // Carrega as metas atuais da loja
  useEffect(() => {
    let ativo = true;

    async function carregar() {
      if (!idLojaAlvo) {
        setCarregando(false);
        return;
      }

      try {
        setCarregando(true);
        const dados = await dashboardService.obterMetasLoja(idLojaAlvo);
        if (ativo && dados) {
          setMetaFaturamento(Number(dados.meta_faturamento ?? METAS_PADRAO_LOJA.meta_faturamento));
          setMetaPedidos(Number(dados.meta_pedidos ?? METAS_PADRAO_LOJA.meta_pedidos));
          setMetaLucroLiquido(Number(dados.meta_lucro_liquido ?? METAS_PADRAO_LOJA.meta_lucro_liquido));
          setMetaTicketMedio(Number(dados.meta_ticket_medio ?? METAS_PADRAO_LOJA.meta_ticket_medio));
          setMetaInadimplenciaMaxima(Number(dados.meta_inadimplencia_maxima ?? METAS_PADRAO_LOJA.meta_inadimplencia_maxima));
          const rupturaCarregada = Number(
            dados.meta_saude_estoque_max_ruptura !== undefined && dados.meta_saude_estoque_max_ruptura !== null
              ? dados.meta_saude_estoque_max_ruptura
              : (dados.meta_giro_estoque !== undefined ? dados.meta_giro_estoque : 0)
          );
          setMetaSaudeEstoqueRuptura(rupturaCarregada);
        }
      } catch (err) {
        console.error('[ConfiguracoesMetas] Erro ao carregar metas:', err);
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    carregar();

    return () => {
      ativo = false;
    };
  }, [idLojaAlvo]);

  // Preenche os campos com os valores padrão de mercado
  const handleRestaurarPadroes = () => {
    setMetaFaturamento(METAS_PADRAO_LOJA.meta_faturamento);
    setMetaPedidos(METAS_PADRAO_LOJA.meta_pedidos);
    setMetaLucroLiquido(METAS_PADRAO_LOJA.meta_lucro_liquido);
    setMetaTicketMedio(METAS_PADRAO_LOJA.meta_ticket_medio);
    setMetaInadimplenciaMaxima(METAS_PADRAO_LOJA.meta_inadimplencia_maxima);
    setMetaSaudeEstoqueRuptura(METAS_PADRAO_LOJA.meta_saude_estoque_max_ruptura ?? 0);
  };

  // Salva as alterações na tabela loja_metas
  const handleSalvar = async () => {
    if (!idLojaAlvo) {
      mostrarErro('Identificador da loja não encontrado.');
      return;
    }

    if (!podeEditar) {
      mostrarErro('Você não possui permissão para alterar as metas da loja.');
      return;
    }

    try {
      setSalvando(true);
      const payload: Partial<LojaMetas> = {
        meta_faturamento: Math.max(0, metaFaturamento),
        meta_pedidos: Math.max(1, Math.round(metaPedidos)),
        meta_lucro_liquido: Math.max(0, metaLucroLiquido),
        meta_ticket_medio: Math.max(0, metaTicketMedio),
        meta_inadimplencia_maxima: Math.min(100, Math.max(0, metaInadimplenciaMaxima)),
        meta_giro_estoque: Math.min(1000, Math.max(0, metaSaudeEstoqueRuptura)),
        meta_saude_estoque_max_ruptura: Math.min(1000, Math.max(0, metaSaudeEstoqueRuptura))
      };

      const resultado = await dashboardService.salvarMetasLoja(idLojaAlvo, payload);
      mostrarSucesso('Metas da loja atualizadas com sucesso!');
      setMensagemSucesso('Metas mensais salvas com sucesso!');
      setTimeout(() => setMensagemSucesso(null), 3500);

      if (onSucessoSalvar) {
        onSucessoSalvar(resultado);
      }
    } catch (err: any) {
      console.error('[ConfiguracoesMetas] Falha ao salvar metas:', err);
      mostrarErro(err.message || 'Erro ao salvar metas da loja.');
    } finally {
      setSalvando(false);
    }
  };

  const conteudoFormulario = (
    <div className="space-y-6">
      {/* Alerta Informativo de Permissão / Contexto */}
      {!podeEditar ? (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-amber-300 text-xs font-semibold">
          <Lock className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Apenas administradores e gerentes da loja possuem permissão para alterar as metas.</span>
        </div>
      ) : (
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2.5">
            <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p className="leading-relaxed">
              As metas cadastradas abaixo representam a projeção <strong>mensal</strong> da loja. O Dashboard Cockpit converte-as automaticamente para os filtros Diário, Semanal e Anual.
            </p>
          </div>
        </div>
      )}

      {mensagemSucesso && (
        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{mensagemSucesso}</span>
        </div>
      )}

      {/* Grid com os 6 Cards de Metas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Meta de Faturamento Mensal */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2 relative focus-within:border-emerald-500/60 shadow-xs transition">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>1. Faturamento Mensal</span>
            </label>
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
              Moeda (R$)
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            Faturamento bruto mensal total projetado para a loja.
          </p>

          <div className="relative pt-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-slate-500 dark:text-slate-400 pt-1">
              R$
            </span>
            <input
              type="number"
              step="100"
              min="0"
              disabled={!podeEditar || carregando}
              value={metaFaturamento}
              onChange={(e) => setMetaFaturamento(parseFloat(e.target.value) || 0)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-sm font-black font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition disabled:opacity-50"
            />
          </div>
        </div>

        {/* 2. Meta de Pedidos / Vendas */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2 relative focus-within:border-emerald-500/60 shadow-xs transition">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <ShoppingBag className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>2. Volume de Pedidos</span>
            </label>
            <span className="text-[10px] font-mono text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 px-2 py-0.5 rounded-full font-bold">
              Unidades
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            Quantidade de pedidos/vendas concluídas no mês.
          </p>

          <div className="relative pt-1">
            <input
              type="number"
              step="10"
              min="1"
              disabled={!podeEditar || carregando}
              value={metaPedidos}
              onChange={(e) => setMetaPedidos(parseInt(e.target.value, 10) || 0)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-black font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition disabled:opacity-50"
            />
          </div>
        </div>

        {/* 3. Meta de Lucro Líquido Real */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2 relative focus-within:border-emerald-500/60 shadow-xs transition">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>3. Lucro Líquido Real</span>
            </label>
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
              Moeda (R$)
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            Lucro após dedução de CMV, taxas financeiras e despesas operacionais pagas.
          </p>

          <div className="relative pt-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-slate-500 dark:text-slate-400 pt-1">
              R$
            </span>
            <input
              type="number"
              step="100"
              min="0"
              disabled={!podeEditar || carregando}
              value={metaLucroLiquido}
              onChange={(e) => setMetaLucroLiquido(parseFloat(e.target.value) || 0)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-sm font-black font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition disabled:opacity-50"
            />
          </div>
        </div>

        {/* 4. Meta de Ticket Médio */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2 relative focus-within:border-emerald-500/60 shadow-xs transition">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>4. Ticket Médio</span>
            </label>
            <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 px-2 py-0.5 rounded-full font-bold">
              R$ / Pedido
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            Valor médio esperado por pedido concluído.
          </p>

          <div className="relative pt-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-slate-500 dark:text-slate-400 pt-1">
              R$
            </span>
            <input
              type="number"
              step="5"
              min="0"
              disabled={!podeEditar || carregando}
              value={metaTicketMedio}
              onChange={(e) => setMetaTicketMedio(parseFloat(e.target.value) || 0)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-sm font-black font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition disabled:opacity-50"
            />
          </div>
        </div>

        {/* 5. Meta de Inadimplência Máxima (Escala Invertida) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2 relative focus-within:border-emerald-500/60 shadow-xs transition">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              <span>5. Inadimplência Máxima</span>
            </label>
            <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
              Escala Invertida (%)
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            Teto limite de tolerância para contas/fiados com atraso superior a 30 dias.
          </p>

          <div className="relative pt-1">
            <input
              type="number"
              step="0.5"
              min="0"
              max="100"
              disabled={!podeEditar || carregando}
              value={metaInadimplenciaMaxima}
              onChange={(e) => setMetaInadimplenciaMaxima(parseFloat(e.target.value) || 0)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-3.5 pr-8 py-2.5 text-sm font-black font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition disabled:opacity-50"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-slate-500 dark:text-slate-400 pt-1">
              %
            </span>
          </div>
        </div>

        {/* 6. Meta de Saúde do Estoque (Ruptura Máxima Tolerada) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2 relative focus-within:border-emerald-500/60 shadow-xs transition">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>6. Saúde do Estoque</span>
            </label>
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
              Ruptura Máxima
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            Teto máximo tolerável de produtos ativos com estoque zerado ou abaixo do mínimo configurado (ex: meta de 0 rupturas).
          </p>

          <div className="relative pt-1">
            <input
              type="number"
              step="1"
              min="0"
              max="500"
              disabled={!podeEditar || carregando}
              value={metaSaudeEstoqueRuptura}
              onChange={(e) => setMetaSaudeEstoqueRuptura(parseInt(e.target.value) || 0)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-3.5 pr-14 py-2.5 text-sm font-black font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition disabled:opacity-50"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-slate-500 dark:text-slate-400 pt-1">
              itens
            </span>
          </div>
        </div>
      </div>

      {/* Barra de Ações Inferior */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
        <button
          type="button"
          disabled={!podeEditar || carregando || salvando}
          onClick={handleRestaurarPadroes}
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restaurar Padrões de Mercado</span>
        </button>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          {onVoltar && (
            <button
              type="button"
              onClick={onVoltar}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs border border-slate-300 dark:border-slate-800 transition cursor-pointer"
            >
              Voltar
            </button>
          )}

          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs border border-slate-300 dark:border-slate-800 transition cursor-pointer"
            >
              Fechar
            </button>
          )}

          {podeEditar && (
            <button
              type="button"
              disabled={salvando || carregando}
              onClick={handleSalvar}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {salvando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Salvar Metas</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Se renderizado como Modal Flutuante
  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
        <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          {/* Header do Modal */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Configurar Metas da Loja</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Parâmetros executivos mensais para os velocímetros F1</p>
              </div>
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-slate-50 dark:bg-slate-900/60 custom-scrollbar">
            {conteudoFormulario}
          </div>
        </div>
      </div>
    );
  }

  // Se renderizado na página de Configurações
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xs space-y-6 animate-in fade-in">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          {onVoltar && (
            <button
              type="button"
              onClick={onVoltar}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
              title="Voltar ao Menu"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h2 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>Metas da Loja (Cockpit Executivo)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Configure as metas operacionais mensais que guiam os velocímetros de alta performance
            </p>
          </div>
        </div>
      </div>

      {conteudoFormulario}
    </div>
  );
};
