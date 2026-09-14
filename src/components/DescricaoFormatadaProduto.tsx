import React, { useMemo } from 'react';
import {
  FileText,
  CheckCircle,
  HelpCircle,
  Sparkles,
  ShieldCheck,
  Zap,
  Info
} from 'lucide-react';

interface DescricaoFormatadaProps {
  descricao?: string | null;
  className?: string;
  justificado?: boolean;
}

// Siglas, termos e unidades conhecidas que devem ser preservadas com capitalização específica
const MAPA_TERMOS_ESPECIAIS: Record<string, string> = {
  anvisa: 'ANVISA',
  usb: 'USB',
  led: 'LED',
  ph: 'pH',
  gspot: 'G-Spot',
  pspot: 'P-Spot',
  kit: 'Kit',
  pvc: 'PVC',
  abs: 'ABS',
  tpe: 'TPE',
  bpa: 'BPA',
  clitoris: 'clitóris',
  vagina: 'vagina',
  penis: 'pênis',
  anal: 'anal'
};

/**
 * Converte um texto ou parágrafo predominantemente em MAIÚSCULAS para Sentence Case inteligente,
 * respeitando pontuações terminais, quebras de linha e unidades de medida.
 */
export const sanitizarCaixaTexto = (texto: string): string => {
  if (!texto || !texto.trim()) return '';

  const textoLimpo = texto.trim();

  // Contar letras maiúsculas vs minúsculas para checar se é predominantemente ALL CAPS
  const letras = textoLimpo.match(/[a-zA-ZÀ-ÿ]/g) || [];
  if (letras.length === 0) return textoLimpo;

  const maiusculas = textoLimpo.match(/[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÀÈÌÒÙÄËÏÖÜÇ]/g) || [];
  const percentualMaiusculas = maiusculas.length / letras.length;

  // Se mais de 50% das letras forem maiúsculas, aplicamos conversão de Sentence Case
  const deveConverterCaixa = percentualMaiusculas > 0.5;

  let base = deveConverterCaixa ? textoLimpo.toLowerCase() : textoLimpo;

  // 1. Corrigir unidades de medida coladas a números: "15ML" -> "15 ml", "4G" -> "4g", "100MG" -> "100 mg"
  base = base.replace(/(\d+)\s*(ml|g|mg|kg|cm|mm|un|capsulas?)\b/gi, (_match, num, un) => {
    return `${num} ${un.toLowerCase()}`;
  });

  // 2. Corrigir pontuações coladas ou espaços antes de pontuação
  base = base
    .replace(/\s+([,.;:!?])/g, '$1') // remove espaço antes de pontuação
    .replace(/([,;])([^\s\d])/g, '$1 $2') // adiciona espaço após vírgula/ponto-e-vírgula
    .replace(/([.!?])([A-Za-zÀ-ÿ])/g, '$1 $2'); // adiciona espaço após ponto/exclamação/interrogação

  // 3. Aplicar maiúscula na primeira letra de cada frase
  // (no início do texto, após ponto, exclamação, interrogação ou quebra de linha)
  base = base.replace(/(^\s*|[.!?\n]\s+)([a-zà-ÿ])/g, (_match, prefixo, letra) => {
    return prefixo + letra.toUpperCase();
  });

  // 4. Restaurar termos e siglas especiais
  for (const [termoMinusculo, termoFormatado] of Object.entries(MAPA_TERMOS_ESPECIAIS)) {
    const regex = new RegExp(`\\b${termoMinusculo}\\b`, 'gi');
    base = base.replace(regex, termoFormatado);
  }

  return base;
};

/**
 * Sanitiza um resumo curto para exibição em cards de produto (ex: line-clamp).
 */
export const formatarResumoDescricao = (texto?: string | null): string => {
  if (!texto) return '';
  const sanitizado = sanitizarCaixaTexto(texto);
  return sanitizado.replace(/\s+/g, ' ').trim();
};

interface BlocoDescricao {
  tipo: 'titulo_secao' | 'item_lista' | 'paragrafo';
  conteudo: string;
  icone?: 'check' | 'modo_uso' | 'beneficio' | 'precaucao' | 'info';
}

/**
 * Analisa a descrição do produto e a divide em blocos estruturados:
 * títulos de seções, tópicos com marcadores e parágrafos corridos.
 */
export const estruturarDescricaoProduto = (descricaoBruta: string): BlocoDescricao[] => {
  if (!descricaoBruta || !descricaoBruta.trim()) return [];

  // Dividir por quebras de linha preservando a estrutura
  const linhas = descricaoBruta.split(/\r?\n/);
  const blocos: BlocoDescricao[] = [];
  let bufferParagrafo: string[] = [];

  const descarregarBuffer = () => {
    if (bufferParagrafo.length > 0) {
      const textoCompleto = bufferParagrafo.join(' ').trim();
      if (textoCompleto) {
        blocos.push({
          tipo: 'paragrafo',
          conteudo: sanitizarCaixaTexto(textoCompleto)
        });
      }
      bufferParagrafo = [];
    }
  };

  const regexCabecalhoSecao = /^(modo de usar|modo de uso|como usar|benef[ií]cios|caracter[ií]sticas|composi[cç][aã]o|precau[cç][oõ]es|cuidados|indica[cç][aã]o|para que serve|especifica[cç][oõ]es|dimens[oõ]es|medidas|material|informa[cç][oõ]es gerais|diferenciais|seguran[cç]a|recomenda[cç][aã]o|conte[uú]do da embalagem|importante)[\s:–-]*$/i;

  const regexItemLista = /^[\s]*([•\-\*–—]|(?:\d+[\.\)]))\s+(.+)$/;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim();

    // Linha vazia: finaliza o parágrafo atual
    if (!linha) {
      descarregarBuffer();
      continue;
    }

    // Checar se é um item de lista (começa com bullet, traço, asterisco ou número)
    const matchLista = linha.match(regexItemLista);
    if (matchLista) {
      descarregarBuffer();
      const itemTexto = sanitizarCaixaTexto(matchLista[2]);
      blocos.push({
        tipo: 'item_lista',
        conteudo: itemTexto
      });
      continue;
    }

    // Checar se é cabeçalho de seção explícito
    const limpaParaChecagem = linha.replace(/[:\-–—]+$/, '').trim();
    if (regexCabecalhoSecao.test(limpaParaChecagem) || (linha.endsWith(':') && linha.length <= 40)) {
      descarregarBuffer();
      
      const tituloSanitizado = sanitizarCaixaTexto(limpaParaChecagem);
      const tituloCapitalizado = tituloSanitizado.charAt(0).toUpperCase() + tituloSanitizado.slice(1);

      let icone: BlocoDescricao['icone'] = 'info';
      const tNorm = tituloCapitalizado.toLowerCase();
      if (tNorm.includes('modo') || tNorm.includes('como usar')) icone = 'modo_uso';
      else if (tNorm.includes('beneficio') || tNorm.includes('vantag')) icone = 'beneficio';
      else if (tNorm.includes('precauc') || tNorm.includes('cuidado') || tNorm.includes('advert')) icone = 'precaucao';
      else if (tNorm.includes('composic') || tNorm.includes('material')) icone = 'info';

      blocos.push({
        tipo: 'titulo_secao',
        conteudo: tituloCapitalizado,
        icone
      });
      continue;
    }

    // Texto corrido: adiciona ao buffer do parágrafo atual
    bufferParagrafo.push(linha);
  }

  descarregarBuffer();

  return blocos;
};

/**
 * Componente Principal para exibição elegante e formatada da descrição do produto
 */
export const DescricaoFormatadaProduto: React.FC<DescricaoFormatadaProps> = ({
  descricao,
  className = '',
  justificado = true
}) => {
  const blocos = useMemo(() => {
    if (!descricao || !descricao.trim()) return [];
    return estruturarDescricaoProduto(descricao);
  }, [descricao]);

  if (!descricao || !descricao.trim() || blocos.length === 0) {
    return (
      <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800/60 text-slate-400 text-xs sm:text-sm italic">
        Nenhuma descrição detalhada informada para este produto.
      </div>
    );
  }

  return (
    <div
      className={`p-4 sm:p-5 rounded-2xl bg-slate-950/60 border border-slate-800/70 text-slate-200 text-xs sm:text-sm leading-relaxed space-y-3.5 shadow-inner ${className}`}
    >
      {blocos.map((bloco, idx) => {
        if (bloco.tipo === 'titulo_secao') {
          return (
            <div
              key={idx}
              className="pt-2 pb-0.5 first:pt-0 flex items-center gap-2 border-b border-slate-800/60"
            >
              {bloco.icone === 'modo_uso' ? (
                <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              ) : bloco.icone === 'beneficio' ? (
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : bloco.icone === 'precaucao' ? (
                <ShieldCheck className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-sky-400 shrink-0" />
              )}
              <h5 className="font-bold text-xs uppercase tracking-wider text-slate-200">
                {bloco.conteudo}
              </h5>
            </div>
          );
        }

        if (bloco.tipo === 'item_lista') {
          return (
            <div key={idx} className="flex items-start gap-2.5 pl-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0 ring-4 ring-emerald-500/10" />
              <p
                className={`flex-1 text-slate-300 ${
                  justificado ? 'text-justify [text-justify:inter-word]' : 'text-left'
                }`}
              >
                {bloco.conteudo}
              </p>
            </div>
          );
        }

        // Parágrafo de texto corrido
        return (
          <p
            key={idx}
            className={`text-slate-300 font-normal ${
              justificado ? 'text-justify [text-justify:inter-word]' : 'text-left'
            }`}
          >
            {bloco.conteudo}
          </p>
        );
      })}
    </div>
  );
};
