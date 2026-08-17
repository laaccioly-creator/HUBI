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
