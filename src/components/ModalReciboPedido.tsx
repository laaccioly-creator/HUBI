import React, { useState, useEffect } from 'react';
import {
  X,
  Store,
  Printer,
  Edit,
  Loader2
} from 'lucide-react';
import { Pedido, Loja, ItemPedido } from '../types';
import { supabase } from '../lib/supabase';
import {
  formatarDataRecibo,
  obterDadosPagamentoRecibo,
  obterInfoEntregaRecibo,
  PrintService
} from '../services/printService';
import { obterInfoVencimentoFiado } from '../utils/statusPedidoUtils';

export interface ModalReciboPedidoProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  loja?: Loja | null;
  lojaId?: string;
  onEditarRecibo?: () => void;
}

export const ModalReciboPedido: React.FC<ModalReciboPedidoProps> = ({
  isOpen,
  onClose,
  pedido,
  loja: lojaProp,
  lojaId,
  onEditarRecibo
}) => {
  const [pedidoCompleto, setPedidoCompleto] = useState<Pedido | null>(null);
  const [lojaCompleta, setLojaCompleta] = useState<Loja | null>(lojaProp || null);
  const [carregando, setCarregando] = useState<boolean>(true);

  useEffect(() => {
    let ativo = true;

    async function carregarDetalhes() {
      if (!isOpen || !pedido) {
        setPedidoCompleto(null);
        return;
      }

      setPedidoCompleto(pedido);
      setCarregando(true);

      try {
        const idLojaAlvo = lojaProp?.id || pedido.loja_id || lojaId;

        const [itensRes, pagRes, entregaRes, lojaRes] = await Promise.allSettled([
          !pedido.itens || pedido.itens.length === 0
            ? supabase.from('itens_pedido').select('*').eq('pedido_id', pedido.id)
            : Promise.resolve({ data: pedido.itens }),
          !pedido.pagamentos || pedido.pagamentos.length === 0
            ? supabase.from('pagamentos_pedido').select('*, forma_pagamento:formas_pagamento(*)').eq('pedido_id', pedido.id)
            : Promise.resolve({ data: pedido.pagamentos }),
          supabase.from('pedido_entregas').select('*').eq('pedido_id', pedido.id),
          !lojaProp && idLojaAlvo
            ? supabase.from('lojas').select('*').eq('id', idLojaAlvo).maybeSingle()
            : Promise.resolve({ data: lojaProp || null })
        ]);

        if (!ativo) return;

        const itens = itensRes.status === 'fulfilled' && (itensRes.value as any)?.data
          ? (itensRes.value as any).data
          : pedido.itens || [];

        const pagamentos = pagRes.status === 'fulfilled' && (pagRes.value as any)?.data
          ? (pagRes.value as any).data
          : pedido.pagamentos || [];

        const pedidoEntregas = entregaRes.status === 'fulfilled' && (entregaRes.value as any)?.data
          ? (entregaRes.value as any).data
          : (pedido as any)?.pedido_entregas || [];

        const lojaFinal = lojaRes.status === 'fulfilled' && (lojaRes.value as any)?.data
          ? (lojaRes.value as any).data
          : lojaProp || null;

        setLojaCompleta(lojaFinal);
        setPedidoCompleto({
          ...pedido,
          itens,
          pagamentos,
          pedido_entregas: pedidoEntregas
        } as Pedido);
      } catch (err) {
        console.warn('[ModalReciboPedido] Erro ao carregar detalhes do recibo:', err);
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    carregarDetalhes();

    return () => {
      ativo = false;
    };
  }, [isOpen, pedido, lojaProp, lojaId]);

  if (!isOpen || !pedido) return null;

  const pedAtual = pedidoCompleto || pedido;
  const lojaAtual = lojaCompleta || lojaProp;

  const formatarData = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return iso;
    }
  };

  const calcularTotalItens = (ped: Pedido) => {
    return ped.itens?.reduce((acc, i) => acc + Number(i.quantidade || 1), 0) || 0;
  };

  const enderecoLojaFormatado = [
    lojaAtual?.endereco_logradouro,
    lojaAtual?.endereco_numero,
    lojaAtual?.endereco_bairro,
    lojaAtual?.endereco_cidade
  ].filter(Boolean).join(', ');

  const logoLojaUrl = lojaAtual?.url_logo;

  const {
    ehRetirada,
    formaEntregaTexto,
    enderecoExibicao
  } = obterInfoEntregaRecibo(pedAtual, lojaAtual);

  const badgeEstilo = ehRetirada ? 'bg-purple-900/60 text-purple-300 border border-purple-700/50' : 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50';

  const rawPe = (pedAtual as any).pedido_entrega || (pedAtual as any).pedido_entregas;
  const pe = Array.isArray(rawPe) ? rawPe[0] : rawPe;

  const enderecoDestino = (() => {
    if (pe?.destino_logradouro) {
      const comp = pe.destino_complemento ? ` - ${pe.destino_complemento}` : '';
      const cep = pe.destino_cep ? ` (CEP: ${pe.destino_cep})` : '';
      return `${pe.destino_logradouro}, ${pe.destino_numero || 'S/N'}${comp}, ${pe.destino_bairro}, ${pe.destino_cidade}-${pe.destino_uf}${cep}`;
    }
    if (pedAtual.endereco_entrega) {
      return pedAtual.endereco_entrega;
    }
    if (pedAtual.cliente?.endereco_principal) {
      return pedAtual.cliente.endereco_principal;
    }
    return enderecoExibicao || 'Endereço não informado';
  })();

  const pagInfo = obterDadosPagamentoRecibo(pedAtual);
  const subtotalProdutos = Number((pedAtual as any).subtotal_produtos || pedAtual.subtotal || pedAtual.valor_total || 0);
  const valorDesconto = Number(pedAtual.valor_desconto || 0);
  const valorFrete = Number(pedAtual.valor_frete || 0);
  const valorTotal = Number(pedAtual.valor_total || 0);

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95">
        {/* Cabeçalho do Modal */}
        <div className="p-4 border-b border-slate-700/80 flex items-center justify-between bg-slate-900 shrink-0">
          <h3 className="text-sm font-bold text-white">
            Recibo #{pedAtual.numero_pedido}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo do Recibo Rolável */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-slate-900 flex justify-center items-start custom-scrollbar">
          {carregando && (!pedAtual.itens || pedAtual.itens.length === 0) ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <span className="text-xs">Carregando dados do recibo...</span>
            </div>
          ) : (
            <div className="w-full max-w-sm bg-black text-slate-200 rounded-xl p-5 shadow-2xl border border-slate-700/70 font-mono text-xs space-y-3.5 min-h-fit mb-6">
              {/* Logo e Cabeçalho do Recibo */}
              <div className="text-center space-y-1 border-b border-slate-700/60 border-dashed pb-3">
                {logoLojaUrl ? (
                  <img src={logoLojaUrl} alt="Logo" className="h-10 max-w-[160px] object-contain mx-auto mb-2" />
                ) : (
                  <Store className="w-8 h-8 text-slate-400 mx-auto mb-1" />
                )}
                <h4 className="font-bold text-sm text-white uppercase tracking-wider">{lojaAtual?.nome_fantasia || 'HUBI PDV'}</h4>
                {enderecoLojaFormatado && <p className="text-[11px] text-slate-400">{enderecoLojaFormatado}</p>}
                {(lojaAtual?.whatsapp || lojaAtual?.telefone) && (
                  <p className="text-[11px] text-slate-400">{lojaAtual?.whatsapp || lojaAtual?.telefone}</p>
                )}
              </div>

              {/* Número e Data */}
              <div className="flex justify-between items-center text-[11px] text-slate-400 border-b border-slate-700/60 border-dashed pb-2">
                <span className="font-bold text-white">RECIBO #{pedAtual.numero_pedido}</span>
                <span>{formatarData(pedAtual.data_venda || pedAtual.criado_em || '')}</span>
              </div>

              {/* Vendedor / Canal (Antes do Cliente) */}
              <div className="space-y-0.5 border-b border-slate-700/60 border-dashed pb-2 text-[11px]">
                <span className="text-slate-400 font-semibold">
                  {pedAtual.origem === 'catalogo_online' ? 'Canal / Vendedor:' : 'Vendedor:'}
                </span>
                <p className="font-bold text-white">
                  {pedAtual.origem === 'catalogo_online'
                    ? 'Catálogo Online (Pedido Online)'
                    : pedAtual.vendedor?.nome_completo || 'Caixa / Balcão'}
                </p>
              </div>

              {/* Cliente */}
              <div className="space-y-0.5 border-b border-slate-700/60 border-dashed pb-2 text-[11px]">
                <span className="text-slate-400 font-semibold">Cliente:</span>
                <p className="font-bold text-white">{pedAtual.cliente?.nome || pedAtual.cliente_nome_avulso || 'Cliente Balcão'}</p>
                {(pedAtual.cliente?.whatsapp || pedAtual.cliente?.telefone || pedAtual.cliente_telefone_avulso) && (
                  <p className="text-slate-300">{pedAtual.cliente?.whatsapp || pedAtual.cliente?.telefone || pedAtual.cliente_telefone_avulso}</p>
                )}
              </div>

              {/* Forma de Entrega & Endereço */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/50 text-[11px] space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-300 uppercase text-[10px] tracking-wider">Forma de Entrega:</span>
                  <span className={`font-black px-1.5 py-0.5 rounded text-[10px] ${badgeEstilo}`}>
                    {formaEntregaTexto}
                  </span>
                </div>
                <div className="text-slate-300 pt-0.5">
                  <strong className="text-white">{ehRetirada ? 'Local de Retirada:' : 'Endereço de Entrega:'} </strong>
                  <span className="text-slate-200">{ehRetirada ? (enderecoLojaFormatado || 'Balcão da Loja') : enderecoDestino}</span>
                </div>
                {(pe?.codigo_corrida || (pedAtual as any)?.codigo_corrida) && (
                  <div className="text-emerald-400 font-bold pt-0.5">
                    Código da Corrida: {pe?.codigo_corrida || (pedAtual as any)?.codigo_corrida}
                  </div>
                )}
                {pe?.codigo_rastreio && (
                  <div className="text-emerald-400 font-bold pt-0.5">
                    Rastreio: {pe.codigo_rastreio}
                  </div>
                )}
              </div>

              {/* Itens */}
              <div className="space-y-2 border-b border-slate-700/60 border-dashed pb-2">
                <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px] block">
                  Itens ({calcularTotalItens(pedAtual)} un)
                </span>
                {pedAtual.itens?.map((item: ItemPedido, idx: number) => (
                  <div key={idx} className="flex justify-between py-0.5 text-slate-200">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white">{item.quantidade}x</span>
                      <span className="text-slate-200">{item.nome_produto}{item.rotulo_variacao ? ` / ${item.rotulo_variacao}` : ''}</span>
                    </div>
                    <span className="font-bold text-white whitespace-nowrap pl-2">
                      R$ {Number(item.subtotal || item.preco_venda_unitario * item.quantidade || 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Fechamento Financeiro */}
              <div className="space-y-1.5 text-xs text-slate-300">
                <div className="flex justify-between text-slate-300">
                  <span>Subtotal dos Produtos:</span>
                  <span className="font-semibold text-white">
                    R$ {subtotalProdutos.toFixed(2)}
                  </span>
                </div>

                {valorDesconto > 0 && (
                  <div className="flex justify-between text-rose-400 font-bold">
                    <span>Desconto Aplicado:</span>
                    <span>- R$ {valorDesconto.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between text-slate-300">
                  <span>Frete{formaEntregaTexto && !ehRetirada ? ` (${formaEntregaTexto})` : ''}:</span>
                  <span className="font-semibold text-white">
                    {valorFrete > 0 
                      ? `+ R$ ${valorFrete.toFixed(2)}` 
                      : ehRetirada 
                        ? 'Grátis (Retirada)'
                        : (formaEntregaTexto && !formaEntregaTexto.toLowerCase().includes('definir') && !formaEntregaTexto.toLowerCase().includes('combinar'))
                          ? 'Grátis (R$ 0,00)'
                          : 'A Definir'}
                  </span>
                </div>

                <div className="border-t border-dashed border-slate-700/60 pt-2 my-1"></div>

                <div className="flex justify-between items-center text-sm font-bold text-white pt-0.5">
                  <span>VALOR TOTAL:</span>
                  <span className="text-lg font-black text-white">R$ {valorTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Dados do Pagamento */}
              {pagInfo.ehFiado && Number(pedAtual.saldo_devedor || 0) > 0 && (
                <div className="mt-2.5 p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-center space-y-0.5">
                  <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider block">Saldo a Pagar (Fiado)</span>
                  <span className="text-sm font-black text-rose-400 block">R$ {Number(pedAtual.saldo_devedor).toFixed(2)}</span>
                  <span className="text-[11px] font-bold text-rose-300 block pt-0.5">
                    Data de Vencimento: {obterInfoVencimentoFiado(pedAtual).formatada}
                  </span>
                </div>
              )}

              <div className="mt-3 p-3 rounded-xl border border-slate-700/50 bg-slate-800/80 space-y-2 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-dashed border-slate-700/60">
                  <span className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">Status Pagamento:</span>
                  <span className={`font-black text-[10px] px-2 py-0.5 rounded border ${pagInfo.foiPago ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}>
                    {pagInfo.foiPago ? '✓ PAGO' : 'AGUARDANDO PAGAMENTO'}
                  </span>
                </div>
                {pagInfo.foiPago && pagInfo.pagamentosDetalhados.length > 0 ? (
                  <div className="space-y-1.5 pt-1 text-slate-300">
                    {pagInfo.pagamentosDetalhados.map((pag, idx) => (
                      <div key={idx} className="flex justify-between items-start text-[11px]">
                        <div>
                          <span className="font-semibold text-white block">{pag.forma}{pag.parcelas ? ` (${pag.parcelas}x)` : ''}</span>
                          {pag.origemGateway && (
                            <span className="text-[10px] text-slate-400 block font-medium">Origem: {pag.origemGateway}</span>
                          )}
                        </div>
                        <span className="font-bold text-white">R$ {pag.valor.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-2 border-t border-slate-700/60 text-xs">
                      <span className="text-slate-300 font-medium">Valor Pago:</span>
                      <span className="text-emerald-400 font-black text-sm">R$ {pagInfo.totalPago.toFixed(2)}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* Footer do Modal de Recibo com Ações e Link "Editar meu recibo" */}
        <div className="p-4 border-t border-slate-700/80 bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          {onEditarRecibo ? (
            <button
              type="button"
              onClick={onEditarRecibo}
              className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline font-bold inline-flex items-center gap-1.5 cursor-pointer transition"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>Editar meu recibo</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => PrintService.printReceipt(pedAtual, lojaAtual, '80mm')}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg transition-colors text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/20 active:scale-95"
            >
              <Printer className="w-3.5 h-3.5 text-white" />
              <span>Térmica 58/80mm</span>
            </button>

            <button
              type="button"
              onClick={() => PrintService.printReceipt(pedAtual, lojaAtual, 'a4')}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg transition-colors text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/20 active:scale-95"
            >
              <Printer className="w-3.5 h-3.5 text-white" />
              <span>Imprimir A4</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
