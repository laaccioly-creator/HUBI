/**
 * Utilitário central de data, hora e fuso horário dinâmico (Multi-Loja SaaS).
 * Detecta automaticamente o fuso IANA do navegador/dispositivo e garante
 * cálculos civis e intervalos ISO com offset real, sem hardcode de fuso fixo.
 */

export const FUSO_HORARIO_FALLBACK = 'America/Fortaleza';

const REGEX_YMD = /^\d{4}-\d{2}-\d{2}$/;

function pad2(valor: number): string {
  return String(valor).padStart(2, '0');
}

/**
 * Detecta dinamicamente o fuso horário IANA do ambiente/navegador.
 * Faz fallback seguro para 'America/Fortaleza' apenas se o ambiente não retornar
 * um fuso válido.
 */
export function detectarFusoHorarioLocal(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved && typeof resolved === 'string' && resolved.trim().length > 0) {
      // Valida se o fuso retornado é aceito pelo motor Intl
      new Intl.DateTimeFormat('pt-BR', { timeZone: resolved });
      return resolved;
    }
  } catch {
    // Fallback seguro abaixo
  }
  return FUSO_HORARIO_FALLBACK;
}

/**
 * Retorna o fuso horário IANA ativo no dispositivo atual.
 */
export function obterFusoHorarioAtivo(): string {
  return detectarFusoHorarioLocal();
}

export const FUSO_HORARIO_ATIVO: string = detectarFusoHorarioLocal();

/**
 * Retorna a data civil exata no formato 'YYYY-MM-DD' no fuso horário informado
 * (padrão: fuso local detectado), evitando viradas de dia em UTC.
 */
export function obterDataLocalYYYYMMDD(
  date: Date | string = new Date(),
  timeZone: string = obterFusoHorarioAtivo()
): string {
  if (typeof date === 'string') {
    const trimmed = date.trim();
    if (!trimmed) return '';
    if (REGEX_YMD.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return '';
    date = parsed;
  }

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  if (!map.year || !map.month || !map.day) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * Retorna o ano e mês civis no formato 'YYYY-MM' no fuso horário informado.
 */
export function obterAnoMesLocalYYYYMM(
  date: Date | string = new Date(),
  timeZone: string = obterFusoHorarioAtivo()
): string {
  const ymd = obterDataLocalYYYYMMDD(date, timeZone);
  return ymd ? ymd.slice(0, 7) : '';
}

/**
 * Calcula o offset ISO real (±HH:MM, ex.: '-03:00', '-04:00', '-05:00')
 * do fuso horário informado na data/instante de referência.
 */
export function obterOffsetISOLocal(
  referencia: Date | string = new Date(),
  timeZone: string = obterFusoHorarioAtivo()
): string {
  let refDate: Date;

  if (typeof referencia === 'string') {
    const trimmed = referencia.trim();
    if (REGEX_YMD.test(trimmed)) {
      const [yStr, mStr, dStr] = trimmed.split('-');
      refDate = new Date(
        Date.UTC(parseInt(yStr, 10), parseInt(mStr, 10) - 1, parseInt(dStr, 10), 12, 0, 0)
      );
    } else {
      const parsed = new Date(trimmed);
      refDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    }
  } else {
    refDate = Number.isNaN(referencia.getTime()) ? new Date() : referencia;
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(refDate);

  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = parseInt(part.value, 10);
    }
  }

  const hora = map.hour === 24 ? 0 : (map.hour ?? 0);
  const zonedAsUtc = Date.UTC(
    map.year ?? refDate.getUTCFullYear(),
    (map.month ?? refDate.getUTCMonth() + 1) - 1,
    map.day ?? refDate.getUTCDate(),
    hora,
    map.minute ?? 0,
    map.second ?? 0
  );

  const refUtc = Date.UTC(
    refDate.getUTCFullYear(),
    refDate.getUTCMonth(),
    refDate.getUTCDate(),
    refDate.getUTCHours(),
    refDate.getUTCMinutes(),
    refDate.getUTCSeconds()
  );

  const offsetMin = Math.round((zonedAsUtc - refUtc) / 60000);
  const sinal = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const horasOffset = Math.floor(absMin / 60);
  const minutosOffset = absMin % 60;

  return `${sinal}${pad2(horasOffset)}:${pad2(minutosOffset)}`;
}

/**
 * Retorna o timestamp ISO completo de início do dia (00:00:00.000) com o offset
 * real do fuso horário naquela data (ex.: '2026-11-25T00:00:00.000-04:00').
 */
export function obterInicioDiaISO(
  dataYMD: string,
  timeZone: string = obterFusoHorarioAtivo()
): string {
  const trimmed = dataYMD.trim();
  const ymd = REGEX_YMD.test(trimmed)
    ? trimmed
    : obterDataLocalYYYYMMDD(trimmed, timeZone) || trimmed.slice(0, 10);

  const offsetInicial = obterOffsetISOLocal(ymd, timeZone);
  const instante = new Date(`${ymd}T00:00:00.000${offsetInicial}`);
  const offsetRefinado = Number.isNaN(instante.getTime())
    ? offsetInicial
    : obterOffsetISOLocal(instante, timeZone);

  return `${ymd}T00:00:00.000${offsetRefinado}`;
}

/**
 * Retorna o timestamp ISO completo de fim do dia (23:59:59.999) com o offset
 * real do fuso horário naquela data (ex.: '2026-11-25T23:59:59.999-04:00').
 */
export function obterFimDiaISO(
  dataYMD: string,
  timeZone: string = obterFusoHorarioAtivo()
): string {
  const trimmed = dataYMD.trim();
  const ymd = REGEX_YMD.test(trimmed)
    ? trimmed
    : obterDataLocalYYYYMMDD(trimmed, timeZone) || trimmed.slice(0, 10);

  const offsetInicial = obterOffsetISOLocal(ymd, timeZone);
  const instante = new Date(`${ymd}T23:59:59.999${offsetInicial}`);
  const offsetRefinado = Number.isNaN(instante.getTime())
    ? offsetInicial
    : obterOffsetISOLocal(instante, timeZone);

  return `${ymd}T23:59:59.999${offsetRefinado}`;
}

/**
 * Retorna o par { inicio, fim } em ISO com offset dinâmico local para queries de período.
 */
export function obterIntervaloDiaISO(
  dataInicioYMD: string,
  dataFimYMD: string = dataInicioYMD,
  timeZone: string = obterFusoHorarioAtivo()
): { inicio: string; fim: string } {
  return {
    inicio: obterInicioDiaISO(dataInicioYMD, timeZone),
    fim: obterFimDiaISO(dataFimYMD, timeZone),
  };
}

function converterParaDateLocal(
  valor: string | Date | number | null | undefined,
  timeZone: string
): Date | null {
  if (valor === null || valor === undefined || valor === '') return null;

  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor;
  }

  if (typeof valor === 'number') {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const trimmed = String(valor).trim();
  if (!trimmed) return null;

  if (REGEX_YMD.test(trimmed)) {
    const offset = obterOffsetISOLocal(trimmed, timeZone);
    const d = new Date(`${trimmed}T12:00:00${offset}`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Formata apenas a data em pt-BR respeitando o fuso horário ativo do dispositivo.
 */
export function formatarDataLocal(
  valor?: string | Date | number | null,
  opcoes?: Intl.DateTimeFormatOptions,
  timeZone: string = obterFusoHorarioAtivo()
): string {
  if (valor === null || valor === undefined || valor === '') return '-';
  const d = converterParaDateLocal(valor, timeZone);
  if (!d) return typeof valor === 'string' ? valor : '-';

  const temDateStyle = Boolean(opcoes?.dateStyle);
  const opcoesFinais: Intl.DateTimeFormatOptions = temDateStyle
    ? { timeZone, ...opcoes }
    : {
        timeZone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        ...opcoes,
      };

  return d.toLocaleString('pt-BR', opcoesFinais);
}

/**
 * Formata apenas a hora em pt-BR respeitando o fuso horário ativo do dispositivo.
 */
export function formatarHoraLocal(
  valor?: string | Date | number | null,
  opcoes?: Intl.DateTimeFormatOptions,
  timeZone: string = obterFusoHorarioAtivo()
): string {
  if (valor === null || valor === undefined || valor === '') return '-';
  const d = converterParaDateLocal(valor, timeZone);
  if (!d) return typeof valor === 'string' ? valor : '-';

  const temTimeStyle = Boolean(opcoes?.timeStyle);
  const opcoesFinais: Intl.DateTimeFormatOptions = temTimeStyle
    ? { timeZone, ...opcoes }
    : {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        ...(opcoes ?? { second: '2-digit' }),
      };

  return d.toLocaleString('pt-BR', opcoesFinais);
}

/**
 * Formata data e hora em pt-BR respeitando o fuso horário ativo do dispositivo.
 */
export function formatarDataHoraLocal(
  valor?: string | Date | number | null,
  opcoes?: Intl.DateTimeFormatOptions,
  timeZone: string = obterFusoHorarioAtivo()
): string {
  if (valor === null || valor === undefined || valor === '') return '-';
  const d = converterParaDateLocal(valor, timeZone);
  if (!d) return typeof valor === 'string' ? valor : '-';

  return d.toLocaleString('pt-BR', {
    timeZone,
    ...opcoes,
  });
}
