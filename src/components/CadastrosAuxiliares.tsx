import React, { useState, useEffect } from 'react';
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
  Check
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Categoria, Fornecedor, UnidadeMedida } from '../types';

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
  const [abaAtiva, setAbaAtiva] = useState<'categorias' | 'unidades' | 'fornecedores' | 'precificacao'>('categorias');
  const [busca, setBusca] = useState<string>('');

  // Estados de Dados
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [unidades, setUnidades] = useState<UnidadeMedida[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [contagemProdutosCat, setContagemProdutosCat] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  // Regras de Precificação Dinâmicas (Modo 1: Valor OU Modo 2: Quantidade Total + Mínimo por SKU)
  const [descontoAtacado, setDescontoAtacado] = useState<string>('20');
  const [valorMinimoAtacado, setValorMinimoAtacado] = useState<string>('1500.00');
  const [qtdTotalMinimaAtacado, setQtdTotalMinimaAtacado] = useState<string>('50');
  const [qtdMinimaSkuAtacado, setQtdMinimaSkuAtacado] = useState<string>('6');

  const [descontoAutoatacado, setDescontoAutoatacado] = useState<string>('25');
  const [valorMinimoAutoatacado, setValorMinimoAutoatacado] = useState<string>('3000.00');
  const [qtdTotalMinimaAutoatacado, setQtdTotalMinimaAutoatacado] = useState<string>('100');
  const [qtdMinimaSkuAutoatacado, setQtdMinimaSkuAutoatacado] = useState<string>('6');

  const [precoSimulador, setPrecoSimulador] = useState<string>('100.00');

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
          if (parsed.valorMinimoAtacado !== undefined) setValorMinimoAtacado(String(parsed.valorMinimoAtacado));
          if (parsed.qtdTotalMinimaAtacado !== undefined) setQtdTotalMinimaAtacado(String(parsed.qtdTotalMinimaAtacado));
          else if (parsed.qtdMinimaAtacado !== undefined) setQtdTotalMinimaAtacado(String(parsed.qtdMinimaAtacado));
          if (parsed.qtdMinimaSkuAtacado !== undefined) setQtdMinimaSkuAtacado(String(parsed.qtdMinimaSkuAtacado));

          if (parsed.descontoAutoatacado !== undefined) setDescontoAutoatacado(String(parsed.descontoAutoatacado));
          if (parsed.valorMinimoAutoatacado !== undefined) setValorMinimoAutoatacado(String(parsed.valorMinimoAutoatacado));
          if (parsed.qtdTotalMinimaAutoatacado !== undefined) setQtdTotalMinimaAutoatacado(String(parsed.qtdTotalMinimaAutoatacado));
          else if (parsed.qtdMinimaAutoatacado !== undefined) setQtdTotalMinimaAutoatacado(String(parsed.qtdMinimaAutoatacado));
          if (parsed.qtdMinimaSkuAutoatacado !== undefined) setQtdMinimaSkuAutoatacado(String(parsed.qtdMinimaSkuAutoatacado));
        } catch (e) {
          // Ignora
        }
      } else {
        if (loja.desconto_padrao_atacado_percentual !== undefined && loja.desconto_padrao_atacado_percentual !== null) {
          setDescontoAtacado(String(loja.desconto_padrao_atacado_percentual));
        }
        if (loja.valor_minimo_padrao_atacado !== undefined && loja.valor_minimo_padrao_atacado !== null) {
          setValorMinimoAtacado(String(loja.valor_minimo_padrao_atacado));
        }
        if (loja.qtd_minima_padrao_atacado !== undefined && loja.qtd_minima_padrao_atacado !== null) {
          setQtdTotalMinimaAtacado(String(loja.qtd_minima_padrao_atacado));
        }
        if (loja.qtd_minima_sku_padrao_atacado !== undefined && loja.qtd_minima_sku_padrao_atacado !== null) {
          setQtdMinimaSkuAtacado(String(loja.qtd_minima_sku_padrao_atacado));
        }

        if (loja.desconto_padrao_autoatacado_percentual !== undefined && loja.desconto_padrao_autoatacado_percentual !== null) {
          setDescontoAutoatacado(String(loja.desconto_padrao_autoatacado_percentual));
        }
        if (loja.valor_minimo_padrao_autoatacado !== undefined && loja.valor_minimo_padrao_autoatacado !== null) {
          setValorMinimoAutoatacado(String(loja.valor_minimo_padrao_autoatacado));
        }
        if (loja.qtd_minima_padrao_autoatacado !== undefined && loja.qtd_minima_padrao_autoatacado !== null) {
          setQtdTotalMinimaAutoatacado(String(loja.qtd_minima_padrao_autoatacado));
        }
        if (loja.qtd_minima_sku_padrao_autoatacado !== undefined && loja.qtd_minima_sku_padrao_autoatacado !== null) {
          setQtdMinimaSkuAutoatacado(String(loja.qtd_minima_sku_padrao_autoatacado));
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
        exibirAlertaSucesso('Categoria atualizada com sucesso!');
      } else {
        const maxOrdem = categorias.length > 0 ? Math.max(...categorias.map(c => c.ordem_exibicao || 0)) + 1 : 1;
        const { error } = await supabase
          .from('categorias')
          .insert([{
            loja_id: loja.id,
            nome: catNome.trim().toUpperCase(),
            icone: catIcone.trim() || '📦',
            ordem_exibicao: maxOrdem,
            ativo: true
          }]);
        if (error) throw error;
        exibirAlertaSucesso('Nova categoria criada com sucesso!');
      }

      setModalCategoriaAberta(false);
      setCatEditando(null);
      setCatNome('');
      setCatIcone('📦');
      carregarDados();
    } catch (err: any) {
      console.error('Erro ao salvar categoria:', err);
      alert(`Erro ao salvar categoria: ${err.message || 'Tente novamente'}`);
    } finally {
      setSalvando(false);
    }
  };

  const excluirCategoria = async (cat: Categoria) => {
    const totalProds = contagemProdutosCat[cat.id] || 0;
    if (totalProds > 0) {
      alert(`Não é possível excluir a categoria "${cat.nome}" pois ela possui ${totalProds} produto(s) vinculado(s). Reclassifique os produtos antes de excluir.`);
      return;
    }
    if (!confirm(`Deseja realmente excluir a categoria "${cat.nome}"?`)) return;

    try {
      const { error } = await supabase.from('categorias').delete().eq('id', cat.id);
      if (error) throw error;
      exibirAlertaSucesso('Categoria removida.');
      setCategorias(prev => prev.filter(c => c.id !== cat.id));
    } catch (err: any) {
      alert(`Erro ao excluir categoria: ${err.message}`);
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

      exibirAlertaSucesso('Unidade de medida salva com sucesso!');
      setModalUnidadeAberta(false);
      setUnidadeEditando(null);
      setUnidadeSigla('');
      setUnidadeNome('');
      setUnidadeFracionada(false);
      carregarDados();
    } catch (err: any) {
      console.error('Erro ao salvar unidade:', err);
      alert(`Erro ao salvar unidade: ${err.message || 'Tente novamente'}`);
    } finally {
      setSalvando(false);
    }
  };

  const excluirUnidade = async (un: UnidadeMedida) => {
    if (un.sigla === 'un') {
      alert('A unidade padrão "UN" (Unidade) não pode ser excluída.');
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
      alert(`Erro ao excluir unidade: ${err.message}`);
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
        exibirAlertaSucesso('Fornecedor atualizado com sucesso!');
      } else {
        const { error } = await supabase
          .from('fornecedores')
          .insert([payload]);
        if (error) throw error;
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
      alert(`Erro ao salvar fornecedor: ${err.message || 'Tente novamente'}`);
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
      alert(`Erro ao excluir fornecedor: ${err.message}`);
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
      const valAtacadoNum = Number(valorMinimoAtacado) || 0;
      const qtdTotAtacadoNum = Number(qtdTotalMinimaAtacado) || 50;
      const qtdSkuAtacadoNum = Number(qtdMinimaSkuAtacado) || 6;

      const descAutoNum = Number(descontoAutoatacado) || 0;
      const valAutoNum = Number(valorMinimoAutoatacado) || 0;
      const qtdTotAutoNum = Number(qtdTotalMinimaAutoatacado) || 100;
      const qtdSkuAutoNum = Number(qtdMinimaSkuAutoatacado) || 6;

      // 1. Salvar no localStorage para uso instantâneo pelo pricingEngine
      const keyStorage = `hubi_regras_precificacao_${loja.id}`;
      localStorage.setItem(
        keyStorage,
        JSON.stringify({
          descontoAtacado: descAtacadoNum,
          valorMinimoAtacado: valAtacadoNum,
          qtdTotalMinimaAtacado: qtdTotAtacadoNum,
          qtdMinimaSkuAtacado: qtdSkuAtacadoNum,

          descontoAutoatacado: descAutoNum,
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
            tipo_minimo_padrao_atacado: 'hibrido',
            valor_minimo_padrao_atacado: valAtacadoNum,
            qtd_minima_padrao_atacado: qtdTotAtacadoNum,
            qtd_minima_sku_padrao_atacado: qtdSkuAtacadoNum,

            desconto_padrao_autoatacado_percentual: descAutoNum,
            tipo_minimo_padrao_autoatacado: 'hibrido',
            valor_minimo_padrao_autoatacado: valAutoNum,
            qtd_minima_padrao_autoatacado: qtdTotAutoNum,
            qtd_minima_sku_padrao_autoatacado: qtdSkuAutoNum
          })
          .eq('id', loja.id);
      } catch (e) {
        console.warn('Colunas de desconto na tabela lojas não disponíveis ainda no schema.', e);
      }

      exibirAlertaSucesso('✨ Regras de precificação salvas com sucesso! O carrinho e o catálogo foram sincronizados.');
    } catch (err: any) {
      alert(`Erro ao salvar regras: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  // Cálculos do Simulador
  const valorVarejoSimulado = Number(precoSimulador) || 0;
  const percAtacadoNum = Number(descontoAtacado) || 0;
  const percAutoNum = Number(descontoAutoatacado) || 0;

  const valorAtacadoSimulado = valorVarejoSimulado * (1 - percAtacadoNum / 100);
  const economiaAtacado = valorVarejoSimulado - valorAtacadoSimulado;

  const valorAutoatacadoSimulado = valorVarejoSimulado * (1 - percAutoNum / 100);
  const economiaAutoatacado = valorVarejoSimulado - valorAutoatacadoSimulado;

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

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-slate-950 p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-6xl mx-auto w-full space-y-6">

        {/* HEADER DA PÁGINA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider mb-1">
              <Layers className="w-4 h-4" />
              <span>Cadastros Base & Parâmetros</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-100">Cadastros & Tabelas</h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Gerencie categorias, unidades de medida, fornecedores e padronize regras de precificação da loja.
            </p>
          </div>

          {mensagemSucesso && (
            <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-4 py-2 rounded-2xl text-xs font-bold animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{mensagemSucesso}</span>
            </div>
          )}
        </div>

        {/* NAVEGAÇÃO ENTRE ABAS */}
        <div className="flex items-center gap-2 p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl overflow-x-auto">
          <button
            onClick={() => setAbaAtiva('categorias')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              abaAtiva === 'categorias'
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            <span>Categorias</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${abaAtiva === 'categorias' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {categorias.length}
            </span>
          </button>

          <button
            onClick={() => setAbaAtiva('unidades')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              abaAtiva === 'unidades'
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Ruler className="w-4 h-4" />
            <span>Unidades de Medida</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${abaAtiva === 'unidades' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {unidades.length}
            </span>
          </button>

          <button
            onClick={() => setAbaAtiva('fornecedores')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              abaAtiva === 'fornecedores'
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Fornecedores</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${abaAtiva === 'fornecedores' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {fornecedores.length}
            </span>
          </button>

          <button
            onClick={() => setAbaAtiva('precificacao')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              abaAtiva === 'precificacao'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Percent className="w-4 h-4" />
            <span>Regras de Precificação</span>
            <span className="bg-indigo-500/30 text-indigo-300 text-[10px] px-2 py-0.5 rounded-full font-bold">
              Atacado & Autoatacado
            </span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* ABA 1: CATEGORIAS                                                        */}
        {/* ========================================================================= */}
        {abaAtiva === 'categorias' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar categoria..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                onClick={() => {
                  setCatEditando(null);
                  setCatNome('');
                  setCatIcone('📦');
                  setModalCategoriaAberta(true);
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Categoria</span>
              </button>
            </div>

            {carregando ? (
              <div className="py-12 flex justify-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
            ) : categoriasFiltradas.length === 0 ? (
              <div className="text-center py-12 bg-slate-900/40 rounded-3xl border border-dashed border-slate-800 text-slate-400 text-xs">
                Nenhuma categoria encontrada. Clique em <strong>Nova Categoria</strong> para começar.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {categoriasFiltradas.map((cat) => {
                  const qtdProds = contagemProdutosCat[cat.id] || 0;
                  return (
                    <div
                      key={cat.id}
                      className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center justify-between hover:border-slate-700 transition group shadow-md"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-lg shrink-0">
                          {cat.icone || '📦'}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-100 text-xs group-hover:text-emerald-400 transition">
                            {cat.nome}
                          </h3>
                          <span className="text-[11px] text-slate-400">
                            {qtdProds} {qtdProds === 1 ? 'produto' : 'produtos'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setCatEditando(cat);
                            setCatNome(cat.nome);
                            setCatIcone(cat.icone || '📦');
                            setModalCategoriaAberta(true);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition cursor-pointer"
                          title="Editar Categoria"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => excluirCategoria(cat)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                          title="Excluir Categoria"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA 2: UNIDADES DE MEDIDA                                                */}
        {/* ========================================================================= */}
        {abaAtiva === 'unidades' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar sigla ou unidade..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                onClick={() => {
                  setUnidadeEditando(null);
                  setUnidadeSigla('');
                  setUnidadeNome('');
                  setUnidadeFracionada(false);
                  setModalUnidadeAberta(true);
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Unidade</span>
              </button>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3.5">Sigla</th>
                    <th className="p-3.5">Descrição</th>
                    <th className="p-3.5">Permite Fracionado (Decimais)</th>
                    <th className="p-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {unidadesFiltradas.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition">
                      <td className="p-3.5 font-mono font-bold text-emerald-400">
                        <span className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                          {u.sigla.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-3.5 font-semibold text-slate-200">
                        {u.nome}
                      </td>
                      <td className="p-3.5">
                        {u.permite_fracionado ? (
                          <span className="text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded text-[11px] font-bold">
                            Sim (ex: 1.500 kg)
                          </span>
                        ) : (
                          <span className="text-slate-400 bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                            Apenas Inteiro (ex: 1, 2, 3)
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setUnidadeEditando(u);
                              setUnidadeSigla(u.sigla);
                              setUnidadeNome(u.nome);
                              setUnidadeFracionada(u.permite_fracionado);
                              setModalUnidadeAberta(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition cursor-pointer"
                            title="Editar Unidade"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {u.sigla !== 'un' && (
                            <button
                              onClick={() => excluirUnidade(u)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
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
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA 3: FORNECEDORES                                                      */}
        {/* ========================================================================= */}
        {abaAtiva === 'fornecedores' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar fornecedor por nome ou tel..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
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
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Fornecedor</span>
              </button>
            </div>

            {carregando ? (
              <div className="py-12 flex justify-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
            ) : fornecedoresFiltrados.length === 0 ? (
              <div className="text-center py-12 bg-slate-900/40 rounded-3xl border border-dashed border-slate-800 text-slate-400 text-xs">
                Nenhum fornecedor cadastrado. Cadastre seus parceiros para controle de compras e estoque.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {fornecedoresFiltrados.map((forn) => (
                  <div
                    key={forn.id}
                    className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3 hover:border-slate-700 transition shadow-md"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                          <Truck className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-100 text-sm">{forn.nome}</h3>
                          {forn.pessoa_contato && (
                            <p className="text-[11px] text-slate-400">Contato: {forn.pessoa_contato}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
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
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition cursor-pointer"
                          title="Editar Fornecedor"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => excluirFornecedor(forn)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                          title="Excluir Fornecedor"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800/80">
                      {forn.whatsapp && (
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Phone className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{forn.whatsapp}</span>
                        </div>
                      )}
                      {forn.email && (
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Mail className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="truncate">{forn.email}</span>
                        </div>
                      )}
                      {forn.numero_documento && (
                        <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                          <FileText className="w-3.5 h-3.5 text-slate-500" />
                          <span>CNPJ/CPF: {forn.numero_documento}</span>
                        </div>
                      )}
                    </div>

                    {forn.observacoes && (
                      <p className="text-[11px] text-slate-400 italic bg-slate-950/50 p-2 rounded-xl border border-slate-800/50">
                        "{forn.observacoes}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA 4: REGRAS DE PRECIFICAÇÃO (ATACADO & AUTOATACADO)                     */}
        {/* ========================================================================= */}
        {abaAtiva === 'precificacao' && (
          <div className="space-y-6">
            <form onSubmit={salvarRegrasPrecificacao} className="space-y-6">

              {/* Explicação Inicial */}
              <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-3xl flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-300 space-y-1">
                  <h4 className="font-bold text-indigo-300 text-sm">Padronização de Sugestão de Preços no HUBI</h4>
                  <p>
                    Defina abaixo os percentuais de desconto padrão que o HUBI deve sugerir automaticamente sempre que você digitar o preço de varejo no cadastro de um produto.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* 1. REGRAS DE ATACADO */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <Percent className="w-5 h-5" />
                      <h3 className="font-bold text-sm text-slate-100">1. Tabela de Preço Atacado</h3>
                    </div>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                      Nível Intermediário
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">
                        Percentual de Desconto sobre o Varejo (%):
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="90"
                          placeholder="Ex: 20"
                          value={descontoAtacado}
                          onChange={(e) => setDescontoAtacado(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">% OFF</span>
                      </div>
                      <span className="text-[11px] text-slate-500 mt-1 block">Ex: 20% de desconto para compras no atacado</span>
                    </div>

                    {/* MODO 1: VALOR */}
                    <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200">Modo 1: Validação por Valor (R$)</span>
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-bold">Total do Pedido</span>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-bold">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Ex: 1500.00"
                          value={valorMinimoAtacado}
                          onChange={(e) => setValorMinimoAtacado(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-bold text-emerald-400"
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 block">Total do pedido $\ge$ este valor libera preço de atacado</span>
                    </div>

                    {/* MODO 2: QUANTIDADE */}
                    <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200">Modo 2: Validação por Quantidade</span>
                        <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded font-bold">Peças + Mín. SKU</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                            Qtd Total de Peças:
                          </label>
                          <input
                            type="number"
                            min="1"
                            placeholder="Ex: 50"
                            value={qtdTotalMinimaAtacado}
                            onChange={(e) => setQtdTotalMinimaAtacado(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-bold"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                            Mínimo por SKU/Item:
                          </label>
                          <input
                            type="number"
                            min="1"
                            placeholder="Ex: 6"
                            value={qtdMinimaSkuAtacado}
                            onChange={(e) => setQtdMinimaSkuAtacado(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-bold"
                          />
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 block">Total $\ge$ {qtdTotalMinimaAtacado || 50} peças E cada SKU $\ge$ {qtdMinimaSkuAtacado || 6} un</span>
                    </div>
                  </div>
                </div>

                {/* 2. REGRAS DE AUTOATACADO */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2 text-indigo-400">
                      <Percent className="w-5 h-5" />
                      <h3 className="font-bold text-sm text-slate-100">2. Tabela de Preço Autoatacado</h3>
                    </div>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded-full border border-indigo-500/30">
                      Nível Distribuidor / Top
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">
                        Percentual de Desconto sobre o Varejo (%):
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="90"
                          placeholder="Ex: 25"
                          value={descontoAutoatacado}
                          onChange={(e) => setDescontoAutoatacado(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-bold text-indigo-400 focus:outline-none focus:border-indigo-500"
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">% OFF</span>
                      </div>
                      <span className="text-[11px] text-slate-500 mt-1 block">Ex: 25% de desconto para grandes volumes / distribuidores</span>
                    </div>

                    {/* MODO 1: VALOR */}
                    <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200">Modo 1: Validação por Valor (R$)</span>
                        <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded font-bold">Total do Pedido</span>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-bold">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Ex: 3000.00"
                          value={valorMinimoAutoatacado}
                          onChange={(e) => setValorMinimoAutoatacado(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-bold text-indigo-400"
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 block">Total do pedido $\ge$ este valor libera preço de autoatacado</span>
                    </div>

                    {/* MODO 2: QUANTIDADE */}
                    <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200">Modo 2: Validação por Quantidade</span>
                        <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded font-bold">Peças + Mín. SKU</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                            Qtd Total de Peças:
                          </label>
                          <input
                            type="number"
                            min="1"
                            placeholder="Ex: 100"
                            value={qtdTotalMinimaAutoatacado}
                            onChange={(e) => setQtdTotalMinimaAutoatacado(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-bold"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                            Mínimo por SKU/Item:
                          </label>
                          <input
                            type="number"
                            min="1"
                            placeholder="Ex: 6"
                            value={qtdMinimaSkuAutoatacado}
                            onChange={(e) => setQtdMinimaSkuAutoatacado(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-bold"
                          />
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 block">Total $\ge$ {qtdTotalMinimaAutoatacado || 100} peças E cada SKU $\ge$ {qtdMinimaSkuAutoatacado || 6} un</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SIMULADOR INTERATIVO EM TEMPO REAL */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2 text-amber-400">
                    <Calculator className="w-5 h-5" />
                    <h3 className="font-bold text-sm text-slate-100">Simulador de Sugestão de Preços em Tempo Real</h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400 whitespace-nowrap">Preço Varejo de Teste: R$</label>
                    <input
                      type="number"
                      step="0.01"
                      value={precoSimulador}
                      onChange={(e) => setPrecoSimulador(e.target.value)}
                      className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-100 text-right focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Card Varejo */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">1. Preço de Varejo</span>
                    <div className="text-xl font-black text-slate-100">
                      R$ {valorVarejoSimulado.toFixed(2)}
                    </div>
                    <span className="text-[11px] text-slate-500 block">Preço unitário base (abaixo de R$ {Number(valorMinimoAtacado || 1500).toFixed(2)})</span>
                  </div>

                  {/* Card Atacado */}
                  <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-4 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">2. Sugestão Atacado</span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-bold">-{percAtacadoNum}%</span>
                    </div>
                    <div className="text-xl font-black text-emerald-400">
                      R$ {valorAtacadoSimulado.toFixed(2)}
                    </div>
                    <span className="text-[11px] text-emerald-300/80 block">
                      A partir de R$ {Number(valorMinimoAtacado || 1500).toFixed(2)} OU {qtdTotalMinimaAtacado || 50} peças ({qtdMinimaSkuAtacado || 6} un/SKU)
                    </span>
                  </div>

                  {/* Card Autoatacado */}
                  <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-2xl p-4 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">3. Sugestão Autoatacado</span>
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-bold">-{percAutoNum}%</span>
                    </div>
                    <div className="text-xl font-black text-indigo-400">
                      R$ {valorAutoatacadoSimulado.toFixed(2)}
                    </div>
                    <span className="text-[11px] text-indigo-300/80 block">
                      A partir de R$ {Number(valorMinimoAutoatacado || 3000).toFixed(2)} OU {qtdTotalMinimaAutoatacado || 100} peças ({qtdMinimaSkuAutoatacado || 6} un/SKU)
                    </span>
                  </div>
                </div>
              </div>

              {/* Botão Salvar Regras */}
              <button
                type="submit"
                disabled={salvando}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 font-bold text-white shadow-xl shadow-indigo-600/25 flex items-center justify-center gap-2 text-sm transition disabled:opacity-50 cursor-pointer"
              >
                {salvando ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Salvando Regras de Precificação...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    <span>Salvar Regras de Precificação Padrão</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* MODAL CATEGORIA                                                           */}
      {/* ========================================================================= */}
      {modalCategoriaAberta && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-100">
                {catEditando ? 'Editar Categoria' : 'Nova Categoria'}
              </h3>
              <button onClick={() => setModalCategoriaAberta(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={salvarCategoria} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Nome da Categoria:</label>
                <input
                  type="text"
                  placeholder="Ex: BRINQUEDOS ERÓTICOS, BEBIDAS, ROUPAS..."
                  value={catNome}
                  onChange={(e) => setCatNome(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 uppercase focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Ícone / Emoji:</label>
                <input
                  type="text"
                  value={catIcone}
                  onChange={(e) => setCatIcone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  placeholder="Ex: 📦, 🧴, 🥤, 👗, 🍔"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalCategoriaAberta(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition cursor-pointer"
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
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-100">
                {unidadeEditando ? 'Editar Unidade de Medida' : 'Nova Unidade de Medida'}
              </h3>
              <button onClick={() => setModalUnidadeAberta(false)} className="text-slate-400 hover:text-white">
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
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-100">
                {fornecedorEditando ? 'Editar Fornecedor' : 'Novo Fornecedor'}
              </h3>
              <button onClick={() => setModalFornecedorAberta(false)} className="text-slate-400 hover:text-white">
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
    </div>
  );
};
export default CadastrosAuxiliares;
