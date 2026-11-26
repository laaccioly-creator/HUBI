import { supabase } from '../lib/supabase';
import {
  SELECT_CLIENTE_CARRINHO_PUBLICO,
  SELECT_CLIENTE_NOTIFICACAO_PUBLICA,
  SELECT_CLIENTE_PUBLICO,
  SELECT_FORMA_ENTREGA_PUBLICA,
  SELECT_ITEM_PEDIDO_PUBLICO,
  SELECT_PAGAMENTO_PEDIDO_COM_FORMA,
  SELECT_PAGAMENTO_PREVISTO_PUBLICO,
  SELECT_PEDIDO_ENTREGA_PUBLICO,
  SELECT_PEDIDO_PUBLICO,
  SELECT_PRODUTO_PUBLICO,
} from '../lib/publicSelects';
import { Cliente, ClienteFavorito, ClienteNotificacao, ClienteCarrinhoItem, Pedido } from '../types';
import { normalizarTelefoneComDDI } from '../utils/formatters';

/**
 * Utilitário seguro para gerar hash de senha usando Web Crypto API nativa do navegador
 * Utiliza SHA-256 com salt determinístico escopado pela loja e identificador do cliente.
 */
export async function gerarHashSenhaCliente(senha: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const buffer = enc.encode(`${salt}:${senha.trim()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface DadosCadastroIdentificacao {
  nome: string;
  telefone: string;
  senha: string;
}

export interface DadosCadastroEndereco {
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
  latitude?: number;
  longitude?: number;
}

export const ClienteCatalogoService = {
  /**
   * Autenticação direta por Telefone/WhatsApp e Senha
   */
  async autenticarPorTelefone(
    lojaId: string,
    telefone: string,
    senha: string
  ): Promise<{ sucesso: boolean; cliente?: Cliente; erro?: string; precisaDefinirSenha?: boolean }> {
    try {
      const telDigitos = telefone.replace(/\D/g, '');
      if (telDigitos.length < 10) {
        return { sucesso: false, erro: 'Informe um número de celular válido com DDD (mínimo 10 dígitos).' };
      }

      const telDDI = normalizarTelefoneComDDI(telefone);
      const telSemDDI = telDDI.startsWith('55') ? telDDI.slice(2) : telDDI;

      const saltDDI = `${lojaId}:${telDDI}`;
      const saltSemDDI = `${lojaId}:${telSemDDI}`;
      const [hashDDI, hashSemDDI] = await Promise.all([
        gerarHashSenhaCliente(senha, saltDDI),
        gerarHashSenhaCliente(senha, saltSemDDI)
      ]);

      // Autenticação Zero-Trust via RPC SECURITY DEFINER (sem trafegar senha_hash no cliente)
      const { data: authRows, error: rpcError } = await supabase.rpc('rpc_autenticar_cliente_catalogo', {
        p_loja_id: lojaId,
        p_tel_ddi: telDDI,
        p_tel_sem_ddi: telSemDDI,
        p_hash_ddi: hashDDI,
        p_hash_sem_ddi: hashSemDDI,
        p_senha_legado: senha.trim()
      });

      if (rpcError) {
        console.error('Erro na RPC de autenticação do catálogo:', rpcError);
        return { sucesso: false, erro: 'Não foi possível verificar suas credenciais. Tente novamente.' };
      }

      const resultado = Array.isArray(authRows) ? authRows[0] : authRows;
      if (!resultado) {
        return { sucesso: false, erro: 'Nenhum cadastro encontrado com este celular nesta loja. Crie sua conta rapidinho!' };
      }

      if (!resultado.sucesso) {
        return {
          sucesso: false,
          erro: resultado.mensagem || 'Senha incorreta. Verifique e tente novamente.'
        };
      }

      const clientePublico: Cliente = {
        id: resultado.id,
        loja_id: resultado.loja_id,
        nome: resultado.nome,
        telefone: resultado.telefone,
        whatsapp: resultado.whatsapp,
        email: resultado.email,
        numero_documento: resultado.numero_documento,
        tabela_preco_padrao: resultado.tabela_preco_padrao,
        endereco_principal: resultado.endereco_principal,
        endereco_secundario: resultado.endereco_secundario,
        saldo_devedor_fiado: Number(resultado.saldo_devedor_fiado || 0),
        limite_credito: Number(resultado.limite_credito || 0),
        permite_fiado: Boolean(resultado.permite_fiado),
        data_aniversario: resultado.data_aniversario,
        observacoes: resultado.observacoes,
        permite_caderneta: Boolean(resultado.permite_caderneta),
        limite_caderneta: Number(resultado.limite_caderneta || 0),
        saldo_devedor_caderneta: Number(resultado.saldo_devedor_caderneta || 0),
        dia_vencimento_caderneta: resultado.dia_vencimento_caderneta,
        ciclo_caderneta: resultado.ciclo_caderneta,
        dia_semana_caderneta: resultado.dia_semana_caderneta,
        dia_vencimento_2_caderneta: resultado.dia_vencimento_2_caderneta,
        criado_em: resultado.criado_em,
      };

      return { sucesso: true, cliente: clientePublico };
    } catch (err: any) {
      console.error('Exceção ao autenticar cliente:', err);
      return { sucesso: false, erro: 'Falha na comunicação com o servidor. Verifique sua conexão.' };
    }
  },

  /**
   * Cadastro completo com identificação (Passo 1) e endereço principal relacional (Passo 2)
   */
  async cadastrarCliente(
    lojaId: string,
    identificacao: DadosCadastroIdentificacao,
    endereco: DadosCadastroEndereco
  ): Promise<{ sucesso: boolean; cliente?: Cliente; erro?: string; jaCadastrado?: boolean }> {
    try {
      const telDigitos = identificacao.telefone.replace(/\D/g, '');
      const cepLimpo = endereco.cep.replace(/\D/g, '');

      if (!identificacao.nome.trim()) {
        return { sucesso: false, erro: 'Por favor, informe seu nome completo.' };
      }
      if (telDigitos.length < 10) {
        return { sucesso: false, erro: 'Celular inválido. Informe o DDD e o número completo.' };
      }
      if (!identificacao.senha || identificacao.senha.trim().length < 6) {
        return { sucesso: false, erro: 'A senha deve ter no mínimo 6 caracteres.' };
      }
      if (cepLimpo.length !== 8) {
        return { sucesso: false, erro: 'CEP inválido. O CEP deve conter 8 dígitos.' };
      }
      if (!endereco.logradouro.trim() || !endereco.numero.trim() || !endereco.bairro.trim() || !endereco.cidade.trim() || !endereco.uf.trim()) {
        return { sucesso: false, erro: 'Por favor, preencha todos os campos obrigatórios do endereço.' };
      }

      const telDDI = normalizarTelefoneComDDI(identificacao.telefone);
      const telSemDDI = telDDI.startsWith('55') ? telDDI.slice(2) : telDDI;

      // 1. Regra de Chave Única: Bloquear tentativas de cadastro com número já existente
      const { data: existente } = await supabase
        .from('clientes')
        .select('id, nome, telefone, whatsapp')
        .eq('loja_id', lojaId)
        .or(`telefone.eq.${telDDI},whatsapp.eq.${telDDI},telefone.eq.${telSemDDI},whatsapp.eq.${telSemDDI}`)
        .limit(1)
        .maybeSingle();

      if (existente?.id) {
        return {
          sucesso: false,
          erro: `O celular informado já possui cadastro na loja (${existente.nome || 'Cliente'}). Por favor, clique em "Entrar" com sua senha ou solicite redefinição.`,
          jaCadastrado: true
        };
      }

      const salt = `${lojaId}:${telDDI}`;
      const hashSenha = await gerarHashSenhaCliente(identificacao.senha, salt);

      const enderecoFormatado = `${endereco.logradouro.trim()}, ${endereco.numero.trim()}${
        endereco.complemento?.trim() ? ` (${endereco.complemento.trim()})` : ''
      } - ${endereco.bairro.trim()}, ${endereco.cidade.trim()}/${endereco.uf.trim().toUpperCase()} - CEP: ${cepLimpo}`;

      // 2. Insere novo cliente com número único e sem e-mails dummy @hubi.app
      const { data: inserido, error: errIns } = await supabase
        .from('clientes')
        .insert([
          {
            loja_id: lojaId,
            nome: identificacao.nome.trim(),
            telefone: telDDI,
            whatsapp: telDDI,
            telefone_is_whatsapp: true,
            email: null,
            senha_hash: hashSenha,
            tabela_preco_padrao: 'varejo',
            permite_fiado: false,
            limite_credito: 0,
            saldo_devedor_fiado: 0,
            endereco_cep: cepLimpo,
            endereco_logradouro: endereco.logradouro.trim(),
            endereco_numero: endereco.numero.trim(),
            endereco_complemento: endereco.complemento?.trim() || null,
            endereco_bairro: endereco.bairro.trim(),
            endereco_cidade: endereco.cidade.trim(),
            endereco_estado: endereco.uf.trim().toUpperCase(),
            endereco_principal: enderecoFormatado
          }
        ])
        .select(SELECT_CLIENTE_PUBLICO)
        .single();

      if (errIns) throw errIns;
      const clienteSalvo: Cliente = inserido as Cliente;

      // 2. Persistência direta em cliente_enderecos com is_principal = true
      try {
        // Desmarcar outros endereços como principal
        await supabase
          .from('cliente_enderecos')
          .update({ is_principal: false })
          .eq('cliente_id', clienteSalvo.id);

        await supabase.from('cliente_enderecos').insert({
          cliente_id: clienteSalvo.id,
          identificador: 'Principal',
          cep: cepLimpo,
          logradouro: endereco.logradouro.trim(),
          numero: endereco.numero.trim(),
          complemento: endereco.complemento?.trim() || null,
          bairro: endereco.bairro.trim(),
          cidade: endereco.cidade.trim(),
          uf: endereco.uf.trim().toUpperCase(),
          latitude: endereco.latitude || null,
          longitude: endereco.longitude || null,
          is_principal: true
        });
      } catch (errEnd) {
        console.warn('Aviso ao persistir endereço relacional:', errEnd);
      }

      return { sucesso: true, cliente: clienteSalvo };
    } catch (err: any) {
      console.error('Erro ao cadastrar cliente no catálogo:', err);
      return { sucesso: false, erro: err.message || 'Erro ao registrar cadastro. Tente novamente.' };
    }
  },

  /**
   * Favoritos: Lista os IDs dos produtos favoritados pelo cliente
   */
  async listarFavoritosIds(lojaId: string, clienteId: string): Promise<Set<string>> {
    try {
      const { data, error } = await supabase
        .from('cliente_favoritos')
        .select('produto_id')
        .eq('loja_id', lojaId)
        .eq('cliente_id', clienteId);

      if (error) throw error;
      const ids = new Set<string>();
      data?.forEach((f) => ids.add(f.produto_id));
      return ids;
    } catch (err) {
      console.warn('Erro ao consultar favoritos:', err);
      return new Set();
    }
  },

  /**
   * Favoritos: Lista completa com dados do produto para exibição no Drawer/Modal
   */
  async listarFavoritosCompletos(lojaId: string, clienteId: string): Promise<ClienteFavorito[]> {
    try {
      const { data, error } = await supabase
        .from('cliente_favoritos')
        .select(`id, cliente_id, produto_id, loja_id, criado_em, produto:produtos(${SELECT_PRODUTO_PUBLICO})`)
        .eq('loja_id', lojaId)
        .eq('cliente_id', clienteId)
        .order('criado_em', { ascending: false });

      if (error) throw error;
      return (data as any) || [];
    } catch (err) {
      console.warn('Erro ao listar favoritos completos:', err);
      return [];
    }
  },

  /**
   * Alterna estado de favorito de um produto (Adiciona ou Remove)
   */
  async alternarFavorito(
    lojaId: string,
    clienteId: string,
    produtoId: string
  ): Promise<{ favoritado: boolean }> {
    try {
      const { data: existente } = await supabase
        .from('cliente_favoritos')
        .select('id')
        .eq('loja_id', lojaId)
        .eq('cliente_id', clienteId)
        .eq('produto_id', produtoId)
        .maybeSingle();

      if (existente?.id) {
        await supabase
          .from('cliente_favoritos')
          .delete()
          .eq('loja_id', lojaId)
          .eq('id', existente.id);
        return { favoritado: false };
      } else {
        await supabase
          .from('cliente_favoritos')
          .insert({
            loja_id: lojaId,
            cliente_id: clienteId,
            produto_id: produtoId
          });
        return { favoritado: true };
      }
    } catch (err) {
      console.error('Erro ao alternar favorito:', err);
      throw err;
    }
  },

  /**
   * Notificações: Lista notificações do cliente logado
   */
  async listarNotificacoes(lojaId: string, clienteId: string): Promise<ClienteNotificacao[]> {
    try {
      const { data, error } = await supabase
        .from('cliente_notificacoes')
        .select(SELECT_CLIENTE_NOTIFICACAO_PUBLICA)
        .eq('loja_id', lojaId)
        .eq('cliente_id', clienteId)
        .order('criado_em', { ascending: false })
        .limit(25);

      if (error) throw error;
      return (data as ClienteNotificacao[]) || [];
    } catch (err) {
      console.warn('Erro ao carregar notificações:', err);
      return [];
    }
  },

  /**
   * Notificações: Marca uma notificação individual como lida
   */
  async marcarNotificacaoLida(lojaId: string, notificacaoId: string): Promise<void> {
    try {
      await supabase
        .from('cliente_notificacoes')
        .update({ lida: true })
        .eq('loja_id', lojaId)
        .eq('id', notificacaoId);
    } catch (err) {
      console.warn('Erro ao marcar notificação como lida:', err);
    }
  },

  /**
   * Notificações: Marca todas as notificações do cliente como lidas
   */
  async marcarTodasNotificacoesLidas(lojaId: string, clienteId: string): Promise<void> {
    try {
      await supabase
        .from('cliente_notificacoes')
        .update({ lida: true })
        .eq('loja_id', lojaId)
        .eq('cliente_id', clienteId)
        .eq('lida', false);
    } catch (err) {
      console.warn('Erro ao marcar todas notificações como lidas:', err);
    }
  },

  /**
   * Pedidos: Lista histórico de pedidos do cliente com status e valor
   */
  async listarPedidosCliente(lojaId: string, clienteId: string): Promise<Pedido[]> {
    try {
      const { data, error } = await supabase
        .from('pedidos')
        .select(
          `${SELECT_PEDIDO_PUBLICO}, cliente:clientes(${SELECT_CLIENTE_PUBLICO}), forma_entrega:formas_entrega(${SELECT_FORMA_ENTREGA_PUBLICA}), pedido_entrega:pedido_entregas(${SELECT_PEDIDO_ENTREGA_PUBLICO}), itens:itens_pedido(${SELECT_ITEM_PEDIDO_PUBLICO}), pagamentos:pagamentos_pedido(${SELECT_PAGAMENTO_PEDIDO_COM_FORMA}), pagamentos_previstos:pedidos_pagamentos_previstos(${SELECT_PAGAMENTO_PREVISTO_PUBLICO})`
        )
        .eq('loja_id', lojaId)
        .eq('cliente_id', clienteId)
        .order('criado_em', { ascending: false })
        .limit(30);

      if (!error && data) {
        return data as unknown as Pedido[];
      }

      const { data: fallbackData, error: fallbackError } = await supabase
        .from('pedidos')
        .select(
          `${SELECT_PEDIDO_PUBLICO}, itens:itens_pedido(${SELECT_ITEM_PEDIDO_PUBLICO}), pagamentos:pagamentos_pedido(${SELECT_PAGAMENTO_PEDIDO_COM_FORMA}), pagamentos_previstos:pedidos_pagamentos_previstos(${SELECT_PAGAMENTO_PREVISTO_PUBLICO})`
        )
        .eq('loja_id', lojaId)
        .eq('cliente_id', clienteId)
        .order('criado_em', { ascending: false })
        .limit(30);

      if (fallbackError) throw fallbackError;
      return (fallbackData as unknown as Pedido[]) || [];
    } catch (err) {
      console.warn('Erro ao carregar pedidos do cliente:', err);
      return [];
    }
  },

  /**
   * Carrinho Relacional: Lista os itens salvos do cliente para a loja
   */
  async listarCarrinho(lojaId: string, clienteId: string): Promise<ClienteCarrinhoItem[]> {
    try {
      const { data, error } = await supabase
        .from('cliente_carrinho_itens')
        .select(SELECT_CLIENTE_CARRINHO_PUBLICO)
        .eq('loja_id', lojaId)
        .eq('cliente_id', clienteId)
        .order('criado_em', { ascending: true });

      if (error) throw error;
      return (data as ClienteCarrinhoItem[]) || [];
    } catch (err) {
      console.warn('Erro ao carregar carrinho relacional do cliente:', err);
      return [];
    }
  },

  /**
   * Carrinho Relacional: Sincroniza/salva os itens do carrinho do cliente no Supabase
   */
  async salvarCarrinho(
    lojaId: string,
    clienteId: string,
    itens: { produto_id: string; variacao_id?: string | null; quantidade: number }[]
  ): Promise<void> {
    try {
      if (!lojaId || !clienteId) return;

      // 1. Remove os itens existentes do cliente nesta loja
      await supabase
        .from('cliente_carrinho_itens')
        .delete()
        .eq('loja_id', lojaId)
        .eq('cliente_id', clienteId);

      // 2. Se houver itens a salvar, insere os novos
      if (itens && itens.length > 0) {
        const registros = itens.map((item) => ({
          loja_id: lojaId,
          cliente_id: clienteId,
          produto_id: item.produto_id,
          variacao_id: item.variacao_id || null,
          quantidade: item.quantidade,
          atualizado_em: new Date().toISOString()
        }));

        const { error: insertError } = await supabase
          .from('cliente_carrinho_itens')
          .insert(registros);

        if (insertError) {
          console.warn('Erro ao inserir itens no carrinho relacional:', insertError);
        }
      }
    } catch (err) {
      console.warn('Erro ao salvar carrinho relacional no Supabase:', err);
    }
  },

  /**
   * Carrinho Relacional: Esvazia o carrinho do cliente (botão Limpar ou pedido concluído)
   */
  async limparCarrinho(lojaId: string, clienteId: string): Promise<void> {
    try {
      if (!lojaId || !clienteId) return;
      await supabase
        .from('cliente_carrinho_itens')
        .delete()
        .eq('loja_id', lojaId)
        .eq('cliente_id', clienteId);
    } catch (err) {
      console.warn('Erro ao limpar carrinho relacional no Supabase:', err);
    }
  }
};
