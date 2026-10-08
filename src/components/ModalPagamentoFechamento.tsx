import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  CreditCard,
  Banknote,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Printer,
  Plus,
  Trash2,
  Save,
  FileText,
  Truck
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Pedido, FormaPagamento, StatusPagamento, TipoPagamento } from '../types';
import { PrintService } from '../services/printService';
import { SyncService } from '../services/syncService';
import { audioService } from '../services/audioService';
import { caixaService } from '../services/caixaService';
import { obterDataOperacaoISO } from '../utils/dataOperacao';
import { formatarMoeda, formatarValorBRL } from '../utils/formatters';

interface MoneyInputProps {
  valor: number;
  onChange: (novoValor: number) => void;
  autoFocus?: boolean;
  className?: string;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
}

const MoneyInput: React.FC<MoneyInputProps> = ({
  valor,
  onChange,
  autoFocus,
  className,
  placeholder = "0,00",
  inputRef
}) => {
  const [texto, setTexto] = useState<string>(() =>
    valor > 0 ? formatarValorBRL(valor) : ''
  );
  const [focado, setFocado] = useState(false);

  useEffect(() => {
    if (!focado) {
      setTexto(valor > 0 ? formatarValorBRL(valor) : '');
    }
  }, [valor, focado]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const sanitizado = raw.replace(/[^\d.,]/g, '');
    setTexto(sanitizado);

    if (!sanitizado) {
      onChange(0);
      return;
    }

    let normalizado = sanitizado;
    if (normalizado.includes(',')) {
      normalizado = normalizado.replace(/\./g, '').replace(',', '.');
    }
    const parsed = parseFloat(normalizado);
    onChange(isNaN(parsed) ? 0 : parsed);
  };

  const handleBlur = () => {
    setFocado(false);
    if (valor > 0) {
      setTexto(formatarValorBRL(valor));
    } else {
      setTexto('');
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      autoFocus={autoFocus}
      onFocus={(e) => {
        setFocado(true);
        e.target.select();
      }}
      onBlur={handleBlur}
      value={texto}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
    />
  );
};

export interface LinhaPagamentoRecebimento {
  id: string;
  forma_pagamento_id: string;
  forma_tipo: TipoPagamento;
  forma_nome: string;
  valor: number;
  valor_entregue?: number | null;
  parcelas?: number;
}

export interface ModalPagamentoFechamentoProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  onPagamentoConcluido: (pedidoAtualizado?: Pedido) => void;
  concluirAoQuitar?: boolean;
  onSalvar?: (linhas: LinhaPagamentoRecebimento[]) => Promise<void>;
}

export const ModalPagamentoFechamento: React.FC<ModalPagamentoFechamentoProps> = ({
  isOpen,
  onClose,
  pedido,
  onPagamentoConcluido,
  concluirAoQuitar = false,
  onSalvar
}) => {
  const { loja, usuario } = useAuth();
  const { tema } = useTheme();
  const isDark = tema === 'dark';

  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [linhasPagamento, setLinhasPagamento] = useState<LinhaPagamentoRecebimento[]>([]);
  const [concluirAoQuitarCheck, setConcluirAoQuitarCheck] = useState<boolean>(concluirAoQuitar);
  const [processando, setProcessando] = useState<boolean>(false);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [sucessoModal, setSucessoModal] = useState<boolean>(false);
  const [pedidoAtualizado, setPedidoAtualizado] = useState<Pedido | null>(null);
  const inputPrimeiroValorRef = useRef<HTMLInputElement>(null);

  const FORMAS_PADRAO: FormaPagamento[] = [
    { id: `fp_dinheiro_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Dinheiro', tipo: 'dinheiro', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_pix_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'PIX', tipo: 'pix', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_credito_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Cartão de Crédito', tipo: 'cartao_credito', taxa_percentual: 3.2, taxa_fixa: 0, maximo_parcelas: 12, ativo: true, exibir_catalogo: true },
    { id: `fp_debito_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Cartão de Débito', tipo: 'cartao_debito', taxa_percentual: 1.5, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_fiado_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Fiado', tipo: 'fiado', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: false }
  ];

  // Carregar formas de pagamento cadastradas da loja
  useEffect(() => {
    if (!loja?.id || !isOpen) return;
    const buscarFormas = async () => {
      try {
        const { data, error } = await supabase
          .from('formas_pagamento')
          .select('*')
          .eq('loja_id', loja.id)
          .eq('ativo', true)
          .order('nome');

        let lista = FORMAS_PADRAO;
        if (!error && data && data.length > 0) {
          lista = data;
          // Assegura que Fiado esteja na lista se a loja permitir
          if (!lista.some(f => f.tipo === 'fiado')) {
            const fiadoPadrao = FORMAS_PADRAO.find(f => f.tipo === 'fiado');
            if (fiadoPadrao) lista = [...lista, fiadoPadrao];
          }
        }
        setFormasPagamento(lista);
      } catch (err) {
        console.warn('Fallback formas de pagamento:', err);
        setFormasPagamento(FORMAS_PADRAO);
      }
    };

    buscarFormas();
  }, [loja?.id, isOpen]);

  // Inicializar linhas de pagamento quando o modal abrir para um pedido
  useEffect(() => {
    if (pedido && isOpen) {
      setConcluirAoQuitarCheck(concluirAoQuitar);
      const valorTot = Number(pedido.valor_total || 0);
      const valorJaPago = Number(pedido.valor_pago || 0);
      const saldoRestante = Math.max(0, Number(pedido.saldo_devedor ?? (valorTot - valorJaPago)));
      const valorSugerido = saldoRestante > 0 ? saldoRestante : (valorTot > 0 ? valorTot : 0);

      const fpsDisponiveis = formasPagamento && formasPagamento.length > 0 ? formasPagamento : FORMAS_PADRAO;
      const fpInicial = fpsDisponiveis.find(f => f.tipo === 'dinheiro') || fpsDisponiveis[0];

      setLinhasPagamento([
        {
          id: `linha_${Date.now()}`,
          forma_pagamento_id: fpInicial.id,
          forma_tipo: fpInicial.tipo,
          forma_nome: fpInicial.nome,
          valor: Number(valorSugerido.toFixed(2)),
          valor_entregue: null,
          parcelas: 1
        }
      ]);

      setErroMsg(null);
      setSucessoModal(false);
      setPedidoAtualizado(null);

      const timer = setTimeout(() => {
        if (inputPrimeiroValorRef.current) {
          inputPrimeiroValorRef.current.focus();
          inputPrimeiroValorRef.current.select();
        }
      }, 150);

      return () => clearTimeout(timer);
    }
  }, [pedido?.id, isOpen, concluirAoQuitar]);

  if (!isOpen || !pedido) return null;

  const valorTotal = Number(pedido.valor_total || 0);
  const valorJaPago = Number(pedido.valor_pago || 0);
  const saldoDevedorAtual = Math.max(0, Number(pedido.saldo_devedor ?? (valorTotal - valorJaPago)));

  const totalLinhasPagamento = linhasPagamento.reduce((acc, l) => acc + (Number(l.valor) || 0), 0);
  const diferencaPagamento = Number((saldoDevedorAtual - totalLinhasPagamento).toFixed(2));

  const formasDisponiveis = formasPagamento.length > 0 ? formasPagamento : FORMAS_PADRAO;

  const handleAdicionarLinha = () => {
    const valorRestanteSugerido = diferencaPagamento > 0 ? diferencaPagamento : 0;
    const fpPadrao = formasDisponiveis.find(f => f.tipo === 'pix') || formasDisponiveis[0];

    const novaLinha: LinhaPagamentoRecebimento = {
      id: `linha_${Date.now()}_${Math.random()}`,
      forma_pagamento_id: fpPadrao.id,
      forma_tipo: fpPadrao.tipo,
      forma_nome: fpPadrao.nome,
      valor: Number(valorRestanteSugerido.toFixed(2)),
      valor_entregue: null,
      parcelas: 1
    };

    setLinhasPagamento(prev => [...prev, novaLinha]);
  };

  const handleRemoverLinha = (idLinha: string) => {
    if (linhasPagamento.length <= 1) return;
    setLinhasPagamento(prev => prev.filter(l => l.id !== idLinha));
  };

  const handleAlterarFormaLinha = (idLinha: string, novaForma: FormaPagamento) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id === idLinha) {
        return {
          ...l,
          forma_pagamento_id: novaForma.id,
          forma_tipo: novaForma.tipo,
          forma_nome: novaForma.nome,
          valor_entregue: novaForma.tipo === 'dinheiro' ? l.valor_entregue : null,
          parcelas: novaForma.tipo === 'cartao_credito' ? (l.parcelas || 1) : 1
        };
      }
      return l;
    }));
  };

  const handleAlterarValorLinha = (idLinha: string, novoValor: number) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id === idLinha) {
        return { ...l, valor: Math.max(0, novoValor) };
      }
      return l;
    }));
  };

  const handleAlterarEntregueLinha = (idLinha: string, novoEntregue: number) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id === idLinha) {
        return { ...l, valor_entregue: Math.max(0, novoEntregue) };
      }
      return l;
    }));
  };

  const handleAlterarParcelasLinha = (idLinha: string, parcelas: number) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id === idLinha) {
        return { ...l, parcelas: Math.max(1, parcelas) };
      }
      return l;
    }));
  };

  const handleSalvarPrevisto = async () => {
    if (!pedido || !loja?.id) return;
    const linhasValidas = linhasPagamento.filter(l => Number(l.valor) > 0);
    if (linhasValidas.length === 0) {
      setErroMsg('Informe ao menos uma forma de pagamento com valor maior que zero.');
      return;
    }

    setSalvando(true);
    setErroMsg(null);
    try {
      if (onSalvar) {
        await onSalvar(linhasValidas);
      } else {
        const dataIso = obterDataOperacaoISO();
        await supabase.from('pagamentos_pedido').delete().eq('pedido_id', pedido.id);
        try {
          await supabase.from('pedidos_pagamentos_previstos').delete().eq('pedido_id', pedido.id);
        } catch {}

        const pagamentosParaDb = await Promise.all(linhasValidas.map(async (l) => {
          const fpRealId = await SyncService.resolverFormaPagamentoId(loja.id, l.forma_pagamento_id, l.forma_tipo);
          return {
            loja_id: loja.id,
            pedido_id: pedido.id,
            forma_pagamento_id: fpRealId,
            valor: Number(l.valor),
            parcelas: l.parcelas || 1,
            valor_taxa: 0,
            valor_liquido: Number(l.valor),
            data_pagamento: dataIso,
            eh_pagamento_fiado: l.forma_tipo === 'fiado'
          };
        }));

        const { error: errPag } = await supabase.from('pagamentos_pedido').insert(pagamentosParaDb);
        if (errPag) throw errPag;

        audioService.playBeep();
        onPagamentoConcluido(pedido);
        onClose();
      }
    } catch (err: any) {
      console.error('Erro ao salvar formas de pagamento do pedido:', err);
      setErroMsg(err.message || 'Erro ao salvar formas de pagamento.');
    } finally {
      setSalvando(false);
    }
  };

  const handleConfirmarRecebimento = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroMsg(null);

    const linhasAtivas = linhasPagamento.filter(l => Number(l.valor) > 0);
    if (linhasAtivas.length === 0) {
      setErroMsg('Informe ao menos uma forma de pagamento com valor maior que zero.');
      return;
    }

    if (Math.abs(diferencaPagamento) > 0.01) {
      setErroMsg(`O total das formas de pagamento deve equivaler exatamente ao saldo devedor de R$ ${saldoDevedorAtual.toFixed(2)}.`);
      return;
    }

    setProcessando(true);

    try {
      const dataIso = obterDataOperacaoISO();
      const novoValorPago = Number((valorJaPago + totalLinhasPagamento).toFixed(2));
      const novoSaldoDevedor = Math.max(0, Number((valorTotal - novoValorPago).toFixed(2)));
      const quitado = novoSaldoDevedor <= 0;

      const novoStatusPagamento: StatusPagamento = quitado ? 'pago' : 'parcialmente_pago';

      // 1. Gravar cada pagamento na tabela pagamentos_pedido
      for (const linha of linhasAtivas) {
        const fpRealId = await SyncService.resolverFormaPagamentoId(loja?.id || '', linha.forma_pagamento_id, linha.forma_tipo);
        const fpRef = formasDisponiveis.find(f => f.id === linha.forma_pagamento_id || f.tipo === linha.forma_tipo);
        const taxaPerc = Number(fpRef?.taxa_percentual || 0);
        const taxaValor = Number(((linha.valor * taxaPerc) / 100).toFixed(2));
        const valorLiquido = Number((linha.valor - taxaValor).toFixed(2));

        const { error: erroPag } = await supabase.from('pagamentos_pedido').insert([
          {
            loja_id: loja?.id,
            pedido_id: pedido.id,
            forma_pagamento_id: fpRealId,
            valor: linha.valor,
            parcelas: linha.parcelas || 1,
            valor_taxa: taxaValor,
            valor_liquido: valorLiquido,
            data_pagamento: dataIso,
            eh_pagamento_fiado: linha.forma_tipo === 'fiado'
          }
        ]);

        if (erroPag) throw erroPag;
      }

      // 2. Atualizar status e valores do pedido
      const payloadUpdate: any = {
        status_pagamento: novoStatusPagamento,
        valor_pago: novoValorPago,
        saldo_devedor: novoSaldoDevedor,
        fiado_quitado: quitado,
        atualizado_em: dataIso
      };

      if (quitado) {
        const isStatusLogistico = ['aguardando_envio', 'em_expedicao', 'enviado'].includes(pedido.status);
        if (!isStatusLogistico) {
          const rawPe = (pedido as any).pedido_entregas || (pedido as any).pedido_entrega;
          const pe = Array.isArray(rawPe) ? rawPe[0] : rawPe;
          const ehRetirada = pe?.tipo_atendimento === 'retirada' || (pedido as any).tipo_atendimento === 'retirada';
          const ehEntrega = !ehRetirada && (
            Boolean(pe) ||
            Boolean(pedido.endereco_entrega && !pedido.endereco_entrega.toLowerCase().includes('retirada') && pedido.endereco_entrega.toLowerCase() !== 'retirada na loja') ||
            Boolean(pedido.forma_entrega_id) ||
            Boolean((pedido as any).nome_transportadora) ||
            Number(pedido.valor_frete || 0) > 0
          );

          if (concluirAoQuitarCheck && !ehEntrega) {
            payloadUpdate.status = 'concluido';
          } else if (ehEntrega) {
            payloadUpdate.status = 'aguardando_envio';
          } else if (pedido.status === 'pendente') {
            payloadUpdate.status = 'confirmado';
          }
        }
      }

      const { data: pedUpd, error: erroUpd } = await supabase
        .from('pedidos')
        .update(payloadUpdate)
        .eq('id', pedido.id)
        .select(`
          *,
          cliente:clientes(*),
          vendedor:usuarios_loja!pedidos_vendedor_id_fkey(*),
          itens:itens_pedido(*),
          pagamentos:pagamentos_pedido(*)
        `)
        .single();

      if (erroUpd) throw erroUpd;

      // 3. Atualizar saldo devedor do cliente se necessário
      if (pedido.cliente_id && totalLinhasPagamento > 0) {
        try {
          const { data: cliData } = await supabase
            .from('clientes')
            .select('saldo_devedor_fiado, limite_credito')
            .eq('id', pedido.cliente_id)
            .single();

          if (cliData) {
            const debitoCli = Number(cliData.saldo_devedor_fiado || 0);
            const novoDebitoCli = Math.max(0, debitoCli - totalLinhasPagamento);
            const novoLimite = Number(cliData.limite_credito || 0) + totalLinhasPagamento;
            await supabase
              .from('clientes')
              .update({
                saldo_devedor_fiado: novoDebitoCli,
                limite_credito: novoLimite
              })
              .eq('id', pedido.cliente_id);
          }
        } catch (cliErr) {
          console.warn('Aviso ao abater fiado do cliente e devolver limite:', cliErr);
        }
      }

      // 4. Registrar na sessão de caixa ativa para formas não-fiado
      const pagamentosCaixa = linhasAtivas.filter(l => l.forma_tipo !== 'fiado' && Number(l.valor) > 0);
      if (loja?.id && pagamentosCaixa.length > 0) {
        try {
          await caixaService.registrarVendaPedido({
            lojaId: loja.id,
            pedido: pedUpd || pedido,
            pagamentos: pagamentosCaixa.map(l => ({
              forma_nome: l.forma_nome,
              forma_tipo: l.forma_tipo,
              valor: l.valor
            })),
            usuarioId: usuario?.id || ''
          });
        } catch (errCaixa) {
          console.warn('Aviso ao registrar recebimento no caixa:', errCaixa);
        }
      }

      audioService.playNewOrderSound();
      const objAtualizado = (pedUpd as unknown as Pedido) || { ...pedido, ...payloadUpdate };
      setPedidoAtualizado(objAtualizado);
      setSucessoModal(true);
      onPagamentoConcluido(objAtualizado);
    } catch (err: any) {
      console.error('Erro ao receber pagamento:', err);
      setErroMsg(err.message || 'Erro ao registrar pagamento. Tente novamente.');
    } finally {
      setProcessando(false);
    }
  };

  const handleImprimirComprovante = () => {
    if (pedidoAtualizado || pedido) {
      PrintService.printReceipt(pedidoAtualizado || pedido, loja, '80mm');
    }
  };

  const handleFecharTudo = () => {
    setSucessoModal(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto">
      <div className={`border rounded-3xl w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 my-6 max-h-[92vh] overflow-y-auto ${
        isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Header Oficial Unificado */}
        <div className={`flex items-center justify-between border-b pb-3 ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-2xl font-bold flex items-center justify-center ${
              isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
            }`}>
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`font-bold text-base flex items-center gap-2 ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}>
                <span>Pagamento & Fechamento</span>
                <span className={`text-xs font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  #{pedido.origem === 'catalogo_online' ? `c-${pedido.numero_pedido}` : pedido.numero_pedido}
                </span>
              </h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Cliente: <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{pedido.cliente?.nome || 'Cliente Balcão'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={handleFecharTudo}
            className={`p-1.5 rounded-xl transition cursor-pointer ${
              isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-700'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {erroMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-2 text-xs text-rose-500 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{erroMsg}</span>
          </div>
        )}

        {sucessoModal ? (
          /* TELA DE SUCESSO DO RECEBIMENTO */
          <div className="py-6 text-center space-y-4 animate-in fade-in">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/40 shadow-lg shadow-emerald-500/15">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h4 className={`text-lg font-black ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Pagamento Recebido com Sucesso!</h4>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                O valor de <span className="text-emerald-600 dark:text-emerald-400 font-bold">{formatarMoeda(totalLinhasPagamento)}</span> foi registrado no pedido.
              </p>
            </div>

            <div className={`p-4 rounded-2xl border text-xs space-y-1.5 text-left max-w-sm mx-auto ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className={`flex justify-between ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <span>Total do Pedido:</span>
                <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{formatarMoeda(valorTotal)}</span>
              </div>
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Total Pago até agora:</span>
                <span className="font-bold">{formatarMoeda(valorJaPago + totalLinhasPagamento)}</span>
              </div>
              <div className={`flex justify-between pt-1 border-t ${
                isDark ? 'text-slate-400 border-slate-800' : 'text-slate-500 border-slate-200'
              }`}>
                <span>Saldo Devedor Restante:</span>
                <span className={`font-bold ${Math.max(0, valorTotal - (valorJaPago + totalLinhasPagamento)) <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {formatarMoeda(Math.max(0, valorTotal - (valorJaPago + totalLinhasPagamento)))}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleImprimirComprovante}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs border ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700'
                    : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200'
                }`}
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Recibo</span>
              </button>
              <button
                type="button"
                onClick={handleFecharTudo}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition cursor-pointer shadow-lg shadow-emerald-600/25 active:scale-95"
              >
                Concluir
              </button>
            </div>
          </div>
        ) : (
          /* FORMULÁRIO DE RECEBIMENTO UNIFICADO (PADRÃO POSCHECKOUT) */
          <form onSubmit={handleConfirmarRecebimento} className="space-y-4">
            {/* Card de Destaque do Valor Total / Saldo Pendente */}
            <div className={`p-3.5 rounded-2xl border text-center space-y-0.5 ${
              isDark
                ? 'bg-emerald-950/40 border-emerald-800'
                : 'bg-emerald-50 border-emerald-100'
            }`}>
              <span className={`text-xs block font-semibold ${
                isDark ? 'text-emerald-400/80' : 'text-emerald-800/80'
              }`}>
                {valorJaPago > 0 ? 'Saldo Restante a Quitar' : 'Valor Total da Venda'}
              </span>
              <span className={`text-3xl font-bold ${
                isDark ? 'text-emerald-400' : 'text-emerald-600'
              }`}>
                {formatarMoeda(saldoDevedorAtual)}
              </span>
              {valorJaPago > 0 && (
                <div className={`flex justify-center items-center gap-3 text-[11px] pt-0.5 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  <span>Total: {formatarMoeda(valorTotal)}</span>
                  <span>•</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Já Pago: {formatarMoeda(valorJaPago)}</span>
                </div>
              )}
            </div>

            {/* Linhas de Pagamento */}
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  Meios de Pagamento ({linhasPagamento.length}):
                </span>
                <span className={`text-[11px] font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  Permite dividir o total em vários meios
                </span>
              </div>

              {linhasPagamento.map((linha, idx) => (
                <div
                  key={linha.id}
                  className={`p-3 rounded-2xl border space-y-2.5 shadow-xs ${
                    isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-[10px] font-black">
                        {idx + 1}
                      </span>
                      Pagamento #{idx + 1}
                    </span>
                    {linhasPagamento.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoverLinha(linha.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition cursor-pointer"
                        title="Remover este pagamento"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Seleção da Forma de Pagamento */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {formasDisponiveis.map((fp) => {
                      const estaSelecionado = linha.forma_pagamento_id === fp.id || (!linha.forma_pagamento_id && linha.forma_tipo === fp.tipo);
                      return (
                        <button
                          key={fp.id}
                          type="button"
                          onClick={() => handleAlterarFormaLinha(linha.id, fp)}
                          className={`p-2 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 ${
                            estaSelecionado
                              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/40 shadow-xs'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {fp.tipo === 'dinheiro' && <Banknote className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                          {fp.tipo === 'pix' && <Zap className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />}
                          {fp.tipo === 'cartao_debito' && <CreditCard className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
                          {fp.tipo === 'cartao_credito' && <CreditCard className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />}
                          {fp.tipo === 'fiado' && <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />}
                          {fp.tipo !== 'dinheiro' && fp.tipo !== 'pix' && fp.tipo !== 'cartao_debito' && fp.tipo !== 'cartao_credito' && fp.tipo !== 'fiado' && (
                            <CreditCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                          <span className="truncate">{fp.nome}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Valor deste pagamento */}
                  <div className={`flex items-center justify-between gap-2 pt-1 border-t ${
                    isDark ? 'border-slate-800' : 'border-slate-200'
                  }`}>
                    <span className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Valor a pagar:</span>
                    <div className={`flex items-center gap-1 border rounded-xl px-2.5 py-1.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 ${
                      isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
                    }`}>
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">R$</span>
                      <MoneyInput
                        inputRef={idx === 0 ? inputPrimeiroValorRef : undefined}
                        autoFocus={idx === 0}
                        valor={linha.valor}
                        onChange={(novoValor) => handleAlterarValorLinha(linha.id, novoValor)}
                        placeholder="0,00"
                        className={`w-28 bg-transparent text-right text-xs font-bold focus:outline-none placeholder:text-slate-400 ${
                          isDark ? 'text-white' : 'text-slate-900'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Dinheiro: Troco */}
                  {linha.forma_tipo === 'dinheiro' && (
                    <div className={`space-y-1.5 pt-1.5 border-t text-xs ${
                      isDark ? 'border-slate-800' : 'border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Valor Entregue pelo Cliente:</span>
                        <div className={`flex items-center gap-1 border rounded-xl px-2.5 py-1.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 ${
                          isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
                        }`}>
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">R$</span>
                          <MoneyInput
                            valor={linha.valor_entregue != null && linha.valor_entregue > 0 ? linha.valor_entregue : 0}
                            onChange={(novoValor) => handleAlterarEntregueLinha(linha.id, novoValor)}
                            placeholder="0,00"
                            className={`w-28 bg-transparent text-right text-xs font-bold focus:outline-none placeholder:text-slate-400 ${
                              isDark ? 'text-white' : 'text-slate-900'
                            }`}
                          />
                        </div>
                      </div>

                      {linha.valor_entregue != null && linha.valor_entregue > linha.valor && (
                        <div className={`flex items-center justify-between gap-2 pt-1 border-t ${
                          isDark ? 'border-slate-800' : 'border-slate-200'
                        }`}>
                          <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Troco a devolver:</span>
                          <div className={`flex items-center gap-1 border rounded-xl px-2.5 py-1.5 ${
                            isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
                          }`}>
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">R$</span>
                            <span className={`w-28 text-right text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                              {formatarValorBRL(linha.valor_entregue - linha.valor)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cartão de Crédito: Parcelas */}
                  {linha.forma_tipo === 'cartao_credito' && (
                    <div className={`flex items-center justify-between gap-2 pt-1.5 border-t text-xs ${
                      isDark ? 'border-slate-800' : 'border-slate-200'
                    }`}>
                      <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>Número de Parcelas:</span>
                      <select
                        value={linha.parcelas || 1}
                        onChange={(e) => handleAlterarParcelasLinha(linha.id, parseInt(e.target.value, 10) || 1)}
                        className={`border rounded-xl px-2.5 py-1 text-xs font-bold focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none cursor-pointer ${
                          isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(p => (
                          <option key={p} value={p}>
                            {p}x {linha.valor > 0 ? `de ${formatarMoeda(linha.valor / p)}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Fiado: Informações do Cliente e Limite */}
                  {linha.forma_tipo === 'fiado' && (
                    <div className={`p-2.5 rounded-xl border space-y-1.5 text-xs ${
                      isDark
                        ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-700 dark:text-amber-400">Cliente Fiado:</span>
                        <span className={`font-semibold truncate max-w-[200px] ${
                          isDark ? 'text-slate-200' : 'text-slate-800'
                        }`}>
                          {pedido.cliente?.nome || 'Nenhum selecionado'}
                        </span>
                      </div>
                      <div className={`flex justify-between text-[11px] ${
                        isDark ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        <span>Limite de Crédito Disponível:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {formatarMoeda(Number(pedido.cliente?.limite_credito || 0))}
                        </span>
                      </div>
                      {linha.valor > Number(pedido.cliente?.limite_credito || 0) && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold">
                          ⚠️ Valor informado excede o limite disponível de {formatarMoeda(Number(pedido.cliente?.limite_credito || 0))}.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Botão Adicionar Outro Meio de Pagamento */}
              <button
                type="button"
                onClick={handleAdicionarLinha}
                className="w-full py-2.5 px-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500/60 bg-slate-50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98"
              >
                <Plus className="w-4 h-4" />
                <span>
                  Adicionar outro meio de pagamento {diferencaPagamento > 0 ? `(Faltam ${formatarMoeda(diferencaPagamento)})` : ''}
                </span>
              </button>
            </div>

            {/* Resumo de Conferência dos Valores com Discriminação (Padrão POSCheckout) */}
            <div className={`p-3.5 rounded-2xl border space-y-2 text-xs ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className={`flex justify-between items-center ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
                <span className="font-medium">Subtotal dos Produtos:</span>
                <span className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  {formatarMoeda(Number(pedido.subtotal || (valorTotal - Number(pedido.valor_frete || 0) + Number(pedido.valor_desconto || 0))))}
                </span>
              </div>

              {Number(pedido.valor_desconto || 0) > 0 && (
                <div className={`flex justify-between items-center ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
                  <span className="font-medium">Desconto Aplicado:</span>
                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                    - {formatarMoeda(Number(pedido.valor_desconto || 0))}
                  </span>
                </div>
              )}

              {/* Discriminação explícita do Frete */}
              <div className={`flex justify-between items-center ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
                <span className="flex items-center gap-1.5 font-medium">
                  <Truck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Taxa de Entrega / Frete:</span>
                </span>
                <span className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {Number(pedido.valor_frete || 0) > 0 ? formatarMoeda(Number(pedido.valor_frete || 0)) : 'Grátis'}
                </span>
              </div>

              {/* TOTAL DA VENDA (EM DESTAQUE) */}
              <div className={`pt-2 border-t flex justify-between items-center font-bold text-sm ${
                isDark ? 'border-slate-800 text-white' : 'border-slate-200 text-slate-900'
              }`}>
                <span>Total da Venda:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-black text-base">{formatarMoeda(valorTotal)}</span>
              </div>

              {valorJaPago > 0 && (
                <div className={`flex justify-between items-center pt-1 border-t border-dashed ${
                  isDark ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-800'
                }`}>
                  <span className="font-medium">Já Quitado Anteriormente:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatarMoeda(valorJaPago)}</span>
                </div>
              )}

              {/* Total dos Meios Informados */}
              <div className={`flex justify-between items-center pt-1 border-t border-dashed ${
                isDark ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-800'
              }`}>
                <span className="font-medium">Total dos Meios Informados:</span>
                <span className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{formatarMoeda(totalLinhasPagamento)}</span>
              </div>

              {/* Total Conferido / Diferença */}
              <div className={`flex justify-between items-center font-medium pt-1 border-t ${
                isDark ? 'border-slate-800/80 text-slate-300' : 'border-slate-200 text-slate-800'
              }`}>
                {Math.abs(diferencaPagamento) < 0.01 ? (
                  <>
                    <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" /> Total Conferido (100%):
                    </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">R$ 0,00</span>
                  </>
                ) : diferencaPagamento > 0 ? (
                  <>
                    <span className="text-amber-700 dark:text-amber-400 font-medium">Restante a Definir:</span>
                    <span className="font-semibold text-amber-700 dark:text-amber-400">{formatarMoeda(diferencaPagamento)}</span>
                  </>
                ) : (
                  <>
                    <span className="text-rose-700 dark:text-rose-400 font-medium">Excedente Ultrapassado:</span>
                    <span className="font-semibold text-rose-700 dark:text-rose-400">{formatarMoeda(Math.abs(diferencaPagamento))}</span>
                  </>
                )}
              </div>
            </div>

            {/* Toggle / Checkbox Concluir ao Quitar */}
            <div className={`p-3 rounded-2xl border flex items-center justify-between ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div>
                <span className={`text-xs font-bold block ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  Concluir Automaticamente ao Quitar
                </span>
                <span className={`text-[11px] block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Altera o status do pedido para "Concluído" se o saldo for 100% quitado
                </span>
              </div>
              <input
                type="checkbox"
                checked={concluirAoQuitarCheck}
                onChange={(e) => setConcluirAoQuitarCheck(e.target.checked)}
                className="w-5 h-5 rounded-lg text-emerald-600 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:ring-emerald-500 cursor-pointer accent-emerald-500"
              />
            </div>

            {/* Botões de Rodapé: [ Cancelar ], [ Salvar ] e [ Confirmar Pagamento ] */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleFecharTudo}
                className={`py-3 px-3 rounded-2xl font-bold text-xs border transition cursor-pointer shadow-xs ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                }`}
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={salvando || processando || totalLinhasPagamento <= 0}
                onClick={handleSalvarPrevisto}
                className={`flex-1 py-3 px-3 rounded-2xl font-bold text-xs border shadow-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                  isDark
                    ? 'bg-slate-900 hover:bg-slate-800 text-emerald-400 border-emerald-500/40'
                    : 'bg-white hover:bg-slate-50 text-emerald-700 border-emerald-300'
                }`}
              >
                {salvando ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                ) : (
                  <Save className="w-4 h-4 text-emerald-500" />
                )}
                <span>Salvar Previsto</span>
              </button>

              <button
                type="submit"
                disabled={processando || salvando || totalLinhasPagamento <= 0 || Math.abs(diferencaPagamento) > 0.01}
                className="flex-[2] py-3 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer active:scale-98"
              >
                {processando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="truncate">Confirmar Pagamento</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
