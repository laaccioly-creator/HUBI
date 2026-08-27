import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Clock,
  CheckCircle2,
  Package,
  Truck,
  MapPin,
  Phone,
  Mail,
  Instagram,
  ShoppingBag,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Store,
  MessageCircle,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Pedido, Loja } from '../types';

export const PedidoAndamentoPublico: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [loja, setLoja] = useState<Loja | null>(null);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [expandirProdutos, setExpandirProdutos] = useState<boolean>(false);

  useEffect(() => {
    const carregarDados = async () => {
      if (!id) return;
      setCarregando(true);
      try {
        let query = supabase
          .from('pedidos')
          .select(`
            *,
            cliente:clientes(*),
            itens:itens_pedido(*),
            pagamentos:pagamentos_pedido(*, forma_pagamento:formas_pagamento(*))
          `);

        if (id.includes('-') && id.length > 20) {
          query = query.eq('id', id);
        } else {
          query = query.eq('numero_pedido', Number(id) || 0);
        }

        const { data: pedidosData, error } = await query;
        if (error) throw error;

        const ped = pedidosData?.[0];
        if (ped) {
          setPedido(ped);
          if (ped.loja_id) {
            const { data: lojaData } = await supabase
              .from('lojas')
              .select('*')
              .eq('id', ped.loja_id)
              .single();
            if (lojaData) setLoja(lojaData);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar andamento do pedido:', err);
      } finally {
        setCarregando(false);
      }
    };

    carregarDados();
  }, [id]);

  if (carregando) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 p-4">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium">Carregando andamento do seu pedido...</p>
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 p-4 text-center">
        <AlertCircle className="w-12 h-12 text-amber-500 mb-3" />
        <h2 className="text-lg font-bold text-slate-100">Pedido não encontrado</h2>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          Verifique o link informado ou entre em contato com a loja para mais informações.
        </p>
      </div>
    );
  }

  const itens = pedido.itens || pedido.itens_pedido || [];
  const cliente = pedido.cliente;
  const configExtras = (loja as any)?.configuracoes_extras || {};
  const instagram = configExtras.instagram || '@' + (loja?.slug_catalogo || 'loja');
  const enderecoLoja = [
    loja?.endereco_logradouro,
    loja?.endereco_numero,
    loja?.endereco_bairro,
    loja?.endereco_cidade
  ].filter(Boolean).join(', ') || 'Endereço da Loja';

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoLoja)}`;
  const logoUrl = (loja as any)?.logo_url;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16 font-sans">
      {/* TOPO COM LOGO DA LOJA */}
      <div className="bg-slate-900 border-b border-slate-800 py-4 px-4 flex justify-center sticky top-0 z-20 backdrop-blur-md bg-slate-900/90">
        {logoUrl ? (
          <img src={logoUrl} alt={loja?.nome_fantasia} className="h-10 max-w-[180px] object-contain" />
        ) : (
          <div className="flex items-center gap-2 font-black text-base text-emerald-400">
            <Store className="w-5 h-5" />
            <span>{loja?.nome_fantasia || 'HUBI'}</span>
          </div>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-6 space-y-6">
        <div className="flex items-center gap-2 text-slate-400 text-xs">
          <Package className="w-4 h-4 text-emerald-400" />
          <span className="font-bold text-slate-200">Andamento do pedido #{pedido.numero_pedido || pedido.id.slice(0, 5)}</span>
        </div>

        {/* GRID PRINCIPAL: STATUS (ESQUERDA) + DETALHES (DIREITA) (TELA003 / TELA003A) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* COLUNA ESQUERDA: STATUS E HISTÓRICO */}
          <div className="md:col-span-6 space-y-6">
            {/* Card Status Atual */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-xl">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto text-xl font-bold">
                {pedido.status === 'concluido' ? '✓' : '📦'}
              </div>

              <div>
                <h3 className="text-xl font-black text-slate-100 capitalize">
                  {pedido.status === 'concluido'
                    ? 'Pedido Concluído'
                    : pedido.status === 'confirmado'
                    ? 'Confirmado'
                    : pedido.status === 'em_producao'
                    ? 'Em Produção'
                    : pedido.status === 'pronto_para_retirar'
                    ? 'Pronto para Retirada'
                    : pedido.status === 'saiu_para_entrega'
                    ? 'Saiu para Entrega'
                    : 'Pendente'}
                </h3>
                <span className="text-xs text-slate-400">
                  {new Date(pedido.criado_em || Date.now()).toLocaleDateString('pt-BR')} às{' '}
                  {new Date(pedido.criado_em || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Botão Como Chegar */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {pedido.endereco_entrega ? 'Tipo: Entrega no endereço' : 'Prazo para retirada'}
                </span>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 font-bold inline-flex items-center gap-1"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Como chegar</span>
                </a>
              </div>

              {/* Timeline Histórico */}
              <div className="pt-4 border-t border-slate-800 text-left space-y-3">
                <div className="flex items-center gap-2.5 text-xs text-emerald-400 font-bold">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
                  <span>Confirmado</span>
                  <span className="text-[10px] text-slate-500 ml-auto">
                    {new Date(pedido.criado_em || Date.now()).toLocaleDateString('pt-BR')}
                  </span>
                </div>

                <div className="flex items-center gap-2.5 text-xs text-slate-400">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-600"></div>
                  <span>Em preparação / produção</span>
                </div>

                <div className="flex items-center gap-2.5 text-xs text-slate-400">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-600"></div>
                  <span>Pedido finalizado</span>
                </div>
              </div>
            </div>

            {/* Card Contato da Loja (TELA003A) */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center gap-2 text-slate-200 font-bold text-sm">
                <Phone className="w-4 h-4 text-emerald-400" />
                <span>Contato da Loja</span>
              </div>
              <p className="text-xs text-slate-400">
                Para cancelar, editar ou falar sobre seu pedido, entre em contato direto com a loja.
              </p>

              <div className="space-y-2.5 pt-2 text-xs">
                {loja?.whatsapp && (
                  <a
                    href={`https://wa.me/55${loja.whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2.5 text-emerald-400 hover:underline font-bold"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>+{loja.whatsapp}</span>
                  </a>
                )}

                <div className="flex items-center gap-2.5 text-slate-300">
                  <Instagram className="w-4 h-4 text-pink-400" />
                  <span>{instagram}</span>
                </div>

                {loja?.email && (
                  <div className="flex items-center gap-2.5 text-slate-300">
                    <Mail className="w-4 h-4 text-sky-400" />
                    <span>{loja.email}</span>
                  </div>
                )}

                <div className="flex items-start gap-2.5 text-slate-400">
                  <MapPin className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{enderecoLoja}</span>
                </div>
              </div>
            </div>
          </div>

          {/* COLUNA DIREITA: DETALHES DO PEDIDO (TELA003 / TELA003A) */}
          <div className="md:col-span-6 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-slate-200 font-bold text-sm">
                  <ShoppingBag className="w-4 h-4 text-emerald-400" />
                  <span>Detalhes do pedido</span>
                </div>
                <span className="text-xs text-slate-400">{itens.length} itens</span>
              </div>

              {/* Lista de Itens */}
              <div className="space-y-3">
                {itens.slice(0, expandirProdutos ? itens.length : 4).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1.5 border-b border-slate-800/50 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-bold text-emerald-400">{item.quantidade}x</span>
                      <span className="text-slate-200 font-medium truncate">{item.nome_produto}</span>
                    </div>
                    <span className="font-bold text-slate-100 shrink-0 ml-2">
                      R$ {Number(item.subtotal || item.preco_venda_unitario * item.quantidade || 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {itens.length > 4 && (
                <button
                  type="button"
                  onClick={() => setExpandirProdutos(!expandirProdutos)}
                  className="w-full py-1 text-xs text-emerald-400 hover:underline font-bold text-center cursor-pointer"
                >
                  {expandirProdutos ? 'Ver menos produtos' : `Ver todos os ${itens.length} produtos`}
                </button>
              )}

              {/* Informações de Pagamento e Entrega */}
              <div className="space-y-2 pt-3 border-t border-slate-800 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Forma de entrega</span>
                  <span className="text-slate-200 font-medium capitalize">
                    {pedido.endereco_entrega ? 'Entrega no Endereço' : 'Retirada na Loja'}
                  </span>
                </div>

                <div className="flex justify-between text-slate-400">
                  <span>Forma de pagamento</span>
                  <span className="text-slate-200 font-medium capitalize">
                    {pedido.pagamentos?.[0]?.forma_pagamento?.nome || 'Dinheiro / Pix'}
                  </span>
                </div>

                {Number(pedido.valor_desconto || 0) > 0 && (
                  <div className="flex justify-between text-rose-400 font-medium">
                    <span>Desconto</span>
                    <span>-R$ {Number(pedido.valor_desconto).toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between text-sm font-black text-slate-100 pt-2 border-t border-slate-800">
                  <span>Total</span>
                  <span className="text-emerald-400">R$ {Number(pedido.valor_total || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Suas Informações (TELA003A) */}
            {cliente && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-3 shadow-xl">
                <h4 className="text-xs font-bold text-slate-300">Suas Informações</h4>
                <div className="space-y-1 text-xs">
                  <p className="text-slate-200 font-bold">{cliente.nome}</p>
                  {cliente.telefone && <p className="text-slate-400">{cliente.telefone}</p>}
                </div>
              </div>
            )}

            {/* Iniciar Nova Compra */}
            <div className="text-center pt-4">
              <Link
                to={`/catalog`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Iniciar nova compra no Catálogo</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
