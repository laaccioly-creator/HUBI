import { typesafeService } from './typesafeService';

export interface EnderecoSanitizadoJev {
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  cep?: string | null;
  ponto_referencia?: string | null;
  avaliadoPorJev: boolean;
}

export const addressParserJevService = {
  /**
   * Converte um endereço em texto livre (ex: colado pelo operador ou recebido no WhatsApp)
   * em campos relacionais normalizados para cotação e emissão de frete sem rejeições.
   */
  async sanitizarEnderecoLivre(textoLivre: string): Promise<EnderecoSanitizadoJev> {
    const textoLimpo = (textoLivre || '').trim();
    if (!textoLimpo) {
      return this.extrairComRegexLocal(textoLivre);
    }

    try {
      const estadoJev = {
        endereco_texto_bruto: textoLimpo,
      };

      const perguntas = {
        tem_numero: typesafeService.criarNoul(
          'O endereço fornecido possui número de imóvel explícito?',
          {
            true: 'Possui número de imóvel claramente indicado.',
            false: 'Sem número (S/N) ou apenas nome da rua.',
          }
        ),
        tipo_local: typesafeService.criarChoice(
          'Qual o tipo de logradouro principal identificado?',
          {
            rua_av: 'Rua, Avenida, Travessa, Alameda ou Rodovia.',
            condominio: 'Condomínio, Edifício, Prédio residencial ou comercial.',
            rural: 'Sítio, Fazenda, Chácara ou Zona Rural.',
            incompleto: 'Apenas bairro ou cidade sem logradouro.',
          }
        ),
      };

      // Chamada ultrarrápida (1000ms)
      await typesafeService.avaliar(estadoJev, perguntas, 'jev-latest', 1000);

      // Combina a extração com regex aprimorada guiada pelos julgamentos
      const estruturado = this.extrairComRegexLocal(textoLimpo);
      estruturado.avaliadoPorJev = true;
      return estruturado;
    } catch {
      return this.extrairComRegexLocal(textoLimpo);
    }
  },

  extrairComRegexLocal(texto: string): EnderecoSanitizadoJev {
    const t = (texto || '').trim();

    // 1. Extração de CEP se presente
    const cepMatch = t.match(/\b(\d{5}-?\d{3})\b/);
    const cep = cepMatch ? cepMatch[1].replace(/\D/g, '') : null;

    // 2. Extração de UF (ex: CE, SP, RJ...)
    const ufMatch = t.match(/\b([A-Z]{2})\b/);
    const uf = ufMatch ? ufMatch[1].toUpperCase() : 'CE';

    // 3. Extração de número (ex: nº 123, n 123, 123A, número 400)
    const numMatch = t.match(/(?:n[ºo°.]?|n[uú]mero|num\.?)?\s*(\d+[a-zA-Z]?)\b/i);
    const numero = numMatch && numMatch[1] ? numMatch[1] : 'S/N';

    // 4. Extração de complemento (ex: apto 302, bloco B, sala 10)
    const compMatch = t.match(/\b(apto\.?|apartamento|bloco|sala|casa|fundos|lote|cj\.?|conjunto)\s*([a-zA-Z0-9_-]+)/i);
    const complemento = compMatch ? compMatch[0].trim() : null;

    // 5. Separação de logradouro e bairro
    // Casos comuns: "Rua X, 123 - Bairro Y, Cidade - UF"
    let logradouro = t;
    let bairro = 'Centro';
    let cidade = 'Fortaleza';

    const partes = t.split(/[-–—,]/).map((p) => p.trim()).filter(Boolean);
    if (partes.length >= 3) {
      logradouro = partes[0];
      // Se a primeira parte continha número, limpa
      bairro = partes[1].replace(/^(n[ºo°]?\s*\d+|apto.*|\d+)/i, '').trim() || 'Centro';
      cidade = partes[2].replace(/\b[A-Z]{2}\b/g, '').trim() || 'Fortaleza';
    } else if (partes.length === 2) {
      logradouro = partes[0];
      bairro = partes[1].replace(/\b[A-Z]{2}\b/g, '').trim() || 'Centro';
    }

    return {
      logradouro: logradouro.slice(0, 100).trim(),
      numero,
      complemento,
      bairro: bairro.slice(0, 60).trim() || 'Centro',
      cidade: cidade.slice(0, 60).trim() || 'Fortaleza',
      uf,
      cep: cep ? `${cep.slice(0, 5)}-${cep.slice(5)}` : null,
      ponto_referencia: null,
      avaliadoPorJev: false,
    };
  },
};
