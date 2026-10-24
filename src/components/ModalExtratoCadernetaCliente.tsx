import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  DollarSign,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  TrendingUp,
  Receipt,
  MessageCircle,
  Plus,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Cliente, CadernetaLancamento, FormaPagamento } from '../types';
import { CadernetaService, ResumoCadernetaCliente } from '../services/cadernetaService';
import { formatarMoeda } from '../utils/formatters';
import { MoneyInput } from './ui/MoneyInput';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { supabase } from '../lib/supabase';

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

  // Estados de Pagamento / Abatimento
  const [modalAbatimentoAberto, setModalAbatimentoAberto] = useState<boolean>(false);
  const [valorAbatimento, setValorAbatimento] = useState<number>(0);
  const [formaPagamentoId, setFormaPagamentoId] = useState<string>('');
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [salvandoAbatimento, setSalvandoAbatimento] = useState<boolean>(false);

  const carregarDados = async () => {
    if (!loja?.id || !cliente?.id) return;
    try {
      setCarregando(true);
      const [resumoData, extratoData, { data: fps }] = await Promise.all([
        CadernetaService.obterResumoCliente(loja.id, cliente.id),
        CadernetaService.listarExtratoCliente(loja.id, cliente.id),
        supabase.from('formas_pagamento').select('*').eq('loja_id', loja.id).eq('ativo', true).neq('tipo', 'fiado').neq('tipo', 'caderneta')
      ]);

      setResumo(resumoData);
      setExtrato(extratoData);
      const fpsFiltradas = ((fps as FormaPagamento[]) || []).filter(
        f => f.tipo !== 'fiado' && f.tipo !== 'caderneta' && !f.nome?.toLowerCase().includes('caderneta')
      );
      const listaFinal: FormaPagamento[] = fpsFiltradas.length > 0 ? fpsFiltradas : [
        { id: 'pix', loja_id: loja.id, nome: 'Pix', tipo: 'pix', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
        { id: 'dinheiro', loja_id: loja.id, nome: 'Dinheiro', tipo: 'dinheiro', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
        { id: 'cartao_debito', loja_id: loja.id, nome: 'Cartão de Débito', tipo: 'cartao_debito', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
        { id: 'cartao_credito', loja_id: loja.id, nome: 'Cartão de Crédito', tipo: 'cartao_credito', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 12, ativo: true, exibir_catalogo: true }
      ];
      setFormasPagamento(listaFinal);
      setFormaPagamentoId(listaFinal[0].id);
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

  const handleConfirmarAbatimento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id || valorAbatimento <= 0) return;

    try {
      setSalvandoAbatimento(true);
      const res = await CadernetaService.registrarPagamentoCaderneta({
        lojaId: loja.id,
        clienteId: cliente.id,
        valorPago: valorAbatimento,
        formaPagamentoId,
        usuarioId: usuario?.id
      });

      if (!res.sucesso) {
        mostrarErro(res.mensagem || 'Falha ao registrar pagamento.');
        return;
      }

      mostrarSucesso(`Pagamento de ${formatarMoeda(valorAbatimento)} registrado na caderneta!`);
      setModalAbatimentoAberto(false);
      setValorAbatimento(0);
      await carregarDados();
      if (onAtualizado) onAtualizado();
    } catch (err: any) {
      mostrarErro(err.message || 'Erro inesperado.');
    } finally {
      setSalvandoAbatimento(false);
    }
  };

  const handleEnviarWhatsApp = () => {
    const fone = cliente.whatsapp || cliente.telefone;
    if (!fone || !resumo) return;

    const texto = `Olá, *${cliente.nome}*! 👋\n\n` +
      `Aqui está o resumo da sua *Caderneta no ${loja?.nome_fantasia || 'Mercadinho'}*:\n` +
      `💰 *Saldo Devedor Atual:* ${formatarMoeda(resumo.saldoDevedor)}\n` +
      `🟢 *Limite Disponível:* ${formatarMoeda(resumo.limiteDisponivel)} (de ${formatarMoeda(resumo.limiteTotal)})\n` +
      `📅 *Dia de Acerto Mensal:* Todo dia ${resumo.diaVencimento}\n` +
      `🗓️ *Próximo Vencimento:* ${new Date(resumo.proximoVencimento + 'T12:00:00').toLocaleDateString('pt-BR')}\n\n` +
      `Agradecemos pela preferência! ✨`;

    const url = `https://wa.me/55${fone.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
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

              {/* Botões de Ação do Lojista */}
              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={(resumo?.saldoDevedor || 0) <= 0}
                  onClick={() => {
                    setValorAbatimento(resumo?.saldoDevedor || 0);
                    setModalAbatimentoAberto(true);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm shadow-emerald-600/20 active:scale-98 disabled:opacity-40"
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
                      const itensCompra: any[] = (lanc.pedido as any)?.itens || [];
                      const expandido = Boolean(itensExpandidosIds[lanc.id]);
                      const numeroPedidoExibicao = (lanc.pedido as any)?.numero_pedido
                        ? `Pedido #${(lanc.pedido as any).numero_pedido}`
                        : (lanc.descricao?.replace(/^Compra ref\.\s*/i, '') || 'Lançamento');
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
                              <span className={`text-[11px] font-semibold font-mono shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                {dataHoraExibicao}
                              </span>
                              <span className={`font-black truncate ${isDark ? 'text-white' : 'text-black'}`}>
                                {numeroPedidoExibicao}
                              </span>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0">
                              <span className={`font-black text-sm font-mono ${
                                ehCompra ? (isDark ? 'text-amber-400' : 'text-amber-700') : (isDark ? 'text-emerald-400' : 'text-emerald-700')
                              }`}>
                                {ehCompra ? '+' : '-'} {formatarMoeda(lanc.valor)}
                              </span>

                              {ehCompra && (
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
                              )}
                            </div>
                          </div>

                          {expandido && itensCompra.length > 0 && (
                            <div className={`pt-2 border-t space-y-1 animate-in fade-in duration-150 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                              {itensCompra.map((item: any, idx: number) => (
                                <div key={item.id || idx} className={`flex items-center justify-between text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
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

        {/* Submodal de Abatimento / Pagamento */}
        {modalAbatimentoAberto && (
          <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
            <div className={`w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-4 ${
              isDark ? 'bg-[#08131A] border-2 border-slate-400 text-white' : 'bg-white border-2 border-slate-300 text-black'
            }`}>
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm">Registrar Pagamento na Caderneta</h3>
                <button
                  type="button"
                  onClick={() => setModalAbatimentoAberto(false)}
                  className={`p-1.5 rounded-xl border transition cursor-pointer ${
                    isDark ? 'bg-[#000000] border-slate-700 text-white hover:bg-slate-900' : 'bg-slate-100 border-slate-300 text-black hover:bg-slate-200'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleConfirmarAbatimento} className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold block">Valor a Abater (R$)</label>
                  <div className={`flex items-center gap-1.5 rounded-xl px-3 py-2.5 focus-within:border-emerald-500 ${
                    isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
                  }`}>
                    <span className="text-xs font-bold text-emerald-500">R$</span>
                    <MoneyInput
                      autoFocus
                      value={valorAbatimento}
                      onChange={(v) => setValorAbatimento(v)}
                      mostrarPrefixo={false}
                      className={`w-full bg-transparent text-sm font-bold focus:outline-none ${isDark ? 'text-white' : 'text-black'}`}
                    />
                  </div>
                  <div className={`flex justify-between text-[11px] font-semibold pt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <span>Saldo Devedor Total:</span>
                    <button
                      type="button"
                      onClick={() => setValorAbatimento(resumo?.saldoDevedor || 0)}
                      className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      Quitar Tudo ({formatarMoeda(resumo?.saldoDevedor || 0)})
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold block">Forma de Pagamento Utilizada</label>
                  <select
                    value={formaPagamentoId}
                    onChange={(e) => setFormaPagamentoId(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2.5 text-xs font-bold focus:outline-none cursor-pointer ${
                      isDark ? 'bg-[#000000] border border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
                    }`}
                  >
                    {formasPagamento.map(fp => (
                      <option key={fp.id} value={fp.id}>
                        {fp.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalAbatimentoAberto(false)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                      isDark ? 'bg-[#000000] border border-slate-700 text-white hover:bg-slate-900' : 'bg-slate-100 border-2 border-slate-300 text-black hover:bg-slate-200'
                    }`}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={salvandoAbatimento || valorAbatimento <= 0}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition cursor-pointer disabled:opacity-50 shadow-sm shadow-emerald-600/20"
                  >
                    {salvandoAbatimento ? 'Salvando...' : 'Confirmar Abatimento'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
