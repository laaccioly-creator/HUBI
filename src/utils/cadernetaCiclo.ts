import type { CicloCaderneta, Cliente, Loja } from '../types';

export interface DiaSemanaCaderneta {
  valor: number;
  nome: string;
  label: string;
}

export const DIAS_SEMANA_CADERNETA: DiaSemanaCaderneta[] = [
  { valor: 0, nome: 'Domingo', label: 'Todo domingo' },
  { valor: 1, nome: 'Segunda-feira', label: 'Toda segunda-feira' },
  { valor: 2, nome: 'Terça-feira', label: 'Toda terça-feira' },
  { valor: 3, nome: 'Quarta-feira', label: 'Toda quarta-feira' },
  { valor: 4, nome: 'Quinta-feira', label: 'Toda quinta-feira' },
  { valor: 5, nome: 'Sexta-feira', label: 'Toda sexta-feira' },
  { valor: 6, nome: 'Sábado', label: 'Todo sábado' },
];

export interface ConfigCicloCaderneta {
  ciclo: CicloCaderneta;
  diaVencimento1: number;
  diaVencimento2: number;
  diaSemana: number;
}

function clampDiaDoMes(valor: unknown, fallback: number = 10): number {
  const num = Number(valor);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(31, Math.max(1, Math.trunc(num)));
}

function clampDiaSemana(valor: unknown, fallback: number = 5): number {
  const num = Number(valor);
  if (!Number.isFinite(num)) return fallback;
  const inteiro = Math.trunc(num);
  return inteiro >= 0 && inteiro <= 6 ? inteiro : fallback;
}

function formatarDataYMDLocal(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function normalizarCicloCaderneta(valor?: string | null): CicloCaderneta {
  if (valor === 'semanal' || valor === 'quinzenal' || valor === 'mensal') {
    return valor;
  }
  return 'mensal';
}

export function sugerirSegundoDiaQuinzenal(primeiroDia: number): number {
  const d = clampDiaDoMes(primeiroDia, 15);
  if (d <= 15) {
    return Math.min(30, d + 15);
  }
  return Math.max(1, d - 15);
}

export function obterConfigCicloLoja(loja?: Partial<Loja> | null): ConfigCicloCaderneta {
  const pagExtras = loja?.configuracoes_extras?.pagamentos;
  const ciclo = normalizarCicloCaderneta(
    loja?.ciclo_padrao_caderneta ?? pagExtras?.ciclo_padrao_caderneta
  );
  const diaVencimento1 = clampDiaDoMes(
    loja?.dia_vencimento_padrao_caderneta ?? pagExtras?.dia_vencimento_padrao_caderneta,
    10
  );
  const diaVencimento2 = clampDiaDoMes(
    loja?.dia_vencimento_2_padrao_caderneta ?? pagExtras?.dia_vencimento_2_padrao_caderneta,
    sugerirSegundoDiaQuinzenal(diaVencimento1)
  );
  const diaSemana = clampDiaSemana(
    loja?.dia_semana_padrao_caderneta ?? pagExtras?.dia_semana_padrao_caderneta,
    5
  );

  return {
    ciclo,
    diaVencimento1,
    diaVencimento2,
    diaSemana,
  };
}

export function obterConfigCicloCliente(
  cliente?: Partial<Cliente> | null,
  loja?: Partial<Loja> | null
): ConfigCicloCaderneta {
  const padrao = obterConfigCicloLoja(loja);
  const ciclo = cliente?.ciclo_caderneta
    ? normalizarCicloCaderneta(cliente.ciclo_caderneta)
    : padrao.ciclo;

  const diaVencimento1 =
    cliente?.dia_vencimento_caderneta != null
      ? clampDiaDoMes(cliente.dia_vencimento_caderneta, padrao.diaVencimento1)
      : padrao.diaVencimento1;

  const diaVencimento2 =
    cliente?.dia_vencimento_2_caderneta != null
      ? clampDiaDoMes(
          cliente.dia_vencimento_2_caderneta,
          sugerirSegundoDiaQuinzenal(diaVencimento1)
        )
      : cliente?.dia_vencimento_caderneta != null
      ? sugerirSegundoDiaQuinzenal(diaVencimento1)
      : padrao.diaVencimento2;

  const diaSemana =
    cliente?.dia_semana_caderneta != null
      ? clampDiaSemana(cliente.dia_semana_caderneta, padrao.diaSemana)
      : padrao.diaSemana;

  return {
    ciclo,
    diaVencimento1,
    diaVencimento2,
    diaSemana,
  };
}

export function calcularProximoVencimentoPorCiclo(
  config: ConfigCicloCaderneta,
  dataBase: Date = new Date(),
  incluirHoje: boolean = true
): string {
  const ref = Number.isNaN(dataBase.getTime()) ? new Date() : dataBase;
  const base = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());

  if (config.ciclo === 'semanal') {
    const diaAlvo = clampDiaSemana(config.diaSemana, 5);
    const diaAtual = base.getDay();
    let diff = (diaAlvo - diaAtual + 7) % 7;
    if (diff === 0 && !incluirHoje) {
      diff = 7;
    }
    const alvo = new Date(base.getFullYear(), base.getMonth(), base.getDate() + diff);
    return formatarDataYMDLocal(alvo);
  }

  if (config.ciclo === 'quinzenal') {
    const d1 = clampDiaDoMes(config.diaVencimento1, 15);
    const d2 = clampDiaDoMes(config.diaVencimento2, sugerirSegundoDiaQuinzenal(d1));
    const diasOrdenados = Array.from(new Set([d1, d2])).sort((a, b) => a - b);

    const anoAtual = base.getFullYear();
    const mesAtual = base.getMonth();
    const ultimoDiaMesAtual = new Date(anoAtual, mesAtual + 1, 0).getDate();

    for (const diaCfg of diasOrdenados) {
      const diaEfetivo = Math.min(diaCfg, ultimoDiaMesAtual);
      const candidato = new Date(anoAtual, mesAtual, diaEfetivo);
      if (incluirHoje ? candidato >= base : candidato > base) {
        return formatarDataYMDLocal(candidato);
      }
    }

    let anoProx = anoAtual;
    let mesProx = mesAtual + 1;
    if (mesProx > 11) {
      mesProx = 0;
      anoProx += 1;
    }
    const ultimoDiaMesProx = new Date(anoProx, mesProx + 1, 0).getDate();
    const primeiroDiaProx = Math.min(diasOrdenados[0], ultimoDiaMesProx);
    return formatarDataYMDLocal(new Date(anoProx, mesProx, primeiroDiaProx));
  }

  // Ciclo mensal (padrão)
  const diaAlvo = clampDiaDoMes(config.diaVencimento1, 10);
  const anoAtual = base.getFullYear();
  const mesAtual = base.getMonth();
  const ultimoDiaMesAtual = new Date(anoAtual, mesAtual + 1, 0).getDate();
  const diaEfetivoAtual = Math.min(diaAlvo, ultimoDiaMesAtual);
  const candidatoAtual = new Date(anoAtual, mesAtual, diaEfetivoAtual);

  if (incluirHoje ? candidatoAtual >= base : candidatoAtual > base) {
    return formatarDataYMDLocal(candidatoAtual);
  }

  let anoProx = anoAtual;
  let mesProx = mesAtual + 1;
  if (mesProx > 11) {
    mesProx = 0;
    anoProx += 1;
  }
  const ultimoDiaMesProx = new Date(anoProx, mesProx + 1, 0).getDate();
  const diaEfetivoProx = Math.min(diaAlvo, ultimoDiaMesProx);
  return formatarDataYMDLocal(new Date(anoProx, mesProx, diaEfetivoProx));
}

export function formatarResumoCicloCaderneta(config: ConfigCicloCaderneta): string {
  if (config.ciclo === 'semanal') {
    const info = DIAS_SEMANA_CADERNETA.find(
      (d) => d.valor === clampDiaSemana(config.diaSemana, 5)
    );
    return `Semanal (${info?.nome || 'Sexta-feira'})`;
  }

  if (config.ciclo === 'quinzenal') {
    const d1 = clampDiaDoMes(config.diaVencimento1, 15);
    const d2 = clampDiaDoMes(config.diaVencimento2, sugerirSegundoDiaQuinzenal(d1));
    const [menor, maior] = [d1, d2].sort((a, b) => a - b);
    if (menor === maior) {
      return `Quinzenal (Dia ${menor})`;
    }
    return `Quinzenal (Dias ${menor} e ${maior})`;
  }

  const diaMensal = clampDiaDoMes(config.diaVencimento1, 10);
  return `Mensal (Todo dia ${diaMensal})`;
}
