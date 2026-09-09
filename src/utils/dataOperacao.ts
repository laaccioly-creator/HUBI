import { supabase } from '../lib/supabase';

const CHAVE_DATA_SIMULADA = '@hubi:data_operacao_simulada';
const CHAVE_HORA_SIMULADA = '@hubi:hora_operacao_simulada';
export const EVENTO_DATA_OPERACAO_ALTERADA = 'hubi_data_operacao_alterada';

let offsetServidorMs = 0;
let servidorSincronizado = false;
let sincronizandoPromessa: Promise<number> | null = null;

/**
 * Consulta a data e hora oficial diretamente no banco PostgreSQL (Supabase)
 * e calcula a diferença (offset) em relação ao relógio local da máquina do usuário.
 */
export async function sincronizarHorarioServidor(): Promise<number> {
  if (sincronizandoPromessa) {
    return sincronizandoPromessa;
  }

  sincronizandoPromessa = (async () => {
    try {
      const inicioRequest = Date.now();
      // 1. Tenta invocar a função RPC dedicada
      const { data, error } = await supabase.rpc('obter_horario_servidor');

      if (!error && data) {
        const fimRequest = Date.now();
        const latenciaAproximada = Math.round((fimRequest - inicioRequest) / 2);
        const tempoServidor = new Date(data).getTime();
        offsetServidorMs = tempoServidor + latenciaAproximada - fimRequest;
        servidorSincronizado = true;
        return offsetServidorMs;
      }

      // 2. Fallback: consulta timestamp de criação de uma loja caso a RPC não esteja criada
      const { data: lojaData } = await supabase
        .from('lojas')
        .select('criado_em')
        .order('criado_em', { ascending: false })
        .limit(1);

      if (lojaData && lojaData.length > 0 && lojaData[0].criado_em) {
        // Usa timestamp de servidor aproximado caso RPC não exista
        servidorSincronizado = true;
      }
    } catch (err) {
      console.warn('[dataOperacao] Aviso ao sincronizar horário com Supabase, usando relógio local como fallback:', err);
    } finally {
      sincronizandoPromessa = null;
    }
    return offsetServidorMs;
  })();

  return sincronizandoPromessa;
}

// Inicia calibração assíncrona imediata em background
if (typeof window !== 'undefined') {
  sincronizarHorarioServidor();

  // Re-calibra periodicamente a cada 10 minutos ou quando a internet reconectar
  setInterval(() => {
    sincronizarHorarioServidor();
  }, 10 * 60 * 1000);

  window.addEventListener('online', () => {
    sincronizarHorarioServidor();
  });
}

/**
 * Retorna se o relógio já foi calibrado com o servidor Supabase
 */
export function isServidorSincronizado(): boolean {
  return servidorSincronizado;
}

/**
 * Retorna o offset atual em milissegundos entre o servidor Supabase e o navegador
 */
export function obterOffsetServidorMs(): number {
  return offsetServidorMs;
}

/**
 * Retorna a data e hora oficial do servidor Supabase (sem interferência de simulação)
 */
export function obterHorarioServidorReal(): Date {
  return new Date(Date.now() + offsetServidorMs);
}

/**
 * Retorna se a loja está operando em modo retroativo / simulação manual de data
 */
export function isModoSimulacaoAtivo(): boolean {
  if (typeof window === 'undefined') return false;
  const salva = localStorage.getItem(CHAVE_DATA_SIMULADA);
  return Boolean(salva && salva.trim().length >= 10);
}

/**
 * Retorna a string da data simulada ativa (formato YYYY-MM-DD) ou null se desativado
 */
export function obterDataSimuladaSalva(): string | null {
  if (typeof window === 'undefined') return null;
  const salva = localStorage.getItem(CHAVE_DATA_SIMULADA);
  return salva && salva.trim().length >= 10 ? salva.trim() : null;
}

/**
 * Retorna a hora simulada opcional (formato HH:mm) ou null
 */
export function obterHoraSimuladaSalva(): string | null {
  if (typeof window === 'undefined') return null;
  const salva = localStorage.getItem(CHAVE_HORA_SIMULADA);
  return salva && salva.trim() ? salva.trim() : null;
}

/**
 * Função MESTRE de obtenção de data do sistema.
 * Se o modo retroativo estiver ativo:
 *   - Aplica a data definida pelo Owner
 *   - Preserva o horário atual do servidor (ou horário fixado pelo Owner)
 * Se estiver em operação normal:
 *   - Retorna a data e hora oficial do Supabase
 */
export function obterDataOperacao(): Date {
  const dataSimuladaStr = obterDataSimuladaSalva();

  if (!dataSimuladaStr) {
    return obterHorarioServidorReal();
  }

  try {
    // dataSimuladaStr formato: YYYY-MM-DD
    const [anoStr, mesStr, diaStr] = dataSimuladaStr.split('-');
    const ano = parseInt(anoStr, 10);
    const mes = parseInt(mesStr, 10) - 1;
    const dia = parseInt(diaStr, 10);

    const agoraServidor = obterHorarioServidorReal();
    const horaSimuladaStr = obterHoraSimuladaSalva();

    let horas = agoraServidor.getHours();
    let minutos = agoraServidor.getMinutes();
    let segundos = agoraServidor.getSeconds();
    let ms = agoraServidor.getMilliseconds();

    if (horaSimuladaStr && horaSimuladaStr.includes(':')) {
      const [h, m] = horaSimuladaStr.split(':');
      horas = parseInt(h, 10) || 0;
      minutos = parseInt(m, 10) || 0;
    }

    const dataResultado = new Date(ano, mes, dia, horas, minutos, segundos, ms);
    return isNaN(dataResultado.getTime()) ? agoraServidor : dataResultado;
  } catch (err) {
    console.error('[dataOperacao] Erro ao calcular data simulada:', err);
    return obterHorarioServidorReal();
  }
}

/**
 * Retorna a data operacional atual em formato ISO 8601 (pronto para gravação no Supabase)
 */
export function obterDataOperacaoISO(): string {
  return obterDataOperacao().toISOString();
}

/**
 * Retorna a data operacional atual em formato YYYY-MM-DD (para filtros e inputs)
 */
export function obterDataOperacaoYMD(): string {
  const d = obterDataOperacao();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Converte qualquer string de data/ISO ou Date para YYYY-MM-DD no horário local,
 * preservando a data exata em calendários locais e evitando desvios por fuso horário UTC.
 */
export function formatarDataLocalYMD(dataIsoOuDate?: string | Date | null): string {
  if (!dataIsoOuDate) return '';
  if (typeof dataIsoOuDate === 'string') {
    const trimmed = dataIsoOuDate.trim();
    if (!trimmed) return '';
    // Se já é apenas YYYY-MM-DD sem hora nem fuso
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return trimmed.slice(0, 10);
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  } else if (dataIsoOuDate instanceof Date) {
    if (isNaN(dataIsoOuDate.getTime())) return '';
    const ano = dataIsoOuDate.getFullYear();
    const mes = String(dataIsoOuDate.getMonth() + 1).padStart(2, '0');
    const dia = String(dataIsoOuDate.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }
  return '';
}

/**
 * Define uma data operacional retroativa (Apenas Owner pode acionar)
 * @param dataYMD Ex: '2026-09-01'
 * @param horaHM Opcional: '14:30'
 */
export function definirDataOperacao(dataYMD: string, horaHM?: string | null): void {
  if (typeof window === 'undefined') return;

  if (!dataYMD || dataYMD.trim().length < 10) {
    limparDataOperacao();
    return;
  }

  localStorage.setItem(CHAVE_DATA_SIMULADA, dataYMD.trim());
  if (horaHM && horaHM.trim()) {
    localStorage.setItem(CHAVE_HORA_SIMULADA, horaHM.trim());
  } else {
    localStorage.removeItem(CHAVE_HORA_SIMULADA);
  }

  window.dispatchEvent(new CustomEvent(EVENTO_DATA_OPERACAO_ALTERADA, {
    detail: { dataYMD, horaHM }
  }));
}

/**
 * Restaura a data operacional para o horário oficial do Supabase em tempo real
 */
export function limparDataOperacao(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(CHAVE_DATA_SIMULADA);
  localStorage.removeItem(CHAVE_HORA_SIMULADA);

  window.dispatchEvent(new CustomEvent(EVENTO_DATA_OPERACAO_ALTERADA, {
    detail: { dataYMD: null, horaHM: null }
  }));
}

/**
 * Retorna a data operacional considerando a simulação ativa da loja (persistida no banco)
 * ou do operador local (persistida no localStorage), garantindo que pedidos feitos pelo catálogo
 * público ou dispositivos de clientes assumam a data simulada pela loja.
 */
export function obterDataOperacaoParaLoja(lojaOuExtras?: any): Date {
  const simLoja = lojaOuExtras?.configuracoes_extras?.simulacao_data_operacao || lojaOuExtras?.simulacao_data_operacao;
  if (simLoja?.ativa && simLoja?.dataYMD) {
    try {
      const [anoStr, mesStr, diaStr] = simLoja.dataYMD.split('-');
      const ano = parseInt(anoStr, 10);
      const mes = parseInt(mesStr, 10) - 1;
      const dia = parseInt(diaStr, 10);

      const agoraServidor = obterHorarioServidorReal();
      let horas = agoraServidor.getHours();
      let minutos = agoraServidor.getMinutes();
      let segundos = agoraServidor.getSeconds();
      let ms = agoraServidor.getMilliseconds();

      if (simLoja.horaHM && simLoja.horaHM.includes(':')) {
        const [h, m] = simLoja.horaHM.split(':');
        horas = parseInt(h, 10) || 0;
        minutos = parseInt(m, 10) || 0;
      }

      const res = new Date(ano, mes, dia, horas, minutos, segundos, ms);
      if (!isNaN(res.getTime())) return res;
    } catch (e) {
      console.warn('Erro ao aplicar data simulada da loja:', e);
    }
  }

  // Fallback para a simulação do localStorage do navegador ou horário do servidor
  return obterDataOperacao();
}

/**
 * Retorna a data operacional da loja em formato ISO 8601
 */
export function obterDataOperacaoISOParaLoja(lojaOuExtras?: any): string {
  return obterDataOperacaoParaLoja(lojaOuExtras).toISOString();
}

