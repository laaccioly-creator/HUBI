import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  Bot,
  User,
  TrendingUp,
  Package,
  DollarSign
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface MensagemIA {
  id: string;
  remetente: 'user' | 'kai';
  texto: string;
  data: Date;
}

export const KaiAssistantPage: React.FC = () => {
  const { loja } = useAuth();
  const [mensagens, setMensagens] = useState<MensagemIA[]>([
    {
      id: '1',
      remetente: 'kai',
      texto: `Olá! Sou o **Kai**, seu assistente inteligente no **HUBI**. 🚀\n\nPosso te ajudar com perguntas sobre suas vendas de hoje, estoque baixo, produtos mais vendidos ou calcular seu fluxo de caixa.\n\nComo posso ajudar o seu negócio hoje?`,
      data: new Date()
    }
  ]);
  const [inputTexto, setInputTexto] = useState<string>('');
  const [pensando, setPensando] = useState<boolean>(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      // 1. Coletar dados da loja em tempo real para alimentar a IA
      const { data: pedidos } = await supabase
        .from('pedidos')
        .select('*')
        .eq('loja_id', loja.id)
        .eq('status', 'confirmado');

      const { data: produtos } = await supabase
        .from('produtos')
        .select('*')
        .eq('loja_id', loja.id)
        .eq('ativo', true);

      const { data: clientes } = await supabase
        .from('clientes')
        .select('*')
        .eq('loja_id', loja.id);

      const faturamento = pedidos?.reduce((acc, p) => acc + Number(p.valor_total || 0), 0) || 0;
      const totalPedidos = pedidos?.length || 0;
      const produtosAlerta = produtos?.filter(p => Number(p.quantidade_estoque) <= Number(p.estoque_minimo_alerta)) || [];
      const totalFiado = clientes?.reduce((acc, c) => acc + Number(c.saldo_devedor_fiado || 0), 0) || 0;

      // Resposta inteligente baseada nos dados
      let resposta = '';
      const pLower = pergunta.toLowerCase();

      if (pLower.includes('venda') || pLower.includes('faturamento') || pLower.includes('hoje')) {
        resposta = `📊 **Resumo de Vendas & Faturamento:**\n\n• **Faturamento Total:** R$ ${faturamento.toFixed(2)}\n• **Volume de Vendas:** ${totalPedidos} pedidos confirmados\n• **Ticket Médio:** R$ ${(totalPedidos > 0 ? faturamento / totalPedidos : 0).toFixed(2)}\n\nSuas vendas estão com bom desempenho! Quer uma dica para aumentar o ticket médio oferecendo combos?`;
      } else if (pLower.includes('estoque') || pLower.includes('baixo') || pLower.includes('acabando')) {
        if (produtosAlerta.length > 0) {
          const listaAlerta = produtosAlerta.slice(0, 3).map(p => `• **${p.nome}**: restam apenas ${p.quantidade_estoque} un`).join('\n');
          resposta = `⚠️ **Atenção ao Estoque:**\n\nVocê possui **${produtosAlerta.length} produto(s)** com estoque no limite:\n\n${listaAlerta}\n\nRecomendo fazer um pedido aos fornecedores para não perder vendas!`;
        } else {
          resposta = `✅ **Estoque Regularizado!**\n\nTodos os seus ${produtos?.length || 0} produtos cadastrados estão com quantidades acima do nível mínimo de alerta.`;
        }
      } else if (pLower.includes('fiado') || pLower.includes('devedor') || pLower.includes('cobrar')) {
        resposta = `💰 **Controle de Fiado:**\n\nAtualmente há um total de **R$ ${totalFiado.toFixed(2)}** em haver com clientes.\n\nVocê pode ir na aba **Clientes & Fiado** para disparar lembretes amigáveis direto pelo WhatsApp em 1 clique!`;
      } else {
        resposta = `Entendido! Para a sua loja **${loja.nome_fantasia}**, temos atualmente:\n\n• **${produtos?.length || 0}** produtos ativos\n• **${totalPedidos}** vendas fechadas\n• **${clientes?.length || 0}** clientes cadastrados\n\nPosso detalhar qualquer um desses relatórios para você. O que prefere ver agora?`;
      }

      setTimeout(() => {
        setMensagens(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            remetente: 'kai',
            texto: resposta,
            data: new Date()
          }
        ]);
        setPensando(false);
      }, 700);
    } catch (e) {
      setPensando(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <span>Kai - Assistente de Inteligência Artificial</span>
              <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-bold px-1.5 py-0.5 rounded border border-indigo-500/30">
                HUBI AI
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">Pergunte sobre faturamento, produtos, alertas de estoque e dicas de crescimento.</p>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-4xl mx-auto w-full">
        {mensagens.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 ${msg.remetente === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.remetente === 'kai' && (
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
            <span>Kai está analisando os dados da sua loja...</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Sugestões Rápidas & Input */}
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
            placeholder="Digite uma pergunta para o Kai..."
            value={inputTexto}
            onChange={(e) => setInputTexto(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
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
  );
};
