import React, { useRef, useState } from 'react';
import { X, Printer, Package, Truck, MapPin, Building2, User, Tag, Loader2, FileText, Download } from 'lucide-react';
import { Pedido, Loja } from '../../types';
import { PedidoEntrega } from '../../types/shipping';
import { useFeedbackModal } from '../../contexts/FeedbackContext';
import { ehUrlEtiquetaValida } from '../PedidosLista';
import { MelhorEnvioService } from '../../services/melhorEnvioService';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';

interface ModalImprimirEtiquetaProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  loja: Loja | null;
  entrega?: PedidoEntrega | null;
}

export const ModalImprimirEtiqueta: React.FC<ModalImprimirEtiquetaProps> = ({
  isOpen,
  onClose,
  pedido,
  loja,
  entrega
}) => {
  const { tema } = useTheme();
  const isDark = tema === 'dark';
  const { mostrarToast, mostrarSucesso, mostrarErro } = useFeedbackModal();
  const etiquetaRef = useRef<HTMLDivElement>(null);
  const [obtendoEtiquetaOficial, setObtendoEtiquetaOficial] = useState(false);
  const [obtendoDace, setObtendoDace] = useState(false);
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  const [entregaCarregada, setEntregaCarregada] = useState<PedidoEntrega | null>(null);
  const [urlEtiquetaOficial, setUrlEtiquetaOficial] = useState<string | null>(null);
  const [urlDaceOficial, setUrlDaceOficial] = useState<string | null>(null);

  React.useEffect(() => {
    if (pedido?.id) {
      supabase
        .from('pedido_entregas')
        .select('*')
        .eq('pedido_id', pedido.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setEntregaCarregada(data as PedidoEntrega);
            if (data.link_etiqueta && (data.link_etiqueta.includes('/storage/') || data.link_etiqueta.includes('etiquetas'))) {
              setUrlEtiquetaOficial(data.link_etiqueta);
            }
          }
        });
    }
  }, [pedido?.id]);

  if (!isOpen || !pedido) return null;

  const rawPe = entregaCarregada || entrega || (pedido as any).pedido_entregas || pedido.pedido_entrega;
  const pe: PedidoEntrega | null = Array.isArray(rawPe) ? (rawPe[0] || null) : (rawPe || null);
  const linkEtiquetaOficial = (
    entregaCarregada?.link_etiqueta ||
    pe?.link_etiqueta ||
    (pedido as any).link_etiqueta ||
    (pedido as any).metadados?.link_etiqueta ||
    ''
  ).trim();

  const ehLinkPdfDireto = (url?: string | null): boolean => {
    if (!url || typeof url !== 'string') return false;
    const u = url.trim().toLowerCase();
    if (!u.startsWith('http://') && !u.startsWith('https://') && !u.startsWith('blob:')) return false;
    if (u.includes('/painel') || u.includes('/login') || u.includes('/entrar') || u.includes('/auth')) return false;
    return u.includes('.pdf') || u.includes('s3.amazonaws.com') || u.startsWith('blob:');
  };

  const ehUrlPublicaValida = (url?: string | null): boolean => {
    if (!url || typeof url !== 'string') return false;
    const u = url.trim();
    if (!u.startsWith('http://') && !u.startsWith('https://') && !u.startsWith('blob:')) return false;
    if (u.includes('/painel') || u.includes('/login') || u.includes('/entrar') || u.includes('/auth')) return false;
    return u.includes('.pdf') || u.includes('s3.amazonaws.com') || u.includes('/portal/imprimir/') || u.includes('/imprimir/');
  };

  const isMobileDispositivo = typeof navigator !== 'undefined' && (
    /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent) ||
    Boolean(navigator.maxTouchPoints && navigator.maxTouchPoints > 1 && window.innerWidth < 1024)
  );

  const abrirDocumentoPdf = (url: string) => {
    console.log('[DEBUG_ETIQUETA_MOBILE] Abrindo documento PDF:', url);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const transportadora =
    pe?.transportadora_nome ||
    (pe?.provedor === 'uber' ? 'Uber Direct' : null) ||
    pedido.nome_transportadora ||
    pe?.servico_correios ||
    pe?.nome_transportadora ||
    ((pedido as any).nome_app?.toLowerCase().includes('uber') ? 'Uber Direct' : null) ||
    'Entrega Padrão';

  const codigoRastreio =
    pe?.codigo_rastreio ||
    pedido.codigo_rastreio ||
    `PED-${pedido.numero_pedido || pedido.id.slice(0, 6)}`;

  const pinEntrega = pe?.pin_entrega || pedido.pin_entrega || null;

  const clienteNome = pedido.cliente?.nome || pedido.cliente_nome_avulso || 'Cliente';
  const clienteTelefone = pedido.cliente?.whatsapp || pedido.cliente?.telefone || pedido.cliente_telefone_avulso || '';
  const enderecoEntrega =
    pedido.endereco_entrega ||
    (pe?.destino_logradouro
      ? `${pe.destino_logradouro}, ${pe.destino_numero || 'S/N'}${pe.destino_complemento ? ` - ${pe.destino_complemento}` : ''} - ${pe.destino_bairro || ''}, ${pe.destino_cidade || ''}/${pe.destino_uf || ''} - CEP: ${pe.destino_cep || ''}`
      : 'Endereço não informado');

  const lojaNome = loja?.nome_fantasia || loja?.razao_social || 'Remetente';
  const lojaDocumento = loja?.numero_documento || '';
  const lojaTelefone = loja?.whatsapp || loja?.telefone || '';
  const lojaEndereco = loja
    ? `${loja.endereco_logradouro || ''}, ${loja.endereco_numero || 'S/N'} ${loja.endereco_bairro ? `- ${loja.endereco_bairro}` : ''} - ${loja.endereco_cidade || ''}/${loja.endereco_estado || ''} - CEP: ${loja.endereco_cep || ''}`
    : 'Endereço da loja';

  const ehAppOuManual =
    pe?.tipo_operacao === 'app_entrega' ||
    pe?.tipo_operacao === 'frota_propria' ||
    pe?.tipo_operacao === 'motoboy' ||
    (pedido as any).tipo_operacao === 'app_entrega' ||
    Boolean((pedido as any).nome_app) ||
    pe?.provedor === 'uber' ||
    pe?.provedor === 'frete_proprio';

  const ehMelhorEnvio = !ehAppOuManual && (
    pe?.provedor === 'melhor_envio' ||
    (pedido as any).metadados?.provedor_frete === 'melhor_envio' ||
    Boolean((pedido as any).metadados?.melhor_envio_order_id)
  );

  const ehUrlStorageSupabase = (url?: string | null): boolean => {
    if (!url || typeof url !== 'string') return false;
    return url.includes('/storage/v1/object/public/etiquetas/');
  };

  const obterDocumentosOficiais = async (): Promise<{ url_etiqueta: string; url_dace: string }> => {
    if (urlEtiquetaOficial && urlDaceOficial) {
      return { url_etiqueta: urlEtiquetaOficial, url_dace: urlDaceOficial };
    }

    const lojaId = loja?.id || pedido.loja_id;
    const rawPe = entregaCarregada || entrega || (pedido as any).pedido_entregas || pedido.pedido_entrega;
    const peCurrent: PedidoEntrega | null = Array.isArray(rawPe) ? (rawPe[0] || null) : (rawPe || null);

    const ordemId =
      (pedido.metadados as any)?.melhor_envio_order_id ||
      (entregaCarregada as any)?.melhor_envio_order_id ||
      (peCurrent as any)?.melhor_envio_order_id ||
      entregaCarregada?.cotacao_id ||
      peCurrent?.cotacao_id ||
      (entregaCarregada?.codigo_rastreio?.startsWith('ORD-') ? entregaCarregada.codigo_rastreio : undefined) ||
      (peCurrent?.codigo_rastreio?.startsWith('ORD-') ? peCurrent.codigo_rastreio : undefined) ||
      (pedido.codigo_rastreio?.startsWith('ORD-') ? pedido.codigo_rastreio : undefined);

    const docs = await MelhorEnvioService.obterDocumentosOficiais(pedido.id, lojaId, ordemId);
    if (!docs.url_etiqueta) {
      throw new Error('Falha ao obter URL da etiqueta oficial.');
    }

    setUrlEtiquetaOficial(docs.url_etiqueta);
    if (docs.url_dace) setUrlDaceOficial(docs.url_dace);
    setEntregaCarregada((prev) => (prev ? { ...prev, link_etiqueta: docs.url_etiqueta } : ({ link_etiqueta: docs.url_etiqueta } as any)));
    return docs;
  };

  const abrirOuImprimir = (url: string) => {
    console.log('[DEBUG_ETIQUETA_MOBILE] Abrindo/imprimindo documento:', url);
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    // Se estiver em desktop, também tenta acionar o diálogo de impressão silencioso via iframe
    if (!isMobileDispositivo) {
      try {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.src = url;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch {
            // Ignora se bloqueado pelo browser
          }
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 60000);
        };
      } catch {
        // Fallback silencioso
      }
    }
  };

  const handleAbrirEtiquetaMelhorEnvio = async () => {
    try {
      setObtendoEtiquetaOficial(true);
      mostrarToast('Abrindo Etiqueta Oficial do Melhor Envio...', 'info');
      const docs = await obterDocumentosOficiais();
      if (docs.url_etiqueta) {
        abrirOuImprimir(docs.url_etiqueta);
      } else {
        mostrarErro('Etiqueta oficial não encontrada.');
      }
    } catch (err: any) {
      console.error('[DEBUG_ETIQUETA] Erro ao abrir etiqueta:', err);
      mostrarErro(err?.message || 'Falha ao abrir a Etiqueta Oficial.');
    } finally {
      setObtendoEtiquetaOficial(false);
    }
  };

  const handleAbrirDace = async () => {
    try {
      setObtendoDace(true);
      mostrarToast('Abrindo Declaração de Conteúdo (DACE)...', 'info');
      const docs = await obterDocumentosOficiais();
      const urlDaceFinal = docs.url_dace || docs.url_etiqueta;
      if (urlDaceFinal) {
        abrirOuImprimir(urlDaceFinal);
      } else {
        mostrarToast('Declaração de Conteúdo não disponível para esta ordem.', 'aviso');
      }
    } catch (err: any) {
      console.error('[DEBUG_ETIQUETA] Erro ao abrir DACE:', err);
      mostrarErro(err?.message || 'Falha ao abrir a Declaração de Conteúdo.');
    } finally {
      setObtendoDace(false);
    }
  };

  const handleBaixarPdf = async () => {
    try {
      setBaixandoPdf(true);
      mostrarToast('Baixando PDF da etiqueta...', 'info');
      const docs = await obterDocumentosOficiais();
      const url = docs.url_etiqueta;
      const nomeArquivo = `Etiqueta_Pedido_${pedido.numero_pedido || pedido.id.slice(0, 6)}.pdf`;

      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Falha na resposta do arquivo');
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
        mostrarSucesso('Download concluído com sucesso!');
      } catch {
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err: any) {
      mostrarErro(err?.message || 'Falha ao baixar o PDF.');
    } finally {
      setBaixandoPdf(false);
    }
  };

  const handleImprimir = () => {
    const conteudo = etiquetaRef.current;
    if (!conteudo) return;

    const janelaImpressao = window.open('', '_blank', 'width=800,height=600');
    if (!janelaImpressao) {
      window.print();
      return;
    }

    janelaImpressao.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Etiqueta de Envio - Pedido #${pedido.numero_pedido}</title>
          <style>
            @page {
              size: 100mm 150mm;
              margin: 4mm;
            }
            body {
              font-family: Arial, Helvetica, sans-serif;
              color: #000;
              margin: 0;
              padding: 6px;
              background: #fff;
              font-size: 11px;
              line-height: 1.3;
            }
            .etiqueta-box {
              border: 2px solid #000;
              padding: 10px;
              max-width: 100mm;
              margin: 0 auto;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #000;
              padding-bottom: 8px;
              margin-bottom: 8px;
            }
            .header h1 {
              font-size: 16px;
              margin: 0;
              text-transform: uppercase;
            }
            .section {
              border: 1px solid #333;
              border-radius: 4px;
              padding: 8px;
              margin-bottom: 8px;
            }
            .section-title {
              font-size: 10px;
              font-weight: bold;
              text-transform: uppercase;
              color: #333;
              margin-bottom: 4px;
              border-bottom: 1px solid #ccc;
              padding-bottom: 2px;
            }
            .destaque {
              font-weight: bold;
              font-size: 12px;
            }
            .barcode-box {
              text-align: center;
              margin: 10px 0;
              padding: 6px;
              border: 1px dashed #000;
            }
            .barcode-lines {
              font-family: 'Libre Barcode 39', 'Courier New', monospace;
              font-size: 32px;
              letter-spacing: 4px;
            }
            .barcode-text {
              font-family: monospace;
              font-size: 11px;
              font-weight: bold;
              margin-top: 2px;
            }
            .footer {
              font-size: 9px;
              text-align: center;
              color: #555;
              border-top: 1px solid #ccc;
              padding-top: 4px;
              margin-top: 6px;
            }
          </style>
        </head>
        <body>
          <div class="etiqueta-box">
            <div class="header">
              <div>
                <h1>${transportadora}</h1>
                <span>Envio Padrão HUBI</span>
              </div>
              <div style="text-align: right;">
                <strong>Pedido #${pedido.numero_pedido}</strong>
              </div>
            </div>

            <div class="barcode-box">
              <div class="barcode-lines">||| | |||| | || |||| | |||</div>
              <div class="barcode-text">${codigoRastreio}</div>
              ${pinEntrega ? `<div style="font-size: 11px; font-weight: bold; margin-top: 3px; color: #000;">CÓDIGO PIN: ${pinEntrega}</div>` : ''}
            </div>

            <div class="section">
              <div class="section-title">DESTINATÁRIO</div>
              <div class="destaque">${clienteNome}</div>
              ${clienteTelefone ? `<div>Tel: ${clienteTelefone}</div>` : ''}
              <div style="margin-top: 4px;">${enderecoEntrega}</div>
            </div>

            <div class="section">
              <div class="section-title">REMETENTE</div>
              <div class="destaque">${lojaNome}</div>
              ${lojaDocumento ? `<div>CNPJ/CPF: ${lojaDocumento}</div>` : ''}
              ${lojaTelefone ? `<div>Tel: ${lojaTelefone}</div>` : ''}
              <div style="margin-top: 4px;">${lojaEndereco}</div>
            </div>

            <div class="footer">
              HUBI Plataforma de Gestão • Impresso em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    janelaImpressao.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className={`w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] ${
        isDark ? 'bg-[#08131A] border-2 border-slate-400 text-slate-100' : 'bg-slate-100 border-2 border-slate-300 text-black'
      }`}>
        {/* Header do Modal */}
        <div className={`p-4 border-b flex items-center justify-between shrink-0 ${
          isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-300 bg-slate-100'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
              isDark ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-emerald-50 text-emerald-600 border-emerald-200'
            }`}>
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`font-black text-sm ${isDark ? 'text-white' : 'text-black'}`}>
                Etiqueta de Envio • Pedido #{pedido.numero_pedido}
              </h3>
              <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Formato padrão para despacho e logística
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              isDark ? 'bg-[#000000] border-slate-700 text-slate-400 hover:text-white hover:bg-slate-900' : 'bg-white border-slate-300 text-slate-500 hover:text-black hover:bg-slate-50'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Área Interna da Etiqueta Harmonizada */}
        <div className={`flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 flex justify-center items-start custom-scrollbar ${
          isDark ? 'bg-[#000000]' : 'bg-slate-100'
        }`}>
          <div
            ref={etiquetaRef}
            className="w-full max-w-sm bg-white text-slate-900 rounded-xl p-5 shadow-xl border border-slate-300 font-mono text-xs space-y-3.5 min-h-fit mb-4"
          >
            {/* Topo da Etiqueta */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 border-dashed">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-600" />
                <div>
                  <h4 className="font-bold text-sm text-slate-900 uppercase tracking-wide leading-none">
                    {transportadora}
                  </h4>
                  <span className="text-[10px] text-slate-500 font-semibold">Logística HUBI</span>
                </div>
              </div>
              <div className="text-right">
                <span className="font-mono text-xs font-bold text-slate-900 block">
                  #{pedido.numero_pedido}
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 px-1.5 py-0.5 rounded uppercase">
                  Despacho
                </span>
              </div>
            </div>

            {/* Código de Rastreio / Barras Simulado */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-1">
              <div className="h-9 flex items-center justify-center tracking-[4px] font-mono text-lg font-black text-slate-900 select-none">
                ||| | |||| | || |||| | |||
              </div>
              <div className="font-mono text-xs font-bold text-emerald-700 tracking-wider">
                {codigoRastreio}
              </div>
              {pinEntrega && (
                <div className="font-mono text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded inline-block mt-1">
                  PIN: {pinEntrega}
                </div>
              )}
            </div>

            {/* Bloco Destinatário */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 uppercase tracking-wider pb-1 border-b border-slate-200 border-dashed">
                <User className="w-3.5 h-3.5 text-emerald-600" />
                <span>Destinatário</span>
              </div>
              <p className="font-bold text-xs text-slate-900 pt-0.5">
                {clienteNome}
              </p>
              {clienteTelefone && (
                <p className="text-[11px] text-slate-600">
                  Tel: <strong className="text-slate-900">{clienteTelefone}</strong>
                </p>
              )}
              <div className="flex items-start gap-1 pt-1 text-[11px] text-slate-600 leading-snug">
                <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span className="font-semibold text-slate-900">{enderecoEntrega}</span>
              </div>
            </div>

            {/* Bloco Remetente */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 uppercase tracking-wider pb-1 border-b border-slate-200 border-dashed">
                <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Remetente</span>
              </div>
              <p className="font-bold text-xs text-slate-900 pt-0.5">
                {lojaNome}
              </p>
              {lojaDocumento && (
                <p className="text-[10px] text-slate-900 font-bold">
                  CNPJ/CPF: {lojaDocumento}
                </p>
              )}
              <p className="text-[10px] text-slate-900 font-semibold leading-tight">
                {lojaEndereco}
              </p>
            </div>
          </div>
        </div>

        {/* Footer do Modal Harmonizado com Botões Centralizados */}
        <div className={`p-4 border-t flex flex-wrap items-center justify-center gap-2.5 shrink-0 ${
          isDark ? 'border-slate-800 bg-[#08131A]' : 'border-slate-300 bg-slate-100'
        }`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer active:scale-95 ${
              isDark ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-slate-200' : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black'
            }`}
          >
            Fechar
          </button>

          {!ehAppOuManual && ehMelhorEnvio && (
            <>
              <button
                type="button"
                disabled={obtendoEtiquetaOficial || obtendoDace}
                onClick={handleAbrirEtiquetaMelhorEnvio}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer active:scale-95 disabled:opacity-50 ${
                  isDark ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500' : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-sm'
                }`}
                title="Abrir e imprimir Etiqueta Oficial do Melhor Envio"
              >
                {obtendoEtiquetaOficial ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Tag className="w-3.5 h-3.5" />
                )}
                <span>Etiqueta Melhor Envio</span>
              </button>

              <button
                type="button"
                disabled={obtendoDace || obtendoEtiquetaOficial}
                onClick={handleAbrirDace}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer active:scale-95 disabled:opacity-50 ${
                  isDark ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500' : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-sm'
                }`}
                title="Abrir e imprimir Declaração de Conteúdo (DACE)"
              >
                {obtendoDace ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5" />
                )}
                <span>Declaração (DACE)</span>
              </button>

              <button
                type="button"
                disabled={baixandoPdf || obtendoEtiquetaOficial}
                onClick={handleBaixarPdf}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer active:scale-95 disabled:opacity-50 ${
                  isDark ? 'bg-[#000000] hover:bg-slate-900 border border-slate-700 text-slate-200' : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black'
                }`}
                title="Baixar arquivo PDF da Etiqueta no dispositivo"
              >
                {baixandoPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>Baixar PDF</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleImprimir}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer active:scale-95 ${
              isDark ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500' : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 shadow-sm'
            }`}
            title="Imprimir formato simplificado HUBI (térmica/A4)"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Etiqueta HUBI</span>
          </button>
        </div>
      </div>
    </div>
  );
};
