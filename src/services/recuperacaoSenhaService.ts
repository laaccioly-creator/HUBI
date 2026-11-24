import { supabase } from '../lib/supabase';
import { normalizarTelefoneComDDI } from '../utils/formatters';

export interface RespostaRecuperacaoSenha {
  sucesso: boolean;
  mensagem?: string;
  erro?: string;
}

async function invocarRecuperacao(
  payload: Record<string, unknown>
): Promise<RespostaRecuperacaoSenha> {
  try {
    const { data, error } = await supabase.functions.invoke<RespostaRecuperacaoSenha>(
      'recuperar-senha-whatsapp',
      { body: payload }
    );

    if (error) {
      try {
        const contexto = (
          error as { context?: { json?: () => Promise<{ erro?: string; mensagem?: string }> } }
        ).context;
        if (contexto && typeof contexto.json === 'function') {
          const corpoErro = await contexto.json();
          if (corpoErro?.erro) {
            return { sucesso: false, erro: corpoErro.erro };
          }
        }
      } catch {
        // Ignora erro de parse do corpo HTTP de erro
      }
      return {
        sucesso: false,
        erro: 'Não foi possível concluir a solicitação no momento. Tente novamente em instantes.',
      };
    }

    if (!data) {
      return {
        sucesso: false,
        erro: 'Resposta inválida do servidor. Tente novamente em instantes.',
      };
    }

    return data;
  } catch {
    return {
      sucesso: false,
      erro: 'Falha de conexão com o servidor. Verifique sua internet e tente novamente.',
    };
  }
}

export async function solicitarTokenRecuperacao(
  telefone: string
): Promise<RespostaRecuperacaoSenha> {
  const telefoneNormalizado = normalizarTelefoneComDDI(telefone) || telefone;
  return invocarRecuperacao({
    acao: 'solicitar_token',
    telefone: telefoneNormalizado,
  });
}

export async function validarTokenRecuperacao(
  telefone: string,
  codigo: string
): Promise<RespostaRecuperacaoSenha> {
  const telefoneNormalizado = normalizarTelefoneComDDI(telefone) || telefone;
  return invocarRecuperacao({
    acao: 'validar_token',
    telefone: telefoneNormalizado,
    codigo: codigo.replace(/\D/g, ''),
  });
}

export async function redefinirSenhaComToken(
  telefone: string,
  codigo: string,
  novaSenha: string
): Promise<RespostaRecuperacaoSenha> {
  const telefoneNormalizado = normalizarTelefoneComDDI(telefone) || telefone;
  return invocarRecuperacao({
    acao: 'validar_e_redefinir',
    telefone: telefoneNormalizado,
    codigo: codigo.replace(/\D/g, ''),
    nova_senha: novaSenha,
  });
}
