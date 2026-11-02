import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Produto, Categoria } from '../types';

export const useProdutos = (lojaId?: string) => {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async () => {
    if (!lojaId) return;
    try {
      setCarregando(true);

      // Carregar categorias para enriquecimento resiliente em memória
      const { data: catData } = await supabase
        .from('categorias')
        .select('*')
        .eq('loja_id', lojaId);

      const mapaCats = new Map((catData || []).map((c: Categoria) => [c.id, c]));

      let prodData: any[] | null = null;
      let erroBusca: any = null;

      try {
        const res = await supabase
          .from('produtos')
          .select('*, variacoes:variacoes_produto(*), categoria:categorias!categoria_id(*)')
          .eq('loja_id', lojaId)
          .eq('ativo', true)
          .order('nome');
        prodData = res.data;
        erroBusca = res.error;
      } catch (e) {
        erroBusca = e;
      }

      // Fallback resiliente caso o join embutido rejeite
      if (erroBusca || !prodData) {
        const resFallback = await supabase
          .from('produtos')
          .select('*, variacoes:variacoes_produto(*)')
          .eq('loja_id', lojaId)
          .eq('ativo', true)
          .order('nome');

        if (resFallback.error) throw resFallback.error;
        prodData = resFallback.data;
      }

      if (prodData) {
        const normalizados = prodData.map((p: any) => {
          const cat = p.categoria || (p.categoria_id ? mapaCats.get(p.categoria_id) : null) || null;
          const subId = p.subcategoria_id || null;
          const sub = subId ? mapaCats.get(subId) : null;
          return {
            ...p,
            categoria: cat,
            categoria_nome: cat?.nome || p.categoria_nome || null,
            subcategoria: sub || null,
            subcategoria_nome: sub?.nome || p.subcategoria_nome || null
          };
        });
        setProdutos(normalizados as unknown as Produto[]);
      }
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, [lojaId]);

  return { produtos, carregando, erro, recarregar: carregar };
};
