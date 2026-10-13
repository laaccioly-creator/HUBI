import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Tag,
  Truck,
  Plus,
  ArrowLeft,
  Check,
  X,
  Trash2,
  Edit2,
  Loader2,
  Sparkles,
  Ticket,
  ChevronRight,
  HelpCircle,
  AlertCircle,
  Copy,
  CheckCircle2,
  Percent,
  DollarSign
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Cupom, TipoCupom } from '../types';
import { CupomService } from '../services/cupomService';
import { MobileMenuDrawer } from './layout/MobileMenuDrawer';
import { MobileHeader } from './layout/MobileHeader';
import { ModalConfirmacaoExclusao } from './ModalConfirmacaoExclusao';
import { formatarMoeda } from '../utils/formatters';

type TelaCupomVisao = 'lista' | 'selecionar_tipo' | 'criar_frete_gratis' | 'criar_desconto';

export const CuponsGestao: React.FC = () => {
  const { loja } = useAuth();
  const { tema } = useTheme();
  const isDark = tema === 'dark';
  const navigate = useNavigate();

  const [visao, setVisao] = useState<TelaCupomVisao>('lista');
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [drawerMenuAberto, setDrawerMenuAberto] = useState<boolean>(false);

  // Estados do Formulário de Cupom
  const [cupomEditandoId, setCupomEditandoId] = useState<string | null>(null);
  const [codigoCupom, setCodigoCupom] = useState<string>('');
  const [tipoDesconto, setTipoDesconto] = useState<'fixo' | 'percentual'>('fixo');
  const [valorDesconto, setValorDesconto] = useState<string>('');
  const [temValorMinimo, setTemValorMinimo] = useState<boolean>(false);
  const [valorMinimoCarrinho, setValorMinimoCarrinho] = useState<string>('');
  const [erroForm, setErroForm] = useState<string | null>(null);

  const carregarCupons = async () => {
    if (!loja?.id) return;
    try {
      setCarregando(true);
      const data = await CupomService.listarCupons(loja.id);
      setCupons(data);
    } catch (err) {
      console.error('Erro ao carregar cupons:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarCupons();
  }, [loja?.id]);

  const abrirCriarNovo = () => {
    setCupomEditandoId(null);
    setCodigoCupom('');
    setTipoDesconto('fixo');
    setValorDesconto('');
    setTemValorMinimo(false);
    setValorMinimoCarrinho('');
    setErroForm(null);
    setVisao('selecionar_tipo');
  };

  const abrirEdicaoCupom = (cupom: Cupom) => {
    setCupomEditandoId(cupom.id);
    setCodigoCupom(cupom.codigo);
    setTemValorMinimo(cupom.tem_valor_minimo);
    setValorMinimoCarrinho(cupom.valor_minimo_carrinho ? String(cupom.valor_minimo_carrinho) : '');
    setErroForm(null);

    if (cupom.tipo === 'frete_gratis') {
      setVisao('criar_frete_gratis');
    } else {
      setTipoDesconto(cupom.tipo === 'desconto_percentual' ? 'percentual' : 'fixo');
      setValorDesconto(String(cupom.valor || ''));
      setVisao('criar_desconto');
    }
  };

  const handleSalvarCupom = async (tipo: TipoCupom) => {
    if (!loja?.id) return;
    setErroForm(null);

    const codigo = codigoCupom.trim().toUpperCase();
    if (!codigo) {
      setErroForm('Informe o código do cupom.');
      return;
    }

    let valorNum = 0;
    if (tipo === 'desconto_fixo' || tipo === 'desconto_percentual') {
      valorNum = parseFloat(valorDesconto.replace(',', '.')) || 0;
      if (valorNum <= 0) {
        setErroForm('Informe um valor de desconto válido maior que zero.');
        return;
      }
    }

    let valMinimoNum = 0;
    if (temValorMinimo) {
      valMinimoNum = parseFloat(valorMinimoCarrinho.replace(',', '.')) || 0;
      if (valMinimoNum <= 0) {
        setErroForm('Informe um valor mínimo de carrinho válido.');
        return;
      }
    }

    setSalvando(true);
    try {
      await CupomService.salvarCupom(loja.id, {
        id: cupomEditandoId || undefined,
        codigo,
        tipo,
        valor: valorNum,
        valor_minimo_carrinho: valMinimoNum,
        tem_valor_minimo: temValorMinimo,
        ativo: true
      });

      await carregarCupons();
      setVisao('lista');
    } catch (err: any) {
      console.error('Erro ao salvar cupom:', err);
      setErroForm(err.message || 'Erro ao salvar cupom. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const handleAlternarStatusCupom = async (cupom: Cupom) => {
    if (!loja?.id) return;
    try {
      await CupomService.salvarCupom(loja.id, {
        id: cupom.id,
        codigo: cupom.codigo,
        tipo: cupom.tipo,
        valor: cupom.valor,
        valor_minimo_carrinho: cupom.valor_minimo_carrinho,
        tem_valor_minimo: cupom.tem_valor_minimo,
        ativo: !cupom.ativo
      });
      setCupons(prev =>
        prev.map(c => (c.id === cupom.id ? { ...c, ativo: !c.ativo } : c))
      );
    } catch (err) {
      console.error('Erro ao alternar status:', err);
    }
  };

  // Estado para Modal de Exclusão Customizado
  const [cupomParaExcluir, setCupomParaExcluir] = useState<{ id: string; codigo: string } | null>(null);
  const [excluindoCupom, setExcluindoCupom] = useState<boolean>(false);

  const solicitarExcluirCupom = (cupom: Cupom) => {
    setCupomParaExcluir({ id: cupom.id, codigo: cupom.codigo });
  };

  const handleConfirmarExcluirCupom = async () => {
    if (!loja?.id || !cupomParaExcluir) return;

    try {
      setExcluindoCupom(true);
      await CupomService.excluirCupom(loja.id, cupomParaExcluir.id);
      setCupons(prev => prev.filter(c => c.id !== cupomParaExcluir.id));
      setCupomParaExcluir(null);
    } catch (err) {
      console.error('Erro ao excluir cupom:', err);
    } finally {
      setExcluindoCupom(false);
    }
  };

  const handleCopiarCodigo = (codigo: string) => {
    navigator.clipboard.writeText(codigo);
    setCopiado(codigo);
    setTimeout(() => setCopiado(null), 2000);
  };

  const nomeCupomExibicao = codigoCupom.trim().toUpperCase() || 'NOMEDOCUPOM';

  return (
    <div className="h-full w-full overflow-hidden select-none">
      {/* 1. VISÃO MOBILE EXCLUSIVA COM SUPORTE DUAL-TEMA */}
      <div className={`block md:hidden h-full flex flex-col overflow-y-auto font-sans ${isDark ? 'bg-[#08131A] text-white' : 'bg-slate-100 text-black'}`}>
        {/* Header Superior Mobile Unificado */}
        <MobileHeader
          titulo={
            visao === 'lista'
              ? 'Cupons de desconto'
              : visao === 'selecionar_tipo'
              ? 'Tipo de cupom'
              : visao === 'criar_frete_gratis'
              ? 'Cupom Frete Grátis'
              : 'Cupom com Desconto'
          }
          mostrarMenu={visao === 'lista'}
          onVoltar={() => {
            if (visao !== 'lista') {
              setVisao('lista');
            } else {
              if (typeof window !== 'undefined' && window.history && window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/pos');
              }
            }
          }}
          acoesDireita={
            visao === 'lista' ? (
              <button
                type="button"
                onClick={abrirCriarNovo}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md shadow-emerald-500/20 border border-emerald-500 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Novo</span>
              </button>
            ) : null
          }
        />

        {/* Conteúdo da Tela Mobile */}
        <div className="p-4 space-y-4 flex-1">
          {visao === 'lista' && (
            <>
              {/* Banner Promocional Suave */}
              <div className={`p-4 rounded-2xl border space-y-2 shadow-xs ${
                isDark
                  ? 'bg-[#000000] border-slate-700 text-white'
                  : 'bg-white border-2 border-slate-300 text-black'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-black text-[10px] uppercase">
                    Aumente suas vendas
                  </span>
                </div>
                <h3 className={`font-black text-sm ${isDark ? 'text-white' : 'text-black'}`}>Crie cupons promocionais</h3>
                <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  Ofereça cupons de porcentagem, valor fixo ou frete grátis para seus clientes no catálogo online.
                </p>
              </div>

              {/* Lista de Cupons */}
              <div className="space-y-2.5">
                <h2 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Cupons Criados ({cupons.length})
                </h2>

                {carregando ? (
                  <div className={`text-center py-12 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Carregando cupons...</div>
                ) : cupons.length === 0 ? (
                  <div className={`text-center py-12 rounded-2xl p-6 space-y-2 ${
                    isDark
                      ? 'bg-[#000000] border border-slate-700 text-white'
                      : 'bg-white border-2 border-slate-300 text-black'
                  }`}>
                    <Ticket className={`w-8 h-8 mx-auto ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                    <p className={`text-xs font-bold ${isDark ? 'text-white' : 'text-black'}`}>Nenhum cupom cadastrado ainda</p>
                    <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Clique em "+ Novo" acima para criar seu primeiro cupom.</p>
                  </div>
                ) : (
                  cupons.map((cupom) => (
                    <div
                      key={cupom.id}
                      className={`p-3.5 rounded-2xl shadow-xs space-y-2.5 ${
                        isDark
                          ? 'bg-[#000000] border border-slate-700 text-white'
                          : 'bg-white border-2 border-slate-300 text-black'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-black text-sm px-2.5 py-1 rounded-lg border ${
                            isDark
                              ? 'bg-[#08131A] text-white border-slate-700'
                              : 'bg-slate-100 text-black border-slate-300'
                          }`}>
                            {cupom.codigo}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopiarCodigo(cupom.codigo)}
                            className={`p-1 rounded-lg transition ${
                              isDark
                                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                                : 'text-slate-500 hover:text-black hover:bg-slate-100'
                            }`}
                            title="Copiar código"
                          >
                            {copiado === cupom.codigo ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>

                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={cupom.ativo}
                            onChange={() => handleAlternarStatusCupom(cupom)}
                            className="sr-only peer"
                          />
                          <div className={`w-9 h-5 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 ${
                            isDark ? 'bg-slate-800 after:border-slate-700' : 'bg-slate-300 after:border-slate-400'
                          }`}></div>
                        </label>
                      </div>

                      <div className={`flex items-center justify-between text-xs pt-1 border-t ${
                        isDark ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-600'
                      }`}>
                        <span className="font-bold text-emerald-500 dark:text-emerald-400">
                          {cupom.tipo === 'frete_gratis'
                            ? 'Frete Grátis'
                            : cupom.tipo === 'desconto_percentual'
                            ? `${cupom.valor}% OFF`
                            : `${formatarMoeda(cupom.valor || 0)} OFF`}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => abrirEdicaoCupom(cupom)}
                            className={`p-1.5 rounded-lg transition ${
                              isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-black'
                            }`}
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => solicitarExcluirCupom(cupom)}
                            className={`p-1.5 rounded-lg cursor-pointer transition ${
                              isDark ? 'text-rose-400 hover:bg-rose-950/40' : 'text-rose-600 hover:bg-rose-50'
                            }`}
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {visao === 'selecionar_tipo' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setVisao('criar_frete_gratis')}
                className={`w-full p-4 rounded-2xl transition text-left flex items-center justify-between shadow-xs ${
                  isDark
                    ? 'bg-[#000000] border border-slate-700 hover:border-emerald-500 text-white'
                    : 'bg-white border-2 border-slate-300 hover:border-emerald-500 text-black'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl border ${
                    isDark ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'bg-sky-50 text-sky-700 border-sky-200'
                  }`}>
                    <Truck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className={`font-black text-sm ${isDark ? 'text-white' : 'text-black'}`}>Frete Grátis</h3>
                    <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Zere a taxa de entrega no catálogo</p>
                  </div>
                </div>
                <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              </button>

              <button
                type="button"
                onClick={() => setVisao('criar_desconto')}
                className={`w-full p-4 rounded-2xl transition text-left flex items-center justify-between shadow-xs ${
                  isDark
                    ? 'bg-[#000000] border border-slate-700 hover:border-emerald-500 text-white'
                    : 'bg-white border-2 border-slate-300 hover:border-emerald-500 text-black'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl border ${
                    isDark ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    <Percent className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className={`font-black text-sm ${isDark ? 'text-white' : 'text-black'}`}>Desconto no Pedido</h3>
                    <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Desconto em % ou em reais no valor total</p>
                  </div>
                </div>
                <ChevronRight className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              </button>
            </div>
          )}

          {(visao === 'criar_frete_gratis' || visao === 'criar_desconto') && (
            <div className={`rounded-2xl p-4 space-y-4 shadow-xs ${
              isDark
                ? 'bg-[#000000] border border-slate-700 text-white'
                : 'bg-white border-2 border-slate-300 text-black'
            }`}>
              <div className="space-y-1">
                <label className={`text-xs font-bold ${isDark ? 'text-white' : 'text-black'}`}>Código do Cupom</label>
                <input
                  type="text"
                  placeholder="Ex: PROMO10, NATAL"
                  value={codigoCupom}
                  onChange={(e) => setCodigoCupom(e.target.value.toUpperCase())}
                  className={`w-full rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold tracking-wider transition focus:outline-none ${
                    isDark
                      ? 'bg-[#08131A] border border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500'
                      : 'bg-slate-50 border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white'
                  }`}
                />
              </div>

              {visao === 'criar_desconto' && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTipoDesconto('fixo')}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        tipoDesconto === 'fixo'
                          ? 'bg-emerald-600 text-white font-black border-emerald-500'
                          : isDark
                          ? 'bg-[#08131A] text-slate-300 border-slate-700 hover:text-white'
                          : 'bg-slate-100 text-slate-700 border-2 border-slate-300 hover:text-black'
                      }`}
                    >
                      Valor Fixo (R$)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTipoDesconto('percentual')}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        tipoDesconto === 'percentual'
                          ? 'bg-emerald-600 text-white font-black border-emerald-500'
                          : isDark
                          ? 'bg-[#08131A] text-slate-300 border-slate-700 hover:text-white'
                          : 'bg-slate-100 text-slate-700 border-2 border-slate-300 hover:text-black'
                      }`}
                    >
                      Porcentagem (%)
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className={`text-xs font-bold ${isDark ? 'text-white' : 'text-black'}`}>
                      {tipoDesconto === 'fixo' ? 'Valor do Desconto (R$)' : 'Percentual de Desconto (%)'}
                    </label>
                    <input
                      type="number"
                      placeholder="0,00"
                      value={valorDesconto}
                      onChange={(e) => setValorDesconto(e.target.value)}
                      className={`w-full rounded-xl px-3.5 py-2.5 text-xs font-bold transition focus:outline-none ${
                        isDark
                          ? 'bg-[#08131A] border border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500'
                          : 'bg-slate-50 border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white'
                      }`}
                    />
                  </div>
                </div>
              )}

              <div className={`pt-2 border-t space-y-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <label className={`flex items-center gap-2 text-xs font-bold cursor-pointer ${isDark ? 'text-white' : 'text-black'}`}>
                  <input
                    type="checkbox"
                    checked={temValorMinimo}
                    onChange={(e) => setTemValorMinimo(e.target.checked)}
                    className="accent-emerald-600"
                  />
                  <span>Exigir valor mínimo no carrinho</span>
                </label>

                {temValorMinimo && (
                  <input
                    type="number"
                    placeholder="Valor mínimo (R$)"
                    value={valorMinimoCarrinho}
                    onChange={(e) => setValorMinimoCarrinho(e.target.value)}
                    className={`w-full rounded-xl px-3.5 py-2.5 text-xs font-bold transition focus:outline-none ${
                      isDark
                        ? 'bg-[#08131A] border border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500'
                        : 'bg-slate-50 border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white'
                    }`}
                  />
                )}
              </div>

              {erroForm && (
                <div className={`p-2.5 rounded-xl text-xs font-bold ${
                  isDark
                    ? 'bg-rose-950/40 border border-rose-800 text-rose-300'
                    : 'bg-rose-50 border-2 border-rose-200 text-rose-700'
                }`}>
                  {erroForm}
                </div>
              )}

              <button
                type="button"
                onClick={() => handleSalvarCupom(visao === 'criar_frete_gratis' ? 'frete_gratis' : tipoDesconto === 'percentual' ? 'desconto_percentual' : 'desconto_fixo')}
                disabled={salvando}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md shadow-emerald-500/20 transition disabled:opacity-50 flex items-center justify-center gap-2 border border-emerald-500 cursor-pointer"
              >
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>{salvando ? 'Salvando...' : 'Salvar Cupom'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Menu Gaveta Lateral */}
        <MobileMenuDrawer
          aberto={drawerMenuAberto}
          onFechar={() => setDrawerMenuAberto(false)}
        />
      </div>

      {/* 2. VISÃO DESKTOP COM SUPORTE DUAL-TEMA */}
      <div className={`hidden md:flex flex-col h-full overflow-y-auto font-sans ${isDark ? 'bg-[#08131A] text-white' : 'bg-slate-100 text-black'}`}>
      {/* ========================================================================= */}
      {/* TELA 1: LISTAGEM & ONBOARDING (TELA001)                                   */}
      {/* ========================================================================= */}
      {visao === 'lista' && (
        <div className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-6 space-y-6 animate-in fade-in">
          {/* Header da Tela */}
          <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-300'}`}>
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${
                isDark ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}>
                <Ticket className="w-5 h-5" />
              </div>
              <div>
                <h1 className={`text-xl md:text-2xl font-black ${isDark ? 'text-white' : 'text-black'}`}>Cupons</h1>
                <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Crie promoções e cupons de frete grátis para sua loja</p>
              </div>
            </div>

            <button
              type="button"
              onClick={abrirCriarNovo}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-emerald-500/20 border border-emerald-500 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Criar novo cupom</span>
            </button>
          </div>

          {/* Carrossel Ilustrado / Card Visual de Venda mais com Cupons (TELA001) */}
          <div className={`relative overflow-hidden rounded-3xl p-6 md:p-8 text-center space-y-4 border ${
            isDark
              ? 'bg-[#000000] border-slate-700 text-white shadow-xl'
              : 'bg-white border-2 border-slate-300 text-black shadow-sm'
          }`}>
            {/* Visual de Cupons Promocionais */}
            <div className="flex items-center justify-center gap-3 py-2 flex-wrap">
              <div className="bg-emerald-600 text-white font-black text-xs px-3.5 py-1.5 rounded-lg shadow-lg rotate-[-4deg] border border-emerald-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>BLACKFRIDAY 25% OFF</span>
              </div>
              <div className="bg-white text-slate-900 font-black text-xs px-3.5 py-1.5 rounded-lg shadow-lg rotate-[3deg] border border-slate-300 flex items-center gap-1">
                <Truck className="w-3 h-3 text-emerald-600" />
                <span>FRETEGRÁTIS</span>
              </div>
              <div className="bg-indigo-600 text-white font-black text-xs px-3 py-1.5 rounded-lg shadow-lg rotate-[-2deg]">
                <span>20OFF</span>
              </div>
            </div>

            <div className="space-y-1.5 max-w-md mx-auto">
              <h2 className={`text-lg md:text-xl font-black ${isDark ? 'text-white' : 'text-black'}`}>
                Venda mais com cupons!
              </h2>
              <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Aumente suas vendas criando promoções, descontos no carrinho e frete grátis, do jeitinho que você quiser.
              </p>
            </div>
          </div>


          {/* Lista de Cupons Existentes */}
          <div className="space-y-3">
            <h3 className={`text-sm font-black flex items-center justify-between ${isDark ? 'text-white' : 'text-black'}`}>
              <span>Seus Cupons Cadastrados ({cupons.length})</span>
            </h3>

            {carregando ? (
              <div className={`flex flex-col items-center justify-center p-12 space-y-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                <span className="text-xs">Carregando seus cupons...</span>
              </div>
            ) : cupons.length === 0 ? (
              <div className={`rounded-3xl p-8 text-center space-y-3 ${
                isDark
                  ? 'bg-[#000000] border-2 border-dashed border-slate-700 text-white'
                  : 'bg-white border-2 border-dashed border-slate-300 text-black'
              }`}>
                <Tag className={`w-10 h-10 mx-auto ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Você ainda não tem nenhum cupom cadastrado.</p>
                <button
                  type="button"
                  onClick={abrirCriarNovo}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition inline-flex items-center gap-1.5 border border-emerald-500 shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Criar meu primeiro cupom</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cupons.map(cupom => {
                  const isFrete = cupom.tipo === 'frete_gratis';
                  return (
                    <div
                      key={cupom.id}
                      className={`p-4 rounded-2xl transition flex flex-col justify-between space-y-3 ${
                        isDark
                          ? cupom.ativo
                            ? 'bg-[#000000] border border-slate-700 hover:border-emerald-500/50 text-white shadow-xs'
                            : 'bg-[#000000]/60 border border-slate-800 opacity-60 text-white'
                          : cupom.ativo
                            ? 'bg-white border-2 border-slate-300 hover:border-emerald-500 text-black shadow-xs'
                            : 'bg-slate-50 border-2 border-slate-200 opacity-60 text-black'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                              isFrete
                                ? isDark
                                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                                  : 'bg-sky-50 text-sky-700 border border-sky-200'
                                : isDark
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {isFrete ? <Truck className="w-5 h-5" /> : <Tag className="w-5 h-5" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className={`font-black text-sm px-2 py-0.5 rounded-lg border font-mono ${
                                isDark ? 'bg-[#08131A] text-white border-slate-700' : 'bg-slate-100 text-black border-slate-300'
                              }`}>{cupom.codigo}</span>
                              <button
                                type="button"
                                onClick={() => handleCopiarCodigo(cupom.codigo)}
                                className={`transition cursor-pointer p-1 rounded-lg ${
                                  isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-black hover:bg-slate-100'
                                }`}
                                title="Copiar código"
                              >
                                {copiado === cupom.codigo ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                            <span className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                              {isFrete
                                ? 'Frete Grátis'
                                : cupom.tipo === 'desconto_percentual'
                                ? `${cupom.valor}% de desconto`
                                : `${formatarMoeda(cupom.valor || 0)} de desconto`}
                            </span>
                          </div>
                        </div>

                        {/* Switch de Ativo / Inativo */}
                        <button
                          type="button"
                          onClick={() => handleAlternarStatusCupom(cupom)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black border transition cursor-pointer ${
                            cupom.ativo
                              ? 'bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border-emerald-500/30'
                              : isDark
                              ? 'bg-slate-900 text-slate-400 border-slate-800'
                              : 'bg-slate-200 text-slate-600 border-slate-300'
                          }`}
                        >
                          {cupom.ativo ? 'Ativo' : 'Inativo'}
                        </button>
                      </div>

                      {/* Regras e Ações */}
                      <div className={`pt-2 border-t flex items-center justify-between text-xs ${
                        isDark ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-600'
                      }`}>
                        <span>
                          {cupom.tem_valor_minimo && Number(cupom.valor_minimo_carrinho) > 0
                            ? `Mínimo ${formatarMoeda(cupom.valor_minimo_carrinho)}`
                            : 'Sem valor mínimo'}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => abrirEdicaoCupom(cupom)}
                            className={`p-1.5 rounded-lg transition cursor-pointer ${
                              isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-black hover:bg-slate-100'
                            }`}
                            title="Editar cupom"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => solicitarExcluirCupom(cupom)}
                            className={`p-1.5 rounded-lg transition cursor-pointer ${
                              isDark ? 'text-rose-400 hover:text-rose-300 hover:bg-rose-950/40' : 'text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                            }`}
                            title="Excluir cupom"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TELA 2: ESCOLHER TIPO DE CUPOM (TELA002)                                  */}
      {/* ========================================================================= */}
      {visao === 'selecionar_tipo' && (
        <div className="flex-1 max-w-md mx-auto w-full p-4 md:p-6 space-y-6 animate-in fade-in">
          <div className={`flex items-center gap-2 pb-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-300'}`}>
            <button
              type="button"
              onClick={() => setVisao('lista')}
              className={`p-1.5 rounded-xl transition cursor-pointer ${
                isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-black hover:bg-slate-100'
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Criar novo cupom</h2>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4">
            {/* Opção 1: Frete Grátis (TELA003) */}
            <button
              type="button"
              onClick={() => setVisao('criar_frete_gratis')}
              className={`p-6 rounded-3xl border flex flex-col items-center justify-center text-center space-y-3 transition group cursor-pointer shadow-xl ${
                isDark
                  ? 'bg-[#000000] border-slate-700 hover:border-emerald-500 text-white'
                  : 'bg-white border-2 border-slate-300 hover:border-emerald-500 text-black shadow-sm'
              }`}
            >
              <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center group-hover:scale-110 transition ${
                isDark ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'bg-sky-50 text-sky-700 border-sky-200'
              }`}>
                <Truck className="w-7 h-7" />
              </div>
              <span className={`text-sm font-black transition ${
                isDark ? 'text-white group-hover:text-emerald-400' : 'text-black group-hover:text-emerald-600'
              }`}>
                Frete grátis
              </span>
            </button>

            {/* Opção 2: Desconto (TELA004) */}
            <button
              type="button"
              onClick={() => setVisao('criar_desconto')}
              className={`p-6 rounded-3xl border flex flex-col items-center justify-center text-center space-y-3 transition group cursor-pointer shadow-xl ${
                isDark
                  ? 'bg-[#000000] border-slate-700 hover:border-emerald-500 text-white'
                  : 'bg-white border-2 border-slate-300 hover:border-emerald-500 text-black shadow-sm'
              }`}
            >
              <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center group-hover:scale-110 transition ${
                isDark ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                <Tag className="w-7 h-7" />
              </div>
              <span className={`text-sm font-black transition ${
                isDark ? 'text-white group-hover:text-emerald-400' : 'text-black group-hover:text-emerald-600'
              }`}>
                Desconto
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TELA 3: CUPOM DE FRETE GRÁTIS (TELA003)                                   */}
      {/* ========================================================================= */}
      {visao === 'criar_frete_gratis' && (
        <div className="flex-1 max-w-md mx-auto w-full p-4 md:p-6 space-y-6 animate-in fade-in">
          {/* Header */}
          <div className={`flex items-center gap-2 pb-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-300'}`}>
            <button
              type="button"
              onClick={() => setVisao(cupomEditandoId ? 'lista' : 'selecionar_tipo')}
              className={`p-1.5 rounded-xl transition cursor-pointer ${
                isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-black hover:bg-slate-100'
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Cupom de frete grátis</h2>
          </div>

          {/* Ticket Visual Dinâmico (TELA003) */}
          <div className={`relative p-6 rounded-2xl shadow-xl flex flex-col items-center justify-center text-center border select-none overflow-hidden transition-colors ${
            isDark
              ? 'bg-[#000000] border-slate-700 text-white'
              : 'bg-white border-2 border-slate-300 text-black'
          }`}>
            {/* Recortes laterais do cupom */}
            <div className={`absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border ${
              isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-100 border-slate-300'
            }`}></div>
            <div className={`absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border ${
              isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-100 border-slate-300'
            }`}></div>

            <div className={`border-2 border-dashed rounded-xl px-6 py-2.5 mb-2 transition-colors ${
              isDark
                ? 'border-emerald-500/40 bg-[#08131A] text-emerald-400'
                : 'border-emerald-400 bg-emerald-50/80 text-emerald-700'
            }`}>
              <span className="font-mono font-black text-base tracking-wider">
                {nomeCupomExibicao}
              </span>
            </div>

            <div className={`flex items-center gap-1.5 text-xs font-bold ${
              isDark ? 'text-slate-300' : 'text-slate-700'
            }`}>
              <Truck className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <span>Frete grátis</span>
            </div>
          </div>

          {erroForm && (
            <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
              isDark ? 'bg-rose-950/40 border border-rose-800 text-rose-300' : 'bg-rose-50 border-2 border-rose-200 text-rose-700'
            }`}>
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{erroForm}</span>
            </div>
          )}

          {/* Card 1: Código de Cupom (TELA003) */}
          <div className={`p-4 rounded-2xl space-y-2 border ${
            isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
          }`}>
            <label className={`text-xs font-bold block ${isDark ? 'text-white' : 'text-black'}`}>Código de cupom</label>
            <input
              type="text"
              placeholder="Ex: 25OFF"
              value={codigoCupom}
              onChange={e => setCodigoCupom(e.target.value.toUpperCase())}
              className={`w-full border-b-2 px-3 py-2 text-sm font-bold tracking-wider focus:outline-none transition ${
                isDark
                  ? 'bg-[#08131A] border-slate-700 focus:border-emerald-500 text-white placeholder:text-slate-500'
                  : 'bg-slate-50 border-slate-300 focus:border-emerald-500 text-black placeholder:text-slate-400'
              }`}
            />
            <span className={`text-[11px] block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Este é o código que os clientes vão digitar</span>
          </div>

          {/* Card 2: Definir Valor Mínimo do Carrinho (TELA003) */}
          <div className={`p-4 rounded-2xl space-y-3 border ${
            isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
          }`}>
            <div className="flex items-center justify-between">
              <label className={`text-xs font-bold ${isDark ? 'text-white' : 'text-black'}`}>Definir valor mínimo do carrinho</label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={temValorMinimo}
                  onChange={e => setTemValorMinimo(e.target.checked)}
                  className="sr-only peer"
                />
                <div className={`w-11 h-6 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 ${
                  isDark ? 'bg-slate-800 after:border-slate-700' : 'bg-slate-300 after:border-slate-400'
                }`}></div>
              </label>
            </div>

            {temValorMinimo && (
              <div className="space-y-1.5 pt-2 animate-in fade-in">
                <div className="relative">
                  <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    R$
                  </span>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={valorMinimoCarrinho}
                    onChange={e => setValorMinimoCarrinho(e.target.value)}
                    className={`w-full border-b-2 pl-9 pr-3 py-2 text-sm font-bold focus:outline-none transition ${
                      isDark
                        ? 'bg-[#08131A] border-slate-700 focus:border-emerald-500 text-white placeholder:text-slate-500'
                        : 'bg-slate-50 border-slate-300 focus:border-emerald-500 text-black placeholder:text-slate-400'
                    }`}
                  />
                </div>
                <span className={`text-[11px] block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Defina o valor mínimo do carrinho necessário para o uso do cupom
                </span>
              </div>
            )}
          </div>

          {/* Botão Salvar Fixo no Rodapé (TELA003) */}
          <button
            type="button"
            onClick={() => handleSalvarCupom('frete_gratis')}
            disabled={salvando}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm transition shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 border border-emerald-500"
          >
            {salvando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Salvando cupom...</span>
              </>
            ) : (
              <span>Salvar</span>
            )}
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TELA 4: CUPOM DE DESCONTO (TELA004)                                       */}
      {/* ========================================================================= */}
      {visao === 'criar_desconto' && (
        <div className="flex-1 max-w-md mx-auto w-full p-4 md:p-6 space-y-6 animate-in fade-in">
          {/* Header */}
          <div className={`flex items-center gap-2 pb-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-300'}`}>
            <button
              type="button"
              onClick={() => setVisao(cupomEditandoId ? 'lista' : 'selecionar_tipo')}
              className={`p-1.5 rounded-xl transition cursor-pointer ${
                isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-black hover:bg-slate-100'
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className={`text-base font-black ${isDark ? 'text-white' : 'text-black'}`}>Cupom de desconto</h2>
          </div>

          {/* Ticket Visual Dinâmico (TELA004) */}
          <div className={`relative p-6 rounded-2xl shadow-xl flex flex-col items-center justify-center text-center border select-none overflow-hidden transition-colors ${
            isDark
              ? 'bg-[#000000] border-slate-700 text-white'
              : 'bg-white border-2 border-slate-300 text-black'
          }`}>
            {/* Recortes laterais do cupom */}
            <div className={`absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border ${
              isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-100 border-slate-300'
            }`}></div>
            <div className={`absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border ${
              isDark ? 'bg-[#08131A] border-slate-700' : 'bg-slate-100 border-slate-300'
            }`}></div>

            <div className={`border-2 border-dashed rounded-xl px-6 py-2.5 mb-2 transition-colors ${
              isDark
                ? 'border-emerald-500/40 bg-[#08131A] text-emerald-400'
                : 'border-emerald-400 bg-emerald-50/80 text-emerald-700'
            }`}>
              <span className="font-mono font-black text-base tracking-wider">
                {nomeCupomExibicao}
              </span>
            </div>

            <div className={`flex items-center gap-1.5 text-xs font-bold ${
              isDark ? 'text-slate-300' : 'text-slate-700'
            }`}>
              <Tag className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <span>
                {valorDesconto
                  ? tipoDesconto === 'percentual'
                    ? `${valorDesconto}% de desconto no carrinho`
                    : `${formatarMoeda(valorDesconto)} de desconto no carrinho`
                  : 'de desconto no carrinho'}
              </span>
            </div>
          </div>

          {erroForm && (
            <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
              isDark ? 'bg-rose-950/40 border border-rose-800 text-rose-300' : 'bg-rose-50 border-2 border-rose-200 text-rose-700'
            }`}>
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{erroForm}</span>
            </div>
          )}

          {/* Card 1: Código de Cupom (TELA004) */}
          <div className={`p-4 rounded-2xl space-y-2 border ${
            isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
          }`}>
            <label className={`text-xs font-bold block ${isDark ? 'text-white' : 'text-black'}`}>Código de cupom</label>
            <input
              type="text"
              placeholder="Ex: 25OFF"
              value={codigoCupom}
              onChange={e => setCodigoCupom(e.target.value.toUpperCase())}
              className={`w-full border-b-2 px-3 py-2 text-sm font-bold tracking-wider focus:outline-none transition ${
                isDark
                  ? 'bg-[#08131A] border-slate-700 focus:border-emerald-500 text-white placeholder:text-slate-500'
                  : 'bg-slate-50 border-slate-300 focus:border-emerald-500 text-black placeholder:text-slate-400'
              }`}
            />
            <span className={`text-[11px] block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Este é o código que os clientes vão digitar</span>
          </div>

          {/* Card 2: Tipo de Desconto (TELA004) */}
          <div className={`p-4 rounded-2xl space-y-3 border ${
            isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
          }`}>
            <div>
              <label className={`text-xs font-bold block ${isDark ? 'text-white' : 'text-black'}`}>Tipo de desconto</label>
              <p className={`text-[11px] leading-relaxed mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                O desconto será aplicado ao valor total dos produtos, mesmo que tenham produtos com preço promocional
              </p>
            </div>

            {/* Pills Seletor: Valor fixo vs Percentual */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTipoDesconto('fixo')}
                className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                  tipoDesconto === 'fixo'
                    ? 'bg-emerald-600 text-white font-black border-emerald-500 shadow-sm'
                    : isDark
                    ? 'bg-[#08131A] text-slate-300 border-slate-700 hover:text-white'
                    : 'bg-slate-100 text-slate-700 border-2 border-slate-300 hover:text-black'
                }`}
              >
                Valor fixo
              </button>

              <button
                type="button"
                onClick={() => setTipoDesconto('percentual')}
                className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                  tipoDesconto === 'percentual'
                    ? 'bg-emerald-600 text-white font-black border-emerald-500 shadow-sm'
                    : isDark
                    ? 'bg-[#08131A] text-slate-300 border-slate-700 hover:text-white'
                    : 'bg-slate-100 text-slate-700 border-2 border-slate-300 hover:text-black'
                }`}
              >
                Percentual
              </button>
            </div>

            {/* Input do Valor */}
            <div className="relative pt-1">
              <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {tipoDesconto === 'fixo' ? 'R$' : '%'}
              </span>
              <input
                type="text"
                placeholder={tipoDesconto === 'fixo' ? '0,00' : '10'}
                value={valorDesconto}
                onChange={e => setValorDesconto(e.target.value)}
                className={`w-full border-b-2 pl-9 pr-3 py-2 text-sm font-bold focus:outline-none transition ${
                  isDark
                    ? 'bg-[#08131A] border-slate-700 focus:border-emerald-500 text-white placeholder:text-slate-500'
                    : 'bg-slate-50 border-slate-300 focus:border-emerald-500 text-black placeholder:text-slate-400'
                }`}
              />
            </div>
          </div>

          {/* Card 3: Definir Valor Mínimo do Carrinho (TELA004) */}
          <div className={`p-4 rounded-2xl space-y-3 border ${
            isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'
          }`}>
            <div className="flex items-center justify-between">
              <label className={`text-xs font-bold ${isDark ? 'text-white' : 'text-black'}`}>Definir valor mínimo do carrinho</label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={temValorMinimo}
                  onChange={e => setTemValorMinimo(e.target.checked)}
                  className="sr-only peer"
                />
                <div className={`w-11 h-6 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 ${
                  isDark ? 'bg-slate-800 after:border-slate-700' : 'bg-slate-300 after:border-slate-400'
                }`}></div>
              </label>
            </div>

            {temValorMinimo && (
              <div className="space-y-1.5 pt-2 animate-in fade-in">
                <div className="relative">
                  <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    R$
                  </span>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={valorMinimoCarrinho}
                    onChange={e => setValorMinimoCarrinho(e.target.value)}
                    className={`w-full border-b-2 pl-9 pr-3 py-2 text-sm font-bold focus:outline-none transition ${
                      isDark
                        ? 'bg-[#08131A] border-slate-700 focus:border-emerald-500 text-white placeholder:text-slate-500'
                        : 'bg-slate-50 border-slate-300 focus:border-emerald-500 text-black placeholder:text-slate-400'
                    }`}
                  />
                </div>
                <span className={`text-[11px] block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Defina o valor mínimo do carrinho necessário para o uso do cupom
                </span>
              </div>
            )}
          </div>

          {/* Botão Salvar Fixo no Rodapé (TELA004) */}
          <button
            type="button"
            onClick={() =>
              handleSalvarCupom(
                tipoDesconto === 'percentual' ? 'desconto_percentual' : 'desconto_fixo'
              )
            }
            disabled={salvando}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm transition shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 border border-emerald-500"
          >
            {salvando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Salvando cupom...</span>
              </>
            ) : (
              <span>Salvar</span>
            )}
          </button>
        </div>
      )}
      </div>

      {/* Modal de Confirmação de Exclusão */}
      <ModalConfirmacaoExclusao
        isOpen={Boolean(cupomParaExcluir)}
        onClose={() => setCupomParaExcluir(null)}
        onConfirmar={handleConfirmarExcluirCupom}
        titulo="Excluir Cupom"
        mensagem="Deseja realmente excluir este cupom? Esta ação não poderá ser desfeita e clientes não poderão mais utilizá-lo."
        itemNome={cupomParaExcluir ? `Cupom: ${cupomParaExcluir.codigo}` : undefined}
        carregando={excluindoCupom}
      />
    </div>
  );
};
