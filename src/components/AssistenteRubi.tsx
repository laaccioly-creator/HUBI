import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Send,
  Bot,
  User,
  TrendingUp,
  Package,
  DollarSign,
  ArrowLeft
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { MobileMenuDrawer } from './layout/MobileMenuDrawer';
import { processarPerguntaRubiIA, DadosLojaRubi } from '../services/tutoriaisHubiService';

interface MensagemIA {
  id: string;
  remetente: 'user' | 'rubi';
  texto: string;
  data: Date;
}

export const AssistenteRubi: React.FC = () => {
  const { loja, usuario } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();

  useEffect(() => {
    if (!permissions.podeAcessarRubiIA) {
      navigate('/pos');
    }
  }, [permissions.podeAcessarRubiIA, navigate]);
  const [mensagens, setMensagens] = useState<MensagemIA[]>([
    {
      id: '1',
      remetente: 'rubi',
      texto: `Olá! Sou a **Rubi**, sua assistente inteligente no **HUBI**. 🚀\n\nPosso te ajudar com perguntas sobre suas vendas de hoje, estoque baixo, produtos mais vendidos ou calcular seu fluxo de caixa.\n\nComo posso ajudar o seu negócio hoje?`,
      data: new Date()
    }
  ]);
  const [inputTexto, setInputTexto] = useState<string>('');
  const [pensando, setPensando] = useState<boolean>(false);
  const [drawerMenuAberto, setDrawerMenuAberto] = useState<boolean>(false);
  const [alturaTeclado, setAlturaTeclado] = useState<number>(0);
  const endRef = useRef<HTMLDivElement>(null);
  const endMobileRef = useRef<HTMLDivElement>(null);

  // Monitora redimensionamento da tela pelo teclado virtual no Mobile
  useEffect(() => {
    const handleVisualViewportChange = () => {
      if (window.visualViewport) {
        const offset = window.innerHeight - window.visualViewport.height;
        setAlturaTeclado(offset > 50 ? offset : 0);
        setTimeout(() => {
          endMobileRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 80);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportChange);
      window.visualViewport.addEventListener('scroll', handleVisualViewportChange);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportChange);
        window.visualViewport.removeEventListener('scroll', handleVisualViewportChange);
      }
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
    endMobileRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  const handleEnviarMensagem = async (textoPergunta?: string) => {
    const pergunta = (textoPergunta || inputTexto).trim();
    if (!pergunta || pensando || !loja?.id) return;

    const msgUser: MensagemIA = {
      id: Date.now().toString(),
      remetente: 'user',
      texto: pergunta,
      data: new Date()
    };

    setMensagens(prev => [...prev, msgUser]);
    setInputTexto('');
    setPensando(true);

    try {
      const { data: pedidos } = await supabase
        .from('pedidos')
        .select('*')
        .eq('loja_id', loja.id)
        .eq('status', 'confirmado');

      const { data: produtos } = await supabase
        .from('produtos')
        .select('*, variacoes:variacoes_produto(*)')
        .eq('loja_id', loja.id)
        .eq('ativo', true);

      const { data: clientes } = await supabase
        .from('clientes')
        .select('*')
        .eq('loja_id', loja.id);

      const getEstoqueReal = (p: any) => {
        if (p.tem_variacoes && Array.isArray(p.variacoes) && p.variacoes.length > 0) {
          return p.variacoes.reduce((acc: number, v: any) => acc + Number(v.quantidade_estoque || 0), 0);
        }
        return Number(p.quantidade_estoque || 0);
      };

      const faturamento = pedidos?.reduce((acc, p) => acc + Number(p.valor_total || 0), 0) || 0;
      const totalPedidos = pedidos?.length || 0;
      const produtosAlerta = produtos?.filter(p => getEstoqueReal(p) <= Number(p.estoque_minimo_alerta)) || [];
      const totalFiado = clientes?.reduce((acc, c) => acc + Number(c.saldo_devedor_fiado || 0), 0) || 0;

      const dadosLoja: DadosLojaRubi = {
        faturamento,
        totalPedidos,
        produtosAlerta,
        totalFiado,
        produtosTotal: produtos?.length || 0,
        clientesTotal: clientes?.length || 0
      };

      const resposta = await processarPerguntaRubiIA(pergunta, usuario, loja, dadosLoja);

      setMensagens(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          remetente: 'rubi',
          texto: resposta,
          data: new Date()
        }
      ]);
      setPensando(false);
    } catch (e) {
      console.warn('Erro ao processar mensagem com Rubi IA:', e);
      setPensando(false);
    }
  };

  return (
    <div className="h-full w-full overflow-hidden select-none">
      {/* 1. VISÃO MOBILE EXCLUSIVA (TEMA CLARO PADRÃO PEDIDOS/PRODUTOS) */}
      <div className="block md:hidden h-full flex flex-col overflow-hidden bg-slate-50 text-slate-900 font-sans">
        {/* Header Superior Mobile */}
        <div className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 transition cursor-pointer"
              title="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
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
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-sm shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                <span>Rubi IA</span>
                <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-1.5 py-0.2 rounded border border-indigo-200">
                  HUBI
                </span>
              </h1>
            </div>
          </div>
        </div>

        {/* Área de Mensagens com Scroll */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {mensagens.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-2.5 ${msg.remetente === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.remetente === 'rubi' && (
                <div className="w-7 h-7 rounded-xl bg-indigo-500 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[82%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                  msg.remetente === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-none shadow-xs font-medium'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-xs whitespace-pre-line'
                }`}
              >
                {msg.texto}
              </div>

              {msg.remetente === 'user' && (
                <div className="w-7 h-7 rounded-xl bg-slate-200 flex items-center justify-center text-slate-700 shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {pensando && (
            <div className="flex items-center gap-2 text-indigo-600 text-xs p-2 bg-indigo-50/50 rounded-xl border border-indigo-100">
              <Sparkles className="w-4 h-4 animate-spin text-indigo-500" />
              <span className="font-semibold">Rubi está analisando os dados...</span>
            </div>
          )}
          <div ref={endMobileRef} />
        </div>

        {/* Rodapé Mobile: Sugestões e Input */}
        <div
          style={{ paddingBottom: alturaTeclado > 0 ? `${alturaTeclado + 8}px` : '12px' }}
          className="p-3 border-t border-slate-200 bg-white space-y-2 shrink-0 transition-all duration-150"
        >
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
            <button
              type="button"
              onClick={() => handleEnviarMensagem('Como estão as vendas e o faturamento?')}
              className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 whitespace-nowrap flex items-center gap-1.5 transition border border-slate-300 font-semibold"
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              <span>Resumo de Vendas</span>
            </button>

            <button
              type="button"
              onClick={() => handleEnviarMensagem('Quais produtos estão com estoque baixo?')}
              className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 whitespace-nowrap flex items-center gap-1.5 transition border border-slate-300 font-semibold"
            >
              <Package className="w-3.5 h-3.5 text-amber-600" />
              <span>Alerta de Estoque</span>
            </button>

            <button
              type="button"
              onClick={() => handleEnviarMensagem('Quanto tenho a receber em fiado?')}
              className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 whitespace-nowrap flex items-center gap-1.5 transition border border-slate-300 font-semibold"
            >
              <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
              <span>Total em Fiado</span>
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleEnviarMensagem();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Digite uma pergunta para a Rubi..."
              value={inputTexto}
              onChange={(e) => setInputTexto(e.target.value)}
              onFocus={(e) => {
                setTimeout(() => {
                  e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                  endMobileRef.current?.scrollIntoView({ behavior: 'smooth' });
                }, 200);
              }}
              style={{
                color: '#000000',
                WebkitTextFillColor: '#000000',
                fontWeight: 700,
                caretColor: '#000000'
              }}
              className="flex-1 rubi-input-mobile bg-white border-2 border-slate-400 focus:border-emerald-600 rounded-xl px-3.5 py-2.5 text-xs text-black !text-black font-bold placeholder:text-slate-500 placeholder:font-medium focus:outline-none shadow-sm transition"
            />
            <button
              type="submit"
              disabled={!inputTexto.trim() || pensando}
              className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 disabled:opacity-50 transition cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Menu Gaveta Lateral */}
        <MobileMenuDrawer
          aberto={drawerMenuAberto}
          onFechar={() => setDrawerMenuAberto(false)}
        />
      </div>

      {/* 2. VISÃO DESKTOP (100% PRESERVADA NO TEMA ESCURO ORIGINAL) */}
      <div className="hidden md:flex flex-col h-full overflow-hidden bg-slate-950">
      <div className="p-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition cursor-pointer"
            title="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <span>Rubi - Assistente de Inteligência Artificial</span>
              <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-bold px-1.5 py-0.5 rounded border border-indigo-500/30">
                HUBI AI
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">Pergunte sobre faturamento, produtos, alertas de estoque e dicas de crescimento.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-4xl mx-auto w-full">
        {mensagens.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 ${msg.remetente === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.remetente === 'rubi' && (
              <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0 mt-1">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-lg rounded-2xl p-4 text-xs leading-relaxed ${
                msg.remetente === 'user'
                  ? 'bg-emerald-600 text-white rounded-br-none shadow-md'
                  : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none shadow-sm whitespace-pre-line'
              }`}
            >
              {msg.texto}
            </div>

            {msg.remetente === 'user' && (
              <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300 shrink-0 mt-1">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {pensando && (
          <div className="flex items-center gap-2 text-indigo-400 text-xs p-2">
            <Sparkles className="w-4 h-4 animate-spin" />
            <span>Rubi está analisando os dados da sua loja...</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="p-4 border-t border-slate-800 bg-slate-900/90 max-w-4xl mx-auto w-full space-y-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
          <button
            onClick={() => handleEnviarMensagem('Como estão as vendas e o faturamento?')}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 whitespace-nowrap flex items-center gap-1.5 transition border border-slate-700"
          >
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>Resumo de Vendas</span>
          </button>

          <button
            onClick={() => handleEnviarMensagem('Quais produtos estão com estoque baixo?')}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 whitespace-nowrap flex items-center gap-1.5 transition border border-slate-700"
          >
            <Package className="w-3.5 h-3.5 text-amber-400" />
            <span>Alerta de Estoque</span>
          </button>

          <button
            onClick={() => handleEnviarMensagem('Quanto tenho a receber em fiado?')}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 whitespace-nowrap flex items-center gap-1.5 transition border border-slate-700"
          >
            <DollarSign className="w-3.5 h-3.5 text-indigo-400" />
            <span>Total em Fiado</span>
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleEnviarMensagem();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            placeholder="Digite uma pergunta para a Rubi..."
            value={inputTexto}
            onChange={(e) => setInputTexto(e.target.value)}
            style={{
              color: '#ffffff',
              WebkitTextFillColor: '#ffffff',
              caretColor: '#ffffff'
            }}
            className="flex-1 rubi-input-desktop bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-xs text-white !text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={!inputTexto.trim() || pensando}
            className="p-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 disabled:opacity-50 transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
      </div>
    </div>
  );
};
