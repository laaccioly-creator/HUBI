import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  CreditCard,
  Banknote,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Printer,
  Plus,
  Trash2,
  Save,
  FileText,
  Truck,
  AlertTriangle,
  BookOpen,
  Copy,
  Check,
  Paperclip,
  ShoppingBag
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Pedido, FormaPagamento, StatusPagamento, TipoPagamento, Loja, Cliente } from '../types';
import { PrintService } from '../services/printService';
import { SyncService } from '../services/syncService';
import { audioService } from '../services/audioService';
import { caixaService } from '../services/caixaService';
import { CadernetaService } from '../services/cadernetaService';
import { obterDataOperacaoISO } from '../utils/dataOperacao';
import { formatarMoeda, formatarValorBRL } from '../utils/formatters';
import { gerarPayloadPixEmv } from '../utils/pixUtils';
import { ModalDefinirEnvio } from './pedidos/ModalDefinirEnvio';
import { ShippingOrchestrator } from '../services/shippingOrchestrator';

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

export interface ModalPagamentoFechamentoProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido | null;
  onPagamentoConcluido: (pedidoAtualizado?: Pedido) => void;
  concluirAoQuitar?: boolean;
  onSalvar?: (linhas: LinhaPagamentoRecebimento[]) => Promise<void>;
  loja?: Loja | null;
  origem?: 'pdv' | 'catalogo' | 'caderneta';
  cliente?: Cliente | null;
  saldoDevedorAvulso?: number;
}

export const ModalPagamentoFechamento: React.FC<ModalPagamentoFechamentoProps> = ({
  isOpen,
  onClose,
  pedido,
  onPagamentoConcluido,
  concluirAoQuitar = false,
  onSalvar,
  loja: lojaProp,
  origem = 'pdv',
  cliente: clienteProp,
  saldoDevedorAvulso
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
  const [comprovanteArquivo, setComprovanteArquivo] = useState<File | null>(null);
  const [comprovanteDataUrl, setComprovanteDataUrl] = useState<string | null>(null);
  const [pedidoAtualizado, setPedidoAtualizado] = useState<Pedido | null>(null);
  const [pedidoLocal, setPedidoLocal] = useState<Pedido | null>(pedido);
  const [modalDefinirEnvioAberto, setModalDefinirEnvioAberto] = useState<boolean>(false);
  const inputPrimeiroValorRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPedidoLocal(pedido);
  }, [pedido]);

  const recarregarPedido = async () => {
    if (!pedido?.id || !loja?.id) return;
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
        .eq('id', pedido.id)
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
    { id: `fp_dinheiro_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Dinheiro', tipo: 'dinheiro', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_pix_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'PIX', tipo: 'pix', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_mercado_pago_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Mercado Pago', tipo: 'mercado_pago', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_mercado_livre_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Mercado Livre', tipo: 'mercado_livre', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_credito_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Cartão de Crédito', tipo: 'cartao_credito', taxa_percentual: 3.2, taxa_fixa: 0, maximo_parcelas: 12, ativo: true, exibir_catalogo: true },
    { id: `fp_debito_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Cartão de Débito', tipo: 'cartao_debito', taxa_percentual: 1.5, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
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

        const pagCfg = loja?.configuracoes_extras?.pagamentos;
        const pagDigitais = loja?.configuracoes_extras?.pagamentos_digitais;
        const cadernetaAtivaLoja = Boolean(loja?.caderneta_ativa ?? pagCfg?.caderneta_ativa);
        const fiadoAtivoLoja = !cadernetaAtivaLoja && Boolean(pagCfg?.permitir_fiado ?? true);

        const metodoPermitidoNaLoja = (fp: FormaPagamento) => {
          const t = (fp.tipo || '').toLowerCase();
          if (t === 'pix') return pagCfg?.pix_ativo !== false;
          if (t === 'dinheiro') return pagCfg?.dinheiro_ativo !== false;
          if (t === 'cartao_debito') return pagCfg?.debito_ativo !== false;
          if (t === 'cartao_credito') return pagCfg?.credito_ativo !== false;
          if (t === 'mercado_pago') return true;
          if (t === 'mercado_livre') return true;
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
          // Assegura que Fiado esteja na lista se a loja permitir
          if (fiadoAtivoLoja && !lista.some(f => f.tipo === 'fiado')) {
            const fiadoPadrao = FORMAS_PADRAO.find(f => f.tipo === 'fiado');
            if (fiadoPadrao) lista = [...lista, fiadoPadrao];
          }
          // Assegura que Caderneta esteja na lista se a loja tiver caderneta ativa
          if (cadernetaAtivaLoja && !lista.some(f => f.tipo === 'caderneta')) {
            const cadernetaPadrao = FORMAS_PADRAO.find(f => f.tipo === 'caderneta');
            if (cadernetaPadrao) lista = [...lista, cadernetaPadrao];
          }
          // Assegura que Mercado Pago e Mercado Livre estejam sempre disponíveis para pagamentos digitais / online
          if (!lista.some(f => f.tipo === 'mercado_pago')) {
            const mpPadrao = FORMAS_PADRAO.find(f => f.tipo === 'mercado_pago');
            if (mpPadrao) lista = [...lista, mpPadrao];
          }
          if (!lista.some(f => f.tipo === 'mercado_livre')) {
            const mlPadrao = FORMAS_PADRAO.find(f => f.tipo === 'mercado_livre');
            if (mlPadrao) lista = [...lista, mlPadrao];
          }
        }
        setFormasPagamento(lista);
      } catch (err) {
        console.warn('Fallback formas de pagamento:', err);
        setFormasPagamento(FORMAS_PADRAO);
      }
    };

    buscarFormas();
  }, [loja?.id, loja?.caderneta_ativa, loja?.configuracoes_extras?.pagamentos, isOpen]);

  // Carrega dados frescos de crédito e caderneta do cliente
  const [dadosClienteFresco, setDadosClienteFresco] = useState<any>(null);

  useEffect(() => {
    if (!isOpen || !loja?.id) return;
    const cliId = pedido?.cliente_id || clienteProp?.id || (pedido as any)?.cliente?.id;
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
  }, [isOpen, loja?.id, pedido?.cliente_id, clienteProp?.id, (pedido as any)?.cliente?.id]);

  // Inicializar linhas de pagamento quando o modal abrir para um pedido ou dívida avulsa
  useEffect(() => {
    if ((pedido || saldoDevedorAvulso) && isOpen) {
      const valorTot = saldoDevedorAvulso != null && saldoDevedorAvulso > 0 ? saldoDevedorAvulso : Number(pedido?.valor_total || 0);
      const valorJaPago = pedido ? Number(pedido.valor_pago || 0) : 0;
      const saldoRestante = saldoDevedorAvulso != null && saldoDevedorAvulso > 0
        ? saldoDevedorAvulso
        : Math.max(0, Number(pedido?.saldo_devedor ?? (valorTot - valorJaPago)));
      const valorSugerido = saldoRestante > 0 ? saldoRestante : (valorTot > 0 ? valorTot : 0);

      const fpsDisponiveis = formasPagamento && formasPagamento.length > 0 ? formasPagamento : FORMAS_PADRAO;
      const fpInicial = fpsDisponiveis.find(f => f.tipo === 'dinheiro') || fpsDisponiveis[0];

      setLinhasPagamento([
        {
          id: `linha_${Date.now()}`,
          forma_pagamento_id: fpInicial.id,
          forma_tipo: fpInicial.tipo,
          forma_nome: fpInicial.nome,
          valor: Number(valorSugerido.toFixed(2)),
          valor_entregue: null,
          parcelas: 1
        }
      ]);

      setErroMsg(null);
      setSucessoModal(false);
      setSucessoConfig(null);
      setPedidoAtualizado(null);

      const timer = setTimeout(() => {
        if (inputPrimeiroValorRef.current) {
          inputPrimeiroValorRef.current.focus();
          inputPrimeiroValorRef.current.select();
        }
      }, 150);

      return () => clearTimeout(timer);
    }
  }, [pedido?.id, isOpen, saldoDevedorAvulso]);

  const clientePedidoMemo = dadosClienteFresco || clienteProp || pedidoLocal?.cliente || pedido?.cliente;

  const limiteDisponivelCaderneta = useMemo(() => {
    if (!clientePedidoMemo?.permite_caderneta) return 0;
    const limite = Number(clientePedidoMemo.limite_caderneta || 0);
    const saldoDevedor = Number(clientePedidoMemo.saldo_devedor_caderneta || 0);
    return Math.max(0, limite - saldoDevedor);
  }, [clientePedidoMemo]);

  const clienteAptoFiado = useMemo(() => {
    return Boolean(
      clientePedidoMemo?.id &&
      clientePedidoMemo.permite_fiado === true &&
      Number(clientePedidoMemo.limite_credito || 0) > 0
    );
  }, [clientePedidoMemo]);

  const clienteAptoCaderneta = useMemo(() => {
    return Boolean(
      loja?.caderneta_ativa &&
      clientePedidoMemo?.id &&
      clientePedidoMemo.permite_caderneta === true &&
      limiteDisponivelCaderneta > 0
    );
  }, [loja?.caderneta_ativa, clientePedidoMemo, limiteDisponivelCaderneta]);

  const pedAtivo = pedidoLocal || pedido;
  const rawPe = (pedAtivo as any)?.pedido_entrega || (Array.isArray((pedAtivo as any)?.pedido_entregas) ? (pedAtivo as any)?.pedido_entregas[0] : null);
  const meta = (pedAtivo as any)?.metadados || {};
  const metaTipo = String(meta.tipo_atendimento || '').toLowerCase();
  const peTipo = String(rawPe?.tipo_atendimento || '').toLowerCase();

  const ehRetirada = (
    peTipo === 'retirada' ||
    metaTipo === 'retirada' ||
    (pedAtivo as any)?.tipo_atendimento === 'retirada' ||
    String(pedAtivo?.endereco_entrega || '').toLowerCase().includes('retirada') ||
    rawPe?.provedor === 'retirada_loja'
  );

  const ehEnvio = !ehRetirada && (
    peTipo === 'entrega' ||
    metaTipo === 'entrega' ||
    (pedAtivo as any)?.tipo_entrega === 'envio' ||
    (pedAtivo as any)?.tipo_atendimento === 'entrega' ||
    Boolean(pedAtivo?.endereco_entrega)
  );

  const provedorFrete = (rawPe?.provedor || (pedAtivo as any)?.provedor_frete || '').toLowerCase();
  const transpNomeFrete = (rawPe?.transportadora_nome || pedAtivo?.nome_transportadora || '').toLowerCase();
  const servicoCorreiosFrete = (rawPe?.servico_correios || pedAtivo?.servico_correios || '').toLowerCase();
  const ehOperadoraExternaFrete = 
    provedorFrete === 'melhor_envio' ||
    provedorFrete === 'correios' ||
    Boolean(servicoCorreiosFrete) ||
    transpNomeFrete.includes('correios') ||
    transpNomeFrete.includes('sedex') ||
    transpNomeFrete.includes('pac') ||
    transpNomeFrete.includes('jadlog') ||
    transpNomeFrete.includes('azul cargo') ||
    transpNomeFrete.includes('loggi') ||
    transpNomeFrete.includes('latam');

  const presencialPermitido = ehRetirada || !ehOperadoraExternaFrete;

  const formasDisponiveis: FormaPagamento[] = useMemo(() => {
    const lista = formasPagamento.length > 0 ? formasPagamento : FORMAS_PADRAO;
    return lista
      .filter((fp: FormaPagamento) => {
        if (!fp.ativo) return false;

        if (origem === 'caderneta') {
          if (fp.tipo === 'fiado' || fp.tipo === 'caderneta') return false;
        }

        // Se a modalidade de envio não aceitar pagamento presencial (ex: frete externo Correios/transportadora), ocultar da lista
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

  const pedRaw = pedidoLocal || pedido;
  const valorTotal = saldoDevedorAvulso != null && saldoDevedorAvulso > 0
    ? saldoDevedorAvulso
    : Number(pedRaw?.valor_total || 0);
  const valorJaPago = pedido ? Number(pedRaw?.valor_pago || 0) : 0;
  const saldoDevedorAtual = saldoDevedorAvulso != null && saldoDevedorAvulso > 0
    ? saldoDevedorAvulso
    : Math.max(0, Number(pedRaw?.saldo_devedor ?? (valorTotal - valorJaPago)));

  // Ponto 12: Quando houver apenas 1 linha de pagamento (sem split), sincronizar automaticamente com o saldo devedor atualizado
  useEffect(() => {
    if (!isOpen || (!pedido && !saldoDevedorAvulso)) return;
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
  }, [isOpen, pedido, saldoDevedorAtual, saldoDevedorAvulso, linhasPagamento.length]);

  if (!isOpen || (!pedido && !saldoDevedorAvulso)) return null;

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

  const isFreteFormalizado = Boolean(
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

  const freteADefinir = ehEnvio && !isFreteFormalizado;

  const totalLinhasPagamento = linhasPagamento.reduce((acc, l) => acc + (Number(l.valor) || 0), 0);
  const diferencaPagamento = Number((saldoDevedorAtual - totalLinhasPagamento).toFixed(2));

  const clientePedido = pedSeguro?.cliente || clientePedidoMemo;

  const handleAdicionarLinha = () => {
    const somaAtual = linhasPagamento.reduce((acc, l) => acc + (Number(l.valor) || 0), 0);
    const valorRestanteSugerido = Math.max(0, Number((saldoDevedorAtual - somaAtual).toFixed(2)));
    const fpPadrao = formasDisponiveis.find((f: FormaPagamento) => f.tipo === 'pix') || formasDisponiveis[0];

    const novaLinha: LinhaPagamentoRecebimento = {
      id: `linha_${Date.now()}_${Math.random()}`,
      forma_pagamento_id: fpPadrao.id,
      forma_tipo: fpPadrao.tipo,
      forma_nome: fpPadrao.nome,
      valor: Number(valorRestanteSugerido.toFixed(2)),
      valor_entregue: null,
      parcelas: 1
    };

    setLinhasPagamento(prev => [...prev, novaLinha]);
  };

  const handleRemoverLinha = (idLinha: string) => {
    if (linhasPagamento.length <= 1) return;
    setLinhasPagamento(prev => prev.filter(l => l.id !== idLinha));
  };

  const handleAlterarFormaLinha = (idLinha: string, novaForma: FormaPagamento) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id === idLinha) {
        return {
          ...l,
          forma_pagamento_id: novaForma.id,
          forma_tipo: novaForma.tipo,
          forma_nome: novaForma.nome,
          valor_entregue: novaForma.tipo === 'dinheiro' ? l.valor_entregue : null,
          parcelas: novaForma.tipo === 'cartao_credito' ? (l.parcelas || 1) : 1
        };
      }
      return l;
    }));
  };

  const handleAlterarValorLinha = (idLinha: string, novoValor: number) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id === idLinha) {
        return { ...l, valor: Math.max(0, novoValor) };
      }
      return l;
    }));
  };

  const handleAlterarEntregueLinha = (idLinha: string, novoEntregue: number) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id === idLinha) {
        return { ...l, valor_entregue: Math.max(0, novoEntregue) };
      }
      return l;
    }));
  };

  const handleAlterarParcelasLinha = (idLinha: string, parcelas: number) => {
    setLinhasPagamento(prev => prev.map(l => {
      if (l.id === idLinha) {
        return { ...l, parcelas: Math.max(1, parcelas) };
      }
      return l;
    }));
  };

  const handleSalvarPrevisto = async () => {
    if (!pedido || !loja?.id) return;
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
        await supabase.from('pagamentos_pedido').delete().eq('pedido_id', pedSeguro.id);
        try {
          await supabase.from('pedidos_pagamentos_previstos').delete().eq('pedido_id', pedSeguro.id);
        } catch {}

        const pagamentosParaDb = await Promise.all(linhasValidas.map(async (l) => {
          const fpRealId = await SyncService.resolverFormaPagamentoId(loja.id, l.forma_pagamento_id, l.forma_tipo);
          return {
            loja_id: loja.id,
            pedido_id: pedSeguro.id,
            forma_pagamento_id: fpRealId,
            valor: Number(l.valor),
            parcelas: l.parcelas || 1,
            valor_taxa: 0,
            valor_liquido: Number(l.valor),
            data_pagamento: dataIso,
            eh_pagamento_fiado: l.forma_tipo === 'fiado'
          };
        }));

        const { error: errPag } = await supabase.from('pagamentos_pedido').insert(pagamentosParaDb);
        if (errPag) throw errPag;

        audioService.playBeep();
        onPagamentoConcluido(pedSeguro);
        onClose();
      }
    } catch (err: any) {
      console.error('Erro ao salvar formas de pagamento do pedido:', err);
      setErroMsg(err.message || 'Erro ao salvar formas de pagamento.');
    } finally {
      setSalvando(false);
    }
  };

  const handleConfirmarRecebimento = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroMsg(null);

    if (freteADefinir) {
      setErroMsg('Para efetuar o pagamento, primeiro é necessário definir a opção de frete.');
      return;
    }

    const linhasAtivas = linhasPagamento.filter(l => Number(l.valor) > 0);
    if (linhasAtivas.length === 0) {
      setErroMsg('Informe ao menos uma forma de pagamento com valor maior que zero.');
      return;
    }

    if (Math.abs(diferencaPagamento) > 0.01) {
      setErroMsg(`O total das formas de pagamento deve equivaler exatamente ao saldo devedor de R$ ${saldoDevedorAtual.toFixed(2)}.`);
      return;
    }

    // Validação de limite e elegibilidade da Caderneta
    const totalCaderneta = linhasAtivas
      .filter(l => l.forma_tipo === 'caderneta')
      .reduce((acc, l) => acc + Number(l.valor || 0), 0);

    if (totalCaderneta > 0) {
      if (!clientePedidoMemo?.permite_caderneta) {
        setErroMsg('O cliente vinculado a este pedido não possui permissão ativa para compra na Caderneta.');
        return;
      }
      if (totalCaderneta > limiteDisponivelCaderneta + 0.009) {
        setErroMsg(`O valor na Caderneta (${formatarMoeda(totalCaderneta)}) excede o limite disponível de ${formatarMoeda(limiteDisponivelCaderneta)}.`);
        return;
      }
    }

    setProcessando(true);

    try {
      const dataIso = obterDataOperacaoISO();
      const ehOperacaoCatalogo = origem === 'catalogo' || (pedSeguro.origem === 'catalogo_online' && !usuario);

      // CASO 1: Liquidação de Caderneta Avulsa
      if (origem === 'caderneta') {
        const primeiraLinha = linhasAtivas[0];
        const fpId = await SyncService.resolverFormaPagamentoId(loja?.id || '', primeiraLinha.forma_pagamento_id, primeiraLinha.forma_tipo);
        const cliId = pedSeguro.cliente_id || clienteProp?.id;
        if (!cliId || !loja?.id) {
          setErroMsg('Cliente não identificado para liquidação da caderneta.');
          return;
        }

        if (ehOperacaoCatalogo) {
          // Cliente pelo catálogo
          let urlComprovante: string | null = null;
          if (comprovanteDataUrl) {
            urlComprovante = comprovanteDataUrl;
          }
          const res = await CadernetaService.solicitarLiquidacaoCadernetaCatalogo({
            lojaId: loja.id,
            clienteId: cliId,
            valorSolicitado: totalLinhasPagamento,
            formaPagamentoId: fpId,
            formaTipo: primeiraLinha.forma_tipo,
            metodoNome: primeiraLinha.forma_nome,
            comprovanteUrl: urlComprovante
          });
          if (!res.sucesso) {
            setErroMsg(res.mensagem || 'Erro ao registrar solicitação de liquidação.');
            return;
          }
          setSucessoConfig({
            titulo: 'Solicitação de Liquidação Enviada!',
            mensagem: `Sua solicitação de ${formatarMoeda(totalLinhasPagamento)} via ${primeiraLinha.forma_nome} foi enviada para o lojista. O saldo e limite serão liberados assim que o lojista confirmar o recebimento.`,
            aguardandoConferencia: true
          });
        } else {
          // Lojista no PDV
          const res = await CadernetaService.registrarPagamentoCaderneta({
            lojaId: loja.id,
            clienteId: cliId,
            valorPago: totalLinhasPagamento,
            formaPagamentoId: fpId,
            formaTipo: primeiraLinha.forma_tipo,
            usuarioId: usuario?.id,
            observacoes: `Liquidação de caderneta via ${primeiraLinha.forma_nome}`
          });
          if (!res.sucesso) {
            setErroMsg(res.mensagem || 'Erro ao registrar liquidação da caderneta.');
            return;
          }
          setSucessoConfig({
            titulo: 'Liquidação da Caderneta Registrada!',
            mensagem: `O valor de ${formatarMoeda(totalLinhasPagamento)} foi abatido com sucesso e o limite de compras foi restabelecido.`,
            aguardandoConferencia: false
          });
        }

        setSucessoModal(true);
        onPagamentoConcluido();
        return;
      }

      // CASO 2: Catálogo Online com Pagamento Manual/Presencial (Pix manual, dinheiro ou cartão presencial)
      // REGRA DE SEGURANÇA FINANCEIRA: NÃO marca como pago, grava em pedidos_pagamentos_previstos e aguarda conferência
      const temPagamentoManualOuPresencial = linhasAtivas.some(l =>
        l.forma_tipo === 'dinheiro' ||
        l.forma_tipo === 'pix' ||
        l.forma_tipo === 'cartao_debito' ||
        l.forma_tipo === 'cartao_credito'
      );

      if (ehOperacaoCatalogo && temPagamentoManualOuPresencial) {
        // Gravar intenção em pedidos_pagamentos_previstos SEM alterar status_pagamento para 'pago'
        await supabase.from('pedidos_pagamentos_previstos').delete().eq('pedido_id', pedSeguro.id);
        const previstosDb = await Promise.all(linhasAtivas.map(async (linha) => {
          let fpRealId = linha.forma_pagamento_id;
          if (!fpRealId || !SyncService.isUuidValido(fpRealId) || String(fpRealId).startsWith('fp_')) {
            fpRealId = await SyncService.resolverFormaPagamentoId(loja?.id || '', linha.forma_pagamento_id, linha.forma_tipo);
          }
          return {
            loja_id: loja?.id,
            pedido_id: pedSeguro.id,
            forma_pagamento_id: fpRealId,
            forma_tipo: linha.forma_tipo,
            forma_nome: linha.forma_nome,
            valor: Number(linha.valor),
            valor_entregue: linha.valor_entregue ? Number(linha.valor_entregue) : null,
            parcelas: linha.parcelas || 1
          };
        }));
        const { error: erroPrev } = await supabase.from('pedidos_pagamentos_previstos').insert(previstosDb);
        if (erroPrev) throw erroPrev;

        // Atualizar metadados com comprovante se anexado, mantendo status_pagamento: 'aguardando_pagamento'
        const lojaIdEfetivo = loja?.id || pedSeguro.loja_id;
        const payloadAtualizacao: any = {
          status_pagamento: 'aguardando_pagamento',
          atualizado_em: dataIso
        };
        if (comprovanteDataUrl) {
          const metaAtual = (pedSeguro as any).metadados || {};
          payloadAtualizacao.metadados = { ...metaAtual, comprovante_pix_url: comprovanteDataUrl };
        }
        await supabase.from('pedidos').update(payloadAtualizacao).eq('id', pedSeguro.id).eq('loja_id', lojaIdEfetivo);

        // Registro de histórico
        const resumoFormas = linhasAtivas.map(l => `${l.forma_nome}: ${formatarMoeda(l.valor)}`).join(', ');
        Promise.resolve(supabase.from('historico_pedidos').insert([{
          loja_id: loja?.id,
          pedido_id: pedSeguro.id,
          usuario_id: null,
          tipo_evento: 'pagamento_informado',
          status_anterior: pedSeguro.status,
          status_novo: pedSeguro.status,
          descricao: `Cliente informou intenção de pagamento via ${resumoFormas}. Aguardando conferência do lojista.`
        }])).catch(() => {});

        setSucessoConfig({
          titulo: 'Informações de Pagamento Registradas!',
          mensagem: `Seu pedido foi registrado aguardando a conferência do pagamento pelo estabelecimento (${resumoFormas}). Assim que o lojista confirmar o recebimento, o pedido será liberado.`,
          aguardandoConferencia: true
        });

        const objAtualizado = { ...pedSeguro, status_pagamento: 'aguardando_pagamento' } as Pedido;
        setPedidoAtualizado(objAtualizado);
        setSucessoModal(true);
        onPagamentoConcluido(objAtualizado);
        return;
      }

      // Identificar se há valor em Fiado ou Caderneta (formas a prazo)
      const valorFiadoRecebimento = linhasAtivas
        .filter(l => l.forma_tipo === 'fiado' || (l.forma_nome || '').toLowerCase().includes('fiado'))
        .reduce((acc, l) => acc + Number(l.valor || 0), 0);

      const valorCadernetaRecebimento = linhasAtivas
        .filter(l => l.forma_tipo === 'caderneta' || (l.forma_nome || '').toLowerCase().includes('caderneta'))
        .reduce((acc, l) => acc + Number(l.valor || 0), 0);

      // Pagamento imediato (numerário real): dinheiro, pix, cartões
      const valorRealPagoNestaOperacao = linhasAtivas
        .filter(l => 
          l.forma_tipo !== 'fiado' && 
          l.forma_tipo !== 'caderneta' && 
          !(l.forma_nome || '').toLowerCase().includes('fiado') && 
          !(l.forma_nome || '').toLowerCase().includes('caderneta')
        )
        .reduce((acc, l) => acc + Number(l.valor || 0), 0);

      const temFiado = valorFiadoRecebimento > 0;
      const temCaderneta = valorCadernetaRecebimento > 0;
      const temCreditoAPrazo = temFiado || temCaderneta;

      // O valor pago real soma apenas as formas imediatas (dinheiro, pix, cartões). Fiado e Caderneta são faturamentos a prazo, não numerário quitado!
      const novoValorPago = Number((valorJaPago + valorRealPagoNestaOperacao).toFixed(2));
      const novoSaldoDevedor = Number(Math.max(0, valorTotal - novoValorPago).toFixed(2));

      // Quitado apenas se não houver fiado/caderneta em aberto e o saldo devedor for zero
      const quitado = !temCreditoAPrazo && novoSaldoDevedor <= 0.009;

      const novoStatusPagamento: StatusPagamento = temFiado
        ? 'fiado'
        : temCaderneta
        ? 'caderneta'
        : quitado
        ? 'pago'
        : novoValorPago > 0
        ? 'parcialmente_pago'
        : 'aguardando_pagamento';

      let dataVencimentoCalculada: string | null = null;
      if (temFiado) {
        const formaFiado = (formasDisponiveis || []).find((f: FormaPagamento) => f.tipo === 'fiado');
        const prazoDias = (formaFiado && formaFiado.prazo_dias != null && formaFiado.prazo_dias > 0)
          ? Number(formaFiado.prazo_dias)
          : (Number((loja?.configuracoes_extras?.pagamentos as any)?.dias_vencimento_fiado) || 30);

        const dataBase = pedSeguro.data_venda
          ? new Date(pedSeguro.data_venda)
          : pedSeguro.criado_em
          ? new Date(pedSeguro.criado_em)
          : new Date();

        const dataVencimento = new Date(dataBase);
        dataVencimento.setDate(dataVencimento.getDate() + prazoDias);

        const ano = dataVencimento.getFullYear();
        const mes = String(dataVencimento.getMonth() + 1).padStart(2, '0');
        const dia = String(dataVencimento.getDate()).padStart(2, '0');
        dataVencimentoCalculada = `${ano}-${mes}-${dia}`;
      }

      // 1. Gravar pagamentos em lote na tabela pagamentos_pedido
      const pagamentosParaDb = await Promise.all(linhasAtivas.map(async (linha) => {
        let fpRealId = linha.forma_pagamento_id;
        if (!fpRealId || !SyncService.isUuidValido(fpRealId) || String(fpRealId).startsWith('fp_')) {
          fpRealId = await SyncService.resolverFormaPagamentoId(loja?.id || '', linha.forma_pagamento_id, linha.forma_tipo);
        }
        const fpRef = formasDisponiveis.find((f: FormaPagamento) => f.id === linha.forma_pagamento_id || f.tipo === linha.forma_tipo);
        const taxaPerc = Number(fpRef?.taxa_percentual || 0);
        const taxaValor = Number(((linha.valor * taxaPerc) / 100).toFixed(2));
        const valorLiquido = Number((linha.valor - taxaValor).toFixed(2));

        const ehLinhaFiado = linha.forma_tipo === 'fiado' || (linha.forma_nome || '').toLowerCase().includes('fiado');
        const ehLinhaCaderneta = linha.forma_tipo === 'caderneta' || (linha.forma_nome || '').toLowerCase().includes('caderneta');

        return {
          loja_id: loja?.id,
          pedido_id: pedSeguro.id,
          forma_pagamento_id: fpRealId,
          valor: linha.valor,
          parcelas: linha.parcelas || 1,
          valor_taxa: taxaValor,
          valor_liquido: valorLiquido,
          data_pagamento: (ehLinhaFiado || ehLinhaCaderneta) ? null : dataIso,
          eh_pagamento_fiado: ehLinhaFiado,
          eh_pagamento_caderneta: ehLinhaCaderneta
        };
      }));

      const { data: pagsInseridos, error: erroPag } = await supabase
        .from('pagamentos_pedido')
        .insert(pagamentosParaDb)
        .select('id, eh_pagamento_caderneta, valor');

      if (erroPag) throw erroPag;

      // Se for Caderneta, lança no livro razão e incrementa saldo devedor do cliente em background
      if (pedSeguro.cliente_id && loja?.id && pagsInseridos) {
        const pagsCaderneta = pagsInseridos.filter((p: any) => p.eh_pagamento_caderneta);
        for (const pCad of pagsCaderneta) {
          try {
            await CadernetaService.registrarCompraCaderneta({
              lojaId: loja.id,
              clienteId: pedSeguro.cliente_id,
              pedidoId: pedSeguro.id,
              pagamentoPedidoId: pCad.id,
              valor: Number(pCad.valor || 0),
              usuarioId: usuario?.id,
              numeroPedido: pedSeguro.numero_pedido
            });
          } catch (errCad) {
            console.error('Erro ao registrar lançamento de caderneta:', errCad);
          }
        }
      }

      // 2. Atualizar status e valores do pedido
      const payloadUpdate: any = {
        status_pagamento: novoStatusPagamento,
        valor_pago: novoValorPago,
        saldo_devedor: novoSaldoDevedor,
        fiado_quitado: quitado,
        atualizado_em: dataIso,
        atualizado_por: usuario?.id || null
      };

      if (temFiado && dataVencimentoCalculada) {
        payloadUpdate.data_vencimento_fiado = dataVencimentoCalculada;
      }

      // Se o pedido estava pendente e teve pagamento registrado (ou se foi quitado), transiciona automaticamente
      const isStatusLogistico = ['aguardando_envio', 'em_expedicao', 'enviado', 'concluido'].includes(pedSeguro.status);
      if (!isStatusLogistico) {
        const rawPe = (pedSeguro as any).pedido_entregas || (pedSeguro as any).pedido_entrega;
        const pe = Array.isArray(rawPe) ? rawPe[0] : rawPe;
        const ehRetirada = pe?.tipo_atendimento === 'retirada' || (pedSeguro as any).tipo_atendimento === 'retirada';
        const ehEntrega = !ehRetirada && (
          Boolean(pe) ||
          Boolean(pedSeguro.endereco_entrega && !pedSeguro.endereco_entrega.toLowerCase().includes('retirada') && pedSeguro.endereco_entrega.toLowerCase() !== 'retirada na loja') ||
          Boolean(pedSeguro.forma_entrega_id) ||
          Boolean((pedSeguro as any).nome_transportadora) ||
          Number(pedSeguro.valor_frete || 0) > 0
        );

        if (quitado && !ehEntrega) {
          payloadUpdate.status = 'concluido';
        } else if (ehEntrega) {
          payloadUpdate.status = 'aguardando_envio';
        } else if (pedSeguro.status === 'pendente') {
          payloadUpdate.status = 'confirmado';
        }
      }

      const lojaIdEfetivo = loja?.id || pedSeguro.loja_id;
      const { data: pedUpd, error: erroUpd } = await supabase
        .from('pedidos')
        .update(payloadUpdate)
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

      // 3. Atualizar saldo devedor do cliente e auditoria contábil
      const totalAbatimentoFiado = linhasAtivas
        .filter(l => l.forma_tipo !== 'fiado' && l.forma_tipo !== 'caderneta')
        .reduce((acc, l) => acc + Number(l.valor || 0), 0);

      const ehVendaOriginalmenteFiado = Boolean(
        pedSeguro.status_pagamento === 'fiado' ||
        (pedSeguro.pagamentos && pedSeguro.pagamentos.some((p: any) => p.eh_pagamento_fiado))
      );

      // Caso A: Se recebeu/faturou em Fiado nesta operação -> DEBITA a conta do cliente e registra movimentação
      if (pedSeguro.cliente_id && valorFiadoRecebimento > 0 && loja?.id) {
        try {
          const { data: clienteAtual } = await supabase
            .from('clientes')
            .select('saldo_devedor_fiado, limite_credito')
            .eq('id', pedSeguro.cliente_id)
            .eq('loja_id', loja.id)
            .single();

          const saldoAnterior = Number(clienteAtual?.saldo_devedor_fiado || 0);
          const limiteAnterior = Number(clienteAtual?.limite_credito || 0);
          const novoSaldo = Number((saldoAnterior + valorFiadoRecebimento).toFixed(2));
          const novoLimite = Math.max(0, Number((limiteAnterior - valorFiadoRecebimento).toFixed(2)));

          await supabase
            .from('clientes')
            .update({
              saldo_devedor_fiado: novoSaldo,
              limite_credito: novoLimite
            })
            .eq('id', pedSeguro.cliente_id)
            .eq('loja_id', loja.id);

          await supabase
            .from('movimentacoes_saldo_cliente')
            .insert([{
              loja_id: loja.id,
              cliente_id: pedSeguro.cliente_id,
              tipo: 'debito_venda',
              valor: valorFiadoRecebimento,
              saldo_anterior: saldoAnterior,
              saldo_posterior: novoSaldo,
              observacao: `Faturamento Fiado via Recebimento Pedido #${pedSeguro.numero_pedido}`,
              usuario_id: usuario?.id || null
            }]);
        } catch (errFiadoCli) {
          console.error('Erro ao debitar saldo fiado do cliente:', errFiadoCli);
        }
      }
      // Caso B: Se for quitação com numerário real de um pedido que era originalmente fiado -> ABATE a dívida e devolve limite
      else if (pedSeguro.cliente_id && totalAbatimentoFiado > 0 && ehVendaOriginalmenteFiado && !temFiado && loja?.id) {
        try {
          const { data: cliData } = await supabase
            .from('clientes')
            .select('saldo_devedor_fiado, limite_credito')
            .eq('id', pedSeguro.cliente_id)
            .eq('loja_id', loja.id)
            .single();

          if (cliData) {
            const debitoCli = Number(cliData.saldo_devedor_fiado || 0);
            const novoDebitoCli = Math.max(0, Number((debitoCli - totalAbatimentoFiado).toFixed(2)));
            const limiteAtual = Number(cliData.limite_credito || 0);
            const novoLimite = Number((limiteAtual + totalAbatimentoFiado).toFixed(2));

            await supabase
              .from('clientes')
              .update({
                saldo_devedor_fiado: novoDebitoCli,
                limite_credito: novoLimite
              })
              .eq('id', pedSeguro.cliente_id)
              .eq('loja_id', loja.id);

            await supabase
              .from('movimentacoes_saldo_cliente')
              .insert([{
                loja_id: loja.id,
                cliente_id: pedSeguro.cliente_id,
                tipo: 'credito_pagamento',
                valor: totalAbatimentoFiado,
                saldo_anterior: debitoCli,
                saldo_posterior: novoDebitoCli,
                observacao: `Quitação Fiado via Recebimento Pedido #${pedSeguro.numero_pedido}`,
                usuario_id: usuario?.id || null
              }]);
          }
        } catch (cliErr) {
          console.warn('Aviso ao abater fiado do cliente e devolver limite:', cliErr);
        }
      }

      // 4. Registrar na sessão de caixa ativa para formas reais (exclui fiado e caderneta)
      const pagamentosCaixa = linhasAtivas.filter(l => l.forma_tipo !== 'fiado' && l.forma_tipo !== 'caderneta' && Number(l.valor) > 0);
      if (loja?.id && pagamentosCaixa.length > 0) {
        try {
          await caixaService.registrarVendaPedido({
            lojaId: loja.id,
            pedido: pedUpd || pedSeguro,
            pagamentos: pagamentosCaixa.map(l => ({
              forma_nome: l.forma_nome,
              forma_tipo: l.forma_tipo,
              valor: l.valor
            })),
            usuarioId: usuario?.id || ''
          });
        } catch (errCaixa) {
          console.warn('Aviso ao registrar recebimento no caixa:', errCaixa);
        }
      }

      // 5. Registrar evento financeiro de quitação/recebimento no histórico do pedido em background assíncrono
      if (loja?.id && totalLinhasPagamento > 0) {
        const resumoFormas = linhasAtivas
          .filter(l => Number(l.valor) > 0)
          .map(l => `${l.forma_nome}: R$ ${Number(l.valor).toFixed(2).replace('.', ',')}`)
          .join(', ');
        const descPag = temFiado
          ? `Venda a prazo (Fiado) registrada no valor de R$ ${totalLinhasPagamento.toFixed(2).replace('.', ',')} (${resumoFormas}). Vencimento: ${dataVencimentoCalculada ? dataVencimentoCalculada.split('-').reverse().join('/') : '30 dias'}.`
          : quitado
          ? `Pagamento integral registrado no valor de R$ ${totalLinhasPagamento.toFixed(2).replace('.', ',')} (${resumoFormas}). Pedido quitado.`
          : `Pagamento parcial registrado no valor de R$ ${totalLinhasPagamento.toFixed(2).replace('.', ',')} (${resumoFormas}). Saldo restante: R$ ${novoSaldoDevedor.toFixed(2).replace('.', ',')}.`;

        Promise.resolve(supabase.from('historico_pedidos').insert([
          {
            loja_id: loja.id,
            pedido_id: pedSeguro.id,
            usuario_id: usuario?.id || null,
            tipo_evento: 'pagamento_recebido',
            status_anterior: pedSeguro.status,
            status_novo: payloadUpdate.status || pedSeguro.status,
            descricao: descPag
          }
        ])).catch((errHist: any) => {
          console.warn('Aviso ao registrar histórico de pagamento:', errHist);
        });
      }

      audioService.playNewOrderSound();
      setSucessoConfig({
        titulo: temFiado ? 'Venda a Prazo (Fiado) Registrada!' : temCaderneta ? 'Compra na Caderneta Registrada!' : 'Pagamento Recebido com Sucesso!',
        mensagem: `O valor de ${formatarMoeda(totalLinhasPagamento)} foi registrado no pedido.`,
        aguardandoConferencia: false
      });
      const objAtualizado = (pedUpd as unknown as Pedido) || { ...pedSeguro, ...payloadUpdate };
      setPedidoAtualizado(objAtualizado);
      setSucessoModal(true);
      onPagamentoConcluido(objAtualizado);
    } catch (err: any) {
      console.error('Erro ao receber pagamento:', err);
      setErroMsg(err.message || 'Erro ao registrar pagamento. Tente novamente.');
    } finally {
      setProcessando(false);
    }
  };

  const handleImprimirComprovante = () => {
    if (pedidoAtualizado || pedSeguro) {
      PrintService.printReceipt(pedidoAtualizado || pedSeguro, loja, '80mm');
    }
  };

  const handleFecharTudo = () => {
    setSucessoModal(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-[70] animate-in fade-in overflow-y-auto">
      <div className={`border rounded-3xl w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 my-6 max-h-[92vh] overflow-y-auto ${
        isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Header Oficial Unificado */}
        <div className={`flex items-center justify-between border-b pb-3 ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-2xl font-bold flex items-center justify-center ${
              isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
            }`}>
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`font-bold text-base flex items-center gap-2 ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}>
                <span>{origem === 'caderneta' ? 'Liquidação de Caderneta' : 'Pagamento & Fechamento'}</span>
                {origem !== 'caderneta' && pedSeguro.numero_pedido > 0 && (
                  <span className={`text-xs font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    #{pedSeguro.origem === 'catalogo_online' ? `c-${pedSeguro.numero_pedido}` : pedSeguro.numero_pedido}
                  </span>
                )}
              </h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Cliente: <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  {clientePedidoMemo?.nome || pedSeguro.cliente?.nome || 'Cliente Balcão'}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={handleFecharTudo}
            className={`p-1.5 rounded-xl transition cursor-pointer ${
              isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-700'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {erroMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-2 text-xs text-rose-500 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{erroMsg}</span>
          </div>
        )}

        {sucessoModal ? (
          /* TELA DE SUCESSO DO RECEBIMENTO */
          <div className="py-6 text-center space-y-4 animate-in fade-in">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/40 shadow-lg shadow-emerald-500/15">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h4 className={`text-lg font-black ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                {sucessoConfig?.titulo || 'Pagamento Recebido com Sucesso!'}
              </h4>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} max-w-sm mx-auto`}>
                {sucessoConfig?.mensagem || `O valor de ${formatarMoeda(totalLinhasPagamento)} foi registrado.`}
              </p>
            </div>

            <div className={`p-4 rounded-2xl border text-xs space-y-1.5 text-left max-w-sm mx-auto ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className={`flex justify-between ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <span>Total:</span>
                <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{formatarMoeda(valorTotal)}</span>
              </div>
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>{sucessoConfig?.aguardandoConferencia ? 'Valor Informado:' : 'Total Pago:'}</span>
                <span className="font-bold">{formatarMoeda(totalLinhasPagamento)}</span>
              </div>
              <div className={`flex justify-between pt-1 border-t ${
                isDark ? 'text-slate-400 border-slate-800' : 'text-slate-500 border-slate-200'
              }`}>
                <span>Status Financeiro:</span>
                <span className={`font-bold ${sucessoConfig?.aguardandoConferencia ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {sucessoConfig?.aguardandoConferencia ? 'Aguardando Conferência' : 'Quitado / Processado'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              {!sucessoConfig?.aguardandoConferencia && (
                <button
                  type="button"
                  onClick={handleImprimirComprovante}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs border ${
                    isDark
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700'
                      : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200'
                  }`}
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Recibo</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleFecharTudo}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition cursor-pointer shadow-lg shadow-emerald-600/25 active:scale-95"
              >
                Concluir
              </button>
            </div>
          </div>
        ) : (
          /* FORMULÁRIO DE RECEBIMENTO UNIFICADO (PADRÃO POSCHECKOUT) */
          <form onSubmit={handleConfirmarRecebimento} className="space-y-4">
            {/* Card de Destaque do Valor Total / Saldo Pendente */}
            <div className={`p-3.5 rounded-2xl border text-center space-y-0.5 ${
              isDark
                ? 'bg-emerald-950/40 border-emerald-800'
                : 'bg-emerald-50 border-emerald-100'
            }`}>
              <span className={`text-xs block font-semibold ${
                isDark ? 'text-emerald-400/80' : 'text-emerald-800/80'
              }`}>
                {valorJaPago > 0 ? 'Saldo Restante a Quitar' : 'Valor Total da Venda'}
              </span>
              <span className={`text-3xl font-bold ${
                isDark ? 'text-emerald-400' : 'text-emerald-600'
              }`}>
                {formatarMoeda(saldoDevedorAtual)}
              </span>
              {valorJaPago > 0 && (
                <div className={`flex justify-center items-center gap-3 text-[11px] pt-0.5 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  <span>Total: {formatarMoeda(valorTotal)}</span>
                  <span>•</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Já Pago: {formatarMoeda(valorJaPago)}</span>
                </div>
              )}
            </div>

            {/* Linhas de Pagamento */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  Meios de Pagamento ({linhasPagamento.length}):
                </span>
                <span className={`text-[11px] font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  Permite dividir o total em vários meios
                </span>
              </div>

              {linhasPagamento.map((linha, idx) => (
                <div
                  key={linha.id}
                  className={`p-3 rounded-2xl border space-y-2.5 shadow-xs ${
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
                      const estaSelecionado = linha.forma_pagamento_id === fp.id || (!linha.forma_pagamento_id && linha.forma_tipo === fp.tipo);
                      const ehPresencial = fp.tipo === 'dinheiro' || fp.tipo === 'cartao_debito' || fp.tipo === 'cartao_credito';
                      const ehOnlineExterno = !presencialPermitido && (fp.tipo === 'mercado_pago' || fp.tipo === 'mercado_livre' || fp.tipo === 'pix');
                      const textoContextual = ehPresencial
                        ? (ehRetirada ? 'Pagamento na retirada' : 'Pagamento na entrega')
                        : ehOnlineExterno
                        ? 'Online Recomendado'
                        : null;

                      return (
                        <button
                          key={fp.id}
                          type="button"
                          onClick={() => handleAlterarFormaLinha(linha.id, fp)}
                          className={`p-2 rounded-xl border text-[11px] font-bold flex flex-col items-start gap-1 transition cursor-pointer active:scale-95 text-left ${
                            estaSelecionado
                              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/40 shadow-xs'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 w-full">
                            {fp.tipo === 'dinheiro' && <Banknote className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                            {fp.tipo === 'pix' && <Zap className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />}
                            {fp.tipo === 'mercado_pago' && <CreditCard className="w-3.5 h-3.5 text-sky-500 shrink-0" />}
                            {fp.tipo === 'mercado_livre' && <ShoppingBag className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                            {fp.tipo === 'cartao_debito' && <CreditCard className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
                            {fp.tipo === 'cartao_credito' && <CreditCard className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />}
                            {fp.tipo === 'fiado' && <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />}
                            {fp.tipo === 'caderneta' && <BookOpen className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />}
                            {fp.tipo !== 'dinheiro' && fp.tipo !== 'pix' && fp.tipo !== 'mercado_pago' && fp.tipo !== 'mercado_livre' && fp.tipo !== 'cartao_debito' && fp.tipo !== 'cartao_credito' && fp.tipo !== 'fiado' && fp.tipo !== 'caderneta' && (
                              <CreditCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            )}
                            <span className="truncate">{fp.nome}</span>
                          </div>
                          {textoContextual && (
                            <span className={`text-[10px] font-medium leading-tight ${
                              ehOnlineExterno ? 'text-sky-600 dark:text-sky-400 font-bold' : 'text-slate-500 dark:text-slate-400'
                            }`}>
                              {textoContextual}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Valor deste pagamento */}
                  <div className={`flex items-center justify-between gap-2 pt-1 border-t ${
                    isDark ? 'border-slate-800' : 'border-slate-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Valor a pagar:</span>
                      {(() => {
                        const somaOutras = linhasPagamento.filter(l => l.id !== linha.id).reduce((acc, l) => acc + (Number(l.valor) || 0), 0);
                        const restanteParaEstaLinha = Number((saldoDevedorAtual - somaOutras).toFixed(2));
                        if (restanteParaEstaLinha > 0 && Math.abs(linha.valor - restanteParaEstaLinha) > 0.01) {
                          return (
                            <button
                              type="button"
                              onClick={() => handleAlterarValorLinha(linha.id, restanteParaEstaLinha)}
                              className="text-[10px] text-emerald-500 hover:text-emerald-400 underline font-bold cursor-pointer"
                              title="Preencher com o saldo restante da venda"
                            >
                              + Restante ({formatarMoeda(restanteParaEstaLinha)})
                            </button>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <div className={`flex items-center gap-1 border rounded-xl px-2.5 py-1.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 ${
                      isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
                    }`}>
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">R$</span>
                      <MoneyInput
                        inputRef={idx === 0 ? inputPrimeiroValorRef : undefined}
                        autoFocus={idx === 0}
                        valor={linha.valor}
                        onChange={(novoValor) => handleAlterarValorLinha(linha.id, novoValor)}
                        placeholder="0,00"
                        className={`w-28 bg-transparent text-right text-xs font-bold focus:outline-none placeholder:text-slate-400 ${
                          isDark ? 'text-white' : 'text-slate-900'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Dinheiro: Troco */}
                  {linha.forma_tipo === 'dinheiro' && (
                    <div className={`space-y-1.5 pt-1.5 border-t text-xs ${
                      isDark ? 'border-slate-800' : 'border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Valor Entregue pelo Cliente:</span>
                        <div className={`flex items-center gap-1 border rounded-xl px-2.5 py-1.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 ${
                          isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
                        }`}>
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">R$</span>
                          <MoneyInput
                            valor={linha.valor_entregue != null && linha.valor_entregue > 0 ? linha.valor_entregue : 0}
                            onChange={(novoValor) => handleAlterarEntregueLinha(linha.id, novoValor)}
                            placeholder="0,00"
                            className={`w-28 bg-transparent text-right text-xs font-bold focus:outline-none placeholder:text-slate-400 ${
                              isDark ? 'text-white' : 'text-slate-900'
                            }`}
                          />
                        </div>
                      </div>

                      {linha.valor_entregue != null && linha.valor_entregue > 0 && linha.valor_entregue < linha.valor && (
                        <div className="flex items-center justify-between text-[11px] text-amber-500 pt-0.5">
                          <span>Valor entregue menor que a parcela.</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (linha.valor_entregue != null && linha.valor_entregue > 0) {
                                handleAlterarValorLinha(linha.id, linha.valor_entregue);
                              }
                            }}
                            className="underline font-bold hover:text-amber-400 cursor-pointer"
                          >
                            Pagar R$ {formatarValorBRL(linha.valor_entregue)} nesta forma
                          </button>
                        </div>
                      )}

                      {linha.valor_entregue != null && (
                        <div className={`flex items-center justify-between gap-2 pt-1 border-t ${
                          isDark ? 'border-slate-800' : 'border-slate-200'
                        }`}>
                          <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Troco a devolver:</span>
                          <div className={`flex items-center gap-1 border rounded-xl px-2.5 py-1.5 ${
                            isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
                          }`}>
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">R$</span>
                            <span className={`w-28 text-right text-xs font-bold ${
                              linha.valor_entregue >= linha.valor ? 'text-emerald-500' : (isDark ? 'text-slate-400' : 'text-slate-500')
                            }`}>
                              {formatarValorBRL(Math.max(0, linha.valor_entregue - linha.valor))}
                            </span>
                          </div>
                        </div>
                      )}
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

                  {/* Fiado: Informações do Cliente e Limite */}
                  {linha.forma_tipo === 'fiado' && (
                    <div className={`p-2.5 rounded-xl border space-y-1.5 text-xs ${
                      isDark
                        ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-700 dark:text-amber-400">Cliente Fiado:</span>
                        <span className={`font-semibold truncate max-w-[200px] ${
                          isDark ? 'text-slate-200' : 'text-slate-800'
                        }`}>
                          {clientePedidoMemo?.nome || pedSeguro.cliente?.nome || 'Nenhum selecionado'}
                        </span>
                      </div>
                      <div className={`flex justify-between text-[11px] ${
                        isDark ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        <span>Limite de Crédito Disponível:</span>
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

                  {/* Caderneta: Informações do Cliente e Limite Disponível */}
                  {linha.forma_tipo === 'caderneta' && (
                    <div className={`p-3.5 rounded-2xl border space-y-2 text-xs ${
                      isDark
                        ? 'bg-slate-950 border-slate-800 text-slate-100'
                        : 'bg-slate-50 border-slate-200 text-slate-800'
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
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
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

                  {/* Pix Manual: Chave, Pix Copia e Cola e Comprovante */}
                  {linha.forma_tipo === 'pix' && (() => {
                    const pagConfig = (loja?.configuracoes_extras as any)?.pagamentos || {};
                    const chavePix = pagConfig.pix_chave || (loja as any)?.chave_pix || '';
                    const orientacoesPix = pagConfig.pix_orientacoes || '';

                    const codigoPixEmv = chavePix ? gerarPayloadPixEmv({
                      chavePix,
                      nomeRecebedor: loja?.nome_fantasia || 'HUBI SISTEMAS',
                      cidade: (loja as any)?.cidade || (loja as any)?.endereco_cidade || 'BRASIL',
                      valor: linha.valor
                    }) : '';

                    return (
                      <div className={`p-3.5 rounded-2xl border space-y-3 text-xs ${
                        isDark ? 'bg-slate-950 border-emerald-500/30' : 'bg-emerald-50/50 border-emerald-200'
                      }`}>
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="font-bold text-emerald-700 dark:text-emerald-400">
                            Pagamento via PIX da Loja
                          </span>
                        </div>

                        {chavePix ? (
                          <div className="space-y-2.5">
                            {/* Botão Oficial Pix Copia e Cola (Oculta string EMV bruta) */}
                            {codigoPixEmv && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(codigoPixEmv);
                                    setPixCopiado(true);
                                    setTimeout(() => setPixCopiado(false), 3000);
                                  } catch {}
                                }}
                                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-emerald-600/20 active:scale-98"
                              >
                                {pixCopiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                <span>{pixCopiado ? 'Código Pix Copiado!' : 'Copiar Código Pix Copia e Cola'}</span>
                              </button>
                            )}

                            {/* Chave Pix Formatada e Botão de Cópia */}
                            <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                              isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                            }`}>
                              <div className="min-w-0">
                                <span className={`text-[10px] uppercase font-bold block ${
                                  isDark ? 'text-slate-400' : 'text-slate-500'
                                }`}>
                                  Chave Pix Manual
                                </span>
                                <span className={`text-xs font-semibold select-all truncate block ${
                                  isDark ? 'text-slate-200' : 'text-slate-800'
                                }`}>
                                  {chavePix}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(chavePix);
                                    setChavePixCopiada(true);
                                    setTimeout(() => setChavePixCopiada(false), 2500);
                                  } catch {}
                                }}
                                className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer ${
                                  chavePixCopiada
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                    : (isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300')
                                }`}
                              >
                                {chavePixCopiada ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                <span>{chavePixCopiada ? 'Copiada!' : 'Copiar Chave'}</span>
                              </button>
                            </div>

                            <p className={`text-[11px] leading-tight ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                              ℹ️ A chave manual requer que você digite o valor de <strong>{formatarMoeda(linha.valor)}</strong> no app do seu banco.
                            </p>

                            {orientacoesPix && (
                              <p className={`text-[11px] leading-relaxed italic ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                {orientacoesPix}
                              </p>
                            )}

                            {/* Campo de Anexo do Comprovante */}
                            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                              <label className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                                isDark ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                              }`}>
                                <Paperclip className="w-3.5 h-3.5 text-emerald-500" />
                                <span>{comprovanteArquivo ? 'Trocar Comprovante' : 'Anexar Comprovante Pix'}</span>
                                <input
                                  type="file"
                                  accept="image/*,application/pdf"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      setComprovanteArquivo(file);
                                      const reader = new FileReader();
                                      reader.onload = (ev) => {
                                        setComprovanteDataUrl(ev.target?.result as string);
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                />
                              </label>
                              {comprovanteArquivo && (
                                <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 truncate max-w-[170px]">
                                  <span className="truncate">{comprovanteArquivo.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setComprovanteArquivo(null);
                                      setComprovanteDataUrl(null);
                                    }}
                                    className="text-rose-500 hover:text-rose-600 p-0.5"
                                    title="Remover anexo"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            Chave Pix da loja não configurada nas configurações de pagamento.
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Mercado Pago */}
                  {linha.forma_tipo === 'mercado_pago' && (
                    <div className={`p-3.5 rounded-2xl border space-y-2 text-xs ${
                      isDark ? 'bg-slate-950 border-sky-500/30 text-sky-200' : 'bg-sky-50 border-sky-200 text-sky-900'
                    }`}>
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-sky-500 shrink-0" />
                        <span className="font-bold text-sky-700 dark:text-sky-400">
                          Mercado Pago (Pix Automático & Cartão Online)
                        </span>
                      </div>
                      <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Ao confirmar, o pagamento será processado via Mercado Pago com liberação e baixa automática em tempo real assim que aprovado.
                      </p>
                    </div>
                  )}

                  {/* Mercado Livre */}
                  {linha.forma_tipo === 'mercado_livre' && (
                    <div className={`p-3.5 rounded-2xl border space-y-2 text-xs ${
                      isDark ? 'bg-slate-950 border-amber-500/30 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}>
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="font-bold text-amber-700 dark:text-amber-400">
                          Mercado Livre (Canal Integrado)
                        </span>
                      </div>
                      <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Venda integrada ao Mercado Livre. A conciliação financeira e o status de pagamento são atualizados automaticamente via webhook do canal.
                      </p>
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

            {/* Resumo de Conferência dos Valores com Discriminação (Padrão POSCheckout) */}
            <div className={`p-3.5 rounded-2xl border space-y-2 text-xs ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className={`flex justify-between items-center ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
                <span className="font-medium">Subtotal dos Produtos:</span>
                <span className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  {formatarMoeda(Number(pedSeguro.subtotal || (valorTotal - Number(pedSeguro.valor_frete || 0) + Number(pedSeguro.valor_desconto || 0))))}
                </span>
              </div>

              {Number(pedSeguro.valor_desconto || 0) > 0 && (
                <div className={`flex justify-between items-center ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
                  <span className="font-medium">
                    Desconto {pedSeguro.cupom_codigo ? `(Cupom: ${pedSeguro.cupom_codigo})` : 'Aplicado'}:
                  </span>
                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                    - {formatarMoeda(Number(pedSeguro.valor_desconto || 0))}
                  </span>
                </div>
              )}

              {/* Discriminação explícita do Frete */}
              <div className={`flex justify-between items-center ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
                <span className="flex items-center gap-1.5 font-medium">
                  <Truck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Taxa de Entrega / Frete:</span>
                </span>
                {freteADefinir ? (
                  <button
                    type="button"
                    onClick={() => setModalDefinirEnvioAberto(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition cursor-pointer active:scale-95 shadow-2xs"
                    title="Definir opções de frete agora"
                  >
                    <span>A definir</span>
                    <span className="text-[11px]">✏️</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {rawPe?.transportadora_nome || pedSeguro.nome_transportadora ? (
                        <span>
                          {rawPe?.transportadora_nome || pedSeguro.nome_transportadora}
                          {Number(pedSeguro.valor_frete || 0) > 0
                            ? ` (+ ${formatarMoeda(Number(pedSeguro.valor_frete || 0))})`
                            : (rawPe?.is_frete_gratis ? ' (Grátis)' : '')}
                        </span>
                      ) : Number(pedSeguro.valor_frete || 0) > 0 ? (
                        formatarMoeda(Number(pedSeguro.valor_frete || 0))
                      ) : rawPe?.is_frete_gratis ? (
                        'Grátis'
                      ) : (
                        formatarMoeda(0)
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setModalDefinirEnvioAberto(true)}
                      className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                      title="Alterar opção de frete"
                    >
                      <span className="text-[11px]">✏️</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Alerta de Frete a Definir no Fechamento */}
              {freteADefinir && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Para efetuar o pagamento, primeiro é necessário definir a opção de frete.</span>
                </div>
              )}

              {/* TOTAL DA VENDA (EM DESTAQUE) */}
              <div className={`pt-2 border-t flex justify-between items-center font-bold text-sm ${
                isDark ? 'border-slate-800 text-white' : 'border-slate-200 text-slate-900'
              }`}>
                <span>Total da Venda:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-black text-base">{formatarMoeda(valorTotal)}</span>
              </div>

              {valorJaPago > 0 && (
                <div className={`flex justify-between items-center pt-1 border-t border-dashed ${
                  isDark ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-800'
                }`}>
                  <span className="font-medium">Já Quitado Anteriormente:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatarMoeda(valorJaPago)}</span>
                </div>
              )}

              {/* Total dos Meios Informados */}
              <div className={`flex justify-between items-center pt-1 border-t border-dashed ${
                isDark ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-800'
              }`}>
                <span className="font-medium">Total dos Meios Informados:</span>
                <span className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{formatarMoeda(totalLinhasPagamento)}</span>
              </div>

              {/* Total Conferido / Diferença */}
              <div className={`flex justify-between items-center font-medium pt-1 border-t ${
                isDark ? 'border-slate-800/80 text-slate-300' : 'border-slate-200 text-slate-800'
              }`}>
                {Math.abs(diferencaPagamento) < 0.01 ? (
                  <>
                    <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" /> Total Conferido (100%):
                    </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">R$ 0,00</span>
                  </>
                ) : diferencaPagamento > 0 ? (
                  <>
                    <span className="text-amber-700 dark:text-amber-400 font-medium">Restante a Definir:</span>
                    <span className="font-semibold text-amber-700 dark:text-amber-400">{formatarMoeda(diferencaPagamento)}</span>
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
                onClick={handleSalvarPrevisto}
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
                <span>Salvar Previsto</span>
              </button>

              <button
                type="submit"
                disabled={processando || salvando || freteADefinir || totalLinhasPagamento <= 0 || Math.abs(diferencaPagamento) > 0.01 || linhasPagamento.some(l => Number(l.valor) <= 0)}
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

        {/* Modal de Definição de Envio Integrado ao Fechamento */}
        {modalDefinirEnvioAberto && pedAtivo && (
          <ModalDefinirEnvio
            isOpen={modalDefinirEnvioAberto}
            pedido={pedAtivo}
            loja={loja}
            usuario={usuario}
            onClose={() => setModalDefinirEnvioAberto(false)}
            onConfirmarEnvio={async (resultado) => {
              try {
                await ShippingOrchestrator.definirEnvioPedido(
                  pedAtivo.id,
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
