export interface MensagemRubi {
  id: string;
  remetente: 'usuario' | 'ia';
  texto: string;
  data: string;
}

const STORAGE_KEY = 'hubi_rubi_chat_historico';
const SINAL_ABRIR_FLUTUANTE_KEY = 'hubi_rubi_abrir_flutuante';

const MENSAGEM_BOAS_VINDAS: MensagemRubi = {
  id: 'boas-vindas',
  remetente: 'ia',
  texto: 'Olá! Sou a **Rubi**, sua assistente inteligente no **HUBI**. 🚀\n\nPosso te ajudar com perguntas sobre suas vendas de hoje, estoque baixo, produtos mais vendidos ou calcular seu fluxo de caixa.\n\nComo posso ajudar o seu negócio hoje?',
  data: new Date().toISOString()
};

export const rubiChatService = {
  /**
   * Obtém o histórico unificado de mensagens da Rubi IA compartilhado entre tela reduzida e tela cheia
   */
  obterHistorico(): MensagemRubi[] {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar histórico Rubi:', e);
    }
    return [MENSAGEM_BOAS_VINDAS];
  },

  /**
   * Salva o histórico unificado no localStorage
   */
  salvarHistorico(mensagens: MensagemRubi[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mensagens));
    } catch (e) {
      console.warn('Erro ao salvar histórico Rubi:', e);
    }
  },

  /**
   * Limpa o histórico restaurando a mensagem inicial
   */
  limparHistorico(): MensagemRubi[] {
    const padrao: MensagemRubi[] = [{ ...MENSAGEM_BOAS_VINDAS, data: new Date().toISOString() }];
    this.salvarHistorico(padrao);
    return padrao;
  },

  /**
   * Registra um sinal para que, ao sair da tela cheia, o widget flutuante/reduzido abra automaticamente
   */
  solicitarAberturaFlutuante(): void {
    try {
      localStorage.setItem(SINAL_ABRIR_FLUTUANTE_KEY, 'true');
    } catch {}
  },

  /**
   * Consome o sinal de abertura do widget flutuante
   */
  verificarESinalizarAberturaFlutuante(): boolean {
    try {
      const precisa = localStorage.getItem(SINAL_ABRIR_FLUTUANTE_KEY) === 'true';
      if (precisa) {
        localStorage.removeItem(SINAL_ABRIR_FLUTUANTE_KEY);
      }
      return precisa;
    } catch {
      return false;
    }
  }
};
