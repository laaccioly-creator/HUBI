import React, { useState } from 'react';
import {
  X,
  Truck,
  Package,
  MapPin,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  MessageCircle,
  Clock,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Tag
} from 'lucide-react';
import { Pedido, Loja } from '../../types';
import { PedidoEntrega } from '../../types/shipping';
import { supabase } from '../../services/supabase';
import { detectarServicoPorCodigo } from '../../utils/correiosValidator';

interface ModalRastreioPedidoProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  entrega: PedidoEntrega | null;
  loja: Loja | null;
  onAtualizarStatus?: () => void;
}

export const ModalRastreioPedido: React.FC<ModalRastreioPedidoProps> = ({
  isOpen,
  onClose,
  pedido,
  entrega,
  loja,
  onAtualizarStatus
}) => {
  const [copiado, setCopiado] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [mensagemFeedback, setMensagemFeedback] = useState<string | null>(null);

  // Estados reativos locais atualizados na hora ao sincronizar
  const [codigoRastreioLocal, setCodigoRastreioLocal] = useState<string>('');
  const [linkRastreioLocal, setLinkRastreioLocal] = useState<string>('');
  const [statusEnvioLocal, setStatusEnvioLocal] = useState<string>('');
  const [dataPostagemLocal, setDataPostagemLocal] = useState<string | null>(null);

  const peResolvido: PedidoEntrega | null =
    entrega || (pedido as any)?.pedido_entregas?.[0] || pedido?.pedido_entrega || null;

  // Ref para garantir execução única de auto-sincronização por abertura de modal
  const sincronizadoRef = React.useRef<string | null>(null);

  const handleSincronizarRastreio = React.useCallback(async (silencioso = false) => {
    if (!pedido) return;
    try {
      if (!silencioso) setAtualizando(true);

      // 1. Invoca Edge Function para sincronizar status atualizado com o Melhor Envio
      const { data, error } = await supabase.functions.invoke('melhor-envio-despacho', {
        body: {
          pedidoId: pedido.id,
          loja_id: loja?.id || pedido.loja_id,
          acao: 'sincronizar_rastreio'
        }
      });

      if (!error && data?.sucesso) {
        if (data.codigo_rastreio) setCodigoRastreioLocal(data.codigo_rastreio);
        if (data.link_rastreio) setLinkRastreioLocal(data.link_rastreio);
        if (data.status_envio) setStatusEnvioLocal(data.status_envio);
        if (data.data_postagem) setDataPostagemLocal(data.data_postagem);

        const statusLabel =
          data.status_envio === 'em_transito'
            ? 'Em Trânsito'
            : data.status_envio === 'saiu_para_entrega'
            ? 'Saiu para Entrega'
            : data.status_envio === 'entregue'
            ? 'Entregue'
            : data.status_envio === 'despachado'
            ? 'Despachado'
            : 'Atualizado';

        if (!silencioso) {
          setMensagemFeedback(`Status sincronizado: ${statusLabel}! Código: ${data.codigo_rastreio || 'OK'}`);
        }
        if (onAtualizarStatus) onAtualizarStatus();
      } else if (!silencioso) {
        setMensagemFeedback('Rastreamento verificado. Nenhuma nova movimentação.');
      }
    } catch {
      if (!silencioso) {
        setMensagemFeedback('Não foi possível sincronizar no momento. Tente novamente mais tarde.');
      }
    } finally {
      if (!silencioso) {
        setAtualizando(false);
        setTimeout(() => setMensagemFeedback(null), 4000);
      }
    }
  }, [pedido?.id, pedido?.loja_id, loja?.id, onAtualizarStatus]);

  // Sincroniza estados reativos locais apenas quando os identificadores das props mudarem
  React.useEffect(() => {
    if (!pedido) return;
    const peCurrent: PedidoEntrega | null =
      entrega || (pedido as any)?.pedido_entregas?.[0] || pedido?.pedido_entrega || null;

    setCodigoRastreioLocal((peCurrent?.codigo_rastreio || pedido?.codigo_rastreio || '').trim());
    setLinkRastreioLocal((peCurrent?.link_rastreio || pedido?.link_rastreio || '').trim());
    setStatusEnvioLocal(peCurrent?.status_envio || (peCurrent?.despachado_em || pedido?.despachado_em ? 'despachado' : 'pendente'));
    setDataPostagemLocal(peCurrent?.despachado_em || pedido?.despachado_em || null);
  }, [pedido?.id, entrega?.id, isOpen]);

  // Sincroniza automaticamente ao abrir o modal
  React.useEffect(() => {
    if (!isOpen || !pedido) {
      sincronizadoRef.current = null;
      return;
    }

    // Se já sincronizou nesta sessão de abertura para este pedido, não repete
    if (sincronizadoRef.current === pedido.id) return;

    const peCurrent: PedidoEntrega | null =
      entrega || (pedido as any)?.pedido_entregas?.[0] || pedido?.pedido_entrega || null;
    const prov = peCurrent?.provedor || (pedido?.metadados as any)?.provedor_frete;
    const cod = (peCurrent?.codigo_rastreio || pedido?.codigo_rastreio || '').trim();
    const st = peCurrent?.status_envio;

    const podeSincronizar =
      (prov === 'melhor_envio' ||
       prov === 'jadlog' ||
       prov === 'correios' ||
       Boolean((pedido.metadados as any)?.melhor_envio_order_id) ||
       Boolean(peCurrent?.link_etiqueta || (pedido as any)?.link_etiqueta) ||
       Boolean(cod)) &&
      st !== 'entregue' &&
      st !== 'cancelado';

    if (podeSincronizar) {
      sincronizadoRef.current = pedido.id;
      handleSincronizarRastreio(false);
    }
  }, [isOpen, pedido?.id, handleSincronizarRastreio]);

  // Early return SÓ APÓS TODOS OS HOOKS TEREM SIDO DECLARADOS!
  if (!isOpen || !pedido) return null;

  const pe: PedidoEntrega | null = peResolvido;

  const codigoRastreio = (codigoRastreioLocal || pe?.codigo_rastreio || pedido.codigo_rastreio || '').trim();
  const linkRastreio = (linkRastreioLocal || pe?.link_rastreio || pedido.link_rastreio || '').trim();
  const linkEtiqueta = (pe?.link_etiqueta || (pedido as any).link_etiqueta || '').trim();

  const servicoDetectado = detectarServicoPorCodigo(codigoRastreio);
  const servicoCorreios =
    (pedido as any)?.servico_correios ||
    pe?.servico_correios ||
    (servicoDetectado && servicoDetectado !== 'OUTRO' ? servicoDetectado : null);

  const transpRaw = (pe?.transportadora_nome || pe?.nome_transportadora || (pedido as any)?.nome_transportadora || '').trim();

  const ehCorreios =
    pe?.tipo_operacao === 'correios' ||
    (pedido as any)?.tipo_operacao === 'correios' ||
    (pe?.provedor as any) === 'correios' ||
    transpRaw.toLowerCase().includes('correios') ||
    Boolean(servicoCorreios) ||
    (servicoDetectado !== null && servicoDetectado !== 'OUTRO');

  const transportadora = ehCorreios
    ? (servicoCorreios ? `Correios (${servicoCorreios})` : 'Correios')
    : (transpRaw || (pe?.provedor === 'uber' ? 'Uber Direct' : 'Melhor Envio / Jadlog'));

  const statusEnvio = statusEnvioLocal || pe?.status_envio || (pe?.despachado_em || pedido.despachado_em ? 'despachado' : 'pendente');
  const despachadoEm = dataPostagemLocal || pe?.despachado_em || pedido.despachado_em || pedido.criado_em;

  const handleCopiarCodigo = () => {
    if (!codigoRastreio) return;
    navigator.clipboard.writeText(codigoRastreio);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const handleCompartilharWhatsApp = () => {
    const tel = (pedido.cliente?.whatsapp || pedido.cliente?.telefone || pedido.cliente_telefone_avulso || '').replace(/\D/g, '');
    const nomeCli = pedido.cliente?.nome || pedido.cliente_nome_avulso || 'Cliente';
    const numPed = pedido.numero_pedido || pedido.id.slice(0, 5);
    const linkAcompanhamento = ehCorreios && codigoRastreio
      ? `https://rastreamento.correios.com.br/app/index.php?objeto=${codigoRastreio}`
      : codigoRastreio
      ? `https://melhorrastreio.com.br/rastreio/${codigoRastreio}`
      : linkRastreio && !linkRastreio.includes('imprimir')
      ? linkRastreio
      : '';

    let texto = `Olá, *${nomeCli}*! 👋\n\n`;
    texto += `Seu pedido *#${numPed}* foi despachado via *${transportadora}*!\n\n`;
    if (codigoRastreio) {
      texto += `📦 *Código de Rastreio:* ${codigoRastreio}\n`;
    }
    if (linkAcompanhamento) {
      texto += `🔗 *Acompanhe a entrega:* ${linkAcompanhamento}\n\n`;
    }
    texto += `Agradecemos pela preferência! Qualquer dúvida, estamos à disposição. 😊`;

    const url = tel
      ? `https://api.whatsapp.com/send?phone=55${tel}&text=${encodeURIComponent(texto)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;

    window.open(url, '_blank');
  };

  // Definição das etapas da linha do tempo
  const etapas = [
    {
      id: 'criado',
      titulo: 'Pedido Realizado & Confirmado',
      descricao: 'Venda aprovada e integrada na loja',
      data: pedido.data_venda || pedido.criado_em,
      concluido: true,
      ativo: false
    },
    {
      id: 'etiqueta',
      titulo: 'Etiqueta Emitida & Despachado',
      descricao: `Envio gerado via ${transportadora}`,
      data: despachadoEm,
      concluido: Boolean(despachadoEm || statusEnvio !== 'pendente'),
      ativo: statusEnvio === 'pendente' && !despachadoEm
    },
    {
      id: 'postado',
      titulo: 'Objeto Postado na Agência',
      descricao: ehCorreios
        ? 'Pacote recebido e conferido pela agência dos Correios'
        : 'Pacote conferido e recebido pela transportadora',
      data: dataPostagemLocal || (statusEnvio === 'em_transito' || statusEnvio === 'saiu_para_entrega' || statusEnvio === 'entregue' ? despachadoEm : null),
      concluido: statusEnvio === 'em_transito' || statusEnvio === 'saiu_para_entrega' || statusEnvio === 'entregue',
      ativo: statusEnvio === 'despachado'
    },
    {
      id: 'transito',
      titulo: 'Em Trânsito',
      descricao: ehCorreios
        ? 'Transferência entre centros operacionais e de distribuição dos Correios'
        : 'Transferência entre centros operacionais e de distribuição',
      data: null,
      concluido: statusEnvio === 'saiu_para_entrega' || statusEnvio === 'entregue',
      ativo: statusEnvio === 'em_transito'
    },
    {
      id: 'saiu_entrega',
      titulo: 'Saiu para Entrega',
      descricao: ehCorreios
        ? 'Carteiro dos Correios a caminho do endereço de entrega'
        : 'Motorista ou carteiro a caminho do endereço de entrega',
      data: null,
      concluido: statusEnvio === 'entregue',
      ativo: statusEnvio === 'saiu_para_entrega'
    },
    {
      id: 'entregue',
      titulo: 'Objeto Entregue',
      descricao: 'Entrega finalizada com sucesso ao destinatário',
      data: statusEnvio === 'entregue'
        ? ((pe as any)?.entregue_em || (pedido.metadados as any)?.melhor_envio_delivered_at || pe?.atualizado_em || null)
        : null,
      concluido: statusEnvio === 'entregue',
      ativo: statusEnvio === 'entregue'
    }
  ];

  const linkCorreiosOficial = codigoRastreio
    ? `https://rastreamento.correios.com.br/app/index.php?objeto=${codigoRastreio}`
    : null;

  const urlRastreioOficial = ehCorreios
    ? linkCorreiosOficial
    : (codigoRastreio
        ? `https://melhorrastreio.com.br/rastreio/${codigoRastreio}`
        : (linkRastreio && !linkRastreio.includes('imprimir') ? linkRastreio : null));

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base text-slate-100">
                  Rastreamento do Pedido #{pedido.numero_pedido || pedido.id.slice(0, 5)}
                </h3>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 uppercase">
                  {transportadora}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Acompanhe as etapas de envio e movimentação da carga
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Card do Código de Rastreio */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Código de Rastreamento:
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-black text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-xl border border-emerald-500/20">
                {codigoRastreio || 'Pendente de sincronização'}
              </span>
              {codigoRastreio && (
                <button
                  type="button"
                  onClick={handleCopiarCodigo}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                  title="Copiar código de rastreio"
                >
                  {copiado ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSincronizarRastreio(false)}
              disabled={atualizando}
              className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Consultar atualizações na transportadora"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${atualizando ? 'animate-spin text-emerald-400' : 'text-slate-400'}`} />
              <span>{atualizando ? 'Atualizando...' : 'Atualizar'}</span>
            </button>

            <button
              type="button"
              onClick={handleCompartilharWhatsApp}
              className="py-2 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              title="Enviar rastreio no WhatsApp do cliente"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>
          </div>
        </div>

        {mensagemFeedback && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{mensagemFeedback}</span>
          </div>
        )}

        {/* Linha do Tempo (Stepper) */}
        <div className="space-y-4 pt-1">
          <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span>Linha do Tempo da Entrega</span>
          </h4>

          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
            {etapas.map((etapa) => {
              const concluido = etapa.concluido;
              const ativo = etapa.ativo;

              return (
                <div key={etapa.id} className="relative flex items-start gap-3.5 group">
                  {/* Ponto / Marcador */}
                  <div
                    className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                      concluido
                        ? 'bg-emerald-500 text-slate-950 ring-4 ring-emerald-500/20 shadow-md shadow-emerald-500/30'
                        : ativo
                        ? 'bg-amber-500 text-slate-950 ring-4 ring-amber-500/30 shadow-md shadow-amber-500/20'
                        : 'bg-slate-800 text-slate-600 border border-slate-700'
                    }`}
                  >
                    {concluido ? (
                      <Check className="w-3 h-3 stroke-[3]" />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-current" />
                    )}
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold ${
                          concluido
                            ? 'text-slate-100'
                            : ativo
                            ? 'text-amber-300'
                            : 'text-slate-500'
                        }`}
                      >
                        {etapa.titulo}
                      </span>
                      {etapa.data && (
                        <span className="text-[11px] text-slate-400">
                          {new Date(etapa.data).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {etapa.descricao}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Endereço de Destino */}
        {pedido.endereco_entrega && (
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-3.5 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <MapPin className="w-3 h-3 text-emerald-400" />
              Endereço de Entrega do Destinatário
            </span>
            <p className="text-xs font-semibold text-slate-300">
              {pedido.endereco_entrega}
            </p>
          </div>
        )}

        {/* Botões de Ação Final */}
        <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5 border-t border-slate-800">
          {linkEtiqueta && (
            <a
              href={linkEtiqueta}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Imprimir Etiqueta (PDF)</span>
            </a>
          )}

          {urlRastreioOficial ? (
            <div className="w-full sm:flex-1 flex flex-col sm:flex-row items-center gap-2">
              <a
                href={urlRastreioOficial}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer active:scale-95"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{ehCorreios ? 'Ver no Portal dos Correios' : 'Ver no Melhor Rastreio'}</span>
              </a>

              {ehCorreios && codigoRastreio && (
                <a
                  href={`https://melhorrastreio.com.br/rastreio/${codigoRastreio}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto py-2.5 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer border border-slate-700"
                  title="Acompanhar também pelo Melhor Rastreio"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  <span>Melhor Rastreio</span>
                </a>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
            >
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
