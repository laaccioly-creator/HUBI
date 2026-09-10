import React, { useState, useEffect, useMemo } from 'react';
import {
  FolderTree,
  Ruler,
  Truck,
  Percent,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  Save,
  AlertCircle,
  HelpCircle,
  Calculator,
  ArrowRight,
  Sparkles,
  Phone,
  Mail,
  FileText,
  Layers,
  X,
  Loader2,
  Check,
  CreditCard,
  Banknote,
  Zap,
  ArrowLeft
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Categoria, Fornecedor, UnidadeMedida, FormaPagamento, TipoPagamento } from '../types';
import { SyncService } from '../services/syncService';
import { MobileMenuDrawer } from './layout/MobileMenuDrawer';
import { useFeedbackModal } from '../contexts/FeedbackContext';

export const UNIDADES_PADRAO: Array<{ sigla: string; nome: string; permite_fracionado: boolean; padrao?: boolean }> = [
  { sigla: 'un', nome: 'Unidade', permite_fracionado: false, padrao: true },
  { sigla: 'kg', nome: 'Quilograma', permite_fracionado: true },
  { sigla: 'g', nome: 'Grama', permite_fracionado: true },
  { sigla: 'l', nome: 'Litro', permite_fracionado: true },
  { sigla: 'ml', nome: 'Mililitro', permite_fracionado: true },
  { sigla: 'cx', nome: 'Caixa', permite_fracionado: false },
  { sigla: 'pc', nome: 'Peça', permite_fracionado: false },
  { sigla: 'par', nome: 'Par', permite_fracionado: false },
  { sigla: 'm', nome: 'Metro', permite_fracionado: true },
  { sigla: 'cm', nome: 'Centímetro', permite_fracionado: true },
  { sigla: 'fd', nome: 'Fardo', permite_fracionado: false },
  { sigla: 'kit', nome: 'Kit', permite_fracionado: false },
  { sigla: 'dz', nome: 'Dúzia', permite_fracionado: false }
];

export const CadastrosAuxiliares: React.FC = () => {
  const { loja } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { mostrarSucesso, mostrarErro, mostrarAviso, setTemAlteracoesNaoSalvas, verificarSaidaComConfirmacao } = useFeedbackModal();

  useEffect(() => {
    if (!permissions.podeAcessarAuxiliares) {
      navigate('/pos');
    }
  }, [permissions.podeAcessarAuxiliares, navigate]);

  const [modalSecaoAberta, setModalSecaoAberta] = useState<'categorias' | 'unidades' | 'fornecedores' | 'pagamentos' | 'precificacao' | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<'categorias' | 'unidades' | 'fornecedores' | 'pagamentos' | 'precificacao'>('categorias');
  const [busca, setBusca] = useState<string>('');
  const [drawerMenuAberto, setDrawerMenuAberto] = useState<boolean>(false);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['categorias', 'unidades', 'fornecedores', 'pagamentos', 'precificacao'].includes(tabParam)) {
      setModalSecaoAberta(tabParam as any);
      setAbaAtiva(tabParam as any);
    }
  }, [searchParams]);

  // Suporte a retorno automático para criação/edição de produto
  const origemParam = searchParams.get('origem');
  const rotaOrigem = origemParam === 'produto'
    ? (sessionStorage.getItem('hubi_origem_cadastro_produto') || '/products/create')
    : null;

  const handleVoltar = () => {
    if (rotaOrigem) {
      sessionStorage.removeItem('hubi_origem_cadastro_produto');
      navigate(rotaOrigem);
    } else {
      navigate(-1);
    }
  };

  // Estados de Dados
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [unidades, setUnidades] = useState<UnidadeMedida[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [contagemProdutosCat, setContagemProdutosCat] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  // Regras de Precificação (Mutuamente exclusivos: Valor OU Quantidade)
  const [descontoAtacado, setDescontoAtacado] = useState<string>('20');
  const [tipoMinimoAtacado, setTipoMinimoAtacado] = useState<'valor' | 'quantidade'>('valor');
  const [valorMinimoAtacado, setValorMinimoAtacado] = useState<string>('1500.00');
  const [qtdTotalMinimaAtacado, setQtdTotalMinimaAtacado] = useState<string>('50');
  const [qtdMinimaSkuAtacado, setQtdMinimaSkuAtacado] = useState<string>('6');

  const [descontoAutoatacado, setDescontoAutoatacado] = useState<string>('25');
  const [tipoMinimoDistribuidor, setTipoMinimoDistribuidor] = useState<'valor' | 'quantidade'>('valor');
  const [valorMinimoAutoatacado, setValorMinimoAutoatacado] = useState<string>('3000.00');
  const [qtdTotalMinimaAutoatacado, setQtdTotalMinimaAutoatacado] = useState<string>('100');
  const [qtdMinimaSkuAutoatacado, setQtdMinimaSkuAutoatacado] = useState<string>('6');
  const [snapshotPrecificacaoInicial, setSnapshotPrecificacaoInicial] = useState<string>('');

  // Modais de Cadastro / Edição
  const [modalCategoriaAberta, setModalCategoriaAberta] = useState<boolean>(false);
  const [catEditando, setCatEditando] = useState<Categoria | null>(null);
  const [catNome, setCatNome] = useState<string>('');
  const [catIcone, setCatIcone] = useState<string>('📦');

  const [modalUnidadeAberta, setModalUnidadeAberta] = useState<boolean>(false);
  const [unidadeEditando, setUnidadeEditando] = useState<UnidadeMedida | null>(null);
  const [unidadeSigla, setUnidadeSigla] = useState<string>('');
  const [unidadeNome, setUnidadeNome] = useState<string>('');
  const [unidadeFracionada, setUnidadeFracionada] = useState<boolean>(false);

  const [modalFornecedorAberta, setModalFornecedorAberta] = useState<boolean>(false);
  const [fornecedorEditando, setFornecedorEditando] = useState<Fornecedor | null>(null);
  const [fornNome, setFornNome] = useState<string>('');
  const [fornContato, setFornContato] = useState<string>('');
  const [fornDoc, setFornDoc] = useState<string>('');
  const [fornWhatsapp, setFornWhatsapp] = useState<string>('');
  const [fornEmail, setFornEmail] = useState<string>('');
  const [fornObs, setFornObs] = useState<string>('');

  const [modalPagamentoAberta, setModalPagamentoAberta] = useState<boolean>(false);
  const [pagEditando, setPagEditando] = useState<FormaPagamento | null>(null);
  const [pagNome, setPagNome] = useState<string>('');
  const [pagTipo, setPagTipo] = useState<TipoPagamento>('dinheiro');
  const [pagTaxaPercentual, setPagTaxaPercentual] = useState<string>('0');
  const [pagTaxaFixa, setPagTaxaFixa] = useState<string>('0');
  const [pagMaximoParcelas, setPagMaximoParcelas] = useState<string>('1');
  const [pagAtivo, setPagAtivo] = useState<boolean>(true);
  const [pagExibirCatalogo, setPagExibirCatalogo] = useState<boolean>(true);

  // 1. Carregar Dados Iniciais
  const carregarDados = async () => {
    if (!loja?.id) return;
    try {
      setCarregando(true);

      // Carregar Categorias
      const { data: catData } = await supabase
        .from('categorias')
        .select('*')
        .eq('loja_id', loja.id)
        .order('ordem_exibicao');
      if (catData) setCategorias(catData);

      // Carregar Formas de Pagamento
      const { data: fpsData } = await supabase
        .from('formas_pagamento')
        .select('*')
        .eq('loja_id', loja.id)
        .order('criado_em', { ascending: true });

      if (fpsData && fpsData.length > 0) {
        setFormasPagamento(fpsData);
      } else {
        const dados = await SyncService.baixarDadosParaOffline(loja.id);
        if (dados.formasPagamento) setFormasPagamento(dados.formasPagamento);
      }

      // Contagem de produtos por categoria
      const { data: prods } = await supabase
        .from('produtos')
        .select('categoria_id')
        .eq('loja_id', loja.id);
      if (prods) {
        const contagem: Record<string, number> = {};
        prods.forEach((p) => {
          if (p.categoria_id) {
            contagem[p.categoria_id] = (contagem[p.categoria_id] || 0) + 1;
          }
        });
        setContagemProdutosCat(contagem);
      }

      // Carregar Fornecedores
      const { data: fornData } = await supabase
        .from('fornecedores')
        .select('*')
        .eq('loja_id', loja.id)
        .order('nome');
      if (fornData) setFornecedores(fornData);

      // Carregar Unidades de Medida
      try {
        const { data: unData } = await supabase
          .from('unidades_medida')
          .select('*')
          .eq('loja_id', loja.id)
          .order('sigla');

        if (unData && unData.length > 0) {
          setUnidades(unData);
        } else {
          // Inicializar com padrões locais se não houver registros
          const defaultList: UnidadeMedida[] = UNIDADES_PADRAO.map((u, i) => ({
            id: `padrao_${u.sigla}_${i}`,
            loja_id: loja.id,
            sigla: u.sigla,
            nome: u.nome,
            permite_fracionado: u.permite_fracionado,
            padrao: u.padrao || false
          }));
          setUnidades(defaultList);
        }
      } catch (err) {
        console.warn('Tabela unidades_medida ainda não criada no Supabase, usando lista padrão.');
        setUnidades(
          UNIDADES_PADRAO.map((u, i) => ({
            id: `padrao_${u.sigla}_${i}`,
            loja_id: loja.id,
            sigla: u.sigla,
            nome: u.nome,
            permite_fracionado: u.permite_fracionado,
            padrao: u.padrao || false
          }))
        );
      }

      // Carregar Regras de Precificação
      const keyStorage = `hubi_regras_precificacao_${loja.id}`;
      const regrasSalvas = localStorage.getItem(keyStorage);
      if (regrasSalvas) {
        try {
          const parsed = JSON.parse(regrasSalvas);
          if (parsed.descontoAtacado !== undefined) setDescontoAtacado(String(parsed.descontoAtacado));
          
          if (parsed.valorMinimoAtacado && Number(parsed.valorMinimoAtacado) > 0) {
            setTipoMinimoAtacado('valor');
            setValorMinimoAtacado(String(parsed.valorMinimoAtacado));
            setQtdTotalMinimaAtacado('');
            setQtdMinimaSkuAtacado('');
          } else if (parsed.qtdTotalMinimaAtacado && Number(parsed.qtdTotalMinimaAtacado) > 0) {
            setTipoMinimoAtacado('quantidade');
            setValorMinimoAtacado('');
            setQtdTotalMinimaAtacado(String(parsed.qtdTotalMinimaAtacado));
            setQtdMinimaSkuAtacado(String(parsed.qtdMinimaSkuAtacado || '6'));
          } else {
            setValorMinimoAtacado(String(parsed.valorMinimoAtacado ?? '1500.00'));
            setQtdTotalMinimaAtacado(String(parsed.qtdTotalMinimaAtacado ?? '50'));
            setQtdMinimaSkuAtacado(String(parsed.qtdMinimaSkuAtacado ?? '6'));
          }

          if (parsed.descontoAutoatacado !== undefined) setDescontoAutoatacado(String(parsed.descontoAutoatacado));
          
          if (parsed.valorMinimoAutoatacado && Number(parsed.valorMinimoAutoatacado) > 0) {
            setTipoMinimoDistribuidor('valor');
            setValorMinimoAutoatacado(String(parsed.valorMinimoAutoatacado));
            setQtdTotalMinimaAutoatacado('');
            setQtdMinimaSkuAutoatacado('');
          } else if (parsed.qtdTotalMinimaAutoatacado && Number(parsed.qtdTotalMinimaAutoatacado) > 0) {
            setTipoMinimoDistribuidor('quantidade');
            setValorMinimoAutoatacado('');
            setQtdTotalMinimaAutoatacado(String(parsed.qtdTotalMinimaAutoatacado));
            setQtdMinimaSkuAutoatacado(String(parsed.qtdMinimaSkuAutoatacado || '6'));
          } else {
            setValorMinimoAutoatacado(String(parsed.valorMinimoAutoatacado ?? '3000.00'));
            setQtdTotalMinimaAutoatacado(String(parsed.qtdTotalMinimaAutoatacado ?? '100'));
            setQtdMinimaSkuAutoatacado(String(parsed.qtdMinimaSkuAutoatacado ?? '6'));
          }
        } catch (e) {
          // Ignora
        }
      } else {
        if (loja.desconto_padrao_atacado_percentual !== undefined && loja.desconto_padrao_atacado_percentual !== null) {
          setDescontoAtacado(String(loja.desconto_padrao_atacado_percentual));
        }
        if (loja.valor_minimo_padrao_atacado !== undefined && loja.valor_minimo_padrao_atacado !== null && Number(loja.valor_minimo_padrao_atacado) > 0) {
          setTipoMinimoAtacado('valor');
          setValorMinimoAtacado(String(loja.valor_minimo_padrao_atacado));
          setQtdTotalMinimaAtacado('');
        } else if (loja.qtd_minima_padrao_atacado !== undefined && loja.qtd_minima_padrao_atacado !== null && Number(loja.qtd_minima_padrao_atacado) > 0) {
          setTipoMinimoAtacado('quantidade');
          setValorMinimoAtacado('');
          setQtdTotalMinimaAtacado(String(loja.qtd_minima_padrao_atacado));
          setQtdMinimaSkuAtacado(String(loja.qtd_minima_sku_padrao_atacado || '6'));
        }

        if (loja.desconto_padrao_autoatacado_percentual !== undefined && loja.desconto_padrao_autoatacado_percentual !== null) {
          setDescontoAutoatacado(String(loja.desconto_padrao_autoatacado_percentual));
        }
        if (loja.valor_minimo_padrao_autoatacado !== undefined && loja.valor_minimo_padrao_autoatacado !== null && Number(loja.valor_minimo_padrao_autoatacado) > 0) {
          setTipoMinimoDistribuidor('valor');
          setValorMinimoAutoatacado(String(loja.valor_minimo_padrao_autoatacado));
          setQtdTotalMinimaAutoatacado('');
        } else if (loja.qtd_minima_padrao_autoatacado !== undefined && loja.qtd_minima_padrao_autoatacado !== null && Number(loja.qtd_minima_padrao_autoatacado) > 0) {
          setTipoMinimoDistribuidor('quantidade');
          setValorMinimoAutoatacado('');
          setQtdTotalMinimaAutoatacado(String(loja.qtd_minima_padrao_autoatacado));
          setQtdMinimaSkuAutoatacado(String(loja.qtd_minima_sku_padrao_autoatacado || '6'));
        }
      }
    } catch (err) {
      console.error('Erro ao carregar cadastros auxiliares:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, [loja?.id]);

  const exibirAlertaSucesso = (msg: string) => {
    setMensagemSucesso(msg);
    setTimeout(() => setMensagemSucesso(null), 3500);
  };

  // ============================================================================
  // FUNÇÕES DE CATEGORIAS
  // ============================================================================
  const salvarCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catNome.trim() || !loja?.id) return;

    try {
      setSalvando(true);
      if (catEditando) {
        const { error } = await supabase
          .from('categorias')
          .update({
            nome: catNome.trim().toUpperCase(),
            icone: catIcone.trim() || '📦'
          })
          .eq('id', catEditando.id);
        if (error) throw error;
        sessionStorage.setItem('hubi_recem_criado_categoria', catEditando.id);
        exibirAlertaSucesso('Categoria atualizada com sucesso!');
      } else {
        const maxOrdem = categorias.length > 0 ? Math.max(...categorias.map(c => c.ordem_exibicao || 0)) + 1 : 1;
        const { data: novaCat, error } = await supabase
          .from('categorias')
          .insert([{
            loja_id: loja.id,
            nome: catNome.trim().toUpperCase(),
            icone: catIcone.trim() || '📦',
            ordem_exibicao: maxOrdem,
            ativo: true
          }])
          .select()
          .single();
        if (error) throw error;
        if (novaCat?.id) {
          sessionStorage.setItem('hubi_recem_criado_categoria', novaCat.id);
        }
        exibirAlertaSucesso('Nova categoria criada com sucesso!');
      }

      setModalCategoriaAberta(false);
      setCatEditando(null);
      setCatNome('');
      setCatIcone('📦');
      carregarDados();
    } catch (err: any) {
      console.error('Erro ao salvar categoria:', err);
      mostrarErro(err.message || 'Tente novamente', 'Erro ao salvar categoria');
    } finally {
      setSalvando(false);
    }
  };

  const excluirCategoria = async (cat: Categoria) => {
    const totalProds = contagemProdutosCat[cat.id] || 0;
    if (totalProds > 0) {
      mostrarAviso(`Não é possível excluir a categoria "${cat.nome}" pois ela possui ${totalProds} produto(s) vinculado(s). Reclassifique os produtos antes de excluir.`, 'Categoria em Uso');
      return;
    }
    if (!confirm(`Deseja realmente excluir a categoria "${cat.nome}"?`)) return;

    try {
      const { error } = await supabase.from('categorias').delete().eq('id', cat.id);
      if (error) throw error;
      exibirAlertaSucesso('Categoria removida.');
      setCategorias(prev => prev.filter(c => c.id !== cat.id));
    } catch (err: any) {
      mostrarErro(err.message, 'Erro ao excluir categoria');
    }
  };

  // ============================================================================
  // FUNÇÕES DE UNIDADES DE MEDIDA
  // ============================================================================
  const salvarUnidade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unidadeSigla.trim() || !unidadeNome.trim() || !loja?.id) return;

    const siglaLimpa = unidadeSigla.trim().toLowerCase();
    const nomeLimpo = unidadeNome.trim();

    try {
      setSalvando(true);
      if (unidadeEditando && !unidadeEditando.id.startsWith('padrao_')) {
        const { error } = await supabase
          .from('unidades_medida')
          .update({
            sigla: siglaLimpa,
            nome: nomeLimpo,
            permite_fracionado: unidadeFracionada
          })
          .eq('id', unidadeEditando.id);
        if (error) throw error;
      } else {
        try {
          const { error } = await supabase
            .from('unidades_medida')
            .insert([{
              loja_id: loja.id,
              sigla: siglaLimpa,
              nome: nomeLimpo,
              permite_fracionado: unidadeFracionada,
              padrao: false
            }]);
          if (error) throw error;
        } catch (dbErr) {
          console.warn('Fallback local para unidade de medida:', dbErr);
        }
      }

      sessionStorage.setItem('hubi_recem_criado_unidade', siglaLimpa);
      exibirAlertaSucesso('Unidade de medida salva com sucesso!');
      setModalUnidadeAberta(false);
      setUnidadeEditando(null);
      setUnidadeSigla('');
      setUnidadeNome('');
      setUnidadeFracionada(false);
      carregarDados();
    } catch (err: any) {
      console.error('Erro ao salvar unidade:', err);
      mostrarErro(err.message || 'Tente novamente', 'Erro ao salvar unidade');
    } finally {
      setSalvando(false);
    }
  };

  const excluirUnidade = async (un: UnidadeMedida) => {
    if (un.sigla === 'un') {
      mostrarAviso('A unidade padrão "UN" (Unidade) não pode ser excluída.', 'Ação Não Permitida');
      return;
    }
    if (!confirm(`Deseja remover a unidade "${un.sigla.toUpperCase()} - ${un.nome}"?`)) return;

    try {
      if (!un.id.startsWith('padrao_')) {
        await supabase.from('unidades_medida').delete().eq('id', un.id);
      }
      setUnidades(prev => prev.filter(u => u.id !== un.id));
      exibirAlertaSucesso('Unidade de medida removida.');
    } catch (err: any) {
      mostrarErro(err.message, 'Erro ao excluir unidade');
    }
  };

  // ============================================================================
  // FUNÇÕES DE FORNECEDORES
  // ============================================================================
  const salvarFornecedor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fornNome.trim() || !loja?.id) return;

    try {
      setSalvando(true);
      const payload = {
        loja_id: loja.id,
        nome: fornNome.trim(),
        pessoa_contato: fornContato.trim() || null,
        numero_documento: fornDoc.trim() || null,
        whatsapp: fornWhatsapp.trim() || null,
        telefone: fornWhatsapp.trim() || null,
        email: fornEmail.trim() || null,
        observacoes: fornObs.trim() || null
      };

      if (fornecedorEditando) {
        const { error } = await supabase
          .from('fornecedores')
          .update(payload)
          .eq('id', fornecedorEditando.id);
        if (error) throw error;
        sessionStorage.setItem('hubi_recem_criado_fornecedor', fornecedorEditando.id);
        exibirAlertaSucesso('Fornecedor atualizado com sucesso!');
      } else {
        const { data: novoForn, error } = await supabase
          .from('fornecedores')
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        if (novoForn?.id) {
          sessionStorage.setItem('hubi_recem_criado_fornecedor', novoForn.id);
        }
        exibirAlertaSucesso('Fornecedor cadastrado com sucesso!');
      }

      setModalFornecedorAberta(false);
      setFornecedorEditando(null);
      setFornNome('');
      setFornContato('');
      setFornDoc('');
      setFornWhatsapp('');
      setFornEmail('');
      setFornObs('');
      carregarDados();
    } catch (err: any) {
      console.error('Erro ao salvar fornecedor:', err);
      mostrarErro(err.message || 'Tente novamente', 'Erro ao salvar fornecedor');
    } finally {
      setSalvando(false);
    }
  };

  const excluirFornecedor = async (forn: Fornecedor) => {
    if (!confirm(`Deseja realmente excluir o fornecedor "${forn.nome}"?`)) return;
    try {
      const { error } = await supabase.from('fornecedores').delete().eq('id', forn.id);
      if (error) throw error;
      exibirAlertaSucesso('Fornecedor removido com sucesso.');
      setFornecedores(prev => prev.filter(f => f.id !== forn.id));
    } catch (err: any) {
      mostrarErro(err.message, 'Erro ao excluir fornecedor');
    }
  };

  // ============================================================================
  // FUNÇÕES DE FORMAS DE PAGAMENTO
  // ============================================================================
  const abrirModalNovoPagamento = () => {
    setPagEditando(null);
    setPagNome('');
    setPagTipo('dinheiro');
    setPagTaxaPercentual('0');
    setPagTaxaFixa('0');
    setPagMaximoParcelas('1');
    setPagAtivo(true);
    setPagExibirCatalogo(true);
    setModalPagamentoAberta(true);
  };

  const abrirModalEditarPagamento = (fp: FormaPagamento) => {
    setPagEditando(fp);
    setPagNome(fp.nome);
    setPagTipo(fp.tipo);
    setPagTaxaPercentual(String(fp.taxa_percentual || 0));
    setPagTaxaFixa(String(fp.taxa_fixa || 0));
    setPagMaximoParcelas(String(fp.maximo_parcelas || 1));
    setPagAtivo(fp.ativo ?? true);
    setPagExibirCatalogo(fp.exibir_catalogo ?? true);
    setModalPagamentoAberta(true);
  };

  const salvarFormaPagamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pagNome.trim() || !loja?.id) return;

    try {
      setSalvando(true);
      const payload = {
        loja_id: loja.id,
        nome: pagNome.trim(),
        tipo: pagTipo,
        taxa_percentual: Number(pagTaxaPercentual) || 0,
        taxa_fixa: Number(pagTaxaFixa) || 0,
        maximo_parcelas: Number(pagMaximoParcelas) || 1,
        ativo: pagAtivo,
        exibir_catalogo: pagExibirCatalogo
      };

      if (pagEditando && !pagEditando.id.startsWith('padrao_') && !pagEditando.id.startsWith('fp_')) {
        const { error } = await supabase
          .from('formas_pagamento')
          .update(payload)
          .eq('id', pagEditando.id);
        if (error) throw error;
        exibirAlertaSucesso('Forma de pagamento atualizada com sucesso!');
      } else {
        const { error } = await supabase
          .from('formas_pagamento')
          .insert([payload]);
        if (error) throw error;
        exibirAlertaSucesso('Nova forma de pagamento criada com sucesso!');
      }

      setModalPagamentoAberta(false);
      setPagEditando(null);
      carregarDados();
    } catch (err: any) {
      console.error('Erro ao salvar forma de pagamento:', err);
      mostrarErro(err.message || 'Tente novamente', 'Erro ao salvar forma de pagamento');
    } finally {
      setSalvando(false);
    }
  };

  const alternarStatusPagamento = async (fp: FormaPagamento) => {
    try {
      const novoStatus = !fp.ativo;
      setFormasPagamento(prev => prev.map(item => item.id === fp.id ? { ...item, ativo: novoStatus } : item));

      if (!fp.id.startsWith('padrao_') && !fp.id.startsWith('fp_')) {
        await supabase
          .from('formas_pagamento')
          .update({ ativo: novoStatus })
          .eq('id', fp.id);
      }
      exibirAlertaSucesso(`Forma de pagamento ${novoStatus ? 'ativada' : 'desativada'}.`);
    } catch (err: any) {
      mostrarErro(err.message, 'Erro ao alterar status');
    }
  };

  const excluirFormaPagamento = async (fp: FormaPagamento) => {
    if (!confirm(`Deseja realmente remover a forma de pagamento "${fp.nome}"?`)) return;
    try {
      if (!fp.id.startsWith('padrao_') && !fp.id.startsWith('fp_')) {
        const { error } = await supabase.from('formas_pagamento').delete().eq('id', fp.id);
        if (error) throw error;
      }
      setFormasPagamento(prev => prev.filter(item => item.id !== fp.id));
      exibirAlertaSucesso('Forma de pagamento removida com sucesso.');
    } catch (err: any) {
      mostrarErro(err.message, 'Erro ao excluir forma de pagamento');
    }
  };

  // ============================================================================
  // FUNÇÕES DE REGRAS DE PRECIFICAÇÃO
  // ============================================================================
  const salvarRegrasPrecificacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id) return;

    try {
      setSalvando(true);
      const descAtacadoNum = Number(descontoAtacado) || 0;
      const valAtacadoNum = tipoMinimoAtacado === 'valor' ? (Number(valorMinimoAtacado) || 0) : 0;
      const qtdTotAtacadoNum = tipoMinimoAtacado === 'quantidade' ? (Number(qtdTotalMinimaAtacado) || 0) : 0;
      const qtdSkuAtacadoNum = tipoMinimoAtacado === 'quantidade' ? (Number(qtdMinimaSkuAtacado) || 1) : 0;

      const descAutoNum = Number(descontoAutoatacado) || 0;
      const valAutoNum = tipoMinimoDistribuidor === 'valor' ? (Number(valorMinimoAutoatacado) || 0) : 0;
      const qtdTotAutoNum = tipoMinimoDistribuidor === 'quantidade' ? (Number(qtdTotalMinimaAutoatacado) || 0) : 0;
      const qtdSkuAutoNum = tipoMinimoDistribuidor === 'quantidade' ? (Number(qtdMinimaSkuAutoatacado) || 1) : 0;

      // 1. Salvar no localStorage para uso instantâneo pelo pricingEngine
      const keyStorage = `hubi_regras_precificacao_${loja.id}`;
      localStorage.setItem(
        keyStorage,
        JSON.stringify({
          descontoAtacado: descAtacadoNum,
          tipoMinimoAtacado,
          valorMinimoAtacado: valAtacadoNum,
          qtdTotalMinimaAtacado: qtdTotAtacadoNum,
          qtdMinimaSkuAtacado: qtdSkuAtacadoNum,

          descontoAutoatacado: descAutoNum,
          tipoMinimoDistribuidor,
          valorMinimoAutoatacado: valAutoNum,
          qtdTotalMinimaAutoatacado: qtdTotAutoNum,
          qtdMinimaSkuAutoatacado: qtdSkuAutoNum
        })
      );

      // 2. Atualizar na tabela lojas no Supabase
      try {
        await supabase
          .from('lojas')
          .update({
            desconto_padrao_atacado_percentual: descAtacadoNum,
            tipo_minimo_padrao_atacado: tipoMinimoAtacado,
            valor_minimo_padrao_atacado: valAtacadoNum,
            qtd_minima_padrao_atacado: qtdTotAtacadoNum,
            qtd_minima_sku_padrao_atacado: qtdSkuAtacadoNum,

            desconto_padrao_autoatacado_percentual: descAutoNum,
            tipo_minimo_padrao_autoatacado: tipoMinimoDistribuidor,
            valor_minimo_padrao_autoatacado: valAutoNum,
            qtd_minima_padrao_autoatacado: qtdTotAutoNum,
            qtd_minima_sku_padrao_autoatacado: qtdSkuAutoNum
          })
          .eq('id', loja.id);
      } catch (e) {
        console.warn('Colunas de desconto na tabela lojas não disponíveis ainda no schema.', e);
      }

      exibirAlertaSucesso('Regras de precificação salvas com sucesso!');
      setSnapshotPrecificacaoInicial(snapshotPrecificacaoAtual);
    } catch (err: any) {
      mostrarErro(err.message, 'Erro ao salvar regras');
    } finally {
      setSalvando(false);
    }
  };

  const snapshotPrecificacaoAtual = useMemo(() => {
    return JSON.stringify({
      descontoAtacado,
      tipoMinimoAtacado,
      valorMinimoAtacado,
      qtdTotalMinimaAtacado,
      qtdMinimaSkuAtacado,
      descontoAutoatacado,
      tipoMinimoDistribuidor,
      valorMinimoAutoatacado,
      qtdTotalMinimaAutoatacado,
      qtdMinimaSkuAutoatacado
    });
  }, [
    descontoAtacado,
    tipoMinimoAtacado,
    valorMinimoAtacado,
    qtdTotalMinimaAtacado,
    qtdMinimaSkuAtacado,
    descontoAutoatacado,
    tipoMinimoDistribuidor,
    valorMinimoAutoatacado,
    qtdTotalMinimaAutoatacado,
    qtdMinimaSkuAutoatacado
  ]);

  const isDirtyPrecificacao = Boolean(snapshotPrecificacaoInicial && snapshotPrecificacaoAtual !== snapshotPrecificacaoInicial);
  const isDirtyCategoria = modalCategoriaAberta && Boolean(
    catNome.trim() && (!catEditando || catNome.trim().toUpperCase() !== catEditando.nome || (catIcone.trim() || '📦') !== (catEditando.icone || '📦'))
  );
  const isDirtyUnidade = modalUnidadeAberta && Boolean(
    (unidadeSigla.trim() || unidadeNome.trim()) && (!unidadeEditando || unidadeSigla.trim() !== unidadeEditando.sigla || unidadeNome.trim() !== unidadeEditando.nome)
  );
  const isDirtyFornecedor = modalFornecedorAberta && Boolean(
    (fornNome.trim() || fornDoc.trim() || fornWhatsapp.trim()) && (!fornecedorEditando || fornNome.trim() !== fornecedorEditando.nome || fornDoc.trim() !== (fornecedorEditando.numero_documento || '') || fornWhatsapp.trim() !== (fornecedorEditando.whatsapp || ''))
  );
  const isDirtyPagamento = modalPagamentoAberta && Boolean(
    (pagNome.trim() || pagTipo !== 'dinheiro') && (!pagEditando || pagNome.trim() !== pagEditando.nome || pagTipo !== pagEditando.tipo)
  );

  const isDirtyGeral = isDirtyPrecificacao || isDirtyCategoria || isDirtyUnidade || isDirtyFornecedor || isDirtyPagamento;

  useEffect(() => {
    setTemAlteracoesNaoSalvas(isDirtyGeral);
    return () => {
      setTemAlteracoesNaoSalvas(false);
    };
  }, [isDirtyGeral, setTemAlteracoesNaoSalvas]);

  // Esc key listener para voltar ou fechar modais
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modalCategoriaAberta) {
          if (isDirtyCategoria) {
            verificarSaidaComConfirmacao(() => { setModalCategoriaAberta(false); setCatEditando(null); setCatNome(''); });
          } else {
            setModalCategoriaAberta(false); setCatEditando(null); setCatNome('');
          }
          return;
        }
        if (modalUnidadeAberta) {
          if (isDirtyUnidade) {
            verificarSaidaComConfirmacao(() => { setModalUnidadeAberta(false); setUnidadeEditando(null); setUnidadeSigla(''); setUnidadeNome(''); });
          } else {
            setModalUnidadeAberta(false); setUnidadeEditando(null); setUnidadeSigla(''); setUnidadeNome('');
          }
          return;
        }
        if (modalFornecedorAberta) {
          if (isDirtyFornecedor) {
            verificarSaidaComConfirmacao(() => { setModalFornecedorAberta(false); setFornecedorEditando(null); setFornNome(''); setFornDoc(''); setFornWhatsapp(''); });
          } else {
            setModalFornecedorAberta(false); setFornecedorEditando(null); setFornNome(''); setFornDoc(''); setFornWhatsapp('');
          }
          return;
        }
        if (modalPagamentoAberta) {
          if (isDirtyPagamento) {
            verificarSaidaComConfirmacao(() => { setModalPagamentoAberta(false); setPagEditando(null); setPagNome(''); });
          } else {
            setModalPagamentoAberta(false); setPagEditando(null); setPagNome('');
          }
          return;
        }
        if (modalSecaoAberta) {
          if (modalSecaoAberta === 'precificacao' && isDirtyPrecificacao) {
            verificarSaidaComConfirmacao(() => { setModalSecaoAberta(null); setBusca(''); });
          } else {
            setModalSecaoAberta(null); setBusca('');
          }
          return;
        }
        verificarSaidaComConfirmacao(() => navigate(-1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalCategoriaAberta, modalUnidadeAberta, modalFornecedorAberta, modalPagamentoAberta, modalSecaoAberta, isDirtyCategoria, isDirtyUnidade, isDirtyFornecedor, isDirtyPagamento, isDirtyPrecificacao, navigate, verificarSaidaComConfirmacao]);

  // Filtros de busca
  const categoriasFiltradas = categorias.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase())
  );
  const unidadesFiltradas = unidades.filter(u =>
    u.sigla.toLowerCase().includes(busca.toLowerCase()) ||
    u.nome.toLowerCase().includes(busca.toLowerCase())
  );
  const fornecedoresFiltrados = fornecedores.filter(f =>
    f.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (f.pessoa_contato && f.pessoa_contato.toLowerCase().includes(busca.toLowerCase())) ||
    (f.whatsapp && f.whatsapp.includes(busca))
  );
  const formasPagamentoFiltradas = formasPagamento.filter(fp =>
    fp.nome.toLowerCase().includes(busca.toLowerCase()) ||
    fp.tipo.toLowerCase().includes(busca.toLowerCase())
  );

  // Lista padronizada dos 5 botões de Cadastros & Tabelas
  const itensMenuCadastros = [
    {
      id: 'categorias' as const,
      label: 'Categoria',
      icon: FolderTree,
      badge: `${categorias.length} ${categorias.length === 1 ? 'item' : 'itens'}`,
      descricao: 'Organize seu catálogo por departamentos e categorias'
    },
    {
      id: 'unidades' as const,
      label: 'Unidade de Medida',
      icon: Ruler,
      badge: `${unidades.length} ${unidades.length === 1 ? 'unidade' : 'unidades'}`,
      descricao: 'Unidades de venda (un, kg, g, l, cx, par, kit)'
    },
    {
      id: 'fornecedores' as const,
      label: 'Fornecedores',
      icon: Truck,
      badge: `${fornecedores.length} ${fornecedores.length === 1 ? 'parceiro' : 'parceiros'}`,
      descricao: 'Gestão de parceiros, contatos e faturamentos'
    },
    {
      id: 'pagamentos' as const,
      label: 'Forma de Pagamento',
      icon: CreditCard,
      badge: `${formasPagamento.length} ${formasPagamento.length === 1 ? 'forma' : 'formas'}`,
      descricao: 'PIX, dinheiro, cartões, maquininhas e taxas'
    },
    {
      id: 'precificacao' as const,
      label: 'Regras de Precificação',
      icon: Percent,
      badge: 'Atacado & Varejo',
      descricao: 'Descontos progressivos e regras de atacado'
    }
  ];

  return (
    <div className="h-full w-full overflow-hidden select-none">
      {/* 1. VISÃO MOBILE EXCLUSIVA (TEMA CLARO PADRÃO PEDIDOS/PRODUTOS) */}
      <div className="block md:hidden h-full flex flex-col overflow-y-auto bg-slate-50 text-slate-900 font-sans">
        {/* Header Superior Mobile */}
        <div className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleVoltar}
              className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 transition cursor-pointer flex items-center gap-1.5"
              title={rotaOrigem ? "Voltar ao Produto" : "Voltar"}
            >
              <ArrowLeft className="w-5 h-5" />
              {rotaOrigem && <span className="text-xs font-semibold text-emerald-600">Voltar ao Produto</span>}
            </button>
            <button
              type="button"
              onClick={() => setDrawerMenuAberto(true)}
              className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-700 transition cursor-pointer"
              title="Menu Principal"
            >
              <div className="space-y-1">
                <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
                <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
                <span className="block w-5 h-0.5 bg-slate-700 rounded-full" />
              </div>
            </button>
            <h1 className="font-bold text-base text-slate-800">Cadastros & Tabelas</h1>
          </div>
        </div>

        {/* Grade de Botões Mobile */}
        <div className="p-4 space-y-4 flex-1">
          <p className="text-xs text-slate-500">
            Selecione uma opção para abrir o painel de gerenciamento correspondente:
          </p>
          <div className="grid grid-cols-2 gap-3">
            {itensMenuCadastros.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setBusca('');
                  setAbaAtiva(item.id);
                  setModalSecaoAberta(item.id);
                }}
                className="p-4 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100 flex flex-col items-center justify-center text-center gap-2.5 transition shadow-xs cursor-pointer relative"
              >
                <span className="absolute top-2.5 right-2.5 bg-emerald-50 text-emerald-700 font-bold text-[9px] px-1.5 py-0.5 rounded-full border border-emerald-200">
                  {item.badge}
                </span>
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-2xs">
                  <item.icon className="w-5 h-5" />
                </div>
                <span className="font-bold text-xs text-slate-800 leading-tight">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Menu Gaveta Lateral */}
        <MobileMenuDrawer
          aberto={drawerMenuAberto}
          onFechar={() => setDrawerMenuAberto(false)}
        />
      </div>

      {/* 2. VISÃO DESKTOP (PADRÃO CONFIGURAÇÕES NO TEMA ESCURO) */}
      <div className="hidden md:flex flex-col h-full overflow-y-auto bg-slate-950 p-4 sm:p-6 lg:p-8 font-sans">
        <div className="max-w-6xl mx-auto w-full space-y-6">
          {/* HEADER DA PÁGINA */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => verificarSaidaComConfirmacao(handleVoltar)}
                className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition cursor-pointer flex items-center gap-2"
                title={rotaOrigem ? "Voltar ao Cadastro de Produto" : "Voltar"}
              >
                <ArrowLeft className="w-5 h-5" />
                {rotaOrigem && <span className="text-xs font-bold text-emerald-400 pr-1">Voltar ao Produto</span>}
              </button>
              <div>
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider mb-1">
                  <Layers className="w-4 h-4" />
                  <span>Cadastros Base & Parâmetros</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-100">Cadastros & Tabelas</h1>
                <p className="text-xs sm:text-sm text-slate-400">
                  Gerencie categorias, unidades de medida, fornecedores, formas de pagamento e padronize regras da loja.
                </p>
              </div>
            </div>

            {mensagemSucesso && (
              <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-4 py-2 rounded-2xl text-xs font-bold animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{mensagemSucesso}</span>
              </div>
            )}
          </div>

          {/* BOTÕES DE CADASTROS DISTRIBUÍDOS EM DUAS LINHAS (3 NA 1ª, 2 NA 2ª) */}
          <div className="pt-8 sm:pt-12 space-y-6 max-w-5xl mx-auto w-full animate-in fade-in duration-200">
            {/* Primeira Linha: 3 Botões */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {itensMenuCadastros.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setBusca('');
                    setAbaAtiva(item.id);
                    setModalSecaoAberta(item.id);
                  }}
                  className="p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-850 hover:shadow-xl hover:shadow-emerald-500/10 flex flex-col items-center justify-center text-center gap-3 transition-all duration-200 cursor-pointer group relative min-h-[180px]"
                >
                  <span className="absolute top-3 right-3 bg-emerald-500 text-slate-950 font-black text-[9px] px-2.5 py-0.5 rounded-full shadow-xs">
                    {item.badge}
                  </span>
                  <div className="w-14 h-14 rounded-2xl bg-slate-950 border border-slate-800 group-hover:bg-emerald-500/10 group-hover:border-emerald-500/30 text-emerald-400 flex items-center justify-center transition-all group-hover:scale-110">
                    <item.icon className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="font-bold text-base text-slate-200 group-hover:text-emerald-400 transition leading-tight block">
                      {item.label}
                    </span>
                    <span className="text-xs text-slate-400 mt-1 block leading-snug">
                      {item.descricao}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Segunda Linha: 2 Botões Centralizados */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto w-full">
              {itensMenuCadastros.slice(3, 5).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setBusca('');
                    setAbaAtiva(item.id);
                    setModalSecaoAberta(item.id);
                  }}
                  className="p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-850 hover:shadow-xl hover:shadow-emerald-500/10 flex flex-col items-center justify-center text-center gap-3 transition-all duration-200 cursor-pointer group relative min-h-[180px]"
                >
                  <span className="absolute top-3 right-3 bg-emerald-500 text-slate-950 font-black text-[9px] px-2.5 py-0.5 rounded-full shadow-xs">
                    {item.badge}
                  </span>
                  <div className="w-14 h-14 rounded-2xl bg-slate-950 border border-slate-800 group-hover:bg-emerald-500/10 group-hover:border-emerald-500/30 text-emerald-400 flex items-center justify-center transition-all group-hover:scale-110">
                    <item.icon className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="font-bold text-base text-slate-200 group-hover:text-emerald-400 transition leading-tight block">
                      {item.label}
                    </span>
                    <span className="text-xs text-slate-400 mt-1 block leading-snug">
                      {item.descricao}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL DA OPÇÃO SELECIONADA                                                */}
      {/* ========================================================================= */}
      {modalSecaoAberta && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-40 animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setModalSecaoAberta(null);
              setBusca('');
            }
          }}
        >
          <div className="bg-white md:bg-slate-900 border border-slate-200 md:border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-800 md:text-slate-100 animate-in zoom-in-95 duration-150">
            {/* CABEÇALHO DO MODAL */}
            <div className="p-4 sm:p-6 border-b border-slate-200 md:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 md:bg-emerald-500/10 text-emerald-600 md:text-emerald-400 border border-emerald-200 md:border-emerald-500/20 flex items-center justify-center shrink-0">
                  {modalSecaoAberta === 'categorias' && <FolderTree className="w-5 h-5" />}
                  {modalSecaoAberta === 'unidades' && <Ruler className="w-5 h-5" />}
                  {modalSecaoAberta === 'fornecedores' && <Truck className="w-5 h-5" />}
                  {modalSecaoAberta === 'pagamentos' && <CreditCard className="w-5 h-5" />}
                  {modalSecaoAberta === 'precificacao' && <Percent className="w-5 h-5" />}
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 md:text-slate-100">
                    {modalSecaoAberta === 'categorias' && 'Categorias'}
                    {modalSecaoAberta === 'unidades' && 'Unidades de Medida'}
                    {modalSecaoAberta === 'fornecedores' && 'Fornecedores'}
                    {modalSecaoAberta === 'pagamentos' && 'Formas de Pagamento'}
                    {modalSecaoAberta === 'precificacao' && 'Regras de Precificação'}
                  </h2>
                  <p className="text-xs text-slate-500 md:text-slate-400 hidden sm:block">
                    {modalSecaoAberta === 'categorias' && 'Gerencie os departamentos e categorias do seu catálogo'}
                    {modalSecaoAberta === 'unidades' && 'Gerencie siglas e regras de fracionamento de medidas'}
                    {modalSecaoAberta === 'fornecedores' && 'Cadastre parceiros, contatos e faturamentos'}
                    {modalSecaoAberta === 'pagamentos' && 'Configure meios de recebimento, taxas e prazos'}
                    {modalSecaoAberta === 'precificacao' && 'Defina percentuais e mínimos para atacado e distribuidor'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {modalSecaoAberta === 'categorias' && (
                  <button
                    type="button"
                    onClick={() => {
                      setCatEditando(null);
                      setCatNome('');
                      setCatIcone('📦');
                      setModalCategoriaAberta(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Nova Categoria</span>
                    <span className="sm:hidden">+ Novo</span>
                  </button>
                )}

                {modalSecaoAberta === 'unidades' && (
                  <button
                    type="button"
                    onClick={() => {
                      setUnidadeEditando(null);
                      setUnidadeSigla('');
                      setUnidadeNome('');
                      setUnidadeFracionada(false);
                      setModalUnidadeAberta(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Nova Unidade</span>
                    <span className="sm:hidden">+ Novo</span>
                  </button>
                )}

                {modalSecaoAberta === 'fornecedores' && (
                  <button
                    type="button"
                    onClick={() => {
                      setFornecedorEditando(null);
                      setFornNome('');
                      setFornContato('');
                      setFornDoc('');
                      setFornWhatsapp('');
                      setFornEmail('');
                      setFornObs('');
                      setModalFornecedorAberta(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Novo Fornecedor</span>
                    <span className="sm:hidden">+ Novo</span>
                  </button>
                )}

                {modalSecaoAberta === 'pagamentos' && (
                  <button
                    type="button"
                    onClick={abrirModalNovoPagamento}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Nova Forma</span>
                    <span className="sm:hidden">+ Novo</span>
                  </button>
                )}

                {rotaOrigem && (
                  <button
                    type="button"
                    onClick={handleVoltar}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition cursor-pointer"
                    title="Concluir e voltar ao cadastro do produto"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Voltar ao Produto</span>
                    <span className="sm:hidden">Produto</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (rotaOrigem) {
                      handleVoltar();
                    } else {
                      setModalSecaoAberta(null);
                      setBusca('');
                    }
                  }}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 md:hover:text-white hover:bg-slate-100 md:hover:bg-slate-800 transition cursor-pointer"
                  title={rotaOrigem ? "Voltar ao Produto" : "Fechar"}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* BARRA DE PESQUISA (QUANDO NÃO É PRECIFICAÇÃO) */}
            {modalSecaoAberta !== 'precificacao' && (
              <div className="p-3 sm:px-6 bg-slate-50 md:bg-slate-950/60 border-b border-slate-200 md:border-slate-800 shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder={
                      modalSecaoAberta === 'categorias'
                        ? 'Buscar categoria por nome...'
                        : modalSecaoAberta === 'unidades'
                        ? 'Buscar por sigla ou nome...'
                        : modalSecaoAberta === 'fornecedores'
                        ? 'Buscar por nome, contato ou telefone...'
                        : 'Buscar forma de pagamento...'
                    }
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="w-full bg-white md:bg-slate-900 border border-slate-200 md:border-slate-800 rounded-xl pl-10 pr-8 py-2 text-xs text-slate-800 md:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 transition"
                  />
                  {busca && (
                    <button
                      onClick={() => setBusca('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 md:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* CORPO DO MODAL (COM SCROLL) */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {/* 1. MODAL CATEGORIAS */}
              {modalSecaoAberta === 'categorias' && (
                carregando ? (
                  <div className="py-12 flex justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
                ) : categoriasFiltradas.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-300 md:border-slate-800 rounded-2xl text-slate-400 text-xs">
                    Nenhuma categoria encontrada. Clique em <strong>Nova Categoria</strong> para adicionar.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {categoriasFiltradas.map((cat) => {
                      const qtdProds = contagemProdutosCat[cat.id] || 0;
                      return (
                        <div
                          key={cat.id}
                          className="p-3.5 bg-slate-50 md:bg-slate-950/80 border border-slate-200 md:border-slate-800 rounded-2xl flex items-center justify-between hover:border-slate-300 md:hover:border-slate-700 transition group shadow-2xs"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-white md:bg-slate-800 border border-slate-200 md:border-slate-700 flex items-center justify-center text-lg shrink-0">
                              {cat.icone || '📦'}
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-bold text-slate-800 md:text-slate-100 text-xs group-hover:text-emerald-500 transition truncate">
                                {cat.nome}
                              </h3>
                              <span className="text-[11px] text-slate-500 md:text-slate-400">
                                {qtdProds} {qtdProds === 1 ? 'produto' : 'produtos'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setCatEditando(cat);
                                setCatNome(cat.nome);
                                setCatIcone(cat.icone || '📦');
                                setModalCategoriaAberta(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 md:text-slate-400 hover:text-indigo-600 md:hover:text-indigo-400 hover:bg-slate-100 md:hover:bg-slate-800 transition cursor-pointer"
                              title="Editar Categoria"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => excluirCategoria(cat)}
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 md:hover:bg-rose-500/10 transition cursor-pointer"
                              title="Excluir Categoria"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {/* 2. MODAL UNIDADES DE MEDIDA */}
              {modalSecaoAberta === 'unidades' && (
                carregando ? (
                  <div className="py-12 flex justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
                ) : unidadesFiltradas.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-300 md:border-slate-800 rounded-2xl text-slate-400 text-xs">
                    Nenhuma unidade encontrada.
                  </div>
                ) : (
                  <div className="border border-slate-200 md:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs text-slate-700 md:text-slate-300">
                      <thead className="bg-slate-100 md:bg-slate-950/80 text-slate-600 md:text-slate-400 font-semibold border-b border-slate-200 md:border-slate-800 uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="p-3.5">Sigla</th>
                          <th className="p-3.5">Descrição</th>
                          <th className="p-3.5">Permite Fracionado</th>
                          <th className="p-3.5 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 md:divide-slate-800/60 bg-white md:bg-transparent">
                        {unidadesFiltradas.map((u) => (
                          <tr key={u.id} className="hover:bg-slate-50 md:hover:bg-slate-800/40 transition">
                            <td className="p-3.5 font-mono font-bold text-emerald-600 md:text-emerald-400">
                              <span className="px-2 py-1 rounded-lg bg-emerald-50 md:bg-emerald-500/10 border border-emerald-200 md:border-emerald-500/30">
                                {u.sigla.toUpperCase()}
                              </span>
                            </td>
                            <td className="p-3.5 font-semibold text-slate-800 md:text-slate-200">
                              {u.nome}
                            </td>
                            <td className="p-3.5">
                              {u.permite_fracionado ? (
                                <span className="text-indigo-600 md:text-indigo-300 bg-indigo-50 md:bg-indigo-500/10 border border-indigo-200 md:border-indigo-500/20 px-2 py-0.5 rounded text-[11px] font-bold">
                                  Sim (decimais)
                                </span>
                              ) : (
                                <span className="text-slate-500 md:text-slate-400 bg-slate-100 md:bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                                  Apenas Inteiro
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUnidadeEditando(u);
                                    setUnidadeSigla(u.sigla);
                                    setUnidadeNome(u.nome);
                                    setUnidadeFracionada(u.permite_fracionado);
                                    setModalUnidadeAberta(true);
                                  }}
                                  className="p-1.5 rounded-lg text-slate-500 md:text-slate-400 hover:text-indigo-600 md:hover:text-indigo-400 hover:bg-slate-100 md:hover:bg-slate-800 transition cursor-pointer"
                                  title="Editar Unidade"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                {u.sigla !== 'un' && (
                                  <button
                                    type="button"
                                    onClick={() => excluirUnidade(u)}
                                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 md:hover:bg-rose-500/10 transition cursor-pointer"
                                    title="Excluir Unidade"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {/* 3. MODAL FORNECEDORES */}
              {modalSecaoAberta === 'fornecedores' && (
                carregando ? (
                  <div className="py-12 flex justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
                ) : fornecedoresFiltrados.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-300 md:border-slate-800 rounded-2xl text-slate-400 text-xs">
                    Nenhum fornecedor cadastrado. Clique em <strong>Novo Fornecedor</strong> para adicionar.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {fornecedoresFiltrados.map((forn) => (
                      <div
                        key={forn.id}
                        className="p-4 bg-slate-50 md:bg-slate-950/80 border border-slate-200 md:border-slate-800 rounded-2xl flex flex-col justify-between hover:border-slate-300 md:hover:border-slate-700 transition shadow-2xs group"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="font-bold text-slate-800 md:text-slate-100 text-xs sm:text-sm group-hover:text-emerald-500 transition truncate">
                                {forn.nome}
                              </h3>
                              {forn.pessoa_contato && (
                                <p className="text-[11px] text-slate-500 md:text-slate-400 flex items-center gap-1 mt-0.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Contato: {forn.pessoa_contato}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setFornecedorEditando(forn);
                                  setFornNome(forn.nome);
                                  setFornContato(forn.pessoa_contato || '');
                                  setFornDoc(forn.numero_documento || '');
                                  setFornWhatsapp(forn.whatsapp || forn.telefone || '');
                                  setFornEmail(forn.email || '');
                                  setFornObs(forn.observacoes || '');
                                  setModalFornecedorAberta(true);
                                }}
                                className="p-1.5 rounded-lg text-slate-500 md:text-slate-400 hover:text-indigo-600 md:hover:text-indigo-400 hover:bg-slate-100 md:hover:bg-slate-800 transition cursor-pointer"
                                title="Editar Fornecedor"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => excluirFornecedor(forn)}
                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 md:hover:bg-rose-500/10 transition cursor-pointer"
                                title="Excluir Fornecedor"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="text-[11px] text-slate-500 md:text-slate-400 space-y-1 pt-1 border-t border-slate-200 md:border-slate-800/80">
                            {forn.numero_documento && (
                              <div className="flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-slate-400" />
                                <span>CNPJ/CPF: {forn.numero_documento}</span>
                              </div>
                            )}
                            {forn.whatsapp && (
                              <div className="flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5 text-emerald-500" />
                                <span>{forn.whatsapp}</span>
                              </div>
                            )}
                            {forn.email && (
                              <div className="flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5 text-slate-400" />
                                <span className="truncate">{forn.email}</span>
                              </div>
                            )}
                            {forn.observacoes && (
                              <p className="text-[10px] text-slate-500 italic mt-1 bg-white md:bg-slate-900 p-2 rounded-lg border border-slate-200 md:border-slate-800 line-clamp-2">
                                "{forn.observacoes}"
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* 4. MODAL FORMAS DE PAGAMENTO */}
              {modalSecaoAberta === 'pagamentos' && (
                carregando ? (
                  <div className="py-12 flex justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
                ) : formasPagamentoFiltradas.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-300 md:border-slate-800 rounded-2xl text-slate-400 text-xs space-y-2">
                    <p>Nenhuma forma de pagamento cadastrada.</p>
                    <button
                      onClick={abrirModalNovoPagamento}
                      className="text-emerald-500 font-bold hover:underline"
                    >
                      Clique aqui para adicionar a primeira forma de pagamento
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {formasPagamentoFiltradas.map((fp) => {
                      const ehAtivo = fp.ativo !== false;

                      return (
                        <div
                          key={fp.id}
                          className={`border rounded-2xl p-4 space-y-3 transition shadow-xs ${
                            ehAtivo
                              ? 'bg-slate-50 md:bg-slate-950/80 border-slate-200 md:border-slate-800 hover:border-slate-300 md:hover:border-slate-700'
                              : 'bg-rose-50/50 md:bg-slate-950/40 border-rose-200 md:border-rose-950/40 opacity-70'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                                fp.tipo === 'dinheiro' ? 'bg-emerald-50 md:bg-emerald-500/10 border-emerald-200 md:border-emerald-500/30 text-emerald-600 md:text-emerald-400' :
                                fp.tipo === 'pix' ? 'bg-cyan-50 md:bg-cyan-500/10 border-cyan-200 md:border-cyan-500/30 text-cyan-600 md:text-cyan-400' :
                                fp.tipo === 'cartao_credito' ? 'bg-purple-50 md:bg-purple-500/10 border-purple-200 md:border-purple-500/30 text-purple-600 md:text-purple-400' :
                                fp.tipo === 'cartao_debito' ? 'bg-blue-50 md:bg-blue-500/10 border-blue-200 md:border-blue-500/30 text-blue-600 md:text-blue-400' :
                                fp.tipo === 'fiado' ? 'bg-amber-50 md:bg-amber-500/10 border-amber-200 md:border-amber-500/30 text-amber-600 md:text-amber-400' :
                                'bg-slate-100 md:bg-slate-800 border-slate-200 md:border-slate-700 text-slate-600 md:text-slate-300'
                              }`}>
                                {fp.tipo === 'dinheiro' && <Banknote className="w-4 h-4" />}
                                {fp.tipo === 'pix' && <Zap className="w-4 h-4" />}
                                {fp.tipo === 'cartao_credito' && <CreditCard className="w-4 h-4" />}
                                {fp.tipo === 'cartao_debito' && <CreditCard className="w-4 h-4" />}
                                {fp.tipo === 'fiado' && <FileText className="w-4 h-4" />}
                                {fp.tipo !== 'dinheiro' && fp.tipo !== 'pix' && fp.tipo !== 'cartao_credito' && fp.tipo !== 'cartao_debito' && fp.tipo !== 'fiado' && (
                                  <CreditCard className="w-4 h-4" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <h3 className="font-bold text-slate-800 md:text-slate-100 text-xs sm:text-sm truncate">
                                  {fp.nome}
                                </h3>
                                <span className="text-[10px] uppercase font-bold text-slate-400">
                                  {fp.tipo === 'dinheiro' && 'Dinheiro'}
                                  {fp.tipo === 'pix' && 'PIX'}
                                  {fp.tipo === 'cartao_credito' && 'Crédito'}
                                  {fp.tipo === 'cartao_debito' && 'Débito'}
                                  {fp.tipo === 'fiado' && 'Fiado'}
                                  {fp.tipo === 'outro' && 'Outro'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => abrirModalEditarPagamento(fp)}
                                className="p-1.5 rounded-lg text-slate-500 md:text-slate-400 hover:text-slate-800 md:hover:text-slate-200 hover:bg-slate-100 md:hover:bg-slate-800 transition cursor-pointer"
                                title="Editar Forma de Pagamento"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => excluirFormaPagamento(fp)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 md:hover:text-rose-400 hover:bg-rose-50 md:hover:bg-rose-500/10 transition cursor-pointer"
                                title="Excluir Forma de Pagamento"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Taxas e Prazos */}
                          <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-200 md:border-slate-800/80">
                            <div className="bg-white md:bg-slate-900/60 p-2 rounded-xl border border-slate-200 md:border-slate-800/60">
                              <span className="text-[10px] text-slate-400 block font-medium">Taxa:</span>
                              <span className="font-bold text-slate-700 md:text-slate-200 text-[11px]">
                                {Number(fp.taxa_percentual || 0) > 0 ? `${fp.taxa_percentual}%` : 'Sem taxa'}
                              </span>
                            </div>

                            <div className="bg-white md:bg-slate-900/60 p-2 rounded-xl border border-slate-200 md:border-slate-800/60">
                              <span className="text-[10px] text-slate-400 block font-medium">Parcelamento:</span>
                              <span className="font-bold text-slate-700 md:text-slate-200 text-[11px]">
                                {fp.tipo === 'cartao_credito' ? `Até ${fp.maximo_parcelas || 1}x` : 'À vista'}
                              </span>
                            </div>
                          </div>

                          {/* Switches de Status */}
                          <div className="flex items-center justify-between pt-1 text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${fp.exibir_catalogo ? 'bg-cyan-500' : 'bg-slate-400'}`} />
                              <span className="text-[11px] text-slate-500 md:text-slate-400">
                                {fp.exibir_catalogo ? 'No Catálogo' : 'Apenas PDV'}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => alternarStatusPagamento(fp)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                                ehAtivo
                                  ? 'bg-emerald-50 md:bg-emerald-500/15 text-emerald-700 md:text-emerald-400 border border-emerald-200 md:border-emerald-500/30'
                                  : 'bg-rose-50 md:bg-rose-500/15 text-rose-700 md:text-rose-400 border border-rose-200 md:border-rose-500/30'
                              }`}
                            >
                              {ehAtivo ? 'Ativo' : 'Inativo'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {/* 5. MODAL REGRAS DE PRECIFICAÇÃO */}
              {modalSecaoAberta === 'precificacao' && (
                <form onSubmit={salvarRegrasPrecificacao} className="space-y-5">
                  <div className="p-3.5 bg-indigo-50 md:bg-indigo-500/10 border border-indigo-200 md:border-indigo-500/30 rounded-2xl flex items-start gap-2.5">
                    <Sparkles className="w-5 h-5 text-indigo-600 md:text-indigo-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-700 md:text-slate-300 space-y-0.5">
                      <h4 className="font-bold text-indigo-700 md:text-indigo-300 text-xs sm:text-sm">Sugestão de Preços no HUBI</h4>
                      <p className="text-[11px]">
                        Defina os descontos padrão e o critério de ativação para vendas no atacado e para distribuidores (por valor em R$ ou quantidade de peças).
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* ATACADO */}
                    <div className="bg-slate-50 md:bg-slate-950/80 border border-slate-200 md:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
                      <div className="flex items-center gap-2 text-emerald-600 md:text-emerald-400 border-b border-slate-200 md:border-slate-800 pb-2.5">
                        <Percent className="w-5 h-5" />
                        <h3 className="font-bold text-sm text-slate-800 md:text-slate-100">Atacado</h3>
                      </div>

                      <div className="space-y-3.5">
                        <div>
                          <label className="text-xs font-semibold text-slate-600 md:text-slate-300 block mb-1">
                            Desconto Padrão (%):
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              value={descontoAtacado}
                              onChange={(e) => setDescontoAtacado(e.target.value)}
                              className="w-full bg-white md:bg-slate-900 border border-slate-200 md:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-emerald-600 md:text-emerald-400 focus:outline-none focus:border-emerald-500"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                          </div>
                        </div>

                        {/* OPÇÃO 1: VALOR */}
                        <div
                          onClick={() => {
                            setTipoMinimoAtacado('valor');
                            setQtdTotalMinimaAtacado('');
                            setQtdMinimaSkuAtacado('');
                          }}
                          className={`p-3 rounded-xl border transition cursor-pointer space-y-2 ${
                            tipoMinimoAtacado === 'valor'
                              ? 'bg-white md:bg-slate-950 border-emerald-500 shadow-2xs'
                              : 'bg-white/50 md:bg-slate-950/40 border-slate-200 md:border-slate-800 opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-700 md:text-slate-200 flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="tipo_minimo_atacado"
                                checked={tipoMinimoAtacado === 'valor'}
                                onChange={() => {
                                  setTipoMinimoAtacado('valor');
                                  setQtdTotalMinimaAtacado('');
                                  setQtdMinimaSkuAtacado('');
                                }}
                                className="text-emerald-500 focus:ring-emerald-500"
                              />
                              <span>Por Valor Mínimo (R$)</span>
                            </label>
                          </div>

                          <div className="relative pt-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              disabled={tipoMinimoAtacado !== 'valor'}
                              placeholder="1500.00"
                              value={valorMinimoAtacado}
                              onChange={(e) => {
                                setTipoMinimoAtacado('valor');
                                setValorMinimoAtacado(e.target.value);
                              }}
                              className="w-full bg-slate-50 md:bg-slate-900 border border-slate-200 md:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 md:text-slate-100 font-bold focus:outline-none focus:border-emerald-500 disabled:opacity-40"
                            />
                          </div>
                        </div>

                        {/* OPÇÃO 2: QUANTIDADE */}
                        <div
                          onClick={() => {
                            setTipoMinimoAtacado('quantidade');
                            setValorMinimoAtacado('');
                          }}
                          className={`p-3 rounded-xl border transition cursor-pointer space-y-2 ${
                            tipoMinimoAtacado === 'quantidade'
                              ? 'bg-white md:bg-slate-950 border-emerald-500 shadow-2xs'
                              : 'bg-white/50 md:bg-slate-950/40 border-slate-200 md:border-slate-800 opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-700 md:text-slate-200 flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="tipo_minimo_atacado"
                                checked={tipoMinimoAtacado === 'quantidade'}
                                onChange={() => {
                                  setTipoMinimoAtacado('quantidade');
                                  setValorMinimoAtacado('');
                                }}
                                className="text-emerald-500 focus:ring-emerald-500"
                              />
                              <span>Por Quantidade de Peças</span>
                            </label>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div>
                              <label className="text-[10px] text-slate-500 block mb-0.5">Qtd Total:</label>
                              <input
                                type="number"
                                min="1"
                                disabled={tipoMinimoAtacado !== 'quantidade'}
                                placeholder="50"
                                value={qtdTotalMinimaAtacado}
                                onChange={(e) => setQtdTotalMinimaAtacado(e.target.value)}
                                className="w-full bg-slate-50 md:bg-slate-900 border border-slate-200 md:border-slate-700 rounded-xl px-2.5 py-1 text-xs text-slate-800 md:text-slate-100 font-bold focus:outline-none focus:border-emerald-500 disabled:opacity-40"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-500 block mb-0.5">Mín por SKU:</label>
                              <input
                                type="number"
                                min="1"
                                disabled={tipoMinimoAtacado !== 'quantidade'}
                                placeholder="6"
                                value={qtdMinimaSkuAtacado}
                                onChange={(e) => setQtdMinimaSkuAtacado(e.target.value)}
                                className="w-full bg-slate-50 md:bg-slate-900 border border-slate-200 md:border-slate-700 rounded-xl px-2.5 py-1 text-xs text-slate-800 md:text-slate-100 font-bold focus:outline-none focus:border-emerald-500 disabled:opacity-40"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* DISTRIBUIDOR / AUTOATACADO */}
                    <div className="bg-slate-50 md:bg-slate-950/80 border border-slate-200 md:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
                      <div className="flex items-center gap-2 text-indigo-600 md:text-indigo-400 border-b border-slate-200 md:border-slate-800 pb-2.5">
                        <Percent className="w-5 h-5" />
                        <h3 className="font-bold text-sm text-slate-800 md:text-slate-100">Distribuidor</h3>
                      </div>

                      <div className="space-y-3.5">
                        <div>
                          <label className="text-xs font-semibold text-slate-600 md:text-slate-300 block mb-1">
                            Desconto Padrão (%):
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              value={descontoAutoatacado}
                              onChange={(e) => setDescontoAutoatacado(e.target.value)}
                              className="w-full bg-white md:bg-slate-900 border border-slate-200 md:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-indigo-600 md:text-indigo-400 focus:outline-none focus:border-indigo-500"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                          </div>
                        </div>

                        {/* OPÇÃO 1: VALOR */}
                        <div
                          onClick={() => {
                            setTipoMinimoDistribuidor('valor');
                            setQtdTotalMinimaAutoatacado('');
                            setQtdMinimaSkuAutoatacado('');
                          }}
                          className={`p-3 rounded-xl border transition cursor-pointer space-y-2 ${
                            tipoMinimoDistribuidor === 'valor'
                              ? 'bg-white md:bg-slate-950 border-indigo-500 shadow-2xs'
                              : 'bg-white/50 md:bg-slate-950/40 border-slate-200 md:border-slate-800 opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-700 md:text-slate-200 flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="tipo_minimo_distribuidor"
                                checked={tipoMinimoDistribuidor === 'valor'}
                                onChange={() => {
                                  setTipoMinimoDistribuidor('valor');
                                  setQtdTotalMinimaAutoatacado('');
                                  setQtdMinimaSkuAutoatacado('');
                                }}
                                className="text-indigo-500 focus:ring-indigo-500"
                              />
                              <span>Por Valor Mínimo (R$)</span>
                            </label>
                          </div>

                          <div className="relative pt-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              disabled={tipoMinimoDistribuidor !== 'valor'}
                              placeholder="3000.00"
                              value={valorMinimoAutoatacado}
                              onChange={(e) => {
                                setTipoMinimoDistribuidor('valor');
                                setValorMinimoAutoatacado(e.target.value);
                              }}
                              className="w-full bg-slate-50 md:bg-slate-900 border border-slate-200 md:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 md:text-slate-100 font-bold focus:outline-none focus:border-indigo-500 disabled:opacity-40"
                            />
                          </div>
                        </div>

                        {/* OPÇÃO 2: QUANTIDADE */}
                        <div
                          onClick={() => {
                            setTipoMinimoDistribuidor('quantidade');
                            setValorMinimoAutoatacado('');
                          }}
                          className={`p-3 rounded-xl border transition cursor-pointer space-y-2 ${
                            tipoMinimoDistribuidor === 'quantidade'
                              ? 'bg-white md:bg-slate-950 border-indigo-500 shadow-2xs'
                              : 'bg-white/50 md:bg-slate-950/40 border-slate-200 md:border-slate-800 opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-700 md:text-slate-200 flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="tipo_minimo_distribuidor"
                                checked={tipoMinimoDistribuidor === 'quantidade'}
                                onChange={() => {
                                  setTipoMinimoDistribuidor('quantidade');
                                  setValorMinimoAutoatacado('');
                                }}
                                className="text-indigo-500 focus:ring-indigo-500"
                              />
                              <span>Por Quantidade de Peças</span>
                            </label>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div>
                              <label className="text-[10px] text-slate-500 block mb-0.5">Qtd Total:</label>
                              <input
                                type="number"
                                min="1"
                                disabled={tipoMinimoDistribuidor !== 'quantidade'}
                                placeholder="100"
                                value={qtdTotalMinimaAutoatacado}
                                onChange={(e) => setQtdTotalMinimaAutoatacado(e.target.value)}
                                className="w-full bg-slate-50 md:bg-slate-900 border border-slate-200 md:border-slate-700 rounded-xl px-2.5 py-1 text-xs text-slate-800 md:text-slate-100 font-bold focus:outline-none focus:border-indigo-500 disabled:opacity-40"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-500 block mb-0.5">Mín por SKU:</label>
                              <input
                                type="number"
                                min="1"
                                disabled={tipoMinimoDistribuidor !== 'quantidade'}
                                placeholder="6"
                                value={qtdMinimaSkuAutoatacado}
                                onChange={(e) => setQtdMinimaSkuAutoatacado(e.target.value)}
                                className="w-full bg-slate-50 md:bg-slate-900 border border-slate-200 md:border-slate-700 rounded-xl px-2.5 py-1 text-xs text-slate-800 md:text-slate-100 font-bold focus:outline-none focus:border-indigo-500 disabled:opacity-40"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Botão Salvar Regras */}
                  <button
                    type="submit"
                    disabled={salvando}
                    className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 font-bold text-white shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 text-xs sm:text-sm transition disabled:opacity-50 cursor-pointer"
                  >
                    {salvando ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Salvando regras...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Salvar Regras de Precificação</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL CATEGORIA                                                           */}
      {/* ========================================================================= */}
      {modalCategoriaAberta && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white md:bg-slate-900 border border-slate-200 md:border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl text-slate-800 md:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-200 md:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-800 md:text-slate-100">
                {catEditando ? 'Editar Categoria' : 'Nova Categoria'}
              </h3>
              <button onClick={() => setModalCategoriaAberta(false)} className="text-slate-400 hover:text-slate-700 md:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={salvarCategoria} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 md:text-slate-300 block mb-1">Nome da Categoria:</label>
                <input
                  type="text"
                  placeholder="Ex: BEBIDAS, ROUPAS..."
                  value={catNome}
                  onChange={(e) => setCatNome(e.target.value)}
                  className="w-full bg-slate-50 md:bg-slate-950 border border-slate-200 md:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 md:text-slate-100 uppercase focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 md:text-slate-300 block mb-1">Ícone / Emoji:</label>
                <input
                  type="text"
                  value={catIcone}
                  onChange={(e) => setCatIcone(e.target.value)}
                  className="w-full bg-slate-50 md:bg-slate-950 border border-slate-200 md:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 md:text-slate-100 focus:outline-none focus:border-emerald-500"
                  placeholder="Ex: 📦, 🧴, 🥤, 👗, 🍔"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalCategoriaAberta(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 md:border-slate-700 bg-slate-100 md:bg-transparent hover:bg-slate-200 md:hover:bg-slate-800 text-slate-700 md:text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {salvando ? 'Salvando...' : 'Salvar Categoria'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL UNIDADE DE MEDIDA                                                   */}
      {/* ========================================================================= */}
      {modalUnidadeAberta && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white md:bg-slate-900 border border-slate-200 md:border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl text-slate-800 md:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-200 md:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-800 md:text-slate-100">
                {unidadeEditando ? 'Editar Unidade de Medida' : 'Nova Unidade de Medida'}
              </h3>
              <button onClick={() => setModalUnidadeAberta(false)} className="text-slate-400 hover:text-slate-700 md:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={salvarUnidade} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Sigla (ex: un, kg, cx, par):</label>
                <input
                  type="text"
                  maxLength={10}
                  placeholder="Ex: cx, kg, par, kit..."
                  value={unidadeSigla}
                  onChange={(e) => setUnidadeSigla(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-emerald-400 uppercase focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Descrição Completa:</label>
                <input
                  type="text"
                  placeholder="Ex: Caixa com 12 unidades, Quilograma, Metro..."
                  value={unidadeNome}
                  onChange={(e) => setUnidadeNome(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <label className="flex items-center gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={unidadeFracionada}
                  onChange={(e) => setUnidadeFracionada(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-0"
                />
                <div>
                  <span className="font-bold text-xs text-slate-200">Permite Venda Fracionada (Decimais)</span>
                  <span className="text-[11px] text-slate-400 block">Ex: 0.500 kg, 1.25 metros</span>
                </div>
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalUnidadeAberta(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {salvando ? 'Salvando...' : 'Salvar Unidade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL FORNECEDOR                                                          */}
      {/* ========================================================================= */}
      {modalFornecedorAberta && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white md:bg-slate-900 border border-slate-200 md:border-slate-800 rounded-3xl w-full max-w-lg p-6 space-y-4 shadow-2xl text-slate-800 md:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-200 md:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-800 md:text-slate-100">
                {fornecedorEditando ? 'Editar Fornecedor' : 'Novo Fornecedor'}
              </h3>
              <button onClick={() => setModalFornecedorAberta(false)} className="text-slate-400 hover:text-slate-700 md:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={salvarFornecedor} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Nome / Razão Social:*</label>
                <input
                  type="text"
                  placeholder="Ex: Distribuidora Nacional de Bebidas Ltda"
                  value={fornNome}
                  onChange={(e) => setFornNome(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Pessoa de Contato:</label>
                  <input
                    type="text"
                    placeholder="Ex: Carlos Representante"
                    value={fornContato}
                    onChange={(e) => setFornContato(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">CNPJ / CPF:</label>
                  <input
                    type="text"
                    placeholder="00.000.000/0000-00"
                    value={fornDoc}
                    onChange={(e) => setFornDoc(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">WhatsApp / Telefone:</label>
                  <input
                    type="text"
                    placeholder="(11) 99999-9999"
                    value={fornWhatsapp}
                    onChange={(e) => setFornWhatsapp(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">E-mail:</label>
                  <input
                    type="email"
                    placeholder="pedidos@fornecedor.com.br"
                    value={fornEmail}
                    onChange={(e) => setFornEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Observações / Condições Comerciais:</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Prazo de entrega de 3 dias úteis, faturamento mínimo de R$ 500,00..."
                  value={fornObs}
                  onChange={(e) => setFornObs(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalFornecedorAberta(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {salvando ? 'Salvando...' : 'Salvar Fornecedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: FORMA DE PAGAMENTO                                                */}
      {/* ========================================================================= */}
      {modalPagamentoAberta && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white md:bg-slate-900 border border-slate-200 md:border-slate-800 rounded-3xl w-full max-w-lg p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-slate-800 md:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-200 md:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-800 md:text-slate-100 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600 md:text-emerald-400" />
                <span>{pagEditando ? 'Editar Forma de Pagamento' : 'Nova Forma de Pagamento'}</span>
              </h3>
              <button
                onClick={() => setModalPagamentoAberta(false)}
                className="text-slate-400 hover:text-slate-700 md:hover:text-white p-1 rounded-lg hover:bg-slate-100 md:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={salvarFormaPagamento} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Nome de Exibição:*
                </label>
                <input
                  type="text"
                  placeholder="Ex: Cartão de Crédito - Maquininha Stone"
                  value={pagNome}
                  onChange={(e) => setPagNome(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Tipo / Modalidade:*
                  </label>
                  <select
                    value={pagTipo}
                    onChange={(e) => setPagTipo(e.target.value as TipoPagamento)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="dinheiro">Dinheiro (Espécie)</option>
                    <option value="pix">PIX (Instantâneo)</option>
                    <option value="cartao_debito">Cartão de Débito</option>
                    <option value="cartao_credito">Cartão de Crédito</option>
                    <option value="fiado">Fiado / A Prazo</option>
                    <option value="outro">Outro Meio</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Parcelamento Máximo:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="48"
                    placeholder="1"
                    value={pagMaximoParcelas}
                    onChange={(e) => setPagMaximoParcelas(e.target.value)}
                    disabled={pagTipo !== 'cartao_credito' && pagTipo !== 'outro'}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 disabled:opacity-40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Taxa da Maquininha (%):
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="0.00"
                      value={pagTaxaPercentual}
                      onChange={(e) => setPagTaxaPercentual(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 pr-8 font-semibold"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">%</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Taxa Fixa por Venda (R$):
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={pagTaxaFixa}
                      onChange={(e) => setPagTaxaFixa(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-semibold"
                    />
                  </div>
                </div>
              </div>

              {/* Switches de Comportamento */}
              <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-2.5">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-200 block">Ativo para Vendas</span>
                    <span className="text-[11px] text-slate-400 block">Disponibilizar esta opção no PDV e fechamento de vendas</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={pagAtivo}
                    onChange={(e) => setPagAtivo(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500/20 bg-slate-800 border-slate-700 cursor-pointer"
                  />
                </label>

                <div className="border-t border-slate-800/80 pt-2.5">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-slate-200 block">Exibir no Catálogo Online</span>
                      <span className="text-[11px] text-slate-400 block">Mostrar este meio de pagamento aos clientes no catálogo público</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={pagExibirCatalogo}
                      onChange={(e) => setPagExibirCatalogo(e.target.checked)}
                      className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-500/20 bg-slate-800 border-slate-700 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalPagamentoAberta(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {salvando ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>Salvar Meio de Pagamento</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default CadastrosAuxiliares;
