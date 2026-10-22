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
  Plus
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
      if (fps && fps.length > 0) {
        setFormasPagamento(fps as FormaPagamento[]);
        setFormaPagamentoId(fps[0].id);
      }
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className={`w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] border ${
        isDark ? 'bg-slate-900 border-slate-700/80 text-white' : 'bg-white border-slate-300 text-black'
      }`}>
        {/* Cabeçalho */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between shrink-0 ${
          isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center border border-amber-500/30">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-sm sm:text-base leading-tight">Caderneta de Mercadinho</h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Cliente: <strong className={isDark ? 'text-slate-200' : 'text-slate-900'}>{cliente.nome}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl transition cursor-pointer ${
              isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-500'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Indicadores e Extrato */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar">
          {carregando ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
              <span className="text-xs font-semibold">Carregando extrato da caderneta...</span>
            </div>
          ) : (
            <>
              {/* Cards de Resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Limite Total</span>
                  <span className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                    {formatarMoeda(resumo?.limiteTotal || 0)}
                  </span>
                </div>

                <div className={`p-3 rounded-2xl border ${
                  (resumo?.saldoDevedor || 0) > 0
                    ? isDark ? 'bg-amber-950/20 border-amber-500/40 text-amber-400' : 'bg-amber-50 border-amber-300 text-amber-900'
                    : isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="text-[10px] font-bold block uppercase opacity-80">Saldo Devedor</span>
                  <span className="text-sm sm:text-base font-black">
                    {formatarMoeda(resumo?.saldoDevedor || 0)}
                  </span>
                </div>

                <div className={`p-3 rounded-2xl border ${isDark ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
                  <span className="text-[10px] font-bold block uppercase opacity-80">Disponível</span>
                  <span className="text-sm sm:text-base font-black">
                    {formatarMoeda(resumo?.limiteDisponivel || 0)}
                  </span>
                </div>

                <div className={`p-3 rounded-2xl border ${
                  resumo?.estaVencido
                    ? isDark ? 'bg-rose-950/30 border-rose-500/40 text-rose-400' : 'bg-rose-50 border-rose-300 text-rose-900'
                    : isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-900'
                }`}>
                  <span className="text-[10px] font-bold block uppercase opacity-80">Vencimento</span>
                  <span className="text-xs sm:text-sm font-black block truncate">
                    {resumo?.proximoVencimento ? new Date(resumo.proximoVencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '--'}
                  </span>
                  <span className="text-[9px] font-bold opacity-70">Todo dia {resumo?.diaVencimento}</span>
                </div>
              </div>

              {/* Botões de Ação do Lojista */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={(resumo?.saldoDevedor || 0) <= 0}
                  onClick={() => {
                    setValorAbatimento(resumo?.saldoDevedor || 0);
                    setModalAbatimentoAberto(true);
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md active:scale-98 disabled:opacity-40"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Registrar Pagamento / Abatimento</span>
                </button>

                {(cliente.whatsapp || cliente.telefone) && (
                  <button
                    type="button"
                    onClick={handleEnviarWhatsApp}
                    className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md active:scale-98"
                    title="Enviar Extrato no WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span className="hidden sm:inline">WhatsApp</span>
                  </button>
                )}
              </div>

              {/* Extrato de Linha do Tempo */}
              <div className="space-y-2 pt-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Histórico da Conta Corrente ({extrato.length} lançamentos)</span>
                </h3>

                {extrato.length === 0 ? (
                  <div className={`p-8 text-center rounded-2xl border text-xs font-semibold ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}>
                    Nenhuma movimentação registrada na caderneta deste cliente.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {extrato.map((lanc) => {
                      const ehCompra = lanc.tipo_lancamento === 'compra';
                      const ehPagamento = lanc.tipo_lancamento === 'pagamento';

                      return (
                        <div
                          key={lanc.id}
                          className={`p-3 rounded-2xl border flex items-center justify-between text-xs transition ${
                            isDark ? 'bg-slate-950 border-slate-800/80 hover:border-slate-700' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                ehCompra
                                  ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30'
                                  : 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                              }`}>
                                {ehCompra ? 'Compra' : ehPagamento ? 'Pagamento' : lanc.tipo_lancamento}
                              </span>
                              <span className="font-bold text-slate-800 dark:text-slate-200">{lanc.descricao}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                              <span>{new Date(lanc.criado_em || Date.now()).toLocaleDateString('pt-BR')} às {new Date(lanc.criado_em || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                              {lanc.forma_pagamento && (
                                <>
                                  <span>•</span>
                                  <span className="font-semibold text-slate-700 dark:text-slate-300">{lanc.forma_pagamento.nome}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <span className={`font-black text-sm block ${
                              ehCompra ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                            }`}>
                              {ehCompra ? '+' : '-'} {formatarMoeda(lanc.valor)}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 block">
                              Saldo: {formatarMoeda(lanc.saldo_posterior)}
                            </span>
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

        {/* Submodal de Abatimento / Pagamento */}
        {modalAbatimentoAberto && (
          <div className="fixed inset-0 z-60 bg-black/85 flex items-center justify-center p-4 animate-in fade-in">
            <div className={`w-full max-w-md rounded-3xl p-5 border shadow-2xl space-y-4 ${
              isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-black'
            }`}>
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm">Registrar Pagamento na Caderneta</h3>
                <button
                  type="button"
                  onClick={() => setModalAbatimentoAberto(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleConfirmarAbatimento} className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold block">Valor a Abater (R$)</label>
                  <div className={`flex items-center gap-1.5 border-2 rounded-xl px-3 py-2.5 focus-within:border-amber-500 ${
                    isDark ? 'bg-slate-950 border-slate-700' : 'bg-slate-50 border-slate-300'
                  }`}>
                    <span className="text-xs font-bold text-amber-500">R$</span>
                    <MoneyInput
                      autoFocus
                      value={valorAbatimento}
                      onChange={(v) => setValorAbatimento(v)}
                      mostrarPrefixo={false}
                      className={`w-full bg-transparent text-sm font-bold focus:outline-none ${isDark ? 'text-white' : 'text-black'}`}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400 pt-0.5">
                    <span>Saldo Devedor Total:</span>
                    <button
                      type="button"
                      onClick={() => setValorAbatimento(resumo?.saldoDevedor || 0)}
                      className="font-bold text-amber-500 hover:underline"
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
                    className={`w-full rounded-xl px-3 py-2.5 text-xs font-bold border-2 focus:outline-none ${
                      isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-black'
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
                    className="px-4 py-2 rounded-xl text-xs font-bold transition hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={salvandoAbatimento || valorAbatimento <= 0}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition cursor-pointer disabled:opacity-50"
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
