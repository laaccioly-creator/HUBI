import React, { useId } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

export interface CockpitGaugeF1Props {
  titulo: string;
  subtituloTag?: string;
  valorRealizado: number;
  valorMeta: number;
  tipoFormato: 'moeda' | 'inteiro' | 'percentual';
  escalaInvertida?: boolean;
  variacaoPeriodoAnterior?: number; // Ex: +12.5 ou -3.2
  valorExibicaoCustomizado?: string;
  metaExibicaoCustomizada?: string;
  onClickDrillDown?: () => void;
  isLoading?: boolean;
}

export const CockpitGaugeF1: React.FC<CockpitGaugeF1Props> = ({
  titulo,
  subtituloTag,
  valorRealizado,
  valorMeta,
  tipoFormato,
  escalaInvertida = false,
  variacaoPeriodoAnterior,
  valorExibicaoCustomizado,
  metaExibicaoCustomizada,
  onClickDrillDown,
  isLoading = false
}) => {
  const gradientId = useId();
  const { tema } = useTheme();
  const isDark = tema === 'dark';

  // Skeleton de carregamento
  if (isLoading) {
    return (
      <div className={`rounded-2xl p-5 flex flex-col justify-between h-full animate-pulse min-h-[260px] ${isDark ? 'bg-slate-900/90 border-2 border-slate-200 shadow-lg shadow-black/50' : 'bg-slate-100 border border-slate-200 shadow-sm'}`}>
        <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
          <div className={`h-4 rounded w-28 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
          <div className={`h-4 rounded-full w-12 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
        </div>
        <div className="flex items-center justify-center my-4">
          <div className={`w-40 h-24 rounded-t-full border-t-8 ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-200 border-slate-300'}`} />
        </div>
        <div className={`space-y-2 pt-2 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
          <div className={`h-4 rounded w-3/4 mx-auto ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
          <div className={`h-3 rounded w-1/2 mx-auto ${isDark ? 'bg-slate-900' : 'bg-slate-200'}`} />
        </div>
      </div>
    );
  }

  // 1. Cálculos de Metas e Percentuais
  const ehNegativo = valorRealizado < 0;
  const metaValida = Number(valorMeta || 0);
  const realizadoValido = Number(valorRealizado || 0);

  // Percentual em relação à meta
  let percentualMeta = 0;
  if (metaValida > 0) {
    percentualMeta = Math.max(0, (realizadoValido / metaValida) * 100);
  } else if (realizadoValido > 0) {
    percentualMeta = 100;
  }

  // Escala visual máxima do velocímetro: 125% da meta
  const escalaMaxima = 125;
  const percentualLimitado = Math.min(Math.max(ehNegativo ? 0 : percentualMeta, 0), escalaMaxima);

  // Ângulo de rotação da agulha (-90deg a +90deg)
  const anguloAgulha = ehNegativo
    ? -90
    : -90 + (percentualLimitado / escalaMaxima) * 180;

  // 2. Parâmetros Geométricos do Arco Semicircular SVG
  const cx = 110;
  const cy = 105;
  const raio = 82;
  const raioTrilha = 82;
  const compArco = Math.PI * raio; // ~257.61

  // Proporção de preenchimento do arco colorido
  const proporcaoPreenchimento = Math.min(1, Math.max(0, percentualLimitado / escalaMaxima));
  const dashOffset = compArco * (1 - proporcaoPreenchimento);

  // Ponto exato da meta de 100% no arco (100 / 125 = 0.8 do arco)
  const propMeta = 100 / escalaMaxima; // 0.8
  const anguloMetaRad = Math.PI * (1 - propMeta); // Ângulo polar
  const metaTickX1 = cx + (raioTrilha - 10) * Math.cos(anguloMetaRad);
  const metaTickY1 = cy - (raioTrilha - 10) * Math.sin(anguloMetaRad);
  const metaTickX2 = cx + (raioTrilha + 10) * Math.cos(anguloMetaRad);
  const metaTickY2 = cy - (raioTrilha + 10) * Math.sin(anguloMetaRad);

  // 3. Formatação dos Valores
  const formatarValor = (val: number): string => {
    if (tipoFormato === 'moeda') {
      return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (tipoFormato === 'percentual') {
      return `${val.toFixed(1)}%`;
    }
    return Math.round(val).toLocaleString('pt-BR');
  };

  const textoRealizado = formatarValor(realizadoValido);
  const textoMeta = formatarValor(metaValida);

  // 4. Status e Cores do Badge de Desempenho
  let badgeCor = 'text-slate-900 dark:text-emerald-400 bg-emerald-200 dark:bg-emerald-500/10 border-emerald-400/60 dark:border-emerald-500/20';
  let badgeTexto = `${percentualMeta.toFixed(1)}%`;
  let atingiuMeta = false;

  if (escalaInvertida) {
    if (tipoFormato === 'moeda') {
      // Para Despesas Operacionais (teto orçamentário: <= 80% verde, 80-100% amarelo, > 100% vermelho)
      if (metaValida > 0) {
        if (percentualMeta <= 80) {
          badgeCor = 'text-slate-900 dark:text-emerald-400 bg-emerald-200 dark:bg-emerald-500/10 border-emerald-400/60 dark:border-emerald-500/20';
          badgeTexto = `Dentro da meta (${percentualMeta.toFixed(0)}%)`;
          atingiuMeta = true;
        } else if (percentualMeta <= 100) {
          badgeCor = 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/20';
          badgeTexto = `No limite (${percentualMeta.toFixed(0)}%)`;
        } else {
          badgeCor = 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/20 border-rose-300 dark:border-rose-500/30';
          badgeTexto = `Estouro (${percentualMeta.toFixed(0)}%)`;
        }
      } else {
        badgeCor = realizadoValido === 0
          ? 'text-slate-900 dark:text-emerald-400 bg-emerald-200 dark:bg-emerald-500/10 border-emerald-400/60 dark:border-emerald-500/20'
          : 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/20';
        badgeTexto = realizadoValido === 0 ? 'Sem despesas' : 'Sem meta';
        atingiuMeta = realizadoValido === 0;
      }
    } else {
      // Para Inadimplência e Saúde do Estoque (quanto menor, melhor)
      const atingiu = metaValida > 0 ? realizadoValido <= metaValida : realizadoValido === 0;
      if (atingiu) {
        badgeCor = 'text-slate-900 dark:text-emerald-400 bg-emerald-200 dark:bg-emerald-500/10 border-emerald-400/60 dark:border-emerald-500/20';
        badgeTexto = tipoFormato === 'percentual'
          ? `Saudável (${realizadoValido.toFixed(1)}% / máx ${metaValida.toFixed(1)}%)`
          : `Saudável (${realizadoValido} / máx ${metaValida})`;
        atingiuMeta = true;
      } else if (metaValida > 0 && realizadoValido <= metaValida * 1.5) {
        badgeCor = 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/20';
        badgeTexto = tipoFormato === 'percentual'
          ? `Atenção (${realizadoValido.toFixed(1)}%)`
          : `Atenção (${realizadoValido} itens)`;
      } else {
        badgeCor = 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/20 border-rose-300 dark:border-rose-500/30';
        badgeTexto = tipoFormato === 'percentual'
          ? `Crítico (${realizadoValido.toFixed(1)}%)`
          : `Crítico (${realizadoValido} itens)`;
      }
    }
  } else {
    // Escala Padrão: quanto maior, melhor
    if (ehNegativo) {
      badgeCor = 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/20 border-rose-300 dark:border-rose-500/30';
      badgeTexto = 'Prejuízo';
    } else if (percentualMeta >= 100) {
      badgeCor = 'text-slate-900 dark:text-emerald-400 bg-emerald-200 dark:bg-emerald-500/10 border-emerald-400/60 dark:border-emerald-500/20';
      badgeTexto = `${percentualMeta.toFixed(0)}% da meta`;
      atingiuMeta = true;
    } else if (percentualMeta >= 75) {
      badgeCor = 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/20';
      badgeTexto = `${percentualMeta.toFixed(0)}% da meta`;
    } else {
      badgeCor = 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/20 border-rose-300 dark:border-rose-500/30';
      badgeTexto = `${percentualMeta.toFixed(0)}% da meta`;
    }
  }

  // 5. Tendência vs Período Anterior
  const temVariacao = typeof variacaoPeriodoAnterior === 'number' && !isNaN(variacaoPeriodoAnterior);
  const variacaoPositiva = (variacaoPeriodoAnterior || 0) >= 0;
  // Se for escala invertida (inadimplência ou despesas), subida é ruim e queda é boa
  const variacaoEhBoa = escalaInvertida ? !variacaoPositiva : variacaoPositiva;

  return (
    <div
      onClick={onClickDrillDown}
      className={`rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 select-none ${
        isDark
          ? 'bg-slate-900/90 border-2 border-slate-200 shadow-lg shadow-black/50'
          : 'bg-slate-100 border border-slate-200 shadow-sm hover:border-emerald-300'
      } ${
        onClickDrillDown
          ? 'cursor-pointer hover:shadow-2xl hover:shadow-emerald-500/5 group active:scale-[0.99]'
          : ''
      }`}
    >
      {/* Topo do Card: Título da Métrica + Badge de Percentual */}
      <div className={`flex items-start justify-between gap-2 pb-2 border-b ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`font-bold text-xs uppercase tracking-wider truncate ${isDark ? 'text-slate-300' : 'text-[#475569]'}`}>
              {titulo}
            </span>
            {onClickDrillDown && (
              <ChevronRight className={`w-3.5 h-3.5 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition shrink-0 ${isDark ? 'text-slate-500' : 'text-[#94A3B8]'}`} />
            )}
          </div>
          {subtituloTag && (
            <span className={`text-[10px] font-medium truncate mt-0.5 ${isDark ? 'text-emerald-400/90' : 'text-[#047857]'}`}>
              {subtituloTag}
            </span>
          )}
        </div>

        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider whitespace-nowrap shrink-0 flex items-center gap-1 ${badgeCor}`}>
          {atingiuMeta && <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />}
          <span>{badgeTexto}</span>
        </span>
      </div>

      {/* Centro: Gráfico Semicircular Vetorial Estilo F1 */}
      <div className="relative flex flex-col items-center justify-center pt-3 pb-1">
        <svg
          viewBox="0 0 220 130"
          className="w-full max-w-[210px] h-auto overflow-visible"
        >
          <defs>
            {/* Gradiente Escala Normal Tricolor Fixo: Vermelho (0-60%) -> Amarelo (60-80%) -> Verde (80-100%) */}
            <linearGradient id={`${gradientId}-normal`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="55%" stopColor="#ef4444" />
              <stop offset="65%" stopColor="#f59e0b" />
              <stop offset="78%" stopColor="#eab308" />
              <stop offset="82%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>

            {/* Gradiente Escala Invertida Tricolor Fixo: Verde (0-60%) -> Amarelo (60-80%) -> Vermelho (80-100%) */}
            <linearGradient id={`${gradientId}-invertido`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="55%" stopColor="#10b981" />
              <stop offset="65%" stopColor="#f59e0b" />
              <stop offset="78%" stopColor="#eab308" />
              <stop offset="82%" stopColor="#ef4444" />
              <stop offset="100%" stopColor="#dc2626" />
            </linearGradient>

            {/* Filtro de Sombra Suave para o Ponteiro */}
            <filter id={`${gradientId}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity={isDark ? "0.8" : "0.2"} />
            </filter>
          </defs>

          {/* 1. Trilha de Fundo Estrutural */}
          <path
            d={`M ${cx - raioTrilha} ${cy} A ${raioTrilha} ${raioTrilha} 0 0 1 ${cx + raioTrilha} ${cy}`}
            fill="none"
            stroke={isDark ? '#0f172a' : '#E2E8F0'}
            strokeWidth="14"
            strokeLinecap="round"
          />

          {/* 2. Arco Tricolor Contínuo Fixo (180 graus de ponta a ponta) */}
          <path
            d={`M ${cx - raioTrilha} ${cy} A ${raioTrilha} ${raioTrilha} 0 0 1 ${cx + raioTrilha} ${cy}`}
            fill="none"
            stroke={`url(#${gradientId}-${escalaInvertida ? 'invertido' : 'normal'})`}
            strokeWidth="11"
            strokeLinecap="round"
            opacity="0.95"
          />

          {/* 3. Marcador / Tick de Meta (100%) no divisor exato */}
          <line
            x1={metaTickX1}
            y1={metaTickY1}
            x2={metaTickX2}
            y2={metaTickY2}
            stroke={isDark ? '#ffffff' : '#0F172A'}
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.95"
          />

          {/* 4. Agulha / Ponteiro Esportivo Dinâmico */}
          <g
            style={{
              transform: `rotate(${anguloAgulha}deg)`,
              transformOrigin: `${cx}px ${cy}px`
            }}
            className="transition-transform duration-700 ease-out"
            filter={`url(#${gradientId}-shadow)`}
          >
            {/* Lança Afunilada do Ponteiro */}
            <polygon
              points={`${cx - 2.5},${cy} ${cx},${cy - raio + 12} ${cx + 2.5},${cy} ${cx},${cy + 8}`}
              fill={isDark ? '#ffffff' : '#0F172A'}
            />
            {/* Ponta de Destaque da Agulha */}
            <circle
              cx={cx}
              cy={cy - raio + 12}
              r="2.5"
              fill={escalaInvertida ? (realizadoValido <= metaValida ? '#10b981' : '#ef4444') : (percentualMeta >= 100 ? '#10b981' : percentualMeta >= 75 ? '#eab308' : '#ef4444')}
            />
          </g>

          {/* 5. Pivô Central Circular */}
          <circle
            cx={cx}
            cy={cy}
            r="8"
            fill={isDark ? '#090d16' : '#FFFFFF'}
            stroke={isDark ? '#334155' : '#CBD5E1'}
            strokeWidth="2.5"
          />
          <circle
            cx={cx}
            cy={cy}
            r="3"
            fill={escalaInvertida && realizadoValido > metaValida ? '#ef4444' : '#10b981'}
          />
        </svg>

        {/* Valor Realizado em Destaque Central */}
        <div className="text-center -mt-3 space-y-0.5">
          <div className={`font-black text-2xl md:text-3xl tracking-tight font-sans ${isDark ? 'text-white' : 'text-[#0F172A]'}`}>
            {valorExibicaoCustomizado || textoRealizado}
          </div>

          {ehNegativo && (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[10px] font-black uppercase tracking-wider">
              <AlertTriangle className="w-3 h-3" />
              <span>Prejuízo Operacional</span>
            </div>
          )}
        </div>
      </div>

      {/* Rodapé: Meta Proporcional + Variação do Período Anterior */}
      <div className={`pt-2 border-t flex items-center justify-between text-xs font-mono ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
        <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          Meta: <strong className={isDark ? 'text-slate-200' : 'text-slate-900'}>{metaExibicaoCustomizada || textoMeta}</strong>
        </span>

        {temVariacao && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
              variacaoEhBoa ? (isDark ? 'text-emerald-400' : 'text-[#047857]') : 'text-rose-500'
            }`}
            title={`Variação em relação ao período anterior (${variacaoPositiva ? '+' : ''}${variacaoPeriodoAnterior?.toFixed(1)}%)`}
          >
            {variacaoPositiva ? (
              <TrendingUp className="w-3 h-3 shrink-0" />
            ) : (
              <TrendingDown className="w-3 h-3 shrink-0" />
            )}
            <span>
              {variacaoPositiva ? '+' : ''}
              {variacaoPeriodoAnterior?.toFixed(1)}%
            </span>
          </span>
        )}
      </div>
    </div>
  );
};
