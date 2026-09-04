export const formatarMoeda = (valor: number | string | null | undefined): string => {
  const num = Number(valor || 0);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const formatarData = (dataIso?: string | null): string => {
  if (!dataIso) return '-';
  return new Date(dataIso).toLocaleDateString('pt-BR');
};

export const formatarDataHora = (dataIso?: string | null): string => {
  if (!dataIso) return '-';
  return new Date(dataIso).toLocaleString('pt-BR');
};

export const formatarTelefone = (tel?: string | null): string => {
  if (!tel) return '';
  const digits = tel.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return tel;
};

/**
 * Limpa e extrai a observação real de um pedido, removendo tags técnicas de sistema
 * ([PAG_PREVISTO:...], [DESCONTO_PERC:...], <!--HUBI_HISTORICO:...-->) e cabeçalhos legados
 * automáticos de cliente gerados pelo catálogo público (ex: "Cliente: Nome (Fone). CPF/CNPJ: ... E-mail: ...").
 */
export const extrairObservacaoLimpa = (obs?: string | null): string => {
  if (!obs || typeof obs !== 'string') return '';

  let limpa = obs
    .replace(/\[PAG_PREVISTO:.*?\]/g, '')
    .replace(/\[DESCONTO_PERC:[0-9.]+\]/g, '')
    .replace(/<!--HUBI_HISTORICO:.*?-->/g, '')
    .trim();

  // Padrão 1: Gerado pelo Catálogo com Telefone entre parênteses: "Cliente: Nome (11999999999)..."
  const matchCatalogo = limpa.match(/^Cliente:\s*.*?(?:\(\+?\d+.*?\))(?:[\s\S]*?)(?:\.\s*Obs:\s*([\s\S]*)|$)/i);
  if (matchCatalogo) {
    return matchCatalogo[1] ? matchCatalogo[1].trim() : '';
  }

  // Padrão 2: Gerado pelo Catálogo com CPF/CNPJ ou E-mail ou Cupom no cabeçalho
  const matchCatalogo2 = limpa.match(/^Cliente:\s*.*?(?:CPF\/CNPJ:|E-mail:|\[Cupom:)(?:[\s\S]*?)(?:\.\s*Obs:\s*([\s\S]*)|$)/i);
  if (matchCatalogo2) {
    return matchCatalogo2[1] ? matchCatalogo2[1].trim() : '';
  }

  return limpa;
};

