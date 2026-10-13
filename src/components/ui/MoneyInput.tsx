import React, { useState, useEffect } from 'react';
import { formatarMoeda, parseMoedaBanco } from '../../utils/formatters';

export interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | string | null | undefined;
  onChange: (value: number) => void;
  /** Exibe o prefixo 'R$' estaticamente à esquerda dentro do container */
  mostrarPrefixo?: boolean;
  /** Classe adicional para o container externo */
  containerClassName?: string;
  /** Permite que o campo fique vazio (0 no estado pai) */
  permitirVazio?: boolean;
}

/**
 * Componente canônico de entrada monetária pt-BR (HUBI MoneyInput).
 * - Ao carregar: inicializa com formato monetário formatado (ex: "42,00", "1.250,50").
 * - Ao digitar: permite digitação fluida em formato pt-BR (ex: "42", "42,5", "68.6").
 * - No onBlur: normaliza estritamente para 2 casas decimais (ex: 42 -> "42,00", 68.6 -> "68,60").
 * - No onChange: notifica o componente pai com número float limpo pronto para Supabase / PostgreSQL.
 */
export const MoneyInput: React.FC<MoneyInputProps> = ({
  value,
  onChange,
  mostrarPrefixo = true,
  containerClassName = '',
  className = '',
  permitirVazio = false,
  disabled,
  placeholder = '0,00',
  onBlur,
  onFocus,
  ...props
}) => {
  const [textoExibicao, setTextoExibicao] = useState<string>(() => {
    if (value === null || value === undefined || value === '') {
      return permitirVazio ? '' : '0,00';
    }
    const num = typeof value === 'number' ? value : parseMoedaBanco(value);
    if (permitirVazio && num === 0) return '';
    return formatarMoeda(num, { semSimbolo: true });
  });

  const [emFoco, setEmFoco] = useState<boolean>(false);

  // Sincroniza estado de exibição se o valor externo mudar enquanto o input não estiver focado
  useEffect(() => {
    if (!emFoco) {
      if (value === null || value === undefined || value === '') {
        setTextoExibicao(permitirVazio ? '' : '0,00');
      } else {
        const num = typeof value === 'number' ? value : parseMoedaBanco(value);
        if (permitirVazio && num === 0) {
          setTextoExibicao('');
        } else {
          setTextoExibicao(formatarMoeda(num, { semSimbolo: true }));
        }
      }
    }
  }, [value, emFoco, permitirVazio]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Permite apenas dígitos, vírgula, ponto e hífen
    const limpo = raw.replace(/[^\d,.-]/g, '');
    setTextoExibicao(limpo);

    const valorFloat = parseMoedaBanco(limpo);
    onChange(valorFloat);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setEmFoco(true);
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setEmFoco(false);
    const floatValor = parseMoedaBanco(textoExibicao);

    if (permitirVazio && (!textoExibicao.trim() || floatValor === 0)) {
      setTextoExibicao('');
      onChange(0);
    } else {
      const formatado = formatarMoeda(floatValor, { semSimbolo: true });
      setTextoExibicao(formatado);
      onChange(floatValor);
    }

    if (onBlur) onBlur(e);
  };

  const inputClasses = `w-full h-11 bg-white dark:bg-[#000000] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl px-3.5 text-xs font-bold text-right focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
    mostrarPrefixo ? 'pl-9 pr-3.5' : 'px-3.5'
  } ${className}`;

  if (!mostrarPrefixo) {
    return (
      <input
        type="text"
        inputMode="decimal"
        value={textoExibicao}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={inputClasses}
        {...props}
      />
    );
  }

  return (
    <div className={`relative w-full ${containerClassName}`}>
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none select-none">
        R$
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={textoExibicao}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={inputClasses}
        {...props}
      />
    </div>
  );
};
