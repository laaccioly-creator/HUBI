import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Sparkles,
  HeartHandshake,
  Award,
  ArrowRight,
  MapPin,
  Phone,
  MessageCircle,
  Instagram,
  Info,
  X,
  Image as ImageIcon,
  Scissors,
  Store
} from 'lucide-react';
import type { Categoria, Loja, Produto, UsuarioLoja } from '../../types';
import { ModalMiniCurriculoProfissional } from '../agendamento/ModalMiniCurriculoProfissional';

export interface PaginaApresentacaoCatalogoProps {
  loja: Loja;
  categorias: Categoria[];
  produtos: Produto[];
  profissionais: UsuarioLoja[];
  isDark: boolean;
  onSelecionarEspecialidade: (categoriaId: string) => void;
  onAbrirVitrineCompleta: () => void;
  onAgendarComProfissional: (profissional: UsuarioLoja) => void;
}

export const PaginaApresentacaoCatalogo: React.FC<PaginaApresentacaoCatalogoProps> = ({
  loja,
  categorias,
  produtos,
  profissionais,
  isDark,
  onSelecionarEspecialidade,
  onAbrirVitrineCompleta,
  onAgendarComProfissional
}) => {
  const [profissionalCurriculo, setProfissionalCurriculo] = useState<UsuarioLoja | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  const categoriasPrincipais = useMemo(() => {
    return categorias.filter((c) => c.ativo !== false && !c.categoria_pai_id);
  }, [categorias]);

  const contagemPorCategoria = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const prod of produtos) {
      if (prod.categoria_id) {
        mapa[prod.categoria_id] = (mapa[prod.categoria_id] || 0) + 1;
      }
      if (prod.subcategoria_id) {
        const sub = categorias.find((c) => c.id === prod.subcategoria_id);
        if (sub?.categoria_pai_id) {
          mapa[sub.categoria_pai_id] = (mapa[sub.categoria_pai_id] || 0) + 1;
        }
      }
    }
    return mapa;
  }, [produtos, categorias]);

  const galeriaUrls = useMemo(() => {
    return Array.isArray(loja.lp_galeria_urls)
      ? loja.lp_galeria_urls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      : [];
  }, [loja.lp_galeria_urls]);

  const mostrarEquipe = loja.lp_mostrar_equipe !== false && profissionais.length > 0;
  const tituloHero = loja.lp_titulo_hero?.trim() || loja.nome_fantasia;
  const subtituloHero =
    loja.lp_subtitulo_hero?.trim() ||
    loja.sobre_loja?.trim() ||
    'Conheça nossas especialidades, escolha seu profissional e agende seu atendimento online com praticidade.';
  const sobreTitulo = loja.lp_sobre_titulo?.trim() || 'Nossa Metodologia de Atendimento';
  const sobreTexto =
    loja.lp_sobre_texto?.trim() ||
    loja.sobre_loja?.trim() ||
    `Na ${loja.nome_fantasia}, unimos atendimento personalizado, avaliação técnica cuidadosa e profissionais dedicados para entregar a melhor experiência em cada detalhe.`;

  const enderecoCompleto = [
    [loja.endereco_logradouro, loja.endereco_numero].filter(Boolean).join(', '),
    loja.endereco_complemento,
    loja.endereco_bairro,
    [loja.endereco_cidade, loja.endereco_estado].filter(Boolean).join(' - '),
    loja.endereco_cep ? `CEP ${loja.endereco_cep}` : ''
  ]
    .filter(Boolean)
    .join(' • ');

  const whatsappLimpo = (loja.whatsapp || loja.telefone || '').replace(/\D/g, '');
  const whatsappHref = whatsappLimpo
    ? `https://wa.me/${whatsappLimpo.startsWith('55') ? whatsappLimpo : `55${whatsappLimpo}`}?text=${encodeURIComponent(
        `Olá! Visitei o espaço online da ${loja.nome_fantasia} e gostaria de mais informações.`
      )}`
    : null;

  const rolarParaSecao = (idSecao: string) => {
    const el = document.getElementById(idSecao);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className={`w-full flex-1 flex flex-col ${isDark ? 'bg-[#08131A] text-white' : 'bg-slate-50 text-slate-900'}`}>
      {/* 1. MENU ÂNCORA INSTITUCIONAL LIMPO */}
      <nav
        className={`border-b py-3 px-4 ${
          isDark ? 'bg-[#0F172A]/90 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {loja.url_logo && (
              <img
                src={loja.url_logo}
                alt={loja.nome_fantasia}
                className="w-8 h-8 rounded-lg object-cover border border-slate-300 dark:border-slate-700 shrink-0"
              />
            )}
            <span className="font-black text-sm truncate">{loja.nome_fantasia}</span>
          </div>

          <div className="hidden md:flex items-center gap-5 text-xs font-bold">
            <button
              type="button"
              onClick={() => rolarParaSecao('lp-sobre')}
              className="hover:text-emerald-500 transition cursor-pointer"
            >
              Sobre / Metodologia
            </button>
            <button
              type="button"
              onClick={() => rolarParaSecao('lp-especialidades')}
              className="hover:text-emerald-500 transition cursor-pointer"
            >
              Especialidades
            </button>
            {mostrarEquipe && (
              <button
                type="button"
                onClick={() => rolarParaSecao('lp-profissionais')}
                className="hover:text-emerald-500 transition cursor-pointer"
              >
                Nossos Profissionais
              </button>
            )}
            {galeriaUrls.length > 0 && (
              <button
                type="button"
                onClick={() => rolarParaSecao('lp-galeria')}
                className="hover:text-emerald-500 transition cursor-pointer"
              >
                Galeria
              </button>
            )}
            <button
              type="button"
              onClick={() => rolarParaSecao('lp-contato')}
              className="hover:text-emerald-500 transition cursor-pointer"
            >
              Contato
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onAbrirVitrineCompleta}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 text-black border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white dark:border-slate-700 transition cursor-pointer"
            >
              Ver Vitrine
            </button>
            <button
              type="button"
              onClick={() => rolarParaSecao('lp-especialidades')}
              className="px-3.5 py-2 rounded-xl text-xs font-black bg-emerald-300 hover:bg-emerald-400 text-black border border-emerald-400 transition cursor-pointer inline-flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Agendar Horário</span>
            </button>
          </div>
        </div>
      </nav>

      {/* 2. HERO SECTION */}
      <section className="relative overflow-hidden border-b border-slate-200 dark:border-slate-800">
        {loja.url_banner ? (
          <>
            <img
              src={loja.url_banner}
              alt={loja.nome_fantasia}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/75 to-slate-950/55" />
          </>
        ) : (
          <div
            className={`absolute inset-0 ${
              isDark
                ? 'bg-gradient-to-br from-[#0B1120] via-[#0F172A] to-emerald-950/40'
                : 'bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950'
            }`}
          />
        )}

        <div className="relative max-w-6xl mx-auto px-4 py-14 sm:py-20 flex flex-col items-center text-center space-y-5 text-white">
          {loja.url_logo && (
            <img
              src={loja.url_logo}
              alt={loja.nome_fantasia}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border-2 border-white/25 shadow-xl bg-white/10"
            />
          )}

          <div className="space-y-3 max-w-3xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-400/15 text-emerald-300 border border-emerald-400/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Atendimento Especializado</span>
            </span>

            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight text-white">
              {tituloHero}
            </h1>

            <p className="text-sm sm:text-base text-slate-200 max-w-2xl mx-auto leading-relaxed font-medium">
              {subtituloHero}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => rolarParaSecao('lp-especialidades')}
              className="px-6 py-3 rounded-2xl text-sm font-black bg-emerald-300 hover:bg-emerald-400 text-black border border-emerald-400 shadow-lg transition cursor-pointer inline-flex items-center gap-2 active:scale-95"
            >
              <Calendar className="w-4 h-4" />
              <span>Agendar Horário</span>
            </button>

            <button
              type="button"
              onClick={onAbrirVitrineCompleta}
              className="px-6 py-3 rounded-2xl text-sm font-bold bg-slate-200 hover:bg-slate-300 text-black border border-slate-300 shadow-sm transition cursor-pointer inline-flex items-center gap-2"
            >
              <Store className="w-4 h-4" />
              <span>Ver Vitrine Completa</span>
            </button>
          </div>
        </div>
      </section>

      {/* 3. SEÇÃO SOBRE / METODOLOGIA EM PILARES */}
      <section
        id="lp-sobre"
        className={`py-12 sm:py-16 px-4 border-b ${
          isDark ? 'bg-[#0B1120] border-slate-800/80' : 'bg-white border-slate-200'
        }`}
      >
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="max-w-3xl mx-auto text-center space-y-3">
            <span className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              Sobre & Metodologia
            </span>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">{sobreTitulo}</h2>
            <p className={`text-sm sm:text-base leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {sobreTexto}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: HeartHandshake,
                titulo: 'Atendimento Personalizado',
                desc: 'Escuta atenta e respeito às necessidades individuais de cada cliente em um ambiente acolhedor.'
              },
              {
                icon: Sparkles,
                titulo: 'Diagnóstico Preciso',
                desc: 'Avaliação cuidadosa antes de cada procedimento para indicar as técnicas e produtos ideais.'
              },
              {
                icon: Award,
                titulo: 'Resultado & Excelência',
                desc: 'Equipe qualificada e padrão rigoroso de execução para resultados naturais e duradouros.'
              }
            ].map((pilar) => {
              const Icone = pilar.icon;
              return (
                <div
                  key={pilar.titulo}
                  className={`p-5 rounded-3xl border space-y-2.5 ${
                    isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Icone className="w-5 h-5" />
                  </div>
                  <h3 className="font-black text-base">{pilar.titulo}</h3>
                  <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    {pilar.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. GRADE VISUAL DE ESPECIALIDADES (CATEGORIAS ATIVAS DA LOJA) */}
      <section
        id="lp-especialidades"
        className={`py-12 sm:py-16 px-4 border-b ${
          isDark ? 'bg-[#08131A] border-slate-800/80' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div className="space-y-1.5">
              <span className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                Especialidades & Serviços
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                Escolha a especialidade desejada
              </h2>
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Clique em uma categoria para visualizar todos os procedimentos, valores e horários disponíveis.
              </p>
            </div>

            <button
              type="button"
              onClick={onAbrirVitrineCompleta}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 text-black border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white dark:border-slate-700 transition cursor-pointer inline-flex items-center gap-1.5 self-start sm:self-auto"
            >
              <span>Ver todos os serviços e produtos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {categoriasPrincipais.length === 0 ? (
            <div className={`p-8 rounded-3xl border text-center space-y-3 ${isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'}`}>
              <p className="text-sm font-medium text-slate-400">
                Explore nossa vitrine completa para visualizar todos os serviços e produtos disponíveis.
              </p>
              <button
                type="button"
                onClick={onAbrirVitrineCompleta}
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-emerald-300 hover:bg-emerald-400 text-black border border-emerald-400 transition cursor-pointer"
              >
                Abrir Vitrine Completa
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {categoriasPrincipais.map((cat) => {
                const qtd = contagemPorCategoria[cat.id] || 0;
                return (
                  <div
                    key={cat.id}
                    onClick={() => onSelecionarEspecialidade(cat.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelecionarEspecialidade(cat.id);
                      }
                    }}
                    className={`group rounded-3xl border overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer flex flex-col ${
                      isDark
                        ? 'bg-[#0F172A] border-slate-800 hover:border-emerald-500/60'
                        : 'bg-white border-slate-200 hover:border-emerald-500'
                    }`}
                  >
                    <div className="h-44 w-full overflow-hidden relative bg-slate-900">
                      {cat.imagem_url ? (
                        <img
                          src={cat.imagem_url}
                          alt={cat.nome}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-emerald-950/60 text-emerald-300/80 gap-2">
                          <Scissors className="w-10 h-10" />
                          <span className="text-xs font-black uppercase tracking-wider">{cat.nome}</span>
                        </div>
                      )}
                      {qtd > 0 && (
                        <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[11px] font-black bg-black/75 text-white backdrop-blur-xs">
                          {qtd} {qtd === 1 ? 'opção' : 'opções'}
                        </span>
                      )}
                    </div>

                    <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                      <div className="space-y-1.5">
                        <h3 className="text-lg font-black group-hover:text-emerald-500 transition">
                          {cat.nome}
                        </h3>
                        <p className={`text-xs sm:text-sm leading-relaxed line-clamp-3 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                          {cat.descricao?.trim() || `Veja os procedimentos, valores e horários disponíveis em ${cat.nome}.`}
                        </p>
                      </div>

                      <div className="pt-1">
                        <span className="w-full py-2.5 px-4 rounded-xl text-xs font-black bg-emerald-300 group-hover:bg-emerald-400 text-black border border-emerald-400 transition inline-flex items-center justify-center gap-1.5">
                          <span>Ver Procedimentos & Agendar</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 5. SEÇÃO NOSSOS PROFISSIONAIS */}
      {mostrarEquipe && (
        <section
          id="lp-profissionais"
          className={`py-12 sm:py-16 px-4 border-b ${
            isDark ? 'bg-[#0B1120] border-slate-800/80' : 'bg-white border-slate-200'
          }`}
        >
          <div className="max-w-6xl mx-auto space-y-8">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <span className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                Nossa Equipe
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">Nossos Profissionais</h2>
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Conheça os especialistas que cuidarão do seu atendimento e escolha com quem deseja agendar.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {profissionais.map((prof) => {
                const primeiroNome = (prof.nome_completo || 'Profissional').trim().split(' ')[0];
                const iniciais = (prof.nome_completo || 'PR')
                  .trim()
                  .split(' ')
                  .filter(Boolean)
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();
                const temCurriculoAprovado =
                  Boolean(prof.mini_curriculo?.trim()) && prof.curriculo_aprovado === true;

                return (
                  <div
                    key={prof.id}
                    className={`p-5 rounded-3xl border flex flex-col justify-between gap-4 ${
                      isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center gap-3.5">
                        <div
                          className={`w-20 h-20 rounded-2xl overflow-hidden shrink-0 border flex items-center justify-center font-black text-lg ${
                            isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-700'
                          }`}
                        >
                          {prof.url_foto ? (
                            <img
                              src={prof.url_foto}
                              alt={prof.nome_completo}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span>{iniciais}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <h3 className="font-black text-base leading-tight truncate">{prof.nome_completo}</h3>
                          {prof.especialidade_cargo && (
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 block truncate">
                              {prof.especialidade_cargo}
                            </span>
                          )}
                        </div>
                      </div>

                      {temCurriculoAprovado && (
                        <div className="space-y-1.5">
                          <p className={`text-xs leading-relaxed line-clamp-3 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                            {prof.mini_curriculo}
                          </p>
                          <button
                            type="button"
                            onClick={() => setProfissionalCurriculo(prof)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-200 hover:bg-slate-300 text-black border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white dark:border-slate-700 transition cursor-pointer"
                          >
                            <Info className="w-3 h-3" />
                            <span>Ler currículo completo</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onAgendarComProfissional(prof)}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-black bg-emerald-300 hover:bg-emerald-400 text-black border border-emerald-400 transition cursor-pointer inline-flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Agendar com {primeiroNome}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 6. GALERIA DE TRABALHOS */}
      {galeriaUrls.length > 0 && (
        <section
          id="lp-galeria"
          className={`py-12 sm:py-16 px-4 border-b ${
            isDark ? 'bg-[#08131A] border-slate-800/80' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="text-center max-w-2xl mx-auto space-y-1.5">
              <span className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Portfólio & Espaço</span>
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">Galeria de Trabalhos</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {galeriaUrls.map((url, idx) => (
                <button
                  key={`${url.slice(0, 30)}-${idx}`}
                  type="button"
                  onClick={() => setFotoAmpliada(url)}
                  className="aspect-square rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-800 bg-slate-900 group cursor-pointer shadow-xs"
                >
                  <img
                    src={url}
                    alt={`${loja.nome_fantasia} — Trabalho ${idx + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 7. RODAPÉ COMPLETO COM ENDEREÇO, TELEFONE E WHATSAPP */}
      <footer
        id="lp-contato"
        className={`py-10 px-4 ${
          isDark ? 'bg-[#0F172A] text-slate-200' : 'bg-white text-slate-800'
        }`}
      >
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              {loja.url_logo && (
                <img
                  src={loja.url_logo}
                  alt={loja.nome_fantasia}
                  className="w-9 h-9 rounded-xl object-cover border border-slate-300 dark:border-slate-700"
                />
              )}
              <span className="font-black text-base">{loja.nome_fantasia}</span>
            </div>
            <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              {subtituloHero}
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <span className="font-black uppercase tracking-wider text-[11px] text-emerald-600 dark:text-emerald-400 block">
              Localização & Contato
            </span>
            {enderecoCompleto && (
              <p className="flex items-start gap-2 leading-relaxed">
                <MapPin className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>{enderecoCompleto}</span>
              </p>
            )}
            {(loja.telefone || loja.whatsapp) && (
              <p className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{loja.whatsapp || loja.telefone}</span>
              </p>
            )}
            {loja.instagram && (
              <a
                href={loja.instagram.startsWith('http') ? loja.instagram : `https://instagram.com/${loja.instagram.replace(/^@/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 hover:text-emerald-500 transition"
              >
                <Instagram className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{loja.instagram}</span>
              </a>
            )}
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 md:items-end">
            <button
              type="button"
              onClick={() => rolarParaSecao('lp-especialidades')}
              className="px-5 py-2.5 rounded-xl text-xs font-black bg-emerald-300 hover:bg-emerald-400 text-black border border-emerald-400 transition cursor-pointer inline-flex items-center justify-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              <span>Agendar Horário</span>
            </button>

            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 text-black border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white dark:border-slate-700 transition inline-flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Falar no WhatsApp</span>
              </a>
            )}
          </div>
        </div>
      </footer>

      {/* LIGHTBOX DA GALERIA */}
      {fotoAmpliada && (
        <div
          onClick={() => setFotoAmpliada(null)}
          className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[85] flex items-center justify-center p-4 animate-in fade-in cursor-pointer"
        >
          <button
            type="button"
            onClick={() => setFotoAmpliada(null)}
            className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={fotoAmpliada}
            alt="Foto ampliada da galeria"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl cursor-default"
          />
        </div>
      )}

      {/* MODAL MINI CURRÍCULO NA PÁGINA DE APRESENTAÇÃO */}
      <ModalMiniCurriculoProfissional
        isOpen={Boolean(profissionalCurriculo)}
        onClose={() => setProfissionalCurriculo(null)}
        profissional={profissionalCurriculo}
        textoBotaoAcao="Agendar com este profissional"
        onSelecionar={(prof) => onAgendarComProfissional(prof)}
      />
    </div>
  );
};
