import React, { useState, useEffect } from 'react';
import {
  Scale,
  ShoppingBag,
  Truck,
  Store,
  Layers,
  CheckCircle2,
  BookOpen,
  Receipt,
  Sliders,
  AlertCircle,
  Check,
  Loader2,
  LucideIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Loja } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

export interface PainelGatilhosWhatsappProps {
  loja: Loja;
  autoAtivoGeral: boolean;
  aoAtualizarLoja?: (novosDados?: Partial<Loja>) => void;
}

type ChaveFlagWhatsapp =
  | 'wpp_auto_pesagem_concluida'
  | 'wpp_auto_pedido_confirmado'
  | 'wpp_auto_despacho_rastreio'
  | 'wpp_auto_pronto_retirada'
  | 'wpp_auto_status_separacao'
  | 'wpp_auto_pedido_entregue'
  | 'wpp_auto_comprovante_fiado'
  | 'wpp_auto_recibo_venda';

interface ItemGatilhoConfig {
  chave: ChaveFlagWhatsapp;
  titulo: string;
  descricao: string;
  badge: 'essencial' | 'recomendado' | 'opcional';
  badgeTexto: string;
  icone: LucideIcon;
  defaultVal: boolean;
}

export const PainelGatilhosWhatsapp: React.FC<PainelGatilhosWhatsappProps> = ({
  loja,
  autoAtivoGeral,
  aoAtualizarLoja,
}) => {
  const { isDark } = useTheme();
  const { recarregarDadosLoja } = useAuth();

  const [flags, setFlags] = useState<Record<ChaveFlagWhatsapp, boolean>>({
    wpp_auto_pesagem_concluida: loja.wpp_auto_pesagem_concluida ?? true,
    wpp_auto_pedido_confirmado: loja.wpp_auto_pedido_confirmado ?? true,
    wpp_auto_despacho_rastreio: loja.wpp_auto_despacho_rastreio ?? true,
    wpp_auto_pronto_retirada: loja.wpp_auto_pronto_retirada ?? true,
    wpp_auto_status_separacao: loja.wpp_auto_status_separacao ?? false,
    wpp_auto_pedido_entregue: loja.wpp_auto_pedido_entregue ?? false,
    wpp_auto_comprovante_fiado: loja.wpp_auto_comprovante_fiado ?? true,
    wpp_auto_recibo_venda: loja.wpp_auto_recibo_venda ?? false,
  });

  const [salvandoChave, setSalvandoChave] = useState<ChaveFlagWhatsapp | null>(null);
  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; mensagem: string } | null>(null);

  useEffect(() => {
    setFlags({
      wpp_auto_pesagem_concluida: loja.wpp_auto_pesagem_concluida ?? true,
      wpp_auto_pedido_confirmado: loja.wpp_auto_pedido_confirmado ?? true,
      wpp_auto_despacho_rastreio: loja.wpp_auto_despacho_rastreio ?? true,
      wpp_auto_pronto_retirada: loja.wpp_auto_pronto_retirada ?? true,
      wpp_auto_status_separacao: loja.wpp_auto_status_separacao ?? false,
      wpp_auto_pedido_entregue: loja.wpp_auto_pedido_entregue ?? false,
      wpp_auto_comprovante_fiado: loja.wpp_auto_comprovante_fiado ?? true,
      wpp_auto_recibo_venda: loja.wpp_auto_recibo_venda ?? false,
    });
  }, [
    loja.wpp_auto_pesagem_concluida,
    loja.wpp_auto_pedido_confirmado,
    loja.wpp_auto_despacho_rastreio,
    loja.wpp_auto_pronto_retirada,
    loja.wpp_auto_status_separacao,
    loja.wpp_auto_pedido_entregue,
    loja.wpp_auto_comprovante_fiado,
    loja.wpp_auto_recibo_venda,
  ]);

  const handleToggle = async (chave: ChaveFlagWhatsapp, novoValor: boolean) => {
    if (!loja?.id || salvandoChave) return;

    const valorAnterior = flags[chave];
    setSalvandoChave(chave);
    setFeedback(null);

    // Atualização otimista na interface
    setFlags((prev) => ({ ...prev, [chave]: novoValor }));

    try {
      const { error } = await supabase
        .from('lojas')
        .update({ [chave]: novoValor })
        .eq('id', loja.id);

      if (error) {
        throw error;
      }

      aoAtualizarLoja?.({ [chave]: novoValor });
      recarregarDadosLoja?.();

      setFeedback({
        tipo: 'sucesso',
        mensagem: 'Preferência de disparo salva com sucesso!',
      });
      setTimeout(() => setFeedback(null), 3500);
    } catch {
      // Reverte em caso de falha
      setFlags((prev) => ({ ...prev, [chave]: valorAnterior }));
      setFeedback({
        tipo: 'erro',
        mensagem: 'Não foi possível salvar a alteração. Tente novamente.',
      });
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setSalvandoChave(null);
    }
  };

  const renderBadge = (tipo: 'essencial' | 'recomendado' | 'opcional', texto: string) => {
    switch (tipo) {
      case 'essencial':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            {texto}
          </span>
        );
      case 'recomendado':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
            {texto}
          </span>
        );
      case 'opcional':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            {texto}
          </span>
        );
    }
  };

  const renderItem = (item: ItemGatilhoConfig) => {
    const Icone = item.icone;
    const ativo = flags[item.chave];
    const emSalvamento = salvandoChave === item.chave;

    return (
      <div
        key={item.chave}
        className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 transition-colors ${
          isDark
            ? ativo
              ? 'bg-slate-800/80 border-slate-700/80'
              : 'bg-slate-800/30 border-slate-800/50 text-slate-400'
            : ativo
            ? 'bg-slate-50 border-slate-200'
            : 'bg-slate-50/40 border-slate-100 text-slate-500'
        }`}
      >
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div
            className={`p-2 rounded-lg mt-0.5 shrink-0 ${
              isDark
                ? ativo
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-slate-700/50 text-slate-500'
                : ativo
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            <Icone size={18} />
          </div>
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {item.titulo}
              </span>
              {renderBadge(item.badge, item.badgeTexto)}
            </div>
            <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              {item.descricao}
            </p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2 pt-0.5">
          {emSalvamento && <Loader2 size={16} className="animate-spin text-emerald-500" />}
          <button
            type="button"
            role="switch"
            aria-checked={ativo}
            disabled={emSalvamento || !autoAtivoGeral}
            onClick={() => handleToggle(item.chave, !ativo)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              ativo ? 'bg-emerald-600' : isDark ? 'bg-slate-700' : 'bg-slate-300'
            } ${emSalvamento ? 'opacity-60' : ''}`}
            title={ativo ? 'Desativar este disparo' : 'Ativar este disparo'}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                ativo ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    );
  };

  const blocoA: ItemGatilhoConfig[] = [
    {
      chave: 'wpp_auto_pesagem_concluida',
      titulo: 'Liberação de Pagamento Pós-Pesagem (Balança)',
      descricao: 'Envia automaticamente o valor final aferido e o link de pagamento para pedidos com itens por quilo.',
      badge: 'essencial',
      badgeTexto: 'Essencial',
      icone: Scale,
      defaultVal: true,
    },
    {
      chave: 'wpp_auto_pedido_confirmado',
      titulo: 'Confirmação de Novo Pedido',
      descricao: 'Envia resumo do pedido e link de acompanhamento assim que o pedido é confirmado.',
      badge: 'recomendado',
      badgeTexto: 'Recomendado',
      icone: ShoppingBag,
      defaultVal: true,
    },
  ];

  const blocoB: ItemGatilhoConfig[] = [
    {
      chave: 'wpp_auto_despacho_rastreio',
      titulo: 'Pedido Despachado / Saiu para Entrega',
      descricao: 'Envia aviso de saída para entrega ou código de rastreio (Correios, Transportadora ou App).',
      badge: 'recomendado',
      badgeTexto: 'Recomendado',
      icone: Truck,
      defaultVal: true,
    },
    {
      chave: 'wpp_auto_pronto_retirada',
      titulo: 'Pedido Pronto para Retirada na Loja',
      descricao: 'Avisa o cliente que o pedido já pode ser retirado no balcão.',
      badge: 'recomendado',
      badgeTexto: 'Recomendado',
      icone: Store,
      defaultVal: true,
    },
    {
      chave: 'wpp_auto_status_separacao',
      titulo: 'Avisos Intermediários (Em Separação / Em Produção)',
      descricao: 'Notifica mudanças internas de etapa na preparação.',
      badge: 'opcional',
      badgeTexto: 'Opcional · Consome Saldo',
      icone: Layers,
      defaultVal: false,
    },
    {
      chave: 'wpp_auto_pedido_entregue',
      titulo: 'Aviso de Pedido Entregue / Concluído',
      descricao: 'Envia mensagem de confirmação após a entrega final.',
      badge: 'opcional',
      badgeTexto: 'Opcional · Consome Saldo',
      icone: CheckCircle2,
      defaultVal: false,
    },
  ];

  const blocoC: ItemGatilhoConfig[] = [
    {
      chave: 'wpp_auto_comprovante_fiado',
      titulo: 'Comprovante de Pagamento (Fiado e Caderneta)',
      descricao: 'Envia recibo de quitação/amortização e saldo atualizado.',
      badge: 'recomendado',
      badgeTexto: 'Recomendado',
      icone: BookOpen,
      defaultVal: true,
    },
    {
      chave: 'wpp_auto_recibo_venda',
      titulo: 'Recibo Digital Automático no PDV',
      descricao: 'Dispara o cupom da venda automaticamente ao finalizar no caixa.',
      badge: 'opcional',
      badgeTexto: 'Opcional · Consome Saldo',
      icone: Receipt,
      defaultVal: false,
    },
  ];

  return (
    <div
      className={`rounded-2xl border p-5 space-y-6 transition-all ${
        isDark ? 'bg-slate-900/90 border-slate-700/80 shadow-lg' : 'bg-white border-slate-200 shadow-sm'
      }`}
    >
      {/* Cabeçalho do Painel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <Sliders size={20} />
          </div>
          <div>
            <h3 className={`text-sm md:text-base font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Quais avisos enviar automaticamente com seu saldo?
            </h3>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Escolha exatamente quais eventos devem disparar mensagens automáticas em segundo plano. Eventos desligados
              abaixo não consumirão seu saldo e usarão o envio manual gratuito.
            </p>
          </div>
        </div>

        {feedback && (
          <div
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto animate-in fade-in ${
              feedback.tipo === 'sucesso'
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
            }`}
          >
            {feedback.tipo === 'sucesso' ? <Check size={14} /> : <AlertCircle size={14} />}
            <span>{feedback.mensagem}</span>
          </div>
        )}
      </div>

      {/* Aviso de Disjuntor Mestre Desligado */}
      {!autoAtivoGeral && (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 font-medium animate-in fade-in">
          <AlertCircle size={16} className="shrink-0 text-amber-500" />
          <span>
            O <strong>Envio Automático Geral</strong> está desativado no topo. Ative a chave geral acima para que as
            notificações automáticas sejam processadas.
          </span>
        </div>
      )}

      {/* Container dos Switches com Opacidade Reduzida se Mestre estiver desligado */}
      <div className={`space-y-5 transition-opacity ${!autoAtivoGeral ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* Bloco A: Pedidos & Pesagem */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <h4 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Bloco A: Pedidos & Pesagem
            </h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{blocoA.map(renderItem)}</div>
        </div>

        {/* Bloco B: Logística, Separação & Entrega */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
            <h4 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Bloco B: Logística, Separação & Entrega
            </h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{blocoB.map(renderItem)}</div>
        </div>

        {/* Bloco C: Financeiro, Recibos & Crediário */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
            <h4 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Bloco C: Financeiro, Recibos & Crediário
            </h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{blocoC.map(renderItem)}</div>
        </div>
      </div>
    </div>
  );
};
