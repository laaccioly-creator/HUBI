import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  RotateCcw,
  Check,
  X,
  AlertTriangle,
  ShieldAlert,
  Server
} from 'lucide-react';
import { useDataOperacao } from '../contexts/DataOperacaoContext';

export const ModalSeletorDataOperacao: React.FC = () => {
  const {
    modalAberto,
    fecharModal,
    dataSimulada,
    horaSimulada,
    modoSimulacaoAtivo,
    definirData,
    restaurarParaHoje,
    servidorSincronizado,
    ehOwner
  } = useDataOperacao();

  // Se o usuário não for Owner, este modal nunca deve renderizar
  if (!ehOwner || !modalAberto) return null;

  const [dataSelecionada, setDataSelecionada] = useState<string>(() => {
    if (dataSimulada) return dataSimulada;
    const d = new Date();
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  });

  const [horaSelecionada, setHoraSelecionada] = useState<string>(() => {
    return horaSimulada || '';
  });

  useEffect(() => {
    if (modalAberto) {
      if (dataSimulada) {
        setDataSelecionada(dataSimulada);
      } else {
        const d = new Date();
        const ano = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        setDataSelecionada(`${ano}-${mes}-${dia}`);
      }

      setHoraSelecionada(horaSimulada || '');
    }
  }, [modalAberto, dataSimulada, horaSimulada]);

  const aplicarPredefinicao = (diasAtras: number) => {
    const d = new Date();
    d.setDate(d.getDate() - diasAtras);
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    setDataSelecionada(`${ano}-${mes}-${dia}`);
  };

  const handleSalvar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataSelecionada) return;
    definirData(dataSelecionada, horaSelecionada || null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-amber-500/30 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-6 text-slate-100 animate-in zoom-in-95 duration-150">
        
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg text-slate-100">
                  Data Operacional do Sistema
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500 text-slate-950">
                  Owner
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Simule qualquer dia retroativo para testes de fluxo de caixa e vendas.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fecharModal}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status de Sincronização com Supabase */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            <span>Relógio Oficial: <strong>Banco Supabase (PostgreSQL)</strong></span>
          </div>
          <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {servidorSincronizado ? 'Sincronizado' : 'Conectando...'}
          </span>
        </div>

        {/* Alerta explicativo */}
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex gap-3 text-xs text-amber-200/90 leading-relaxed">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p>
            Enquanto este modo estiver ativo, <strong>aberturas e fechamentos de caixa</strong>,{' '}
            <strong>vendas do PDV</strong> e <strong>movimentações financeiras</strong> serão gravadas no dia que você definir abaixo.
          </p>
        </div>

        {/* Formulário de Seleção */}
        <form onSubmit={handleSalvar} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                Data de Operação *
              </label>
              <input
                type="date"
                value={dataSelecionada}
                onChange={(e) => setDataSelecionada(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-400 font-semibold cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  Horário (Opcional)
                </label>
                {horaSelecionada && (
                  <button
                    type="button"
                    onClick={() => setHoraSelecionada('')}
                    className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold cursor-pointer underline"
                  >
                    Usar horário contínuo
                  </button>
                )}
              </div>
              <input
                type="time"
                value={horaSelecionada}
                onChange={(e) => setHoraSelecionada(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-400 font-semibold cursor-pointer"
              />
              <span className="text-[10px] text-slate-400 block mt-1">
                {horaSelecionada
                  ? 'Horário fixado estaticamente.'
                  : 'Vazio = Relógio avança continuamente em tempo real (recomendado).'}
              </span>
            </div>
          </div>

          {/* Atalhos Rápidos */}
          <div>
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Atalhos Rápidos:
            </span>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => aplicarPredefinicao(1)}
                className="px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition text-center"
              >
                Ontem
              </button>
              <button
                type="button"
                onClick={() => aplicarPredefinicao(2)}
                className="px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition text-center"
              >
                -2 dias
              </button>
              <button
                type="button"
                onClick={() => aplicarPredefinicao(3)}
                className="px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition text-center"
              >
                -3 dias
              </button>
              <button
                type="button"
                onClick={() => aplicarPredefinicao(7)}
                className="px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition text-center"
              >
                -7 dias
              </button>
              <button
                type="button"
                onClick={() => aplicarPredefinicao(14)}
                className="px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition text-center col-span-2 sm:col-span-1"
              >
                -14 dias
              </button>
            </div>
          </div>

          {/* Ações */}
          <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            {modoSimulacaoAtivo ? (
              <button
                type="button"
                onClick={restaurarParaHoje}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Voltar para Tempo Real</span>
              </button>
            ) : (
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Modo atual: Tempo Real</span>
              </div>
            )}

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={fecharModal}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 transition cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Ativar Data Operacional</span>
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
};
