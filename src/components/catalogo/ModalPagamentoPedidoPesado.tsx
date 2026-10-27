import React, { useState, useEffect } from 'react';
import {
  X,
  Scale,
  CheckCircle2,
  Copy,
  QrCode,
  ExternalLink,
  Loader2,
  AlertCircle,
  CreditCard,
  Banknote,
  BookOpen,
  ArrowRight,
  Receipt,
  Paperclip
} from 'lucide-react';
import { Loja } from '../../types';
import { supabase } from '../../lib/supabase';
import { paymentGatewayService, PixDinamicoResponse } from '../../services/paymentGatewayService';
import { CadernetaService } from '../../services/cadernetaService';
import { formatarMoeda } from '../../utils/formatters';

interface ModalPagamentoPedidoPesadoProps {
  isOpen: boolean;
  onClose: () => void;
  loja: Loja;
  pedido: any;
  onPagamentoConcluido: () => void;
}

export const ModalPagamentoPedidoPesado: React.FC<ModalPagamentoPedidoPesadoProps> = ({
  isOpen,
  onClose,
  loja,
  pedido,
  onPagamentoConcluido
}) => {
  const pagConfig = (loja as any)?.configuracoes_extras?.pagamentos || {};
  const permiteDinheiro = pagConfig.dinheiro_ativo ?? true;
  const permiteDebito = pagConfig.debito_ativo ?? true;
  const permiteCredito = pagConfig.credito_ativo ?? true;
  const defaultPresencial = permiteCredito ? 'cartao_credito' : permiteDebito ? 'cartao_debito' : 'dinheiro';

  const [metodoEscolhido, setMetodoEscolhido] = useState<'pix' | 'caderneta' | 'entrega'>('pix');
  const [formaEntregaPresencial, setFormaEntregaPresencial] = useState<'dinheiro' | 'cartao_credito' | 'cartao_debito'>(defaultPresencial);
  const [comprovanteArquivo, setComprovanteArquivo] = useState<File | null>(null);
  const [trocoPara, setTrocoPara] = useState<string>('');
  const [pixInfo, setPixInfo] = useState<PixDinamicoResponse | null>(null);
  const [carregandoPix, setCarregandoPix] = useState<boolean>(false);
  const [processando, setProcessando] = useState<boolean>(false);
  const [pixCopiado, setPixCopiado] = useState<boolean>(false);
  const [pagamentoSucesso, setPagamentoSucesso] = useState<boolean>(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  const valorTotal = Number(pedido?.valor_total || 0);
  const cliente = pedido?.cliente;
  const podeCaderneta = Boolean(cliente?.permite_caderneta);
  const temMercadoPago = Boolean(
    loja?.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.ativo &&
    loja?.configuracoes_extras?.pagamentos_digitais?.mercado_pago?.access_token
  );
  const chavePixLoja = pagConfig.pix_chave || (loja as any)?.chave_pix || '';
  const tipoChaveLoja = pagConfig.pix_tipo_chave || (loja as any)?.tipo_chave_pix || 'Chave';
  const temChavePixLoja = Boolean(chavePixLoja);

  const tipoAtendimento = pedido?.pedido_entregas?.[0]?.tipo_atendimento || pedido?.pedido_entregas?.tipo_atendimento || pedido?.tipo_operacao || pedido?.tipo_entrega || 'entrega';
  const ehRetirada = tipoAtendimento === 'retirada' || String(pedido?.endereco_entrega || '').toLowerCase().includes('retirada');
  const rotuloAbaPresencial = ehRetirada ? 'Na Retirada' : 'Na Entrega';

  // Carregar Pix Mercado Pago dinâmico se habilitado
  useEffect(() => {
    let cancelado = false;

    const gerarPix = async () => {
      if (!isOpen || !pedido || !temMercadoPago || pixInfo) return;
      try {
        setCarregandoPix(true);
        const res = await paymentGatewayService.gerarPixMercadoPago({
          loja,
          valor: valorTotal,
          descricao: `Pedido #${pedido.numero_pedido} - ${loja.nome_fantasia}`,
          pedidoNumero: pedido.numero_pedido,
          emailCliente: pedido.cliente_email_avulso || undefined,
          nomeCliente: pedido.cliente_nome_avulso || undefined
        });

        if (!cancelado && res.sucesso && res.qrCode) {
          setPixInfo(res);
        }
      } catch (err) {
        console.warn('[ModalPagamentoPesado] Erro ao gerar Pix:', err);
      } finally {
        if (!cancelado) setCarregandoPix(false);
      }
    };

    if (isOpen && metodoEscolhido === 'pix' && temMercadoPago && !pixInfo) {
      gerarPix();
    }

    return () => {
      cancelado = true;
    };
  }, [isOpen, pedido?.id, metodoEscolhido, temMercadoPago, pixInfo, loja, valorTotal, pedido?.numero_pedido, pedido?.cliente_email_avulso, pedido?.cliente_nome_avulso]);

  // Inscrição em tempo real para capturar pagamento instantâneo do Pix
  useEffect(() => {
    if (!isOpen || !pedido?.id || pagamentoSucesso) return;

    const canal = supabase
      .channel(`pagamento_pesado_${pedido.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pedidos',
          filter: `id=eq.${pedido.id}`
        },
        (payload: any) => {
          const novoStatus = payload.new?.status_pagamento;
          if (novoStatus === 'pago') {
            setPagamentoSucesso(true);
            onPagamentoConcluido();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [isOpen, pedido?.id, pagamentoSucesso, onPagamentoConcluido]);

  if (!isOpen || !pedido) return null;

  const copiarPix = (texto: string) => {
    navigator.clipboard.writeText(texto);
    setPixCopiado(true);
    setTimeout(() => setPixCopiado(false), 2500);
  };

  const handleConfirmarCaderneta = async () => {
    if (!cliente?.id) {
      setErroMsg('Cliente não identificado para lançamento na Caderneta.');
      return;
    }

    try {
      setProcessando(true);
      setErroMsg(null);

      await CadernetaService.registrarCompraCaderneta({
        lojaId: loja.id,
        clienteId: cliente.id,
        pedidoId: pedido.id,
        valor: valorTotal,
        numeroPedido: pedido.numero_pedido
      });

      // Atualizar status do pedido para confirmado / caderneta
      const { error: errPed } = await supabase
        .from('pedidos')
        .update({
          status_pagamento: 'caderneta',
          status: 'confirmado',
          forma_pagamento_catalogo: 'caderneta',
          eh_venda_caderneta: true,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', pedido.id)
        .eq('loja_id', loja.id);

      if (errPed) throw errPed;

      setPagamentoSucesso(true);
      onPagamentoConcluido();
    } catch (err: any) {
      console.error('[ModalPagamentoPesado] Erro ao registrar caderneta:', err);
      setErroMsg(err?.message || 'Falha ao registrar pedido na Caderneta.');
    } finally {
      setProcessando(false);
    }
  };

  const handleEnviarComprovanteWhatsApp = () => {
    const lojaTel = (loja.whatsapp || (loja as any).telefone || '').replace(/\D/g, '');
    const phoneFinal = lojaTel.startsWith('55') ? lojaTel : `55${lojaTel}`;
    const msg = `Olá, ${loja.nome_fantasia}! Segue a confirmação de pagamento Pix do Pedido #${pedido.numero_pedido} no valor de ${formatarMoeda(valorTotal)}.${comprovanteArquivo ? `\n📎 Arquivo de comprovante: ${comprovanteArquivo.name} (enviado em anexo nesta conversa)` : ''}`;
    const url = `https://api.whatsapp.com/send?phone=${phoneFinal}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    setPagamentoSucesso(true);
    onPagamentoConcluido();
  };

  const handleConfirmarPagamentoEntrega = async () => {
    try {
      setProcessando(true);
      setErroMsg(null);

      const rotuloPagamento = formaEntregaPresencial === 'dinheiro'
        ? 'dinheiro_entrega'
        : formaEntregaPresencial === 'cartao_credito'
        ? 'cartao_credito_entrega'
        : 'cartao_debito_entrega';

      const payloadUpdate: any = {
        status_pagamento: 'aguardando_pagamento',
        status: 'confirmado',
        forma_pagamento_catalogo: rotuloPagamento,
        atualizado_em: new Date().toISOString()
      };

      if (formaEntregaPresencial === 'dinheiro' && trocoPara) {
        payloadUpdate.troco_para = Number(trocoPara);
      }

      const { error: errPed } = await supabase
        .from('pedidos')
        .update(payloadUpdate)
        .eq('id', pedido.id)
        .eq('loja_id', loja.id);

      if (errPed) throw errPed;

      const nomeForma = formaEntregaPresencial === 'dinheiro'
        ? 'Dinheiro'
        : formaEntregaPresencial === 'cartao_credito'
        ? 'Cartão de Crédito'
        : 'Cartão de Débito';

      // Registrar auditoria
      await supabase.from('historico_pedidos').insert({
        loja_id: loja.id,
        pedido_id: pedido.id,
        usuario_id: null,
        tipo_evento: 'pagamento_presencial_agendado',
        status_anterior: pedido.status,
        status_novo: 'confirmado',
        motivo: `Cliente escolheu pagar ${rotuloAbaPresencial.toLowerCase()} (${nomeForma}${trocoPara ? ` - Troco para ${formatarMoeda(Number(trocoPara))}` : ''})`,
        criado_em: new Date().toISOString()
      });

      setPagamentoSucesso(true);
      onPagamentoConcluido();
    } catch (err: any) {
      console.error('[ModalPagamentoPesado] Erro ao agendar pagamento na entrega:', err);
      setErroMsg(err?.message || 'Falha ao confirmar forma de pagamento.');
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !processando) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-900 dark:text-slate-100 animate-in zoom-in-95"
      >
        {/* CABEÇALHO */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm sm:text-base">Pagamento do Pedido</h3>
                <span className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  #{pedido.numero_pedido}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Itens pesados na balança e valor definitivo apurado
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={processando}
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TELA DE SUCESSO APÓS PAGAMENTO / CONFIRMAÇÃO */}
        {pagamentoSucesso ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <h4 className="text-lg font-black text-slate-900 dark:text-white">
                {metodoEscolhido === 'pix' ? 'Pagamento Confirmado!' : 'Pagamento Registrado!'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                Seu pedido foi faturado com sucesso no valor de{' '}
                <strong className="text-emerald-500">{formatarMoeda(valorTotal)}</strong>.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
              <a
                href={`/order-tracking/${pedido.id || pedido.numero_pedido}`}
                className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer"
              >
                <span>Acompanhar Pedido</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <a
                href={`/recibo/${pedido.id || pedido.numero_pedido}`}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto px-5 py-3 rounded-2xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Receipt className="w-3.5 h-3.5 text-emerald-500" />
                <span>Visualizar Recibo</span>
              </a>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
            {/* CARD DO TOTAL DEFINITIVO */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/30 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                  Total Final Faturado
                </span>
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {formatarMoeda(valorTotal)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 block">
                  {pedido.itens?.length || 0} item(ns)
                </span>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {loja.nome_fantasia}
                </span>
              </div>
            </div>

            {/* LISTA RESUMIDA DE ITENS PESADOS */}
            <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Itens e Pesagens Aferidas
              </span>
              {(pedido.itens || []).map((it: any, idx: number) => {
                const qtdSol = Number(it.quantidade_solicitada ?? it.peso_solicitado_kg ?? it.quantidade ?? 0);
                const qtdReal = Number(it.quantidade ?? 0);
                const unidade = (it.unidade_medida || 'un').toLowerCase();
                const ehKg = unidade === 'kg';
                const teveVariacao = ehKg && Math.abs(qtdSol - qtdReal) > 0.001;

                return (
                  <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800/60 last:border-0">
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold truncate">
                        {ehKg ? `${qtdReal.toFixed(3)}kg` : `${qtdReal}x`} {it.nome_produto}
                      </div>
                      {teveVariacao && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono">
                          (Pedido: {qtdSol.toFixed(3)}kg → Aferido: {qtdReal.toFixed(3)}kg)
                        </span>
                      )}
                    </div>
                    <span className="font-black text-slate-800 dark:text-slate-200 shrink-0">
                      {formatarMoeda(Number(it.subtotal || 0))}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* SELEÇÃO DO MÉTODO DE PAGAMENTO */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Escolha a forma de pagamento:
              </span>

              <div className="grid grid-cols-3 gap-2">
                {/* BOTÃO PIX */}
                <button
                  type="button"
                  onClick={() => setMetodoEscolhido('pix')}
                  className={`p-3 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                    metodoEscolhido === 'pix'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <QrCode className="w-5 h-5" />
                  <span className="text-xs">Pix</span>
                </button>

                {/* BOTÃO CADERNETA */}
                <button
                  type="button"
                  disabled={!podeCaderneta}
                  onClick={() => setMetodoEscolhido('caderneta')}
                  className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center gap-1.5 ${
                    !podeCaderneta
                      ? 'opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800 text-slate-400'
                      : metodoEscolhido === 'caderneta'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold shadow-sm cursor-pointer'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400 cursor-pointer'
                  }`}
                >
                  <BookOpen className="w-5 h-5" />
                  <span className="text-xs">Caderneta</span>
                </button>

                {/* BOTÃO ENTREGA / BALCÃO */}
                <button
                  type="button"
                  onClick={() => setMetodoEscolhido('entrega')}
                  className={`p-3 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                    metodoEscolhido === 'entrega'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Banknote className="w-5 h-5" />
                  <span className="text-xs">{rotuloAbaPresencial}</span>
                </button>
              </div>
            </div>

            {/* CONTEÚDO ESPECÍFICO DO MÉTODO SELECIONADO */}
            {metodoEscolhido === 'pix' && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-center space-y-3">
                {carregandoPix ? (
                  <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                    <span className="text-xs">Gerando QR Code Pix...</span>
                  </div>
                ) : pixInfo?.qrCodeBase64 ? (
                  <div className="space-y-3">
                    <div className="w-40 h-40 bg-white p-2 rounded-2xl mx-auto shadow-md border border-slate-200 flex items-center justify-center">
                      <img
                        src={`data:image/png;base64,${pixInfo.qrCodeBase64}`}
                        alt="QR Code Pix"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Abra o app do seu banco e aponte a câmera para o QR Code acima, ou copie o código Pix abaixo:
                    </p>
                    {pixInfo.qrCode && (
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => copiarPix(pixInfo.qrCode || '')}
                          className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm"
                        >
                          {pixCopiado ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{pixCopiado ? 'Código Pix Copiado!' : 'Copiar Código Pix'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : temChavePixLoja ? (
                  <div className="space-y-2.5 text-left">
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
                          Chave Pix da Loja ({tipoChaveLoja})
                        </span>
                        <span className="font-mono text-xs sm:text-sm font-black text-slate-900 dark:text-white select-all break-all">
                          {chavePixLoja}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copiarPix(chavePixLoja || '')}
                        className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 transition cursor-pointer shrink-0 active:scale-95"
                      >
                        {pixCopiado ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{pixCopiado ? 'Copiada!' : 'Copiar'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    A chave Pix da loja não foi localizada. Entre em contato pelo WhatsApp para combinar o pagamento.
                  </p>
                )}

                {/* ANEXO DE COMPROVANTE */}
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-left">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                    Comprovante de pagamento Pix (opcional):
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition">
                      <Paperclip className="w-3.5 h-3.5 text-emerald-500" />
                      <span>{comprovanteArquivo ? 'Trocar Arquivo' : 'Anexar Comprovante'}</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setComprovanteArquivo(f);
                        }}
                      />
                    </label>
                    {comprovanteArquivo && (
                      <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300 truncate max-w-[200px]">
                        <span className="truncate">{comprovanteArquivo.name}</span>
                        <button
                          type="button"
                          onClick={() => setComprovanteArquivo(null)}
                          className="text-rose-500 hover:text-rose-600 p-1"
                          title="Remover anexo"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* BOTÃO ENVIAR COMPROVANTE NO WHATSAPP */}
                <button
                  type="button"
                  disabled={processando}
                  onClick={handleEnviarComprovanteWhatsApp}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-emerald-600/20 active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Enviar Comprovante no WhatsApp</span>
                </button>
              </div>
            )}

            {metodoEscolhido === 'caderneta' && podeCaderneta && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                  <BookOpen className="w-4 h-4" />
                  <span>Caderneta de Mercadinho</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  O valor de <strong>{formatarMoeda(valorTotal)}</strong> será lançado na sua conta para quitação na data de vencimento combinada.
                </p>
                <button
                  type="button"
                  disabled={processando}
                  onClick={handleConfirmarCaderneta}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-emerald-600/20 active:scale-95"
                >
                  {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Confirmar Lançamento na Caderneta</span>
                </button>
              </div>
            )}

            {metodoEscolhido === 'entrega' && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Como deseja realizar o pagamento?
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {permiteCredito && (
                    <button
                      type="button"
                      onClick={() => setFormaEntregaPresencial('cartao_credito')}
                      className={`p-3 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        formaEntregaPresencial === 'cartao_credito'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Cartão de Crédito</span>
                    </button>
                  )}

                  {permiteDebito && (
                    <button
                      type="button"
                      onClick={() => setFormaEntregaPresencial('cartao_debito')}
                      className={`p-3 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        formaEntregaPresencial === 'cartao_debito'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Cartão de Débito</span>
                    </button>
                  )}

                  {permiteDinheiro && (
                    <button
                      type="button"
                      onClick={() => setFormaEntregaPresencial('dinheiro')}
                      className={`p-3 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        formaEntregaPresencial === 'dinheiro'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      <Banknote className="w-4 h-4" />
                      <span>Dinheiro</span>
                    </button>
                  )}
                </div>

                {formaEntregaPresencial === 'dinheiro' && permiteDinheiro && (
                  <div className="pt-2 text-left">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Precisa de troco para quanto? (opcional)
                    </label>
                    <input
                      type="number"
                      placeholder={`Ex: ${Math.ceil(valorTotal + 10)}`}
                      value={trocoPara}
                      onChange={(e) => setTrocoPara(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white"
                    />
                  </div>
                )}

                <button
                  type="button"
                  disabled={processando}
                  onClick={handleConfirmarPagamentoEntrega}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-emerald-600/20 active:scale-95"
                >
                  {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  <span>Confirmar Pagamento</span>
                </button>
              </div>
            )}

            {erroMsg && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{erroMsg}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
