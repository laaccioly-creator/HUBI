import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Truck,
  Package,
  Navigation,
  Bike,
  Check,
  AlertCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { Pedido, Loja } from '../../types';
import { PedidoEntrega, AppEntrega, Transportadora } from '../../types/shipping';
import { ShippingOrchestrator } from '../../services/shippingOrchestrator';
import { validarRastreioCorreios } from '../../utils/correiosValidator';
import { useAuth } from '../../contexts/AuthContext';

export type ModalidadeDespachoManual = 'correios' | 'app_entrega' | 'transportadora' | 'frota_propria';

function encontrarIdTransportadora(
  lista: Transportadora[],
  idAlvo?: string | null,
  nomeAlvo?: string | null
): string {
  if (lista.length === 0) return '';

  if (idAlvo) {
    const achouPorId = lista.find(t => t.id === idAlvo);
    if (achouPorId) return achouPorId.id;
  }

  if (nomeAlvo && nomeAlvo.trim()) {
    const n = nomeAlvo.trim().toLowerCase();

    // 1. Match exato por nome
    const exato = lista.find(t => t.nome.toLowerCase() === n);
    if (exato) return exato.id;

    // 2. Match específico por termos conhecidos (Jadlog, Braspress, etc.)
    if (n.includes('jadlog')) {
      const jad = lista.find(t => t.nome.toLowerCase().includes('jadlog'));
      if (jad) return jad.id;
    }
    if (n.includes('braspress')) {
      const bra = lista.find(t => t.nome.toLowerCase().includes('braspress'));
      if (bra) return bra.id;
    }
    if (n.includes('total express') || n.includes('totalexpress')) {
      const tot = lista.find(t => t.nome.toLowerCase().includes('total express') || t.nome.toLowerCase().includes('totalexpress'));
      if (tot) return tot.id;
    }

    // 3. Substring bidirecional
    const sub = lista.find(t => t.nome.toLowerCase().includes(n) || n.includes(t.nome.toLowerCase()));
    if (sub) return sub.id;
  }

  return lista[0].id;
}

function encontrarIdApp(
  lista: AppEntrega[],
  idAlvo?: string | null,
  nomeAlvo?: string | null
): string {
  if (lista.length === 0) return '';

  if (idAlvo) {
    const achouPorId = lista.find(a => a.id === idAlvo);
    if (achouPorId) return achouPorId.id;
  }

  if (nomeAlvo && nomeAlvo.trim()) {
    const n = nomeAlvo.trim().toLowerCase();

    const exato = lista.find(a => a.nome.toLowerCase() === n);
    if (exato) return exato.id;

    if (n.includes('uber')) {
      const ub = lista.find(a => a.nome.toLowerCase().includes('uber'));
      if (ub) return ub.id;
    }
    if (n.includes('99')) {
      const nov = lista.find(a => a.nome.toLowerCase().includes('99'));
      if (nov) return nov.id;
    }
    if (n.includes('lalamove')) {
      const lal = lista.find(a => a.nome.toLowerCase().includes('lalamove'));
      if (lal) return lal.id;
    }

    const sub = lista.find(a => a.nome.toLowerCase().includes(n) || n.includes(a.nome.toLowerCase()));
    if (sub) return sub.id;
  }

  return lista[0].id;
}

interface ModalDespacharPedidoProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  entrega: PedidoEntrega | null;
  loja: Loja | null;
  onDespachado: () => void;
}

export const ModalDespacharPedido: React.FC<ModalDespacharPedidoProps> = ({
  isOpen,
  onClose,
  pedido,
  entrega,
  loja,
  onDespachado
}) => {
  const { usuario } = useAuth();

  // Modalidade selecionada
  const [modalidade, setModalidade] = useState<ModalidadeDespachoManual>('correios');

  // Listas relacionais dinâmicas do banco
  const [apps, setApps] = useState<AppEntrega[]>([]);
  const [transportadoras, setTransportadoras] = useState<Transportadora[]>([]);
  const [carregandoListas, setCarregandoListas] = useState<boolean>(false);

  // Entrega interna para carregar do banco caso o pai não tenha hidratado
  const [entregaInterna, setEntregaInterna] = useState<PedidoEntrega | null>(entrega);

  // Estados de formulário
  // 1. Correios
  const [servicoCorreios, setServicoCorreios] = useState<'PAC' | 'SEDEX'>('SEDEX');
  const [codigoRastreioCorreios, setCodigoRastreioCorreios] = useState<string>('');

  // 2. App de Corrida
  const [appSelecionadoId, setAppSelecionadoId] = useState<string>('');
  const [codigoCorrida, setCodigoCorrida] = useState<string>('');
  const [linkRastreioApp, setLinkRastreioApp] = useState<string>('');

  // 3. Transportadora
  const [transpSelecionadaId, setTranspSelecionadaId] = useState<string>('');
  const [codigoRastreioTransp, setCodigoRastreioTransp] = useState<string>('');
  const [valorFreteTransp, setValorFreteTransp] = useState<string>('');

  // 4. Frete Próprio
  const [entregadorNome, setEntregadorNome] = useState<string>('');
  const [contatoEntregador, setContatoEntregador] = useState<string>('');

  // Estado de envio
  const [despachando, setDespachando] = useState<boolean>(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  // Busca entrega atualizada no banco se necessário
  useEffect(() => {
    setEntregaInterna(entrega);
    if (isOpen && pedido?.id && (!entrega || !entrega.codigo_rastreio)) {
      ShippingOrchestrator.buscarPedidoEntrega(pedido.id)
        .then(res => {
          if (res) setEntregaInterna(res);
        })
        .catch(() => {});
    }
  }, [isOpen, pedido?.id, entrega]);

  // Carrega apps e transportadoras da loja
  useEffect(() => {
    if (!isOpen || !loja?.id) return;
    let ativo = true;

    async function carregarCadastros() {
      setCarregandoListas(true);
      try {
        const [listaApps, listaTransp] = await Promise.all([
          ShippingOrchestrator.listarAppsEntrega(loja!.id),
          ShippingOrchestrator.listarTransportadoras(loja!.id)
        ]);

        if (ativo) {
          const appsAtivos = listaApps.filter(a => a.ativo);
          const transpsAtivas = listaTransp.filter(t => t.ativo);
          setApps(appsAtivos);
          setTransportadoras(transpsAtivas);

          // Casamento inteligente com os dados atuais do pedido/entrega
          const pe = entregaInterna || entrega || (pedido as any)?.pedido_entregas?.[0] || pedido?.pedido_entrega || null;
          const transpNome = (
            pe?.transportadora_nome ||
            pe?.nome_transportadora ||
            pedido?.nome_transportadora ||
            (pedido as any)?.transportadora_nome ||
            (pedido as any)?.metadados?.transportadora_nome ||
            (pedido as any)?.forma_entrega_nome ||
            pedido?.forma_entrega?.nome ||
            ''
          ).trim();
          const transpId = pe?.transportadora_id || (pedido as any)?.transportadora_id || null;

          const appNome = (
            pe?.nome_app ||
            pedido?.nome_app ||
            (pedido as any)?.nome_app ||
            (pedido as any)?.metadados?.nome_app ||
            ''
          ).trim();
          const appId = pe?.app_entrega_id || (pedido as any)?.app_entrega_id || null;

          if (transpsAtivas.length > 0) {
            setTranspSelecionadaId(encontrarIdTransportadora(transpsAtivas, transpId, transpNome));
          }
          if (appsAtivos.length > 0) {
            setAppSelecionadoId(encontrarIdApp(appsAtivos, appId, appNome));
          }
        }
      } catch (err) {
        console.warn('[ModalDespacharPedido] Erro ao carregar listas relacionais:', err);
      } finally {
        if (ativo) setCarregandoListas(false);
      }
    }

    carregarCadastros();

    return () => {
      ativo = false;
    };
  }, [isOpen, loja?.id, pedido, entrega, entregaInterna]);

  // Inicializa com dados consolidados do pedido/entrega
  useEffect(() => {
    if (!isOpen || !pedido) return;
    setErroMsg(null);

    const pe = entregaInterna || entrega || (pedido as any)?.pedido_entregas?.[0] || pedido?.pedido_entrega || null;
    const opTipo = pe?.tipo_operacao || (pedido as any)?.tipo_operacao || pe?.tipo_entrega;

    const transpNome = (
      pe?.transportadora_nome ||
      pe?.nome_transportadora ||
      pedido?.nome_transportadora ||
      (pedido as any)?.transportadora_nome ||
      (pedido as any)?.metadados?.transportadora_nome ||
      (pedido as any)?.forma_entrega_nome ||
      pedido?.forma_entrega?.nome ||
      ''
    ).trim();

    const appNome = (
      pe?.nome_app ||
      pedido?.nome_app ||
      (pedido as any)?.nome_app ||
      (pedido as any)?.metadados?.nome_app ||
      ''
    ).trim();

    const transpId = pe?.transportadora_id || (pedido as any)?.transportadora_id || null;
    const appId = pe?.app_entrega_id || (pedido as any)?.app_entrega_id || null;

    // Código de rastreio consolidado de todas as fontes possíveis
    const codRastreio = (
      pe?.codigo_rastreio ||
      pedido?.codigo_rastreio ||
      (pedido as any)?.codigo_rastreio ||
      (pedido as any)?.metadados?.codigo_rastreio ||
      ''
    ).trim();

    // Valor do frete consolidado
    const valFreteNum = Number(pe?.valor_frete ?? pedido?.valor_frete ?? 0);
    const valFreteStr = valFreteNum > 0 ? (Number.isInteger(valFreteNum) ? String(valFreteNum) : valFreteNum.toFixed(2)) : '';

    // Entregador
    const entNome = (pe?.entregador_nome || pedido?.entregador_nome || (pedido as any)?.entregador_nome || '').trim();
    const entContato = (pe?.contato_entregador || (pedido as any)?.contato_entregador || '').trim();

    // Link e corrida
    const linkRastreio = (pe?.link_rastreio || pedido?.link_rastreio || (pedido as any)?.link_rastreio || '').trim();
    const codCorrida = (pe?.codigo_corrida || (pedido as any)?.codigo_corrida || '').trim();

    // Identificação da modalidade
    const ehTransp =
      opTipo === 'transportadora' ||
      Boolean(transpId) ||
      (Boolean(transpNome) && !transpNome.toLowerCase().includes('correios') && (
        transpNome.toLowerCase().includes('jadlog') ||
        transpNome.toLowerCase().includes('transportadora') ||
        transpNome.toLowerCase().includes('braspress') ||
        transpNome.toLowerCase().includes('total express') ||
        transpNome.toLowerCase().includes('azul') ||
        transpNome.toLowerCase().includes('latam') ||
        transpNome.toLowerCase().includes('rodonaves')
      ));

    const ehApp =
      opTipo === 'app_entrega' ||
      Boolean(appId) ||
      (Boolean(appNome) && (
        appNome.toLowerCase().includes('uber') ||
        appNome.toLowerCase().includes('99') ||
        appNome.toLowerCase().includes('lalamove')
      ));

    const ehFrota =
      opTipo === 'frota_propria' ||
      opTipo === 'motoboy' ||
      opTipo === 'proprio' ||
      Boolean(entNome);

    if (ehApp) {
      setModalidade('app_entrega');
      setCodigoCorrida(codCorrida);
      setLinkRastreioApp(linkRastreio);
      if (apps.length > 0) {
        setAppSelecionadoId(encontrarIdApp(apps, appId, appNome));
      }
    } else if (ehTransp) {
      setModalidade('transportadora');
      setCodigoRastreioTransp(codRastreio);
      setValorFreteTransp(valFreteStr);
      if (transportadoras.length > 0) {
        setTranspSelecionadaId(encontrarIdTransportadora(transportadoras, transpId, transpNome));
      }
    } else if (ehFrota) {
      setModalidade('frota_propria');
      setEntregadorNome(entNome);
      setContatoEntregador(entContato);
    } else {
      setModalidade('correios');
      const srvCorreios = (pedido as any)?.servico_correios || pe?.servico_correios;
      setServicoCorreios(srvCorreios === 'PAC' ? 'PAC' : 'SEDEX');
      setCodigoRastreioCorreios(codRastreio);
    }
  }, [isOpen, pedido, entrega, entregaInterna, transportadoras.length, apps.length]);

  // Crítica / Validação dos Correios
  const validacaoCorreios = useMemo(() => {
    return validarRastreioCorreios(codigoRastreioCorreios, servicoCorreios);
  }, [codigoRastreioCorreios, servicoCorreios]);

  // Validação geral do botão confirmar
  const podeConfirmar = useMemo(() => {
    if (despachando) return false;

    if (modalidade === 'correios') {
      return validacaoCorreios.valido;
    }
    if (modalidade === 'app_entrega') {
      return Boolean(appSelecionadoId);
    }
    if (modalidade === 'transportadora') {
      return Boolean(transpSelecionadaId);
    }
    if (modalidade === 'frota_propria') {
      return Boolean(entregadorNome.trim());
    }
    return false;
  }, [modalidade, despachando, validacaoCorreios.valido, appSelecionadoId, transpSelecionadaId, entregadorNome]);

  const handleConfirmar = async () => {
    if (!pedido?.id || !podeConfirmar) return;

    setDespachando(true);
    setErroMsg(null);

    try {
      const dadosDespacho: any = {
        usuarioId: usuario?.id || null
      };

      if (modalidade === 'correios') {
        dadosDespacho.tipoOperacao = 'correios';
        dadosDespacho.servicoCorreios = servicoCorreios;
        dadosDespacho.codigoRastreio = codigoRastreioCorreios.trim().toUpperCase();
        dadosDespacho.nomeTransportadora = `Correios (${servicoCorreios})`;
      } else if (modalidade === 'app_entrega') {
        const appEncontrado = apps.find(a => a.id === appSelecionadoId);
        dadosDespacho.tipoOperacao = 'app_entrega';
        dadosDespacho.appEntregaId = appSelecionadoId;
        dadosDespacho.nomeApp = appEncontrado?.nome || 'App de Corrida';
        dadosDespacho.codigoCorrida = codigoCorrida.trim() || null;
        dadosDespacho.linkRastreio = linkRastreioApp.trim() || null;
      } else if (modalidade === 'transportadora') {
        const transpEncontrada = transportadoras.find(t => t.id === transpSelecionadaId);
        dadosDespacho.tipoOperacao = 'transportadora';
        dadosDespacho.transportadoraId = transpSelecionadaId;
        dadosDespacho.nomeTransportadora = transpEncontrada?.nome || 'Transportadora';
        dadosDespacho.codigoRastreio = codigoRastreioTransp.trim().toUpperCase() || null;
        if (valorFreteTransp.trim()) {
          dadosDespacho.valorFrete = parseFloat(valorFreteTransp.replace(',', '.'));
        }
      } else if (modalidade === 'frota_propria') {
        dadosDespacho.tipoOperacao = 'frota_propria';
        dadosDespacho.entregadorNome = entregadorNome.trim();
        dadosDespacho.contatoEntregador = contatoEntregador.trim() || null;
      }

      await ShippingOrchestrator.despacharEntregaManual(pedido.id, dadosDespacho);
      onDespachado();
      onClose();
    } catch (err: unknown) {
      console.error('[ModalDespacharPedido] Erro ao despachar:', err);
      const msg = err instanceof Error ? err.message : 'Erro ao despachar pedido.';
      setErroMsg(msg);
    } finally {
      setDespachando(false);
    }
  };

  if (!isOpen || !pedido) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl animate-in zoom-in-95 max-h-[92vh] overflow-y-auto">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm text-slate-900 dark:text-slate-100">
                Despachar Pedido #{pedido.numero_pedido || pedido.id.slice(0, 5)}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Selecione o meio de envio e preencha os dados de despacho
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Endereço de destino (se houver) */}
        {pedido.endereco_entrega && (
          <div className="p-3 bg-slate-50 dark:bg-slate-950/70 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-0.5">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              Destino da Entrega:
            </span>
            <p className="text-slate-800 dark:text-slate-200 font-medium text-xs leading-relaxed">
              {pedido.endereco_entrega}
            </p>
          </div>
        )}

        {/* SELEÇÃO ESTRITA DAS 4 MODALIDADES PERMITIDAS */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
            Meio de Envio:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Opção 1: Correios */}
            <button
              type="button"
              onClick={() => setModalidade('correios')}
              className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1.5 cursor-pointer ${
                modalidade === 'correios'
                  ? 'bg-emerald-500/10 border-2 border-emerald-500 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Package className="w-5 h-5" />
              <span className="text-xs font-bold leading-tight">Correios</span>
            </button>

            {/* Opção 2: App de Corrida */}
            <button
              type="button"
              onClick={() => setModalidade('app_entrega')}
              className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1.5 cursor-pointer ${
                modalidade === 'app_entrega'
                  ? 'bg-emerald-500/10 border-2 border-emerald-500 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Navigation className="w-5 h-5" />
              <span className="text-xs font-bold leading-tight">App Corrida</span>
            </button>

            {/* Opção 3: Transportadora */}
            <button
              type="button"
              onClick={() => setModalidade('transportadora')}
              className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1.5 cursor-pointer ${
                modalidade === 'transportadora'
                  ? 'bg-emerald-500/10 border-2 border-emerald-500 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Truck className="w-5 h-5" />
              <span className="text-xs font-bold leading-tight">Transportadora</span>
            </button>

            {/* Opção 4: Frete Próprio */}
            <button
              type="button"
              onClick={() => setModalidade('frota_propria')}
              className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1.5 cursor-pointer ${
                modalidade === 'frota_propria'
                  ? 'bg-emerald-500/10 border-2 border-emerald-500 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Bike className="w-5 h-5" />
              <span className="text-xs font-bold leading-tight">Frete Próprio</span>
            </button>
          </div>
        </div>

        {/* FORMULÁRIO ESPECÍFICO CONFORME MODALIDADE */}
        <div className="space-y-3.5 pt-1">
          {/* 1. CORREIOS */}
          {modalidade === 'correios' && (
            <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" />
                  <span>Despacho via Correios</span>
                </span>
                {codigoRastreioCorreios && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                      validacaoCorreios.valido
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {validacaoCorreios.valido ? 'Padrão Válido' : 'Padrão Inválido'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                    Serviço Correios *
                  </label>
                  <select
                    value={servicoCorreios}
                    onChange={(e) => setServicoCorreios(e.target.value as 'PAC' | 'SEDEX')}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  >
                    <option value="SEDEX">SEDEX</option>
                    <option value="PAC">PAC</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                    Código de Rastreamento *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={13}
                      placeholder={servicoCorreios === 'PAC' ? 'Ex: QB123456789BR' : 'Ex: SB123456789BR'}
                      value={codigoRastreioCorreios}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase().replace(/\s+/g, '').slice(0, 13);
                        setCodigoRastreioCorreios(val);
                      }}
                      className={`w-full bg-white dark:bg-slate-900 border rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 uppercase font-mono font-bold placeholder:text-slate-400 focus:outline-none tracking-wider ${
                        codigoRastreioCorreios.length > 0
                          ? validacaoCorreios.valido
                            ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                            : 'border-rose-500 text-rose-600 dark:text-rose-400'
                          : 'border-slate-200 dark:border-slate-700 focus:border-emerald-500'
                      }`}
                    />
                    {codigoRastreioCorreios && (
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        {validacaoCorreios.valido ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-500" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Feedback de Validação */}
              <div className="pt-0.5">
                {!codigoRastreioCorreios ? (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400/90 font-medium flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Obrigatório código no padrão dos Correios (13 dígitos: 2 letras + 9 números + BR).</span>
                  </p>
                ) : !validacaoCorreios.valido ? (
                  <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 space-y-1.5 text-[11px]">
                    <div className="flex items-start gap-1.5 font-bold">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-500 mt-0.5" />
                      <span>{validacaoCorreios.motivo}</span>
                    </div>
                    {validacaoCorreios.servicoDetectado &&
                      validacaoCorreios.servicoDetectado !== servicoCorreios &&
                      validacaoCorreios.servicoDetectado !== 'OUTRO' && (
                        <div className="pt-0.5 flex items-center gap-2">
                          <span className="text-[10px] text-slate-600 dark:text-slate-300">Prefixo identificado como {validacaoCorreios.servicoDetectado}:</span>
                          <button
                            type="button"
                            onClick={() => setServicoCorreios(validacaoCorreios.servicoDetectado as 'PAC' | 'SEDEX')}
                            className="px-2 py-0.5 rounded-lg bg-rose-200 dark:bg-rose-500/30 text-rose-900 dark:text-rose-100 text-[10px] font-bold underline cursor-pointer transition"
                          >
                            Mudar serviço para {validacaoCorreios.servicoDetectado}
                          </button>
                        </div>
                      )}
                  </div>
                ) : (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Código de rastreamento {servicoCorreios} validado com sucesso!</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 2. APP DE CORRIDA */}
          {modalidade === 'app_entrega' && (
            <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5" />
                <span>Corrida por Aplicativo</span>
              </span>

              {carregandoListas ? (
                <div className="p-4 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  <span>Carregando aplicativos cadastrados...</span>
                </div>
              ) : apps.length === 0 ? (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-200 text-xs">
                  Nenhum aplicativo de corrida cadastrado na loja. Cadastre em <strong>Configurações &gt; Frete</strong>.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                      Aplicativo de Corrida *
                    </label>
                    <select
                      value={appSelecionadoId}
                      onChange={(e) => setAppSelecionadoId(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    >
                      {apps.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                      Código da Corrida
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: #UB-84920"
                      value={codigoCorrida}
                      onChange={(e) => setCodigoCorrida(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                      Link de Acompanhamento ao Vivo (Opcional)
                    </label>
                    <input
                      type="url"
                      placeholder="https://trip.uber.com/... ou https://99app.com/..."
                      value={linkRastreioApp}
                      onChange={(e) => setLinkRastreioApp(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. TRANSPORTADORA */}
          {modalidade === 'transportadora' && (
            <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" />
                <span>Transportadora Privada</span>
              </span>

              {carregandoListas ? (
                <div className="p-4 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  <span>Carregando transportadoras cadastradas...</span>
                </div>
              ) : transportadoras.length === 0 ? (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-200 text-xs">
                  Nenhuma transportadora cadastrada na loja. Cadastre em <strong>Configurações &gt; Frete</strong>.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                      Transportadora Parceira *
                    </label>
                    <select
                      value={transpSelecionadaId}
                      onChange={(e) => setTranspSelecionadaId(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    >
                      {transportadoras.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nome} {t.pessoa_contato ? `(${t.pessoa_contato})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                      Código de Rastreio / CTE
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 1812839281"
                      value={codigoRastreioTransp}
                      onChange={(e) => setCodigoRastreioTransp(e.target.value.toUpperCase())}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                      Valor do Frete (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={valorFreteTransp}
                      onChange={(e) => setValorFreteTransp(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. FRETE PRÓPRIO */}
          {modalidade === 'frota_propria' && (
            <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center gap-1.5">
                <Bike className="w-3.5 h-3.5" />
                <span>Dados do Entregador / Motoboy</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                    Nome do Entregador *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Carlos (Moto)"
                    value={entregadorNome}
                    onChange={(e) => setEntregadorNome(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                    Contato / Telefone
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: (85) 99999-0000"
                    value={contatoEntregador}
                    onChange={(e) => setContatoEntregador(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {erroMsg && (
          <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{erroMsg}</span>
          </div>
        )}

        {/* Rodapé com Ações */}
        <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={despachando}
            className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirmar}
            disabled={!podeConfirmar}
            className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg transition ${
              podeConfirmar
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 cursor-pointer active:scale-95'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-300 dark:border-slate-700 cursor-not-allowed opacity-60'
            }`}
          >
            {despachando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Despachando...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Confirmar</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
