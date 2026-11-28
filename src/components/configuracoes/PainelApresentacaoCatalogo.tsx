import React, { useEffect, useState } from 'react';
import {
  LayoutGrid,
  Sparkles,
  Image as ImageIcon,
  Upload,
  Trash2,
  Loader2,
  Check,
  Users,
  Store,
  Layers
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { gerarTextosApresentacaoCatalogoIA } from '../../services/geminiService';
import { uploadImagemComprimidaStorage } from '../../utils/storageUpload';
import type { Categoria, Loja, ModoPaginaInicialCatalogo } from '../../types';

export interface PainelApresentacaoCatalogoProps {
  loja: Loja;
  modoPaginaInicial: ModoPaginaInicialCatalogo;
  onChangeModoPaginaInicial: (modo: ModoPaginaInicialCatalogo) => void;
  lpTituloHero: string;
  onChangeLpTituloHero: (valor: string) => void;
  lpSubtituloHero: string;
  onChangeLpSubtituloHero: (valor: string) => void;
  lpSobreTitulo: string;
  onChangeLpSobreTitulo: (valor: string) => void;
  lpSobreTexto: string;
  onChangeLpSobreTexto: (valor: string) => void;
  lpMostrarEquipe: boolean;
  onChangeLpMostrarEquipe: (valor: boolean) => void;
  lpGaleriaUrls: string[];
  onChangeLpGaleriaUrls: (urls: string[]) => void;
  isDark: boolean;
  mostrarFeedback?: (msg: string, tipo?: 'sucesso' | 'erro') => void;
}

export const PainelApresentacaoCatalogo: React.FC<PainelApresentacaoCatalogoProps> = ({
  loja,
  modoPaginaInicial,
  onChangeModoPaginaInicial,
  lpTituloHero,
  onChangeLpTituloHero,
  lpSubtituloHero,
  onChangeLpSubtituloHero,
  lpSobreTitulo,
  onChangeLpSobreTitulo,
  lpSobreTexto,
  onChangeLpSobreTexto,
  lpMostrarEquipe,
  onChangeLpMostrarEquipe,
  lpGaleriaUrls,
  onChangeLpGaleriaUrls,
  isDark,
  mostrarFeedback
}) => {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregandoCats, setCarregandoCats] = useState<boolean>(false);
  const [gerandoIA, setGerandoIA] = useState<boolean>(false);
  const [uploadingGaleria, setUploadingGaleria] = useState<boolean>(false);
  const [uploadingCatId, setUploadingCatId] = useState<string | null>(null);
  const [salvandoCatId, setSalvandoCatId] = useState<string | null>(null);
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  useEffect(() => {
    if (!loja?.id || modoPaginaInicial !== 'apresentacao') return;
    let ativo = true;
    setCarregandoCats(true);

    void (async () => {
      try {
        const { data, error } = await supabase
          .from('categorias')
          .select('id, loja_id, nome, descricao, imagem_url, ordem_exibicao, ativo, categoria_pai_id')
          .eq('loja_id', loja.id)
          .eq('ativo', true)
          .is('categoria_pai_id', null)
          .order('ordem_exibicao', { ascending: true });

        if (!ativo) return;
        if (!error && data) {
          setCategorias(data as Categoria[]);
        }
      } finally {
        if (ativo) setCarregandoCats(false);
      }
    })();

    return () => {
      ativo = false;
    };
  }, [loja?.id, modoPaginaInicial]);

  const handleGerarComIA = async () => {
    if (!loja?.id) return;
    try {
      setErroLocal(null);
      setGerandoIA(true);

      const textos = await gerarTextosApresentacaoCatalogoIA({
        lojaId: loja.id,
        nomeLoja: loja.nome_fantasia || 'Nossa Empresa',
        cidade: loja.endereco_cidade || null,
        categorias: categorias.map((c) => ({ id: c.id, nome: c.nome })),
        sobreAtual: lpSobreTexto || loja.sobre_loja || null
      });

      onChangeLpTituloHero(textos.lp_titulo_hero);
      onChangeLpSubtituloHero(textos.lp_subtitulo_hero);
      onChangeLpSobreTitulo(textos.lp_sobre_titulo);
      onChangeLpSobreTexto(textos.lp_sobre_texto);

      if (Object.keys(textos.categorias_descricoes).length > 0) {
        const atualizadas = categorias.map((c) => ({
          ...c,
          descricao: textos.categorias_descricoes[c.id] || c.descricao || ''
        }));
        setCategorias(atualizadas);

        // Persiste imediatamente as descrições geradas nas categorias da loja
        await Promise.all(
          atualizadas.map((c) => {
            const novaDesc = textos.categorias_descricoes[c.id];
            if (!novaDesc) return Promise.resolve();
            return supabase
              .from('categorias')
              .update({ descricao: novaDesc })
              .eq('id', c.id)
              .eq('loja_id', loja.id);
          })
        );
      }

      mostrarFeedback?.('Textos preenchidos com sucesso pela Rubi IA! Revise e salve suas alterações.', 'sucesso');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Não foi possível gerar os textos via Rubi IA.';
      setErroLocal(msg);
      mostrarFeedback?.(msg, 'erro');
    } finally {
      setGerandoIA(false);
    }
  };

  const handleUploadGaleria = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !loja?.id) return;

    try {
      setErroLocal(null);
      setUploadingGaleria(true);
      const novasUrls: string[] = [];

      for (const file of Array.from(files)) {
        const url = await uploadImagemComprimidaStorage(loja.id, 'galeria-lp', file, {
          maxDimension: 1200,
          quality: 0.8
        });
        novasUrls.push(url);
      }

      onChangeLpGaleriaUrls([...lpGaleriaUrls, ...novasUrls]);
    } catch (err) {
      console.error('Erro ao subir fotos da galeria:', err);
      setErroLocal('Falha ao enviar uma ou mais fotos da galeria.');
    } finally {
      setUploadingGaleria(false);
      e.target.value = '';
    }
  };

  const handleUploadCapaCategoria = async (cat: Categoria, file: File) => {
    if (!loja?.id) return;
    try {
      setErroLocal(null);
      setUploadingCatId(cat.id);
      const url = await uploadImagemComprimidaStorage(loja.id, 'categorias', file, {
        maxDimension: 900,
        quality: 0.8
      });

      const { error } = await supabase
        .from('categorias')
        .update({ imagem_url: url })
        .eq('id', cat.id)
        .eq('loja_id', loja.id);

      if (error) throw error;

      setCategorias((prev) => prev.map((item) => (item.id === cat.id ? { ...item, imagem_url: url } : item)));
      mostrarFeedback?.(`Capa de "${cat.nome}" atualizada!`, 'sucesso');
    } catch (err) {
      console.error('Erro ao enviar capa da categoria:', err);
      setErroLocal(`Não foi possível enviar a foto de capa para "${cat.nome}".`);
    } finally {
      setUploadingCatId(null);
    }
  };

  const handleSalvarCategoria = async (cat: Categoria) => {
    if (!loja?.id) return;
    try {
      setErroLocal(null);
      setSalvandoCatId(cat.id);
      const { error } = await supabase
        .from('categorias')
        .update({
          descricao: cat.descricao?.trim() || null,
          imagem_url: cat.imagem_url?.trim() || null
        })
        .eq('id', cat.id)
        .eq('loja_id', loja.id);

      if (error) throw error;
      mostrarFeedback?.(`Especialidade "${cat.nome}" salva!`, 'sucesso');
    } catch (err) {
      console.error('Erro ao salvar categoria:', err);
      setErroLocal(`Erro ao salvar especialidade "${cat.nome}".`);
    } finally {
      setSalvandoCatId(null);
    }
  };

  return (
    <div
      className={`rounded-3xl p-5 sm:p-6 shadow-xs space-y-5 border ${
        isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
      }`}
    >
      <div>
        <h3 className={`font-black text-base flex items-center gap-2 ${isDark ? 'text-white' : 'text-black'}`}>
          <Layers className="w-4 h-4 text-emerald-500" />
          <span>Estilo da Página Inicial do Catálogo</span>
        </h3>
        <p className={`text-sm leading-relaxed font-medium mt-0.5 ${isDark ? 'text-slate-300' : 'text-black'}`}>
          Escolha se o cliente entra diretamente na vitrine ou visualiza primeiro uma página institucional com especialidades, equipe e galeria.
        </p>
      </div>

      {/* SELETOR DE ESTILO: VITRINE DIRETA vs PÁGINA DE APRESENTAÇÃO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChangeModoPaginaInicial('vitrine')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer space-y-2 ${
            modoPaginaInicial === 'vitrine'
              ? isDark
                ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/20 text-white'
                : 'bg-emerald-50 border-2 border-emerald-500 ring-2 ring-emerald-500/20 text-black'
              : isDark
              ? 'bg-[#08131A] border-slate-700 hover:border-slate-600 text-slate-300'
              : 'bg-white border-2 border-slate-300 hover:border-slate-400 text-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <Store className={`w-5 h-5 ${modoPaginaInicial === 'vitrine' ? 'text-emerald-500' : 'text-slate-400'}`} />
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                modoPaginaInicial === 'vitrine' ? 'border-emerald-500 bg-emerald-500' : isDark ? 'border-slate-600' : 'border-slate-400'
              }`}
            >
              {modoPaginaInicial === 'vitrine' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </div>
          <div>
            <h4 className={`font-black text-sm ${modoPaginaInicial === 'vitrine' ? (isDark ? 'text-emerald-400' : 'text-emerald-700') : (isDark ? 'text-white' : 'text-black')}`}>
              Vitrine Direta (Padrão)
            </h4>
            <p className={`text-xs leading-relaxed font-medium mt-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Abre diretamente na grade/lista de produtos e serviços com filtros e carrinho.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChangeModoPaginaInicial('apresentacao')}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer space-y-2 ${
            modoPaginaInicial === 'apresentacao'
              ? isDark
                ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/20 text-white'
                : 'bg-emerald-50 border-2 border-emerald-500 ring-2 ring-emerald-500/20 text-black'
              : isDark
              ? 'bg-[#08131A] border-slate-700 hover:border-slate-600 text-slate-300'
              : 'bg-white border-2 border-slate-300 hover:border-slate-400 text-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <LayoutGrid className={`w-5 h-5 ${modoPaginaInicial === 'apresentacao' ? 'text-emerald-500' : 'text-slate-400'}`} />
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                modoPaginaInicial === 'apresentacao' ? 'border-emerald-500 bg-emerald-500' : isDark ? 'border-slate-600' : 'border-slate-400'
              }`}
            >
              {modoPaginaInicial === 'apresentacao' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </div>
          <div>
            <h4 className={`font-black text-sm ${modoPaginaInicial === 'apresentacao' ? (isDark ? 'text-emerald-400' : 'text-emerald-700') : (isDark ? 'text-white' : 'text-black')}`}>
              Página de Apresentação + Vitrine
            </h4>
            <p className={`text-xs leading-relaxed font-medium mt-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Opcional — Ideal para Salões, Barbearias, Clínicas e Serviços. Mostra metodologia, especialidades, equipe e galeria.
            </p>
          </div>
        </button>
      </div>

      {/* PAINEL DETALHADO (EXIBIDO SOMENTE QUANDO 'apresentacao' ESTIVER SELECIONADO) */}
      {modoPaginaInicial === 'apresentacao' && (
        <div className={`space-y-5 pt-4 border-t animate-in fade-in duration-200 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          {erroLocal && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-bold text-rose-500">
              {erroLocal}
            </div>
          )}

          {/* BOTÃO RUBI IA */}
          <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isDark ? 'bg-emerald-950/15 border-emerald-500/30' : 'bg-emerald-50/70 border-2 border-emerald-300'
          }`}>
            <div className="space-y-0.5">
              <span className={`text-sm font-black flex items-center gap-1.5 ${isDark ? 'text-emerald-300' : 'text-black'}`}>
                <Sparkles className="w-4 h-4 text-emerald-500" />
                <span>Preenchimento Inteligente da Apresentação</span>
              </span>
              <p className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Gera título, subtítulo, texto de metodologia e descrições das especialidades com base no nome, cidade e categorias da loja.
              </p>
            </div>
            <button
              type="button"
              disabled={gerandoIA}
              onClick={handleGerarComIA}
              className="px-4 py-2.5 rounded-xl bg-emerald-300 hover:bg-emerald-400 text-black text-xs font-black border border-emerald-400 transition cursor-pointer inline-flex items-center justify-center gap-2 shrink-0 disabled:opacity-60 active:scale-95"
            >
              {gerandoIA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{gerandoIA ? 'Gerando textos...' : 'Gerar textos profissionais com Rubi IA'}</span>
            </button>
          </div>

          {/* TEXTOS DA HERO E SOBRE */}
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Título Principal (Hero)
              </label>
              <input
                type="text"
                maxLength={200}
                placeholder={`Ex: ${loja.nome_fantasia} — Beleza e Cuidado Especializado`}
                value={lpTituloHero}
                onChange={(e) => onChangeLpTituloHero(e.target.value)}
                className={`w-full rounded-xl px-3.5 py-2.5 text-sm font-bold focus:outline-none border ${
                  isDark ? 'bg-[#08131A] border-slate-700 text-white focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-500'
                }`}
              />
            </div>

            <div className="space-y-1.5">
              <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Subtítulo de Boas-Vindas
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Protocolos personalizados, equipe especializada e agendamento online rápido."
                value={lpSubtituloHero}
                onChange={(e) => onChangeLpSubtituloHero(e.target.value)}
                className={`w-full rounded-xl px-3.5 py-2.5 text-sm font-medium focus:outline-none border resize-y ${
                  isDark ? 'bg-[#08131A] border-slate-700 text-white focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-500'
                }`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Título da Seção Sobre / Metodologia
                </label>
                <input
                  type="text"
                  maxLength={150}
                  placeholder="Ex: Nossa Metodologia de Atendimento"
                  value={lpSobreTitulo}
                  onChange={(e) => onChangeLpSobreTitulo(e.target.value)}
                  className={`w-full rounded-xl px-3.5 py-2.5 text-sm font-bold focus:outline-none border ${
                    isDark ? 'bg-[#08131A] border-slate-700 text-white focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-500'
                  }`}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className={`text-xs font-black uppercase tracking-wider block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Texto da Seção Sobre / Metodologia
                </label>
                <textarea
                  rows={3}
                  placeholder="Conte brevemente sobre sua metodologia, diagnóstico individualizado e resultados entregues aos clientes..."
                  value={lpSobreTexto}
                  onChange={(e) => onChangeLpSobreTexto(e.target.value)}
                  className={`w-full rounded-xl px-3.5 py-2.5 text-sm font-medium focus:outline-none border resize-y ${
                    isDark ? 'bg-[#08131A] border-slate-700 text-white focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black focus:border-emerald-500'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* SWITCH MOSTRAR EQUIPE */}
          <div className={`flex items-center justify-between gap-3 p-3.5 rounded-2xl border ${
            isDark ? 'bg-[#08131A] border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-start gap-2.5">
              <Users className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <span className={`text-sm font-black block ${isDark ? 'text-white' : 'text-black'}`}>
                  Exibir seção "Nossos Profissionais"
                </span>
                <span className={`text-xs font-medium block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Mostra os colaboradores ativos que prestam serviços com foto, especialidade e mini currículo aprovado.
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={lpMostrarEquipe}
                onChange={(e) => onChangeLpMostrarEquipe(e.target.checked)}
                className="sr-only peer"
              />
              <div className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 ${
                isDark ? 'bg-slate-800' : 'bg-slate-300'
              }`}></div>
            </label>
          </div>

          {/* GALERIA DE TRABALHOS */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className={`text-sm font-black ${isDark ? 'text-white' : 'text-black'}`}>
                  Galeria de Trabalhos & Espaço ({lpGaleriaUrls.length})
                </h4>
                <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Fotos reais do ambiente, antes/depois e procedimentos realizados.
                </p>
              </div>
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-slate-200 hover:bg-slate-300 text-black border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white dark:border-slate-700 transition cursor-pointer">
                {uploadingGaleria ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{uploadingGaleria ? 'Enviando...' : 'Adicionar Fotos'}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploadingGaleria}
                  onChange={handleUploadGaleria}
                  className="hidden"
                />
              </label>
            </div>

            {lpGaleriaUrls.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                {lpGaleriaUrls.map((url, idx) => (
                  <div key={`${url.slice(0, 32)}-${idx}`} className="relative group aspect-square rounded-2xl overflow-hidden border border-slate-700/40 bg-slate-900">
                    <img src={url} alt={`Trabalho ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => onChangeLpGaleriaUrls(lpGaleriaUrls.filter((_, i) => i !== idx))}
                      className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/75 text-white hover:bg-rose-600 transition cursor-pointer"
                      title="Remover foto da galeria"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CAPA E DESCRIÇÃO DAS ESPECIALIDADES / CATEGORIAS ATIVAS */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div>
              <h4 className={`text-sm font-black ${isDark ? 'text-white' : 'text-black'}`}>
                Especialidades (Categorias Ativas da Loja)
              </h4>
              <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Personalize a foto de capa e a descrição curta exibidas nos cards da Página de Apresentação.
              </p>
            </div>

            {carregandoCats ? (
              <div className="py-4 text-xs text-slate-400 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                <span>Carregando categorias da loja...</span>
              </div>
            ) : categorias.length === 0 ? (
              <div className={`p-3.5 rounded-2xl border text-xs font-medium ${isDark ? 'bg-[#08131A] border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                Nenhuma categoria raiz ativa encontrada. Cadastre categorias de serviço no menu Produtos / Categorias para exibi-las aqui.
              </div>
            ) : (
              <div className="space-y-3">
                {categorias.map((cat) => (
                  <div
                    key={cat.id}
                    className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row gap-3 items-start ${
                      isDark ? 'bg-[#08131A] border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="w-full sm:w-24 shrink-0 space-y-1.5">
                      <div className={`w-full h-20 rounded-xl overflow-hidden border flex items-center justify-center ${
                        isDark ? 'bg-slate-900 border-slate-700 text-slate-500' : 'bg-white border-slate-300 text-slate-400'
                      }`}>
                        {uploadingCatId === cat.id ? (
                          <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                        ) : cat.imagem_url ? (
                          <img src={cat.imagem_url} alt={cat.nome} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-5 h-5" />
                        )}
                      </div>
                      <label className="w-full py-1 px-2 rounded-lg text-[10px] font-bold bg-slate-200 hover:bg-slate-300 text-black border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white dark:border-slate-700 flex items-center justify-center gap-1 cursor-pointer">
                        <Upload className="w-3 h-3" />
                        <span>{cat.imagem_url ? 'Trocar Capa' : 'Foto Capa'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploadingCatId === cat.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleUploadCapaCategoria(cat, file);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="flex-1 w-full space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-black ${isDark ? 'text-white' : 'text-black'}`}>
                          {cat.nome}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {cat.imagem_url && (
                            <button
                              type="button"
                              onClick={() => {
                                const atualizada = { ...cat, imagem_url: null };
                                setCategorias((prev) => prev.map((i) => (i.id === cat.id ? atualizada : i)));
                                void handleSalvarCategoria(atualizada);
                              }}
                              className="px-2 py-1 rounded-lg text-[10px] font-bold text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                            >
                              Remover capa
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={salvandoCatId === cat.id}
                            onClick={() => handleSalvarCategoria(cat)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-emerald-300 hover:bg-emerald-400 text-black border border-emerald-400 inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                          >
                            {salvandoCatId === cat.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            <span>Salvar</span>
                          </button>
                        </div>
                      </div>

                      <input
                        type="text"
                        placeholder={`Descrição curta de ${cat.nome} (ex: Cortes modernos, hidratação e escova modelada)`}
                        value={cat.descricao || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCategorias((prev) => prev.map((item) => (item.id === cat.id ? { ...item, descricao: val } : item)));
                        }}
                        className={`w-full rounded-xl px-3 py-2 text-xs font-medium focus:outline-none border ${
                          isDark ? 'bg-[#000000] border-slate-700 text-white focus:border-emerald-500' : 'bg-white border-slate-300 text-black focus:border-emerald-500'
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
