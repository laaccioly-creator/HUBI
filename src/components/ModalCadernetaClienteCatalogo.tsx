import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Clock,
  Loader2,
  CheckCircle2,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Receipt
} from 'lucide-react';
import { Cliente, CadernetaLancamento, Loja, Pedido } from '../types';
import { CadernetaService, ResumoCadernetaCliente } from '../services/cadernetaService';
import { formatarMoeda } from '../utils/formatters';
import { supabase } from '../lib/supabase';
import { ModalPagamentoFechamento } from './ModalPagamentoFechamento';
import { ReciboPedidoModal } from './pedidos/ReciboPedidoModal';

interface ModalCadernetaClienteCatalogoProps {
  isOpen: boolean;
  onClose: () => void;
  cliente: Cliente | null;
  loja: Loja | null;
  onAtualizado?: () => void;
}

export const ModalCadernetaClienteCatalogo: React.FC<ModalCadernetaClienteCatalogoProps> = ({
  isOpen,
  onClose,
  cliente,
  loja,
  onAtualizado
}) => {
  const [resumo, setResumo] = useState<ResumoCadernetaCliente | null>(null);
  const [extrato, setExtrato] = useState<CadernetaLancamento[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [itensExpandidosIds, setItensExpandidosIds] = useState<Record<string, boolean>>({});

  // Estado da etapa de pagamento/liquidação unificada
  const [modoPagamento, setModoPagamento] = useState<boolean>(false);
  const [pagamentoSucesso, setPagamentoSucesso] = useState<string | null>(null);
  const [pedidoReciboModal, setPedidoReciboModal] = useState<Pedido | null>(null);

  const carregarDados = async () => {
    if (!cliente?.id || !loja?.id) return;
    try {
      setCarregando(true);
      const [resumoData, extratoData] = await Promise.all([
        CadernetaService.obterResumoCliente(loja.id, cliente.id),
        CadernetaService.listarExtratoCliente(loja.id, cliente.id)
      ]);

      // Caso a loja opere com Fiado ou o cliente possua pedidos fiado em aberto ainda não listados
      let extratoCombinado = [...extratoData];
      let saldoCalculado = Number(resumoData?.saldoDevedor || 0);

      const { data: pedidosFiado } = await supabase
        .from('pedidos')
        .select('id, numero_pedido, valor_total, valor_pago, saldo_devedor, status, status_pagamento, eh_venda_caderneta, data_venda, criado_em, itens:itens_pedido(*)')
        .eq('loja_id', loja.id)
        .eq('cliente_id', cliente.id)
        .neq('status', 'cancelado')
        .or('eh_venda_caderneta.eq.true,status_pagamento.eq.fiado')
        .order('criado_em', { ascending: false });

      if (pedidosFiado && pedidosFiado.length > 0) {
        const idsNoExtrato = new Set(extratoCombinado.map((e) => e.pedido_id).filter(Boolean));
        let somaSaldoPedidosAbertos = 0;

        for (const p of pedidosFiado as any[]) {
          const saldoPed = Number(p.saldo_devedor ?? Math.max(0, Number(p.valor_total || 0) - Number(p.valor_pago || 0)));
          if (saldoPed > 0) {
            somaSaldoPedidosAbertos += saldoPed;
          }
          if (!idsNoExtrato.has(p.id)) {
            extratoCombinado.push({
              id: `ped-${p.id}`,
              loja_id: loja.id,
              cliente_id: cliente.id,
              pedido_id: p.id,
              tipo_lancamento: 'compra',
              valor: Number(p.valor_total || saldoPed || 0),
              saldo_anterior: 0,
              saldo_posterior: saldoPed,
              ciclo_referencia: CadernetaService.obterCicloReferenciaAtual(new Date(p.criado_em || p.data_venda || Date.now())),
              data_vencimento_ciclo: '',
              descricao: `Compra ref. Pedido #${p.numero_pedido || String(p.id).slice(0, 6)}`,
              criado_em: p.criado_em || p.data_venda || new Date().toISOString(),
              pedido: {
                numero_pedido: p.numero_pedido,
                valor_total: p.valor_total,
                data_venda: p.data_venda || p.criado_em,
                itens: p.itens || []
              } as any
            });
          }
        }

        if (somaSaldoPedidosAbertos > saldoCalculado) {
          saldoCalculado = Number(somaSaldoPedidosAbertos.toFixed(2));
        }
      }

      const saldoClienteCadastro = Math.max(
        Number(cliente.saldo_devedor_caderneta || 0),
        Number(cliente.saldo_devedor_fiado || 0)
      );
      if (saldoClienteCadastro > saldoCalculado && extratoCombinado.length === 0) {
        saldoCalculado = Number(saldoClienteCadastro.toFixed(2));
      }

      const limiteTotal = Number(
        resumoData?.limiteTotal ||
        cliente.limite_caderneta ||
        cliente.limite_credito ||
        0
      );

      setResumo({
        cliente: resumoData?.cliente || cliente,
        diaVencimento: resumoData?.diaVencimento || Number(cliente.dia_vencimento_caderneta || loja.dia_vencimento_padrao_caderneta || 10),
        proximoVencimento: resumoData?.proximoVencimento || '',
        estaVencido: Boolean(resumoData?.estaVencido),
        limiteTotal,
        saldoDevedor: saldoCalculado,
        limiteDisponivel: Math.max(0, Number((limiteTotal - saldoCalculado).toFixed(2)))
      });
      setExtrato(extratoCombinado);
    } catch (err) {
      console.error('[ModalCadernetaClienteCatalogo] Erro ao carregar extrato:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (isOpen && cliente?.id && loja?.id) {
      setModoPagamento(false);
      setPagamentoSucesso(null);
      carregarDados();
    }
  }, [isOpen, cliente?.id, loja?.id]);

  if (!isOpen || !cliente) return null;

  const saldoAtual = Number(resumo?.saldoDevedor || 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800">
        {/* Cabeçalho */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm sm:text-base leading-tight text-slate-900 dark:text-white">
                  {cliente.nome}
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  resumo?.estaVencido
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                    : saldoAtual > 0
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                }`}>
                  {resumo?.estaVencido ? 'Vencida' : saldoAtual > 0 ? 'Em Aberto' : 'Em Dia'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Caderneta Digital • <strong className="text-slate-700 dark:text-slate-200">{loja?.nome_fantasia || 'Mercadinho'}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Indicadores, Liquidação e Extrato */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar">
          {carregando ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              <span className="text-xs font-semibold">Carregando seu extrato da conta...</span>
            </div>
          ) : (
            <>
              {pagamentoSucesso && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>{pagamentoSucesso}</span>
                </div>
              )}

              {/* Cards de Resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block uppercase">Limite Total</span>
                  <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white font-mono">
                    {formatarMoeda(resumo?.limiteTotal || 0)}
                  </span>
                </div>

                <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block uppercase">Total em Aberto</span>
                  <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white font-mono">
                    {formatarMoeda(saldoAtual)}
                  </span>
                </div>

                <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block uppercase">Limite Disponível</span>
                  <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white font-mono">
                    {formatarMoeda(resumo?.limiteDisponivel || 0)}
                  </span>
                </div>

                <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block uppercase">Vencimento</span>
                  <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white block truncate">
                    {resumo?.proximoVencimento ? new Date(resumo.proximoVencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '--'}
                  </span>
                  <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">Todo dia {resumo?.diaVencimento || 10}</span>
                </div>
              </div>

              {/* Linha do Tempo de Compras e Pagamentos */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Extrato de Compras ({extrato.length})</span>
                  </h3>
                </div>

                {extrato.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-500">
                    Você não possui compras em aberto na sua conta.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {extrato.map((lanc) => {
                      const ehCompra = lanc.tipo_lancamento === 'compra';
                      const ehPendente = CadernetaService.ehLancamentoPendenteConferencia(lanc);
                      const ehRecusado = CadernetaService.ehLancamentoRecusado(lanc);
                      const itensCompra = ((lanc.pedido as any)?.itens || []) as any[];
                      const expandido = Boolean(itensExpandidosIds[lanc.id]);
                      const numeroPedidoExibicao = (lanc.pedido as any)?.numero_pedido
                        ? `Pedido #${(lanc.pedido as any).numero_pedido}`
                        : (lanc.descricao?.replace(/^Compra ref\.\s*/i, '').replace('[PENDENTE_CONFERENCIA]', '').replace('[RECUSADO]', '').trim() || 'Lançamento');
                      const dataHoraExibicao = `${new Date(lanc.criado_em || Date.now()).toLocaleDateString('pt-BR')} ${new Date(lanc.criado_em || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

                      return (
                        <div
                          key={lanc.id}
                          className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2 text-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                              <span className="text-xs font-semibold font-mono text-slate-600 dark:text-slate-300 shrink-0">
                                {dataHoraExibicao}
                              </span>
                              <span className="font-black text-sm text-slate-900 dark:text-white truncate">
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
                              <span className={`text-sm sm:text-base font-mono ${
                                ehRecusado
                                  ? 'line-through opacity-50 font-normal'
                                  : ehPendente
                                    ? 'text-amber-600 dark:text-amber-400 font-bold'
                                    : ehCompra
                                      ? 'text-slate-900 dark:text-slate-100 font-normal'
                                      : 'text-emerald-600 dark:text-emerald-400 font-bold'
                              }`}>
                                {ehCompra ? '' : '- '}{formatarMoeda(lanc.valor)}
                              </span>

                              {ehCompra && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {lanc.pedido_id && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        let pedAlvo = lanc.pedido;
                                        if (!pedAlvo || !pedAlvo.itens || pedAlvo.itens.length === 0) {
                                          try {
                                            const [resPed, resItens, resPags] = await Promise.all([
                                              supabase.from('pedidos').select('*').eq('id', lanc.pedido_id).eq('loja_id', loja?.id).single(),
                                              supabase.from('itens_pedido').select('*').eq('pedido_id', lanc.pedido_id).eq('loja_id', loja?.id),
                                              supabase.from('pagamentos_pedido').select('*, forma_pagamento:formas_pagamento(*)').eq('pedido_id', lanc.pedido_id).eq('loja_id', loja?.id)
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
                                      className="px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 transition cursor-pointer shadow-2xs"
                                      title="Visualizar Recibo do Pedido"
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
                                    className="px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition cursor-pointer"
                                  >
                                    <span>Detalhar</span>
                                    {expandido ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Detalhamento Condicional de Itens da Compra */}
                          {ehCompra && expandido && itensCompra.length > 0 && (
                            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 space-y-1.5 animate-in fade-in duration-150">
                              <div className="grid grid-cols-1 gap-1.5">
                                {itensCompra.map((it: any, idx: number) => (
                                  <div key={it.id || idx} className="flex items-center justify-between text-[13px] text-slate-800 dark:text-slate-200">
                                    <span className="truncate pr-2">
                                      <strong className="font-black text-slate-900 dark:text-white">{Math.round(Number(it.quantidade || 1))}x</strong> {it.nome_produto || 'Produto'}
                                      {it.rotulo_variacao ? ` (${it.rotulo_variacao})` : ''}
                                    </span>
                                    <span className="font-mono font-bold text-slate-900 dark:text-white shrink-0">
                                      {formatarMoeda(Number(it.subtotal || Number(it.preco_venda_unitario || it.preco_unitario || 0) * Number(it.quantidade || 1)))}
                                    </span>
                                  </div>
                                ))}
                              </div>
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

        {/* Rodapé com botão de ação rápida para liquidar */}
        <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center sm:text-left">
            Saldo devedor consolidado: <strong className="text-slate-900 dark:text-white">{formatarMoeda(saldoAtual)}</strong>
          </p>
          {saldoAtual > 0 && (
            <button
              type="button"
              onClick={() => {
                setPagamentoSucesso(null);
                setModoPagamento(true);
              }}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Pagar / Liquidar Conta</span>
            </button>
          )}
        </div>

        {/* Modal Oficial Unificado de Pagamento / Liquidação da Caderneta */}
        {modoPagamento && (
          <ModalPagamentoFechamento
            isOpen={modoPagamento}
            onClose={() => setModoPagamento(false)}
            loja={loja}
            cliente={cliente}
            pedido={null}
            saldoDevedorAvulso={saldoAtual}
            origem="caderneta"
            onPagamentoConcluido={async () => {
              setModoPagamento(false);
              setPagamentoSucesso('Operação de pagamento na caderneta concluída!');
              await carregarDados();
              onAtualizado?.();
            }}
          />
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
