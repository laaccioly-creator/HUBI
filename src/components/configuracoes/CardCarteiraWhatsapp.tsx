import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  Gift,
  History,
  Loader2,
  MessageSquare,
  PlusCircle,
  RefreshCw,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Loja, LojaWhatsappTransacao } from '../../types';
import { whatsappWalletService } from '../../services/whatsappWalletService';
import { formatarMoeda as formatCurrency } from '../../utils/formatters';
import { ModalRecargaWhatsapp } from './ModalRecargaWhatsapp';
import { useTheme } from '../../contexts/ThemeContext';

interface CardCarteiraWhatsappProps {
  loja: Loja;
  usuarioId?: string | null;
  aoAtualizarLoja?: (parcial: Partial<Loja>) => void;
}

const ITENS_POR_PAGINA = 6;

export const CardCarteiraWhatsapp: React.FC<CardCarteiraWhatsappProps> = ({
  loja,
  usuarioId,
  aoAtualizarLoja,
}) => {
  const { isDark } = useTheme();
  const [saldo, setSaldo] = useState<number>(Number(loja.whatsapp_saldo ?? 2.0));
  const [autoAtivo, setAutoAtivo] = useState<boolean>(
    Boolean(loja.whatsapp_auto_ativo ?? false)
  );
  const [bonusExpiraEm, setBonusExpiraEm] = useState<string | null>(
    loja.whatsapp_bonus_expira_em ?? null
  );
  const [alertaSaldoBaixo, setAlertaSaldoBaixo] = useState<number>(
    Number(loja.whatsapp_alerta_saldo_baixo ?? 5.0)
  );
  const [custoDisparo, setCustoDisparo] = useState<number>(0.15);
  const [valorMinimoRecarga, setValorMinimoRecarga] = useState<number>(10.0);
  const [temRecargaPaga, setTemRecargaPaga] = useState<boolean>(false);

  const [transacoes, setTransacoes] = useState<LojaWhatsappTransacao[]>([]);
  const [totalTransacoes, setTotalTransacoes] = useState<number>(0);
  const [pagina, setPagina] = useState<number>(1);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvandoSwitch, setSalvandoSwitch] = useState<boolean>(false);
  const [modalRecargaAberto, setModalRecargaAberto] = useState<boolean>(false);
  const [mensagemFeedback, setMensagemFeedback] = useState<string | null>(null);

  const carregarDadosCarteira = useCallback(
    async (pagAtual = pagina) => {
      if (!loja?.id) return;
      setCarregando(true);
      try {
        const [resumo, extrato] = await Promise.all([
          whatsappWalletService.obterResumoCarteiraLoja(loja.id),
          whatsappWalletService.listarExtratoCarteira(
            loja.id,
            pagAtual,
            ITENS_POR_PAGINA
          ),
        ]);

        setSaldo(resumo.saldo);
        setAutoAtivo(resumo.autoAtivo);
        setBonusExpiraEm(resumo.bonusExpiraEm);
        setAlertaSaldoBaixo(resumo.alertaSaldoBaixo);
        setCustoDisparo(resumo.custoDisparo);
        setValorMinimoRecarga(resumo.valorMinimoRecarga);
        setTemRecargaPaga(resumo.temRecargaPaga);

        setTransacoes(extrato.transacoes);
        setTotalTransacoes(extrato.total);
      } finally {
        setCarregando(false);
      }
    },
    [loja?.id, pagina]
  );

  useEffect(() => {
    carregarDadosCarteira(pagina);
  }, [carregarDadosCarteira, pagina]);

  const carregarDadosRef = useRef(carregarDadosCarteira);
  const aoAtualizarLojaRef = useRef(aoAtualizarLoja);
  const autoAtivoRef = useRef(autoAtivo);

  useEffect(() => {
    carregarDadosRef.current = carregarDadosCarteira;
    aoAtualizarLojaRef.current = aoAtualizarLoja;
    autoAtivoRef.current = autoAtivo;
  }, [carregarDadosCarteira, aoAtualizarLoja, autoAtivo]);

  // Assinatura Realtime para manter saldo e extrato sincronizados em tempo real
  useEffect(() => {
    if (!loja?.id) return;

    const sufixoUnico = Math.random().toString(36).substring(2, 9);
    const nomeCanal = `carteira_whatsapp_loja_${loja.id}_${sufixoUnico}`;
    let canal: ReturnType<typeof supabase.channel> | null = null;

    try {
      canal = supabase
        .channel(nomeCanal)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'loja_whatsapp_transacoes',
            filter: `loja_id=eq.${loja.id}`,
          },
          () => {
            carregarDadosRef.current(1);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'lojas',
            filter: `id=eq.${loja.id}`,
          },
          (payload: { new: Record<string, unknown> }) => {
            const novo = payload.new as {
              whatsapp_saldo?: number;
              whatsapp_auto_ativo?: boolean;
            };
            if (typeof novo.whatsapp_saldo === 'number') {
              setSaldo(Number(novo.whatsapp_saldo));
              aoAtualizarLojaRef.current?.({
                whatsapp_saldo: Number(novo.whatsapp_saldo),
                whatsapp_auto_ativo: Boolean(
                  novo.whatsapp_auto_ativo ?? autoAtivoRef.current
                ),
              });
            }
          }
        )
        .subscribe();
    } catch {
      // Evita falha de renderização caso o canal Realtime já esteja inscrito
    }

    return () => {
      if (canal) {
        supabase.removeChannel(canal).catch(() => {});
      }
    };
  }, [loja?.id]);

  const handleToggleAutomacao = async () => {
    const novoEstado = !autoAtivo;
    setSalvandoSwitch(true);
    setMensagemFeedback(null);
    try {
      await whatsappWalletService.alternarAutomacaoWhatsapp(loja.id, novoEstado);
      setAutoAtivo(novoEstado);
      aoAtualizarLoja?.({ whatsapp_auto_ativo: novoEstado });
      setMensagemFeedback(
        novoEstado
          ? 'Envios automáticos via WhatsApp ativados com sucesso!'
          : 'Envios automáticos pausados. O sistema usará o botão de envio manual gratuito.'
      );
      setTimeout(() => setMensagemFeedback(null), 4000);
    } catch (e) {
      setMensagemFeedback(
        e instanceof Error
          ? e.message
          : 'Não foi possível alterar o modo de envio automático.'
      );
    } finally {
      setSalvandoSwitch(false);
    }
  };

  const disparosEstimados =
    custoDisparo > 0 ? Math.floor(saldo / custoDisparo) : 0;

  const totalPaginas = Math.max(
    1,
    Math.ceil(totalTransacoes / ITENS_POR_PAGINA)
  );

  // Calcula dias restantes do bônus de 7 dias se ainda não fez recarga paga
  const infoBonusTrial = (() => {
    if (temRecargaPaga || !bonusExpiraEm || saldo <= 0) return null;
    const dataExp = new Date(bonusExpiraEm);
    const diffMs = dataExp.getTime() - Date.now();
    if (diffMs <= 0) {
      return {
        expirado: true,
        texto: 'Período do bônus inicial de 7 dias encerrado.',
      };
    }
    const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return {
      expirado: false,
      texto: `Bônus de degustação válido por mais ${diasRestantes} ${
        diasRestantes === 1 ? 'dia' : 'dias'
      } (${dataExp.toLocaleDateString('pt-BR')}).`,
    };
  })();

  const formatarRotuloTipo = (tx: LojaWhatsappTransacao) => {
    switch (tx.tipo) {
      case 'bonus_inicial':
        return {
          label: 'Bônus Trial',
          cor: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
          positivo: true,
        };
      case 'recarga_pix':
        return {
          label:
            tx.status_pagamento === 'pendente'
              ? 'Recarga Pix (Pendente)'
              : 'Recarga Pix',
          cor:
            tx.status_pagamento === 'pendente'
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          positivo: true,
        };
      case 'estorno':
        return {
          label: 'Estorno',
          cor: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
          positivo: true,
        };
      case 'expiracao_bonus':
        return {
          label: 'Expiração Bônus',
          cor: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
          positivo: false,
        };
      case 'consumo_disparo':
      default:
        return {
          label: 'Disparo Automático',
          cor: isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200',
          positivo: false,
        };
    }
  };

  return (
    <div className={`rounded-2xl border p-5 space-y-5 shadow-xl transition-colors ${
      isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
    }`}>
      {/* Topo: Título + Switch Ativar Envios Automáticos via WhatsApp */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b ${
        isDark ? 'border-slate-800' : 'border-slate-200'
      }`}>
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 dark:text-emerald-400 shrink-0">
            <Wallet size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`text-base font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Carteira Pré-Paga & Motor Híbrido WhatsApp
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                Cloud API + Fallback Gratuito
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Envie recibos de PDV, status de pedidos, rastreio e comprovantes de Caderneta automaticamente em 2º plano.
            </p>
          </div>
        </div>

        {/* Switch Ativar Envios Automáticos via WhatsApp */}
        <div className={`flex items-center justify-between sm:justify-end gap-3 px-3.5 py-2.5 rounded-xl border shrink-0 ${
          isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="text-right">
            <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Ativar Envios Automáticos via WhatsApp
            </div>
            <div className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {autoAtivo
                ? 'Ativo (API Oficial + Fallback)'
                : 'Desativado (Apenas Botão Manual)'}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoAtivo}
            disabled={salvandoSwitch}
            onClick={handleToggleAutomacao}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              autoAtivo ? 'bg-emerald-600' : isDark ? 'bg-slate-700' : 'bg-slate-300'
            } ${salvandoSwitch ? 'opacity-60' : ''}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                autoAtivo ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {mensagemFeedback && (
        <div className="px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-600 dark:text-emerald-300 font-medium">
          {mensagemFeedback}
        </div>
      )}

      {/* Cards de Métricas da Carteira */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Saldo Disponível */}
        <div className={`rounded-2xl border p-4 flex flex-col justify-between ${
          isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${
              isDark ? 'text-slate-400' : 'text-slate-600'
            }`}>
              Saldo Disponível
            </span>
            {saldo <= alertaSaldoBaixo && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-[10px] font-bold">
                <AlertTriangle size={11} />
                Saldo Baixo
              </span>
            )}
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
              {formatCurrency(saldo)}
            </div>
            {infoBonusTrial && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-300/90 mt-1 font-semibold">
                <Gift size={12} className="shrink-0" />
                <span>{infoBonusTrial.texto}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setModalRecargaAberto(true)}
            className="w-full mt-2 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <PlusCircle size={15} />
            Recarregar Saldo
          </button>
        </div>

        {/* Card 2: Estimativa de Disparos Restantes */}
        <div className={`rounded-2xl border p-4 flex flex-col justify-between ${
          isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${
              isDark ? 'text-slate-400' : 'text-slate-600'
            }`}>
              Capacidade Estimada
            </span>
            <MessageSquare size={15} className="text-emerald-500 dark:text-emerald-400" />
          </div>
          <div className="my-2">
            <div className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
              ~{disparosEstimados}{' '}
              <span className={`text-xs font-bold uppercase ${
                isDark ? 'text-slate-300' : 'text-slate-700'
              }`}>
                disparos ativos
              </span>
            </div>
            <p className={`text-[11px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Tarifa de{' '}
              <strong className={isDark ? 'text-slate-200' : 'text-slate-800'}>
                {formatCurrency(custoDisparo)}
              </strong>{' '}
              por notificação ativa fora da janela de 24h.
            </p>
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
            <Sparkles size={12} />
            Respostas em até 24h têm custo R$ 0,00!
          </div>
        </div>

        {/* Card 3: Como Funciona o Motor Híbrido */}
        <div className={`rounded-2xl border p-4 flex flex-col justify-between space-y-2 ${
          isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${
              isDark ? 'text-slate-400' : 'text-slate-600'
            }`}>
              Inteligência de Rotas (3 Níveis)
            </span>
            <Clock size={15} className="text-sky-500 dark:text-sky-400" />
          </div>
          <ul className={`text-[11px] space-y-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            <li className="flex items-start gap-1.5">
              <span className="text-emerald-500 dark:text-emerald-400 font-black">1.</span>
              <span>
                <strong className={isDark ? 'text-white' : 'text-slate-900'}>Janela 24h Aberta:</strong> Se o cliente interagiu nas últimas 24h, o envio automático sai a <strong className={isDark ? 'text-white' : 'text-slate-900'}>custo zero</strong>.
              </span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-sky-500 dark:text-sky-400 font-black">2.</span>
              <span>
                <strong className={isDark ? 'text-white' : 'text-slate-900'}>Fora da Janela 24h:</strong> Dispara template oficial debitando {formatCurrency(custoDisparo)} do saldo.
              </span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-amber-500 dark:text-amber-400 font-black">3.</span>
              <span>
                <strong className={isDark ? 'text-white' : 'text-slate-900'}>Fallback Gratuito:</strong> Sem saldo ou desligado, exibe o botão manual do WhatsApp sem travar a operação.
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Tabela de Extrato de Transações (loja_whatsapp_transacoes) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={16} className={isDark ? 'text-slate-400' : 'text-slate-500'} />
            <h4 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
              Extrato Auditável da Carteira ({totalTransacoes})
            </h4>
          </div>
          <button
            type="button"
            onClick={() => carregarDadosCarteira(pagina)}
            className={`text-xs flex items-center gap-1 transition-colors cursor-pointer ${
              isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900 font-medium'
            }`}
          >
            <RefreshCw size={13} className={carregando ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>

        <div className={`rounded-xl border overflow-hidden ${
          isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
        }`}>
          {carregando ? (
            <div className={`py-8 flex items-center justify-center gap-2 text-xs ${
              isDark ? 'text-slate-400' : 'text-slate-600'
            }`}>
              <Loader2 size={16} className="animate-spin text-emerald-500" />
              Carregando movimentações da carteira...
            </div>
          ) : transacoes.length === 0 ? (
            <div className={`py-8 text-center text-xs font-medium ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              Nenhuma transação registrada na carteira desta loja até o momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={`border-b text-[10px] font-black uppercase tracking-wider ${
                    isDark
                      ? 'border-slate-800 text-slate-400 bg-slate-950'
                      : 'border-slate-200 text-slate-700 bg-white'
                  }`}>
                    <th className="py-2.5 px-3">Data / Hora</th>
                    <th className="py-2.5 px-3">Tipo</th>
                    <th className="py-2.5 px-3">Descrição / Gatilho</th>
                    <th className="py-2.5 px-3 text-right">Valor</th>
                    <th className="py-2.5 px-3 text-right">Saldo Após</th>
                  </tr>
                </thead>
                <tbody className={`divide-y text-xs ${
                  isDark ? 'divide-slate-800/70' : 'divide-slate-200'
                }`}>
                  {transacoes.map((tx) => {
                    const infoTipo = formatarRotuloTipo(tx);
                    return (
                      <tr
                        key={tx.id}
                        className={`transition-colors ${
                          isDark ? 'hover:bg-slate-900/50' : 'hover:bg-white'
                        }`}
                      >
                        <td className={`py-2.5 px-3 whitespace-nowrap text-[11px] ${
                          isDark ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          {new Date(tx.criado_em).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${infoTipo.cor}`}
                          >
                            {infoTipo.positivo ? (
                              <ArrowUpRight size={11} />
                            ) : (
                              <ArrowDownRight size={11} />
                            )}
                            {infoTipo.label}
                          </span>
                        </td>
                        <td className={`py-2.5 px-3 max-w-xs truncate ${
                          isDark ? 'text-slate-300' : 'text-slate-800 font-medium'
                        }`}>
                          {tx.descricao || tx.evento_gatilho || 'Movimentação'}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${
                            tx.valor >= 0
                              ? isDark ? 'text-emerald-400' : 'text-emerald-600'
                              : isDark ? 'text-rose-400' : 'text-rose-600'
                          }`}
                        >
                          {tx.valor >= 0 ? '+' : ''}
                          {formatCurrency(tx.valor)}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-semibold whitespace-nowrap ${
                          isDark ? 'text-slate-300' : 'text-slate-800'
                        }`}>
                          {formatCurrency(tx.saldo_posterior)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginação */}
          {totalPaginas > 1 && (
            <div className={`flex items-center justify-between px-3 py-2 border-t text-[11px] ${
              isDark
                ? 'border-slate-800 bg-slate-950 text-slate-400'
                : 'border-slate-200 bg-white text-slate-600'
            }`}>
              <span>
                Página {pagina} de {totalPaginas}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={pagina <= 1}
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  className={`p-1 rounded disabled:opacity-40 cursor-pointer ${
                    isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  disabled={pagina >= totalPaginas}
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  className={`p-1 rounded disabled:opacity-40 cursor-pointer ${
                    isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Recarga via Pix */}
      <ModalRecargaWhatsapp
        aberto={modalRecargaAberto}
        aoFechar={() => setModalRecargaAberto(false)}
        loja={loja}
        usuarioId={usuarioId}
        custoDisparo={custoDisparo}
        valorMinimoRecarga={valorMinimoRecarga}
        aoConcluirRecarga={(novoSaldo) => {
          setSaldo(novoSaldo);
          setAutoAtivo(true);
          setTemRecargaPaga(true);
          aoAtualizarLoja?.({
            whatsapp_saldo: novoSaldo,
            whatsapp_auto_ativo: true,
          });
          carregarDadosCarteira(1);
        }}
      />
    </div>
  );
};
