import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Produto } from '../types';

export const useProdutos = (lojaId?: string) => {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async () => {
    if (!lojaId) return;
    try {
      setCarregando(true);
      const { data, error } = await supabase
        .from('produtos')
        .select('*, variacoes:variacoes_produto(*), categoria:categorias(*)')
        .eq('loja_id', lojaId)
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;
      if (data) setProdutos(data as unknown as Produto[]);
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
