import React, { useState, useEffect } from 'react';

export interface InputQuantidadeCarrinhoProps {
  quantidade: number;
  ehFracionado?: boolean;
  disabled?: boolean;
  isDark?: boolean;
  className?: string;
  onChangeQtd: (novaQtd: number) => void;
  onDoubleClick?: () => void;
  title?: string;
}

/**
 * Componente de entrada numérica para a quantidade de itens no carrinho do PDV.
 * Substitui o texto estático por um input editável, permitindo digitação direta
 * de grandes volumes com seleção automática no foco e validação de limites mínimos.
 */
export const InputQuantidadeCarrinho: React.FC<InputQuantidadeCarrinhoProps> = ({
  quantidade,
  ehFracionado = false,
  disabled = false,
  isDark = true,
  className = '',
  onChangeQtd,
  onDoubleClick,
  title,
}) => {
  const [textoLocal, setTextoLocal] = useState<string>(String(quantidade));
  const [emFoco, setEmFoco] = useState<boolean>(false);

  // Sincroniza o estado local quando a quantidade mudar externamente (ex: cliques no [+] / [-])
  useEffect(() => {
    if (!emFoco) {
      setTextoLocal(String(quantidade));
    }
  }, [quantidade, emFoco]);

  const minVal = ehFracionado ? 0.001 : 1;

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setEmFoco(true);
    e.target.select();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTextoLocal(val);

    if (val.trim() === '') return;

    const num = parseFloat(val.replace(',', '.'));
    if (!isNaN(num) && num >= minVal) {
      const qtdFinal = ehFracionado ? Number(num.toFixed(3)) : Math.floor(num);
      if (qtdFinal >= minVal) {
        onChangeQtd(qtdFinal);
      }
    }
  };

  const handleBlur = () => {
    setEmFoco(false);
    const num = parseFloat(textoLocal.replace(',', '.'));

    if (isNaN(num) || num < minVal) {
      const fallback = quantidade >= minVal ? quantidade : minVal;
      setTextoLocal(String(fallback));
      onChangeQtd(fallback);
    } else {
      const qtdFinal = ehFracionado ? Number(num.toFixed(3)) : Math.floor(num);
      const validado = Math.max(minVal, qtdFinal);
      setTextoLocal(String(validado));
      onChangeQtd(validado);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="number"
      inputMode={ehFracionado ? 'decimal' : 'numeric'}
      min={minVal}
      step={ehFracionado ? 'any' : '1'}
      disabled={disabled}
      value={textoLocal}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onDoubleClick={onDoubleClick}
      title={title}
      className={`w-12 h-6 text-center text-xs font-bold bg-transparent border-none outline-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:bg-emerald-500/10 rounded transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
        isDark ? 'text-slate-100 placeholder:text-slate-600' : 'text-slate-900 placeholder:text-slate-400'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text'} ${className}`}
    />
  );
};
