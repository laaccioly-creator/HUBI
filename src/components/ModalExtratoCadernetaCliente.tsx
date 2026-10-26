import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  Receipt
} from 'lucide-react';
import { Cliente, CadernetaLancamento, Pedido } from '../types';
import { CadernetaService, ResumoCadernetaCliente } from '../services/cadernetaService';
import { formatarMoeda } from '../utils/formatters';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { supabase } from '../lib/supabase';
import { ModalPagamentoCadernetaUnificado } from './caderneta/ModalPagamentoCadernetaUnificado';
import { ReciboPedidoModal } from './pedidos/ReciboPedidoModal';
import { whatsappWalletService } from '../services/whatsappWalletService';

interface ModalExtratoCadernetaClienteProps {
  isOpen: boolean;
  onClose: () => void;
  cliente: Cliente | null;
  onAtualizado?: () => void;
}

export const ModalExtratoCadernetaCliente: React.FC<ModalExtratoCadernetaClienteProps> = ({
  isOpen,
  onClose,
  cliente,
  onAtualizado
}) => {
  const { loja, usuario } = useAuth();
  const { isDark } = useTheme();
  const { mostrarSucesso, mostrarErro } = useFeedbackModal();

  const [resumo, setResumo] = useState<ResumoCadernetaCliente | null>(null);
  const [extrato, setExtrato] = useState<CadernetaLancamento[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [itensExpandidosIds, setItensExpandidosIds] = useState<Record<string, boolean>>({});

  // Estados de Pagamento / Abatimento e Conferência de Comprovante
  const [modalAbatimentoAberto, setModalAbatimentoAberto] = useState<boolean>(false);
  const [processandoConferenciaId, setProcessandoConferenciaId] = useState<string | null>(null);
  const [comprovanteVisualizandoUrl, setComprovanteVisualizandoUrl] = useState<string | null>(null);
  const [pedidoReciboModal, setPedidoReciboModal] = useState<Pedido | null>(null);

  const carregarDados = async () => {
    if (!loja?.id || !cliente?.id) return;
    try {
      setCarregando(true);
      const [resumoData, extratoData] = await Promise.all([
        CadernetaService.obterResumoCliente(loja.id, cliente.id),
        CadernetaService.listarExtratoCliente(loja.id, cliente.id)
      ]);

      setResumo(resumoData);
      setExtrato(extratoData);
    } catch (err) {
      console.error('Erro ao carregar dados da caderneta:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (isOpen && cliente) {
      carregarDados();
    }
  }, [isOpen, cliente]);

  if (!isOpen || !cliente) return null;

  const lancamentosPendentes = extrato.filter((l) =>
    CadernetaService.ehLancamentoPendenteConferencia(l)
  );

  const handleConfirmarRecebimentoPendente = async (lanc: CadernetaLancamento) => {
    if (!loja?.id) return;
    try {
      setProcessandoConferenciaId(lanc.id);
      const res = await CadernetaService.confirmarLiquidacaoPendente({
        lojaId: loja.id,
        lancamentoId: lanc.id,
        usuarioId: usuario?.id
      });
      if (!res.sucesso) {
        mostrarErro(res.mensagem || 'Não foi possível confirmar o recebimento.');
        return;
      }
      mostrarSucesso(`Recebimento de ${formatarMoeda(lanc.valor)} confirmado! Saldo abatido e limite liberado.`);
      const foneCli = cliente.whatsapp || cliente.telefone;
      if (foneCli) {
        const msgComprovante =
          `Olá, *${cliente.nome}*! ✅\n` +
          `Confirmamos o recebimento de *${formatarMoeda(lanc.valor)}* na sua Caderneta na loja *${loja.nome_fantasia || 'HUBI'}*.\n` +
          `Seu limite já foi atualizado. Obrigado!`;
        whatsappWalletService
          .dispararNotificacaoHibrida({
            lojaId: loja.id,
            telefoneDestino: foneCli,
            mensagem: msgComprovante,
            eventoGatilho: 'comprovante_caderneta',
            clienteId: cliente.id,
            usuarioId: usuario?.id || null,
          })
          .catch(() => {});
      }
      await carregarDados();
      onAtualizado?.();
    } catch (err: any) {
      mostrarErro(err?.message || 'Erro ao confirmar recebimento.');
    } finally {
      setProcessandoConferenciaId(null);
    }
  };

  const handleRecusarRecebimentoPendente = async (lanc: CadernetaLancamento) => {
    if (!loja?.id) return;
    try {
      setProcessandoConferenciaId(lanc.id);
      const res = await CadernetaService.recusarLiquidacaoPendente({
        lojaId: loja.id,
        lancamentoId: lanc.id
      });
      if (!res.sucesso) {
        mostrarErro(res.mensagem || 'Não foi possível recusar a solicitação.');
        return;
      }
      mostrarSucesso('Solicitação marcada como recusada. O saldo devedor permanece inalterado.');
      await carregarDados();
      onAtualizado?.();
    } catch (err: any) {
      mostrarErro(err?.message || 'Erro ao recusar solicitação.');
    } finally {
      setProcessandoConferenciaId(null);
    }
  };

  const handleEnviarWhatsApp = async () => {
    const fone = cliente.whatsapp || cliente.telefone;
    if (!fone || !resumo || !loja?.id) return;

    const texto = `Olá, *${cliente.nome}*! 👋\n\n` +
      `Aqui está o resumo da sua *Caderneta no ${loja?.nome_fantasia || 'Mercadinho'}*:\n` +
      `💰 *Saldo Devedor Atual:* ${formatarMoeda(resumo.saldoDevedor)}\n` +
      `🟢 *Limite Disponível:* ${formatarMoeda(resumo.limiteDisponivel)} (de ${formatarMoeda(resumo.limiteTotal)})\n` +
      `📅 *Dia de Acerto Mensal:* Todo dia ${resumo.diaVencimento}\n` +
      `🗓️ *Próximo Vencimento:* ${new Date(resumo.proximoVencimento + 'T12:00:00').toLocaleDateString('pt-BR')}\n\n` +
      `Agradecemos pela preferência! ✨`;

    const resHibrido = await whatsappWalletService.dispararNotificacaoHibrida({
      lojaId: loja.id,
      telefoneDestino: fone,
      mensagem: texto,
      eventoGatilho: 'cobranca_caderneta',
      clienteId: cliente.id,
      usuarioId: usuario?.id || null,
    });

    if (resHibrido.modoEnvio === 'auto_janela_24h' || resHibrido.modoEnvio === 'auto_tarifado') {
      mostrarSucesso('✓ Resumo da Caderneta enviado automaticamente no WhatsApp do cliente!');
      return;
    }

    const url = resHibrido.manualUrl || `https://wa.me/55${fone.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className={`w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] ${
        isDark ? 'bg-[#08131A] border-2 border-slate-400 text-slate-100' : 'bg-slate-100 border-2 border-slate-300 text-black'
      }`}>
        {/* Cabeçalho */}
        <div className={`p-4 sm:px-6 border-b flex items-center justify-between shrink-0 ${
          isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-300 bg-slate-100'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
              isDark ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-emerald-50 text-emerald-600 border-emerald-200'
            }`}>
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`font-black text-sm sm:text-base leading-tight ${isDark ? 'text-white' : 'text-black'}`}>
                Extrato da Caderneta
              </h2>
              <p className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Cliente: <strong className={`font-black ${isDark ? 'text-white' : 'text-black'}`}>{cliente.nome}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-xl border transition cursor-pointer ${
              isDark ? 'bg-[#000000] border-slate-700 text-white hover:bg-slate-900' : 'bg-white border-2 border-slate-300 text-black hover:bg-slate-50'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Indicadores e Extrato */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
          {carregando ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Carregando extrato da caderneta...</span>
            </div>
          ) : (
            <>
              {/* Cards de Resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className={`p-3 rounded-2xl ${isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'}`}>
                  <span className={`text-[10px] font-bold block uppercase ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Limite Total</span>
                  <span className="text-sm sm:text-base font-black font-mono">
                    {formatarMoeda(resumo?.limiteTotal || 0)}
                  </span>
                </div>

                <div className={`p-3 rounded-2xl ${
                  (resumo?.saldoDevedor || 0) > 0
                    ? isDark ? 'bg-[#000000] border border-amber-500/60 text-amber-400' : 'bg-amber-50 border-2 border-amber-400 text-amber-900'
                    : isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                }`}>
                  <span className="text-[10px] font-bold block uppercase opacity-85">Saldo Devedor</span>
                  <span className="text-sm sm:text-base font-black font-mono">
                    {formatarMoeda(resumo?.saldoDevedor || 0)}
                  </span>
                </div>

                <div className={`p-3 rounded-2xl ${isDark ? 'bg-[#000000] border border-emerald-500/50 text-emerald-400' : 'bg-emerald-50 border-2 border-emerald-300 text-emerald-900'}`}>
                  <span className="text-[10px] font-bold block uppercase opacity-85">Disponível</span>
                  <span className="text-sm sm:text-base font-black font-mono">
                    {formatarMoeda(resumo?.limiteDisponivel || 0)}
                  </span>
                </div>

                <div className={`p-3 rounded-2xl ${
                  resumo?.estaVencido
                    ? isDark ? 'bg-[#000000] border border-rose-500/60 text-rose-400' : 'bg-rose-50 border-2 border-rose-400 text-rose-900'
                    : isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                }`}>
                  <span className={`text-[10px] font-bold block uppercase ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Vencimento</span>
                  <span className="text-xs sm:text-sm font-black block truncate">
                    {resumo?.proximoVencimento ? new Date(resumo.proximoVencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '--'}
                  </span>
                  <span className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Todo dia {resumo?.diaVencimento}</span>
                </div>
              </div>

              {/* Alerta de Solicitações de Pagamento Pendentes de Conferência (Catálogo Online) */}
              {lancamentosPendentes.length > 0 && (
                <div className={`p-3.5 rounded-2xl border-2 space-y-2.5 ${
                  isDark
                    ? 'bg-amber-950/30 border-amber-500/60 text-amber-200'
                    : 'bg-amber-50 border-amber-400 text-amber-950'
                }`}>
                  <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Pagamento Pendente de Conferência ({lancamentosPendentes.length})</span>
                  </div>
                  <div className="space-y-2">
                    {lancamentosPendentes.map((pend) => {
                      const compUrl = CadernetaService.extrairComprovanteLancamento(pend);
                      const descLimpa = String(pend.descricao || '')
                        .replace('[PENDENTE_CONFERENCIA]', '')
                        .trim();
                      const processandoEste = processandoConferenciaId === pend.id;

                      return (
                        <div
                          key={pend.id}
                          className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs ${
                            isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-amber-300 text-slate-900'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-sm text-emerald-600 dark:text-emerald-400 font-mono">
                                {formatarMoeda(pend.valor)}
                              </span>
                              <span className="font-bold">{descLimpa}</span>
                            </div>
                            <span className={`text-[11px] block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                              Enviado em {new Date(pend.criado_em || Date.now()).toLocaleString('pt-BR')}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {compUrl && (
                              <button
                                type="button"
                                onClick={() => setComprovanteVisualizandoUrl(compUrl)}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 border transition cursor-pointer ${
                                  isDark
                                    ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-sky-400'
                                    : 'bg-sky-50 hover:bg-sky-100 border-sky-300 text-sky-800'
                                }`}
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Ver Comprovante</span>
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={processandoEste}
                              onClick={() => handleRecusarRecebimentoPendente(pend)}
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer disabled:opacity-50 ${
                                isDark
                                  ? 'bg-rose-950/40 hover:bg-rose-900/60 border-rose-500/40 text-rose-300'
                                  : 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-700'
                              }`}
                            >
                              Recusar
                            </button>

                            <button
                              type="button"
                              disabled={processandoEste}
                              onClick={() => handleConfirmarRecebimentoPendente(pend)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black flex items-center gap-1 shadow-xs transition cursor-pointer disabled:opacity-50"
                            >
                              {processandoEste ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}
                              <span>Confirmar Recebimento</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Botões de Ação do Lojista */}
              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={(resumo?.saldoDevedor || 0) <= 0}
                  onClick={() => setModalAbatimentoAberto(true)}
                  className={`flex-1 py-2.5 px-4 rounded-xl font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-98 ${
                    (resumo?.saldoDevedor || 0) <= 0
                      ? isDark
                        ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-80'
                        : 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed opacity-90'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600 shadow-sm cursor-pointer'
                  }`}
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Registrar Pagamento / Abatimento</span>
                </button>

                {(cliente.whatsapp || cliente.telefone) && (
                  <button
                    type="button"
                    onClick={handleEnviarWhatsApp}
                    className={`py-2.5 px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm active:scale-98 ${
                      isDark
                        ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-emerald-400'
                        : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-emerald-700'
                    }`}
                    title="Enviar Extrato no WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span className="hidden sm:inline">WhatsApp</span>
                  </button>
                )}
              </div>

              {/* Extrato de Linha do Tempo */}
              <div className="space-y-2.5 pt-2">
                <h3 className={`text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-black'}`}>
                  <Clock className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Histórico da Conta Corrente ({extrato.length} {extrato.length === 1 ? 'lançamento' : 'lançamentos'})</span>
                </h3>

                {extrato.length === 0 ? (
                  <div className={`p-8 text-center rounded-2xl text-xs font-bold ${
                    isDark ? 'bg-[#000000] border border-slate-700 text-slate-400' : 'bg-white border-2 border-slate-300 text-slate-600'
                  }`}>
                    Nenhuma movimentação registrada na caderneta deste cliente.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {extrato.map((lanc) => {
                      const ehCompra = lanc.tipo_lancamento === 'compra';
                      const ehPendente = CadernetaService.ehLancamentoPendenteConferencia(lanc);
                      const ehRecusado = CadernetaService.ehLancamentoRecusado(lanc);
                      const itensCompra: any[] = (lanc.pedido as any)?.itens || [];
                      const expandido = Boolean(itensExpandidosIds[lanc.id]);
                      const numeroPedidoExibicao = (lanc.pedido as any)?.numero_pedido
                        ? `Pedido #${(lanc.pedido as any).numero_pedido}`
                        : (lanc.descricao?.replace(/^Compra ref\.\s*/i, '').replace('[PENDENTE_CONFERENCIA]', '').replace('[RECUSADO]', '').trim() || 'Lançamento');
                      const dataHoraExibicao = `${new Date(lanc.criado_em || Date.now()).toLocaleDateString('pt-BR')} ${new Date(lanc.criado_em || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

                      return (
                        <div
                          key={lanc.id}
                          className={`p-3 rounded-2xl text-xs transition space-y-2 ${
                            isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                              <span className={`text-[11px] font-semibold font-mono shrink-0 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                {dataHoraExibicao}
                              </span>
                              <span className={`font-black truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                {numeroPedidoExibicao}
                              </span>
                              {ehPendente && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                  Pendente de Conferência
                                </span>
                              )}
                              {ehRecusado && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                                  Recusado
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0">
                              <span className={`font-black text-sm font-mono ${
                                ehRecusado
                                  ? 'line-through opacity-50'
                                  : ehPendente
                                    ? (isDark ? 'text-amber-400' : 'text-amber-700')
                                    : ehCompra
                                      ? (isDark ? 'text-amber-400' : 'text-amber-700')
                                      : (isDark ? 'text-emerald-400' : 'text-emerald-700')
                              }`}>
                                {ehCompra ? '+' : '-'} {formatarMoeda(lanc.valor)}
                              </span>

                              {ehCompra && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {lanc.pedido_id && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (!loja?.id || !lanc.pedido_id) return;
                                        let pedAlvo = lanc.pedido;
                                        if (!pedAlvo || !pedAlvo.itens || pedAlvo.itens.length === 0) {
                                          try {
                                            const [resPed, resItens, resPags] = await Promise.all([
                                              supabase.from('pedidos').select('*').eq('id', lanc.pedido_id).eq('loja_id', loja.id).single(),
                                              supabase.from('itens_pedido').select('*').eq('pedido_id', lanc.pedido_id).eq('loja_id', loja.id),
                                              supabase.from('pagamentos_pedido').select('*, forma_pagamento:formas_pagamento(*)').eq('pedido_id', lanc.pedido_id).eq('loja_id', loja.id)
                                            ]);
                                            if (resPed.data) {
                                              pedAlvo = {
                                                ...resPed.data,
                                                itens: resItens.data || [],
                                                pagamentos: resPags.data || []
                                              } as Pedido;
                                            }
                                          } catch (e) {
                                            console.warn('Erro ao carregar dados do pedido para recibo:', e);
                                          }
                                        }
                                        if (pedAlvo) {
                                          setPedidoReciboModal(pedAlvo);
                                        }
                                      }}
                                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 border transition cursor-pointer ${
                                        isDark
                                          ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200 hover:text-white'
                                          : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800 hover:text-slate-950 shadow-2xs'
                                      }`}
                                      title="Visualizar Recibo Oficial do Pedido"
                                    >
                                      <Receipt className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                      <span>Recibo</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const proximoEstado = !expandido;
                                      setItensExpandidosIds(prev => ({ ...prev, [lanc.id]: proximoEstado }));
                                      if (proximoEstado && itensCompra.length === 0 && lanc.pedido_id && loja?.id) {
                                        const { data: itensBanco } = await supabase
                                          .from('itens_pedido')
                                          .select('*')
                                          .eq('pedido_id', lanc.pedido_id)
                                          .eq('loja_id', loja.id);
                                        if (itensBanco && itensBanco.length > 0) {
                                          setExtrato(prev => prev.map(item =>
                                            item.id === lanc.id
                                              ? { ...item, pedido: { ...(item.pedido as any), itens: itensBanco } as any }
                                              : item
                                          ));
                                        }
                                      }
                                    }}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 border transition cursor-pointer ${
                                      isDark
                                        ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                                        : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                                    }`}
                                  >
                                    <span>Detalhar</span>
                                    {expandido ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {expandido && itensCompra.length > 0 && (
                            <div className={`pt-2 border-t space-y-1 animate-in fade-in duration-150 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                              {itensCompra.map((item: any, idx: number) => (
                                <div key={item.id || idx} className={`flex items-center justify-between text-[11px] ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                  <span className="truncate pr-2 font-medium">
                                    <strong className="font-bold">{Math.round(Number(item.quantidade || 1))}x</strong> {item.nome_produto}
                                    {item.rotulo_variacao ? ` (${item.rotulo_variacao})` : ''}
                                  </span>
                                  <span className="font-mono font-bold shrink-0">
                                    {formatarMoeda(Number(item.subtotal || (Number(item.preco_venda_unitario || 0) * Number(item.quantidade || 1))))}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Único Reutilizável de Liquidação da Caderneta */}
        <ModalPagamentoCadernetaUnificado
          isOpen={modalAbatimentoAberto}
          onClose={() => setModalAbatimentoAberto(false)}
          loja={loja}
          cliente={cliente}
          saldoDevedor={resumo?.saldoDevedor || 0}
          origem="lojista"
          usuarioId={usuario?.id}
          isDark={isDark}
          onSucesso={async (msg) => {
            mostrarSucesso(msg);
            await carregarDados();
            onAtualizado?.();
          }}
        />

        {/* Modal de Visualização de Comprovante Anexado */}
        {comprovanteVisualizandoUrl && (
          <div className="fixed inset-0 z-80 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
            <div className={`w-full max-w-lg rounded-3xl p-4 sm:p-5 space-y-3 shadow-2xl ${
              isDark ? 'bg-[#08131A] border-2 border-slate-500 text-white' : 'bg-white border-2 border-slate-300 text-slate-900'
            }`}>
              <div className="flex items-center justify-between border-b pb-2.5 border-slate-200 dark:border-slate-800">
                <h4 className="font-black text-sm">Comprovante de Pagamento Anexado</h4>
                <button
                  type="button"
                  onClick={() => setComprovanteVisualizandoUrl(null)}
                  className="p-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="max-h-[68vh] overflow-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-black/20 flex items-center justify-center p-2">
                {comprovanteVisualizandoUrl.startsWith('data:application/pdf') || comprovanteVisualizandoUrl.toLowerCase().endsWith('.pdf') ? (
                  <iframe
                    src={comprovanteVisualizandoUrl}
                    title="Comprovante PDF"
                    className="w-full h-[60vh] rounded-xl"
                  />
                ) : (
                  <img
                    src={comprovanteVisualizandoUrl}
                    alt="Comprovante de Pagamento"
                    className="max-w-full max-h-[62vh] object-contain rounded-xl"
                  />
                )}
              </div>
              <div className="flex justify-end gap-2">
                <a
                  href={comprovanteVisualizandoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download="comprovante-caderneta"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition"
                >
                  Abrir / Baixar Arquivo
                </a>
                <button
                  type="button"
                  onClick={() => setComprovanteVisualizandoUrl(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Modal Oficial de Recibo do Pedido Vinculado */}
        <ReciboPedidoModal
          isOpen={Boolean(pedidoReciboModal)}
          pedido={pedidoReciboModal}
          loja={loja}
          onClose={() => setPedidoReciboModal(null)}
        />
      </div>
    </div>
  );
};
