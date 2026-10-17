import { supabase } from '../lib/supabase';

export type NivelLog = 'ERROR' | 'WARN' | 'FATAL' | 'INFO';

export interface EntradaLog {
  loja_id?: string | null;
  organizacao_id?: string | null;
  usuario_id?: string | null;
  nivel: NivelLog;
  origem: string;
  contexto: string;
  mensagem: string;
  codigo_erro?: string | null;
  stack_trace?: string | null;
  rota_url?: string | null;
  dispositivo_info?: string | null;
}

export interface ContextoGlobalLogger {
  lojaId?: string | null;
  organizacaoId?: string | null;
  usuarioId?: string | null;
}

/**
 * Sanitizador de PII e Segredos para conformidade estrita com LGPD (pii-leak-detector)
 */
function sanitizarTexto(texto: string): string {
  if (!texto) return '';

  return texto
    // E-mails
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '***@***.***')
    // CPFs formatados ou numéricos (11 dígitos)
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '***.***.***-**')
    // CNPJs formatados
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '**.***.***/****-**')
    // Telefones / WhatsApp (ex: +55 81 99999-9999 ou (81) 99999-9999)
    .replace(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4}[-\s]?\d{4})\b/g, '(**) *****-****')
    // Chaves de API / Bearer Tokens / Secrets
    .replace(/(Bearer\s+)[a-zA-Z0-9\-._~+/]+=*/gi, '$1[TOKEN_REDACTED]')
    .replace(/(sk_live_[a-zA-Z0-9_]+|key-[a-zA-Z0-9_]+|serpapi_[a-zA-Z0-9_]+)/gi, '[API_KEY_REDACTED]');
}

class LoggerService {
  private static instance: LoggerService;
  private filaLogs: EntradaLog[] = [];
  private timeoutEnvio: NodeJS.Timeout | null = null;
  private enviando: boolean = false;
  private contextoGlobal: ContextoGlobalLogger = {};

  private constructor() {
    // Singleton privado
  }

  public static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  /**
   * Define o contexto global de tenant/usuário ativo para enriquecer logs automáticos
   */
  public definirContexto(contexto: ContextoGlobalLogger): void {
    this.contextoGlobal = { ...this.contextoGlobal, ...contexto };
  }

  /**
   * Registra um erro crítico ou exceção no sistema
   */
  public error(
    origem: string,
    contexto: string,
    erro: unknown,
    opcoes?: Partial<EntradaLog>
  ): void {
    this.registrar('ERROR', origem, contexto, erro, opcoes);
  }

  /**
   * Registra um alerta operacional ou aviso de salvaguarda
   */
  public warn(
    origem: string,
    contexto: string,
    mensagem: string,
    opcoes?: Partial<EntradaLog>
  ): void {
    this.registrar('WARN', origem, contexto, mensagem, opcoes);
  }

  /**
   * Registra uma falha fatal com despacho imediato
   */
  public fatal(
    origem: string,
    contexto: string,
    erro: unknown,
    opcoes?: Partial<EntradaLog>
  ): void {
    this.registrar('FATAL', origem, contexto, erro, { ...opcoes }, true);
  }

  /**
   * Registra um evento informativo de auditoria
   */
  public info(
    origem: string,
    contexto: string,
    mensagem: string,
    opcoes?: Partial<EntradaLog>
  ): void {
    this.registrar('INFO', origem, contexto, mensagem, opcoes);
  }

  /**
   * Processa a entrada de log, sanitiza PII e adiciona à fila de despacho
   */
  private registrar(
    nivel: NivelLog,
    origem: string,
    contexto: string,
    conteudo: unknown,
    opcoes?: Partial<EntradaLog>,
    imediato: boolean = false
  ): void {
    let mensagemBruta = '';
    let stackTrace: string | null = null;
    let codigoErro: string | null = null;

    if (conteudo instanceof Error) {
      mensagemBruta = conteudo.message || 'Erro sem mensagem definida';
      stackTrace = conteudo.stack || null;
      codigoErro = (conteudo as any).code || null;
    } else if (typeof conteudo === 'string') {
      mensagemBruta = conteudo;
    } else if (conteudo && typeof conteudo === 'object') {
      mensagemBruta = (conteudo as any).message || JSON.stringify(conteudo);
      codigoErro = (conteudo as any).code || null;
    } else {
      mensagemBruta = String(conteudo);
    }

    const mensagemSanitizada = sanitizarTexto(mensagemBruta);
    const stackSanitizada = stackTrace ? sanitizarTexto(stackTrace) : null;
    const rotaAtual = typeof window !== 'undefined' ? window.location.pathname + window.location.search : null;
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 250) : null;

    const entrada: EntradaLog = {
      loja_id: opcoes?.loja_id || this.contextoGlobal.lojaId || null,
      organizacao_id: opcoes?.organizacao_id || this.contextoGlobal.organizacaoId || null,
      usuario_id: opcoes?.usuario_id || this.contextoGlobal.usuarioId || null,
      nivel,
      origem: origem.slice(0, 60),
      contexto: contexto.slice(0, 120),
      mensagem: mensagemSanitizada.slice(0, 4000),
      codigo_erro: (codigoErro || opcoes?.codigo_erro || null)?.toString().slice(0, 50),
      stack_trace: stackSanitizada ? stackSanitizada.slice(0, 6000) : null,
      rota_url: (opcoes?.rota_url || rotaAtual)?.slice(0, 255),
      dispositivo_info: (opcoes?.dispositivo_info || userAgent)?.slice(0, 255),
    };

    // Log visual no console em ambiente de desenvolvimento
    if (import.meta.env.DEV) {
      const estilo =
        nivel === 'FATAL'
          ? 'color: #ff0055; font-weight: bold;'
          : nivel === 'ERROR'
          ? 'color: #ef4444; font-weight: bold;'
          : nivel === 'WARN'
          ? 'color: #f59e0b; font-weight: bold;'
          : 'color: #10b981;';

      console.groupCollapsed(`%c[HUBI ${nivel}] ${origem} -> ${contexto}`, estilo);
      console.log('Mensagem:', mensagemSanitizada);
      if (stackTrace) console.log('Stack:', stackTrace);
      console.log('Metadados:', entrada);
      console.groupEnd();
    }

    this.filaLogs.push(entrada);

    if (imediato || this.filaLogs.length >= 10) {
      this.despacharFila();
    } else if (!this.timeoutEnvio) {
      this.timeoutEnvio = setTimeout(() => {
        this.timeoutEnvio = null;
        this.despacharFila();
      }, 1500);
    }
  }

  /**
   * Envia os logs acumulados para o Supabase sem bloquear a thread principal
   */
  private async despacharFila(): Promise<void> {
    if (this.enviando || this.filaLogs.length === 0) return;

    this.enviando = true;
    const lote = [...this.filaLogs];
    this.filaLogs = [];

    try {
      const { error } = await supabase.from('sistema_logs').insert(lote);

      if (error) {
        // Exibe aviso local sem reinserir na fila para evitar loop de falhas
        if (import.meta.env.DEV) {
          console.warn('[LoggerService] Não foi possível persistir lote de logs no Supabase:', error.message);
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[LoggerService] Exceção de rede ao enviar logs:', err);
      }
    } finally {
      this.enviando = false;

      // Se novos logs entraram na fila durante o envio, agenda próximo ciclo
      if (this.filaLogs.length > 0 && !this.timeoutEnvio) {
        this.timeoutEnvio = setTimeout(() => {
          this.timeoutEnvio = null;
          this.despacharFila();
        }, 1500);
      }
    }
  }
}

export const logger = LoggerService.getInstance();
