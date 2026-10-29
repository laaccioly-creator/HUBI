import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
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
  Paperclip,
  ShieldCheck,
  MapPin,
  Clock
} from 'lucide-react';
import { Loja } from '../../types';
import { supabase } from '../../lib/supabase';
import { paymentGatewayService, PixDinamicoResponse } from '../../services/paymentGatewayService';
import { CadernetaService } from '../../services/cadernetaService';
import { formatarMoeda } from '../../utils/formatters';
import { gerarPayloadPixEmv } from '../../utils/pixUtils';
import { calcularDistanciaKm } from '../../utils/geoUtils';

export interface ModalEscolhaPagamentoProps {
  isOpen: boolean;
  onClose: () => void;
  loja: Loja;
  pedido: any;
  onPagamentoConcluido?: () => void;
}

export const ModalEscolhaPagamento: React.FC<ModalEscolhaPagamentoProps> = ({
  isOpen,
  onClose,
  loja,
  pedido,
  onPagamentoConcluido
}) => {
  const pagConfig = (loja as any)?.configuracoes_extras?.pagamentos || {};
  const pagDigitais = (loja as any)?.configuracoes_extras?.pagamentos_digitais || {};
  const shippingConfig = (loja as any)?.configuracoes_extras?.shipping || {};

  const temMercadoPago = Boolean(
    pagDigitais?.mercado_pago?.ativo &&
    (pagDigitais?.mercado_pago?.access_token || pagDigitais?.mercado_pago?.public_key)
  );

  const chavePixLoja = pagConfig.pix_chave || (loja as any)?.chave_pix || '';
  const tipoChaveLoja = pagConfig.pix_tipo_chave || (loja as any)?.tipo_chave_pix || 'Chave';
  const temChavePixLoja = Boolean(chavePixLoja);
  const temPix = temMercadoPago || temChavePixLoja || (pagConfig.pix_ativo ?? true);

  const valorTotal = Number(pedido?.valor_total || 0);
  const cliente = pedido?.cliente;
  const podeCaderneta = Boolean(cliente?.permite_caderneta);
  const cadernetaAtivaLoja = Boolean((loja as any)?.configuracoes_extras?.caderneta_ativa);

  // 1. Identificar modalidade de atendimento (Retirada vs Entrega)
  const pe = Array.isArray(pedido?.pedido_entregas) ? pedido?.pedido_entregas[0] : (pedido?.pedido_entregas || (pedido as any)?.pedido_entrega);
  const tipoAtendimento = pe?.tipo_atendimento || pedido?.tipo_operacao || (pedido as any)?.tipo_entrega || 'entrega';
  const ehRetirada = tipoAtendimento === 'retirada' || String(pedido?.endereco_entrega || '').toLowerCase().includes('retirada') || pe?.provedor === 'retirada_loja';

  // 2. Trava Geográfica para Pagamentos Presenciais
  const validacaoPresencial = useMemo(() => {
    if (ehRetirada) {
      return { permitido: true, motivo: '' };
    }

    const provedor = (pe?.provedor || (pedido as any)?.provedor_frete || '').toLowerCase();
    const transpNome = (pe?.transportadora_nome || pedido?.nome_transportadora || '').toLowerCase();
    const servicoCorreios = (pe?.servico_correios || pedido?.servico_correios || '').toLowerCase();

    // Se tiver operadora externa de frete (Correios, Melhor Envio ou transportadoras interestaduais)
    const ehOperadoraExterna = 
      provedor === 'melhor_envio' ||
      provedor === 'correios' ||
      Boolean(servicoCorreios) ||
      transpNome.includes('correios') ||
      transpNome.includes('sedex') ||
      transpNome.includes('pac') ||
      transpNome.includes('jadlog') ||
      transpNome.includes('azul cargo') ||
      transpNome.includes('loggi') ||
      transpNome.includes('latam');

    if (ehOperadoraExterna) {
      return {
        permitido: false,
        motivo: 'Pagamentos presenciais (dinheiro/maquininha) são restritos a entregas locais próprias da loja.'
      };
    }

    // Checar Raio Máximo de Atendimento (km)
    const raioMaximoKm = Number(
      shippingConfig.frete_proprio_raio_maximo_km ||
      (loja as any)?.raio_entrega_km ||
      15.0
    );

    const origLat = Number(shippingConfig.origem_latitude || (loja as any)?.latitude);
    const origLng = Number(shippingConfig.origem_longitude || (loja as any)?.longitude);
    const destLat = Number(pe?.destino_latitude || cliente?.endereco_latitude || cliente?.latitude);
    const destLng = Number(pe?.destino_longitude || cliente?.endereco_longitude || cliente?.longitude);

    if (!isNaN(origLat) && !isNaN(origLng) && origLat !== 0 && origLng !== 0 &&
        !isNaN(destLat) && !isNaN(destLng) && destLat !== 0 && destLng !== 0) {
      const distKm = calcularDistanciaKm(origLat, origLng, destLat, destLng);
      if (distKm > raioMaximoKm) {
        return {
          permitido: false,
          motivo: `O endereço de entrega está a ${distKm.toFixed(1)} km da loja (acima do raio máximo de entrega local de ${raioMaximoKm} km).`
        };
      }
    }

    return { permitido: true, motivo: '' };
  }, [ehRetirada, pe, pedido, shippingConfig, loja, cliente]);

  const permiteDinheiro = (pagConfig.dinheiro_ativo ?? true) && validacaoPresencial.permitido;
  const permiteDebito = (pagConfig.debito_ativo ?? true) && validacaoPresencial.permitido;
  const permiteCredito = (pagConfig.credito_ativo ?? true) && validacaoPresencial.permitido;
  const permitePresencial = permiteDinheiro || permiteDebito || permiteCredito;

  // Método default selecionado
  const [metodoEscolhido, setMetodoEscolhido] = useState<string>(() => {
    if (temMercadoPago) return 'mercado_pago';
    if (temPix) return 'pix';
    if (cadernetaAtivaLoja && podeCaderneta) return 'caderneta';
    if (permitePresencial) return 'presencial';
    return 'pix';
  });

  const [formaPresencialEscolhida, setFormaPresencialEscolhida] = useState<'dinheiro' | 'cartao_debito' | 'cartao_credito'>(
    permiteCredito ? 'cartao_credito' : permiteDebito ? 'cartao_debito' : 'dinheiro'
  );
  const [trocoPara, setTrocoPara] = useState<string>('');
  const [comprovanteArquivo, setComprovanteArquivo] = useState<File | null>(null);

  // Estados de processamento e feedback
  const [pixInfo, setPixInfo] = useState<PixDinamicoResponse | null>(null);
  const [carregandoPix, setCarregandoPix] = useState<boolean>(false);
  const [pixCopiado, setPixCopiado] = useState<boolean>(false);
  const [processando, setProcessando] = useState<boolean>(false);
  const [pagamentoSucesso, setPagamentoSucesso] = useState<boolean>(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  // Gerar código Pix EMV válido da loja (Copia e Cola com CRC16 oficial)
  const codigoPixEmvLoja = useMemo(() => {
    if (!temChavePixLoja) return '';
    return gerarPayloadPixEmv({
      chavePix: chavePixLoja,
      nomeRecebedor: loja.nome_fantasia || 'HUBI SISTEMAS',
      cidade: (loja as any)?.cidade || (loja as any)?.endereco_cidade || 'BRASIL',
      valor: valorTotal,
      identificador: `PED${pedido?.numero_pedido || ''}`
    });
  }, [chavePixLoja, loja, valorTotal, pedido?.numero_pedido]);

  // Se o método for Pix e houver Mercado Pago ativo, gera Pix dinâmico
  useEffect(() => {
    let cancelado = false;

    const carregarPixMercadoPago = async () => {
      if (!isOpen || !pedido || !temMercadoPago || pixInfo || metodoEscolhido !== 'pix') return;
      try {
        setCarregandoPix(true);
        const res = await paymentGatewayService.gerarPixMercadoPago({
          loja,
          valor: valorTotal,
          descricao: `Pedido #${pedido.numero_pedido} - ${loja.nome_fantasia}`,
          pedidoNumero: pedido.numero_pedido,
          emailCliente: pedido.cliente_email_avulso || cliente?.email || undefined,
          nomeCliente: pedido.cliente_nome_avulso || cliente?.nome || undefined
        });

        if (!cancelado && res.sucesso && res.qrCode) {
          setPixInfo(res);
        }
      } catch (err) {
        console.warn('[ModalEscolhaPagamento] Falha ao gerar Pix dinâmico MP:', err);
      } finally {
        if (!cancelado) setCarregandoPix(false);
      }
    };

    if (isOpen && metodoEscolhido === 'pix' && temMercadoPago && !pixInfo) {
      carregarPixMercadoPago();
    }

    return () => {
      cancelado = true;
    };
  }, [isOpen, pedido, metodoEscolhido, temMercadoPago, pixInfo, loja, valorTotal, cliente]);

  // Inscrição em tempo real para capturar confirmação do pagamento
  useEffect(() => {
    if (!isOpen || !pedido?.id || pagamentoSucesso) return;

    const canal = supabase
      .channel(`pagamento_pedido_${pedido.id}`)
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
            onPagamentoConcluido?.();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [isOpen, pedido?.id, pagamentoSucesso, onPagamentoConcluido]);

  if (!isOpen || !pedido) return null;

  const copiarPix = (codigo: string) => {
    if (!codigo) return;
    navigator.clipboard.writeText(codigo);
    setPixCopiado(true);
    setTimeout(() => setPixCopiado(false), 2500);
  };

  // Ação 1: Redirecionamento Direto Mercado Pago
  const handlePagarMercadoPago = async () => {
    try {
      setProcessando(true);
      setErroMsg(null);

      const itensPreference = (pedido.itens || []).map((it: any) => ({
        titulo: it.nome_produto || 'Item do Pedido',
        quantidade: Number(it.quantidade || 1),
        precoUnitario: Number(it.preco_unitario || it.subtotal || 0)
      }));

      const valorFrete = Number(pedido.valor_frete || pe?.valor_frete || 0);
      if (valorFrete > 0) {
        itensPreference.push({
          titulo: `Frete / Entrega (${pe?.transportadora_nome || 'Entrega'})`,
          quantidade: 1,
          precoUnitario: valorFrete
        });
      }

      const emailEfetivo = pedido.cliente_email_avulso || cliente?.email || undefined;
      const linkRes = await paymentGatewayService.gerarLinkMercadoPago({
        loja,
        itens: itensPreference.length > 0 ? itensPreference : [{
          titulo: `Pedido #${pedido.numero_pedido} - ${loja.nome_fantasia}`,
          quantidade: 1,
          precoUnitario: valorTotal
        }],
        pedidoNumero: pedido.numero_pedido,
        clienteEmail: emailEfetivo
      });

      if (linkRes.sucesso && linkRes.linkPagamento) {
        // Redirecionamento imediato sem telas intermediárias
        window.location.href = linkRes.linkPagamento;
        return;
      }

      throw new Error(linkRes.mensagem || 'Não foi possível gerar a preferência de pagamento no Mercado Pago.');
    } catch (err: any) {
      console.error('Erro ao redirecionar para Mercado Pago:', err);
      setErroMsg(err?.message || 'Erro ao comunicar com Mercado Pago.');
      setProcessando(false);
    }
  };

  // Ação 2: Confirmar Pagamento Pix com Comprovante
  const handleConfirmarPix = async () => {
    try {
      setProcessando(true);
      setErroMsg(null);

      let comprovanteUrl: string | null = null;
      if (comprovanteArquivo) {
        const extensao = comprovanteArquivo.name.split('.').pop() || 'png';
        const nomeArquivo = `comprovante_pix_${pedido.id}_${Date.now()}.${extensao}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('comprovantes_catalogo')
          .upload(nomeArquivo, comprovanteArquivo, { upsert: true });

        if (!uploadErr && uploadData?.path) {
          const { data: pubUrl } = supabase.storage
            .from('comprovantes_catalogo')
            .getPublicUrl(uploadData.path);
          comprovanteUrl = pubUrl.publicUrl;
        }
      }

      const payloadUpdate: any = {
        forma_pagamento_catalogo: 'pix',
        atualizado_em: new Date().toISOString()
      };
      if (comprovanteUrl) {
        payloadUpdate.comprovante_pagamento_url = comprovanteUrl;
      }

      await supabase
        .from('pedidos')
        .update(payloadUpdate)
        .eq('id', pedido.id)
        .eq('loja_id', loja.id);

      setPagamentoSucesso(true);
      onPagamentoConcluido?.();
    } catch (err: any) {
      console.error('Erro ao registrar Pix:', err);
      setErroMsg(err?.message || 'Erro ao registrar comprovante Pix.');
    } finally {
      setProcessando(false);
    }
  };

  // Ação 3: Confirmar Caderneta de Mercadinho
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

      await supabase
        .from('pedidos')
        .update({
          status_pagamento: 'caderneta',
          forma_pagamento_catalogo: 'caderneta',
          eh_venda_caderneta: true,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', pedido.id)
        .eq('loja_id', loja.id);

      setPagamentoSucesso(true);
      onPagamentoConcluido?.();
    } catch (err: any) {
      console.error('Erro ao registrar na caderneta:', err);
      setErroMsg(err?.message || 'Erro ao lançar pedido na Caderneta.');
    } finally {
      setProcessando(false);
    }
  };

  // Ação 4: Confirmar Pagamento Presencial (Entrega / Retirada)
  const handleConfirmarPresencial = async () => {
    try {
      setProcessando(true);
      setErroMsg(null);

      const payloadUpdate: any = {
        forma_pagamento_catalogo: formaPresencialEscolhida,
        atualizado_em: new Date().toISOString()
      };

      if (formaPresencialEscolhida === 'dinheiro' && trocoPara.trim()) {
        const obsAtual = pedido.observacoes ? `${pedido.observacoes} | ` : '';
        payloadUpdate.observacoes = `${obsAtual}Troco para R$ ${trocoPara.trim()}`;
      }

      await supabase
        .from('pedidos')
        .update(payloadUpdate)
        .eq('id', pedido.id)
        .eq('loja_id', loja.id);

      setPagamentoSucesso(true);
      onPagamentoConcluido?.();
    } catch (err: any) {
      console.error('Erro ao registrar pagamento presencial:', err);
      setErroMsg(err?.message || 'Erro ao confirmar forma de pagamento.');
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="bg-white dark:bg-[#08131A] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150">
        
        {/* CABEÇALHO */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                Pagamento do Pedido #{pedido.numero_pedido}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {loja.nome_fantasia} • {formatarMoeda(valorTotal)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FEEDBACK DE SUCESSO */}
        {pagamentoSucesso ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto text-emerald-500">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              Pagamento Registrado com Sucesso!
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-xs mx-auto">
              A forma de pagamento foi vinculada ao seu pedido e a loja já foi notificada para preparar o seu pacote.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider transition cursor-pointer active:scale-95 shadow-md shadow-emerald-600/20"
            >
              Concluir
            </button>
          </div>
        ) : (
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 text-left">
            
            {/* CARD DE VALOR TOTAL */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/30 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                  Total a Pagar
                </span>
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {formatarMoeda(valorTotal)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
                  {ehRetirada ? 'Retirada na Loja' : 'Entrega no Endereço'}
                </span>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {pedido.itens?.length || 0} item(ns)
                </span>
              </div>
            </div>

            {/* AVISO DE TRAVA GEOGRÁFICA (SE APLICÁVEL) */}
            {!validacaoPresencial.permitido && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  {validacaoPresencial.motivo} Pagamentos em dinheiro ou maquininha foram desabilitados para esta modalidade de frete. Por favor, utilize Pix ou Mercado Pago.
                </p>
              </div>
            )}

            {/* SELEÇÃO DO MÉTODO DE PAGAMENTO */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Selecione o meio de pagamento:
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* 1. MERCADO PAGO */}
                {temMercadoPago && (
                  <button
                    type="button"
                    onClick={() => setMetodoEscolhido('mercado_pago')}
                    className={`p-3 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                      metodoEscolhido === 'mercado_pago'
                        ? 'border-amber-400 bg-amber-400/10 text-amber-500 dark:text-amber-400 font-bold shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <CreditCard className="w-5 h-5" />
                    <span className="text-xs">Mercado Pago</span>
                  </button>
                )}

                {/* 2. PIX */}
                {temPix && (
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
                )}

                {/* 3. CADERNETA */}
                {cadernetaAtivaLoja && podeCaderneta && (
                  <button
                    type="button"
                    onClick={() => setMetodoEscolhido('caderneta')}
                    className={`p-3 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                      metodoEscolhido === 'caderneta'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <BookOpen className="w-5 h-5" />
                    <span className="text-xs">Caderneta</span>
                  </button>
                )}

                {/* 4. PRESENCIAL (DINHEIRO / MAQUININHA) */}
                <button
                  type="button"
                  disabled={!validacaoPresencial.permitido}
                  onClick={() => validacaoPresencial.permitido && setMetodoEscolhido('presencial')}
                  className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center gap-1.5 ${
                    !validacaoPresencial.permitido
                      ? 'opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800 text-slate-400'
                      : metodoEscolhido === 'presencial'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold shadow-sm cursor-pointer'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400 cursor-pointer'
                  }`}
                >
                  <Banknote className="w-5 h-5" />
                  <span className="text-xs">{ehRetirada ? 'No Balcão' : 'Na Entrega'}</span>
                </button>
              </div>
            </div>

            {/* SEÇÃO 1: MERCADO PAGO (REDIRECIONAMENTO DIRETO) */}
            {metodoEscolhido === 'mercado_pago' && (
              <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-400/30 space-y-3">
                <div className="flex items-center gap-2 text-amber-500 dark:text-amber-400 font-bold text-xs">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Checkout Seguro Mercado Pago</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Você será redirecionado imediatamente para o ambiente oficial do Mercado Pago para efetuar o pagamento via Pix instantâneo, Cartão de Crédito ou saldo em conta.
                </p>
                <button
                  type="button"
                  disabled={processando}
                  onClick={handlePagarMercadoPago}
                  className="w-full py-3.5 px-4 rounded-2xl bg-[#FFE600] hover:bg-[#F5DC00] text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-amber-400/20 transition cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {processando ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                      <span>Redirecionando...</span>
                    </>
                  ) : (
                    <>
                      <span>Ir para o Mercado Pago</span>
                      <ExternalLink className="w-4 h-4 text-slate-950" />
                    </>
                  )}
                </button>
              </div>
            )}

            {/* SEÇÃO 2: PIX (EMV OFICIAL DA LOJA OU DINÂMICO MP) */}
            {metodoEscolhido === 'pix' && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-4">
                {carregandoPix ? (
                  <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                    <span className="text-xs">Gerando código Pix...</span>
                  </div>
                ) : (
                  <>
                    {/* Exibição QR Code Base64 (se Mercado Pago gerou) */}
                    {pixInfo?.qrCodeBase64 && (
                      <div className="w-40 h-40 bg-white p-2 rounded-2xl mx-auto shadow-md border border-slate-200 flex items-center justify-center">
                        <img
                          src={`data:image/png;base64,${pixInfo.qrCodeBase64}`}
                          alt="QR Code Pix"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}

                    {/* Bloco Copia e Cola com Código EMV Válido */}
                    {(() => {
                      const codigoFinal = pixInfo?.qrCode || codigoPixEmvLoja;
                      if (!codigoFinal) {
                        return (
                          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-300 text-xs text-amber-800 dark:text-amber-300 text-center">
                            A chave Pix da loja não foi configurada. Entre em contato para combinar o pagamento.
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-2">
                          <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                            Código Pix Copia e Cola (BR Code Oficial):
                          </label>
                          <div className="p-2.5 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                            <span className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate select-all flex-1">
                              {codigoFinal}
                            </span>
                            <button
                              type="button"
                              onClick={() => copiarPix(codigoFinal)}
                              className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 active:scale-95 shadow-xs"
                            >
                              {pixCopiado ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{pixCopiado ? 'Copiado!' : 'Copiar'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Chave Pix legível alternativa */}
                    {temChavePixLoja && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 text-center pt-1">
                        Chave da Loja ({tipoChaveLoja}): <strong className="text-slate-800 dark:text-slate-200 select-all">{chavePixLoja}</strong>
                      </div>
                    )}

                    {/* Upload de Comprovante Opcional */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                        Anexar comprovante de pagamento (opcional):
                      </label>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => setComprovanteArquivo(e.target.files?.[0] || null)}
                        className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 dark:file:bg-emerald-950/40 dark:file:text-emerald-400 cursor-pointer"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={processando}
                      onClick={handleConfirmarPix}
                      className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 disabled:opacity-50 shadow-md shadow-emerald-600/20"
                    >
                      {processando ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          <span>Confirmando...</span>
                        </>
                      ) : (
                        <span>Já realizei o Pix / Enviar Comprovante</span>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* SEÇÃO 3: CADERNETA */}
            {metodoEscolhido === 'caderneta' && (
              <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/30 space-y-3">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                  <BookOpen className="w-4 h-4" />
                  <span>Caderneta de Mercadinho</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  O valor de <strong>{formatarMoeda(valorTotal)}</strong> será debitado na sua conta da Caderneta para acerto no fechamento do ciclo.
                </p>
                <button
                  type="button"
                  disabled={processando}
                  onClick={handleConfirmarCaderneta}
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 disabled:opacity-50 shadow-md shadow-emerald-600/20"
                >
                  {processando ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Registrando...</span>
                    </>
                  ) : (
                    <span>Confirmar na Caderneta</span>
                  )}
                </button>
              </div>
            )}

            {/* SEÇÃO 4: PRESENCIAL (DINHEIRO / MAQUININHA) */}
            {metodoEscolhido === 'presencial' && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Como deseja pagar {ehRetirada ? 'no balcão' : 'ao entregador'}?
                </span>

                <div className="space-y-2">
                  {permiteDinheiro && (
                    <label className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      formaPresencialEscolhida === 'dinheiro'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="forma_presencial"
                          checked={formaPresencialEscolhida === 'dinheiro'}
                          onChange={() => setFormaPresencialEscolhida('dinheiro')}
                          className="accent-emerald-600"
                        />
                        <span className="text-xs">Dinheiro em Espécie</span>
                      </div>
                    </label>
                  )}

                  {formaPresencialEscolhida === 'dinheiro' && (
                    <div className="pl-6 pt-1 space-y-1">
                      <label className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                        Precisa de troco para quanto? (opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 50,00 ou 100,00"
                        value={trocoPara}
                        onChange={(e) => setTrocoPara(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-emerald-500"
                      />
                    </div>
                  )}

                  {permiteDebito && (
                    <label className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      formaPresencialEscolhida === 'cartao_debito'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="forma_presencial"
                          checked={formaPresencialEscolhida === 'cartao_debito'}
                          onChange={() => setFormaPresencialEscolhida('cartao_debito')}
                          className="accent-emerald-600"
                        />
                        <span className="text-xs">Cartão de Débito (Maquininha)</span>
                      </div>
                    </label>
                  )}

                  {permiteCredito && (
                    <label className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                      formaPresencialEscolhida === 'cartao_credito'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="forma_presencial"
                          checked={formaPresencialEscolhida === 'cartao_credito'}
                          onChange={() => setFormaPresencialEscolhida('cartao_credito')}
                          className="accent-emerald-600"
                        />
                        <span className="text-xs">Cartão de Crédito (Maquininha)</span>
                      </div>
                    </label>
                  )}
                </div>

                <button
                  type="button"
                  disabled={processando}
                  onClick={handleConfirmarPresencial}
                  className="w-full mt-2 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 disabled:opacity-50 shadow-md shadow-emerald-600/20"
                >
                  {processando ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Confirmando...</span>
                    </>
                  ) : (
                    <span>Confirmar Opção Presencial</span>
                  )}
                </button>
              </div>
            )}

            {/* MENSAGEM DE ERRO (SE HOUVER) */}
            {erroMsg && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{erroMsg}</span>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};
