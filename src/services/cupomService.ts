import { supabase } from '../lib/supabase';
import { Cupom, TipoCupom } from '../types';

export class CupomService {
  /**
   * Lista todos os cupons da loja
   */
  static async listarCupons(lojaId: string): Promise<Cupom[]> {
    if (!lojaId) return [];

    try {
      // 1. Tenta buscar da tabela oficial de cupons no Supabase
      const { data, error } = await supabase
        .from('cupons')
        .select('*')
        .eq('loja_id', lojaId)
        .order('criado_em', { ascending: false });

      if (!error && data) {
        return data as Cupom[];
      }
    } catch (e) {
      console.warn('Tabela cupons ainda não encontrada no Supabase, usando fallback em lojas:', e);
    }

    // 2. Fallback de persistência em lojas.configuracoes_extras
    try {
      const { data: loja } = await supabase
        .from('lojas')
        .select('configuracoes_extras')
        .eq('id', lojaId)
        .single();

      const extras = loja?.configuracoes_extras || {};
      return (extras.cupons || []) as Cupom[];
    } catch (err) {
      console.error('Erro ao listar cupons no fallback:', err);
      return [];
    }
  }

  /**
   * Salva ou cria um novo cupom
   */
  static async salvarCupom(
    lojaId: string,
    cupomData: {
      id?: string;
      codigo: string;
      tipo: TipoCupom;
      valor: number;
      valor_minimo_carrinho: number;
      tem_valor_minimo: boolean;
      ativo: boolean;
    }
  ): Promise<Cupom> {
    const codigoNormalizado = cupomData.codigo.trim().toUpperCase();

    const novoCupom: Cupom = {
      id: cupomData.id || crypto.randomUUID(),
      loja_id: lojaId,
      codigo: codigoNormalizado,
      tipo: cupomData.tipo,
      valor: Number(cupomData.valor) || 0,
      valor_minimo_carrinho: Number(cupomData.valor_minimo_carrinho) || 0,
      tem_valor_minimo: Boolean(cupomData.tem_valor_minimo),
      ativo: Boolean(cupomData.ativo),
      usos_count: 0,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    };

    // 1. Tentar salvar no Supabase na tabela cupons
    try {
      if (cupomData.id) {
        const { data, error } = await supabase
          .from('cupons')
          .update({
            codigo: novoCupom.codigo,
            tipo: novoCupom.tipo,
            valor: novoCupom.valor,
            valor_minimo_carrinho: novoCupom.valor_minimo_carrinho,
            tem_valor_minimo: novoCupom.tem_valor_minimo,
            ativo: novoCupom.ativo,
            atualizado_em: new Date().toISOString()
          })
          .eq('id', cupomData.id)
          .select()
          .single();

        if (!error && data) return data as Cupom;
      } else {
        const { data, error } = await supabase
          .from('cupons')
          .insert(novoCupom)
          .select()
          .single();

        if (!error && data) return data as Cupom;
      }
    } catch (e) {
      console.warn('Erro ao persistir na tabela cupons, aplicando em lojas:', e);
    }

    // 2. Fallback de persistência em lojas.configuracoes_extras
    try {
      const { data: loja } = await supabase
        .from('lojas')
        .select('configuracoes_extras')
        .eq('id', lojaId)
        .single();

      const extras = loja?.configuracoes_extras || {};
      const cuponsAtuais: Cupom[] = extras.cupons || [];

      let novosCupons: Cupom[];
      if (cupomData.id) {
        novosCupons = cuponsAtuais.map(c => (c.id === cupomData.id ? { ...c, ...novoCupom } : c));
      } else {
        novosCupons = [novoCupom, ...cuponsAtuais];
      }

      await supabase
        .from('lojas')
        .update({
          configuracoes_extras: {
            ...extras,
            cupons: novosCupons
          }
        })
        .eq('id', lojaId);

      return novoCupom;
    } catch (err) {
      console.error('Erro ao salvar cupom no fallback:', err);
      throw err;
    }
  }

  /**
   * Exclui um cupom
   */
  static async excluirCupom(lojaId: string, cupomId: string): Promise<boolean> {
    try {
      await supabase.from('cupons').delete().eq('id', cupomId).eq('loja_id', lojaId);
    } catch {}

    try {
      const { data: loja } = await supabase
        .from('lojas')
        .select('configuracoes_extras')
        .eq('id', lojaId)
        .single();

      const extras = loja?.configuracoes_extras || {};
      const cuponsAtuais: Cupom[] = extras.cupons || [];
      const filtrados = cuponsAtuais.filter(c => c.id !== cupomId);

      await supabase
        .from('lojas')
        .update({
          configuracoes_extras: {
            ...extras,
            cupons: filtrados
          }
        })
        .eq('id', lojaId);

      return true;
    } catch (err) {
      console.error('Erro ao excluir cupom:', err);
      return false;
    }
  }

  /**
   * Valida e calcula o desconto de um cupom no Catálogo Online
   */
  static async validarCupomCatalogo(
    lojaId: string,
    codigoDigitado: string,
    subtotalCarrinho: number
  ): Promise<{
    valido: boolean;
    mensagem?: string;
    cupom?: Cupom;
    descontoCalculado: number;
    freteGratis: boolean;
  }> {
    const codigoLimpo = codigoDigitado.trim().toUpperCase();
    if (!codigoLimpo) {
      return { valido: false, mensagem: 'Informe o código do cupom.', descontoCalculado: 0, freteGratis: false };
    }

    const cupons = await this.listarCupons(lojaId);
    const cupom = cupons.find(c => c.codigo.toUpperCase() === codigoLimpo);

    if (!cupom) {
      return { valido: false, mensagem: 'Cupom inválido ou não encontrado.', descontoCalculado: 0, freteGratis: false };
    }

    if (!cupom.ativo) {
      return { valido: false, mensagem: 'Este cupom está inativo no momento.', descontoCalculado: 0, freteGratis: false };
    }

    if (cupom.tem_valor_minimo && Number(cupom.valor_minimo_carrinho) > 0) {
      if (subtotalCarrinho < Number(cupom.valor_minimo_carrinho)) {
        return {
          valido: false,
          mensagem: `Valor mínimo para este cupom é de R$ ${Number(cupom.valor_minimo_carrinho).toFixed(2)} em produtos.`,
          descontoCalculado: 0,
          freteGratis: false
        };
      }
    }

    let desconto = 0;
    let freteGratis = false;

    if (cupom.tipo === 'desconto_fixo') {
      desconto = Math.min(Number(cupom.valor), subtotalCarrinho);
    } else if (cupom.tipo === 'desconto_percentual') {
      const perc = Number(cupom.valor) || 0;
      desconto = (subtotalCarrinho * perc) / 100;
    } else if (cupom.tipo === 'frete_gratis') {
      freteGratis = true;
    }

    return {
      valido: true,
      cupom,
      descontoCalculado: desconto,
      freteGratis
    };
  }
}
