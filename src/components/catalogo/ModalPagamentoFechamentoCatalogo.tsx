// HUBI - Modal de Fechamento e Pagamento do Catálogo Online v2.0
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  CreditCard,
  Banknote,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  Save,
  FileText,
  Truck,
  BookOpen,
  Copy,
  Upload
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Pedido, FormaPagamento, StatusPagamento, TipoPagamento, Loja, Cliente } from '../../types';
import { PrintService } from '../../services/printService';
import { SyncService } from '../../services/syncService';
import { audioService } from '../../services/audioService';
import { CadernetaService } from '../../services/cadernetaService';
import { obterDataOperacaoISO } from '../../utils/dataOperacao';
import { formatarMoeda, formatarValorBRL } from '../../utils/formatters';
import { ModalDefinirEnvio } from '../pedidos/ModalDefinirEnvio';
import { ShippingOrchestrator } from '../../services/shippingOrchestrator';
import { paymentGatewayService } from '../../services/paymentGatewayService';
import { gerarPayloadPixEmv } from '../../utils/pixUtils';

interface MoneyInputProps {
  valor: number;
  onChange: (novoValor: number) => void;
  autoFocus?: boolean;
  className?: string;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
}

const MoneyInput: React.FC<MoneyInputProps> = ({
  valor,
  onChange,
  autoFocus,
  className,
  placeholder = "0,00",
  inputRef
}) => {
  const [texto, setTexto] = useState<string>(() =>
    valor > 0 ? formatarValorBRL(valor) : ''
  );
  const [focado, setFocado] = useState(false);

  useEffect(() => {
    if (!focado) {
      setTexto(valor > 0 ? formatarValorBRL(valor) : '');
    }
  }, [valor, focado]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const sanitizado = raw.replace(/[^\d.,]/g, '');
    setTexto(sanitizado);

    if (!sanitizado) {
      onChange(0);
      return;
    }

    let normalizado = sanitizado;
    if (normalizado.includes(',')) {
      normalizado = normalizado.replace(/\./g, '').replace(',', '.');
    }
    const parsed = parseFloat(normalizado);
    onChange(isNaN(parsed) ? 0 : parsed);
  };

  const handleBlur = () => {
    setFocado(false);
    if (valor > 0) {
      setTexto(formatarValorBRL(valor));
    } else {
      setTexto('');
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      autoFocus={autoFocus}
      onFocus={(e) => {
        setFocado(true);
        e.target.select();
      }}
      onBlur={handleBlur}
      value={texto}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
    />
  );
};

export interface LinhaPagamentoRecebimento {
  id: string;
  forma_pagamento_id: string;
  forma_tipo: TipoPagamento;
  forma_nome: string;
  valor: number;
  valor_entregue?: number | null;
  parcelas?: number;
}

export interface ModalPagamentoFechamentoCatalogoProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  loja?: Loja | null;
  cliente?: Cliente | null;
  saldoDevedorAvulso?: number;
  origem?: 'catalogo' | 'caderneta';
  onPagamentoConcluido: (pedidoAtualizado?: Pedido) => void;
  onSalvar?: (linhas: LinhaPagamentoRecebimento[]) => Promise<void>;
}

export const ModalPagamentoFechamentoCatalogo: React.FC<ModalPagamentoFechamentoCatalogoProps> = ({
  isOpen,
  onClose,
  pedido,
  loja: lojaProp,
  cliente: clienteProp,
  saldoDevedorAvulso,
  origem = 'catalogo',
  onPagamentoConcluido,
  onSalvar
}) => {
  const auth = useAuth();
  const loja = lojaProp || auth?.loja;
  const usuario = auth?.usuario;
  const { tema } = useTheme();
  const isDark = tema === 'dark';

  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [linhasPagamento, setLinhasPagamento] = useState<LinhaPagamentoRecebimento[]>([]);
  const [processando, setProcessando] = useState<boolean>(false);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [sucessoModal, setSucessoModal] = useState<boolean>(false);
  const [sucessoConfig, setSucessoConfig] = useState<{
    titulo: string;
    mensagem: string;
    aguardandoConferencia?: boolean;
  } | null>(null);
  const [pixCopiado, setPixCopiado] = useState<boolean>(false);
  const [chavePixCopiada, setChavePixCopiada] = useState<boolean>(false);
  const [toastPixMsg, setToastPixMsg] = useState<string | null>(null);
  const [comprovanteArquivo, setComprovanteArquivo] = useState<File | null>(null);
  const [pedidoAtualizado, setPedidoAtualizado] = useState<Pedido | null>(null);
  const [pedidoLocal, setPedidoLocal] = useState<Pedido | null>(pedido);
  const [modalDefinirEnvioAberto, setModalDefinirEnvioAberto] = useState<boolean>(false);
  const inputPrimeiroValorRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPedidoLocal(pedido);
  }, [pedido]);

  const pedSeguro: Pedido = (pedidoLocal || pedido) || {
    id: `caderneta_${clienteProp?.id || 'temp'}`,
    loja_id: loja?.id || '',
    cliente_id: clienteProp?.id || '',
    cliente: clienteProp || undefined,
    numero_pedido: 0,
    valor_total: Number(saldoDevedorAvulso || 0),
    valor_pago: 0,
    saldo_devedor: Number(saldoDevedorAvulso || 0),
    status: 'pendente',
    status_pagamento: 'caderneta',
    origem: origem === 'catalogo' ? 'catalogo_online' : 'pdv_desktop',
    criado_em: new Date().toISOString()
  } as any;

  const ehModoCaderneta = Boolean(
    origem === 'caderneta' ||
    String(pedSeguro.id || '').startsWith('caderneta_') ||
    (saldoDevedorAvulso != null && saldoDevedorAvulso > 0 && !pedido)
  );

  const recarregarPedido = async () => {
    if (!pedSeguro?.id || !loja?.id || pedSeguro.id.startsWith('caderneta_')) return;
    try {
      const { data, error } = await supabase
        .from('pedidos')
        .select(`
          *,
          cliente:clientes(*),
          vendedor:usuarios_loja!pedidos_vendedor_id_fkey(*),
          itens:itens_pedido(*),
          pedido_entregas(*),
          pagamentos:pagamentos_pedido(*)
        `)
        .eq('loja_id', loja.id)
        .eq('id', pedSeguro.id)
        .single();

      if (!error && data) {
        const pe = Array.isArray(data.pedido_entregas) ? data.pedido_entregas[0] : (data.pedido_entregas || null);
        const pedidoComEntrega = {
          ...data,
          pedido_entrega: pe
        } as unknown as Pedido;
        setPedidoLocal(pedidoComEntrega);
        const nTot = Number(pedidoComEntrega.valor_total || 0);
        const nPago = Number(pedidoComEntrega.valor_pago || 0);
        const nSaldo = Math.max(0, Number(pedidoComEntrega.saldo_devedor ?? (nTot - nPago)));
        setLinhasPagamento(prev => prev.map((l, idx) => idx === 0 ? { ...l, valor: Number(nSaldo.toFixed(2)) } : l));
      }
    } catch (e) {
      console.warn('Erro ao recarregar pedido:', e);
    }
  };

  const FORMAS_PADRAO: FormaPagamento[] = [
    { id: `fp_pix_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'PIX', tipo: 'pix', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_mercado_pago_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Mercado Pago', tipo: 'mercado_pago', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_credito_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Cartão de Crédito', tipo: 'cartao_credito', taxa_percentual: 3.2, taxa_fixa: 0, maximo_parcelas: 12, ativo: true, exibir_catalogo: true },
    { id: `fp_debito_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Cartão de Débito', tipo: 'cartao_debito', taxa_percentual: 1.5, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_dinheiro_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Dinheiro', tipo: 'dinheiro', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_fiado_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Fiado', tipo: 'fiado', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: false },
    { id: `fp_caderneta_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Caderneta', tipo: 'caderneta', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: false }
  ];

  // Carregar formas de pagamento cadastradas da loja
  useEffect(() => {
    if (!loja?.id || !isOpen) return;
    const buscarFormas = async () => {
      try {
        const { data, error } = await supabase
          .from('formas_pagamento')
          .select('*')
          .eq('loja_id', loja.id)
          .eq('ativo', true)
          .order('nome');

        const pagCfg = loja?.configuracoes_extras?.pagamentos as any;
        const pagDigitais = (loja?.configuracoes_extras as any)?.pagamentos_digitais || {};
        const mpConfig = pagDigitais?.mercado_pago;
        const mpAtivo = Boolean(
          mpConfig?.ativo ||
          mpConfig?.access_token ||
          mpConfig?.public_key ||
          pagCfg?.mercado_pago_ativo ||
          pagCfg?.provedor_digital === 'mercado_pago' ||
          pagDigitais?.provedor === 'mercado_pago'
        );

        const cadernetaAtivaLoja = Boolean(loja?.caderneta_ativa ?? pagCfg?.caderneta_ativa);
        const fiadoAtivoLoja = !cadernetaAtivaLoja && Boolean(pagCfg?.permitir_fiado ?? true);

        const metodoPermitidoNaLoja = (fp: FormaPagamento) => {
          const t = (fp.tipo || '').toLowerCase();
          if (t === 'pix') return pagCfg?.pix_ativo !== false;
          if (t === 'mercado_pago') return mpAtivo;
          if (t === 'mercado_livre') return false; // Proibido no Catálogo
          if (t === 'dinheiro') return pagCfg?.dinheiro_ativo !== false;
          if (t === 'cartao_debito') return pagCfg?.debito_ativo !== false;
          if (t === 'cartao_credito') return pagCfg?.credito_ativo !== false;
          if (t === 'fiado') return fiadoAtivoLoja;
          if (t === 'caderneta') return cadernetaAtivaLoja;
          return true;
        };

        let lista = FORMAS_PADRAO.filter(metodoPermitidoNaLoja);
        if (!error && data && data.length > 0) {
          lista = data
            .map((fp: any) =>
              (fp.tipo === 'caderneta' || fp.nome?.toLowerCase().includes('caderneta'))
                ? { ...fp, tipo: 'caderneta' }
                : fp
            )
            .filter(metodoPermitidoNaLoja);

          if (mpAtivo && !lista.some(f => f.tipo === 'mercado_pago')) {
            const mpPadrao = FORMAS_PADRAO.find(f => f.tipo === 'mercado_pago');
            if (mpPadrao) lista = [...lista, mpPadrao];
          }
          if (fiadoAtivoLoja && !lista.some(f => f.tipo === 'fiado')) {
            const fiadoPadrao = FORMAS_PADRAO.find(f => f.tipo === 'fiado');
            if (fiadoPadrao) lista = [...lista, fiadoPadrao];
          }
          if (cadernetaAtivaLoja && !lista.some(f => f.tipo === 'caderneta')) {
            const cadernetaPadrao = FORMAS_PADRAO.find(f => f.tipo === 'caderneta');
            if (cadernetaPadrao) lista = [...lista, cadernetaPadrao];
          }
        }
        setFormasPagamento(lista);
      } catch (err) {
        console.warn('Fallback formas de pagamento:', err);
        setFormasPagamento(FORMAS_PADRAO.filter(f => f.tipo !== 'mercado_livre'));
      }
    };

    buscarFormas();
  }, [loja?.id, loja?.caderneta_ativa, loja?.configuracoes_extras?.pagamentos, loja?.configuracoes_extras?.pagamentos_digitais, isOpen]);

  // Carrega dados frescos de crédito e caderneta do cliente
  const [dadosClienteFresco, setDadosClienteFresco] = useState<any>(null);

  useEffect(() => {
    if (!isOpen || !loja?.id) return;
    const cliId = pedSeguro.cliente_id || clienteProp?.id;
    if (!cliId) {
      setDadosClienteFresco(null);
      return;
    }
    const carregarCliente = async () => {
      try {
        const { data, error } = await supabase
          .from('clientes')
          .select('id, nome, telefone, permite_fiado, limite_credito, saldo_devedor_fiado, permite_caderneta, limite_caderneta, saldo_devedor_caderneta, dia_vencimento_caderneta')
          .eq('loja_id', loja.id)
          .eq('id', cliId)
          .single();
        if (!error && data) {
          setDadosClienteFresco(data);
        }
      } catch (err) {
        console.warn('Erro ao carregar dados frescos do cliente:', err);
      }
    };
    carregarCliente();
  }, [isOpen, loja?.id, pedSeguro.cliente_id, clienteProp?.id]);

  const clientePedidoMemo = useMemo(() => {
    return dadosClienteFresco || pedSeguro.cliente || clienteProp || null;
  }, [dadosClienteFresco, pedSeguro.cliente, clienteProp]);

  const rawPe = (pedSeguro as any)?.pedido_entrega || (Array.isArray((pedSeguro as any)?.pedido_entregas) ? (pedSeguro as any)?.pedido_entregas[0] : null);
  const meta = (pedSeguro as any)?.metadados || {};
  const metaTipo = String(meta.tipo_atendimento || '').toLowerCase();
  const peTipo = String(rawPe?.tipo_atendimento || '').toLowerCase();

  const ehRetirada = (
    peTipo === 'retirada' ||
    metaTipo === 'retirada' ||
    (pedSeguro as any)?.tipo_atendimento === 'retirada' ||
    String(pedSeguro?.endereco_entrega || '').toLowerCase().includes('retirada') ||
    rawPe?.provedor === 'retirada_loja'
  );

  const ehEnvio = !ehModoCaderneta && !ehRetirada && (
    peTipo === 'entrega' ||
    metaTipo === 'entrega' ||
    (pedSeguro as any)?.tipo_entrega === 'envio' ||
    (pedSeguro as any)?.tipo_atendimento === 'entrega' ||
    Boolean(pedSeguro?.endereco_entrega)
  );

  const provedorFrete = (
    rawPe?.provedor || 
    (pedSeguro as any)?.provedor_frete || 
    (pedSeguro as any)?.provedor ||
    meta.provedor || 
    meta.opcao_frete?.provedor || 
    ''
  ).toLowerCase();

  const transpNomeFrete = (
    rawPe?.transportadora_nome || 
    pedSeguro?.nome_transportadora || 
    rawPe?.forma_entrega_nome || 
    (pedSeguro as any)?.forma_entrega_nome || 
    (pedSeguro as any)?.transportadora || 
    (pedSeguro as any)?.transportadora_nome ||
    meta.transportadora_nome || 
    meta.transportadora || 
    meta.opcao_frete?.transportadora_nome || 
    meta.opcao_frete?.nome || 
    ''
  ).toLowerCase();

  const nomeAppFrete = (
    rawPe?.nome_app || 
    pedSeguro?.nome_app || 
    (pedSeguro as any)?.nome_app ||
    meta.nome_app || 
    meta.opcao_frete?.nome_app || 
    ''
  ).toLowerCase();

  const servicoCorreiosFrete = (
    rawPe?.servico_correios || 
    pedSeguro?.servico_correios || 
    meta.servico_correios || 
    ''
  ).toLowerCase();

  const servicoCodigoFrete = (
    rawPe?.servico_codigo || 
    meta.opcao_frete?.servico_codigo || 
    meta.opcao_frete?.id || 
    ''
  ).toLowerCase();

  const tipoOperacaoFrete = (
    rawPe?.tipo_operacao || 
    pedSeguro?.tipo_operacao || 
    (pedSeguro as any)?.tipo_operacao ||
    meta.tipo_operacao || 
    ''
  ).toLowerCase();

  // Identificação estrita de frete terceirizado (Uber Direct, Correios, Jadlog, Melhor Envio, 99, etc.)
  const ehFreteTerceirizado = Boolean(
    provedorFrete === 'uber' ||
    provedorFrete === 'melhor_envio' ||
    provedorFrete === 'correios' ||
    nomeAppFrete.includes('uber') ||
    nomeAppFrete.includes('99') ||
    nomeAppFrete.includes('ifood') ||
    nomeAppFrete.includes('rappi') ||
    nomeAppFrete.includes('lalamove') ||
    transpNomeFrete.includes('uber') ||
    transpNomeFrete.includes('melhor envio') ||
    transpNomeFrete.includes('melhorenvio') ||
    transpNomeFrete.includes('correios') ||
    transpNomeFrete.includes('sedex') ||
    transpNomeFrete.includes('pac') ||
    transpNomeFrete.includes('jadlog') ||
    transpNomeFrete.includes('azul cargo') ||
    transpNomeFrete.includes('azulcargo') ||
    transpNomeFrete.includes('loggi') ||
    transpNomeFrete.includes('latam') ||
    transpNomeFrete.includes('buslog') ||
    transpNomeFrete.includes('.package') ||
    transpNomeFrete.includes('.com') ||
    Boolean(servicoCorreiosFrete) ||
    servicoCodigoFrete.includes('uber') ||
    tipoOperacaoFrete === 'transportadora' ||
    tipoOperacaoFrete === 'app_entrega'
  );

  // Pagamento presencial (dinheiro/cartão na entrega) é permitido exclusivamente se:
  // 1) For retirada na loja (balcão);
  // 2) For liquidação de caderneta (sem despacho); ou
  // 3) For entrega própria da loja (NÃO terceirizada por Uber/Correios/Jadlog/Melhor Envio)
  const presencialPermitido = ehRetirada || ehModoCaderneta || (!ehFreteTerceirizado && ehEnvio);

  const limiteDisponivelCaderneta = useMemo(() => {
    if (!clientePedidoMemo) return 0;
    const lim = Number(clientePedidoMemo.limite_caderneta || 0);
    const deb = Number(clientePedidoMemo.saldo_devedor_caderneta || 0);
    return Math.max(0, Number((lim - deb).toFixed(2)));
  }, [clientePedidoMemo]);

  const clienteAptoFiado = useMemo(() => {
    return Boolean(
      clientePedidoMemo &&
      (clientePedidoMemo.permite_fiado ?? true) &&
      Number(clientePedidoMemo.limite_credito || 0) > 0
    );
  }, [clientePedidoMemo]);

  const clienteAptoCaderneta = useMemo(() => {
    const cadAtivaLoja = Boolean(loja?.caderneta_ativa);
    if (!cadAtivaLoja) return false;
    return Boolean(
      clientePedidoMemo &&
      (clientePedidoMemo.permite_caderneta ?? true) &&
      limiteDisponivelCaderneta > 0
    );
  }, [loja?.caderneta_ativa, clientePedidoMemo, limiteDisponivelCaderneta]);

  const formasDisponiveis: FormaPagamento[] = useMemo(() => {
    const lista = formasPagamento.length > 0 ? formasPagamento : FORMAS_PADRAO;
    return lista
      .filter((fp: FormaPagamento) => {
        if (!fp.ativo) return false;
        if (fp.tipo === 'mercado_livre') return false; // Não permitido

        // Na liquidação de caderneta, não permitir pagar gerando mais fiado/caderneta
        if (ehModoCaderneta && (fp.tipo === 'caderneta' || fp.tipo === 'fiado')) {
          return false;
        }

        if (!presencialPermitido) {
          if (fp.tipo === 'dinheiro' || fp.tipo === 'cartao_debito' || fp.tipo === 'cartao_credito') {
            return false;
          }
        }

        if (fp.tipo === 'fiado') {
          const linhaJaUsaFiado = linhasPagamento.some(l => l.forma_tipo === 'fiado' || l.forma_pagamento_id === fp.id);
          return clienteAptoFiado || linhaJaUsaFiado;
        }
        if (fp.tipo === 'caderneta') {
          const linhaJaUsaCaderneta = linhasPagamento.some(l => l.forma_tipo === 'caderneta' || l.forma_pagamento_id === fp.id);
          return clienteAptoCaderneta || linhaJaUsaCaderneta;
        }
        return true;
      })
      .map((fp: FormaPagamento) => {
        let nomeLimpo = fp.nome || '';
        if (fp.tipo === 'cartao_debito' && (!nomeLimpo || nomeLimpo.toLowerCase().includes('maquininha'))) {
          nomeLimpo = 'Cartão de Débito';
        } else if (fp.tipo === 'cartao_credito' && (!nomeLimpo || nomeLimpo.toLowerCase().includes('maquininha'))) {
          nomeLimpo = 'Cartão de Crédito';
        } else {
          nomeLimpo = nomeLimpo.replace(/\s*\([Mm]aquininha\)/g, '').replace(/\s*[Mm]aquininha/g, '').trim();
        }
        return {
          ...fp,
          nome: nomeLimpo
        };
      });
  }, [formasPagamento, clienteAptoFiado, clienteAptoCaderneta, linhasPagamento, presencialPermitido]);

  const valorTotal = saldoDevedorAvulso != null && saldoDevedorAvulso > 0
    ? saldoDevedorAvulso
    : Number(pedSeguro.valor_total || 0);
  const valorJaPago = pedido ? Number(pedSeguro.valor_pago || 0) : 0;
  const saldoDevedorAtual = saldoDevedorAvulso != null && saldoDevedorAvulso > 0
    ? saldoDevedorAvulso
    : Math.max(0, Number(pedSeguro.saldo_devedor ?? (valorTotal - valorJaPago)));

  // Limpar e redefinir ao fechar
  useEffect(() => {
    if (!isOpen) {
      setLinhasPagamento([]);
      setErroMsg(null);
      setSucessoModal(false);
      setComprovanteArquivo(null);
    }
  }, [isOpen]);

  // Inicializar linhas de pagamento quando abrir em estado neutro (sem pré-seleção forçada do Pix)
  useEffect(() => {
    if (isOpen && linhasPagamento.length === 0) {
      setLinhasPagamento([
        {
          id: `linha_${Date.now()}`,
          forma_pagamento_id: '',
          forma_tipo: '' as any,
          forma_nome: '',
          valor: Number(saldoDevedorAtual.toFixed(2)),
          parcelas: 1
        }
      ]);
    }
  }, [isOpen, saldoDevedorAtual, linhasPagamento.length]);

  // Sincronizar valor único se não houver split
  useEffect(() => {
    if (!isOpen) return;
    if (linhasPagamento.length === 1) {
      const valorAlvo = Number(saldoDevedorAtual.toFixed(2));
      if (Math.abs((linhasPagamento[0].valor || 0) - valorAlvo) > 0.009) {
        setLinhasPagamento(prev => {
          if (prev.length === 1 && Math.abs((prev[0].valor || 0) - valorAlvo) > 0.009) {
            return [{ ...prev[0], valor: valorAlvo }];
          }
          return prev;
        });
      }
    }
  }, [isOpen, saldoDevedorAtual, linhasPagamento.length]);

  // Reset de meios presenciais inválidos se o frete for terceirizado (Uber, Correios, Jadlog, etc.)
  useEffect(() => {
    if (!isOpen || presencialPermitido) return;

    setLinhasPagamento(prev => {
      const temInvalido = prev.some(l => 
        l.forma_tipo === 'dinheiro' || 
        l.forma_tipo === 'cartao_debito' || 
        l.forma_tipo === 'cartao_credito'
      );
      if (!temInvalido) return prev;

      return prev.map(l => {
        if (
          l.forma_tipo === 'dinheiro' || 
          l.forma_tipo === 'cartao_debito' || 
          l.forma_tipo === 'cartao_credito'
        ) {
          return {
            ...l,
            forma_pagamento_id: '',
            forma_tipo: '' as any,
            forma_nome: '',
            valor_entregue: null
          };
        }
        return l;
      });
    });
  }, [isOpen, presencialPermitido]);

  if (!isOpen || (!pedido && !saldoDevedorAvulso)) return null;

  const isFreteFormalizado = Boolean(
    ehModoCaderneta ||
    !ehEnvio ||
    (
      rawPe &&
      rawPe.servico_codigo &&
      rawPe.servico_codigo !== 'pendente' &&
      rawPe.transportadora_nome &&
      rawPe.transportadora_nome !== 'Envio a Definir'
    ) ||
    pedSeguro.forma_entrega_id ||
    pedSeguro.nome_transportadora ||
    pedSeguro.codigo_rastreio ||
    pedSeguro.link_rastreio
  );

  const freteADefinir = !ehModoCaderneta && ehEnvio && !isFreteFormalizado;

  const totalLinhasPagamento = linhasPagamento.reduce((acc, l) => acc + (Number(l.valor) || 0), 0);
  const diferencaPagamento = Number((saldoDevedorAtual - totalLinhasPagamento).toFixed(2));

  // Chave Pix da loja bruta
  const chavePixBruta = (() => {
    const pagCfg = loja?.configuracoes_extras?.pagamentos as any;
    return pagCfg?.chave_pix || pagCfg?.pix_chave || (loja as any)?.chave_pix || (loja as any)?.pix_chave || '';
  })();

  // Chave Pix formatada
  const chavePixFormatada = (() => {
    if (!chavePixBruta) return null;
    const pagCfg = loja?.configuracoes_extras?.pagamentos as any;
    const tipo = (pagCfg?.tipo_chave_pix || (loja as any)?.tipo_chave_pix || '').toLowerCase();
    const limpo = chavePixBruta.replace(/\D/g, '');
    if ((tipo === 'telefone' || tipo === 'celular') && (limpo.length === 10 || limpo.length === 11)) {
      return limpo.length === 11
        ? `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7)}`
        : `(${limpo.slice(0, 2)}) ${limpo.slice(2, 6)}-${limpo.slice(6)}`;
    }
    if (tipo === 'cnpj' && limpo.length === 14) {
      return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12)}`;
    }
    if (tipo === 'cpf' && limpo.length === 11) {
      return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-${limpo.slice(9)}`;
    }
    return chavePixBruta;
  })();

  // Código Pix Copia e Cola (BR Code EMV interoperável com qualquer banco com valor embutido)
  const pixCopiaCola = useMemo(() => {
    const pagCfg = loja?.configuracoes_extras?.pagamentos as any;
    const estatico = pagCfg?.pix_copia_cola || (pedSeguro as any)?.pix_copia_cola || (pedSeguro as any)?.qr_code_pix;
    if (estatico) return estatico;

    if (chavePixBruta) {
      try {
        return gerarPayloadPixEmv({
          chavePix: chavePixBruta,
          nomeRecebedor: loja?.nome_fantasia || (loja as any)?.razao_social || 'HUBI SISTEMAS',
          cidade: (loja as any)?.cidade || (loja as any)?.endereco_cidade || 'BRASIL',
          valor: Number(saldoDevedorAtual.toFixed(2)),
          identificador: `PED${pedSeguro.numero_pedido || ''}`.slice(0, 25)
        });
      } catch (err) {
        console.warn('Erro ao gerar código Pix Copia e Cola EMV:', err);
      }
    }
    return null;
  }, [loja, chavePixBruta, saldoDevedorAtual, pedSeguro.numero_pedido]);

  const handleCopiarPix = () => {
    if (!pixCopiaCola) return;
    const copiarTexto = async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(pixCopiaCola);
        } else {
          const textArea = document.createElement('textarea');
          textArea.value = pixCopiaCola;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
        }
        setPixCopiado(true);
        setToastPixMsg('Código Pix copiado! Cole na opção Pix Copia e Cola do seu app bancário.');
        setTimeout(() => {
          setPixCopiado(false);
          setToastPixMsg(null);
        }, 4500);
      } catch (err) {
        console.warn('Falha ao copiar Pix automaticamente:', err);
        setToastPixMsg('Copie o código manualmente selecionando os dados.');
      }
    };
    copiarTexto();
  };

  const handleCopiarChavePix = () => {
    if (!chavePixBruta) return;
    const copiarTexto = async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(chavePixBruta);
        } else {
          const textArea = document.createElement('textarea');
          textArea.value = chavePixBruta;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
        }
        setChavePixCopiada(true);
        setTimeout(() => setChavePixCopiada(false), 3000);
      } catch (err) {
        console.warn('Falha ao copiar Chave Pix:', err);
      }
    };
    copiarTexto();
  };

  const handleAnexarComprovante = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setComprovanteArquivo(e.target.files[0]);
    }
  };

  const handleAdicionarLinha = () => {
    const somaAtual = linhasPagamento.reduce((acc, l) => acc + (Number(l.valor) || 0), 0);
    const valorRestanteSugerido = Math.max(0, Number((saldoDevedorAtual - somaAtual).toFixed(2)));

    const novaLinha: LinhaPagamentoRecebimento = {
      id: `linha_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      forma_pagamento_id: '',
      forma_tipo: '' as any,
      forma_nome: '',
      valor: valorRestanteSugerido,
      parcelas: 1
    };
    setLinhasPagamento(prev => [...prev, novaLinha]);
  };

  const handleRemoverLinha = (id: string) => {
    if (linhasPagamento.length <= 1) return;
    setLinhasPagamento(prev => prev.filter(l => l.id !== id));
  };

  const handleAlterarFormaLinha = (linhaId: string, fp: FormaPagamento) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id !== linhaId) return l;
      return {
        ...l,
        forma_pagamento_id: fp.id,
        forma_tipo: fp.tipo,
        forma_nome: fp.nome,
        parcelas: fp.tipo === 'cartao_credito' ? (l.parcelas || 1) : 1
      };
    }));
  };

  const handleAlterarValorLinha = (linhaId: string, novoValor: number) => {
    setLinhasPagamento(prev => prev.map(l => l.id === linhaId ? { ...l, valor: novoValor } : l));
  };

  const handleAlterarEntregueLinha = (linhaId: string, valorEntregue: number) => {
    setLinhasPagamento(prev => prev.map(l => l.id === linhaId ? { ...l, valor_entregue: valorEntregue } : l));
  };

  const handleAlterarParcelasLinha = (linhaId: string, parcelas: number) => {
    setLinhasPagamento(prev => prev.map(l => l.id === linhaId ? { ...l, parcelas } : l));
  };

  // Botão "Salvar" (previsão)
  const handleSalvar = async () => {
    const linhasValidas = linhasPagamento.filter(l => Number(l.valor) > 0);
    if (linhasValidas.length === 0) {
      setErroMsg('Informe ao menos uma forma de pagamento com valor maior que zero.');
      return;
    }

    setSalvando(true);
    setErroMsg(null);
    try {
      if (onSalvar) {
        await onSalvar(linhasValidas);
      } else {
        const dataIso = obterDataOperacaoISO();
        if (!ehModoCaderneta && SyncService.isUuidValido(pedSeguro.id)) {
          await supabase.from('pedidos_pagamentos_previstos').delete().eq('pedido_id', pedSeguro.id);

          const previstosDb = await Promise.all(linhasValidas.map(async (l) => {
            const fpRealId = await SyncService.resolverFormaPagamentoId(loja?.id || '', l.forma_pagamento_id, l.forma_tipo);
            return {
              pedido_id: pedSeguro.id,
              forma_pagamento_id: fpRealId,
              forma_tipo: l.forma_tipo,
              forma_nome: l.forma_nome,
              valor: Number(l.valor),
              valor_entregue: l.valor_entregue != null && Number(l.valor_entregue) > 0 ? Number(l.valor_entregue) : null,
              parcelas: l.parcelas || 1,
              data_prevista: dataIso
            };
          }));

          const { error: errPag } = await supabase.from('pedidos_pagamentos_previstos').insert(previstosDb);
          if (errPag) throw errPag;
        }

        audioService.playBeep();
        onPagamentoConcluido(pedSeguro);
        onClose();
      }
    } catch (err: any) {
      console.error('Erro ao salvar previsão de pagamento:', err);
      setErroMsg(err.message || 'Erro ao salvar formas de pagamento.');
    } finally {
      setSalvando(false);
    }
  };

  // Submissão oficial de pagamento
  const handleConfirmarPagamento = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroMsg(null);

    if (freteADefinir) {
      setErroMsg('Para efetuar o pagamento, primeiro é necessário definir a opção de frete.');
      return;
    }

    const linhasAtivas = linhasPagamento.filter(l => Number(l.valor) > 0);
    if (linhasAtivas.length === 0) {
      setErroMsg('Informe ao menos uma forma de pagamento com valor válido.');
      return;
    }

    if (linhasAtivas.some(l => !l.forma_tipo || !l.forma_pagamento_id)) {
      setErroMsg('Por favor, selecione uma forma de pagamento para prosseguir.');
      return;
    }

    if (!presencialPermitido && linhasAtivas.some(l => l.forma_tipo === 'dinheiro' || l.forma_tipo === 'cartao_debito' || l.forma_tipo === 'cartao_credito')) {
      setErroMsg('Para entregas terceirizadas (Uber Direct, Correios, etc.), os meios presenciais na entrega não estão disponíveis. Selecione um meio digital.');
      return;
    }

    if (Math.abs(diferencaPagamento) > 0.01) {
      if (diferencaPagamento > 0) {
        setErroMsg(`Faltam ${formatarMoeda(diferencaPagamento)} para completar o total.`);
      } else {
        setErroMsg(`O total das formas excede o valor a pagar em ${formatarMoeda(Math.abs(diferencaPagamento))}.`);
      }
      return;
    }

    setProcessando(true);

    try {
      const dataIso = obterDataOperacaoISO();

      const valorFiadoRecebimento = linhasAtivas
        .filter(l => l.forma_tipo === 'fiado' || (l.forma_nome || '').toLowerCase().includes('fiado'))
        .reduce((acc, l) => acc + Number(l.valor || 0), 0);

      const valorCadernetaRecebimento = linhasAtivas
        .filter(l => l.forma_tipo === 'caderneta' || (l.forma_nome || '').toLowerCase().includes('caderneta'))
        .reduce((acc, l) => acc + Number(l.valor || 0), 0);

      const temFiado = valorFiadoRecebimento > 0;
      const temCaderneta = valorCadernetaRecebimento > 0;

      // Segurança Financeira: Meios manuais / presenciais não transitam para 'pago' pelo catálogo
      const temPagamentoManualOuPresencial = linhasAtivas.some(l => 
        l.forma_tipo === 'pix' || 
        l.forma_tipo === 'dinheiro' || 
        l.forma_tipo === 'cartao_debito' || 
        l.forma_tipo === 'cartao_credito' ||
        l.forma_tipo === 'mercado_pago'
      );

      const cliIdEfetivo = pedSeguro.cliente_id || clienteProp?.id;

      // 1. Grava previsão de pagamento detalhada (apenas para pedidos reais com UUID)
      if (!ehModoCaderneta && SyncService.isUuidValido(pedSeguro.id)) {
        await supabase.from('pedidos_pagamentos_previstos').delete().eq('pedido_id', pedSeguro.id);
        const previstosDb = await Promise.all(linhasAtivas.map(async (linha) => {
          let fpRealId = linha.forma_pagamento_id;
          if (!fpRealId || !SyncService.isUuidValido(fpRealId) || String(fpRealId).startsWith('fp_')) {
            fpRealId = await SyncService.resolverFormaPagamentoId(loja?.id || '', linha.forma_pagamento_id, linha.forma_tipo);
          }
          return {
            pedido_id: pedSeguro.id,
            forma_pagamento_id: fpRealId,
            forma_tipo: linha.forma_tipo,
            forma_nome: linha.forma_nome,
            valor: linha.valor,
            valor_entregue: linha.valor_entregue != null && Number(linha.valor_entregue) > 0 ? Number(linha.valor_entregue) : null,
            parcelas: linha.parcelas || 1,
            data_prevista: dataIso
          };
        }));
        await supabase.from('pedidos_pagamentos_previstos').insert(previstosDb);
      }

      // Se for liquidação de caderneta, registra o abatimento/pagamento via CadernetaService
      if (ehModoCaderneta && cliIdEfetivo && loja?.id) {
        for (const linha of linhasAtivas) {
          let fpRealId = linha.forma_pagamento_id;
          if (!fpRealId || !SyncService.isUuidValido(fpRealId) || String(fpRealId).startsWith('fp_')) {
            fpRealId = await SyncService.resolverFormaPagamentoId(loja.id, linha.forma_pagamento_id, linha.forma_tipo);
          }
          await CadernetaService.registrarPagamentoCaderneta({
            lojaId: loja.id,
            clienteId: cliIdEfetivo,
            valorPago: Number(linha.valor),
            formaPagamentoId: fpRealId,
            formaTipo: linha.forma_tipo,
            usuarioId: usuario?.id,
            observacoes: `Liquidação de caderneta via Catálogo (${linha.forma_nome})`
          });
        }
      }

      // 2. Se for Fiado ou Caderneta (com limite aprovado) na compra de produtos
      if (!ehModoCaderneta) {
        if (temCaderneta && cliIdEfetivo && loja?.id) {
          await CadernetaService.registrarCompraCaderneta({
            lojaId: loja.id,
            clienteId: cliIdEfetivo,
            pedidoId: pedSeguro.id,
            valor: valorCadernetaRecebimento,
            usuarioId: usuario?.id,
            numeroPedido: pedSeguro.numero_pedido
          });
        }

        if (temFiado && cliIdEfetivo && loja?.id) {
          const { data: clienteAtual } = await supabase
            .from('clientes')
            .select('saldo_devedor_fiado, limite_credito')
            .eq('id', cliIdEfetivo)
            .eq('loja_id', loja.id)
            .single();

          const saldoAnt = Number(clienteAtual?.saldo_devedor_fiado || 0);
          const limAnt = Number(clienteAtual?.limite_credito || 0);
          const novoSaldo = Number((saldoAnt + valorFiadoRecebimento).toFixed(2));
          const novoLim = Math.max(0, Number((limAnt - valorFiadoRecebimento).toFixed(2)));

          await supabase
            .from('clientes')
            .update({ saldo_devedor_fiado: novoSaldo, limite_credito: novoLim })
            .eq('id', cliIdEfetivo)
            .eq('loja_id', loja.id);

          await supabase.from('movimentacoes_saldo_cliente').insert([{
            loja_id: loja.id,
            cliente_id: cliIdEfetivo,
            tipo: 'debito_venda',
            valor: valorFiadoRecebimento,
            saldo_anterior: saldoAnt,
            saldo_posterior: novoSaldo,
            observacao: `Faturamento Fiado via Catálogo Pedido #${pedSeguro.numero_pedido}`,
            usuario_id: null
          }]);
        }
      }

      // 3. Atualizar status do pedido (somente para pedidos reais com UUID)
      const statusPagamentoFinal: StatusPagamento = temCaderneta
        ? 'caderneta'
        : temFiado
        ? 'fiado'
        : 'aguardando_pagamento'; // NUNCA 'pago' pelo catálogo para meios manuais!

      let pedUpd: any = null;
      if (!ehModoCaderneta && SyncService.isUuidValido(pedSeguro.id)) {
        const lojaIdEfetivo = loja?.id || pedSeguro.loja_id;
        const linhaDinheiro = linhasAtivas.find(l => l.forma_tipo === 'dinheiro');
        const trocoParaDinheiro = linhaDinheiro && Number(linhaDinheiro.valor_entregue) > 0 ? Number(linhaDinheiro.valor_entregue) : null;

        const updatePayload: Record<string, any> = {
          status_pagamento: statusPagamentoFinal,
          atualizado_em: dataIso
        };
        if (trocoParaDinheiro !== null) {
          updatePayload.troco_para = trocoParaDinheiro;
        }

        const { data, error: erroUpd } = await supabase
          .from('pedidos')
          .update(updatePayload)
          .eq('id', pedSeguro.id)
          .eq('loja_id', lojaIdEfetivo)
          .select(`
            *,
            cliente:clientes(*),
            vendedor:usuarios_loja!pedidos_vendedor_id_fkey(*),
            itens:itens_pedido(*),
            pagamentos:pagamentos_pedido(*)
          `)
          .single();

        if (erroUpd) throw erroUpd;
        pedUpd = data;
      }

      audioService.playNewOrderSound();

      // Redirecionamento Mercado Pago se selecionado
      const temMercadoPago = linhasAtivas.some(l => l.forma_tipo === 'mercado_pago');
      if (temMercadoPago && loja) {
        try {
          const emailEfetivo = clientePedidoMemo?.email || dadosClienteFresco?.email || undefined;
          const itensPreference = (pedSeguro.itens || []).map((it: any) => ({
            titulo: it.nome_produto || 'Produto',
            quantidade: it.quantidade || 1,
            precoUnitario: it.preco_venda_unitario || 0
          }));

          if (itensPreference.length === 0) {
            itensPreference.push({
              titulo: ehModoCaderneta ? 'Liquidação de Caderneta' : `Pedido #${pedSeguro.numero_pedido || ''}`,
              quantidade: 1,
              precoUnitario: Number(pedSeguro.valor_total || valorTotal || 0)
            });
          }

          if (Number(pedSeguro.valor_frete || 0) > 0) {
            itensPreference.push({
              titulo: 'Frete / Entrega',
              quantidade: 1,
              precoUnitario: Number(pedSeguro.valor_frete || 0)
            });
          }

          const linkRes = await paymentGatewayService.gerarLinkMercadoPago({
            loja,
            itens: itensPreference,
            pedidoNumero: pedSeguro.numero_pedido || 0,
            clienteEmail: emailEfetivo
          });

          if (linkRes.sucesso && linkRes.linkPagamento) {
            window.location.href = linkRes.linkPagamento;
            return;
          }
        } catch (mpErr) {
          console.warn('Aviso ao gerar link Mercado Pago:', mpErr);
        }
      }

      setSucessoConfig({
        titulo: ehModoCaderneta
          ? 'Liquidação de Caderneta Registrada!'
          : temFiado
          ? 'Pedido Registrado no Fiado!'
          : temCaderneta
          ? 'Compra na Caderneta Confirmada!'
          : 'Opção de Pagamento Registrada!',
        mensagem: ehModoCaderneta
          ? (temPagamentoManualOuPresencial
            ? 'Sua solicitação de pagamento foi registrada e será conferida pelo estabelecimento.'
            : `O valor de ${formatarMoeda(totalLinhasPagamento)} foi abatido da sua conta caderneta.`)
          : (temPagamentoManualOuPresencial
            ? 'Sua escolha foi registrada. O pagamento será conferido e confirmado pelo lojista.'
            : `O valor de ${formatarMoeda(totalLinhasPagamento)} foi lançado na sua conta.`),
        aguardandoConferencia: temPagamentoManualOuPresencial
      });

      const objAtualizado = (pedUpd as unknown as Pedido) || { ...pedSeguro, status_pagamento: statusPagamentoFinal };
      setPedidoAtualizado(objAtualizado);
      setSucessoModal(true);
      onPagamentoConcluido(objAtualizado);
    } catch (err: any) {
      console.error('Erro ao registrar pagamento:', err);
      setErroMsg(err.message || 'Erro ao processar pagamento. Tente novamente.');
    } finally {
      setProcessando(false);
    }
  };

  const handleFecharTudo = () => {
    setSucessoModal(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[75] animate-in fade-in overflow-y-auto">
      <div className={`border rounded-3xl w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 my-6 max-h-[92vh] overflow-y-auto ${
        isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* MODAL DE SUCESSO / FEEDBACK */}
        {sucessoModal ? (
          <div className="py-6 px-2 text-center space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto border border-emerald-500/30">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="font-black text-lg text-slate-900 dark:text-white">
                {sucessoConfig?.titulo || 'Pagamento Registrado!'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-sm mx-auto leading-relaxed">
                {sucessoConfig?.mensagem || 'Operação realizada com sucesso.'}
              </p>
            </div>

            {sucessoConfig?.aguardandoConferencia && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-[11px] text-amber-700 dark:text-amber-300 font-medium max-w-sm mx-auto">
                ⏳ Pedido aguardando conferência do pagamento pelo estabelecimento.
              </div>
            )}

            <button
              type="button"
              onClick={handleFecharTudo}
              className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer"
            >
              Concluir e Voltar
            </button>
          </div>
        ) : (
          <form onSubmit={handleConfirmarPagamento} className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20 shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">
                    {ehModoCaderneta ? 'Liquidar Caderneta' : `Pagamento • Pedido #${pedSeguro.numero_pedido || ''}`}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {ehModoCaderneta ? 'Selecione a forma de pagamento para abater seu saldo' : 'Selecione o meio de pagamento para concluir seu pedido'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Alerta de Erro */}
            {erroMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{erroMsg}</span>
              </div>
            )}

            {/* Aviso Informativo de Frete Terceirizado */}
            {ehFreteTerceirizado && !ehRetirada && !ehModoCaderneta && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2.5 text-xs text-amber-700 dark:text-amber-300 animate-in fade-in">
                <Truck className="w-4 h-4 shrink-0 text-amber-500" />
                <span className="leading-relaxed">
                  Entrega terceirizada ({transpNomeFrete || nomeAppFrete || 'Uber Direct / Transportadora'}). Pagamento presencial na entrega indisponível; selecione um meio digital (PIX ou Mercado Pago).
                </span>
              </div>
            )}

            {/* Meios de Pagamento (Sem Scroll Forçado) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  Meios de Pagamento ({linhasPagamento.length}):
                </span>
                <span className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Permite dividir o total em vários meios
                </span>
              </div>

              {linhasPagamento.map((linha, idx) => (
                <div
                  key={linha.id}
                  className={`p-3.5 rounded-2xl border space-y-2.5 shadow-xs ${
                    isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-[10px] font-black">
                        {idx + 1}
                      </span>
                      Pagamento #{idx + 1}
                    </span>
                    {linhasPagamento.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoverLinha(linha.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition cursor-pointer"
                        title="Remover este pagamento"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Seleção da Forma de Pagamento */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {formasDisponiveis.map((fp: FormaPagamento) => {
                      const estaSelecionado = Boolean(
                        (linha.forma_pagamento_id && linha.forma_pagamento_id === fp.id) ||
                        (linha.forma_tipo && linha.forma_tipo === fp.tipo)
                      );
                      const ehPresencial = fp.tipo === 'dinheiro' || fp.tipo === 'cartao_debito' || fp.tipo === 'cartao_credito';
                      const textoContextual = ehPresencial
                        ? (ehRetirada ? 'Pagamento na retirada' : 'Pagamento na entrega')
                        : null;

                      return (
                        <button
                          key={fp.id}
                          type="button"
                          onClick={() => handleAlterarFormaLinha(linha.id, fp)}
                          className={`p-2 rounded-xl border text-[11px] font-bold flex flex-col items-start gap-1 transition cursor-pointer active:scale-95 text-left ${
                            estaSelecionado
                              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/40 shadow-xs'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 w-full">
                            {fp.tipo === 'dinheiro' && <Banknote className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                            {fp.tipo === 'pix' && <Zap className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />}
                            {fp.tipo === 'mercado_pago' && <CreditCard className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />}
                            {fp.tipo === 'cartao_debito' && <CreditCard className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
                            {fp.tipo === 'cartao_credito' && <CreditCard className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />}
                            {fp.tipo === 'fiado' && <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                            {fp.tipo === 'caderneta' && <BookOpen className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                            <span className="truncate">{fp.nome}</span>
                          </div>
                          {textoContextual && (
                            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 leading-tight">
                              {textoContextual}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Valor do Pagamento */}
                  <div className={`flex items-center justify-between gap-2 pt-1 border-t ${
                    isDark ? 'border-slate-800' : 'border-slate-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs sm:text-sm font-extrabold ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>Valor a pagar:</span>
                      {(() => {
                        const somaOutras = linhasPagamento.filter(l => l.id !== linha.id).reduce((acc, l) => acc + (Number(l.valor) || 0), 0);
                        const restanteParaEstaLinha = Number((saldoDevedorAtual - somaOutras).toFixed(2));
                        if (restanteParaEstaLinha > 0 && Math.abs(linha.valor - restanteParaEstaLinha) > 0.01) {
                          return (
                            <button
                              type="button"
                              onClick={() => handleAlterarValorLinha(linha.id, restanteParaEstaLinha)}
                              className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-extrabold cursor-pointer"
                              title="Preencher com o saldo restante"
                            >
                              + Restante ({formatarMoeda(restanteParaEstaLinha)})
                            </button>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <div className={`flex items-center gap-1.5 border rounded-xl px-3 py-1.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 shadow-2xs ${
                      isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
                    }`}>
                      <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">R$</span>
                      <MoneyInput
                        inputRef={idx === 0 ? inputPrimeiroValorRef : undefined}
                        autoFocus={idx === 0}
                        valor={linha.valor}
                        onChange={(novoValor) => handleAlterarValorLinha(linha.id, novoValor)}
                        placeholder="0,00"
                        className={`w-32 bg-transparent text-right text-base sm:text-lg font-black focus:outline-none placeholder:text-slate-400 ${
                          isDark ? 'text-white' : 'text-slate-900'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Dinheiro: Troco */}
                  {linha.forma_tipo === 'dinheiro' && (
                    <div className={`space-y-2 pt-2 border-t text-xs ${
                      isDark ? 'border-slate-800' : 'border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs sm:text-sm font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Valor Entregue pelo Cliente:</span>
                        <div className={`flex items-center gap-1.5 border rounded-xl px-3 py-1.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 shadow-2xs ${
                          isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
                        }`}>
                          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">R$</span>
                          <MoneyInput
                            valor={linha.valor_entregue != null && linha.valor_entregue > 0 ? linha.valor_entregue : 0}
                            onChange={(novoValor) => handleAlterarEntregueLinha(linha.id, novoValor)}
                            placeholder="0,00"
                            className={`w-32 bg-transparent text-right text-base sm:text-lg font-black focus:outline-none placeholder:text-slate-400 ${
                              isDark ? 'text-white' : 'text-slate-900'
                            }`}
                          />
                        </div>
                      </div>

                      {linha.valor_entregue != null && (
                        <div className={`flex items-center justify-between gap-2 pt-1.5 border-t ${
                          isDark ? 'border-slate-800' : 'border-slate-200'
                        }`}>
                          <span className={`text-xs sm:text-sm font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Troco a devolver:</span>
                          <div className={`flex items-center gap-1.5 border rounded-xl px-3 py-1.5 ${
                            isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
                          }`}>
                            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">R$</span>
                            <span className={`w-32 text-right text-base sm:text-lg font-black ${
                              linha.valor_entregue >= linha.valor ? 'text-emerald-600 dark:text-emerald-400' : (isDark ? 'text-slate-400' : 'text-slate-500')
                            }`}>
                              {formatarValorBRL(Math.max(0, linha.valor_entregue - linha.valor))}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* PIX: Card Limpo e Ações */}
                  {linha.forma_tipo === 'pix' && (
                    <div className={`p-3.5 rounded-2xl border space-y-3 text-xs ${
                      isDark ? 'bg-slate-900/60 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                    }`}>
                      <div className="flex items-center justify-between font-bold text-cyan-600 dark:text-cyan-400">
                        <span className="flex items-center gap-1.5 text-xs sm:text-sm font-extrabold">
                          <Zap className="w-4 h-4 shrink-0" />
                          <span>Pagamento via PIX</span>
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          Transferência Instantânea
                        </span>
                      </div>

                      {/* Toast / Alerta de Confirmação de Cópia */}
                      {toastPixMsg && (
                        <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-1 shadow-2xs">
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <span>{toastPixMsg}</span>
                        </div>
                      )}

                      {/* Botão Principal em Destaque: Pix Copia e Cola */}
                      {pixCopiaCola && (
                        <div className="space-y-1.5">
                          <button
                            type="button"
                            onClick={handleCopiarPix}
                            className="w-full py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer active:scale-98 shadow-md shadow-cyan-600/20"
                          >
                            <Copy className="w-4 h-4" />
                            <span>{pixCopiado ? '✓ Código Pix Copiado!' : 'Copiar Código Pix Copia e Cola'}</span>
                          </button>
                          <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 font-medium">
                            Cole no seu banco na opção <strong>Pix Copia e Cola</strong> (valor já preenchido)
                          </p>
                        </div>
                      )}

                      {/* Botão Secundário: Copiar Chave da Loja */}
                      {chavePixFormatada && (
                        <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                          <div className="truncate">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">Chave Pix da Loja</span>
                            <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 select-all">{chavePixFormatada}</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleCopiarChavePix}
                            className="shrink-0 px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>{chavePixCopiada ? 'Chave Copiada!' : 'Copiar Chave'}</span>
                          </button>
                        </div>
                      )}

                      <div className="space-y-1.5 pt-1 border-t border-slate-200 dark:border-slate-800">
                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block">
                          Comprovante de Pagamento (opcional):
                        </span>
                        <div className="flex items-center gap-2">
                          <label className="flex-1 py-2 px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-cyan-500 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 text-xs flex items-center justify-center gap-1.5 cursor-pointer transition">
                            <Upload className="w-3.5 h-3.5 text-cyan-500" />
                            <span className="truncate">
                              {comprovanteArquivo ? comprovanteArquivo.name : 'Anexar comprovante...'}
                            </span>
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={handleAnexarComprovante}
                              className="hidden"
                            />
                          </label>
                          {comprovanteArquivo && (
                            <button
                              type="button"
                              onClick={() => setComprovanteArquivo(null)}
                              className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition cursor-pointer"
                              title="Remover comprovante"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Mercado Pago: Card Padronizado no Design System */}
                  {linha.forma_tipo === 'mercado_pago' && (
                    <div className={`p-3 rounded-2xl border space-y-2 text-xs ${
                      isDark ? 'bg-slate-900/60 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                    }`}>
                      <div className="flex items-center justify-between font-bold text-sky-600 dark:text-sky-400">
                        <span className="flex items-center gap-1.5">
                          <CreditCard className="w-4 h-4 shrink-0" />
                          <span>Mercado Pago Online</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                          Aprovação Automática
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                        Pague com Pix dinâmico ou Cartão de Crédito. A confirmação do pagamento é processada automaticamente pelo Mercado Pago.
                      </p>
                    </div>
                  )}

                  {/* Cartão de Crédito: Parcelas */}
                  {linha.forma_tipo === 'cartao_credito' && (
                    <div className={`flex items-center justify-between gap-2 pt-1.5 border-t text-xs ${
                      isDark ? 'border-slate-800' : 'border-slate-200'
                    }`}>
                      <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>Número de Parcelas:</span>
                      <select
                        value={linha.parcelas || 1}
                        onChange={(e) => handleAlterarParcelasLinha(linha.id, parseInt(e.target.value, 10) || 1)}
                        className={`border rounded-xl px-2.5 py-1 text-xs font-bold focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none cursor-pointer ${
                          isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(p => (
                          <option key={p} value={p}>
                            {p}x {linha.valor > 0 ? `de ${formatarMoeda(linha.valor / p)}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Fiado: Card Limpo e Harmônico */}
                  {linha.forma_tipo === 'fiado' && (
                    <div className={`p-3.5 rounded-2xl border space-y-2 text-xs ${
                      isDark
                        ? 'bg-slate-900/60 border-slate-800 text-slate-100'
                        : 'bg-white border-slate-200 text-slate-800'
                    }`}>
                      <div className={`flex items-center justify-between ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
                        <span className="font-medium flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Cliente Fiado:</span>
                        </span>
                        <span className={`font-semibold truncate max-w-[200px] ${
                          isDark ? 'text-slate-100' : 'text-slate-900'
                        }`}>
                          {clientePedidoMemo?.nome || pedSeguro.cliente?.nome || 'Nenhum selecionado'}
                        </span>
                      </div>
                      <div className={`flex justify-between items-center ${
                        isDark ? 'text-slate-300' : 'text-slate-800'
                      }`}>
                        <span className="font-medium">Limite de Crédito Disponível:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {formatarMoeda(Number(clientePedidoMemo?.limite_credito || pedSeguro.cliente?.limite_credito || 0))}
                        </span>
                      </div>
                      {linha.valor > Number(clientePedidoMemo?.limite_credito || pedSeguro.cliente?.limite_credito || 0) && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold">
                          ⚠️ Valor informado excede o limite disponível de {formatarMoeda(Number(clientePedidoMemo?.limite_credito || pedSeguro.cliente?.limite_credito || 0))}.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Caderneta: Card Limpo e Harmônico */}
                  {linha.forma_tipo === 'caderneta' && (
                    <div className={`p-3.5 rounded-2xl border space-y-2 text-xs ${
                      isDark
                        ? 'bg-slate-900/60 border-slate-800 text-slate-100'
                        : 'bg-white border-slate-200 text-slate-800'
                    }`}>
                      <div className={`flex items-center justify-between ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
                        <span className="font-medium flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Caderneta Mensal:</span>
                        </span>
                        <span className={`font-semibold truncate max-w-[200px] ${
                          isDark ? 'text-slate-100' : 'text-slate-900'
                        }`}>
                          {clientePedidoMemo?.nome || pedSeguro.cliente?.nome || 'Nenhum selecionado'}
                        </span>
                      </div>
                      <div className={`flex justify-between items-center ${
                        isDark ? 'text-slate-300' : 'text-slate-800'
                      }`}>
                        <span className="font-medium">Saldo Devedor Atual:</span>
                        <span className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                          {formatarMoeda(Number(clientePedidoMemo?.saldo_devedor_caderneta || (pedSeguro.cliente as any)?.saldo_devedor_caderneta || 0))}
                        </span>
                      </div>
                      <div className={`flex justify-between items-center ${
                        isDark ? 'text-slate-300' : 'text-slate-800'
                      }`}>
                        <span className="font-medium">Limite Disponível na Caderneta:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {formatarMoeda(limiteDisponivelCaderneta)}
                        </span>
                      </div>
                      <div className={`flex justify-between items-center ${
                        isDark ? 'text-slate-300' : 'text-slate-800'
                      }`}>
                        <span className="font-medium">Ciclo de Acerto / Vencimento:</span>
                        <span className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                          Todo dia {clientePedidoMemo?.dia_vencimento_caderneta || loja?.dia_vencimento_padrao_caderneta || 10}
                        </span>
                      </div>
                      {linha.valor > limiteDisponivelCaderneta && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold">
                          ⚠️ Valor informado excede o limite disponível de {formatarMoeda(limiteDisponivelCaderneta)}.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Botão Adicionar Outro Meio de Pagamento */}
              <button
                type="button"
                onClick={handleAdicionarLinha}
                className="w-full py-2.5 px-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500/60 bg-slate-50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98"
              >
                <Plus className="w-4 h-4" />
                <span>
                  Adicionar outro meio de pagamento {diferencaPagamento > 0 ? `(Faltam ${formatarMoeda(diferencaPagamento)})` : ''}
                </span>
              </button>
            </div>

            {/* Resumo de Conferência */}
            <div className={`p-4 rounded-2xl border space-y-2.5 shadow-2xs ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              {/* Subtotal dos Produtos / Saldo Devedor */}
              <div className="flex justify-between items-center">
                <span className={`text-xs sm:text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  {ehModoCaderneta ? 'Saldo Devedor na Caderneta:' : 'Subtotal dos Produtos:'}
                </span>
                <span className={`text-sm sm:text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {formatarMoeda(Number(pedSeguro.subtotal || (valorTotal - Number(pedSeguro.valor_frete || 0) + Number(pedSeguro.valor_desconto || 0))))}
                </span>
              </div>

              {/* Desconto (se houver e não for caderneta) */}
              {!ehModoCaderneta && Number(pedSeguro.valor_desconto || 0) > 0 && (
                <div className="flex justify-between items-center">
                  <span className={`text-xs sm:text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Desconto {pedSeguro.cupom_codigo ? `(Cupom: ${pedSeguro.cupom_codigo})` : 'Aplicado'}:
                  </span>
                  <span className="text-sm sm:text-base font-bold text-rose-600 dark:text-rose-400">
                    - {formatarMoeda(Number(pedSeguro.valor_desconto || 0))}
                  </span>
                </div>
              )}

              {/* Discriminação do Frete com Botão de Alteração (Apenas se não for caderneta) */}
              {!ehModoCaderneta && (
                <div className="flex justify-between items-center">
                  <span className={`flex items-center gap-1.5 text-xs sm:text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <Truck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Taxa de Entrega / Frete:</span>
                  </span>
                  {freteADefinir ? (
                    <button
                      type="button"
                      onClick={() => setModalDefinirEnvioAberto(true)}
                      className="px-2.5 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 text-xs font-bold border border-amber-500/30 flex items-center gap-1 transition cursor-pointer"
                    >
                      <span>Definir Frete</span>
                      <span className="text-[10px]">✏️</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`text-sm sm:text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {Number(pedSeguro.valor_frete || 0) === 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">Grátis</span>
                        ) : (
                          formatarMoeda(Number(pedSeguro.valor_frete || 0))
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => setModalDefinirEnvioAberto(true)}
                        className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                        title="Alterar opção de frete"
                      >
                        <span className="text-xs">✏️</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TOTAL DA VENDA */}
              <div className={`pt-2.5 border-t flex justify-between items-center ${
                isDark ? 'border-slate-800 text-white' : 'border-slate-200 text-slate-900'
              }`}>
                <span className="text-sm sm:text-base font-black">Total a Pagar:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-black text-base sm:text-lg">
                  {formatarMoeda(valorTotal)}
                </span>
              </div>

              {/* Já Quitado Anteriormente */}
              {valorJaPago > 0 && (
                <div className={`flex justify-between items-center pt-1.5 border-t border-dashed ${
                  isDark ? 'border-slate-800' : 'border-slate-200'
                }`}>
                  <span className={`text-xs sm:text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Já Quitado Anteriormente:
                  </span>
                  <span className="text-sm sm:text-base font-bold text-emerald-600 dark:text-emerald-400">
                    {formatarMoeda(valorJaPago)}
                  </span>
                </div>
              )}

              {/* Total Informado */}
              <div className={`flex justify-between items-center pt-1.5 border-t border-dashed ${
                isDark ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <span className={`text-xs sm:text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Total dos Meios Informados:
                </span>
                <span className={`text-sm sm:text-base font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {formatarMoeda(totalLinhasPagamento)}
                </span>
              </div>

              {/* Total Conferido / Diferença */}
              <div className={`flex justify-between items-center pt-1.5 border-t ${
                isDark ? 'border-slate-800/80' : 'border-slate-200'
              }`}>
                {Math.abs(diferencaPagamento) < 0.01 ? (
                  <>
                    <span className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      Total Conferido (100%):
                    </span>
                    <span className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400">
                      R$ 0,00
                    </span>
                  </>
                ) : diferencaPagamento > 0 ? (
                  <>
                    <span className="text-xs sm:text-sm font-bold text-amber-700 dark:text-amber-400">
                      Restante a Definir:
                    </span>
                    <span className="text-sm sm:text-base font-black text-amber-700 dark:text-amber-400">
                      {formatarMoeda(diferencaPagamento)}
                    </span>
                  </>
                ) : null}
              </div>
            </div>

            {/* Botões de Rodapé: [ Cancelar ], [ Salvar ] e [ Confirmar Pagamento ] */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleFecharTudo}
                className={`py-3 px-3 rounded-2xl font-bold text-xs border transition cursor-pointer shadow-xs ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                }`}
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={salvando || processando || totalLinhasPagamento <= 0}
                onClick={handleSalvar}
                className={`flex-1 py-3 px-3 rounded-2xl font-bold text-xs border shadow-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                  isDark
                    ? 'bg-slate-900 hover:bg-slate-800 text-emerald-400 border-emerald-500/40'
                    : 'bg-white hover:bg-slate-50 text-emerald-700 border-emerald-300'
                }`}
              >
                {salvando ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                ) : (
                  <Save className="w-4 h-4 text-emerald-500" />
                )}
                <span>Salvar</span>
              </button>

              <button
                type="submit"
                disabled={processando || salvando || freteADefinir || totalLinhasPagamento <= 0 || Math.abs(diferencaPagamento) > 0.01 || linhasPagamento.some(l => Number(l.valor) <= 0 || !l.forma_tipo)}
                className="flex-[2] py-3 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer active:scale-98"
              >
                {processando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="truncate">Confirmar Pagamento</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Modal de Definição de Envio com modoCatalogo=true (Apenas para pedidos reais) */}
        {modalDefinirEnvioAberto && pedSeguro && !ehModoCaderneta && (
          <ModalDefinirEnvio
            isOpen={modalDefinirEnvioAberto}
            modoCatalogo={true}
            pedido={pedSeguro}
            loja={loja}
            usuario={usuario}
            onClose={() => setModalDefinirEnvioAberto(false)}
            onConfirmarEnvio={async (resultado) => {
              try {
                await ShippingOrchestrator.definirEnvioPedido(
                  pedSeguro.id,
                  resultado,
                  usuario?.id || null
                );
                await recarregarPedido();
                setModalDefinirEnvioAberto(false);
              } catch (err: any) {
                console.error('Erro ao confirmar frete no fechamento:', err);
                setErroMsg(err?.message || 'Erro ao definir opção de frete.');
              }
            }}
            onSucesso={async () => {
              setModalDefinirEnvioAberto(false);
              await recarregarPedido();
            }}
          />
        )}
      </div>
    </div>
  );
};
