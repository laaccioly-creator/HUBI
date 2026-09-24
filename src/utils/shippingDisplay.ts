/**
 * Utilitários de exibição e formatação de nomes de logística e entrega
 */

/**
 * Formata o nome de exibição de uma transportadora para manter o padrão "Transportadora [Nome]"
 * Exemplo: "Jadlog" -> "Transportadora Jadlog"
 * Exemplo: "Transportadora Jadlog" -> "Transportadora Jadlog"
 * Exemplo: "Jadlog Express" -> "Transportadora Jadlog Express"
 */
export function formatarNomeTransportadora(nome: string | null | undefined): string {
  if (!nome || !nome.trim()) return 'Transportadora';
  const limpo = nome.trim();
  if (/^transportadora\b/i.test(limpo)) {
    return limpo.charAt(0).toUpperCase() + limpo.slice(1);
  }
  return `Transportadora ${limpo}`;
}
