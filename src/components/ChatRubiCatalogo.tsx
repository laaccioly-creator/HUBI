import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, X, Bot, User, MessageCircle, HelpCircle, Loader2 } from 'lucide-react';
import { responderPerguntaClienteCatalogo, ContextoLojaCatalogo } from '../services/rubiCatalogoService';

interface MensagemChat {
  id: string;
  remetente: 'user' | 'rubi';
  texto: string;
  data: Date;
}

interface ChatRubiCatalogoProps {
  contexto: ContextoLojaCatalogo;
}

export const ChatRubiCatalogo: React.FC<ChatRubiCatalogoProps> = ({ contexto }) => {
  const [aberto, setAberto] = useState<boolean>(false);
  const [inputTexto, setInputTexto] = useState<string>('');
  const [pensando, setPensando] = useState<boolean>(false);
  const endRef = useRef<HTMLDivElement>(null);

  const nomeLoja = contexto.loja.nome_fantasia || 'nossa loja';

  const [mensagens, setMensagens] = useState<MensagemChat[]>([
    {
      id: '1',
      remetente: 'rubi',
      texto: `Olá! Sou a **Rubi**, assistente virtual da **${nomeLoja}**! ✨\n\nEstou aqui para tirar qualquer dúvida sobre nossos produtos, preços de atacado, formas de entrega e como fechar seu pedido.\n\nComo posso te ajudar hoje?`,
      data: new Date()
    }
  ]);

  useEffect(() => {
    if (aberto) {
      setTimeout(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [mensagens, aberto]);

  const enviarMensagem = async (textoPersonalizado?: string) => {
    const texto = (textoPersonalizado || inputTexto).trim();
    if (!texto || pensando) return;

    const msgUsuario: MensagemChat = {
      id: Date.now().toString(),
      remetente: 'user',
      texto,
      data: new Date()
    };

    setMensagens(prev => [...prev, msgUsuario]);
    setInputTexto('');
    setPensando(true);

    try {
      const respostaRubi = await responderPerguntaClienteCatalogo(texto, contexto);
      const msgRubi: MensagemChat = {
        id: (Date.now() + 1).toString(),
        remetente: 'rubi',
        texto: respostaRubi,
        data: new Date()
      };
      setMensagens(prev => [...prev, msgRubi]);
    } catch (e) {
      console.error('Erro Rubi Catálogo:', e);
      setMensagens(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          remetente: 'rubi',
          texto: 'Tive um pequeno contratempo, mas estou aqui! Pode reformular sua pergunta ou me perguntar sobre atacado, entregas e pagamentos.',
          data: new Date()
        }
      ]);
    } finally {
      setPensando(false);
    }
  };

  const duvidasRapidas = [
    'Como funciona o atacado?',
    'Quais as formas de pagamento?',
    'Como funciona a entrega?',
    'Como usar cupom de desconto?'
  ];

  return (
    <>
      {/* BOTÃO FLUTUANTE DA RUBI IA */}
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="fixed bottom-20 sm:bottom-6 left-4 z-40 bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 hover:from-emerald-400 hover:to-sky-400 text-white font-bold p-3 sm:px-4 sm:py-3 rounded-full shadow-2xl flex items-center gap-2.5 transition-all duration-300 transform hover:scale-105 group border border-white/20"
        title="Ajuda e Dúvidas com Rubi IA"
      >
        <div className="relative">
          <Sparkles className="w-5 h-5 animate-pulse text-amber-200" />
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-100"></span>
          </span>
        </div>
        <span className="hidden sm:inline text-xs font-black tracking-wide drop-shadow-sm">
          Dúvidas? Fale com a Rubi ✨
        </span>
      </button>

      {/* MODAL / DRAWER DE CHAT */}
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-start sm:pl-6 bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 w-full sm:max-w-md h-[82vh] sm:h-[620px] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-6">
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950/60 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-sm text-slate-100">Rubi IA</span>
                    <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-500/30">
                      ONLINE
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 block truncate max-w-[200px]">
                    Assistente Virtual {nomeLoja}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
              {mensagens.map(msg => (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 ${msg.remetente === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.remetente === 'rubi' && (
                    <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl p-3.5 leading-relaxed whitespace-pre-wrap ${
                      msg.remetente === 'user'
                        ? 'bg-emerald-600 text-white rounded-br-xs shadow-md'
                        : 'bg-slate-800 text-slate-200 rounded-bl-xs border border-slate-700/80 shadow-xs'
                    }`}
                  >
                    {msg.texto}
                  </div>

                  {msg.remetente === 'user' && (
                    <div className="w-7 h-7 rounded-xl bg-emerald-700 text-emerald-200 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              ))}

              {pensando && (
                <div className="flex gap-2.5 items-center text-slate-400 italic">
                  <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  </div>
                  <div className="bg-slate-800 border border-slate-700 rounded-2xl px-3 py-2 text-[11px]">
                    Rubi está digitando...
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Dúvidas Rápidas */}
            <div className="px-3 pt-2 pb-1 border-t border-slate-800/80 overflow-x-auto flex gap-1.5 no-scrollbar">
              {duvidasRapidas.map((duvida, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => enviarMensagem(duvida)}
                  disabled={pensando}
                  className="whitespace-nowrap px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-emerald-300 text-[11px] font-medium border border-slate-700 transition cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {duvida}
                </button>
              ))}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                enviarMensagem();
              }}
              className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Pergunte sobre atacado, frete, produtos..."
                value={inputTexto}
                onChange={(e) => setInputTexto(e.target.value)}
                disabled={pensando}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
              <button
                type="submit"
                disabled={!inputTexto.trim() || pensando}
                className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-40 cursor-pointer"
                title="Enviar"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
