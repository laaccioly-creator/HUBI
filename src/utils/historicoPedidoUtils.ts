import { Pedido } from '../types';

export interface HistoricoItem {
  id?: string;
  pedido_id?: string;
  tipo_evento?: string;
  status_anterior?: string | null;
  status_novo?: string | null;
  descricao?: string | null;
  criado_em?: string;
  usuario_id?: string | null;
  usuarios_loja?: {
    nome_completo: string;
  } | null;
  usuario?: string | null;
  // Campos adaptados para timeline e compatibilidade com telas Desktop e Mobile
  status: string;
  data: string;
  tipo?: 'status' | 'edicao' | 'criacao';
  detalhes?: string;
}

/**
 * Formata um carimbo temporal no padrão pt-BR completo: DD/MM/AAAA às HH:mm
 * Exemplo: '10/10/2026 às 10:48'
 */
export function formatarDataHoraHistorico(dataStr?: string | Date | null): string {
  if (!dataStr) return '';
  try {
    const d = typeof dataStr === 'string' ? new Date(dataStr) : dataStr;
    if (isNaN(d.getTime())) return String(dataStr);

    const formatadorData = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    const formatadorHora = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const dataParte = formatadorData.format(d);
    const horaParte = formatadorHora.format(d);

    return `${dataParte} às ${horaParte}`;
  } catch {
    return String(dataStr);
  }
}

/**
 * Consolida o histórico mantendo apenas o registro mais recente para cada status_novo ou status.
 * Eventos sem alteração de status direto (ex: edições ou logs descritivos) são preservados.
 * Retorna na ordem cronológica de evolução (do mais antigo para o mais recente).
 */
export function consolidarHistoricoPedidos<T extends Record<string, any>>(historico: T[]): T[] {
  if (!Array.isArray(historico) || historico.length === 0) return [];

  const obterTimestamp = (item: T): number => {
    const rawData = item.criado_em || item.data;
    if (!rawData) return 0;
    const t = new Date(rawData).getTime();
    return isNaN(t) ? 0 : t;
  };

  // 1. Ordena do mais recente para o mais antigo (para reter o registro com carimbo e descrição mais recentes)
  const ordenadoRecente = [...historico].sort((a, b) => obterTimestamp(b) - obterTimestamp(a));

  // 2. Retém apenas a primeira ocorrência (a mais recente) de cada status_novo / status
  const statusVistos = new Set<string>();
  const chavesVistas = new Set<string>();
  const itensFiltrados: T[] = [];

  for (const item of ordenadoRecente) {
    const isEdicao = item.tipo === 'edicao' || item.tipo_evento === 'pedido_editado' || item.tipo_evento === 'edicao_pdv';
    const chaveStatus = !isEdicao ? (item.status_novo || item.status) : null;

    if (chaveStatus) {
      if (!statusVistos.has(chaveStatus)) {
        statusVistos.add(chaveStatus);
        itensFiltrados.push(item);
      }
    } else {
      // Eventos de edição ou puramente descritivos são preservados (deduplicando se forem exatamente idênticos)
      const chaveItem = `${item.data || item.criado_em}_${item.status || item.tipo_evento}_${item.detalhes || item.descricao || ''}`;
      if (!chavesVistas.has(chaveItem)) {
        chavesVistas.add(chaveItem);
        itensFiltrados.push(item);
      }
    }
  }

  // 3. Retorna na ordem cronológica de evolução (antigo -> recente)
  return itensFiltrados.sort((a, b) => obterTimestamp(a) - obterTimestamp(b));
}

/**
 * Extrai e consolida o histórico completo de um pedido a partir da tabela relacional
 * historico_pedidos e de seus metadados retrocompatíveis.
 */
export function extrairHistoricoPedidoConsolidado(pedido: Pedido | null | undefined): HistoricoItem[] {
  if (!pedido) return [];
  const itens: HistoricoItem[] = [];

  // 1. Tabela relacional historico_pedidos (Prioridade Máxima)
  if (Array.isArray(pedido.historico) && pedido.historico.length > 0) {
    pedido.historico.forEach(h => {
      const nomeUsuario = (typeof h.usuario === 'object' && h.usuario?.nome_completo)
        ? h.usuario.nome_completo
        : (typeof (h as any).usuarios_loja === 'object' && (h as any).usuarios_loja?.nome_completo)
        ? (h as any).usuarios_loja.nome_completo
        : 'Operador';

      itens.push({
        id: h.id,
        pedido_id: h.pedido_id,
        tipo_evento: h.tipo_evento,
        status_anterior: h.status_anterior,
        status_novo: h.status_novo,
        descricao: h.descricao,
        criado_em: h.criado_em,
        usuario_id: h.usuario_id,
        status: h.status_novo || h.tipo_evento,
        data: h.criado_em,
        usuario: nomeUsuario,
        tipo: (h.tipo_evento === 'pedido_editado' || h.tipo_evento === 'edicao_pdv') ? 'edicao' : 'status',
        detalhes: h.descricao || (h.detalhes ? (typeof h.detalhes === 'string' ? h.detalhes : JSON.stringify(h.detalhes)) : undefined)
      });
    });
  }

  // 2. Status de metadados.historico_status (Fallback retrocompatível)
  if (pedido.metadados && typeof pedido.metadados === 'object') {
    const historicoMeta = (pedido.metadados as Record<string, unknown>).historico_status;
    if (Array.isArray(historicoMeta) && historicoMeta.length > 0) {
      historicoMeta.forEach((it: any) => {
        itens.push({
          status: it.status,
          data: it.data,
          usuario: it.usuario || 'Operador',
          tipo: it.tipo || 'status',
          detalhes: it.detalhes
        });
      });
    }
  }

  // 3. Histórico de edições do pedido (metadados.historico_edicoes)
  if (pedido.metadados && typeof pedido.metadados === 'object') {
    const historicoEdicoes = (pedido.metadados as Record<string, unknown>).historico_edicoes;
    if (Array.isArray(historicoEdicoes) && historicoEdicoes.length > 0) {
      historicoEdicoes.forEach((ed: any) => {
        itens.push({
          status: ed.acao || 'Edição no PDV',
          data: ed.data,
          usuario: ed.usuario_nome || 'Operador',
          tipo: 'edicao',
          detalhes: ed.detalhes
        });
      });
    }
  }

  // 4. Fallback legacy de tag em observações se nenhum outro foi encontrado
  if (itens.length === 0) {
    try {
      const match = pedido.observacoes?.match(/<!--HUBI_HISTORICO:(.*?)-->/);
      if (match && match[1]) {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach((it: any) => {
            itens.push({
              status: it.status,
              data: it.data,
              usuario: it.usuario || 'Operador',
              tipo: it.tipo || 'status',
              detalhes: it.detalhes
            });
          });
        }
      }
    } catch {
      // Ignora erro de JSON no fallback
    }
  }

  // 5. Fallback inicial caso não haja histórico estruturado registrado
  if (itens.length === 0) {
    if (pedido.criado_em) {
      itens.push({
        status: 'pendente',
        data: pedido.criado_em,
        usuario: pedido.vendedor?.nome_completo || (pedido.origem === 'catalogo_online' ? 'Catálogo Online' : 'Sistema'),
        tipo: 'criacao'
      });
    }
    if (pedido.status && pedido.status !== 'pendente') {
      itens.push({
        status: pedido.status,
        data: pedido.atualizado_em || pedido.data_venda || new Date().toISOString(),
        usuario: pedido.vendedor?.nome_completo || 'Operador',
        tipo: 'status'
      });
    }
  }

  return consolidarHistoricoPedidos(itens);
}
