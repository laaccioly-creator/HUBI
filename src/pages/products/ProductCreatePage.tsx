import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  Upload,
  Plus,
  Trash2,
  CheckCircle2,
  Tag,
  Layers,
  Image as ImageIcon
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Categoria, Fornecedor } from '../../types/database';

export const ProductCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { loja } = useAuth();

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [gerandoComIA, setGerandoComIA] = useState<boolean>(false);

  // Form State
  const [nome, setNome] = useState<string>('');
  const [codigoInterno, setCodigoInterno] = useState<string>('');
  const [codigoBarras, setCodigoBarras] = useState<string>('');
  const [categoriaId, setCategoriaId] = useState<string>('');
  const [fornecedorId, setFornecedorId] = useState<string>('');
  const [descricao, setDescricao] = useState<string>('');
  const [tipoUnidade, setTipoUnidade] = useState<string>('un');
  const [fotosUrls, setFotosUrls] = useState<string[]>([]);
  const [novaFotoUrl, setNovaFotoUrl] = useState<string>('');

  // Preços
  const [precoCusto, setPrecoCusto] = useState<string>('0.00');
  const [precoVendaVarejo, setPrecoVendaVarejo] = useState<string>('');
  const [precoVendaAtacado, setPrecoVendaAtacado] = useState<string>('');
  const [qtdMinimaAtacado, setQtdMinimaAtacado] = useState<string>('6');
  const [precoVendaAutoatacado, setPrecoVendaAutoatacado] = useState<string>('');
  const [qtdMinimaAutoatacado, setQtdMinimaAutoatacado] = useState<string>('24');
  const [precoPromocional, setPrecoPromocional] = useState<string>('');
  const [promocaoAtiva, setPromocaoAtiva] = useState<boolean>(false);

  // Estoque & Validade
  const [quantidadeEstoque, setQuantidadeEstoque] = useState<string>('0');
  const [estoqueMinimoAlerta, setEstoqueMinimoAlerta] = useState<string>('5');
  const [dataValidade, setDataValidade] = useState<string>('');
  const [exibirCatalogo, setExibirCatalogo] = useState<boolean>(true);
  const [destaque, setDestaque] = useState<boolean>(false);

  // Variações (até 2 eixos)
  const [temVariacoes, setTemVariacoes] = useState<boolean>(false);
  const [rotuloVariacao1, setRotuloVariacao1] = useState<string>('Tamanho');
  const [rotuloVariacao2, setRotuloVariacao2] = useState<string>('Cor');
  const [gradeVariacoes, setGradeVariacoes] = useState<Array<{
    valor1: string;
    valor2: string;
    precoVarejo: string;
    precoAtacado: string;
    estoque: string;
    barcode: string;
  }>>([]);

  // Prompt IA
  const [promptIA, setPromptIA] = useState<string>('');

  useEffect(() => {
    if (!loja?.id) return;
    const carregarAux = async () => {
      const { data: c } = await supabase.from('categorias').select('*').eq('loja_id', loja.id);
      if (c) setCategorias(c);
      const { data: f } = await supabase.from('fornecedores').select('*').eq('loja_id', loja.id);
      if (f) setFornecedores(f);
    };
    carregarAux();
  }, [loja?.id]);

  // Cadastro Mágico por IA (Simulado com Processamento Inteligente)
  const handleCadastroMagicoIA = () => {
    if (!promptIA.trim()) return;
    setGerandoComIA(true);

    setTimeout(() => {
      const p = promptIA.toLowerCase();
      if (p.includes('camiseta') || p.includes('camisa') || p.includes('vestido')) {
        setNome('Camiseta Streetwear Oversized 100% Algodão');
        setDescricao('Camiseta modelagem streetwear confeccionada em malha nobre 100% algodão penteado com toque aveludado e costuras reforçadas.');
        setPrecoCusto('28.00');
        setPrecoVendaVarejo('69.90');
        setPrecoVendaAtacado('54.90');
        setQtdMinimaAtacado('6');
        setPrecoVendaAutoatacado('45.00');
        setQtdMinimaAutoatacado('24');
        setTemVariacoes(true);
        setRotuloVariacao1('Tamanho');
        setRotuloVariacao2('Cor');
        setGradeVariacoes([
          { valor1: 'P', valor2: 'Preto', precoVarejo: '69.90', precoAtacado: '54.90', estoque: '15', barcode: '' },
          { valor1: 'M', valor2: 'Preto', precoVarejo: '69.90', precoAtacado: '54.90', estoque: '20', barcode: '' },
          { valor1: 'G', valor2: 'Preto', precoVarejo: '69.90', precoAtacado: '54.90', estoque: '15', barcode: '' },
          { valor1: 'M', valor2: 'Branco', precoVarejo: '69.90', precoAtacado: '54.90', estoque: '10', barcode: '' }
        ]);
        setFotosUrls(['https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=60']);
      } else {
        setNome('Produto Especial - Linha Premium');
        setDescricao(`Produto de alta qualidade gerado a partir do pedido: "${promptIA}". Excelente acabamento e durabilidade.`);
        setPrecoCusto('20.00');
        setPrecoVendaVarejo('49.90');
        setPrecoVendaAtacado('39.90');
        setQtdMinimaAtacado('6');
        setQuantidadeEstoque('25');
      }
      setGerandoComIA(false);
    }, 900);
  };

  const adicionarLinhaVariacao = () => {
    setGradeVariacoes(prev => [
      ...prev,
      { valor1: '', valor2: '', precoVarejo: precoVendaVarejo || '0.00', precoAtacado: precoVendaAtacado || '0.00', estoque: '0', barcode: '' }
    ]);
  };

  const removerLinhaVariacao = (index: number) => {
    setGradeVariacoes(prev => prev.filter((_, i) => i !== index));
  };

  const salvarProduto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id || !nome.trim() || !precoVendaVarejo) {
      alert('Preencha o nome do produto e o preço de venda de varejo.');
      return;
    }

    try {
      setSalvando(true);

      // 1. Inserir Produto Principal
      const novoProduto = {
        loja_id: loja.id,
        nome,
        codigo_interno: codigoInterno || null,
        codigo_barras: codigoBarras || null,
        categoria_id: categoriaId || null,
        fornecedor_id: fornecedorId || null,
        descricao,
        tipo_unidade: tipoUnidade,
        fotos_urls: fotosUrls,
        preco_custo: Number(precoCusto) || 0,
        preco_venda_varejo: Number(precoVendaVarejo),
        preco_venda_atacado: precoVendaAtacado ? Number(precoVendaAtacado) : null,
        qtd_minima_atacado: Number(qtdMinimaAtacado) || 6,
        preco_venda_autoatacado: precoVendaAutoatacado ? Number(precoVendaAutoatacado) : null,
        qtd_minima_autoatacado: Number(qtdMinimaAutoatacado) || 24,
        preco_promocional: precoPromocional ? Number(precoPromocional) : null,
        promocao_ativa: promocaoAtiva,
        quantidade_estoque: temVariacoes
          ? gradeVariacoes.reduce((acc, v) => acc + (Number(v.estoque) || 0), 0)
          : Number(quantidadeEstoque) || 0,
        estoque_minimo_alerta: Number(estoqueMinimoAlerta) || 0,
        tem_variacoes: temVariacoes,
        rotulo_variacao_1: temVariacoes ? rotuloVariacao1 : null,
        rotulo_variacao_2: temVariacoes ? rotuloVariacao2 : null,
        data_validade: dataValidade || null,
        exibir_catalogo: exibirCatalogo,
        destaque: destaque,
        ativo: true
      };

      const { data: prodCriado, error: erroProd } = await supabase
        .from('produtos')
        .insert([novoProduto])
        .select()
        .single();

      if (erroProd || !prodCriado) throw erroProd;

      // 2. Inserir Variações se houver
      if (temVariacoes && gradeVariacoes.length > 0) {
        const variacoesFormatadas = gradeVariacoes.map(v => ({
          loja_id: loja.id,
          produto_id: prodCriado.id,
          valor_variacao_1: v.valor1 || 'Único',
          valor_variacao_2: v.valor2 || null,
          codigo_barras: v.barcode || null,
          preco_venda_varejo: Number(v.precoVarejo) || Number(precoVendaVarejo),
          preco_venda_atacado: v.precoAtacado ? Number(v.precoAtacado) : null,
          quantidade_estoque: Number(v.estoque) || 0,
          estoque_minimo_alerta: Number(estoqueMinimoAlerta) || 0,
          ativo: true
        }));

        await supabase.from('variacoes_produto').insert(variacoesFormatadas);
      }

      navigate('/products');
    } catch (err: any) {
      console.error('Erro ao salvar produto:', err);
      alert(`Erro ao salvar produto: ${err.message || 'Tente novamente.'}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-slate-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* Header com Voltar */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/products')}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Cadastrar Novo Produto</h1>
            <p className="text-xs text-slate-400">Preencha os dados manuais ou use a IA para preenchimento mágico.</p>
          </div>
        </div>

        {/* CADASTRO MÁGICO POR IA */}
        <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900/60 border border-indigo-500/30 rounded-3xl p-5 space-y-3 shadow-lg">
          <div className="flex items-center gap-2 text-indigo-400">
            <Sparkles className="w-5 h-5" />
            <span className="font-bold text-sm">Cadastro Mágico por IA (BETA)</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Digite o nome do produto ou descreva brevemente (ex: <i>"Camiseta preta de algodão nos tamanhos P, M e G a 69,90"</i>) e a IA preencherá automaticamente os campos e variações para você.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Digite o texto ou descrição do produto..."
              value={promptIA}
              onChange={(e) => setPromptIA(e.target.value)}
              className="flex-1 bg-slate-900/90 border border-indigo-500/40 rounded-xl px-4 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-400"
            />
            <button
              type="button"
              disabled={gerandoComIA}
              onClick={handleCadastroMagicoIA}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-500/20 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{gerandoComIA ? 'Preenchendo...' : 'Preencher com IA'}</span>
            </button>
          </div>
        </div>

        {/* FORMULÁRIO PRINCIPAL */}
        <form onSubmit={salvarProduto} className="space-y-6">
          {/* Card 1: Informações Básicas */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Tag className="w-4 h-4 text-emerald-400" />
              <span>Identificação do Produto</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-300">Nome do Produto *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Tênis Esportivo Ultra Leve"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Código Interno (SKU)</label>
                <input
                  type="text"
                  placeholder="Ex: #TEN-01"
                  value={codigoInterno}
                  onChange={(e) => setCodigoInterno(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Código de Barras (EAN / Leitor)</label>
                <input
                  type="text"
                  placeholder="Ex: 789123456789"
                  value={codigoBarras}
                  onChange={(e) => setCodigoBarras(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Categoria</label>
                <select
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none"
                >
                  <option value="">Sem Categoria</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Unidade de Medida</label>
                <select
                  value={tipoUnidade}
                  onChange={(e) => setTipoUnidade(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none"
                >
                  <option value="un">Unidade (un)</option>
                  <option value="kg">Quilo (kg - Balança)</option>
                  <option value="l">Litro (l)</option>
                  <option value="m">Metro (m)</option>
                </select>
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-300">Descrição Detalhada</label>
                <textarea
                  rows={3}
                  placeholder="Informações adicionais do produto, material, diferenciais..."
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none"
                ></textarea>
              </div>
            </div>
          </div>

          {/* Card 2: Múltiplas Faixas de Preço (Varejo, Atacado, Autoatacado e Promoção) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Tag className="w-4 h-4 text-indigo-400" />
              <span>Tabelas de Preço & Custos</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* Preço de Custo */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Preço de Custo (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={precoCusto}
                  onChange={(e) => setPrecoCusto(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                />
              </div>

              {/* Preço Varejo */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-emerald-400">Preço Varejo (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ex: 49.90"
                  value={precoVendaVarejo}
                  onChange={(e) => setPrecoVendaVarejo(e.target.value)}
                  className="w-full bg-slate-800 border border-emerald-500/50 rounded-xl px-3.5 py-2 text-xs font-bold text-emerald-400"
                />
              </div>

              {/* Preço Atacado */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Preço Atacado (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 39.90"
                  value={precoVendaAtacado}
                  onChange={(e) => setPrecoVendaAtacado(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                />
                <span className="text-[10px] text-slate-500">Mín: {qtdMinimaAtacado} un</span>
              </div>

              {/* Preço Autoatacado */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Preço Autoatacado (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 32.90"
                  value={precoVendaAutoatacado}
                  onChange={(e) => setPrecoVendaAutoatacado(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                />
                <span className="text-[10px] text-slate-500">Mín: {qtdMinimaAutoatacado} un</span>
              </div>
            </div>
          </div>

          {/* Card 3: Grade de Variações (Até 2 eixos) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span>Grade de Variações (Tamanho / Cor / Sabor)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Ative caso o produto tenha mais de um tamanho ou cor com estoque separado.</p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={temVariacoes}
                  onChange={(e) => setTemVariacoes(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            {temVariacoes && (
              <div className="space-y-4 pt-3 border-t border-slate-800">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Rótulo Eixo 1 (ex: Tamanho)</label>
                    <input
                      type="text"
                      value={rotuloVariacao1}
                      onChange={(e) => setRotuloVariacao1(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Rótulo Eixo 2 (ex: Cor)</label>
                    <input
                      type="text"
                      value={rotuloVariacao2}
                      onChange={(e) => setRotuloVariacao2(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100"
                    />
                  </div>
                </div>

                {/* Tabela de Variações */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">Linhas de Variação</span>
                    <button
                      type="button"
                      onClick={adicionarLinhaVariacao}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar Variação
                    </button>
                  </div>

                  {gradeVariacoes.map((gv, idx) => (
                    <div key={idx} className="grid grid-cols-6 gap-2 items-center bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      <input
                        type="text"
                        placeholder={rotuloVariacao1}
                        value={gv.valor1}
                        onChange={(e) => {
                          const cp = [...gradeVariacoes];
                          cp[idx].valor1 = e.target.value;
                          setGradeVariacoes(cp);
                        }}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                      />
                      <input
                        type="text"
                        placeholder={rotuloVariacao2}
                        value={gv.valor2}
                        onChange={(e) => {
                          const cp = [...gradeVariacoes];
                          cp[idx].valor2 = e.target.value;
                          setGradeVariacoes(cp);
                        }}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Varejo R$"
                        value={gv.precoVarejo}
                        onChange={(e) => {
                          const cp = [...gradeVariacoes];
                          cp[idx].precoVarejo = e.target.value;
                          setGradeVariacoes(cp);
                        }}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                      />
                      <input
                        type="number"
                        placeholder="Estoque"
                        value={gv.estoque}
                        onChange={(e) => {
                          const cp = [...gradeVariacoes];
                          cp[idx].estoque = e.target.value;
                          setGradeVariacoes(cp);
                        }}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-bold text-emerald-400"
                      />
                      <input
                        type="text"
                        placeholder="Cód. Barras"
                        value={gv.barcode}
                        onChange={(e) => {
                          const cp = [...gradeVariacoes];
                          cp[idx].barcode = e.target.value;
                          setGradeVariacoes(cp);
                        }}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => removerLinhaVariacao(idx)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 flex justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Fotos do Produto */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-3">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-emerald-400" />
              <span>Fotos do Produto (Galeria)</span>
            </h2>

            <div className="flex gap-2">
              <input
                type="url"
                placeholder="URL da imagem (ex: https://...)"
                value={novaFotoUrl}
                onChange={(e) => setNovaFotoUrl(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
              />
              <button
                type="button"
                onClick={() => {
                  if (novaFotoUrl.trim()) {
                    setFotosUrls(prev => [...prev, novaFotoUrl.trim()]);
                    setNovaFotoUrl('');
                  }
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
              >
                Adicionar Foto
              </button>
            </div>

            {fotosUrls.length > 0 && (
              <div className="flex gap-3 overflow-x-auto pt-2">
                {fotosUrls.map((url, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 group">
                    <img src={url} alt="Foto" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFotosUrls(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-rose-400 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Botão de Salvar */}
          <button
            type="submit"
            disabled={salvando}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 font-bold text-white shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 text-sm transition disabled:opacity-50"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>{salvando ? 'Cadastrando no Banco...' : 'Salvar Produto'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
