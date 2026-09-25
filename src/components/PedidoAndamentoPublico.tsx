import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Package,
  MapPin,
  Phone,
  Mail,
  Instagram,
  ShoppingBag,
  ExternalLink,
  Store,
  MessageCircle,
  AlertCircle,
  Printer,
  Download,
  Copy,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Pedido, Loja, ItemPedido } from '../types';
import {
  obterDadosPagamentoRecibo,
  obterInfoEntregaRecibo,
  PrintService
} from '../services/printService';
import { ReceiptPdfService } from '../services/receiptPdfService';

export const PedidoAndamentoPublico: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [loja, setLoja] = useState<Loja | null>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [copiado, setCopiado] = useState<boolean>(false);
  const [baixandoPdf, setBaixandoPdf] = useState<boolean>(false);
  const reciboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;

    const carregarDados = async () => {
      if (!id) return;
      try {
        let query = supabase
          .from('pedidos')
          .select(`
            *,
            cliente:clientes(*),
            itens:itens_pedido(*),
            vendedor:usuarios(*),
            pagamentos:pagamentos_pedido(*, forma_pagamento:formas_pagamento(*)),
            pedido_entregas:pedido_entregas(*)
          `);

        if (id.includes('-') && id.length > 20) {
          query = query.eq('id', id);
        } else {
          query = query.eq('numero_pedido', Number(id) || 0);
        }

        const { data: pedidosData, error } = await query;
        if (error) throw error;

        const ped = pedidosData?.[0];
        if (ped && !cancelado) {
          setPedido(ped as unknown as Pedido);
          if (ped.loja_id) {
            const { data: lojaData } = await supabase
              .from('lojas')
              .select('*')
              .eq('id', ped.loja_id)
              .single();
            if (lojaData && !cancelado) setLoja(lojaData as Loja);
          }

          // Carrega histórico real do pedido
          const { data: histData } = await supabase
            .from('historico_pedidos')
            .select('*')
            .eq('pedido_id', ped.id)
            .order('criado_em', { ascending: true });

          if (histData && !cancelado) {
            // Deduplica status consecutivos idênticos
            const dedup = histData.filter((item, idx, arr) => {
              if (idx === 0) return true;
              const ant = arr[idx - 1];
              if (item.status_novo && ant.status_novo && item.status_novo === ant.status_novo) {
                return false;
              }
              return true;
            });
            setHistorico(dedup);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar andamento do pedido:', err);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    };

    carregarDados();

    // Inscrição Realtime para atualizar status e histórico ao vivo
    const canal = supabase
      .channel(`andamento_pedido_${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        carregarDados();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_entregas' }, () => {
        carregarDados();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'historico_pedidos' }, () => {
        carregarDados();
      })
      .subscribe();

    return () => {
      cancelado = true;
      supabase.removeChannel(canal);
    };
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

  const itens = (pedido.itens || (pedido as any).itens_pedido || []) as ItemPedido[];
  const cliente = pedido.cliente;
  const configExtras = (loja as any)?.configuracoes_extras || {};
  const instagram = configExtras.instagram || '@' + (loja?.slug_catalogo || 'loja');
  const enderecoLoja = [
    loja?.endereco_logradouro,
    loja?.endereco_numero,
    loja?.endereco_bairro,
    loja?.endereco_cidade
  ].filter(Boolean).join(', ') || 'Endereço da Loja';

  const logoUrl = loja?.url_logo;
  const pe = (pedido as any)?.pedido_entregas?.[0] || (pedido as any)?.pedido_entrega;
  const linkRastreio = (pedido.link_rastreio || pe?.link_rastreio || '').trim();
  const provEntrega = (pe?.provedor || (pedido as any).metadados?.provedor_frete || pedido.nome_app || pedido.nome_transportadora || '').toLowerCase();
  const ehModalidadeUber = provEntrega.includes('uber') || linkRastreio.includes('uber.com') || linkRastreio.includes('ubr.to');
  const temLinkUberValido = Boolean(
    ehModalidadeUber &&
    linkRastreio &&
    (linkRastreio.startsWith('http://') || linkRastreio.startsWith('https://'))
  );
  const pinEntrega = pe?.pin_entrega || pedido.pin_entrega || null;

  // Status efetivo considerando entrega
  const statusEfetivo = pe?.status_envio === 'entregue' ? 'entregue' : (pedido.status || 'pendente');
  const ehEntregue = statusEfetivo === 'entregue' || statusEfetivo === 'concluido';
  const ehCancelado = statusEfetivo === 'cancelado' || pe?.status_envio === 'cancelado';
  const ehEmRota = statusEfetivo === 'saiu_para_entrega' || statusEfetivo === 'enviado' || pe?.status_envio === 'em_transito';

  let iconeStatus = '📦';
  let tituloStatus = 'Pendente';

  if (ehEntregue) {
    iconeStatus = '✓';
    tituloStatus = statusEfetivo === 'concluido' ? 'Pedido Concluído' : 'Pedido Entregue';
  } else if (ehCancelado) {
    iconeStatus = '✕';
    tituloStatus = 'Pedido Cancelado';
  } else if (ehEmRota) {
    iconeStatus = '🚗';
    tituloStatus = 'Em Rota de Entrega';
  } else if (statusEfetivo === 'pronto_para_retirar') {
    iconeStatus = '🛍️';
    tituloStatus = 'Pronto para Retirada';
  } else if (statusEfetivo === 'em_producao' || (statusEfetivo as string) === 'em_preparacao') {
    iconeStatus = '⏳';
    tituloStatus = 'Em Preparação';
  } else if (statusEfetivo === 'confirmado' || statusEfetivo === 'aguardando_envio') {
    iconeStatus = '✓';
    tituloStatus = statusEfetivo === 'aguardando_envio' ? 'Aguardando Envio' : 'Pedido Confirmado';
  }

  // Dados do Recibo
  const {
    ehRetirada,
    formaEntregaTexto,
    labelEndereco,
    enderecoExibicao
  } = obterInfoEntregaRecibo(pedido, loja);

  const badgeEstilo = ehRetirada ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800';

  const valorSubtotal = Number(
    (pedido as any).subtotal_produtos ||
    pedido.subtotal ||
    (itens.reduce((acc, i) => acc + Number(i.subtotal || (Number(i.preco_venda_unitario) * Number(i.quantidade)) || 0), 0)) ||
    pedido.valor_total ||
    0
  );
  const valorDesconto = Number(pedido.valor_desconto || 0);
  const valorFrete = Number(pedido.valor_frete || 0);
  const valorTotal = Number(pedido.valor_total || 0);
  const pagInfo = obterDadosPagamentoRecibo(pedido);

  // Ações do Recibo
  const handleBaixarPdf = async () => {
    if (!reciboRef.current || !pedido || !loja) return;
    try {
      setBaixandoPdf(true);
      await ReceiptPdfService.baixarPdfRecibo(reciboRef.current, pedido, loja);
    } catch (err) {
      console.error('Erro ao gerar PDF do recibo:', err);
    } finally {
      setBaixandoPdf(false);
    }
  };

  const handleCopiarRecibo = () => {
    if (!pedido || !loja) return;
    const txt = PrintService.generateWhatsAppMessage(pedido, loja);
    navigator.clipboard.writeText(txt);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const formatarDataHora = (dataStr: string) => {
    try {
      const d = new Date(dataStr);
      return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return dataStr;
    }
  };

  const mapearStatusParaTitulo = (st: string) => {
    switch (st) {
      case 'criacao':
      case 'pendente':
        return 'Pedido Realizado';
      case 'confirmado':
        return 'Pedido Confirmado';
      case 'aguardando_envio':
        return 'Aguardando Envio';
      case 'em_producao':
      case 'em_preparacao':
        return 'Em Preparação';
      case 'pronto_para_retirar':
        return 'Pronto para Retirada';
      case 'enviado':
      case 'saiu_para_entrega':
        return 'Despachado / Em Rota';
      case 'entregue':
        return 'Entregue';
      case 'concluido':
        return 'Concluído';
      case 'cancelado':
        return 'Cancelado';
      default:
        return st;
    }
  };

  // Linha do tempo baseada no histórico real
  type TimelineItem = { titulo: string; dataHora: string; descricao?: string; destaque: boolean };
  let timelineItens: TimelineItem[] = [];

  if (historico && historico.length > 0) {
    timelineItens = historico.map((h, idx, arr) => {
      const isLast = idx === arr.length - 1;
      const statusNome = h.status_novo || h.tipo_evento;
      return {
        titulo: mapearStatusParaTitulo(statusNome),
        dataHora: formatarDataHora(h.criado_em),
        descricao: h.descricao || undefined,
        destaque: isLast
      };
    });
  } else {
    timelineItens.push({
      titulo: 'Pedido Confirmado',
      dataHora: formatarDataHora(pedido.criado_em || ''),
      destaque: !ehEmRota && !ehEntregue
    });

    if (ehEmRota || ehEntregue) {
      timelineItens.push({
        titulo: 'Despachado / Em Rota',
        dataHora: formatarDataHora(pe?.despachado_em || pedido.atualizado_em || ''),
        descricao: ehModalidadeUber ? 'Despachado via Uber Direct' : undefined,
        destaque: ehEmRota && !ehEntregue
      });
    }

    if (ehEntregue) {
      timelineItens.push({
        titulo: 'Pedido Entregue',
        dataHora: formatarDataHora(pe?.atualizado_em || pedido.atualizado_em || ''),
        descricao: 'Entrega finalizada com sucesso',
        destaque: true
      });
    }
  }

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

      <div className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
        <div className="flex items-center gap-2 text-slate-400 text-xs">
          <Package className="w-4 h-4 text-emerald-400" />
          <span className="font-bold text-slate-200">Andamento do pedido #{pedido.numero_pedido || pedido.id.slice(0, 5)}</span>
        </div>

        {/* GRID PRINCIPAL: STATUS (ESQUERDA) + RECIBO (DIREITA) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* COLUNA ESQUERDA: STATUS E HISTÓRICO REAL */}
          <div className="md:col-span-6 space-y-6">
            {/* Card Status Atual */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-xl">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto text-xl font-bold border ${
                ehEntregue
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : ehCancelado
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                  : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
              }`}>
                {iconeStatus}
              </div>

              <div>
                <h3 className="text-xl font-black text-slate-100 capitalize">
                  {tituloStatus}
                </h3>
                <span className="text-xs text-slate-400">
                  {new Date(pedido.criado_em || Date.now()).toLocaleDateString('pt-BR')} às{' '}
                  {new Date(pedido.criado_em || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Botão Destacado Oficial da Uber Direct: Acompanhar Motorista no Mapa ao Vivo */}
              {temLinkUberValido && (
                <div className="pt-2">
                  <a
                    href={linkRastreio}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition cursor-pointer active:scale-95 border border-emerald-400"
                  >
                    <span className="text-base">🚗</span>
                    <span>Acompanhar Motorista no Mapa ao Vivo</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  {pinEntrega && (
                    <div className="mt-2 text-xs text-slate-300 flex items-center justify-center gap-1.5 font-medium">
                      <span>PIN de Entrega:</span>
                      <span className="font-mono font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        {pinEntrega}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Linha do Tempo / Histórico Real do Pedido */}
              <div className="pt-4 border-t border-slate-800 text-left space-y-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Histórico do Pedido
                </span>

                <div className="space-y-3">
                  {timelineItens.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2.5">
                      <div
                        className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${
                          item.destaque
                            ? 'bg-emerald-400 ring-4 ring-emerald-400/20'
                            : 'bg-slate-600'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-bold ${item.destaque ? 'text-emerald-400' : 'text-slate-300'}`}>
                            {item.titulo}
                          </span>
                          <span className="text-[10px] text-slate-500 shrink-0">
                            {item.dataHora}
                          </span>
                        </div>
                        {item.descricao && (
                          <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{item.descricao}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Card Contato da Loja */}
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

          {/* COLUNA DIREITA: RECIBO OFICIAL + BOTÃO NOVA COMPRA */}
          <div className="md:col-span-6 space-y-4">
            {/* Barra de Ações Rápidas do Recibo */}
            <div className="flex items-center justify-between gap-2 bg-slate-900 border border-slate-800 p-3 rounded-2xl shadow-xl">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-slate-200">Recibo do Pedido</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => PrintService.printReceipt(pedido, loja, '80mm')}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  title="Imprimir"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-[11px]">Imprimir</span>
                </button>

                <button
                  type="button"
                  disabled={baixandoPdf}
                  onClick={handleBaixarPdf}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-semibold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                  title="Baixar PDF"
                >
                  {baixandoPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline text-[11px]">PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopiarRecibo}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  title="Copiar texto do recibo"
                >
                  <Copy className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px]">{copiado ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            {/* Recibo Estilo Cupom Térmico */}
            <div
              ref={reciboRef}
              className="bg-white text-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200 text-xs space-y-3 shadow-2xl font-mono"
            >
              {/* Logo e Cabeçalho */}
              <div className="text-center border-b border-slate-200 border-dashed pb-3 space-y-1">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={loja?.nome_fantasia}
                    crossOrigin="anonymous"
                    className="max-h-10 max-w-[150px] mx-auto object-contain mb-1"
                  />
                ) : (
                  <Store className="w-6 h-6 text-slate-700 mx-auto mb-1" />
                )}
                <h4 className="font-black text-sm text-slate-950 uppercase">{loja?.nome_fantasia || 'HUBI PDV'}</h4>
                <p className="text-[10px] text-slate-500 leading-tight">{enderecoLoja}</p>
                <p className="text-[10px] text-slate-500">
                  {loja?.whatsapp ? `Tel: +55 ${loja.whatsapp}` : (loja?.telefone ? `Tel: +55 ${loja.telefone}` : '')}
                </p>
              </div>

              {/* Número e Data */}
              <div className="flex justify-between items-center text-[11px] text-slate-600 border-b border-slate-200 border-dashed pb-2">
                <span className="font-bold text-slate-900">RECIBO #{pedido.numero_pedido}</span>
                <span>{new Date(pedido.criado_em || Date.now()).toLocaleDateString('pt-BR')} às {new Date(pedido.criado_em || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>

              {/* Vendedor / Canal */}
              <div className="space-y-0.5 text-xs text-slate-700 border-b border-slate-200 border-dashed pb-2">
                <span className="text-slate-500 font-semibold text-[11px]">
                  {pedido.origem === 'catalogo_online' ? 'Canal / Vendedor:' : 'Vendedor:'}
                </span>
                <p className="font-bold text-slate-900">
                  {pedido.origem === 'catalogo_online'
                    ? 'Catálogo Online (Pedido Online)'
                    : (pedido as any).vendedor?.nome_completo || 'Caixa / Balcão'}
                </p>
              </div>

              {/* Cliente */}
              <div className="space-y-0.5 text-xs text-slate-700 border-b border-slate-200 border-dashed pb-2">
                <span className="text-slate-500 font-semibold text-[11px]">Cliente:</span>
                <p className="font-bold text-slate-900">{cliente?.nome || 'Cliente Avulso'}</p>
                {(cliente?.whatsapp || cliente?.telefone) && (
                  <p className="text-slate-500 text-[10px]">
                    Tel: +55 {cliente.whatsapp || cliente.telefone}
                  </p>
                )}
              </div>

              {/* Forma de Entrega & Endereço */}
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 border-dashed text-[11px] space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-700 uppercase">Forma de Entrega:</span>
                  <span className={`font-black px-1.5 py-0.5 rounded text-[10px] ${badgeEstilo}`}>
                    {formaEntregaTexto}
                  </span>
                </div>
                <div className="text-slate-600 pt-0.5">
                  <strong className="text-slate-800">{labelEndereco} </strong>
                  <span>{enderecoExibicao}</span>
                </div>
                {pe?.codigo_rastreio && (
                  <div className="text-emerald-700 font-bold pt-0.5 text-[10px]">
                    Rastreio: {pe.codigo_rastreio}
                  </div>
                )}
              </div>

              {/* Itens do Pedido */}
              <div className="space-y-1.5 border-b border-slate-200 border-dashed pb-2">
                <div className="font-bold text-slate-600 text-[10px] uppercase tracking-wider">
                  Itens ({itens.length})
                </div>
                {itens.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start text-xs text-slate-800 py-0.5">
                    <div className="min-w-0 pr-2">
                      <strong className="text-slate-950">{item.quantidade}x</strong> {item.nome_produto} {item.rotulo_variacao ? ` - ${item.rotulo_variacao}` : ''}
                    </div>
                    <span className="font-bold text-slate-900 whitespace-nowrap">
                      R$ {Number(item.subtotal || Number(item.preco_venda_unitario) * Number(item.quantidade) || 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Fechamento Financeiro */}
              <div className="space-y-1.5 text-xs text-slate-700">
                <div className="flex justify-between text-slate-800">
                  <span>Subtotal dos Produtos:</span>
                  <span className="font-semibold text-slate-900">R$ {valorSubtotal.toFixed(2)}</span>
                </div>

                {valorDesconto > 0 && (
                  <div className="flex justify-between text-red-600 font-bold">
                    <span>Desconto:</span>
                    <span>- R$ {valorDesconto.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between text-slate-800">
                  <span>Frete{formaEntregaTexto && !ehRetirada ? ` (${formaEntregaTexto})` : ''}:</span>
                  <span className="font-semibold text-slate-900">
                    {valorFrete > 0 ? `+ R$ ${valorFrete.toFixed(2)}` : 'Grátis'}
                  </span>
                </div>

                <div className="border-t border-dashed border-slate-300 pt-2 my-1" />

                <div className="flex justify-between items-center text-sm font-black text-slate-950">
                  <span>TOTAL:</span>
                  <span className="text-base text-emerald-700 font-black">R$ {valorTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Status de Pagamento & Meio */}
              <div className={`mt-2 p-2.5 rounded-lg border text-xs ${pagInfo.foiPago ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex justify-between items-center pb-1 border-b border-dashed border-slate-200">
                  <span className="font-bold text-[10px] text-slate-700 uppercase">Status Pagamento:</span>
                  <span className={`font-black text-[10px] px-1.5 py-0.5 rounded ${pagInfo.foiPago ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                    {pagInfo.foiPago ? '✓ PAGO' : 'AGUARDANDO PAGAMENTO'}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 text-[11px] text-slate-600">
                  <span>Forma:</span>
                  <span className="font-bold text-slate-800">
                    {pagInfo.pagamentosDetalhados?.[0]?.forma || pedido.pagamentos?.[0]?.forma_pagamento?.nome || 'Cartão de Débito'}
                  </span>
                </div>
              </div>
            </div>

            {/* Iniciar Nova Compra no Catálogo */}
            <div className="text-center pt-2">
              <Link
                to={`/catalog`}
                className="inline-flex items-center justify-center gap-2 w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider transition shadow-lg shadow-emerald-600/25 active:scale-95 cursor-pointer"
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
