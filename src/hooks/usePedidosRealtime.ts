import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Pedido } from '../types';
import { audioService } from '../services/audioService';

export const usePedidosRealtime = (lojaId?: string) => {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);

  const carregarPedidos = async () => {
    if (!lojaId) return;
    try {
      setCarregando(true);
      const { data, error } = await supabase
        .from('pedidos')
        .select(`
          *,
          cliente:clientes(*),
          vendedor:usuarios_loja!pedidos_vendedor_id_fkey(*),
          itens:itens_pedido(*),
          pagamentos:pagamentos_pedido(*)
        `)
        .eq('loja_id', lojaId)
        .order('criado_em', { ascending: false });

      if (error) throw error;
      if (data) setPedidos(data as unknown as Pedido[]);
    } catch (err) {
      console.error(err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarPedidos();

    if (lojaId) {
      const canalNome = `hook_pedidos_realtime_${lojaId}_${Math.random().toString(36).substring(2, 9)}`;
      const channel = supabase
        .channel(canalNome)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'pedidos', filter: `loja_id=eq.${lojaId}` },
          (payload) => {
            if (payload.new.status === 'pendente') {
              audioService.playNewOrderSound();
            }
            carregarPedidos();
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `loja_id=eq.${lojaId}` },
          () => {
            carregarPedidos();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [lojaId]);

  return { pedidos, carregando, recarregar: carregarPedidos };
};
