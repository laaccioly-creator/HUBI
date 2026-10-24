import React, { useState, useEffect } from 'react';
import { Scale, X, Calculator } from 'lucide-react';
import { formatarMoeda } from '../../utils/formatters';

interface ModalInputPesoFracionadoProps {
  aberto: boolean;
  onFechar: () => void;
  produtoNome: string;
  unidadeMedida?: string;
  precoPorKg: number;
  quantidadeAtual?: number;
  onConfirmar: (quantidadeKg: number) => void;
  temaDark?: boolean;
}

export const ModalInputPesoFracionado: React.FC<ModalInputPesoFracionadoProps> = ({
  aberto,
  onFechar,
  produtoNome,
  unidadeMedida = 'KG',
  precoPorKg,
  onConfirmar,
  temaDark = true
}) => {
  const [modo, setModo] = useState<'kg' | 'gramas' | 'valor'>('kg');
  const [valorKg, setValorKg] = useState<string>('');
  const [valorGramas, setValorGramas] = useState<string>('');
  const [valorReais, setValorReais] = useState<string>('');

  useEffect(() => {
    if (aberto) {
      setValorKg('');
      setValorGramas('');
      setValorReais('');
      setModo('kg');
    }
  }, [aberto]);

  if (!aberto) return null;

  const handleMudarKg = (val: string) => {
    setValorKg(val);
    if (!val.trim()) {
      setValorGramas('');
      setValorReais('');
      return;
    }
    const num = parseFloat(val.replace(',', '.'));
    if (!isNaN(num) && num >= 0) {
      setValorGramas(Math.round(num * 1000).toString());
      setValorReais((num * precoPorKg).toFixed(2));
    }
  };

  const handleMudarGramas = (val: string) => {
    setValorGramas(val);
    if (!val.trim()) {
      setValorKg('');
      setValorReais('');
      return;
    }
    const num = parseFloat(val.replace(',', '.'));
    if (!isNaN(num) && num >= 0) {
      const kg = num / 1000;
      setValorKg(kg.toFixed(3));
      setValorReais((kg * precoPorKg).toFixed(2));
    }
  };

  const handleMudarReais = (val: string) => {
    setValorReais(val);
    if (!val.trim()) {
      setValorKg('');
      setValorGramas('');
      return;
    }
    const num = parseFloat(val.replace(',', '.'));
    if (!isNaN(num) && num >= 0 && precoPorKg > 0) {
      const kg = num / precoPorKg;
      setValorKg(kg.toFixed(3));
      setValorGramas(Math.round(kg * 1000).toString());
    }
  };

  const pesoDigitado = parseFloat(valorKg.replace(',', '.'));
  const pesoFinalKg = !isNaN(pesoDigitado) && pesoDigitado > 0 ? pesoDigitado : 0;
  const subtotalCalculado = pesoFinalKg * precoPorKg;

  const handleConfirmar = () => {
    if (pesoFinalKg > 0) {
      onConfirmar(pesoFinalKg);
      onFechar();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className={`w-full max-w-sm rounded-3xl border shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200 ${
          temaDark
            ? 'bg-[#000000] border-slate-700 text-white'
            : 'bg-white border-2 border-slate-300 text-slate-900'
        }`}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20 shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm leading-tight">{produtoNome}</h3>
              <span className="text-xs font-semibold text-emerald-500">
                {formatarMoeda(precoPorKg)} / {unidadeMedida.toLowerCase()}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Seleção de Modo */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setModo('kg')}
            className={`py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
              modo === 'kg'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-white'
            }`}
          >
            Por Kg
          </button>
          <button
            type="button"
            onClick={() => setModo('gramas')}
            className={`py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
              modo === 'gramas'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-white'
            }`}
          >
            Por Gramas
          </button>
          <button
            type="button"
            onClick={() => setModo('valor')}
            className={`py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
              modo === 'valor'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-white'
            }`}
          >
            Por R$ (Valor)
          </button>
        </div>

        {/* Input Principal Baseado no Modo */}
        <div className="space-y-2">
          {modo === 'kg' && (
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">
                Peso em Quilos (3 casas decimais):
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.005"
                  min="0.001"
                  autoFocus
                  value={valorKg}
                  onChange={(e) => handleMudarKg(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmar()}
                  className="w-full pl-4 pr-12 py-3 rounded-2xl text-xl font-black bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-emerald-500 focus:outline-none focus:border-emerald-500 text-center"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-xs text-slate-400">
                  kg
                </span>
              </div>
            </div>
          )}

          {modo === 'gramas' && (
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">
                Quantidade em Gramas (g):
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="10"
                  min="1"
                  autoFocus
                  value={valorGramas}
                  onChange={(e) => handleMudarGramas(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmar()}
                  className="w-full pl-4 pr-12 py-3 rounded-2xl text-xl font-black bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-emerald-500 focus:outline-none focus:border-emerald-500 text-center"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-xs text-slate-400">
                  g
                </span>
              </div>
            </div>
          )}

          {modo === 'valor' && (
            <div>
              <label className="text-xs font-bold text-slate-400 block mb-1">
                Quanto o cliente deseja comprar em R$:
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-sm text-slate-400">
                  R$
                </span>
                <input
                  type="number"
                  step="0.50"
                  min="0.10"
                  autoFocus
                  value={valorReais}
                  onChange={(e) => handleMudarReais(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmar()}
                  className="w-full pl-12 pr-4 py-3 rounded-2xl text-xl font-black bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-emerald-500 focus:outline-none focus:border-emerald-500 text-center"
                />
              </div>
            </div>
          )}
        </div>

        {/* Resumo do Cálculo em Tempo Real */}
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-1">
          <span className="text-[11px] font-semibold text-emerald-400 block flex items-center justify-center gap-1">
            <Calculator className="w-3.5 h-3.5" />
            Cálculo em Tempo Real
          </span>
          <div className="text-lg font-black text-emerald-400">
            {pesoFinalKg.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg
            <span className="text-xs text-slate-300 font-normal"> x </span>
            {formatarMoeda(precoPorKg)}
            <span className="text-xs text-slate-300 font-normal"> = </span>
            <span className="text-white font-extrabold">{formatarMoeda(subtotalCalculado)}</span>
          </div>
        </div>

        {/* Botão de Ação */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onFechar}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer text-center whitespace-nowrap"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pesoFinalKg <= 0}
            onClick={handleConfirmar}
            className="w-full px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center text-center whitespace-nowrap shadow-lg shadow-emerald-500/20 transition cursor-pointer"
          >
            Confirmar Peso
          </button>
        </div>
      </div>
    </div>
  );
};
