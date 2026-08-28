import React, { useState, useEffect } from 'react';
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
import { Cupom, TipoCupom } from '../types';
import { CupomService } from '../services/cupomService';

type TelaCupomVisao = 'lista' | 'selecionar_tipo' | 'criar_frete_gratis' | 'criar_desconto';

export const CuponsGestao: React.FC = () => {
  const { loja } = useAuth();

  const [visao, setVisao] = useState<TelaCupomVisao>('lista');
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [copiado, setCopiado] = useState<string | null>(null);

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

  const handleExcluirCupom = async (cupomId: string) => {
    if (!loja?.id) return;
    if (!confirm('Deseja realmente excluir este cupom?')) return;

    try {
      await CupomService.excluirCupom(loja.id, cupomId);
      setCupons(prev => prev.filter(c => c.id !== cupomId));
    } catch (err) {
      console.error('Erro ao excluir cupom:', err);
    }
  };

  const handleCopiarCodigo = (codigo: string) => {
    navigator.clipboard.writeText(codigo);
    setCopiado(codigo);
    setTimeout(() => setCopiado(null), 2000);
  };

  const nomeCupomExibicao = codigoCupom.trim().toUpperCase() || 'NOMEDOCUPOM';

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto font-sans">
      {/* ========================================================================= */}
      {/* TELA 1: LISTAGEM & ONBOARDING (TELA001)                                   */}
      {/* ========================================================================= */}
      {visao === 'lista' && (
        <div className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-6 space-y-6 animate-in fade-in">
          {/* Header da Tela */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <Ticket className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black text-slate-100">Cupons</h1>
                <p className="text-xs text-slate-400">Crie promoções e cupons de frete grátis para sua loja</p>
              </div>
            </div>

            <button
              type="button"
              onClick={abrirCriarNovo}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Criar novo cupom</span>
            </button>
          </div>

          {/* Carrossel Ilustrado / Card Visual de Venda mais com Cupons (TELA001) */}
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-950/40 via-slate-900 to-indigo-950/30 border border-emerald-500/30 rounded-3xl p-6 md:p-8 text-center space-y-4 shadow-xl">
            {/* Visual de Cupons Promocionais */}
            <div className="flex items-center justify-center gap-3 py-2 flex-wrap">
              <div className="bg-emerald-500 text-slate-950 font-black text-xs px-3.5 py-1.5 rounded-lg shadow-lg rotate-[-4deg] border border-emerald-300 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>BLACKFRIDAY 25% OFF</span>
              </div>
              <div className="bg-white text-slate-900 font-black text-xs px-3.5 py-1.5 rounded-lg shadow-lg rotate-[3deg] border border-slate-200 flex items-center gap-1">
                <Truck className="w-3 h-3 text-emerald-600" />
                <span>FRETEGRÁTIS</span>
              </div>
              <div className="bg-indigo-600 text-white font-black text-xs px-3 py-1.5 rounded-lg shadow-lg rotate-[-2deg]">
                <span>20OFF</span>
              </div>
            </div>

            <div className="space-y-1.5 max-w-md mx-auto">
              <h2 className="text-lg md:text-xl font-black text-slate-100">Venda mais com cupons!</h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Aumente suas vendas criando promoções, descontos no carrinho e frete grátis, do jeitinho que você quiser.
              </p>
            </div>
          </div>

          {/* Lista de Cupons Existentes */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-200 flex items-center justify-between">
              <span>Seus Cupons Cadastrados ({cupons.length})</span>
            </h3>

            {carregando ? (
              <div className="flex flex-col items-center justify-center p-12 text-slate-400 space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                <span className="text-xs">Carregando seus cupons...</span>
              </div>
            ) : cupons.length === 0 ? (
              <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-3xl p-8 text-center space-y-3">
                <Tag className="w-10 h-10 text-slate-600 mx-auto" />
                <p className="text-xs text-slate-400">Você ainda não tem nenhum cupom cadastrado.</p>
                <button
                  type="button"
                  onClick={abrirCriarNovo}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer"
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
                      className={`p-4 rounded-2xl border transition flex flex-col justify-between space-y-3 ${
                        cupom.ativo
                          ? 'bg-slate-900/90 border-slate-800 hover:border-emerald-500/40'
                          : 'bg-slate-950 border-slate-900 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                              isFrete
                                ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            {isFrete ? <Truck className="w-5 h-5" /> : <Tag className="w-5 h-5" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-black text-sm text-slate-100">{cupom.codigo}</span>
                              <button
                                type="button"
                                onClick={() => handleCopiarCodigo(cupom.codigo)}
                                className="text-slate-400 hover:text-emerald-400 transition"
                                title="Copiar código"
                              >
                                {copiado === cupom.codigo ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                            <span className="text-xs text-slate-400 font-medium">
                              {isFrete
                                ? 'Frete Grátis'
                                : cupom.tipo === 'desconto_percentual'
                                ? `${cupom.valor}% de desconto`
                                : `R$ ${Number(cupom.valor).toFixed(2)} de desconto`}
                            </span>
                          </div>
                        </div>

                        {/* Switch de Ativo / Inativo */}
                        <button
                          type="button"
                          onClick={() => handleAlternarStatusCupom(cupom)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition cursor-pointer ${
                            cupom.ativo
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-slate-800 text-slate-500 border-slate-700'
                          }`}
                        >
                          {cupom.ativo ? 'Ativo' : 'Inativo'}
                        </button>
                      </div>

                      {/* Regras e Ações */}
                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                        <span>
                          {cupom.tem_valor_minimo && Number(cupom.valor_minimo_carrinho) > 0
                            ? `Mínimo R$ ${Number(cupom.valor_minimo_carrinho).toFixed(2)}`
                            : 'Sem valor mínimo'}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => abrirEdicaoCupom(cupom)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                            title="Editar cupom"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleExcluirCupom(cupom.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
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
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <button
              type="button"
              onClick={() => setVisao('lista')}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold text-slate-100">Criar novo cupom</h2>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4">
            {/* Opção 1: Frete Grátis (TELA003) */}
            <button
              type="button"
              onClick={() => setVisao('criar_frete_gratis')}
              className="p-6 rounded-3xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 flex flex-col items-center justify-center text-center space-y-3 transition group cursor-pointer shadow-xl"
            >
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center group-hover:scale-110 transition">
                <Truck className="w-7 h-7" />
              </div>
              <span className="text-sm font-bold text-slate-100 group-hover:text-emerald-400">
                Frete grátis
              </span>
            </button>

            {/* Opção 2: Desconto (TELA004) */}
            <button
              type="button"
              onClick={() => setVisao('criar_desconto')}
              className="p-6 rounded-3xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 flex flex-col items-center justify-center text-center space-y-3 transition group cursor-pointer shadow-xl"
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition">
                <Tag className="w-7 h-7" />
              </div>
              <span className="text-sm font-bold text-slate-100 group-hover:text-emerald-400">
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
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <button
              type="button"
              onClick={() => setVisao(cupomEditandoId ? 'lista' : 'selecionar_tipo')}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold text-slate-100">Cupom de frete grátis</h2>
          </div>

          {/* Ticket Visual Dinâmico (TELA003) */}
          <div className="relative bg-gradient-to-r from-amber-200/90 via-amber-100 to-amber-200 text-slate-900 p-6 rounded-2xl shadow-xl flex flex-col items-center justify-center text-center border border-amber-300 select-none overflow-hidden">
            {/* Recortes laterais do cupom */}
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-950 border border-amber-300"></div>
            <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-950 border border-amber-300"></div>

            <div className="border-2 border-dashed border-amber-400/60 rounded-xl px-6 py-2.5 mb-2 bg-white/40">
              <span className="font-black text-base text-amber-700 tracking-wider">
                {nomeCupomExibicao}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Truck className="w-4 h-4" />
              <span>Frete grátis</span>
            </div>
          </div>

          {erroForm && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{erroForm}</span>
            </div>
          )}

          {/* Card 1: Código de Cupom (TELA003) */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
            <label className="text-xs font-bold text-slate-200 block">Código de cupom</label>
            <input
              type="text"
              placeholder="Ex: 25OFF"
              value={codigoCupom}
              onChange={e => setCodigoCupom(e.target.value.toUpperCase())}
              className="w-full bg-slate-950 border-b-2 border-slate-700 focus:border-emerald-500 px-3 py-2 text-sm text-slate-100 font-bold focus:outline-none tracking-wider"
            />
            <span className="text-[11px] text-slate-400 block">Este é o código que os clientes vão digitar</span>
          </div>

          {/* Card 2: Definir Valor Mínimo do Carrinho (TELA003) */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200">Definir valor mínimo do carrinho</label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={temValorMinimo}
                  onChange={e => setTemValorMinimo(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {temValorMinimo && (
              <div className="space-y-1.5 pt-2 animate-in fade-in">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">
                    R$
                  </span>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={valorMinimoCarrinho}
                    onChange={e => setValorMinimoCarrinho(e.target.value)}
                    className="w-full bg-slate-950 border-b-2 border-slate-700 focus:border-emerald-500 pl-9 pr-3 py-2 text-sm text-slate-100 font-bold focus:outline-none"
                  />
                </div>
                <span className="text-[11px] text-slate-400 block">
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
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm transition shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
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
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <button
              type="button"
              onClick={() => setVisao(cupomEditandoId ? 'lista' : 'selecionar_tipo')}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold text-slate-100">Cupom de desconto</h2>
          </div>

          {/* Ticket Visual Dinâmico (TELA004) */}
          <div className="relative bg-gradient-to-r from-amber-200/90 via-amber-100 to-amber-200 text-slate-900 p-6 rounded-2xl shadow-xl flex flex-col items-center justify-center text-center border border-amber-300 select-none overflow-hidden">
            {/* Recortes laterais do cupom */}
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-950 border border-amber-300"></div>
            <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-950 border border-amber-300"></div>

            <div className="border-2 border-dashed border-amber-400/60 rounded-xl px-6 py-2.5 mb-2 bg-white/40">
              <span className="font-black text-base text-amber-700 tracking-wider">
                {nomeCupomExibicao}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Tag className="w-4 h-4" />
              <span>
                {valorDesconto
                  ? tipoDesconto === 'percentual'
                    ? `${valorDesconto}% de desconto no carrinho`
                    : `R$ ${valorDesconto} de desconto no carrinho`
                  : 'de desconto no carrinho'}
              </span>
            </div>
          </div>

          {erroForm && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{erroForm}</span>
            </div>
          )}

          {/* Card 1: Código de Cupom (TELA004) */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
            <label className="text-xs font-bold text-slate-200 block">Código de cupom</label>
            <input
              type="text"
              placeholder="Ex: 25OFF"
              value={codigoCupom}
              onChange={e => setCodigoCupom(e.target.value.toUpperCase())}
              className="w-full bg-slate-950 border-b-2 border-slate-700 focus:border-emerald-500 px-3 py-2 text-sm text-slate-100 font-bold focus:outline-none tracking-wider"
            />
            <span className="text-[11px] text-slate-400 block">Este é o código que os clientes vão digitar</span>
          </div>

          {/* Card 2: Tipo de Desconto (TELA004) */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-200 block">Tipo de desconto</label>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
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
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                Valor fixo
              </button>

              <button
                type="button"
                onClick={() => setTipoDesconto('percentual')}
                className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                  tipoDesconto === 'percentual'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                Percentual
              </button>
            </div>

            {/* Input do Valor */}
            <div className="relative pt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">
                {tipoDesconto === 'fixo' ? 'R$' : '%'}
              </span>
              <input
                type="text"
                placeholder={tipoDesconto === 'fixo' ? '0,00' : '10'}
                value={valorDesconto}
                onChange={e => setValorDesconto(e.target.value)}
                className="w-full bg-slate-950 border-b-2 border-slate-700 focus:border-emerald-500 pl-9 pr-3 py-2 text-sm text-slate-100 font-bold focus:outline-none"
              />
            </div>
          </div>

          {/* Card 3: Definir Valor Mínimo do Carrinho (TELA004) */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200">Definir valor mínimo do carrinho</label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={temValorMinimo}
                  onChange={e => setTemValorMinimo(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {temValorMinimo && (
              <div className="space-y-1.5 pt-2 animate-in fade-in">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">
                    R$
                  </span>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={valorMinimoCarrinho}
                    onChange={e => setValorMinimoCarrinho(e.target.value)}
                    className="w-full bg-slate-950 border-b-2 border-slate-700 focus:border-emerald-500 pl-9 pr-3 py-2 text-sm text-slate-100 font-bold focus:outline-none"
                  />
                </div>
                <span className="text-[11px] text-slate-400 block">
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
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm transition shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
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
  );
};
