import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  DollarSign,
  QrCode,
  CreditCard,
  Banknote,
  Copy,
  Check,
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { Cliente, Loja } from '../../types';
import { CadernetaService } from '../../services/cadernetaService';
import { paymentGatewayService, PixDinamicoResponse } from '../../services/paymentGatewayService';
import { formatarMoeda } from '../../utils/formatters';
import { MoneyInput } from '../ui/MoneyInput';
import { supabase } from '../../lib/supabase';

export interface MetodoPagamentoLiquidacao {
  id: string;
  tipo: 'pix' | 'dinheiro' | 'cartao_debito' | 'cartao_credito' | 'mercado_pago';
  nome: string;
  descricao: string;
  possuiWebhook: boolean;
}

interface ModalPagamentoCadernetaUnificadoProps {
  isOpen: boolean;
  onClose: () => void;
  loja: Loja | null;
  cliente: Cliente | null;
  saldoDevedor: number;
  origem: 'lojista' | 'catalogo';
  usuarioId?: string;
  isDark?: boolean;
  onSucesso: (mensagem: string, liquidadoImediatamente: boolean) => Promise<void> | void;
}

export const ModalPagamentoCadernetaUnificado: React.FC<ModalPagamentoCadernetaUnificadoProps> = ({
  isOpen,
  onClose,
  loja,
  cliente,
  saldoDevedor,
  origem,
  usuarioId,
  isDark = false,
  onSucesso
}) => {
  const [valorPagamento, setValorPagamento] = useState<number>(0);
  const [metodoSelecionado, setMetodoSelecionado] = useState<string>('');
  const [processando, setProcessando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pixCopiado, setPixCopiado] = useState<boolean>(false);

  // Estado para upload de comprovante Pix Manual (Catálogo Online)
  const [arquivoComprovante, setArquivoComprovante] = useState<File | null>(null);
  const [comprovanteDataUrl, setComprovanteDataUrl] = useState<string | null>(null);
  const [enviandoComprovante, setEnviandoComprovante] = useState<boolean>(false);

  // Estado para Gateway com Webhook (Mercado Pago QR Code Dinâmico)
  const [pixDinamico, setPixDinamico] = useState<PixDinamicoResponse | null>(null);
  const [verificandoWebhook, setVerificandoWebhook] = useState<boolean>(false);

  // Lista unificada consumindo estritamente os métodos ativos na loja (bloqueando caderneta e fiado)
  const metodosAtivos = useMemo<MetodoPagamentoLiquidacao[]>(() => {
    const pagConfig = (loja?.configuracoes_extras as any)?.pagamentos || {};
    const pagDigitais = (loja?.configuracoes_extras as any)?.pagamentos_digitais || {};
    const lista: MetodoPagamentoLiquidacao[] = [];

    if (pagDigitais?.mercado_pago?.ativo && pagDigitais?.mercado_pago?.access_token) {
      lista.push({
        id: 'mercado_pago',
        tipo: 'mercado_pago',
        nome: 'Pix Automático (Mercado Pago)',
        descricao: 'QR Code dinâmico com baixa automática via confirmação',
        possuiWebhook: true
      });
    }

    if (pagConfig.pix_ativo !== false) {
      lista.push({
        id: 'pix',
        tipo: 'pix',
        nome: 'Pix Manual / Chave',
        descricao: pagConfig.pix_chave || (loja as any)?.chave_pix
          ? `Chave: ${pagConfig.pix_chave || (loja as any)?.chave_pix}`
          : 'Transferência direta para a chave Pix da loja',
        possuiWebhook: false
      });
    }

    if (pagConfig.dinheiro_ativo !== false) {
      lista.push({
        id: 'dinheiro',
        tipo: 'dinheiro',
        nome: 'Dinheiro',
        descricao: 'Pagamento em espécie no balcão ou portador',
        possuiWebhook: false
      });
    }

    if (pagConfig.debito_ativo !== false) {
      lista.push({
        id: 'cartao_debito',
        tipo: 'cartao_debito',
        nome: 'Cartão de Débito',
        descricao: 'Pagamento na maquininha da loja',
        possuiWebhook: false
      });
    }

    if (pagConfig.credito_ativo !== false) {
      lista.push({
        id: 'cartao_credito',
        tipo: 'cartao_credito',
        nome: 'Cartão de Crédito',
        descricao: 'Pagamento na maquininha da loja',
        possuiWebhook: false
      });
    }

    return lista;
  }, [loja]);

  useEffect(() => {
    if (isOpen) {
      setValorPagamento(Number(saldoDevedor.toFixed(2)));
      setErro(null);
      setArquivoComprovante(null);
      setComprovanteDataUrl(null);
      setPixDinamico(null);
      if (metodosAtivos.length > 0) {
        setMetodoSelecionado(metodosAtivos[0].id);
      }
    }
  }, [isOpen, saldoDevedor, metodosAtivos]);

  const metodoAtual = useMemo(
    () => metodosAtivos.find((m) => m.id === metodoSelecionado) || null,
    [metodosAtivos, metodoSelecionado]
  );

  // Polling automático quando um QR Code dinâmico de gateway está aguardando pagamento no Catálogo
  useEffect(() => {
    if (!isOpen || !pixDinamico?.transacaoId || !loja?.id || !cliente?.id) return;
    const accessToken = (loja.configuracoes_extras as any)?.pagamentos_digitais?.mercado_pago?.access_token;
    if (!accessToken) return;

    const timer = setInterval(async () => {
      try {
        const detalhes = await paymentGatewayService.consultarDetalhesMercadoPago(
          pixDinamico.transacaoId!,
          accessToken
        );
        if (detalhes.status === 'approved') {
          clearInterval(timer);
          await efetivarBaixaAprovadaGateway(pixDinamico.transacaoId!);
        }
      } catch {
        // ignora falha de rede transitória no polling
      }
    }, 6000);

    return () => clearInterval(timer);
  }, [isOpen, pixDinamico?.transacaoId, loja?.id, cliente?.id]);

  if (!isOpen || !cliente || !loja) return null;

  const pagConfig = (loja.configuracoes_extras as any)?.pagamentos || {};
  const chavePixLoja = pagConfig.pix_chave || (loja as any)?.chave_pix || '';
  const orientacoesPixLoja = pagConfig.pix_orientacoes || '';

  const handleCopiarTexto = async (texto: string) => {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      setPixCopiado(true);
      setTimeout(() => setPixCopiado(false), 2500);
    } catch {
      // fallback silencioso
    }
  };

  const handleSelecionarComprovante = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setErro('O arquivo do comprovante deve ter no máximo 8MB.');
      return;
    }
    setErro(null);
    setArquivoComprovante(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setComprovanteDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const fazerUploadComprovante = async (): Promise<string | null> => {
    if (!arquivoComprovante) return comprovanteDataUrl;
    setEnviandoComprovante(true);
    try {
      const ext = arquivoComprovante.name.split('.').pop() || 'jpg';
      const filePath = `comprovantes_caderneta/${loja.id}_${cliente.id}_${Date.now()}.${ext}`;

      for (const bucket of ['produtos', 'fotos']) {
        const { error: upErr } = await supabase.storage
          .from(bucket)
          .upload(filePath, arquivoComprovante, { upsert: true });

        if (!upErr) {
          const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
          if (data?.publicUrl) {
            return data.publicUrl;
          }
        }
      }
      return comprovanteDataUrl;
    } catch {
      return comprovanteDataUrl;
    } finally {
      setEnviandoComprovante(false);
    }
  };

  const resolverFormaPagamentoBancoId = async (tipo: string): Promise<string> => {
    const { data: formasBanco } = await supabase
      .from('formas_pagamento')
      .select('id, nome, tipo')
      .eq('loja_id', loja.id)
      .eq('ativo', true);

    const encontrada = (formasBanco || []).find((f: any) => {
      const t = (f.tipo || '').toLowerCase();
      const n = (f.nome || '').toLowerCase();
      if (t === 'fiado' || t === 'caderneta' || n.includes('caderneta') || n.includes('fiado')) {
        return false;
      }
      if (tipo === 'pix' || tipo === 'mercado_pago') return t === 'pix' || n.includes('pix');
      if (tipo === 'dinheiro') return t === 'dinheiro' || n.includes('dinheiro');
      if (tipo === 'cartao_debito') return t === 'cartao_debito' || n.includes('débito') || n.includes('debito');
      if (tipo === 'cartao_credito') return t === 'cartao_credito' || n.includes('crédito') || n.includes('credito');
      return false;
    });

    return encontrada?.id || tipo;
  };

  const efetivarBaixaAprovadaGateway = async (transacaoId: string) => {
    try {
      setProcessando(true);
      const fpId = await resolverFormaPagamentoBancoId('pix');
      const res = await CadernetaService.registrarPagamentoCaderneta({
        lojaId: loja.id,
        clienteId: cliente.id,
        valorPago: valorPagamento,
        formaPagamentoId: fpId,
        formaTipo: 'pix',
        observacoes: `Liquidação Automática via Webhook Mercado Pago (ID #${transacaoId})`
      });

      if (!res.sucesso) {
        setErro(res.mensagem || 'Não foi possível concluir a baixa automática.');
        return;
      }

      if (Number(cliente.saldo_devedor_fiado || 0) > 0) {
        const novoSaldoFiado = Math.max(0, Number((Number(cliente.saldo_devedor_fiado || 0) - valorPagamento).toFixed(2)));
        await supabase
          .from('clientes')
          .update({ saldo_devedor_fiado: novoSaldoFiado })
          .eq('id', cliente.id)
          .eq('loja_id', loja.id);
      }

      await onSucesso(
        `Pagamento de ${formatarMoeda(valorPagamento)} confirmado automaticamente pelo Mercado Pago! Seu limite já foi liberado.`,
        true
      );
      onClose();
    } finally {
      setProcessando(false);
    }
  };

  const handleVerificarStatusGatewayManual = async () => {
    if (!pixDinamico?.transacaoId) return;
    const accessToken = (loja.configuracoes_extras as any)?.pagamentos_digitais?.mercado_pago?.access_token;
    if (!accessToken) return;

    try {
      setVerificandoWebhook(true);
      setErro(null);
      const detalhes = await paymentGatewayService.consultarDetalhesMercadoPago(
        pixDinamico.transacaoId,
        accessToken
      );
      if (detalhes.status === 'approved') {
        await efetivarBaixaAprovadaGateway(pixDinamico.transacaoId);
      } else {
        setErro('Pagamento ainda consta como pendente no gateway. Assim que compensar, a baixa será liberada automaticamente.');
      }
    } catch {
      setErro('Não foi possível consultar o status no momento. Tente novamente em instantes.');
    } finally {
      setVerificandoWebhook(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (valorPagamento <= 0) {
      setErro('Informe um valor válido maior que zero.');
      return;
    }

    if (valorPagamento > saldoDevedor + 0.01) {
      setErro('O valor informado não pode ser maior que o saldo devedor atual.');
      return;
    }

    if (!metodoAtual) {
      setErro('Selecione uma forma de pagamento ativa.');
      return;
    }

    try {
      setProcessando(true);
      const fpId = await resolverFormaPagamentoBancoId(metodoAtual.tipo);

      // FLUXO 1: Painel Administrativo (Lojista efetuando baixa presencial/conferida)
      if (origem === 'lojista') {
        const res = await CadernetaService.registrarPagamentoCaderneta({
          lojaId: loja.id,
          clienteId: cliente.id,
          valorPago: valorPagamento,
          formaPagamentoId: fpId,
          formaTipo: metodoAtual.tipo === 'mercado_pago' ? 'pix' : metodoAtual.tipo,
          usuarioId,
          observacoes: `Pagamento registrado pelo lojista (${metodoAtual.nome})`
        });

        if (!res.sucesso) {
          setErro(res.mensagem || 'Falha ao registrar pagamento na caderneta.');
          return;
        }

        await onSucesso(`Pagamento de ${formatarMoeda(valorPagamento)} (${metodoAtual.nome}) registrado na caderneta!`, true);
        onClose();
        return;
      }

      // FLUXO 2: Catálogo Online + Gateway com Webhook (ex: Mercado Pago)
      if (metodoAtual.possuiWebhook && metodoAtual.tipo === 'mercado_pago') {
        const resPix = await paymentGatewayService.gerarPixMercadoPago({
          loja,
          valor: valorPagamento,
          descricao: `Quitação Caderneta - ${cliente.nome}`,
          pedidoNumero: Math.floor(Date.now() / 1000) % 1000000,
          emailCliente: cliente.email || undefined,
          nomeCliente: cliente.nome
        });

        if (!resPix.sucesso || (!resPix.qrCode && !resPix.qrCodeBase64)) {
          setErro(resPix.mensagem || 'Não foi possível gerar o QR Code dinâmico no Mercado Pago.');
          return;
        }

        setPixDinamico(resPix);
        return;
      }

      // FLUXO 3: Catálogo Online + Métodos Manuais / Sem Gateway -> SEMPRE Pendente de Conferência
      if (metodoAtual.tipo === 'pix' && !arquivoComprovante && !comprovanteDataUrl) {
        setErro('Por favor, anexe a imagem ou PDF do comprovante da transferência Pix para conferência do lojista.');
        return;
      }

      const urlComprovante = metodoAtual.tipo === 'pix' ? await fazerUploadComprovante() : null;

      const resSolicitacao = await CadernetaService.solicitarLiquidacaoCadernetaCatalogo({
        lojaId: loja.id,
        clienteId: cliente.id,
        valorSolicitado: valorPagamento,
        formaPagamentoId: fpId,
        formaTipo: metodoAtual.tipo,
        metodoNome: metodoAtual.nome,
        comprovanteUrl: urlComprovante
      });

      if (!resSolicitacao.sucesso) {
        setErro(resSolicitacao.mensagem || 'Não foi possível registrar sua solicitação de pagamento.');
        return;
      }

      await onSucesso(
        `Solicitação de ${formatarMoeda(valorPagamento)} via ${metodoAtual.nome} enviada para conferência! O saldo e o limite serão liberados assim que o lojista confirmar o recebimento.`,
        false
      );
      onClose();
    } catch (err: any) {
      setErro(err?.message || 'Erro inesperado ao processar pagamento.');
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-70 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div
        className={`w-full max-w-lg rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto custom-scrollbar ${
          isDark
            ? 'bg-[#08131A] border-2 border-slate-400 text-white'
            : 'bg-white border-2 border-slate-300 text-slate-900'
        }`}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base leading-tight">
                {origem === 'lojista' ? 'Registrar Pagamento na Caderneta' : 'Pagar / Liquidar Caderneta'}
              </h3>
              <p className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Cliente: <strong className={isDark ? 'text-white' : 'text-slate-900'}>{cliente.nome}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-xl border transition cursor-pointer ${
              isDark
                ? 'bg-[#000000] border-slate-700 text-white hover:bg-slate-900'
                : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {erro && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs font-bold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{erro}</span>
          </div>
        )}

        {/* Se gerou QR Code dinâmico de Gateway com Webhook */}
        {pixDinamico ? (
          <div className="space-y-4 text-center py-2">
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>QR Code Pix Dinâmico gerado! A baixa ocorrerá automaticamente após o pagamento.</span>
            </div>

            {pixDinamico.qrCodeBase64 && (
              <div className="bg-white p-3 rounded-2xl border-2 border-slate-200 inline-block mx-auto shadow-xs">
                <img
                  src={`data:image/png;base64,${pixDinamico.qrCodeBase64}`}
                  alt="QR Code Pix Mercado Pago"
                  className="w-48 h-48 object-contain mx-auto"
                />
              </div>
            )}

            {pixDinamico.qrCode && (
              <div className="space-y-2 text-left">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  Pix Copia e Cola
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={pixDinamico.qrCode}
                    className={`flex-1 rounded-xl px-3 py-2 text-xs font-mono border ${
                      isDark ? 'bg-black border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => handleCopiarTexto(pixDinamico.qrCode!)}
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {pixCopiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{pixCopiado ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPixDinamico(null)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  isDark ? 'bg-black border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-700'
                }`}
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={verificandoWebhook || processando}
                onClick={handleVerificarStatusGatewayManual}
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {verificandoWebhook || processando ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Já paguei / Verificar Confirmação</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Campo de Valor */}
            <div className="space-y-1.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs font-bold">
                <label>Valor a Pagar (R$)</label>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                  <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                    Saldo Devedor Atual: <strong className={isDark ? 'text-slate-200' : 'text-slate-900'}>{formatarMoeda(saldoDevedor)}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setValorPagamento(Number(saldoDevedor.toFixed(2)))}
                    className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    (Quitar Tudo)
                  </button>
                </div>
              </div>

              <div
                className={`flex items-center gap-1.5 rounded-xl px-3.5 h-11 focus-within:border-emerald-500 ${
                  isDark ? 'bg-[#000000] border border-slate-700' : 'bg-white border-2 border-slate-300'
                }`}
              >
                <span className="text-xs font-bold text-emerald-500">R$</span>
                <MoneyInput
                  autoFocus
                  value={valorPagamento}
                  onChange={(v) => setValorPagamento(v)}
                  mostrarPrefixo={false}
                  className={`w-full bg-transparent text-sm font-black focus:outline-none ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                />
              </div>
            </div>

            {/* Seleção de Método Ativo na Loja */}
            <div className="space-y-2">
              <label className="text-xs font-bold block">
                Forma de Pagamento (Opções Ativas da Loja)
              </label>

              {metodosAtivos.length === 0 ? (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-xs font-bold">
                  Nenhuma forma de pagamento ativa configurada para liquidação.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {metodosAtivos.map((m) => {
                    const selecionado = metodoSelecionado === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMetodoSelecionado(m.id)}
                        className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
                          selecionado
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500'
                            : isDark
                              ? 'border-slate-700 bg-[#000000] text-slate-200 hover:border-slate-600'
                              : 'border-slate-300 bg-slate-50 text-slate-800 hover:border-slate-400'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {m.tipo === 'pix' || m.tipo === 'mercado_pago' ? (
                            <QrCode className="w-4 h-4 text-emerald-500" />
                          ) : m.tipo === 'dinheiro' ? (
                            <Banknote className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <CreditCard className="w-4 h-4 text-emerald-500" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-black block truncate">{m.nome}</span>
                          <span className={`text-[10px] block truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {m.descricao}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Instruções e Upload de Comprovante quando no Catálogo Online */}
            {origem === 'catalogo' && metodoAtual && !metodoAtual.possuiWebhook && (
              <div className="space-y-3">
                {metodoAtual.tipo === 'pix' && chavePixLoja && (
                  <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                          Chave Pix da Loja
                        </span>
                        <span className="text-xs font-mono font-bold break-all">
                          {chavePixLoja}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopiarTexto(chavePixLoja)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        {pixCopiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{pixCopiado ? 'Copiada!' : 'Copiar Chave'}</span>
                      </button>
                    </div>
                    {orientacoesPixLoja && (
                      <p className={`text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        {orientacoesPixLoja}
                      </p>
                    )}
                  </div>
                )}

                {/* Upload Obrigatório de Comprovante para Pix Manual no Catálogo */}
                {metodoAtual.tipo === 'pix' && (
                  <div className={`p-3.5 rounded-xl border space-y-2 ${
                    isDark ? 'bg-[#000000] border-slate-700' : 'bg-slate-50 border-slate-300'
                  }`}>
                    <label className="text-xs font-black flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Anexar Comprovante Pix (Imagem ou PDF) *</span>
                    </label>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleSelecionarComprovante}
                      className="block w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 file:cursor-pointer"
                    />
                    {arquivoComprovante && (
                      <div className="flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-bold pt-1">
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Comprovante anexado: {arquivoComprovante.name}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Aviso de Segurança: Pendente de Conferência */}
                <div
                  className={`p-3 rounded-xl border text-[11px] font-medium flex items-start gap-2 ${
                    isDark
                      ? 'bg-slate-800 border-slate-700 text-slate-300'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <Clock className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                  <span>
                    Por segurança, pagamentos manuais ficam com status <strong>"Pendente de Conferência"</strong>. A baixa da dívida e a liberação do seu limite serão efetivadas assim que o lojista confirmar o recebimento.
                  </span>
                </div>
              </div>
            )}

            {/* Botões de Ação */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  isDark
                    ? 'bg-[#000000] border-slate-700 text-white hover:bg-slate-900'
                    : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                }`}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={processando || enviandoComprovante || valorPagamento <= 0 || metodosAtivos.length === 0}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-sm shadow-emerald-600/20"
              >
                {processando || enviandoComprovante ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>
                  {origem === 'lojista'
                    ? 'Confirmar Recebimento'
                    : metodoAtual?.possuiWebhook
                      ? 'Gerar QR Code de Pagamento'
                      : 'Enviar para Conferência'}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
