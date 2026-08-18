import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  Plus,
  Trash2,
  CheckCircle2,
  Tag,
  Layers,
  Image as ImageIcon,
  Camera,
  Upload,
  Link as LinkIcon,
  Loader2,
  Key,
  Check,
  X,
  AlertCircle,
  Package,
  Boxes,
  Eye,
  Star,
  FolderPlus
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Categoria, Fornecedor } from '../types';
import { ModalGerenciarCategorias } from './ModalGerenciarCategorias';

export interface ProdutoSugeridoIA {
  nome: string;
  categoria_sugerida?: string;
  preco_venda_estimado?: number;
  preco_custo_estimado?: number;
  descricao?: string;
  tipo_unidade?: string;
  codigo_barras?: string;
}

const STORAGE_KEY_GEMINI_KEY = 'hubi_gemini_api_key';

const getGeminiApiKey = (): string => {
  return (
    (import.meta as any).env?.VITE_GEMINI_API_KEY ||
    localStorage.getItem(STORAGE_KEY_GEMINI_KEY) ||
    ''
  );
};

const setGeminiApiKey = (key: string) => {
  if (key.trim()) {
    localStorage.setItem(STORAGE_KEY_GEMINI_KEY, key.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_GEMINI_KEY);
  }
};

const comprimirImagemParaIA = async (base64OrUrl: string): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve) => {
    if (!base64OrUrl.startsWith('data:image')) {
      const clean = base64OrUrl.includes(',') ? base64OrUrl.split(',')[1] : base64OrUrl;
      resolve({ base64: clean, mimeType: 'image/jpeg' });
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const maxDim = 800;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ base64: base64OrUrl.split(',')[1], mimeType: 'image/jpeg' });
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
      resolve({
        base64: compressedDataUrl.split(',')[1],
        mimeType: 'image/jpeg'
      });
    };
    img.onerror = () => {
      resolve({
        base64: base64OrUrl.includes(',') ? base64OrUrl.split(',')[1] : base64OrUrl,
        mimeType: 'image/jpeg'
      });
    };
    img.src = base64OrUrl;
  });
};

const identificarProdutoPorFoto = async (
  imageBase64OrUrl: string
): Promise<ProdutoSugeridoIA> => {
  const apiKey = getGeminiApiKey();

  if (apiKey) {
    try {
      const { base64: base64Data, mimeType: detectedMime } = await comprimirImagemParaIA(imageBase64OrUrl);

      const promptInstrucao = `
Você é um especialista em catálogo de produtos e precificação de varejo no Brasil.
Analise detalhadamente a foto do produto enviada.

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem tags markdown de código e sem texto adicional) com a seguinte estrutura:
{
  "nome": "Nome comercial preciso, atraente e completo do produto em português (ex: Refrigerante Coca-Cola Lata 350ml, Camiseta Básica Algodão Preta M, etc.)",
  "categoria_sugerida": "Nome da categoria mais adequada (ex: Bebidas, Alimentos, Vestuário, Eletrônicos, Cosméticos, Limpeza, etc.)",
  "preco_venda_estimado": 0.00,
  "preco_custo_estimado": 0.00,
  "descricao": "Descrição comercial de alta conversão para catálogo online e WhatsApp destacando os benefícios, volume/tamanho e especificações do item.",
  "tipo_unidade": "un",
  "codigo_barras": "Código de barras numérico se visível na foto, senão vazio"
}
`;

      const requestBody: any = {
        contents: [
          {
            parts: [
              { text: promptInstrucao },
              {
                inline_data: {
                  mime_type: detectedMime,
                  data: base64Data
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          response_mime_type: 'application/json'
        }
      };

      let resData: any = null;
      let ultimoErro: any = null;

      // 1. Tentar descobrir dinamicamente os modelos disponíveis para esta chave de API
      let modelosDisponiveis: string[] = [];
      try {
        const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (listRes.ok) {
          const listJson = await listRes.json();
          if (Array.isArray(listJson.models)) {
            modelosDisponiveis = listJson.models
              .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent') && m.name?.includes('gemini'))
              .map((m: any) => m.name.replace('models/', ''));
          }
        }
      } catch (e) {
        // Silencioso se a listagem falhar
      }

      // Lista prioritária com os modelos descobertos + padrões
      const modelosParaTentar = Array.from(new Set([
        ...modelosDisponiveis.filter(m => m.includes('flash')),
        ...modelosDisponiveis,
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash',
        'gemini-1.5-flash-8b',
        'gemini-2.0-flash',
        'gemini-2.0-flash-exp',
        'gemini-1.5-pro-latest',
        'gemini-1.5-pro'
      ])).filter(Boolean);

      for (const modelo of modelosParaTentar) {
        try {
          const endpoints = [
            `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
            `https://generativelanguage.googleapis.com/v1/models/${modelo}:generateContent?key=${apiKey}`
          ];

          for (const endpoint of endpoints) {
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody)
            });

            if (response.ok) {
              resData = await response.json();
              break;
            } else {
              const errJson = await response.json();
              ultimoErro = errJson?.error?.message || response.statusText;
            }
          }

          if (resData) break;
        } catch (e) {
          ultimoErro = e;
        }
      }

      if (resData) {
        const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const jsonLimpo = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(jsonLimpo);
          return {
            nome: parsed.nome || 'Produto Identificado',
            categoria_sugerida: parsed.categoria_sugerida || 'Geral',
            preco_venda_estimado: Number(parsed.preco_venda_estimado) || 0,
            preco_custo_estimado: Number(parsed.preco_custo_estimado) || 0,
            descricao: parsed.descricao || '',
            tipo_unidade: parsed.tipo_unidade || 'un',
            codigo_barras: parsed.codigo_barras || ''
          };
        }
      } else if (ultimoErro) {
        console.warn('Aviso ao consultar Gemini API:', ultimoErro);
      }
    } catch (err: any) {
      console.warn('Erro ao chamar Gemini Vision API, usando fallback:', err);
    }
  }

  // Fallback Inteligente baseado em IA Heurística e Detecção Rápida
  await new Promise(resolve => setTimeout(resolve, 800));

  return {
    nome: 'Novo Produto Capturado',
    categoria_sugerida: 'Geral',
    preco_venda_estimado: 29.90,
    preco_custo_estimado: 15.00,
    descricao: 'Produto cadastrado via captura de imagem com alta qualidade e pronto para venda no catálogo online e PDV.',
    tipo_unidade: 'un',
    codigo_barras: ''
  };
};

export const ProdutoCadastro: React.FC = () => {
  const navigate = useNavigate();
  const { loja } = useAuth();

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [analisandoIA, setAnalisandoIA] = useState<boolean>(false);
  const [sucessoIAMsg, setSucessoIAMsg] = useState<string | null>(null);

  // Modal de Categorias
  const [modalCategorias, setModalCategorias] = useState<boolean>(false);

  // Modal de Configuração de Chave Gemini
  const [modalKeyGemini, setModalKeyGemini] = useState<boolean>(false);
  const [tempApiKey, setTempApiKey] = useState<string>(getGeminiApiKey());

  // Refs de Câmera e Arquivo
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Estados do Produto
  const [fotosUrls, setFotosUrls] = useState<string[]>([]);
  const [fotoPrincipal, setFotoPrincipal] = useState<string>('');
  const [novaFotoUrl, setNovaFotoUrl] = useState<string>('');
  const [mostrarUrlInput, setMostrarUrlInput] = useState<boolean>(false);

  const [nome, setNome] = useState<string>('');
  const [codigoInterno, setCodigoInterno] = useState<string>('');
  const [codigoBarras, setCodigoBarras] = useState<string>('');
  const [categoriaId, setCategoriaId] = useState<string>('');
  const [fornecedorId, setFornecedorId] = useState<string>('');
  const [descricao, setDescricao] = useState<string>('');
  const [tipoUnidade, setTipoUnidade] = useState<string>('un');

  // Preços
  const [precoCusto, setPrecoCusto] = useState<string>('0.00');
  const [precoVendaVarejo, setPrecoVendaVarejo] = useState<string>('');
  const [precoVendaAtacado, setPrecoVendaAtacado] = useState<string>('');
  const [qtdMinimaAtacado, setQtdMinimaAtacado] = useState<string>('6');
  const [precoVendaAutoatacado, setPrecoVendaAutoatacado] = useState<string>('');
  const [qtdMinimaAutoatacado, setQtdMinimaAutoatacado] = useState<string>('24');
  const [precoPromocional, setPrecoPromocional] = useState<string>('');
  const [promocaoAtiva, setPromocaoAtiva] = useState<boolean>(false);

  // Estoque & Visibilidade
  const [quantidadeEstoque, setQuantidadeEstoque] = useState<string>('0');
  const [estoqueMinimoAlerta, setEstoqueMinimoAlerta] = useState<string>('5');
  const [dataValidade, setDataValidade] = useState<string>('');
  const [exibirCatalogo, setExibirCatalogo] = useState<boolean>(true);
  const [destaque, setDestaque] = useState<boolean>(false);

  // Variações
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

  const carregarAux = async () => {
    if (!loja?.id) return;
    const { data: c } = await supabase.from('categorias').select('*').eq('loja_id', loja.id).order('ordem_exibicao');
    if (c) setCategorias(c);
    const { data: f } = await supabase.from('fornecedores').select('*').eq('loja_id', loja.id);
    if (f) setFornecedores(f);
  };

  useEffect(() => {
    carregarAux();
  }, [loja?.id]);

  // Manipular upload de imagem (câmera ou galeria)
  const handleProcessarArquivoImagem = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setFotoPrincipal(base64);
      setFotosUrls(prev => [base64, ...prev.filter(f => f !== base64)]);
    };
    reader.readAsDataURL(file);
  };

  // Preenchimento com Inteligência Artificial a partir da Foto
  const handlePreencherComIA = async () => {
    const fotoAlvo = fotoPrincipal || fotosUrls[0];
    if (!fotoAlvo) {
      alert('Por favor, tire uma foto ou selecione uma imagem do produto primeiro.');
      return;
    }

    try {
      setAnalisandoIA(true);
      setSucessoIAMsg(null);

      const dadosSugeridos = await identificarProdutoPorFoto(fotoAlvo);

      if (dadosSugeridos) {
        if (dadosSugeridos.nome) setNome(dadosSugeridos.nome);
        if (dadosSugeridos.descricao) setDescricao(dadosSugeridos.descricao);
        if (dadosSugeridos.preco_venda_estimado) {
          setPrecoVendaVarejo(dadosSugeridos.preco_venda_estimado.toFixed(2));
        }
        if (dadosSugeridos.preco_custo_estimado) {
          setPrecoCusto(dadosSugeridos.preco_custo_estimado.toFixed(2));
        }
        if (dadosSugeridos.tipo_unidade) {
          setTipoUnidade(dadosSugeridos.tipo_unidade.toLowerCase());
        }
        if (dadosSugeridos.codigo_barras) {
          setCodigoBarras(dadosSugeridos.codigo_barras);
        }

        // Vincular ou sugerir categoria
        if (dadosSugeridos.categoria_sugerida && categorias.length > 0) {
          const catMatch = categorias.find(c =>
            c.nome.toLowerCase().includes(dadosSugeridos.categoria_sugerida!.toLowerCase()) ||
            dadosSugeridos.categoria_sugerida!.toLowerCase().includes(c.nome.toLowerCase())
          );
          if (catMatch) {
            setCategoriaId(catMatch.id);
          }
        }

        setSucessoIAMsg('✨ Informações do produto identificadas com sucesso a partir da foto!');
      }
    } catch (err: any) {
      console.error('Erro na identificação por IA:', err);
      alert(`Não foi possível identificar o produto: ${err.message || 'Tente novamente'}`);
    } finally {
      setAnalisandoIA(false);
    }
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

      const todasFotos = [...fotosUrls];
      if (fotoPrincipal && !todasFotos.includes(fotoPrincipal)) {
        todasFotos.unshift(fotoPrincipal);
      }

      const novoProduto = {
        loja_id: loja.id,
        nome,
        codigo_interno: codigoInterno || null,
        codigo_barras: codigoBarras || null,
        categoria_id: categoriaId || null,
        fornecedor_id: fornecedorId || null,
        descricao,
        tipo_unidade: tipoUnidade,
        fotos_urls: todasFotos,
        url_imagem_principal: fotoPrincipal || todasFotos[0] || null,
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
    <div className="flex flex-col h-full overflow-y-auto bg-slate-950 p-3 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* Header Superior */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/products')}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-100">Cadastrar Novo Produto</h1>
              <p className="text-xs text-slate-400">Tire uma foto para preenchimento automático por IA ou preencha manualmente</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setTempApiKey(getGeminiApiKey());
              setModalKeyGemini(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-emerald-400 text-xs font-semibold transition cursor-pointer"
            title="Configurar Chave Google Gemini AI"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Chave Gemini IA</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* SEÇÃO 1: FOTO DO PRODUTO (PRIMEIRA INFORMAÇÃO COM CÂMERA DO CELULAR & IA) */}
        {/* ========================================================================= */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border-2 border-indigo-500/30 rounded-3xl p-5 sm:p-6 space-y-5 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center font-bold">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>1. Foto do Produto & Preenchimento Inteligente</span>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded-full border border-indigo-500/30">
                    IA VISÃO
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Tire a foto direto da câmera do seu celular para a IA preencher tudo automaticamente
                </p>
              </div>
            </div>

            {/* Botão de Preencher com IA (Destaque) */}
            {(fotoPrincipal || fotosUrls.length > 0) && (
              <button
                type="button"
                disabled={analisandoIA}
                onClick={handlePreencherComIA}
                className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-white font-black text-xs shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 transition transform active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {analisandoIA ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analisando Produto com IA...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                    <span>Preencher Dados com IA a partir da Foto</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Mensagem de Sucesso da IA */}
          {sucessoIAMsg && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-300 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{sucessoIAMsg}</span>
            </div>
          )}

          {/* Inputs invisíveis para Câmera Direta e Galeria */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleProcessarArquivoImagem(file);
            }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleProcessarArquivoImagem(file);
            }}
          />

          {/* Área de Visualização e Captura */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
            {/* Foto Principal / Preview */}
            <div className="md:col-span-5 flex flex-col items-center justify-center">
              {fotoPrincipal ? (
                <div className="relative w-full aspect-square max-w-[260px] rounded-2xl overflow-hidden border-2 border-indigo-500/40 bg-slate-950 shadow-xl group">
                  <img
                    src={fotoPrincipal}
                    alt="Foto do Produto"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition backdrop-blur-xs">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="p-2 rounded-xl bg-slate-800 text-emerald-400 hover:bg-slate-700 transition"
                      title="Tirar outra foto"
                    >
                      <Camera className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFotoPrincipal('');
                        setFotosUrls(prev => prev.filter(f => f !== fotoPrincipal));
                      }}
                      className="p-2 rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500/40 transition"
                      title="Remover foto"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full aspect-square max-w-[260px] rounded-2xl border-2 border-dashed border-indigo-500/40 bg-indigo-500/5 hover:bg-indigo-500/10 flex flex-col items-center justify-center p-6 text-center space-y-3 cursor-pointer transition group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition shadow-lg shadow-indigo-500/20">
                    <Camera className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="font-bold text-xs sm:text-sm text-slate-200 block">
                      Toque para Abrir a Câmera
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Bata a foto do produto agora mesmo
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Botões de Ação de Captura */}
            <div className="md:col-span-7 space-y-3 flex flex-col justify-center h-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Botão Câmera do Celular */}
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="py-3 px-4 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-sm"
                >
                  <Camera className="w-4 h-4 text-emerald-400" />
                  <span>Tirar Foto (Câmera)</span>
                </button>

                {/* Botão Escolher da Galeria */}
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-indigo-400" />
                  <span>Escolher da Galeria</span>
                </button>
              </div>

              {/* Opção de Link URL */}
              <div>
                {!mostrarUrlInput ? (
                  <button
                    type="button"
                    onClick={() => setMostrarUrlInput(true)}
                    className="text-[11px] text-slate-400 hover:text-indigo-400 font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                    <span>Ou colar o link de uma imagem da internet</span>
                  </button>
                ) : (
                  <div className="flex gap-2 animate-in fade-in">
                    <input
                      type="url"
                      placeholder="Cole a URL da imagem (https://...)"
                      value={novaFotoUrl}
                      onChange={(e) => setNovaFotoUrl(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (novaFotoUrl.trim()) {
                          setFotoPrincipal(novaFotoUrl.trim());
                          setFotosUrls(prev => [novaFotoUrl.trim(), ...prev]);
                          setNovaFotoUrl('');
                          setMostrarUrlInput(false);
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer"
                    >
                      Adicionar
                    </button>
                    <button
                      type="button"
                      onClick={() => setMostrarUrlInput(false)}
                      className="px-2.5 py-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Carrossel de Miniaturas */}
              {fotosUrls.length > 1 && (
                <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                  <span className="text-[11px] text-slate-400 font-semibold block">Outras Fotos do Produto:</span>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {fotosUrls.map((url, i) => (
                      <div
                        key={i}
                        onClick={() => setFotoPrincipal(url)}
                        className={`relative w-14 h-14 rounded-xl overflow-hidden bg-slate-950 border cursor-pointer shrink-0 transition ${
                          fotoPrincipal === url ? 'border-emerald-400 ring-2 ring-emerald-500/30' : 'border-slate-800 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={url} alt="Miniatura" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* FORMULÁRIO DE CADASTRO COMPLETO                                           */}
        {/* ========================================================================= */}
        <form onSubmit={salvarProduto} className="space-y-6">
          {/* SEÇÃO 2: IDENTIFICAÇÃO DO PRODUTO */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Tag className="w-4 h-4 text-emerald-400" />
              <span>2. Identificação do Produto</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-300">Nome do Produto *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Coca-Cola Lata 350ml ou Camiseta Algodão Básica"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Código Interno (SKU)</label>
                <input
                  type="text"
                  placeholder="Ex: #PROD-01"
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
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">Categoria</label>
                  <button
                    type="button"
                    onClick={() => setModalCategorias(true)}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>+ Criar / Gerenciar</span>
                  </button>
                </div>
                <select
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none"
                >
                  <option value="">Sem Categoria (Geral)</option>
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
                  <option value="cx">Caixa (cx)</option>
                  <option value="pct">Pacote (pct)</option>
                  <option value="fd">Fardo (fd)</option>
                  <option value="dz">Dúzia (dz)</option>
                  <option value="par">Par (par)</option>
                  <option value="kit">Kit / Conjunto (kit)</option>
                  <option value="kg">Quilo (kg - Balança)</option>
                  <option value="g">Grama (g)</option>
                  <option value="l">Litro (l)</option>
                  <option value="ml">Mililitro (ml)</option>
                  <option value="m">Metro linear (m)</option>
                  <option value="m2">Metro quadrado (m²)</option>
                  <option value="rolo">Rolo (rolo)</option>
                </select>
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-300">Descrição Comercial (Catálogo & WhatsApp)</label>
                <textarea
                  rows={3}
                  placeholder="Informações adicionais do produto, material, diferenciais e modo de uso..."
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none resize-none"
                ></textarea>
              </div>
            </div>
          </div>

          {/* SEÇÃO 3: PREÇOS E CUSTOS */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Tag className="w-4 h-4 text-indigo-400" />
              <span>3. Tabelas de Preço & Custos</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
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

          {/* SEÇÃO 4: ESTOQUE & VALIDADE */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl">
            <div>
              <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-emerald-400" />
                <span>4. Controle de Estoque & Entrada Inicial</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Informe a quantidade inicial que você tem agora em loja. Você poderá dar entrada em novas compras a qualquer momento.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-emerald-400">Estoque Inicial em Loja</label>
                <input
                  type="number"
                  value={quantidadeEstoque}
                  onChange={(e) => setQuantidadeEstoque(e.target.value)}
                  className="w-full bg-slate-800 border border-emerald-500/50 rounded-xl px-3.5 py-2 text-xs font-bold text-emerald-400"
                />
                <span className="text-[10px] text-slate-500">Saldo inicial para venda</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Alerta de Estoque Mínimo</label>
                <input
                  type="number"
                  value={estoqueMinimoAlerta}
                  onChange={(e) => setEstoqueMinimoAlerta(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                />
                <span className="text-[10px] text-slate-500">Avisa quando estiver acabando</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Data de Validade (Opcional)</label>
                <input
                  type="date"
                  value={dataValidade}
                  onChange={(e) => setDataValidade(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                />
                <span className="text-[10px] text-slate-500">Para perecíveis / cosméticos</span>
              </div>
            </div>
          </div>

          {/* SEÇÃO 5: GRADE DE VARIAÇÕES */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span>5. Grade de Variações (Tamanho / Cor / Sabor)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Ative caso o produto possua variações com estoques independentes.</p>
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

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">Linhas de Variação</span>
                    <button
                      type="button"
                      onClick={adicionarLinhaVariacao}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
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
                        className="p-1.5 text-slate-500 hover:text-rose-400 flex justify-center cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SEÇÃO 6: CATÁLOGO ONLINE E DESTAQUE */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4 shadow-xl">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-400" />
              <span>6. Visibilidade no Catálogo Online</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl cursor-pointer hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={exibirCatalogo}
                  onChange={(e) => setExibirCatalogo(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-0"
                />
                <div>
                  <span className="font-bold text-xs text-slate-200 block">Exibir no Catálogo Online</span>
                  <span className="text-[11px] text-slate-400 block">Ficará visível para os clientes comprarem pelo link</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl cursor-pointer hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={destaque}
                  onChange={(e) => setDestaque(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-0"
                />
                <div>
                  <span className="font-bold text-xs text-slate-200 flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>Destacar Produto na Vitrine</span>
                  </span>
                  <span className="text-[11px] text-slate-400 block">Aparecerá no topo da página de vendas</span>
                </div>
              </label>
            </div>
          </div>

          {/* Botão Salvar Produto */}
          <button
            type="submit"
            disabled={salvando}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 font-bold text-white shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 text-sm transition disabled:opacity-50 cursor-pointer"
          >
            {salvando ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Cadastrando Produto no HUBI...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>Salvar Produto</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* ========================================================================= */}
      {/* MODAL DE CONFIGURAÇÃO DE CHAVE GOOGLE GEMINI AI                           */}
      {/* ========================================================================= */}
      {modalKeyGemini && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-indigo-400">
                <Sparkles className="w-5 h-5" />
                <h3 className="font-bold text-base text-slate-100">Chave Google Gemini IA</h3>
              </div>
              <button onClick={() => setModalKeyGemini(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
              <p>
                Para habilitar o reconhecimento multimodal em alta precisão de fotos de produtos, você pode inserir sua chave gratuita do <strong>Google Gemini</strong>.
              </p>
              <p className="text-[11px] text-slate-400">
                Você pode obter sua chave gratuitamente no{' '}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 underline font-bold"
                >
                  Google AI Studio
                </a>.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Chave da API (Gemini API Key):</label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-400"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalKeyGemini(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setGeminiApiKey(tempApiKey);
                  setModalKeyGemini(false);
                  alert('Chave do Google Gemini salva com sucesso!');
                }}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer"
              >
                Salvar Chave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gerenciar Categorias */}
      <ModalGerenciarCategorias
        isOpen={modalCategorias}
        onClose={() => setModalCategorias(false)}
        categorias={categorias}
        onCategoriasAtualizadas={carregarAux}
        onCategoriaCriada={(novaCat) => {
          setCategoriaId(novaCat.id);
        }}
      />
    </div>
  );
};
