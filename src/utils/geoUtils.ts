// ==============================================================================
// UTILITÁRIO GEOGRÁFICO E DE INTEGRAÇÃO LOGÍSTICA
// HUBI SISTEMA - 2026
// ==============================================================================

export interface CoordenadasGeo {
  latitude: number;
  longitude: number;
}

export interface EnderecoLocalidade {
  cep?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Mapeamento das principais Regiões Metropolitanas do Brasil (cidades conurbadas)
 */
const REGIOES_METROPOLITANAS: Record<string, string[][]> = {
  CE: [
    // RMF - Região Metropolitana de Fortaleza
    [
      'fortaleza', 'caucaia', 'maracanau', 'maranguape', 'aquiraz',
      'eusebio', 'pacatuba', 'horizonte', 'pacajus', 'itaitinga',
      'guaiuba', 'chorozinho', 'sao goncalo do amarante', 'paracuru',
      'paraipaba', 'trairi', 'sao luis do curu', 'pindoretama', 'cascavel'
    ]
  ],
  SP: [
    // RMSP - Região Metropolitana de São Paulo
    [
      'sao paulo', 'guarulhos', 'santo andre', 'sao bernardo do campo',
      'sao caetano do sul', 'diadema', 'maua', 'osasco', 'barueri',
      'carapicuiba', 'cotia', 'taboao da serra', 'embu das artes',
      'itapecerica da serra', 'itapevi', 'santana de parnaiba', 'suzano',
      'mogi das cruzes', 'ferraz de vasconcelos', 'poa', 'itaquaquecetuba',
      'ribeirao pires', 'rio grande da serra', 'franco da rocha', 'francisco morato',
      'caieiras', 'cajamar', 'aruja', 'santa isabel'
    ],
    // RMC - Região Metropolitana de Campinas
    [
      'campinas', 'americana', 'artur nogueira', 'cosmopolis', 'engenheiro coelho',
      'holambra', 'hortolandia', 'indaiatuba', 'itapira', 'jaguariuna',
      'monte mor', 'nova odessa', 'paulinia', 'pedreira', 'santa barbara d oeste',
      'santo antonio de posse', 'sumare', 'valinhos', 'vinhedo'
    ],
    // RM Baixada Santista
    [
      'santos', 'sao vicente', 'praia grande', 'guaruja', 'cubatao',
      'bertioga', 'mongagua', 'itanhaem', 'peruibe'
    ]
  ],
  RJ: [
    // RMRJ - Região Metropolitana do Rio de Janeiro
    [
      'rio de janeiro', 'niteroi', 'sao goncalo', 'duque de caxias',
      'nova iguacu', 'belford roxo', 'sao joao de meriti', 'mage',
      'itaborai', 'mesquita', 'nilopolis', 'marica', 'queimados',
      'itaguai', 'japeri', 'seropedica', 'paracambi', 'tangua'
    ]
  ],
  MG: [
    // RMBH - Região Metropolitana de Belo Horizonte
    [
      'belo horizonte', 'contagem', 'betim', 'nova lima', 'ribeirao das neves',
      'santa luzia', 'ibiritie', 'sabara', 'vespasiano', 'lagoa santa',
      'esmeraldas', 'igarape', 'mateus leme', 'brumadinho', 'sarzedo',
      'sao joaquim de bicas', 'rio manso', 'juatuba', 'pedro leopoldo', 'confins'
    ]
  ],
  PR: [
    // RMC - Região Metropolitana de Curitiba
    [
      'curitiba', 'sao jose dos pinhais', 'colombo', 'pinhais', 'araucaria',
      'almirante tamandare', 'campo largo', 'piraquara', 'fazenda rio grande',
      'campina grande do sul', 'quatro barras', 'itaperucu', 'rio branco do sul'
    ]
  ],
  RS: [
    // RMPOA - Região Metropolitana de Porto Alegre
    [
      'porto alegre', 'canoas', 'novo hamburgo', 'sao leopoldo', 'alvorada',
      'gravatai', 'viamao', 'cachoeirinha', 'esteio', 'sapucaia do sul',
      'guaiba', 'eldorado do sul', 'campo bom', 'estancia velha', 'sapiranga'
    ]
  ],
  BA: [
    // RMS - Região Metropolitana de Salvador
    [
      'salvador', 'lauro de freitas', 'camacari', 'simoes filho', 'candeias',
      'dias d avila', 'madre de deus', 'sao francisco do conde', 'itaparica',
      'vera cruz', 'mata de sao joao', 'pojuca', 'sao sebastiao do passe'
    ]
  ],
  PE: [
    // RMR - Região Metropolitana do Recife
    [
      'recife', 'jaboatao dos guararapes', 'olinda', 'paulista', 'camaragibe',
      'cabo de santo agostinho', 'sao lourenco da mata', 'igarassu', 'abreu e lima',
      'ipojuca', 'moreno', 'itamaraca', 'itapissuma', 'aracoiaba'
    ]
  ],
  DF: [
    // RIDE-DF - Região Integrada de Desenvolvimento do DF e Entorno
    [
      'brasilia', 'taguatinga', 'ceilandia', 'aguas claras', 'samambaia',
      'gama', 'sobradinho', 'planaltina', 'valparaiso de goias',
      'cidade ocidental', 'novo gama', 'luziania', 'aguas lindas de goias',
      'formosa', 'planaltina de goias'
    ]
  ],
  GO: [
    // RM Goiânia
    [
      'goiania', 'aparecida de goiania', 'senador canedo', 'trindade',
      'goianira', 'neropolis', 'abadiania', 'hidrolandia', 'bela vista de goias'
    ]
  ],
  SC: [
    // RM Florianópolis
    [
      'florianopolis', 'sao jose', 'palhoca', 'biguacu', 'santo amaro da imperatriz',
      'governador celso ramos', 'antonio carlos', 'aguas mornas', 'sao pedro de alcantara'
    ]
  ]
};

/**
 * Normaliza nome de cidade para comparação desconsiderando acentos e pontuações
 */
export function normalizarTexto(texto?: string | null): string {
  if (!texto) return '';
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcula distância geodésica em linha reta (fórmula de Haversine) em quilômetros
 */
export function calcularDistanciaKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Raio médio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Determina se o destino pertence à mesma Região Metropolitana da loja
 * para fins de viabilidade do serviço Uber Direct.
 */
export function verificarMesmaRegiaoMetropolitana(
  origem: EnderecoLocalidade,
  destino: EnderecoLocalidade
): boolean {
  const ufOrigem = (origem.uf || '').toUpperCase().trim();
  const ufDestino = (destino.uf || '').toUpperCase().trim();

  // Regra 1: Se as UFs forem diferentes, exceto caso DF/GO, não é mesma região metropolitana
  if (ufOrigem !== ufDestino) {
    const ehCasoDfGo =
      (ufOrigem === 'DF' && ufDestino === 'GO') || (ufOrigem === 'GO' && ufDestino === 'DF');
    if (!ehCasoDfGo) {
      return false;
    }
  }

  const cidadeOrigemNorm = normalizarTexto(origem.cidade);
  const cidadeDestinoNorm = normalizarTexto(destino.cidade);

  // Regra 2: Mesma cidade
  if (cidadeOrigemNorm && cidadeDestinoNorm && cidadeOrigemNorm === cidadeDestinoNorm) {
    return true;
  }

  // Regra 3: Se ambas tiverem coordenadas, calcula distância geodésica (raio máximo de 45 km para Uber)
  if (
    origem.latitude != null &&
    origem.longitude != null &&
    destino.latitude != null &&
    destino.longitude != null
  ) {
    const distanciaKm = calcularDistanciaKm(
      Number(origem.latitude),
      Number(origem.longitude),
      Number(destino.latitude),
      Number(destino.longitude)
    );
    if (distanciaKm <= 45) {
      return true;
    }
    return false;
  }

  // Regra 4: Consulta aos agrupamentos conurbados de Regiões Metropolitanas
  const listasUf = REGIOES_METROPOLITANAS[ufOrigem] || [];
  for (const grupoCidades of listasUf) {
    const temOrigem = grupoCidades.some((c) => cidadeOrigemNorm.includes(c) || c.includes(cidadeOrigemNorm));
    const temDestino = grupoCidades.some((c) => cidadeDestinoNorm.includes(c) || c.includes(cidadeDestinoNorm));
    if (temOrigem && temDestino) {
      return true;
    }
  }

  return false;
}

/**
 * Consulta geocoding reverso usando OpenStreetMap / Nominatim
 */
export async function obterEnderecoPorCoordenadas(
  latitude: number,
  longitude: number
): Promise<{
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
} | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'pt-BR,pt;q=0.9'
      }
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data || !data.address) return null;

    const addr = data.address;
    const logradouro = addr.road || addr.street || addr.pedestrian || addr.footway || '';
    const numero = addr.house_number || '';
    const bairro = addr.suburb || addr.neighbourhood || addr.city_district || '';
    const cidade = addr.city || addr.town || addr.municipality || addr.village || '';
    const rawUf = addr['ISO3166-2-lvl4']?.split('-')[1] || addr.state_code || addr.state || '';
    const rawCep = (addr.postcode || '').replace(/\D/g, '');

    const cep = rawCep.length === 8 ? `${rawCep.slice(0, 5)}-${rawCep.slice(5)}` : rawCep;
    const uf = (rawUf.length === 2 ? rawUf : '').toUpperCase();

    return {
      logradouro,
      numero,
      bairro,
      cidade,
      uf,
      cep
    };
  } catch (err) {
    console.warn('[geoUtils] Erro ao obter endereço por geolocalização:', err);
    return null;
  }
}

/**
 * Gera URL e texto do WhatsApp para envio da localização da loja física ao cliente
 */
export function gerarLinkWhatsAppLocalizacaoLoja(
  loja: {
    nome?: string;
    nome_loja?: string;
    endereco_logradouro?: string | null;
    endereco_numero?: string | null;
    endereco_complemento?: string | null;
    endereco_bairro?: string | null;
    endereco_cidade?: string | null;
    endereco_estado?: string | null;
    endereco_cep?: string | null;
  },
  telefoneCliente?: string | null
): { link: string; texto: string; linkMaps: string } {
  const nome = loja.nome || loja.nome_loja || 'Nossa Loja';
  const endFormatado = [
    loja.endereco_logradouro,
    loja.endereco_numero ? `nº ${loja.endereco_numero}` : '',
    loja.endereco_complemento,
    loja.endereco_bairro,
    loja.endereco_cidade && loja.endereco_estado
      ? `${loja.endereco_cidade} - ${loja.endereco_estado}`
      : loja.endereco_cidade || loja.endereco_estado,
    loja.endereco_cep ? `CEP: ${loja.endereco_cep}` : ''
  ]
    .filter(Boolean)
    .join(', ');

  const queryMaps = encodeURIComponent(
    [
      loja.endereco_logradouro,
      loja.endereco_numero,
      loja.endereco_bairro,
      loja.endereco_cidade,
      loja.endereco_estado
    ]
      .filter(Boolean)
      .join(', ') || nome
  );

  const linkMaps = `https://www.google.com/maps/search/?api=1&query=${queryMaps}`;

  const texto = `📍 *Endereço para Retirada na Loja - ${nome}*\n\n` +
    `Olá! Segue o nosso endereço para você retirar sua compra:\n\n` +
    `🏢 *Endereço:* ${endFormatado || 'Consulte o balcão da loja'}\n` +
    `🗺️ *Como Chegar (Google Maps):* ${linkMaps}\n\n` +
    `Estamos à sua disposição!`;

  const cleanTel = (telefoneCliente || '').replace(/\D/g, '');
  const link = cleanTel.length >= 10
    ? `https://wa.me/55${cleanTel}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/?text=${encodeURIComponent(texto)}`;

  return { link, texto, linkMaps };
}
