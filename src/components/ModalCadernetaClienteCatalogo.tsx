import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Clock,
  Loader2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Receipt
} from 'lucide-react';
import { Cliente, CadernetaLancamento, Loja } from '../types';
import { CadernetaService, ResumoCadernetaCliente } from '../services/cadernetaService';
import { formatarMoeda } from '../utils/formatters';

interface ModalCadernetaClienteCatalogoProps {
  isOpen: boolean;
  onClose: () => void;
  cliente: Cliente | null;
  loja: Loja | null;
}

export const ModalCadernetaClienteCatalogo: React.FC<ModalCadernetaClienteCatalogoProps> = ({
  isOpen,
  onClose,
  cliente,
  loja
}) => {
  const [resumo, setResumo] = useState<ResumoCadernetaCliente | null>(null);
  const [extrato, setExtrato] = useState<CadernetaLancamento[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen && cliente?.id && loja?.id) {
      let ativo = true;

      const carregarDados = async () => {
        try {
          setCarregando(true);
          const [resumoData, extratoData] = await Promise.all([
            CadernetaService.obterResumoCliente(loja.id, cliente.id),
            CadernetaService.listarExtratoCliente(loja.id, cliente.id)
          ]);

          if (ativo) {
            setResumo(resumoData);
            setExtrato(extratoData);
          }
        } catch (err) {
          console.error('[ModalCadernetaClienteCatalogo] Erro ao carregar extrato:', err);
        } finally {
          if (ativo) setCarregando(false);
        }
      };

      carregarDados();

      return () => {
        ativo = false;
      };
    }
  }, [isOpen, cliente?.id, loja?.id]);

  if (!isOpen || !cliente) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800">
        {/* Cabeçalho */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center border border-amber-500/30">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-sm sm:text-base leading-tight">Minha Caderneta</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Extrato transparente no <strong className="text-slate-900 dark:text-slate-200">{loja?.nome_fantasia || 'Mercadinho'}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Indicadores e Extrato */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar">
          {carregando ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
              <span className="text-xs font-semibold">Carregando seu extrato da caderneta...</span>
            </div>
          ) : (
            <>
              {/* Cards de Resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Limite Total</span>
                  <span className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                    {formatarMoeda(resumo?.limiteTotal || 0)}
                  </span>
                </div>

                <div className={`p-3 rounded-2xl border ${
                  (resumo?.saldoDevedor || 0) > 0
                    ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-400'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                }`}>
                  <span className="text-[10px] font-bold block uppercase opacity-80">Saldo Devedor</span>
                  <span className="text-sm sm:text-base font-black">
                    {formatarMoeda(resumo?.saldoDevedor || 0)}
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
                  <span className="text-[9px] font-bold opacity-70">Todo dia {resumo?.diaVencimento}</span>
                </div>
              </div>

              {/* Linha do Tempo de Compras e Pagamentos */}
              <div className="space-y-2 pt-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Suas Compras e Pagamentos ({extrato.length})</span>
                </h3>

                {extrato.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-500">
                    Você ainda não possui compras lançadas na caderneta.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {extrato.map((lanc) => {
                      const ehCompra = lanc.tipo_lancamento === 'compra';
                      const ehPagamento = lanc.tipo_lancamento === 'pagamento';

                      return (
                        <div
                          key={lanc.id}
                          className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between text-xs"
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

        {/* Rodapé informativo */}
        <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 text-center">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Para realizar acertos de contas ou pagamentos parciais, procure o atendimento da loja no balcão ou via WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
};
