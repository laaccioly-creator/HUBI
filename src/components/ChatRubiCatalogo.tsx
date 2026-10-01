import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  X,
  Bot,
  User,
  Loader2,
  Maximize2,
  Minimize2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  ShoppingBag,
  Plus,
  Check,
  CheckCircle2,
  Info,
  Eye,
  Package,
  ExternalLink,
  Radio
} from 'lucide-react';
import { audioService } from '../services/audioService';
import {
  responderPerguntaClienteCatalogo,
  ContextoLojaCatalogo,
  PERSONAS_SEGMENTO
} from '../services/rubiCatalogoService';
import { DescricaoFormatadaProduto } from './DescricaoFormatadaProduto';
import { Produto, VariacaoProduto } from '../types';

interface MensagemChat {
  id: string;
  remetente: 'user' | 'rubi';
  texto: string;
  data: Date;
  produtosSugeridos?: Produto[];
  adicionadoPorVoz?: boolean;
}

interface ChatRubiCatalogoProps {
  contexto: ContextoLojaCatalogo;
  onAdicionarAoCarrinho?: (produto: Produto, variacao?: VariacaoProduto | null, quantidade?: number) => void;
  onAbrirModalVariacao?: (produto: Produto) => void;
  onClienteAtualizado?: (clienteData: { nome?: string; telefone?: string; endereco?: string }) => void;
  corTema?: string;
  mensagemExterna?: { id: number; texto: string; produto?: Produto } | null;
  abertoExterno?: boolean;
  onFecharExterno?: () => void;
}

const formatarNegrito = (texto: string) => {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return partes.map((parte, i) => {
    if (parte.startsWith('**') && parte.endsWith('**')) {
      return (
        <strong key={i} className="font-extrabold text-slate-100">
          {parte.slice(2, -2)}
        </strong>
      );
    }
    return parte;
  });
};

const renderizarConteudoMensagem = (texto: string) => {
  const linhas = texto.split('\n');

  return (
    <div className="space-y-1.5 leading-relaxed">
      {linhas.map((linha, idx) => {
        if (!linha.trim()) {
          return <div key={idx} className="h-1" />;
        }

        // Detectar links markdown [Texto](URL)
        const matchLink = linha.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (matchLink) {
          const textoAntes = linha.slice(0, matchLink.index);
          const linkTexto = matchLink[1];
          const linkUrl = matchLink[2];
          const textoDepois = linha.slice((matchLink.index || 0) + matchLink[0].length);

          const ehRastreio = linkUrl.includes('/order-tracking/');
          const ehWhatsApp = linkUrl.includes('wa.me');

          return (
            <div key={idx} className="space-y-2 my-1">
              {textoAntes && <p>{formatarNegrito(textoAntes)}</p>}
              <a
                href={linkUrl}
                target={ehRastreio ? '_self' : '_blank'}
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer ${
                  ehRastreio
                    ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {ehRastreio ? <Package className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
                <span>{linkTexto}</span>
              </a>
              {textoDepois && <p>{formatarNegrito(textoDepois)}</p>}
            </div>
          );
        }

        return <p key={idx}>{formatarNegrito(linha)}</p>;
      })}
    </div>
  );
};

export const ChatRubiCatalogo: React.FC<ChatRubiCatalogoProps> = ({
  contexto,
  onAdicionarAoCarrinho,
  onAbrirModalVariacao,
  onClienteAtualizado,
  corTema = '#10b981',
  mensagemExterna,
  abertoExterno,
  onFecharExterno
}) => {
  const [aberto, setAberto] = useState<boolean>(false);
  const [telaCheia, setTelaCheia] = useState<boolean>(false);
  const [inputTexto, setInputTexto] = useState<string>('');
  const [pensando, setPensando] = useState<boolean>(false);
  const [ultimoProdutoSugerido, setUltimoProdutoSugerido] = useState<Produto | null>(null);
  const [produtoModalDetalhe, setProdutoModalDetalhe] = useState<Produto | null>(null);

  // Nome do cliente e identificação
  const [nomeCliente, setNomeCliente] = useState<string>(
    contexto.nomeClienteAtual || contexto.clienteAtual?.nome || ''
  );

  // Controle de Voz (Speech-to-Text - Microfone)
  const [escutandoVoz, setEscutandoVoz] = useState<boolean>(false);
  const [suporteVozSTT, setSuporteVozSTT] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);

  // Modo Sempre Atenta (Hands-free como a Alexa: chamada por voz "Rubi...")
  const [modoWakeWord, setModoWakeWord] = useState<boolean>(() => {
    try {
      return localStorage.getItem('hubi_rubi_wake_word') === 'true';
    } catch {
      return false;
    }
  });
  const modoWakeWordRef = useRef<boolean>(modoWakeWord);
  const rubiFalandoRef = useRef<boolean>(false);

  useEffect(() => {
    modoWakeWordRef.current = modoWakeWord;
    try {
      localStorage.setItem('hubi_rubi_wake_word', modoWakeWord ? 'true' : 'false');
    } catch {}
  }, [modoWakeWord]);

  // Refs para controle resiliente de fala (evita corte abrupto e aguarda término da frase)
  const deveContinuarOuvindoRef = useRef<boolean>(false);
  const silencioTimerRef = useRef<any>(null);
  const textoCapturadoRef = useRef<string>('');

  // Manter textoCapturadoRef sincronizado
  useEffect(() => {
    textoCapturadoRef.current = inputTexto;
  }, [inputTexto]);

  // Controle de Áudio (Text-to-Speech - Rubi falando)
  const [audioAtivo, setAudioAtivo] = useState<boolean>(true);
  const audioAtivoRef = useRef<boolean>(true);
  const [rubiFalando, setRubiFalando] = useState<boolean>(false);

  useEffect(() => {
    audioAtivoRef.current = audioAtivo;
  }, [audioAtivo]);

  // Controle de diálogo ativo vs. repouso e prevenção de eco
  const pensandoRef = useRef<boolean>(false);
  const ultimoMomentoInteracaoRef = useRef<number>(0);
  const ultimoChimeRef = useRef<number>(0);

  useEffect(() => {
    pensandoRef.current = pensando;
  }, [pensando]);

  // Notificação / Toast visual dentro do chat
  const [toastNotificacao, setToastNotificacao] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);

  const nomeLoja = contexto.loja.nome_fantasia || 'nossa loja';
  const perfilNegocio = contexto.loja.configuracoes_extras?.perfil_negocio || {};
  const segmento = perfilNegocio.segmento || 'geral';
  const personaInfo = PERSONAS_SEGMENTO[segmento] || PERSONAS_SEGMENTO.geral;

  // Mensagem inicial acolhedora personalizada
  const [mensagens, setMensagens] = useState<MensagemChat[]>(() => {
    const nomeInicial = contexto.nomeClienteAtual || contexto.clienteAtual?.nome || '';
    if (nomeInicial) {
      return [
        {
          id: '1',
          remetente: 'rubi',
          texto: `Olá, **${nomeInicial}**! Que alegria ter você aqui na **${nomeLoja}**! ✨\n\nSou a **Rubi**, sua ${personaInfo.papel.toLowerCase()}. O que você gostaria de ver hoje? Pode me pedir produtos, novidades ou tirar qualquer dúvida por texto ou por voz!`,
          data: new Date()
        }
      ];
    }
    return [
      {
        id: '1',
        remetente: 'rubi',
        texto: `Olá! Seja muito bem-vindo(a) à **${nomeLoja}**! ✨\n\nSou a **Rubi**, sua ${personaInfo.papel.toLowerCase()}. Antes de começarmos, **como posso te chamar? Me diz o seu nome!** 😊\n\n*(Você pode falar tocando no microfone ou digitar aqui embaixo!)*`,
        data: new Date()
      }
    ];
  });

  // Atualizar nome se contexto mudar
  useEffect(() => {
    if (contexto.nomeClienteAtual && contexto.nomeClienteAtual !== nomeCliente) {
      setNomeCliente(contexto.nomeClienteAtual);
    }
  }, [contexto.nomeClienteAtual]);

  const pararGravacaoVoz = (enviarSeTiverTexto: boolean = false) => {
    deveContinuarOuvindoRef.current = false;
    if (silencioTimerRef.current) {
      clearTimeout(silencioTimerRef.current);
      silencioTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setEscutandoVoz(false);

    if (enviarSeTiverTexto && textoCapturadoRef.current.trim()) {
      const aEnviar = textoCapturadoRef.current.trim();
      textoCapturadoRef.current = '';
      setInputTexto('');
      enviarMensagem(aEnviar);
    }
  };

  // Inicializar Web Speech Recognition (Microfone Contínuo e Sem Cortes)
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      setSuporteVozSTT(true);
      try {
        const recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.continuous = true; // ESSENCIAL: Mantém escuta contínua, sem cortar nas pausas naturais da fala
        recognition.interimResults = true; // Transcreve em tempo real

        recognition.onstart = () => {
          setEscutandoVoz(true);
        };

        recognition.onresult = (event: any) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = 0; i < event.results.length; i++) {
            const item = event.results[i];
            if (item.isFinal) {
              finalTranscript += (finalTranscript && !finalTranscript.endsWith(' ') ? ' ' : '') + item[0].transcript.trim();
            } else {
              interimTranscript += (interimTranscript && !interimTranscript.endsWith(' ') ? ' ' : '') + item[0].transcript.trim();
            }
          }

          const textoCompleto = [finalTranscript, interimTranscript].filter(Boolean).join(' ').trim();
          if (!textoCompleto) return;

          // Se a própria Rubi estiver falando ou processando, ignora captação para evitar eco
          if (rubiFalandoRef.current || pensandoRef.current) return;

          // 1. RECONHECIMENTO DE WAKE WORD ("RUBI...") COMO A ALEXA
          const matchWake = textoCompleto.match(/\b(?:ei\s+|ol[aá]\s+|oi\s+)?(rubi|ruby|rubie|rubee)\b/i);

          if (matchWake) {
            // Toca chime suave de despertar (com throttle de 3s para não tocar repetido nos chunks)
            const agora = Date.now();
            if (agora - ultimoChimeRef.current > 3000) {
              audioService.playRubiWakeWordSound();
              ultimoChimeRef.current = agora;
            }
            setAberto(true);

            const fimWake = (matchWake.index || 0) + matchWake[0].length;
            const comando = textoCompleto.slice(fimWake).replace(/^[,:\s]+/, '').trim();

            if (comando.length >= 3) {
              // Usuário emendou o comando logo após dizer Rubi (ex: "Rubi, quais os produtos em promoção?")
              textoCapturadoRef.current = comando;
              setInputTexto(comando);

              // Reiniciar timer de silêncio: 2 segundos de pausa após terminar a fala enviam a mensagem
              if (silencioTimerRef.current) {
                clearTimeout(silencioTimerRef.current);
              }
              silencioTimerRef.current = setTimeout(() => {
                const aEnviar = textoCapturadoRef.current.trim();
                if (aEnviar.length >= 2 && !rubiFalandoRef.current && !pensandoRef.current) {
                  textoCapturadoRef.current = '';
                  setInputTexto('');
                  try {
                    recognitionRef.current?.stop();
                  } catch {}
                  enviarMensagem(aEnviar);
                }
              }, 2000);
            } else {
              // O usuário disse apenas "Rubi" (ou ainda está no início da frase)
              // Concede 1.4s para verificar se ele vai complementar a frase ou se chamou só por "Rubi"
              if (silencioTimerRef.current) {
                clearTimeout(silencioTimerRef.current);
              }
              silencioTimerRef.current = setTimeout(() => {
                const comandoPendente = textoCapturadoRef.current.trim();
                if (!comandoPendente || comandoPendente.length < 3) {
                  const tempoDecorrido = Date.now() - ultimoMomentoInteracaoRef.current;
                  const estavaDormindo = tempoDecorrido > 18000; // Mais de 18s em repouso

                  if (estavaDormindo) {
                    const respostaAcordada = 'Oi! 😊';
                    setMensagens(prev => [
                      ...prev,
                      {
                        id: (Date.now() + 1).toString(),
                        remetente: 'rubi',
                        texto: respostaAcordada,
                        data: new Date()
                      }
                    ]);
                    falarTexto('Oi!');
                    mostrarToastFeedback('Rubi pronta! Pode falar...');
                  }
                  ultimoMomentoInteracaoRef.current = Date.now();
                  textoCapturadoRef.current = '';
                  setInputTexto('');
                  try {
                    recognitionRef.current?.stop();
                  } catch {}
                }
              }, 1400);
            }
            return;
          }

          // 2. FALA CONTÍNUA / COMANDO DO CLIENTE (SEM CITAR "RUBI" NOVAMENTE)
          textoCapturadoRef.current = textoCompleto;
          setInputTexto(textoCompleto);

          // Reiniciar timer de silêncio: concede 2 segundos de pausa após terminar a fala para enviar automaticamente
          if (silencioTimerRef.current) {
            clearTimeout(silencioTimerRef.current);
          }
          silencioTimerRef.current = setTimeout(() => {
            const aEnviar = textoCapturadoRef.current.trim();
            if (aEnviar.length >= 2 && !rubiFalandoRef.current && !pensandoRef.current) {
              textoCapturadoRef.current = '';
              setInputTexto('');
              try {
                recognitionRef.current?.stop();
              } catch {}
              enviarMensagem(aEnviar);
            }
          }, 2000);
        };

        recognition.onerror = (event: any) => {
          console.warn('Aviso no microfone Rubi IA:', event.error);
          if (event.error === 'no-speech') {
            return;
          }
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            deveContinuarOuvindoRef.current = false;
            setModoWakeWord(false);
            setEscutandoVoz(false);
            mostrarToastFeedback('Permissão de microfone negada. Ative o microfone nas permissões do navegador.');
            return;
          }
        };

        recognition.onend = () => {
          setEscutandoVoz(false);
          const textoPendente = textoCapturadoRef.current.trim();

          // Se o recognition encerrou e tínhamos comando falado pendente:
          if (textoPendente.length >= 2 && !rubiFalandoRef.current && !pensandoRef.current) {
            if (silencioTimerRef.current) {
              clearTimeout(silencioTimerRef.current);
              silencioTimerRef.current = null;
            }
            textoCapturadoRef.current = '';
            setInputTexto('');
            enviarMensagem(textoPendente);
            return;
          }

          if (deveContinuarOuvindoRef.current) {
            try {
              recognition.start();
            } catch {}
          } else if (modoWakeWordRef.current && !rubiFalandoRef.current && !pensandoRef.current) {
            // No modo sempre atenta, reinicia a escuta de fundo em loop contínuo
            setTimeout(() => {
              if (modoWakeWordRef.current && !rubiFalandoRef.current && !pensandoRef.current) {
                try {
                  recognition.start();
                } catch {}
              }
            }, 300);
          }
        };

        recognitionRef.current = recognition;

        // Se o modo wake word já estiver salvo como ativo, inicia a escuta
        if (modoWakeWordRef.current) {
          try {
            recognition.start();
          } catch {}
        }
      } catch (err) {
        console.warn('Falha ao instanciar SpeechRecognition:', err);
      }
    }
  }, []);

  const alternarModoWakeWord = () => {
    if (!recognitionRef.current) {
      mostrarToastFeedback('Seu navegador não suporta reconhecimento de voz contínuo.');
      return;
    }

    if (modoWakeWord) {
      setModoWakeWord(false);
      modoWakeWordRef.current = false;
      deveContinuarOuvindoRef.current = false;
      try {
        recognitionRef.current.stop();
      } catch {}
      mostrarToastFeedback('Modo Viva-Voz ("Rubi...") desativado.');
    } else {
      setModoWakeWord(true);
      modoWakeWordRef.current = true;
      audioService.playRubiWakeWordSound();
      mostrarToastFeedback('Modo Sempre Atenta ativado! Basta dizer "Rubi..." a qualquer momento.');
      try {
        recognitionRef.current.start();
      } catch {}
    }
  };

  const alternarGravacaoVoz = () => {
    if (!recognitionRef.current) {
      mostrarToastFeedback('Reconhecimento de voz não suportado neste navegador. Digite sua mensagem!');
      return;
    }

    if (escutandoVoz) {
      pararGravacaoVoz(true);
    } else {
      pararFalaRubi();
      deveContinuarOuvindoRef.current = true;
      textoCapturadoRef.current = '';
      setInputTexto('');
      setEscutandoVoz(true);
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.warn('Erro ao acionar microfone:', e);
      }
    }
  };

  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [vozesDisponiveis, setVozesDisponiveis] = useState<SpeechSynthesisVoice[]>([]);

  // Carregar e monitorar vozes do sistema (SpeechSynthesis)
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const carregarVozes = () => {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length > 0) {
        setVozesDisponiveis(v);
      }
    };

    carregarVozes();
    window.speechSynthesis.onvoiceschanged = carregarVozes;

    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // Seleciona preferencialmente vozes femininas em português para a persona Rubi
  const selecionarMelhorVozFeminina = (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
    if (!voices || voices.length === 0) return null;

    // Filtra vozes em português (Brasil preferencialmente)
    const vozesPtBr = voices.filter(v => v.lang === 'pt-BR' || v.lang === 'pt_BR');
    const vozesPt = vozesPtBr.length > 0 ? vozesPtBr : voices.filter(v => v.lang.startsWith('pt'));

    if (vozesPt.length === 0) return null;

    // Nomes femininos conhecidos nos motores de TTS (Windows/Edge, Google/Android, Apple/iOS)
    const nomesFemininos = [
      'francisca', // Microsoft Francisca (Natural) - excelente voz feminina no Edge/Windows
      'maria',     // Microsoft Maria (Windows)
      'leticia',   // Microsoft Leticia
      'luciana',   // iOS / macOS / Safari / Siri
      'fernanda',
      'vitória',
      'vitoria',
      'heloisa',
      'camila',
      'yara',
      'brenda',
      'raquel',
      'joana',
      'female',
      'feminina',
      'mulher',
      'zira'
    ];

    const nomesMasculinos = [
      'antonio', 'antônio', 'daniel', 'felipe', 'thiago', 'tiago',
      'ricardo', 'helio', 'hélio', 'male', 'masculino', 'homem', 'julio', 'júlio', 'yuri', 'hector'
    ];

    // 1ª Tentativa: Voz em português com nome explicitamente feminino
    for (const pista of nomesFemininos) {
      const voz = vozesPt.find(v => {
        const n = v.name.toLowerCase();
        return n.includes(pista) && !nomesMasculinos.some(m => n.includes(m));
      });
      if (voz) return voz;
    }

    // 2ª Tentativa: Voz em português que NÃO contenha nomes masculinos (ex: Google português do Brasil)
    const vozNaoMasculina = vozesPt.find(v => {
      const n = v.name.toLowerCase();
      return !nomesMasculinos.some(m => n.includes(m));
    });
    if (vozNaoMasculina) return vozNaoMasculina;

    // 3ª Tentativa: Qualquer voz em português disponível
    return vozesPt[0];
  };

  // Síntese de Voz Humanizada (Pronúncia natural de valores e termos do dia a dia)
  const limparTextoParaAudio = (texto: string): string => {
    return texto
      .replace(/\[PRODUTOS(?:_RECOMENDADOS)?:\s*[^\]]+\]/gi, '') // Remove tags de produtos
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [Texto do link](url) -> Texto do link
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove negrito
      .replace(/\*([^*]+)\*/g, '$1') // Remove itálico
      .replace(/#{1,6}\s*/g, '') // Remove títulos markdown
      .replace(/•|\*|-/g, '') // Remove bullets
      .replace(/R\$\s*(\d+)[.,](\d{2})/g, (_m, reais, centavos) => {
        // Humanização de preços falados
        const cent = parseInt(centavos, 10);
        if (cent === 0) return `${reais} reais`;
        return `${reais} e ${centavos}`;
      })
      .replace(/R\$\s*(\d+)/g, '$1 reais')
      .replace(/\bWhatsApp\b/gi, 'WhatsApp')
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // Remove emojis para a voz não falar os nomes
      .replace(/\n\s*\n/g, '. ')
      .replace(/\n/g, ', ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  const falarTexto = (texto: string, forcar: boolean = false) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (!audioAtivoRef.current && !forcar) return;

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      const textoLimpo = limparTextoParaAudio(texto);
      if (!textoLimpo) return;

      const utterance = new SpeechSynthesisUtterance(textoLimpo);
      currentUtteranceRef.current = utterance; // Evita Garbage Collection no Chromium
      utterance.lang = 'pt-BR';
      utterance.rate = 1.02; // Ritmo ágil, conversacional e humano
      utterance.pitch = 1.08; // Timbre acolhedor, simpático e natural

      const voices = vozesDisponiveis.length > 0 ? vozesDisponiveis : window.speechSynthesis.getVoices();
      const ptVoice = selecionarMelhorVozFeminina(voices);
      if (ptVoice) {
        utterance.voice = ptVoice;
      }

      utterance.onstart = () => {
        setRubiFalando(true);
        rubiFalandoRef.current = true;
        // Pausa temporariamente o microfone para a Rubi não escutar sua própria voz
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch {}
        }
      };

      utterance.onend = () => {
        setRubiFalando(false);
        rubiFalandoRef.current = false;
        currentUtteranceRef.current = null;
        ultimoMomentoInteracaoRef.current = Date.now();
        // Retoma a escuta atenta do Wake Word "Rubi..." assim que terminar de responder
        if (modoWakeWordRef.current && recognitionRef.current) {
          setTimeout(() => {
            if (modoWakeWordRef.current && !rubiFalandoRef.current && !pensandoRef.current) {
              try {
                recognitionRef.current.start();
              } catch {}
            }
          }, 350);
        }
      };

      utterance.onerror = () => {
        setRubiFalando(false);
        rubiFalandoRef.current = false;
        currentUtteranceRef.current = null;
        ultimoMomentoInteracaoRef.current = Date.now();
        if (modoWakeWordRef.current && recognitionRef.current) {
          setTimeout(() => {
            if (modoWakeWordRef.current && !rubiFalandoRef.current && !pensandoRef.current) {
              try {
                recognitionRef.current.start();
              } catch {}
            }
          }, 350);
        }
      };

      // Pequeno timeout de 50ms para desengasgar o cancel() prévio em navegadores Chromium
      setTimeout(() => {
        try {
          window.speechSynthesis.resume();
          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.warn('Erro ao reproduzir voz:', e);
        }
      }, 50);
    } catch (err) {
      console.warn('Falha na síntese de voz da Rubi:', err);
      setRubiFalando(false);
      rubiFalandoRef.current = false;
    }
  };

  const pararFalaRubi = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setRubiFalando(false);
      currentUtteranceRef.current = null;
    }
  };

  // Parar fala ao fechar chat
  useEffect(() => {
    if (!aberto) {
      pararFalaRubi();
      pararGravacaoVoz(false);
    }
  }, [aberto]);

  const mostrarToastFeedback = (msg: string) => {
    setToastNotificacao(msg);
    setTimeout(() => {
      setToastNotificacao(null);
    }, 3500);
  };

  useEffect(() => {
    if (aberto) {
      setTimeout(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [mensagens, aberto, pensando]);

  // Envio de mensagem (por clique ou voz)
  const enviarMensagem = async (textoPersonalizado?: string, produtoAlvo?: Produto | null) => {
    const texto = (textoPersonalizado || inputTexto).trim();
    if (!texto || pensandoRef.current) return;

    pensandoRef.current = true;
    pararFalaRubi();
    pararGravacaoVoz(false);

    if (produtoAlvo) {
      setUltimoProdutoSugerido(produtoAlvo);
    }

    const msgUsuario: MensagemChat = {
      id: Date.now().toString(),
      remetente: 'user',
      texto,
      data: new Date()
    };

    setMensagens(prev => [...prev, msgUsuario]);
    setInputTexto('');
    setPensando(true);
    ultimoMomentoInteracaoRef.current = Date.now();

    try {
      const contextoAtualizado: ContextoLojaCatalogo = {
        ...contexto,
        nomeClienteAtual: nomeCliente,
        ultimoProdutoSugerido: produtoAlvo || ultimoProdutoSugerido,
        produtoConsultado: produtoAlvo || undefined,
        historicoMensagens: mensagens.slice(-6).map(m => ({
          autor: m.remetente === 'user' ? 'cliente' : 'rubi',
          texto: m.texto
        })),
        produtosJaSugeridosIds: Array.from(
          new Set(
            mensagens
              .flatMap(m => m.produtosSugeridos?.map(p => p.id) || [])
              .filter(Boolean) as string[]
          )
        )
      };

      const respostaRubi = await responderPerguntaClienteCatalogo(texto, contextoAtualizado);

      // Se comando de adicionar à sacola foi detectado
      if (respostaRubi.comandoSacola) {
        const { produto, quantidade } = respostaRubi.comandoSacola;
        if (onAdicionarAoCarrinho) {
          onAdicionarAoCarrinho(produto, null, quantidade);
          mostrarToastFeedback(`"${produto.nome}" adicionado à sacola! 🛍️`);
        }
      }

      // Se novos dados de cadastro foram detectados
      if (respostaRubi.dadosCadastroDetectados) {
        if (respostaRubi.dadosCadastroDetectados.nome) {
          setNomeCliente(respostaRubi.dadosCadastroDetectados.nome);
        }
        if (onClienteAtualizado) {
          onClienteAtualizado(respostaRubi.dadosCadastroDetectados);
        }
      }

      // Se produtos foram sugeridos, guardar o primeiro como referência
      if (respostaRubi.produtosSugeridos && respostaRubi.produtosSugeridos.length > 0) {
        setUltimoProdutoSugerido(respostaRubi.produtosSugeridos[0]);
      }

      const msgRubi: MensagemChat = {
        id: (Date.now() + 1).toString(),
        remetente: 'rubi',
        texto: respostaRubi.texto,
        produtosSugeridos: respostaRubi.produtosSugeridos,
        adicionadoPorVoz: Boolean(respostaRubi.comandoSacola),
        data: new Date()
      };

      setMensagens(prev => [...prev, msgRubi]);

      // Falar a resposta se o áudio estiver ativado
      falarTexto(respostaRubi.texto);
    } catch (e) {
      console.error('Erro Rubi Catálogo:', e);
      const erroTexto = 'Tive um pequeno contratempo, mas estou aqui! Pode me perguntar sobre nossos produtos, atacado, entregas e como fechar o seu pedido.';
      setMensagens(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          remetente: 'rubi',
          texto: erroTexto,
          data: new Date()
        }
      ]);
      falarTexto(erroTexto);
    } finally {
      setPensando(false);
      pensandoRef.current = false;
      ultimoMomentoInteracaoRef.current = Date.now();
    }
  };

  // Suporte a mensagens disparadas externamente (ex: Dúvidas sobre o produto)
  const ultimaMsgExternaProcessadaRef = useRef<number | null>(null);

  useEffect(() => {
    if (abertoExterno) {
      setAberto(true);
    }
  }, [abertoExterno]);

  useEffect(() => {
    if (mensagemExterna && mensagemExterna.id !== ultimaMsgExternaProcessadaRef.current) {
      ultimaMsgExternaProcessadaRef.current = mensagemExterna.id;
      setAberto(true);
      if (mensagemExterna.produto) {
        setUltimoProdutoSugerido(mensagemExterna.produto);
      }
      enviarMensagem(mensagemExterna.texto, mensagemExterna.produto);
    }
  }, [mensagemExterna]);

  const handleAdicionarProdutoClick = (produto: Produto) => {
    if (produto.tem_variacoes && produto.variacoes && produto.variacoes.length > 0) {
      if (onAbrirModalVariacao) {
        onAbrirModalVariacao(produto);
        mostrarToastFeedback(`Selecione a opção desejada para "${produto.nome}"!`);
      }
    } else {
      if (onAdicionarAoCarrinho) {
        onAdicionarAoCarrinho(produto, null, 1);
        mostrarToastFeedback(`"${produto.nome}" adicionado à sacola! 🛍️`);
        falarTexto(`Adicionei ${produto.nome} na sua sacola de compras!`);
      }
    }
  };

  // Perguntas Rápidas (Organizadas em 2 Linhas Fixas, sem scroll horizontal)
  const duvidasRapidas =
    segmento === 'sexshop'
      ? [
          'A embalagem é discreta?',
          'Quais os produtos mais vendidos?',
          'Como funciona a entrega?',
          'Quais as formas de pagamento?'
        ]
      : [
          'Como funciona o atacado?',
          'Quais as formas de pagamento?',
          'Como funciona a entrega?',
          'Como usar cupom de desconto?'
        ];

  return (
    <>
      {/* BOTÃO FLUTUANTE DA RUBI IA */}
      <div className="fixed bottom-20 sm:bottom-6 left-4 z-40 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 hover:from-emerald-400 hover:to-sky-400 text-white font-bold p-3 sm:px-4 sm:py-3 rounded-full shadow-2xl flex items-center gap-2.5 transition-all duration-300 transform hover:scale-105 group border border-white/20 cursor-pointer"
          title="Fale com a Rubi IA por Voz ou Chat"
        >
          <div className="relative">
            <Sparkles className="w-5 h-5 animate-pulse text-amber-200" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-100"></span>
            </span>
          </div>
          <span className="hidden sm:inline text-xs font-black tracking-wide drop-shadow-sm">
            Fale com a Rubi ✨
          </span>
        </button>

        {/* Botão de Modo Sempre Atenta (Alexa / Viva-Voz) no Flutuante */}
        <button
          type="button"
          onClick={alternarModoWakeWord}
          className={`px-3 py-2.5 rounded-full shadow-xl border transition-all duration-300 transform hover:scale-105 cursor-pointer flex items-center gap-1.5 ${
            modoWakeWord
              ? 'bg-emerald-500 text-white border-emerald-300 ring-2 ring-emerald-400/50 animate-pulse'
              : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-700'
          }`}
          title={
            modoWakeWord
              ? "Modo Sempre Atenta ATIVO: Fale 'Rubi...' a qualquer momento!"
              : "Ativar Modo Sempre Atenta (Alexa): Fale 'Rubi...' sem precisar tocar na tela"
          }
        >
          <Radio className={`w-4 h-4 ${modoWakeWord ? 'text-white' : 'text-emerald-400'}`} />
          <span className="text-[11px] font-bold">
            {modoWakeWord ? 'Rubi ouvindo...' : 'Chamar "Rubi"'}
          </span>
        </button>

        {/* Botão de Microfone Direto no Flutuante */}
        <button
          type="button"
          onClick={() => {
            setAberto(true);
            setTimeout(() => {
              alternarGravacaoVoz();
            }, 300);
          }}
          className="bg-slate-900/90 hover:bg-emerald-600 text-emerald-400 hover:text-white p-3 rounded-full shadow-xl border border-slate-700 transition transform hover:scale-105 cursor-pointer"
          title="Falar agora com a Rubi"
        >
          <Mic className="w-4 h-4" />
        </button>
      </div>

      {/* MODAL / DRAWER DE CHAT (JANELA OU TELA CHEIA) */}
      {aberto && (
        <div className={`fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:justify-start ${telaCheia ? 'p-0' : 'sm:pl-6 bg-black/60 backdrop-blur-xs p-0 sm:p-4'} animate-in fade-in`}>
          <div
            className={`bg-slate-900 border border-slate-700 w-full shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${
              telaCheia
                ? 'fixed inset-0 z-[60] h-full max-w-none rounded-none'
                : 'sm:max-w-md h-[85vh] sm:h-[650px] rounded-t-3xl sm:rounded-3xl animate-in slide-in-from-bottom-6'
            }`}
          >
            {/* Header */}
            <div className="p-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950/60 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
                    <Bot className="w-5 h-5" />
                  </div>
                  {rubiFalando && (
                    <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-sm text-slate-100">Rubi IA</span>
                    <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-500/30">
                      {rubiFalando ? 'FALANDO...' : 'ONLINE'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 block truncate max-w-[200px]">
                    {personaInfo.papel} • {nomeLoja}
                  </span>
                </div>
              </div>

              {/* Botões de Ação no Header (Viva-Voz, Áudio, Tela Cheia, Fechar) */}
              <div className="flex items-center gap-1">
                {/* Botão de Modo Sempre Atenta (Wake Word Rubi) */}
                <button
                  type="button"
                  onClick={alternarModoWakeWord}
                  className={`px-2 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
                    modoWakeWord
                      ? 'text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                  title={
                    modoWakeWord
                      ? "Modo Sempre Atenta ATIVO (Diga 'Rubi...' para falar). Clique para desativar."
                      : "Ativar Modo Sempre Atenta (Alexa): Fale 'Rubi...' sem precisar tocar na tela"
                  }
                >
                  <Radio className={`w-3.5 h-3.5 ${modoWakeWord ? 'text-emerald-400 animate-pulse' : ''}`} />
                  <span className="hidden sm:inline text-[11px]">
                    {modoWakeWord ? 'Sempre Atenta' : 'Viva-Voz'}
                  </span>
                </button>

                {/* Botão de Ativar/Desativar Voz (TTS) */}
                <button
                  type="button"
                  onClick={() => {
                    if (audioAtivo) {
                      pararFalaRubi();
                      setAudioAtivo(false);
                      mostrarToastFeedback('Áudio da Rubi desativado.');
                    } else {
                      setAudioAtivo(true);
                      mostrarToastFeedback('Áudio ativado! Falando no seu fone.');
                      falarTexto('Áudio ativado! Estou pronta para falar com você.');
                    }
                  }}
                  className={`p-2 rounded-xl transition cursor-pointer ${
                    audioAtivo
                      ? 'text-emerald-400 hover:bg-emerald-500/10'
                      : 'text-slate-500 hover:bg-slate-800'
                  }`}
                  title={audioAtivo ? 'Áudio Ativado (Rubi responde falando). Clique para mutar.' : 'Áudio Mudo. Clique para ativar voz da Rubi.'}
                >
                  {audioAtivo ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>

                {/* Botão Tela Cheia / Restaurar */}
                <button
                  type="button"
                  onClick={() => setTelaCheia(!telaCheia)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
                  title={telaCheia ? 'Restaurar Janela' : 'Abrir em Tela Cheia'}
                >
                  {telaCheia ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>

                {/* Fechar */}
                <button
                  type="button"
                  onClick={() => {
                    setAberto(false);
                    if (onFecharExterno) onFecharExterno();
                  }}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Banner Dinâmico do Modo Sempre Atenta (Alexa) */}
            {modoWakeWord && (
              <div className="bg-emerald-950/70 border-b border-emerald-500/30 px-3.5 py-1.5 flex items-center justify-between text-[11px] text-emerald-300 animate-in fade-in">
                <div className="flex items-center gap-1.5">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span>Modo Sempre Atenta ativo: Diga <strong>"Rubi, ..."</strong> para falar!</span>
                </div>
                <button
                  type="button"
                  onClick={alternarModoWakeWord}
                  className="text-[10px] text-slate-400 hover:text-rose-300 underline cursor-pointer"
                  title="Desativar escuta contínua de fundo"
                >
                  Desativar
                </button>
              </div>
            )}

            {/* Toast de Notificação interno */}
            {toastNotificacao && (
              <div className="bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 flex items-center justify-center gap-1.5 shadow-md animate-in slide-in-from-top-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{toastNotificacao}</span>
              </div>
            )}

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {mensagens.map(msg => (
                <div key={msg.id} className="space-y-2.5">
                  <div className={`flex gap-2.5 ${msg.remetente === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.remetente === 'rubi' && (
                      <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                    )}

                    <div className="flex flex-col items-start gap-1 max-w-[85%]">
                      <div
                        className={`rounded-2xl p-3.5 leading-relaxed whitespace-pre-wrap ${
                          msg.remetente === 'user'
                            ? 'bg-emerald-600 text-white rounded-br-xs shadow-md ml-auto'
                            : 'bg-slate-800 text-slate-200 rounded-bl-xs border border-slate-700/80 shadow-xs'
                        }`}
                      >
                        {msg.remetente === 'rubi'
                          ? renderizarConteudoMensagem(msg.texto)
                          : msg.texto}
                      </div>

                      {msg.remetente === 'rubi' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!audioAtivo) setAudioAtivo(true);
                            falarTexto(msg.texto, true);
                          }}
                          className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 bg-slate-950/70 hover:bg-slate-950 px-2.5 py-1 rounded-full border border-emerald-500/30 transition cursor-pointer select-none"
                          title="Tocar áudio desta resposta no seu fone"
                        >
                          <Volume2 className="w-3 h-3" />
                          <span>🔊 Ouvir no fone</span>
                        </button>
                      )}
                    </div>

                    {msg.remetente === 'user' && (
                      <div className="w-7 h-7 rounded-xl bg-emerald-700 text-emerald-200 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>

                  {/* CARDS INTERATIVOS DE PRODUTOS SUGERIDOS */}
                  {msg.produtosSugeridos && msg.produtosSugeridos.length > 0 && (
                    <div className="pl-9 pr-2 space-y-2 animate-in fade-in">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Produtos Recomendados:
                      </span>
                      <div className={`grid ${telaCheia ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3' : 'grid-cols-1'} gap-2.5`}>
                        {msg.produtosSugeridos.map(prod => {
                          const precoEfetivo = Number(prod.preco_promocional || prod.preco_venda_varejo || 0);
                          const temAtacado = Number(prod.preco_venda_atacado || 0) > 0;
                          const fotoUrl = prod.fotos_urls && prod.fotos_urls.length > 0 ? prod.fotos_urls[0] : null;
                          return (
                            <div
                              key={prod.id}
                              className="bg-slate-950/90 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-2.5 flex items-center justify-between gap-2.5 shadow-md group transition"
                            >
                              <div
                                onClick={() => setProdutoModalDetalhe(prod)}
                                className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                                title="Toque para ver fotos e detalhes deste produto"
                              >
                                {fotoUrl ? (
                                  <img
                                    src={fotoUrl}
                                    alt={prod.nome}
                                    className="w-12 h-12 object-cover rounded-xl shrink-0 bg-slate-900 border border-slate-800 group-hover:border-emerald-500/50 transition"
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                                    <ShoppingBag className="w-5 h-5" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <span className="font-bold text-xs text-slate-100 block truncate group-hover:text-emerald-300 transition">
                                    {prod.nome}
                                  </span>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <span className="text-xs font-black text-emerald-400">
                                      R$ {precoEfetivo.toFixed(2)}
                                    </span>
                                    {temAtacado && (
                                      <span className="text-[9px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded border border-amber-500/30">
                                        Atacado R$ {Number(prod.preco_venda_atacado).toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* BOTÕES COMPACTOS (APENAS ÍCONES: OLHO E MAIS) */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setProdutoModalDetalhe(prod)}
                                  className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer border border-slate-700/80 shadow-sm"
                                  title="Ver detalhes do produto"
                                >
                                  <Eye className="w-4 h-4 text-slate-300" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleAdicionarProdutoClick(prod)}
                                  className="w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition shrink-0 cursor-pointer shadow-sm hover:scale-105"
                                  title="Adicionar este produto à sacola"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {pensando && (
                <div className="flex gap-2.5 items-center text-slate-400 italic">
                  <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  </div>
                  <div className="bg-slate-800 border border-slate-700 rounded-2xl px-3.5 py-2 text-[11px]">
                    Rubi está pensando na melhor recomendação...
                  </div>
                </div>
              )}

              {/* Indicador visual de escuta por voz ativa */}
              {escutandoVoz && (
                <div className="flex items-center gap-2 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs font-semibold animate-pulse">
                  <span className="flex h-2.5 w-2.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                  </span>
                  <span>Escutando sua voz... Pode falar agora!</span>
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* Dúvidas Rápidas (Organizadas em 2 Linhas Fixas, SEM scroll horizontal) */}
            <div className="p-2.5 bg-slate-950/80 border-t border-slate-800/80 grid grid-cols-2 gap-1.5 shrink-0">
              {duvidasRapidas.map((duvida, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => enviarMensagem(duvida)}
                  disabled={pensando}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-300 hover:text-emerald-300 text-[11px] font-medium border border-slate-700/80 transition text-center truncate cursor-pointer disabled:opacity-50"
                  title={duvida}
                >
                  {duvida}
                </button>
              ))}
            </div>

            {/* Indicador de Escuta com Tolerância Confortável de Pausa */}
            {escutandoVoz && (
              <div className="px-3.5 py-2 bg-gradient-to-r from-rose-950/80 via-slate-900 to-slate-950 border-t border-rose-500/40 flex items-center justify-between text-xs text-rose-200 animate-in fade-in shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-2.5 w-2.5 relative shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                  </span>
                  <span className="truncate font-medium text-[11px]">
                    {inputTexto.trim()
                      ? 'Ouvindo... Pode falar no seu ritmo (pausa de 2s envia automaticamente)'
                      : 'Gravando... Fale a sua frase com calma, estou te ouvindo!'}
                  </span>
                </div>
                {inputTexto.trim() && (
                  <button
                    type="button"
                    onClick={() => pararGravacaoVoz(true)}
                    className="ml-2 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shrink-0 transition shadow-sm cursor-pointer"
                  >
                    Enviar Agora
                  </button>
                )}
              </div>
            )}

            {/* Formulário de Envio com Microfone Integrado */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                enviarMensagem();
              }}
              className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2 shrink-0"
            >
              {/* Botão de Microfone para falar */}
              <button
                type="button"
                onClick={alternarGravacaoVoz}
                className={`p-2.5 rounded-xl border transition cursor-pointer shrink-0 ${
                  escutandoVoz
                    ? 'bg-rose-600 border-rose-500 text-white animate-pulse shadow-lg shadow-rose-600/30'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/50'
                }`}
                title={escutandoVoz ? 'Concluir gravação e enviar' : 'Falar com a Rubi por microfone'}
              >
                {escutandoVoz ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <input
                type="text"
                placeholder={escutandoVoz ? 'Ouvindo... fale à vontade no seu ritmo' : 'Fale ou pergunte sobre produtos, preços, entrega...'}
                value={inputTexto}
                onChange={(e) => setInputTexto(e.target.value)}
                disabled={pensando}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />

              <button
                type="submit"
                disabled={!inputTexto.trim() || pensando}
                className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-40 cursor-pointer shrink-0"
                title="Enviar mensagem"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Detalhes do Produto Selecionado na conversa com a Rubi */}
      {produtoModalDetalhe && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl relative animate-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => setProdutoModalDetalhe(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-800 transition cursor-pointer"
              title="Fechar detalhes"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Foto em destaque */}
            <div className="w-full h-44 rounded-2xl bg-slate-950 overflow-hidden border border-slate-800 flex items-center justify-center relative">
              {produtoModalDetalhe.fotos_urls && produtoModalDetalhe.fotos_urls.length > 0 ? (
                <img
                  src={produtoModalDetalhe.fotos_urls[0]}
                  alt={produtoModalDetalhe.nome}
                  className="w-full h-full object-cover"
                />
              ) : (
                <ShoppingBag className="w-12 h-12 text-slate-600" />
              )}
            </div>

            {/* Informações básicas */}
            <div className="space-y-1.5">
              {produtoModalDetalhe.categoria?.nome && (
                <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full inline-block">
                  {produtoModalDetalhe.categoria.nome}
                </span>
              )}
              <h3 className="font-bold text-sm text-slate-100 leading-snug">
                {produtoModalDetalhe.nome}
              </h3>
              <div className="flex items-baseline gap-2 pt-0.5">
                <span className="text-base font-black text-emerald-400">
                  R$ {Number(produtoModalDetalhe.preco_promocional || produtoModalDetalhe.preco_venda_varejo || 0).toFixed(2)}
                </span>
                {Number(produtoModalDetalhe.preco_venda_atacado || 0) > 0 && (
                  <span className="text-[11px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-md border border-amber-500/30">
                    Atacado R$ {Number(produtoModalDetalhe.preco_venda_atacado).toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            {/* Descrição detalhada formatada */}
            <div className="max-h-48 overflow-y-auto space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Detalhes do Produto:
              </span>
              <DescricaoFormatadaProduto descricao={produtoModalDetalhe.descricao} />
            </div>

            {/* Ações */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const prod = produtoModalDetalhe;
                  setProdutoModalDetalhe(null);
                  handleAdicionarProdutoClick(prod);
                }}
                className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar à Sacola</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const prod = produtoModalDetalhe;
                  setProdutoModalDetalhe(null);
                  enviarMensagem(`Rubi, me explica melhor sobre o produto ${prod.nome}?`);
                }}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-emerald-400 font-bold text-xs flex items-center justify-center gap-2 border border-emerald-500/30 transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Pedir para a Rubi explicar por voz</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

