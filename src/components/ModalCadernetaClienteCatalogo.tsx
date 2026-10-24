import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  FileText,
  Clock,
  Loader2,
  CheckCircle2,
  DollarSign,
  Copy,
  Check,
  QrCode,
  CreditCard,
  Banknote,
  ShoppingBag,
  ArrowLeft
} from 'lucide-react';
import { Cliente, CadernetaLancamento, Loja } from '../types';
import { CadernetaService, ResumoCadernetaCliente } from '../services/cadernetaService';
import { formatarMoeda } from '../utils/formatters';
import { supabase } from '../lib/supabase';

interface ModalCadernetaClienteCatalogoProps {
  isOpen: boolean;
  onClose: () => void;
  cliente: Cliente | null;
  loja: Loja | null;
  onAtualizado?: () => void;
}

interface MetodoPagamentoAtivo {
  id: string;
  tipo: 'pix' | 'dinheiro' | 'cartao_debito' | 'cartao_credito' | 'mercado_pago';
  nome: string;
  descricao: string;
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

  // Estado da etapa de pagamento/liquidação
  const [modoPagamento, setModoPagamento] = useState<boolean>(false);
  const [metodoSelecionado, setMetodoSelecionado] = useState<string>('');
  const [valorPagamento, setValorPagamento] = useState<string>('');
  const [processandoPagamento, setProcessandoPagamento] = useState<boolean>(false);
  const [pagamentoSucesso, setPagamentoSucesso] = useState<string | null>(null);
  const [erroPagamento, setErroPagamento] = useState<string | null>(null);
  const [pixCopiado, setPixCopiado] = useState<boolean>(false);

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
        .select('id, numero_pedido, valor_total, valor_pago, saldo_devedor, status, status_pagamento, eh_venda_fiado, eh_venda_caderneta, data_venda, criado_em, itens:itens_pedido(*)')
        .eq('loja_id', loja.id)
        .eq('cliente_id', cliente.id)
        .neq('status', 'cancelado')
        .or('eh_venda_fiado.eq.true,eh_venda_caderneta.eq.true,status_pagamento.eq.fiado')
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
      setValorPagamento(saldoCalculado > 0 ? saldoCalculado.toFixed(2) : '');
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
      setErroPagamento(null);
      carregarDados();
    }
  }, [isOpen, cliente?.id, loja?.id]);

  // Opções de pagamento ativas na loja (NUNCA inclui caderneta nem fiado)
  const metodosPagamentoAtivos = useMemo<MetodoPagamentoAtivo[]>(() => {
    const pagConfig = (loja?.configuracoes_extras as any)?.pagamentos || {};
    const pagDigitais = (loja?.configuracoes_extras as any)?.pagamentos_digitais || {};
    const lista: MetodoPagamentoAtivo[] = [];

    if (pagConfig.pix_ativo ?? true) {
      lista.push({
        id: 'pix',
        tipo: 'pix',
        nome: 'Pix Manual',
        descricao: pagConfig.pix_chave || (loja as any)?.chave_pix
          ? `Chave: ${pagConfig.pix_chave || (loja as any)?.chave_pix}`
          : 'Transferência instantânea via Pix'
      });
    }

    if (pagDigitais?.mercado_pago?.ativo) {
      lista.push({
        id: 'mercado_pago',
        tipo: 'mercado_pago',
        nome: 'Mercado Pago (Online)',
        descricao: 'Pix ou Cartão via checkout digital'
      });
    }

    if (pagConfig.debito_ativo ?? true) {
      lista.push({
        id: 'cartao_debito',
        tipo: 'cartao_debito',
        nome: 'Cartão de Débito (Maquininha)',
        descricao: 'Pagamento presencial na maquininha da loja'
      });
    }

    if (pagConfig.credito_ativo ?? true) {
      lista.push({
        id: 'cartao_credito',
        tipo: 'cartao_credito',
        nome: 'Cartão de Crédito (Maquininha)',
        descricao: 'Pagamento presencial na maquininha da loja'
      });
    }

    if (pagConfig.dinheiro_ativo ?? true) {
      lista.push({
        id: 'dinheiro',
        tipo: 'dinheiro',
        nome: 'Dinheiro',
        descricao: 'Pagamento em espécie no balcão ou portador'
      });
    }

    return lista;
  }, [loja]);

  useEffect(() => {
    if (metodosPagamentoAtivos.length > 0 && !metodoSelecionado) {
      setMetodoSelecionado(metodosPagamentoAtivos[0].id);
    }
  }, [metodosPagamentoAtivos, metodoSelecionado]);

  if (!isOpen || !cliente) return null;

  const pagConfig = (loja?.configuracoes_extras as any)?.pagamentos || {};
  const chavePixLoja = pagConfig.pix_chave || (loja as any)?.chave_pix || '';
  const orientacoesPixLoja = pagConfig.pix_orientacoes || '';
  const saldoAtual = Number(resumo?.saldoDevedor || 0);

  const handleCopiarPix = async () => {
    if (!chavePixLoja) return;
    try {
      await navigator.clipboard.writeText(chavePixLoja);
      setPixCopiado(true);
      setTimeout(() => setPixCopiado(false), 2500);
    } catch {
      // fallback silencioso
    }
  };

  const handleConfirmarLiquidacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id || !cliente?.id) return;

    const valorNum = Number(String(valorPagamento).replace(',', '.'));
    if (isNaN(valorNum) || valorNum <= 0) {
      setErroPagamento('Informe um valor válido maior que zero para liquidar.');
      return;
    }
    if (valorNum > saldoAtual + 0.01) {
      setErroPagamento('O valor informado não pode ser maior que o saldo devedor atual.');
      return;
    }

    const metodoObj = metodosPagamentoAtivos.find((m) => m.id === metodoSelecionado);
    if (!metodoObj) {
      setErroPagamento('Selecione uma forma de pagamento ativa.');
      return;
    }

    try {
      setProcessandoPagamento(true);
      setErroPagamento(null);

      // Busca ID correspondente em formas_pagamento da loja (garantindo que nunca seja caderneta/fiado)
      const { data: formasBanco } = await supabase
        .from('formas_pagamento')
        .select('id, nome, tipo')
        .eq('loja_id', loja.id)
        .eq('ativo', true);

      const formaBanco = (formasBanco || []).find((f: any) => {
        const tipoLower = (f.tipo || '').toLowerCase();
        const nomeLower = (f.nome || '').toLowerCase();
        if (tipoLower === 'fiado' || tipoLower === 'caderneta' || nomeLower.includes('caderneta') || nomeLower.includes('fiado')) {
          return false;
        }
        if (metodoObj.tipo === 'pix') return tipoLower === 'pix' || nomeLower.includes('pix');
        if (metodoObj.tipo === 'dinheiro') return tipoLower === 'dinheiro' || nomeLower.includes('dinheiro');
        if (metodoObj.tipo === 'cartao_debito') return tipoLower === 'cartao_debito' || nomeLower.includes('débito') || nomeLower.includes('debito');
        if (metodoObj.tipo === 'cartao_credito') return tipoLower === 'cartao_credito' || nomeLower.includes('crédito') || nomeLower.includes('credito');
        return false;
      });

      await CadernetaService.registrarPagamentoCaderneta({
        lojaId: loja.id,
        clienteId: cliente.id,
        valorPago: valorNum,
        formaPagamentoId: formaBanco?.id || metodoObj.id,
        formaTipo: metodoObj.tipo,
        observacoes: `Liquidação pelo Catálogo Online (${metodoObj.nome})`
      });

      // Também abate saldo_devedor_fiado caso o cliente estivesse com saldo em fiado
      if (Number(cliente.saldo_devedor_fiado || 0) > 0) {
        const novoSaldoFiado = Math.max(0, Number((Number(cliente.saldo_devedor_fiado || 0) - valorNum).toFixed(2)));
        await supabase
          .from('clientes')
          .update({ saldo_devedor_fiado: novoSaldoFiado })
          .eq('id', cliente.id)
          .eq('loja_id', loja.id);
      }

      setPagamentoSucesso(
        `Pagamento de ${formatarMoeda(valorNum)} via ${metodoObj.nome} registrado com sucesso!`
      );
      setModoPagamento(false);
      await carregarDados();
      onAtualizado?.();
    } catch (err: any) {
      setErroPagamento(err?.message || 'Não foi possível registrar o pagamento da conta.');
    } finally {
      setProcessandoPagamento(false);
    }
  };

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
              <h2 className="font-black text-sm sm:text-base leading-tight">Minha Conta</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Extrato do ciclo em aberto • <strong className="text-slate-900 dark:text-slate-200">{loja?.nome_fantasia || 'Mercadinho'}</strong>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!carregando && saldoAtual > 0 && !modoPagamento && (
              <button
                type="button"
                onClick={() => {
                  setErroPagamento(null);
                  setPagamentoSucesso(null);
                  setValorPagamento(saldoAtual.toFixed(2));
                  setModoPagamento(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition cursor-pointer active:scale-95"
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Pagar / Liquidar Conta</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
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
                <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Limite Total</span>
                  <span className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                    {formatarMoeda(resumo?.limiteTotal || 0)}
                  </span>
                </div>

                <div className={`p-3 rounded-2xl border ${
                  saldoAtual > 0
                    ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-400'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                }`}>
                  <span className="text-[10px] font-bold block uppercase opacity-80">Saldo Devedor</span>
                  <span className="text-sm sm:text-base font-black">
                    {formatarMoeda(saldoAtual)}
                  </span>
                </div>

                <div className="p-3 rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-400">
                  <span className="text-[10px] font-bold block uppercase opacity-80">Disponível</span>
                  <span className="text-sm sm:text-base font-black">
                    {formatarMoeda(resumo?.limiteDisponivel || 0)}
                  </span>
                </div>

                <div className={`p-3 rounded-2xl border ${
                  resumo?.estaVencido
                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-500/40 text-rose-900 dark:text-rose-400'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-200'
                }`}>
                  <span className="text-[10px] font-bold block uppercase opacity-80">Vencimento</span>
                  <span className="text-xs sm:text-sm font-black block truncate">
                    {resumo?.proximoVencimento ? new Date(resumo.proximoVencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '--'}
                  </span>
                  <span className="text-[9px] font-bold opacity-70">Todo dia {resumo?.diaVencimento || 10}</span>
                </div>
              </div>

              {/* Etapa de Liquidação da Conta */}
              {modoPagamento && saldoAtual > 0 ? (
                <form
                  onSubmit={handleConfirmarLiquidacao}
                  className="p-4 rounded-2xl border-2 border-emerald-500/40 bg-slate-50 dark:bg-slate-950 space-y-4 animate-in fade-in"
                >
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div>
                      <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        Pagar / Liquidar Conta
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Escolha uma das opções de pagamento ativas na loja para quitar seu saldo
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModoPagamento(false)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Voltar ao Extrato</span>
                    </button>
                  </div>

                  {erroPagamento && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-500/40 text-xs font-bold text-rose-700 dark:text-rose-300">
                      {erroPagamento}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 block">
                      Valor a Pagar (R$)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={saldoAtual}
                        required
                        value={valorPagamento}
                        onChange={(e) => setValorPagamento(e.target.value)}
                        className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-black text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => setValorPagamento(saldoAtual.toFixed(2))}
                        className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-black text-slate-800 dark:text-slate-200 transition cursor-pointer"
                      >
                        Valor Total ({formatarMoeda(saldoAtual)})
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 block">
                      Meio de Pagamento (Opções Ativas da Loja)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {metodosPagamentoAtivos.map((m) => {
                        const selecionado = metodoSelecionado === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setMetodoSelecionado(m.id)}
                            className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
                              selecionado
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500'
                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
                            }`}
                          >
                            <div className="mt-0.5 shrink-0">
                              {m.tipo === 'pix' ? (
                                <QrCode className="w-4 h-4 text-emerald-500" />
                              ) : m.tipo === 'dinheiro' ? (
                                <Banknote className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <CreditCard className="w-4 h-4 text-emerald-500" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-black block truncate">{m.nome}</span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                                {m.descricao}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Instruções Pix se selecionado */}
                  {metodoSelecionado === 'pix' && chavePixLoja && (
                    <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                            Chave Pix da Loja
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-900 dark:text-white break-all">
                            {chavePixLoja}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopiarPix}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                        >
                          {pixCopiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{pixCopiado ? 'Copiada!' : 'Copiar Chave'}</span>
                        </button>
                      </div>
                      {orientacoesPixLoja && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-300">
                          {orientacoesPixLoja}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setModoPagamento(false)}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={processandoPagamento}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow transition cursor-pointer"
                    >
                      {processandoPagamento ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      <span>Confirmar Liquidação</span>
                    </button>
                  </div>
                </form>
              ) : (
                /* Linha do Tempo de Compras e Pagamentos */
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Extrato de Compras do Ciclo ({extrato.length})</span>
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
                        const ehPagamento = lanc.tipo_lancamento === 'pagamento';
                        const itensCompra = ((lanc.pedido as any)?.itens || []) as any[];

                        return (
                          <div
                            key={lanc.id}
                            className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2 text-xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                    ehCompra
                                      ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                                      : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                  }`}>
                                    {ehCompra ? 'Compra' : ehPagamento ? 'Pagamento' : lanc.tipo_lancamento}
                                  </span>
                                  <span className="font-bold text-slate-900 dark:text-slate-100">{lanc.descricao}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                  <span>
                                    {new Date(lanc.criado_em || Date.now()).toLocaleDateString('pt-BR')} às{' '}
                                    {new Date(lanc.criado_em || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  {lanc.forma_pagamento && (
                                    <>
                                      <span>•</span>
                                      <span className="font-semibold text-slate-700 dark:text-slate-300">{lanc.forma_pagamento.nome}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="text-right shrink-0">
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

                            {/* Detalhamento de Itens da Compra */}
                            {ehCompra && itensCompra.length > 0 && (
                              <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                                  <ShoppingBag className="w-3 h-3 text-emerald-500" />
                                  <span>Itens da Compra:</span>
                                </span>
                                <div className="grid grid-cols-1 gap-1 pl-1">
                                  {itensCompra.map((it: any, idx: number) => (
                                    <div key={it.id || idx} className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                                      <span className="truncate pr-2">
                                        <strong className="font-black">{Math.round(Number(it.quantidade || 1))}x</strong> {it.nome_produto || 'Produto'}
                                      </span>
                                      <span className="font-bold shrink-0">
                                        {formatarMoeda(Number(it.subtotal || Number(it.preco_unitario || 0) * Number(it.quantidade || 1)))}
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
              )}
            </>
          )}
        </div>

        {/* Rodapé com botão de ação rápida para liquidar */}
        <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center sm:text-left">
            Saldo devedor consolidado: <strong className="text-slate-900 dark:text-white">{formatarMoeda(saldoAtual)}</strong>
          </p>
          {saldoAtual > 0 && !modoPagamento && (
            <button
              type="button"
              onClick={() => {
                setErroPagamento(null);
                setPagamentoSucesso(null);
                setValorPagamento(saldoAtual.toFixed(2));
                setModoPagamento(true);
              }}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Pagar / Liquidar Conta</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
