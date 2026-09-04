import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Barcode,
  Camera,
  ChevronDown,
  ChevronUp,
  Check,
  Plus,
  Minus,
  Trash2,
  User,
  CreditCard,
  Printer,
  Share2,
  CheckCircle2,
  DollarSign,
  AlertCircle,
  Tag,
  ArrowRight,
  Layers,
  X,
  Wifi,
  WifiOff,
  RefreshCw,
  Cloud,
  CloudOff,
  Banknote,
  Zap,
  FileText,
  Loader2,
  Mail,
  Download,
  Copy
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCart } from '../contexts/CartContext';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { Produto, VariacaoProduto, Cliente, FormaPagamento, TabelaPreco, Pedido, ItemPedido, Categoria, StatusPagamento } from '../types';
import { PrintService, formatarDataRecibo, obterDadosPagamentoRecibo } from '../services/printService';
import { ModalNovoCliente } from './ModalNovoCliente';
import { ModalLeitorCodigoBarras } from './ModalLeitorCodigoBarras';
import { SyncService } from '../services/syncService';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { VendaOfflineFila } from '../services/offlineDb';
import { audioService } from '../services/audioService';
import { PosCheckoutMobile } from './PosCheckoutMobile';

/**
 * Retorna o peso de prioridade da categoria para ordenação no PDV:
 * 1º Cosméticos
 * 2º Brinquedos Eróticos
 * 3º Próteses
 * 4º Fantasias
 * 5º Couro / SADO
 * Demais categorias: alfabética
 */
export function getCategoriaPeso(nomeCategoria?: string | null): number {
  if (!nomeCategoria) return 999;
  const limpo = nomeCategoria
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (limpo.includes('COSMETICO')) return 1;
  if (limpo.includes('BRINQUEDO') || limpo.includes('BRNQUEDO')) return 2;
  if (limpo.includes('PROTESE')) return 3;
  if (limpo.includes('FANTASIA')) return 4;
  if (limpo.includes('COURO') || limpo.includes('SADO')) return 5;
  return 100;
}

export const PosCheckout: React.FC = () => {
  const navigate = useNavigate();
  const { loja, usuario } = useAuth();
  const permissions = usePermissions();
  const { mostrarSucesso, mostrarAviso, mostrarErro, setTemAlteracoesNaoSalvas } = useFeedbackModal();
  const {
    itens,
    clienteSelecionado,
    tabelaPrecoGlobal,
    tabelaPrecoCalculada,
    avaliacaoCarrinho,
    desconto,
    descontoPercentual,
    tipoDesconto,
    taxaEntrega,
    subtotal,
    total,
    totalItens,
    pedidoEmEdicao,
    adicionarItem,
    removerItem,
    atualizarQuantidade,
    setClienteSelecionado,
    setTabelaPrecoGlobal,
    setDescontoValor,
    setDescontoPercentual,
    setTipoDesconto,
    setDesconto,
    setTaxaEntrega,
    limparCarrinho,
    cancelarEdicaoPedido,
    atualizarStatusPedidoEmEdicao
  } = useCart();

  useEffect(() => {
    if (pedidoEmEdicao && itens.length > 0) {
      setTemAlteracoesNaoSalvas(true);
    } else {
      setTemAlteracoesNaoSalvas(false);
    }
    return () => {
      setTemAlteracoesNaoSalvas(false);
    };
  }, [pedidoEmEdicao, itens.length, setTemAlteracoesNaoSalvas]);

  const {
    isOnline,
    pendentesCount,
    sincronizando,
    ultimoSyncMsg,
    atualizarContadorPendentes,
    sincronizarAgora
  } = useNetworkStatus(loja?.id);

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string>('todas');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [buscaProduto, setBuscaProduto] = useState<string>('');
  const [buscaCodigoBarras, setBuscaCodigoBarras] = useState<string>('');

  const [produtoModalVariacao, setProdutoModalVariacao] = useState<Produto | null>(null);
  const [modalFechamento, setModalFechamento] = useState<boolean>(false);
  const [formaPagamentoEscolhida, setFormaPagamentoEscolhida] = useState<FormaPagamento | null>(null);
  const [valorRecebidoDinheiro, setValorRecebidoDinheiro] = useState<string>('');
  const [parcelasCartao, setParcelasCartao] = useState<number>(1);
  const [finalizandoVenda, setFinalizandoVenda] = useState<boolean>(false);
  const [salvandoPendente, setSalvandoPendente] = useState<boolean>(false);
  const [pedidoConcluido, setPedidoConcluido] = useState<Pedido | null>(null);
  const [ehVendaOfflineSalva, setEhVendaOfflineSalva] = useState<boolean>(false);

  const [modalNovoCliente, setModalNovoCliente] = useState<boolean>(false);
  const [modalCameraBarcode, setModalCameraBarcode] = useState<boolean>(false);
  const [clienteBuscaTexto, setClienteBuscaTexto] = useState<string>('');
  const [clienteDropdownAberto, setClienteDropdownAberto] = useState<boolean>(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const clienteDropdownRef = useRef<HTMLDivElement>(null);

  const FORMAS_PADRAO: FormaPagamento[] = [
    { id: `fp_dinheiro_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Dinheiro', tipo: 'dinheiro', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_pix_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Pix (Imediato)', tipo: 'pix', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_debito_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Cartão de Débito', tipo: 'cartao_debito', taxa_percentual: 1.5, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: true },
    { id: `fp_credito_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Cartão de Crédito', tipo: 'cartao_credito', taxa_percentual: 3.2, taxa_fixa: 0, maximo_parcelas: 12, ativo: true, exibir_catalogo: true },
    { id: `fp_fiado_${loja?.id || 'default'}`, loja_id: loja?.id || '', nome: 'Fiado / A Prazo', tipo: 'fiado', taxa_percentual: 0, taxa_fixa: 0, maximo_parcelas: 1, ativo: true, exibir_catalogo: false }
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clienteDropdownRef.current && !clienteDropdownRef.current.contains(event.target as Node)) {
        setClienteDropdownAberto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const clientesFiltrados = useMemo(() => {
    if (!clienteBuscaTexto.trim()) return clientes;
    const termo = clienteBuscaTexto.toLowerCase().trim();
    return clientes.filter(c =>
      c.nome.toLowerCase().includes(termo) ||
      (c.whatsapp && c.whatsapp.includes(termo)) ||
      (c.telefone && c.telefone.includes(termo)) ||
      (c.numero_documento && c.numero_documento.includes(termo))
    );
  }, [clientes, clienteBuscaTexto]);

  useEffect(() => {
    if (!loja?.id) return;
    const carregarDados = async () => {
      try {
        setCarregando(true);
        // Carregamento Híbrido: sincroniza do Supabase para o IndexedDB e traz os dados
        const dados = await SyncService.baixarDadosParaOffline(loja.id);
        if (dados.produtos) setProdutos(dados.produtos);
        if (dados.clientes) setClientes(dados.clientes);

        // Buscar categorias da loja
        try {
          const { data: cats } = await supabase
            .from('categorias')
            .select('*')
            .eq('loja_id', loja.id)
            .order('ordem_exibicao', { ascending: true });
          if (cats) setCategorias(cats);
        } catch (e) {
          console.warn('Categorias não puderam ser carregadas:', e);
        }
        
        const fps = (dados.formasPagamento && dados.formasPagamento.length > 0) ? dados.formasPagamento : FORMAS_PADRAO;
        setFormasPagamento(fps);
        setFormaPagamentoEscolhida(prev => prev || fps[0]);
      } catch (err) {
        console.error('Erro ao carregar dados do PDV:', err);
        setFormasPagamento(FORMAS_PADRAO);
        setFormaPagamentoEscolhida(prev => prev || FORMAS_PADRAO[0]);
      } finally {
        setCarregando(false);
      }
    };

    carregarDados();
  }, [loja?.id]);

  const handleAbrirFechamento = () => {
    if (itens.length === 0) return;
    const listaFPs = (formasPagamento && formasPagamento.length > 0) ? formasPagamento : FORMAS_PADRAO;
    if (formasPagamento.length === 0) {
      setFormasPagamento(listaFPs);
    }

    if (pedidoEmEdicao) {
      let infoPrevisto: any = null;
      try {
        const local = localStorage.getItem(`hubi_pag_previsto_${pedidoEmEdicao.id}`);
        if (local) infoPrevisto = JSON.parse(local);
      } catch (e) {}

      if (!infoPrevisto && pedidoEmEdicao.metadados) {
        try {
          const metaObj = typeof pedidoEmEdicao.metadados === 'string'
            ? JSON.parse(pedidoEmEdicao.metadados)
            : pedidoEmEdicao.metadados;
          if (metaObj?.pagamento_previsto) {
            infoPrevisto = metaObj.pagamento_previsto;
          }
        } catch (e) {}
      }

      if (!infoPrevisto && typeof pedidoEmEdicao.observacoes === 'string') {
        const match = pedidoEmEdicao.observacoes.match(/\[PAG_PREVISTO:(.*?)\]/);
        if (match && match[1]) {
          try {
            infoPrevisto = JSON.parse(match[1]);
          } catch (e) {}
        }
      }

      if (!infoPrevisto && pedidoEmEdicao.pagamentos && pedidoEmEdicao.pagamentos.length > 0) {
        const p = pedidoEmEdicao.pagamentos[pedidoEmEdicao.pagamentos.length - 1];
        infoPrevisto = {
          forma_pagamento_id: p.forma_pagamento_id,
          forma_tipo: p.forma_pagamento?.tipo,
          forma_nome: p.forma_pagamento?.nome,
          parcelas: p.parcelas
        };
      }

      if (infoPrevisto) {
        const fpCorrespondente = listaFPs.find(f =>
          (infoPrevisto.forma_pagamento_id && f.id === infoPrevisto.forma_pagamento_id) ||
          (infoPrevisto.forma_tipo && f.tipo === infoPrevisto.forma_tipo) ||
          (infoPrevisto.forma_nome && f.nome.toLowerCase() === infoPrevisto.forma_nome.toLowerCase())
        );
        if (fpCorrespondente) {
          setFormaPagamentoEscolhida(fpCorrespondente);
        }
        if (infoPrevisto.valor_entregue && Number(infoPrevisto.valor_entregue) > 0) {
          setValorRecebidoDinheiro(Number(infoPrevisto.valor_entregue).toFixed(2));
        }
        if (infoPrevisto.parcelas && Number(infoPrevisto.parcelas) > 0) {
          setParcelasCartao(Number(infoPrevisto.parcelas));
        }
      } else if (!formaPagamentoEscolhida) {
        setFormaPagamentoEscolhida(listaFPs[0]);
      }
    } else if (!formaPagamentoEscolhida) {
      setFormaPagamentoEscolhida(listaFPs[0]);
    }

    setModalFechamento(true);
  };

  const adicionarProdutoPorCodigo = (rawBarcode: string) => {
    const barcode = rawBarcode.trim();
    if (!barcode) return;

    let produtoEncontrado: Produto | null = null;
    let variacaoEncontrada: VariacaoProduto | null = null;

    for (const p of produtos) {
      if (p.codigo_barras === barcode || p.codigo_interno === barcode) {
        produtoEncontrado = p;
        break;
      }
      if (p.variacoes) {
        const v = p.variacoes.find(varItem => varItem.codigo_barras === barcode || varItem.sku === barcode);
        if (v) {
          produtoEncontrado = p;
          variacaoEncontrada = v;
          break;
        }
      }
    }

    if (produtoEncontrado) {
      if (produtoEncontrado.tem_variacoes && !variacaoEncontrada) {
        setProdutoModalVariacao(produtoEncontrado);
      } else {
        adicionarItem(produtoEncontrado, variacaoEncontrada);
      }
      setBuscaCodigoBarras('');
      audioService.playBeep();
    } else {
      mostrarAviso(`Produto com código ${barcode} não foi encontrado.`);
    }
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!buscaCodigoBarras.trim()) return;
    adicionarProdutoPorCodigo(buscaCodigoBarras);
  };

  const handleSalvarPedidoPendente = async () => {
    if (!loja?.id) {
      mostrarErro('Erro: Estabelecimento não selecionado. Por favor, recarregue a página.');
      return;
    }
    if (itens.length === 0) {
      mostrarAviso('O carrinho está vazio. Adicione produtos antes de salvar o pedido.');
      return;
    }

    try {
      setSalvandoPendente(true);

      let vendedorId: string = usuario?.id || '';
      if (!vendedorId) {
        const { data: u } = await supabase
          .from('usuarios_loja')
          .select('id')
          .eq('loja_id', loja.id)
          .limit(1);

        if (u && u.length > 0) {
          vendedorId = u[0].id;
        } else {
          vendedorId = loja.id;
        }
      }

      const dataIso = new Date().toISOString();

      let vendedorIdSanitizado: string | null = SyncService.isUuidValido(vendedorId) ? vendedorId : null;
      if (vendedorIdSanitizado) {
        const { data: usuarioExiste } = await supabase
          .from('usuarios_loja')
          .select('id')
          .eq('id', vendedorIdSanitizado)
          .limit(1);

        if (!usuarioExiste || usuarioExiste.length === 0) {
          vendedorIdSanitizado = null;
        }
      }

      const clienteIdSanitizado = clienteSelecionado && SyncService.isUuidValido(clienteSelecionado.id) ? clienteSelecionado.id : null;

      const statusFinal = pedidoEmEdicao?.status || 'pendente';
      let obsLimpa = (pedidoEmEdicao?.observacoes || '')
        .replace(/\[DESCONTO_PERC:[0-9.]+\]/g, '')
        .replace(/\[PAG_PREVISTO:.*?\]/g, '')
        .replace(/<!--HUBI_HISTORICO:.*?-->/g, '')
        .trim();

      let metaExistente: Record<string, any> = {};
      if (pedidoEmEdicao?.metadados) {
        try {
          metaExistente = typeof pedidoEmEdicao.metadados === 'string'
            ? JSON.parse(pedidoEmEdicao.metadados)
            : { ...pedidoEmEdicao.metadados };
        } catch (e) {}
      }

      const novosMetadados: Record<string, any> = {
        ...metaExistente,
        ...(tipoDesconto === 'percentual' && descontoPercentual > 0 ? { desconto_percentual: descontoPercentual } : {})
      };
      if (tipoDesconto !== 'percentual') {
        delete novosMetadados.desconto_percentual;
      }

      const dadosBasePedido = {
        loja_id: loja.id,
        vendedor_id: vendedorIdSanitizado,
        cliente_id: clienteIdSanitizado,
        origem: 'pdv_desktop' as const,
        tabela_preco_aplicada: tabelaPrecoCalculada,
        status: statusFinal as any,
        status_pagamento: 'aguardando_pagamento' as const,
        subtotal,
        valor_desconto: desconto,
        valor_frete: taxaEntrega,
        valor_total: total,
        valor_pago: 0,
        saldo_devedor: total,
        fiado_quitado: false,
        observacoes: obsLimpa || null,
        metadados: Object.keys(novosMetadados).length > 0 ? novosMetadados : null,
        data_venda: dataIso
      };

      const itensFormatados = itens.map(item => ({
        loja_id: loja.id,
        produto_id: item.produto.id,
        variacao_id: item.variacao && SyncService.isUuidValido(item.variacao.id) ? item.variacao.id : null,
        tabela_preco_utilizada: item.tabelaPrecoUtilizada,
        nome_produto: item.produto.nome,
        rotulo_variacao: item.variacao ? `${item.variacao.valor_variacao_1} ${item.variacao.valor_variacao_2 || ''}`.trim() : null,
        preco_custo_unitario: item.variacao?.preco_custo || item.produto.preco_custo || 0,
        preco_venda_unitario: item.precoUnitario,
        quantidade: item.quantidade,
        subtotal: item.subtotal,
        observacoes: item.observacoes || null
      }));

      if (navigator.onLine) {
        if (pedidoEmEdicao?.id) {
          // Atualiza pedido pendente existente
          const { error: erroUpdate } = await supabase
            .from('pedidos')
            .update({
              ...dadosBasePedido,
              atualizado_em: dataIso
            })
            .eq('id', pedidoEmEdicao.id);

          if (erroUpdate) throw erroUpdate;

          // Deleta itens antigos e insere os novos
          await supabase.from('itens_pedido').delete().eq('pedido_id', pedidoEmEdicao.id);
          const itensComId = itensFormatados.map(it => ({ ...it, pedido_id: pedidoEmEdicao.id }));
          const { error: erroItens } = await supabase.from('itens_pedido').insert(itensComId);
          if (erroItens) throw erroItens;
        } else {
          // Insere novo pedido pendente
          const { data: pedidoCriado, error: erroPedido } = await supabase
            .from('pedidos')
            .insert([dadosBasePedido])
            .select()
            .single();

          if (erroPedido || !pedidoCriado) throw erroPedido;

          const itensComId = itensFormatados.map(it => ({ ...it, pedido_id: pedidoCriado.id }));
          const { error: erroItens } = await supabase.from('itens_pedido').insert(itensComId);
          if (erroItens) throw erroItens;
        }
      }

      audioService.playBeep();
      const eraEdicao = !!pedidoEmEdicao;
      limparCarrinho();
      mostrarSucesso('Pedido salvo com sucesso');
      if (eraEdicao) {
        navigate('/orders');
      }
    } catch (err: any) {
      console.error('Erro ao salvar pedido:', err);
      mostrarErro(`Erro ao salvar pedido: ${err.message || 'Tente novamente.'}`);
    } finally {
      setSalvandoPendente(false);
    }
  };

  const handleSalvarComFormaPagamento = async () => {
    if (!loja?.id) {
      mostrarErro('Estabelecimento não selecionado. Por favor, recarregue a página.');
      return;
    }
    if (itens.length === 0) {
      mostrarAviso('O carrinho está vazio. Adicione produtos antes de salvar.');
      return;
    }

    let fpFinal = formaPagamentoEscolhida;
    if (!fpFinal) {
      const listaFPs = (formasPagamento && formasPagamento.length > 0) ? formasPagamento : FORMAS_PADRAO;
      fpFinal = listaFPs[0];
      setFormaPagamentoEscolhida(fpFinal);
    }

    try {
      setSalvandoPendente(true);
      const dataIso = new Date().toISOString();
      let vendedorIdSanitizado: string | null = usuario?.id && SyncService.isUuidValido(usuario.id) ? usuario.id : null;
      const clienteIdSanitizado = clienteSelecionado && SyncService.isUuidValido(clienteSelecionado.id) ? clienteSelecionado.id : null;

      let obsFinal = pedidoEmEdicao?.observacoes || '';
      obsFinal = obsFinal.replace(/\[DESCONTO_PERC:[0-9.]+\]/g, '').trim();
      obsFinal = obsFinal.replace(/\[PAG_PREVISTO:.*?\]/g, '').trim();

      const metaExistente = (pedidoEmEdicao?.metadados && typeof pedidoEmEdicao.metadados === 'object')
        ? { ...pedidoEmEdicao.metadados }
        : {};

      if (tipoDesconto === 'percentual' && descontoPercentual > 0) {
        metaExistente.desconto_percentual = descontoPercentual;
      } else {
        delete metaExistente.desconto_percentual;
      }

      const valEntregueNum = parseFloat(String(valorRecebidoDinheiro).replace(',', '.')) || 0;
      const trocoNum = valEntregueNum > total ? (valEntregueNum - total) : 0;

      if (fpFinal) {
        metaExistente.pagamento_previsto = {
          forma_pagamento_id: fpFinal.id,
          forma_tipo: fpFinal.tipo,
          forma_nome: fpFinal.nome,
          valor_entregue: valEntregueNum > 0 ? valEntregueNum : null,
          troco: trocoNum > 0 ? trocoNum : null,
          parcelas: parcelasCartao || 1
        };
      }

      const statusFinal = pedidoEmEdicao?.status || 'pendente';

      const dadosBasePedido = {
        loja_id: loja.id,
        vendedor_id: vendedorIdSanitizado,
        cliente_id: clienteIdSanitizado,
        origem: 'pdv_desktop' as const,
        tabela_preco_aplicada: tabelaPrecoCalculada,
        status: statusFinal as any,
        status_pagamento: 'aguardando_pagamento' as const,
        subtotal,
        valor_desconto: desconto,
        valor_frete: taxaEntrega,
        valor_total: total,
        valor_pago: 0,
        saldo_devedor: total,
        fiado_quitado: false,
        observacoes: obsFinal || null,
        metadados: Object.keys(metaExistente).length > 0 ? metaExistente : null,
        data_venda: dataIso
      };

      const itensFormatados = itens.map(item => ({
        loja_id: loja.id,
        produto_id: item.produto.id,
        variacao_id: item.variacao && SyncService.isUuidValido(item.variacao.id) ? item.variacao.id : null,
        tabela_preco_utilizada: item.tabelaPrecoUtilizada,
        nome_produto: item.produto.nome,
        rotulo_variacao: item.variacao ? `${item.variacao.valor_variacao_1} ${item.variacao.valor_variacao_2 || ''}`.trim() : null,
        preco_custo_unitario: item.variacao?.preco_custo || item.produto.preco_custo || 0,
        preco_venda_unitario: item.precoUnitario,
        quantidade: item.quantidade,
        subtotal: item.subtotal,
        observacoes: item.observacoes || null
      }));

      let pedidoIdFinal = '';

      if (pedidoEmEdicao?.id) {
        pedidoIdFinal = pedidoEmEdicao.id;
        const { error: erroUpdate } = await supabase
          .from('pedidos')
          .update({
            ...dadosBasePedido,
            atualizado_em: dataIso
          })
          .eq('id', pedidoEmEdicao.id);

        if (erroUpdate) throw erroUpdate;

        await supabase.from('itens_pedido').delete().eq('pedido_id', pedidoEmEdicao.id);
        const itensComId = itensFormatados.map(it => ({ ...it, pedido_id: pedidoEmEdicao.id }));
        const { error: erroItens } = await supabase.from('itens_pedido').insert(itensComId);
        if (erroItens) throw erroItens;
      } else {
        const { data: pedidoCriado, error: erroPedido } = await supabase
          .from('pedidos')
          .insert([dadosBasePedido])
          .select()
          .single();

        if (erroPedido || !pedidoCriado) throw erroPedido;
        pedidoIdFinal = pedidoCriado.id;

        const itensComId = itensFormatados.map(it => ({ ...it, pedido_id: pedidoCriado.id }));
        const { error: erroItens } = await supabase.from('itens_pedido').insert(itensComId);
        if (erroItens) throw erroItens;
      }

      // Registra ou atualiza meio de pagamento previsto no pedido
      if (fpFinal?.id && pedidoIdFinal) {
        try {
          localStorage.setItem(`hubi_pag_previsto_${pedidoIdFinal}`, JSON.stringify({
            forma_pagamento_id: fpFinal.id,
            forma_tipo: fpFinal.tipo,
            forma_nome: fpFinal.nome,
            valor_entregue: valEntregueNum > 0 ? valEntregueNum : null,
            troco: trocoNum > 0 ? trocoNum : null,
            parcelas: parcelasCartao || 1
          }));
        } catch (e) {}

        await supabase.from('pagamentos_pedido').delete().eq('pedido_id', pedidoIdFinal);
        await supabase.from('pagamentos_pedido').insert([{
          loja_id: loja.id,
          pedido_id: pedidoIdFinal,
          forma_pagamento_id: fpFinal.id,
          valor: total,
          parcelas: parcelasCartao,
          valor_taxa: 0,
          valor_liquido: total,
          data_pagamento: dataIso,
          eh_pagamento_fiado: fpFinal.tipo === 'fiado'
        }]);
      }

      audioService.playBeep();
      setModalFechamento(false);
      const eraEdicao = !!pedidoEmEdicao;
      limparCarrinho();
      mostrarSucesso('Pedido salvo com sucesso');
      if (eraEdicao) {
        navigate('/orders');
      }
    } catch (err: any) {
      console.error('Erro ao salvar pedido com forma de pagamento:', err);
      mostrarErro(`Erro ao salvar pedido: ${err.message || 'Tente novamente.'}`);
    } finally {
      setSalvandoPendente(false);
    }
  };

  const handleFinalizarVenda = async () => {
    if (!loja?.id) {
      mostrarErro('Erro: Estabelecimento não selecionado. Por favor, recarregue a página.');
      return;
    }
    if (itens.length === 0) {
      mostrarAviso('O carrinho está vazio. Adicione produtos antes de fechar a venda.');
      return;
    }

    // Garantir que haja um meio de pagamento selecionado
    let fpFinal = formaPagamentoEscolhida;
    if (!fpFinal) {
      const listaFPs = (formasPagamento && formasPagamento.length > 0) ? formasPagamento : FORMAS_PADRAO;
      fpFinal = listaFPs[0];
      setFormaPagamentoEscolhida(fpFinal);
    }

    const ehFiado = fpFinal.tipo === 'fiado';
    if (ehFiado && !clienteSelecionado) {
      mostrarAviso('Para vendas no FIADO / A PRAZO, é obrigatório selecionar um cliente cadastrado.', 'Cliente Obrigatório');
      return;
    }

    try {
      setFinalizandoVenda(true);
      setEhVendaOfflineSalva(false);

      // Obter ou resolver ID de operador/vendedor
      let vendedorId: string = usuario?.id || '';
      if (!vendedorId) {
        const { data: u } = await supabase
          .from('usuarios_loja')
          .select('id')
          .eq('loja_id', loja.id)
          .limit(1);

        if (u && u.length > 0) {
          vendedorId = u[0].id;
        } else {
          vendedorId = loja.id;
        }
      }

      const taxaValor = (total * Number(fpFinal.taxa_percentual || 0)) / 100;
      const valorLiquido = total - taxaValor;
      const dataIso = new Date().toISOString();

      let obsFinal = pedidoEmEdicao?.observacoes || '';
      obsFinal = obsFinal.replace(/\[DESCONTO_PERC:[0-9.]+\]/g, '').trim();
      obsFinal = obsFinal.replace(/\[PAG_PREVISTO:.*?\]/g, '').trim();

      const metaExistente = (pedidoEmEdicao?.metadados && typeof pedidoEmEdicao.metadados === 'object')
        ? { ...pedidoEmEdicao.metadados }
        : {};

      if (tipoDesconto === 'percentual' && descontoPercentual > 0) {
        metaExistente.desconto_percentual = descontoPercentual;
      } else {
        delete metaExistente.desconto_percentual;
      }
      delete metaExistente.pagamento_previsto;

      const statusFinal = (pedidoEmEdicao?.status && pedidoEmEdicao.status !== 'pendente' ? pedidoEmEdicao.status : 'confirmado');

      const dadosBasePedido = {
        loja_id: loja.id,
        vendedor_id: vendedorId,
        cliente_id: clienteSelecionado ? clienteSelecionado.id : null,
        origem: 'pdv_desktop' as const,
        tabela_preco_aplicada: tabelaPrecoCalculada,
        status: statusFinal as any,
        status_pagamento: (ehFiado ? 'aguardando_pagamento' : 'pago') as StatusPagamento,
        subtotal,
        valor_desconto: desconto,
        valor_frete: taxaEntrega,
        valor_total: total,
        valor_pago: ehFiado ? 0 : total,
        saldo_devedor: ehFiado ? total : 0,
        fiado_quitado: !ehFiado,
        observacoes: obsFinal || null,
        metadados: Object.keys(metaExistente).length > 0 ? metaExistente : null,
        data_venda: dataIso
      };

      const itensFormatados = itens.map(item => ({
        loja_id: loja.id,
        produto_id: item.produto.id,
        variacao_id: item.variacao ? item.variacao.id : null,
        tabela_preco_utilizada: item.tabelaPrecoUtilizada,
        nome_produto: item.produto.nome,
        rotulo_variacao: item.variacao ? `${item.variacao.valor_variacao_1} ${item.variacao.valor_variacao_2 || ''}`.trim() : null,
        preco_custo_unitario: item.variacao?.preco_custo || item.produto.preco_custo || 0,
        preco_venda_unitario: item.precoUnitario,
        quantidade: item.quantidade,
        subtotal: item.subtotal,
        observacoes: item.observacoes || null
      }));

      const dadosPagamento = {
        loja_id: loja.id,
        forma_pagamento_id: fpFinal.id,
        valor: total,
        parcelas: parcelasCartao,
        valor_taxa: taxaValor,
        valor_liquido: valorLiquido,
        data_pagamento: dataIso,
        eh_pagamento_fiado: ehFiado
      };

      // Se estiver online, tenta enviar direto para o Supabase
      if (navigator.onLine) {
        try {
          // 1. Resolver forma de pagamento UUID real existente no Supabase
          const fpIdReal = await SyncService.resolverFormaPagamentoId(
            loja.id,
            fpFinal.id,
            fpFinal.tipo
          );

          // 2. Sanitizar vendedor_id (se não for UUID existente em usuarios_loja, passar null para não violar FK)
          let vendedorIdSanitizado: string | null = SyncService.isUuidValido(vendedorId) ? vendedorId : null;
          if (vendedorIdSanitizado) {
            const { data: usuarioExiste } = await supabase
              .from('usuarios_loja')
              .select('id')
              .eq('id', vendedorIdSanitizado)
              .limit(1);

            if (!usuarioExiste || usuarioExiste.length === 0) {
              vendedorIdSanitizado = null;
            }
          }

          const clienteIdSanitizado = clienteSelecionado && SyncService.isUuidValido(clienteSelecionado.id) ? clienteSelecionado.id : null;

          const payloadPedido = {
            ...dadosBasePedido,
            vendedor_id: vendedorIdSanitizado,
            cliente_id: clienteIdSanitizado
          };

          let pedidoCriado: any;

          if (pedidoEmEdicao?.id) {
            const { data: pedAtualizado, error: erroUpd } = await supabase
              .from('pedidos')
              .update({
                ...payloadPedido,
                atualizado_em: dataIso
              })
              .eq('id', pedidoEmEdicao.id)
              .select()
              .single();

            if (erroUpd || !pedAtualizado) throw erroUpd;
            pedidoCriado = pedAtualizado;

            await supabase.from('itens_pedido').delete().eq('pedido_id', pedidoEmEdicao.id);
          } else {
            const { data: novoPed, error: erroPedido } = await supabase
              .from('pedidos')
              .insert([payloadPedido])
              .select()
              .single();

            if (erroPedido || !novoPed) throw erroPedido;
            pedidoCriado = novoPed;
          }

          const itensComId = itensFormatados.map(it => ({
            ...it,
            variacao_id: SyncService.isUuidValido(it.variacao_id) ? it.variacao_id : null,
            pedido_id: pedidoCriado.id
          }));
          const { error: erroItens } = await supabase.from('itens_pedido').insert(itensComId);
          if (erroItens) throw erroItens;

          // Remove quaisquer formas de pagamento anteriores registradas para este pedido (evita pagamentos duplicados / não efetivados)
          await supabase.from('pagamentos_pedido').delete().eq('pedido_id', pedidoCriado.id);

          const { error: erroPagamento } = await supabase.from('pagamentos_pedido').insert([{
            ...dadosPagamento,
            forma_pagamento_id: fpIdReal,
            pedido_id: pedidoCriado.id
          }]);
          if (erroPagamento) throw erroPagamento;

          const pedidoCompleto: Pedido = {
            ...pedidoCriado,
            cliente: clienteSelecionado,
            vendedor: usuario,
            itens: itensComId as any,
            pagamentos: [{
              ...dadosPagamento,
              forma_pagamento_id: fpIdReal,
              pedido_id: pedidoCriado.id,
              forma_pagamento: fpFinal
            }] as any
          };

          setEhVendaOfflineSalva(false);
          setPedidoConcluido(pedidoCompleto);
          setModalFechamento(false);
          limparCarrinho();
          setValorRecebidoDinheiro('');
          return;
        } catch (nuvemErr) {
          console.warn('Falha no envio para o Supabase, realizando fallback para o banco offline local:', nuvemErr);
          // Continua para o salvamento offline abaixo
        }
      }

      // SALVAMENTO OFFLINE RESILIENTE (IndexedDB)
      const idLocal = 'offline_' + (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now()));
      const numPedidoOffline = Math.floor(100000 + Math.random() * 900000);

      const vendaOffline: VendaOfflineFila = {
        id_local: idLocal,
        ...dadosBasePedido,
        itens: itensFormatados,
        pagamento: dadosPagamento,
        cliente_dados: clienteSelecionado,
        vendedor_dados: usuario,
        criado_em: dataIso,
        tentativas_sync: 0
      };

      await SyncService.registrarVendaOffline(vendaOffline);
      await atualizarContadorPendentes();

      // Abater estoque local em memória para resposta instantânea
      setProdutos(prev => prev.map(p => {
        const itemVendido = itens.find(it => it.produto.id === p.id);
        if (itemVendido) {
          return {
            ...p,
            quantidade_estoque: Math.max(0, (p.quantidade_estoque || 0) - itemVendido.quantidade)
          };
        }
        return p;
      }));

      const pedidoOfflineCompleto: Pedido = {
        id: idLocal,
        numero_pedido: numPedidoOffline,
        ...dadosBasePedido,
        cliente: clienteSelecionado,
        vendedor: usuario,
        itens: itensFormatados.map(it => ({
          ...it,
          id: idLocal + '_' + it.produto_id,
          tabela_preco_utilizada: it.tabela_preco_utilizada as TabelaPreco
        })) as ItemPedido[],
        criado_em: dataIso
      };

      setEhVendaOfflineSalva(true);
      setPedidoConcluido(pedidoOfflineCompleto);
      setModalFechamento(false);
      limparCarrinho();
      setValorRecebidoDinheiro('');
    } catch (err: any) {
      console.error('Erro ao finalizar venda:', err);
      mostrarErro(err.message || 'Tente novamente.', 'Erro ao processar venda');
    } finally {
      setFinalizandoVenda(false);
    }
  };

  const categoriasOrdenadas = useMemo(() => {
    return [...categorias].sort((a, b) => {
      const pesoA = getCategoriaPeso(a.nome);
      const pesoB = getCategoriaPeso(b.nome);
      if (pesoA !== pesoB) return pesoA - pesoB;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }, [categorias]);

  const mapaCategorias = useMemo(() => {
    const mapa = new Map<string, { nome: string; peso: number }>();
    categorias.forEach(c => {
      mapa.set(c.id, { nome: c.nome, peso: getCategoriaPeso(c.nome) });
    });
    return mapa;
  }, [categorias]);

  const produtosFiltrados = useMemo(() => {
    const termo = buscaProduto.toLowerCase().trim();

    const filtrados = produtos.filter(p => {
      // Filtro de categoria selecionada no dropdown
      if (categoriaSelecionada !== 'todas' && p.categoria_id !== categoriaSelecionada) {
        return false;
      }

      // Filtro de busca por texto / código
      if (!termo) return true;
      return (
        p.nome.toLowerCase().includes(termo) ||
        (p.codigo_interno && p.codigo_interno.toLowerCase().includes(termo)) ||
        (p.codigo_barras && p.codigo_barras.includes(termo))
      );
    });

    // Ordenação com prioridade: 1º Cosméticos, 2º Brinquedos Eróticos, 3º Próteses, 4º Fantasias, 5º Couro/Sado
    return filtrados.sort((a, b) => {
      const pesoA = a.categoria_id ? (mapaCategorias.get(a.categoria_id)?.peso ?? 999) : 999;
      const pesoB = b.categoria_id ? (mapaCategorias.get(b.categoria_id)?.peso ?? 999) : 999;
      if (pesoA !== pesoB) return pesoA - pesoB;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }, [produtos, buscaProduto, categoriaSelecionada, mapaCategorias]);

  const trocoCalculado = Math.max(0, (Number(valorRecebidoDinheiro) || 0) - total);

  return (
    <div className="h-full w-full overflow-hidden bg-slate-950">
      {/* 1. VISUALIZAÇÃO MOBILE EXCLUSIVA (TELAS 001 A 008) */}
      <div className="block lg:hidden h-full overflow-hidden">
        <PosCheckoutMobile
          produtos={produtos}
          categorias={categoriasOrdenadas}
          clientes={clientes}
          formasPagamento={formasPagamento}
          pedidosConfirmadosCount={0}
          onAbrirFechamento={handleAbrirFechamento}
          onAbrirNovoCliente={() => setModalNovoCliente(true)}
          onAbrirVariacoesModal={(produto) => setProdutoModalVariacao(produto)}
          isOnline={isOnline}
          pendentesCount={pendentesCount}
        />
      </div>

      {/* 2. VISUALIZAÇÃO DESKTOP (MANTIDA 100% INTACTA) */}
      <div className="hidden lg:flex h-full flex-col lg:flex-row overflow-hidden bg-slate-950">
        {/* PAINEL ESQUERDO: CATÁLOGO & BUSCA */}
        <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-slate-800/80">
        {/* Topo do PDV: Busca, Tabela de Preço e Status de Conexão */}
        <div className="p-3.5 border-b border-slate-800 bg-slate-900/60 backdrop-blur space-y-3">
          {/* Barra de Status de Conexão e Sincronização */}
          <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-800/60">
            <div className="flex items-center gap-2">
              {isOnline ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold text-[11px] border border-emerald-500/30">
                  <Wifi className="w-3 h-3" />
                  <span>Online (Sincronizado)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-bold text-[11px] border border-amber-500/30">
                  <WifiOff className="w-3 h-3 text-amber-400 animate-pulse" />
                  <span>Modo Offline</span>
                </span>
              )}

              {pendentesCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] font-semibold border border-indigo-500/30">
                  <CloudOff className="w-3 h-3" />
                  <span>{pendentesCount} venda(s) na fila</span>
                </span>
              )}

              {ultimoSyncMsg && (
                <span className="text-[11px] text-emerald-400 font-medium animate-in fade-in">
                  {ultimoSyncMsg}
                </span>
              )}
            </div>

            {isOnline && pendentesCount > 0 && (
              <button
                type="button"
                onClick={sincronizarAgora}
                disabled={sincronizando}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] transition cursor-pointer disabled:opacity-50"
                title="Enviar vendas salvas offline para o Supabase agora"
              >
                <RefreshCw className={`w-3 h-3 ${sincronizando ? 'animate-spin' : ''}`} />
                <span>{sincronizando ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2">
            {/* Seletor Dropdown de Categorias */}
            <div className="relative w-full sm:w-56 shrink-0">
              <Layers className="w-4 h-4 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={categoriaSelecionada}
                onChange={(e) => setCategoriaSelecionada(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700/80 hover:border-slate-600 focus:border-emerald-500 rounded-xl pl-9 pr-8 py-2 text-xs font-semibold text-slate-200 focus:outline-none transition appearance-none cursor-pointer"
                title="Filtrar produtos por categoria"
              >
                <option value="todas" className="bg-slate-900 text-slate-200">
                  Todas as Categorias ({produtos.length})
                </option>
                {categoriasOrdenadas.map((cat) => {
                  const totalCat = produtos.filter(p => p.categoria_id === cat.id).length;
                  return (
                    <option key={cat.id} value={cat.id} className="bg-slate-900 text-slate-200">
                      {cat.nome} ({totalCat})
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Campo de Busca por Nome / Código (Tamanho Otimizado) */}
            <div className="relative flex-1 w-full min-w-[170px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar produto por nome, cód..."
                value={buscaProduto}
                onChange={(e) => setBuscaProduto(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700/80 focus:border-emerald-500 rounded-xl pl-10 pr-8 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none transition"
              />
              {buscaProduto && (
                <button
                  type="button"
                  onClick={() => setBuscaProduto('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
                  title="Limpar busca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Leitor de Código de Barras / Câmera */}
            <form onSubmit={handleBarcodeSubmit} className="relative w-full sm:w-52 shrink-0 flex items-center">
              <Barcode className="w-4 h-4 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Cód. Barras (Enter)"
                value={buscaCodigoBarras}
                onChange={(e) => setBuscaCodigoBarras(e.target.value)}
                className="w-full bg-slate-800/80 border border-emerald-500/40 focus:border-emerald-500 rounded-xl pl-9 pr-9 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none transition"
              />
              <button
                type="button"
                onClick={() => setModalCameraBarcode(true)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 transition cursor-pointer"
                title="Escanear Código de Barras pela Câmera (Mobile/Desktop)"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>

        {/* Grid de Produtos */}
        <div className="flex-1 overflow-y-auto p-3.5">
          {carregando ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">Carregando catálogo de produtos...</div>
          ) : produtosFiltrados.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">Nenhum produto encontrado.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {produtosFiltrados.map((produto) => {
                const fotoUrl = produto.fotos_urls?.[0] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60';
                const temEstoqueBaixo = Number(produto.quantidade_estoque) <= Number(produto.estoque_minimo_alerta);

                let precoExibido = produto.preco_venda_varejo;
                if (tabelaPrecoCalculada === 'atacado' && produto.preco_venda_atacado) precoExibido = produto.preco_venda_atacado;
                if (tabelaPrecoCalculada === 'autoatacado' && produto.preco_venda_autoatacado) precoExibido = produto.preco_venda_autoatacado;

                return (
                  <div
                    key={produto.id}
                    onClick={() => {
                      if (produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0) {
                        setProdutoModalVariacao(produto);
                      } else {
                        adicionarItem(produto);
                      }
                    }}
                    className="bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-2 cursor-pointer transition-all duration-150 flex flex-col justify-between group shadow-sm active:scale-[0.98]"
                  >
                    <div>
                      <div className="relative aspect-square rounded-lg overflow-hidden bg-slate-950 mb-1.5">
                        <img src={fotoUrl} alt={produto.nome} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                        {temEstoqueBaixo && (
                          <span className="absolute top-1 right-1 bg-amber-500/90 text-slate-950 font-black text-[8px] px-1 py-0.2 rounded shadow">
                            Est: {produto.quantidade_estoque}
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-[11px] sm:text-xs text-slate-100 line-clamp-2 leading-tight">
                        {produto.nome}
                      </h3>
                      {produto.codigo_interno && (
                        <span className="text-[9px] text-slate-500 block mt-0.5 font-mono">#{produto.codigo_interno}</span>
                      )}
                    </div>

                    <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="font-black text-emerald-400 text-xs">
                        R$ {Number(precoExibido).toFixed(2)}
                      </span>
                      <span className="w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white flex items-center justify-center transition">
                        <Plus className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* PAINEL DIREITO: CARRINHO & TOTAL */}
      <div className="w-full lg:w-[380px] bg-slate-900 flex flex-col h-full border-t lg:border-t-0 lg:border-l border-slate-800">
        {/* Header do Carrinho & Seleção de Cliente */}
        <div className="p-3.5 border-b border-slate-800 space-y-2.5">
          {/* Seletor de Status e Fechar X ao Editar Pedido */}
          {pedidoEmEdicao && (
            <div className="p-2 bg-slate-800/90 border border-slate-700/80 rounded-2xl flex items-center justify-between gap-2 animate-in fade-in">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-[11px] text-slate-400 font-semibold shrink-0">Status:</span>
                <select
                  value={pedidoEmEdicao.status || 'pendente'}
                  onChange={(e) => atualizarStatusPedidoEmEdicao(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 text-emerald-400 font-bold text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer capitalize"
                >
                  <option value="pendente">Pendente</option>
                  <option value="confirmado">Confirmado</option>
                  <option value="em_separacao">Em separação</option>
                  <option value="em_producao">Em produção</option>
                  <option value="em_expedicao">Em expedição</option>
                  <option value="saiu_para_entrega">Saiu para Entrega</option>
                  <option value="pronto_para_retirar">Pronto para retirar</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  cancelarEdicaoPedido();
                  navigate('/orders');
                }}
                className="p-1.5 rounded-xl bg-slate-700/60 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition cursor-pointer shrink-0"
                title="Fechar e voltar para Pedidos"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <span>Carrinho de Venda</span>
              <span className="text-[11px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full">
                {totalItens} un
              </span>
            </h2>
            {itens.length > 0 && (
              <button onClick={limparCarrinho} className="text-xs text-rose-400 hover:text-rose-300 font-medium">
                Limpar
              </button>
            )}
          </div>

          {/* SELEÇÃO E BUSCA DIGITÁVEL DE CLIENTE */}
          <div className="relative" ref={clienteDropdownRef}>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar cliente ou avulso..."
                  value={clienteSelecionado ? clienteSelecionado.nome : clienteBuscaTexto}
                  onChange={(e) => {
                    if (clienteSelecionado) {
                      setClienteSelecionado(null);
                    }
                    setClienteBuscaTexto(e.target.value);
                    setClienteDropdownAberto(true);
                  }}
                  onFocus={() => setClienteDropdownAberto(true)}
                  className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl pl-9 pr-14 py-2 text-xs text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 transition font-medium"
                />

                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  {clienteSelecionado && (
                    <button
                      type="button"
                      onClick={() => {
                        setClienteSelecionado(null);
                        setClienteBuscaTexto('');
                      }}
                      className="p-1 text-slate-400 hover:text-rose-400 rounded-md transition cursor-pointer"
                      title="Remover cliente selecionado"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setClienteDropdownAberto(prev => !prev)}
                    className="p-1 text-slate-400 hover:text-slate-200 rounded-md transition cursor-pointer"
                    title="Ver lista completa de clientes"
                  >
                    {clienteDropdownAberto ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalNovoCliente(true)}
                className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition flex items-center justify-center shrink-0"
                title="Cadastrar Novo Cliente"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Dropdown de Clientes com busca e seleção */}
            {clienteDropdownAberto && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto animate-in fade-in">
                <button
                  type="button"
                  onClick={() => {
                    setClienteSelecionado(null);
                    setClienteBuscaTexto('');
                    setClienteDropdownAberto(false);
                  }}
                  className={`w-full p-2.5 text-left text-xs font-medium flex items-center justify-between border-b border-slate-800 transition cursor-pointer ${
                    !clienteSelecionado ? 'bg-emerald-500/15 text-emerald-300 font-bold' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>👤 Cliente Avulso (Balcão)</span>
                  {!clienteSelecionado && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>

                {clientesFiltrados.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-500">Nenhum cliente encontrado.</div>
                ) : (
                  clientesFiltrados.map((cli) => {
                    const isSelected = clienteSelecionado?.id === cli.id;
                    return (
                      <button
                        key={cli.id}
                        type="button"
                        onClick={() => {
                          setClienteSelecionado(cli);
                          setClienteBuscaTexto('');
                          setClienteDropdownAberto(false);
                        }}
                        className={`w-full p-2.5 text-left text-xs flex items-center justify-between border-b border-slate-800/60 transition cursor-pointer ${
                          isSelected ? 'bg-emerald-500/15 text-emerald-300 font-bold' : 'text-slate-200 hover:bg-slate-800/80'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <span className="block truncate font-bold">{cli.nome}</span>
                          {(cli.whatsapp || cli.telefone) && (
                            <span className="text-[10px] text-slate-400 block truncate">
                              Tel: {cli.whatsapp || cli.telefone}
                            </span>
                          )}
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* FRAME DE ESCOLHA DO TIPO DE VENDA (ABAIXO DO CLIENTE) */}
          <div className="p-2.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Tipo da Venda:</span>
                <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                  {tabelaPrecoCalculada === 'autoatacado' ? 'Distribuidor' : tabelaPrecoCalculada === 'atacado' ? 'Atacado' : 'Varejo'}
                </span>
              </div>
            </div>

            {/* Se for Admin/Owner pode alterar manualmente; se for Comum/Vendedor fica bloqueado */}
            {permissions.ehAdmin ? (
              <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800">
                {(['varejo', 'atacado', 'autoatacado'] as TabelaPreco[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setTabelaPrecoGlobal(tab)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase transition cursor-pointer ${
                      tabelaPrecoCalculada === tab
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab === 'autoatacado' ? 'Distr.' : tab === 'atacado' ? 'Atac.' : 'Var.'}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-slate-500 font-medium bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
                Fixo pelo Perfil
              </span>
            )}
          </div>

          {/* BADGE DA TABELA ATIVA & PROGRESSO NO PDV */}
          {itens.length > 0 && (
            <div className={`p-2.5 rounded-xl border transition text-xs font-bold space-y-1.5 ${
              tabelaPrecoCalculada === 'autoatacado'
                ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                : tabelaPrecoCalculada === 'atacado'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-300'
            }`}>
              <div className="flex items-center justify-between">
                <span>
                  {tabelaPrecoCalculada === 'autoatacado' ? '⚡ Tabela: Distribuidor' : tabelaPrecoCalculada === 'atacado' ? '🏷️ Tabela: Atacado' : '🛒 Tabela: Varejo'}
                </span>
                {avaliacaoCarrinho.economiaTotal > 0 && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-black">
                    -R$ {avaliacaoCarrinho.economiaTotal.toFixed(2)}
                  </span>
                )}
              </div>

              {avaliacaoCarrinho.proximoNivel && (
                <div className="text-[10px] font-normal text-slate-300 pt-1 border-t border-slate-700/50 flex justify-between items-center">
                  <span>
                    {(() => {
                      const proxNome = avaliacaoCarrinho.proximoNivel === 'autoatacado' ? 'Distribuidor' : 'Atacado';
                      const isAuto = avaliacaoCarrinho.proximoNivel === 'autoatacado';
                      const valMin = isAuto ? loja?.valor_minimo_padrao_autoatacado : loja?.valor_minimo_padrao_atacado;
                      const qtdMin = isAuto ? loja?.qtd_minima_padrao_autoatacado : loja?.qtd_minima_padrao_atacado;
                      const tipoMin = isAuto ? loja?.tipo_minimo_padrao_autoatacado : loja?.tipo_minimo_padrao_atacado;

                      if (tipoMin === 'quantidade' || (Number(qtdMin) > 0 && (!valMin || Number(valMin) === 0))) {
                        const faltamPecas = avaliacaoCarrinho.faltaPecasParaProximo;
                        return `Faltam ${faltamPecas} ${faltamPecas === 1 ? 'peça' : 'peças'} para ${proxNome}`;
                      }
                      const faltaVal = avaliacaoCarrinho.faltaValorParaProximo;
                      return `Faltam R$ ${faltaVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} para ${proxNome}`;
                    })()}
                  </span>
                  <span className="font-bold text-amber-300">{avaliacaoCarrinho.progressoGeralPercent}%</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lista de Itens do Carrinho */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {itens.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 space-y-2 py-12">
              <Layers className="w-10 h-10 opacity-30" />
              <p className="text-xs">O carrinho está vazio.<br />Adicione produtos ou bipe o código de barras.</p>
            </div>
          ) : (
            itens.map((item) => {
              const skuFracionado = avaliacaoCarrinho.skusFracionados.find(s => s.id === item.id);

              return (
                <div
                  key={item.id}
                  className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-2.5 space-y-1.5 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-xs text-slate-200 truncate">{item.produto.nome}</h4>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                        {item.variacao && (
                          <span className="text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded font-medium">
                            {item.variacao.valor_variacao_1} {item.variacao.valor_variacao_2 || ''}
                          </span>
                        )}
                        <span>R$ {item.precoUnitario.toFixed(2)} / un</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center border border-slate-700 bg-slate-900 rounded-lg overflow-hidden">
                        <button onClick={() => atualizarQuantidade(item.id, item.quantidade - 1)} className="p-1 text-slate-400 hover:text-white">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2 text-xs font-bold text-slate-100">{item.quantidade}</span>
                        <button onClick={() => atualizarQuantidade(item.id, item.quantidade + 1)} className="p-1 text-slate-400 hover:text-white">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <span className="font-bold text-xs text-emerald-400 w-16 text-right">
                        R$ {item.subtotal.toFixed(2)}
                      </span>

                      <button onClick={() => removerItem(item.id)} className="text-slate-500 hover:text-rose-400 p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {skuFracionado && (
                    <div className="p-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between text-[10px] text-amber-300">
                      <span>Mín. {skuFracionado.quantidadeMinimaExigida} un (faltam {skuFracionado.faltamUnidades})</span>
                      <button
                        type="button"
                        onClick={() => atualizarQuantidade(item.id, item.quantidade + skuFracionado.faltamUnidades)}
                        className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-200 hover:text-slate-950 font-bold"
                      >
                        +{skuFracionado.faltamUnidades}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Resumo Financeiro & Dois Botões de Fechamento */}
        <div className="p-3.5 border-t border-slate-800 bg-slate-950/90 space-y-3">
          <div className="space-y-1.5 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="text-slate-200 font-medium">R$ {subtotal.toFixed(2)}</span>
            </div>

            {/* Desconto R$ ou % (se autorizado) */}
            {permissions.podeDarDesconto ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span>Desconto:</span>
                  <div className="inline-flex rounded-lg bg-slate-800 p-0.5 border border-slate-700 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setTipoDesconto('valor')}
                      className={`px-1.5 py-0.5 rounded font-bold transition ${
                        tipoDesconto === 'valor' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      R$
                    </button>
                    <button
                      type="button"
                      onClick={() => setTipoDesconto('percentual')}
                      className={`px-1.5 py-0.5 rounded font-bold transition ${
                        tipoDesconto === 'percentual' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      %
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {tipoDesconto === 'valor' ? (
                    <div className="flex items-center">
                      <span className="text-[11px] text-slate-500 mr-1">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={desconto > 0 ? desconto : ''}
                        onChange={(e) => setDescontoValor(parseFloat(e.target.value) || 0)}
                        placeholder="0,00"
                        className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-0.5 text-right text-xs text-rose-400 font-bold focus:outline-none focus:border-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <input
                        type="number"
                        step="0.1"
                        max="100"
                        value={descontoPercentual > 0 ? descontoPercentual : ''}
                        onChange={(e) => setDescontoPercentual(parseFloat(e.target.value) || 0)}
                        placeholder="0%"
                        className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-0.5 text-right text-xs text-rose-400 font-bold focus:outline-none focus:border-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-[11px] text-slate-500 ml-1">%</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              desconto > 0 ? (
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Desconto de Tabela:</span>
                  <span className="text-rose-400 font-bold">-R$ {desconto.toFixed(2)}</span>
                </div>
              ) : null
            )}

            {desconto > 0 && permissions.podeDarDesconto && (
              <div className="text-[10px] text-rose-400 text-right font-medium">
                -R$ {desconto.toFixed(2)} ({descontoPercentual.toFixed(1)}%)
              </div>
            )}

            <div className="flex justify-between text-base font-bold text-white pt-1.5 border-t border-slate-800">
              <span>TOTAL A PAGAR:</span>
              <span className="text-emerald-400 text-lg">R$ {total.toFixed(2)}</span>
            </div>
          </div>

          {/* DOIS BOTÕES: SALVAR PEDIDO (PENDENTE) & FINALIZAR VENDA */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              disabled={itens.length === 0 || salvandoPendente}
              onClick={handleSalvarPedidoPendente}
              className="py-3 px-2 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs shadow transition disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
              title="Salva o pedido como Pendente sem fechar pagamento"
            >
              {salvandoPendente ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              ) : (
                <FileText className="w-4 h-4 text-emerald-400" />
              )}
              <span className="truncate">{pedidoEmEdicao ? 'Atualizar Pedido' : 'Salvar Pedido'}</span>
            </button>

            <button
              type="button"
              disabled={itens.length === 0}
              onClick={handleAbrirFechamento}
              className="py-3 px-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-black text-xs shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-1.5 transition disabled:opacity-40 cursor-pointer active:scale-95"
              title="Abrir tela de pagamento e concluir venda"
            >
              <span className="truncate">Finalizar Venda</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* MODAL VARIAÇÕES */}
      {produtoModalVariacao && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-100">{produtoModalVariacao.nome}</h3>
                <span className="text-xs text-slate-400">Selecione a variação desejada:</span>
              </div>
              <button onClick={() => setProdutoModalVariacao(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {produtoModalVariacao.variacoes?.map((variacao) => (
                <button
                  key={variacao.id}
                  onClick={() => {
                    adicionarItem(produtoModalVariacao, variacao);
                    setProdutoModalVariacao(null);
                  }}
                  className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 flex items-center justify-between text-left transition cursor-pointer"
                >
                  <div>
                    <span className="font-bold text-xs text-slate-100 block">
                      {variacao.valor_variacao_1} {variacao.valor_variacao_2 ? `- ${variacao.valor_variacao_2}` : ''}
                    </span>
                    <span className="text-[10px] text-slate-400">Estoque: {variacao.quantidade_estoque} un</span>
                  </div>
                  <span className="font-bold text-emerald-400 text-xs">
                    R$ {Number(variacao.preco_venda_varejo).toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE FECHAMENTO DE VENDA */}
      {modalFechamento && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                <span>Pagamento & Fechamento</span>
              </h3>
              <button onClick={() => setModalFechamento(false)} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center space-y-1">
              <span className="text-xs text-slate-400 block font-medium">Valor Total da Venda</span>
              <span className="text-3xl sm:text-4xl font-black text-emerald-400">R$ {total.toFixed(2)}</span>
            </div>

            {/* Formas de Pagamento */}
            <div className="space-y-2.5">
              <span className="text-xs font-semibold text-slate-300 block">Selecione o Meio de Pagamento:</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {((formasPagamento && formasPagamento.length > 0) ? formasPagamento : FORMAS_PADRAO)
                  .filter(fp => permissions.podeAtivarFiado || fp.tipo !== 'fiado')
                  .map((fp) => {
                    const estaSelecionado = formaPagamentoEscolhida?.id === fp.id || (!formaPagamentoEscolhida && fp.tipo === 'dinheiro');
                    
                    return (
                      <button
                        key={fp.id}
                        type="button"
                        onClick={() => setFormaPagamentoEscolhida(fp)}
                        className={`p-3 rounded-2xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
                          estaSelecionado
                            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/10'
                            : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {fp.tipo === 'dinheiro' && <Banknote className="w-5 h-5 text-emerald-400" />}
                        {fp.tipo === 'pix' && <Zap className="w-5 h-5 text-cyan-400" />}
                        {fp.tipo === 'cartao_debito' && <CreditCard className="w-5 h-5 text-blue-400" />}
                        {fp.tipo === 'cartao_credito' && <CreditCard className="w-5 h-5 text-purple-400" />}
                        {fp.tipo === 'fiado' && <FileText className="w-5 h-5 text-amber-400" />}
                        {fp.tipo !== 'dinheiro' && fp.tipo !== 'pix' && fp.tipo !== 'cartao_debito' && fp.tipo !== 'cartao_credito' && fp.tipo !== 'fiado' && (
                          <CreditCard className="w-5 h-5 text-slate-400" />
                        )}
                        <span className="truncate max-w-full">{fp.nome}</span>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Dinheiro (Cálculo de Troco) */}
            {formaPagamentoEscolhida?.tipo === 'dinheiro' && (
              <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Valor Entregue pelo Cliente:</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={valorRecebidoDinheiro}
                    onChange={(e) => setValorRecebidoDinheiro(e.target.value)}
                    className="w-32 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-right text-xs font-bold text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                {Number(valorRecebidoDinheiro) > 0 && (
                  <div className="flex justify-between text-xs font-bold text-amber-400 pt-1.5 border-t border-slate-800/80">
                    <span>Troco:</span>
                    <span>R$ {trocoCalculado.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Fiado (Aviso de Cliente) */}
            {formaPagamentoEscolhida?.tipo === 'fiado' && (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-300">Cliente Fiado:</span>
                  <span className="text-slate-200 font-semibold">{clienteSelecionado ? clienteSelecionado.nome : 'Nenhum cliente selecionado'}</span>
                </div>
                {!clienteSelecionado && (
                  <p className="text-[11px] text-rose-400 font-medium">
                    ⚠️ Selecione um cliente no carrinho antes de confirmar venda a prazo (fiado).
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalFechamento(false)}
                className="py-3.5 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={salvandoPendente || finalizandoVenda}
                onClick={handleSalvarComFormaPagamento}
                className="flex-1 py-3.5 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 font-bold text-xs border border-emerald-500/40 shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                {salvandoPendente ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                ) : (
                  <FileText className="w-4 h-4 text-emerald-400" />
                )}
                <span>Salvar</span>
              </button>

              <button
                type="button"
                disabled={finalizandoVenda || salvandoPendente}
                onClick={handleFinalizarVenda}
                className="flex-[2] py-3.5 px-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold text-xs shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer active:scale-98"
              >
                {finalizandoVenda ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="truncate">Confirmar e Concluir</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE RECIBO & FINALIZAÇÃO */}
      {pedidoConcluido && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Topo do Modal */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-100 text-sm">
                    {ehVendaOfflineSalva ? 'Venda Salva (Modo Offline)!' : 'Venda Concluída com Sucesso!'}
                  </h3>
                  <p className="text-[11px] text-slate-400">Recibo do Pedido #{pedidoConcluido.numero_pedido}</p>
                </div>
              </div>
              <button
                onClick={() => setPedidoConcluido(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Visualização do Cupom/Recibo Conforme Modelo dos Logs */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {ehVendaOfflineSalva && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <CloudOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Armazenado com segurança localmente</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    O pedido foi gravado no dispositivo e será sincronizado com a nuvem assim que houver conexão.
                  </p>
                </div>
              )}

              <div className="bg-white text-slate-900 p-6 rounded-2xl border border-slate-200 text-xs space-y-3 shadow-xl font-mono">
                {/* Logo da Loja se houver */}
                {loja?.url_logo && (
                  <div className="text-center pb-1">
                    <img src={loja.url_logo} alt={loja.nome_fantasia} className="max-h-12 max-w-[160px] mx-auto object-contain" />
                  </div>
                )}

                {/* Título RECIBO # */}
                <div className="text-center border-b border-slate-200 border-dashed pb-2">
                  <h4 className="font-black text-slate-900 text-base tracking-wide uppercase">
                    RECIBO #{pedidoConcluido.numero_pedido}
                  </h4>
                  <p className="font-bold text-slate-800 uppercase text-[11px]">{loja?.nome_fantasia || 'HUBI PDV'}</p>
                  <p className="text-slate-500 text-[10px]">
                    {[loja?.endereco_logradouro, loja?.endereco_numero, loja?.endereco_bairro, loja?.endereco_cidade].filter(Boolean).join(', ')}
                    {loja?.whatsapp ? ` • +55 ${loja.whatsapp}` : (loja?.telefone ? ` • +55 ${loja.telefone}` : '')}
                  </p>
                </div>

                {/* Dados do Vendedor / Origem (Antes do Cliente) */}
                <div className="space-y-0.5 text-xs text-slate-700 border-b border-slate-200 border-dashed pb-2">
                  <span className="text-slate-500 font-semibold">
                    {pedidoConcluido.origem === 'catalogo_online' ? 'Canal / Vendedor:' : 'Vendedor:'}
                  </span>
                  <p className="font-bold text-slate-900">
                    {pedidoConcluido.origem === 'catalogo_online'
                      ? 'Catálogo Online (Pedido Online)'
                      : pedidoConcluido.vendedor?.nome_completo || 'Caixa / Balcão'}
                  </p>
                </div>

                {/* Dados do Cliente */}
                <div className="space-y-0.5 text-xs text-slate-700 border-b border-slate-200 border-dashed pb-2">
                  <p className="font-bold text-slate-900">Cliente: {pedidoConcluido.cliente?.nome || 'Cliente Avulso'}</p>
                  {(pedidoConcluido.cliente?.whatsapp || pedidoConcluido.cliente?.telefone) && (
                    <p className="text-slate-500 text-[10px]">
                      Tel: +55 {pedidoConcluido.cliente.whatsapp || pedidoConcluido.cliente.telefone}
                    </p>
                  )}
                  {pedidoConcluido.endereco_entrega && (
                    <p className="text-[10px] text-slate-500">Entrega: {pedidoConcluido.endereco_entrega}</p>
                  )}
                </div>

                {/* Resumo de itens */}
                <div className="font-bold text-slate-600 text-[10px] uppercase tracking-wider">
                  {pedidoConcluido.itens?.length || 0} itens (Qtd.: {pedidoConcluido.itens?.reduce((acc, i) => acc + Number(i.quantidade || 1), 0) || 0})
                </div>

                {/* Tabela de Itens */}
                <div className="space-y-1.5 border-b border-slate-200 border-dashed pb-2">
                  {pedidoConcluido.itens?.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start text-xs text-slate-800">
                      <span>
                        <strong className="text-slate-950">{Number(item.quantidade)}x</strong> {item.nome_produto} {item.rotulo_variacao ? ` / ${item.rotulo_variacao}` : ''}
                      </span>
                      <span className="font-bold text-slate-900 whitespace-nowrap pl-3">
                        R$ {Number(item.subtotal || item.preco_venda_unitario || 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Acréscimos/Descontos se houver */}
                <div className="space-y-1 text-xs text-slate-700">
                  {Number(pedidoConcluido.subtotal) > 0 && (
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span className="font-semibold text-slate-900">R$ {Number(pedidoConcluido.subtotal).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(pedidoConcluido.valor_desconto) > 0 && (
                    <div className="flex justify-between text-red-600 font-bold">
                      <span>Desconto:</span>
                      <span>- R$ {Number(pedidoConcluido.valor_desconto).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(pedidoConcluido.valor_frete) > 0 && (
                    <div className="flex justify-between text-slate-700">
                      <span>Taxa de Entrega:</span>
                      <span className="font-semibold">+ R$ {Number(pedidoConcluido.valor_frete).toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Total */}
                <div className="border-t border-slate-900 pt-2 flex justify-between items-center text-sm font-black text-slate-950">
                  <span>TOTAL:</span>
                  <span className="text-base">R$ {Number(pedidoConcluido.valor_total).toFixed(2)}</span>
                </div>

                {/* Dados do Pagamento (Após o Valor Total) */}
                {(() => {
                  const pagInfo = obterDadosPagamentoRecibo(pedidoConcluido);
                  return (
                    <>
                      {pagInfo.ehFiado && Number(pedidoConcluido.saldo_devedor) > 0 && (
                        <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-center space-y-0.5">
                          <span className="text-[10px] font-bold text-red-800 uppercase tracking-wider block">Saldo a Pagar (Fiado)</span>
                          <span className="text-sm font-black text-red-600">R$ {Number(pedidoConcluido.saldo_devedor).toFixed(2)}</span>
                        </div>
                      )}

                      <div className={`mt-2.5 p-2.5 rounded-lg border text-xs ${pagInfo.foiPago ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="flex justify-between items-center pb-1.5 border-b border-dashed border-slate-200">
                          <span className="font-bold text-[10px] text-slate-700 uppercase">Status Pagamento:</span>
                          <span className={`font-black text-[10px] px-1.5 py-0.5 rounded ${pagInfo.foiPago ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {pagInfo.foiPago ? '✓ PAGO' : 'AGUARDANDO PAGAMENTO'}
                          </span>
                        </div>
                        {pagInfo.foiPago && pagInfo.pagamentosDetalhados.length > 0 ? (
                          <div className="space-y-1.5 pt-1.5 text-slate-800">
                            {pagInfo.pagamentosDetalhados.map((pag, idx) => (
                              <div key={idx} className="flex justify-between items-start text-[11px]">
                                <div>
                                  <span className="font-semibold">{pag.forma}</span>
                                  {pag.origemGateway && (
                                    <span className="text-[10px] text-sky-700 block font-medium">Origem: {pag.origemGateway}</span>
                                  )}
                                </div>
                                <span className="font-bold text-slate-900">R$ {pag.valor.toFixed(2)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between font-extrabold text-emerald-900 pt-1.5 border-t border-emerald-200 text-xs">
                              <span>Valor Pago:</span>
                              <span>R$ {pagInfo.totalPago.toFixed(2)}</span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </>
                  );
                })()}

                {/* Linha Divisória */}
                <div className="border-t border-slate-700 my-2"></div>

                {/* Data Formatada por Extenso */}
                <div className="text-center text-[11px] text-slate-400">
                  {formatarDataRecibo(pedidoConcluido.data_venda || pedidoConcluido.criado_em)}
                </div>
              </div>
            </div>

            {/* Ações do Modal de Recibo com Botões Compactos */}
            <div className="p-3.5 border-t border-slate-800 bg-slate-900 space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (loja && pedidoConcluido) PrintService.printReceipt(pedidoConcluido, loja, '80mm');
                  }}
                  className="py-2 px-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
                  title="Imprimir Cupom em Bobina Térmica (58mm/80mm)"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="truncate">Térmica 58/80mm</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (loja && pedidoConcluido) PrintService.printReceipt(pedidoConcluido, loja, 'a4');
                  }}
                  className="py-2 px-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
                  title="Imprimir Recibo em Folha A4"
                >
                  <Printer className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="truncate">Imprimir A4</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (loja && pedidoConcluido) PrintService.printReceipt(pedidoConcluido, loja, 'a4');
                  }}
                  className="py-2 px-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
                  title="Baixar e Salvar Recibo em PDF"
                >
                  <Download className="w-3.5 h-3.5 text-sky-400" />
                  <span className="truncate">Baixar PDF</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (pedidoConcluido) PrintService.openEmail(pedidoConcluido, loja);
                  }}
                  className="py-2 px-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
                  title="Enviar Recibo por E-mail"
                >
                  <Mail className="w-3.5 h-3.5 text-amber-400" />
                  <span className="truncate">E-mail</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (loja && pedidoConcluido) {
                      const msg = PrintService.generateWhatsAppMessage(pedidoConcluido, loja);
                      PrintService.openWhatsApp(pedidoConcluido.cliente?.whatsapp || '', msg);
                    }
                  }}
                  className="py-2 px-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="truncate">WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPedidoConcluido(null)}
                  className="py-2 px-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  Nova Venda
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Novo Cliente */}
      <ModalNovoCliente
        isOpen={modalNovoCliente}
        onClose={() => setModalNovoCliente(false)}
        onClienteCadastrado={(novoCliente) => {
          setClientes(prev => [novoCliente, ...prev]);
          setClienteSelecionado(novoCliente);
        }}
      />

      {/* Modal Leitor de Código de Barras por Câmera */}
      <ModalLeitorCodigoBarras
        isOpen={modalCameraBarcode}
        onClose={() => setModalCameraBarcode(false)}
        onBarcodeDetected={(codigo) => {
          setBuscaCodigoBarras(codigo);
          adicionarProdutoPorCodigo(codigo);
        }}
      />
    </div>
  );
};
