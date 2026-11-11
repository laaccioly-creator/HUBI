import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Loja } from '../types';

export type TipoAcaoProntidao =
  | 'chave_gemini'
  | 'chave_serper'
  | 'perfil_loja'
  | 'categorias'
  | 'produtos'
  | 'entrega_pagamentos';

export interface EtapaProntidao {
  id: string;
  ordem: number;
  titulo: string;
  descricao: string;
  concluido: boolean;
  tipoAcao: TipoAcaoProntidao;
}

export interface UseLojaProntidaoReturn {
  etapas: EtapaProntidao[];
  totalConcluidas: number;
  percentual: number;
  tudoPronto: boolean;
  etapaFoco: EtapaProntidao | null;
  rubiDestravada: boolean;
  carregando: boolean;
  recarregar: () => Promise<void>;
}

interface DadosContagemSupabase {
  totalCategorias: number;
  totalProdutos: number;
  totalFormasPagamento: number;
  shippingAtivo: boolean;
}

const ETAPAS_INICIAIS: EtapaProntidao[] = [
  {
    id: 'etapa-1-gemini',
    ordem: 1,
    titulo: 'Ativar a Rubi IA (Google Gemini)',
    descricao: 'Chave gratuita do Gemini para gerar textos, sugestões e relatórios com inteligência.',
    concluido: false,
    tipoAcao: 'chave_gemini',
  },
  {
    id: 'etapa-2-serper',
    ordem: 2,
    titulo: 'Ativar Busca de Fotos (Serper.dev)',
    descricao: 'Cota gratuita de 2.500 buscas para encontrar fotos de produtos e serviços na internet.',
    concluido: false,
    tipoAcao: 'chave_serper',
  },
  {
    id: 'etapa-3-perfil',
    ordem: 3,
    titulo: 'Dados Básicos & Perfil da Loja',
    descricao: 'Nome fantasia, WhatsApp para pedidos e apresentação da empresa.',
    concluido: false,
    tipoAcao: 'perfil_loja',
  },
  {
    id: 'etapa-4-categorias',
    ordem: 4,
    titulo: 'Categorias do seu Ramo',
    descricao: 'Organização do catálogo em departamentos e subcategorias.',
    concluido: false,
    tipoAcao: 'categorias',
  },
  {
    id: 'etapa-5-produtos',
    ordem: 5,
    titulo: 'Cadastrar Primeiro Item',
    descricao: 'Seu primeiro produto físico ou serviço pronto para venda/agendamento.',
    concluido: false,
    tipoAcao: 'produtos',
  },
  {
    id: 'etapa-6-entrega-pagamento',
    ordem: 6,
    titulo: 'Entrega & Pagamentos (Pix)',
    descricao: 'Definir se faz entrega ou retirada e cadastrar chave Pix / formas de pagamento.',
    concluido: false,
    tipoAcao: 'entrega_pagamentos',
  },
];

/**
 * Hook de avaliação de prontidão operacional da loja ativa.
 *
 * Avalia em tempo real se a loja possui os 6 pilares essenciais configurados,
 * determinando o percentual de conclusão e a próxima etapa pendente prioritária
 * com foco no destravamento da Rubi IA e na jornada de onboarding guiado.
 */
export const useLojaProntidao = (lojaOverride?: Loja | null): UseLojaProntidaoReturn => {
  const { loja: lojaAuth } = useAuth();
  const loja = lojaOverride !== undefined ? lojaOverride : lojaAuth;

  const [dadosDb, setDadosDb] = useState<DadosContagemSupabase>({
    totalCategorias: 0,
    totalProdutos: 0,
    totalFormasPagamento: 0,
    shippingAtivo: false,
  });

  const [carregando, setCarregando] = useState<boolean>(true);
  const requestIdRef = useRef<number>(0);

  const consultarDadosSupabase = useCallback(
    async (lojaId: string, currentRequestId: number): Promise<void> => {
      try {
        const [resCat, resProd, resPag, resShip] = await Promise.all([
          supabase
            .from('categorias')
            .select('id', { count: 'exact', head: true })
            .eq('loja_id', lojaId),
          supabase
            .from('produtos')
            .select('id', { count: 'exact', head: true })
            .eq('loja_id', lojaId),
          supabase
            .from('formas_pagamento')
            .select('id', { count: 'exact', head: true })
            .eq('loja_id', lojaId)
            .eq('ativo', true),
          supabase
            .from('loja_shipping_configs')
            .select(
              'id, origem_cep, permite_retirada_loja, retirada_balcao_ativa, retirada_loja_ativa, uber_ativo, melhor_envio_ativo, frete_proprio_ativo'
            )
            .eq('loja_id', lojaId)
            .maybeSingle(),
        ]);

        // Descarta resultados obsoletos caso a loja tenha sido alternada ou nova requisição iniciada
        if (currentRequestId !== requestIdRef.current) {
          return;
        }

        const countCategorias = resCat.count ?? 0;
        const countProdutos = resProd.count ?? 0;
        const countPagamentos = resPag.count ?? 0;

        const cfg = resShip.data;
        let shippingConfigAtivo = Boolean(
          (cfg &&
            (cfg.permite_retirada_loja ||
              cfg.retirada_balcao_ativa ||
              cfg.retirada_loja_ativa ||
              cfg.uber_ativo ||
              cfg.melhor_envio_ativo ||
              cfg.frete_proprio_ativo ||
              (cfg.origem_cep && cfg.origem_cep.trim().length > 0))) ||
            loja?.retirada_loja_ativa
        );

        // Fallback resiliente: verifica se existem formas de entrega ativas cadastradas
        if (!shippingConfigAtivo) {
          try {
            const { count: countFormasEntrega } = await supabase
              .from('formas_entrega')
              .select('id', { count: 'exact', head: true })
              .eq('loja_id', lojaId)
              .eq('ativo', true);

            if (currentRequestId === requestIdRef.current && countFormasEntrega && countFormasEntrega >= 1) {
              shippingConfigAtivo = true;
            }
          } catch {
            // Degradação graciosa caso a tabela formas_entrega não exista ou não tenha permissão
          }
        }

        if (currentRequestId === requestIdRef.current) {
          setDadosDb({
            totalCategorias: countCategorias,
            totalProdutos: countProdutos,
            totalFormasPagamento: countPagamentos,
            shippingAtivo: shippingConfigAtivo,
          });
        }
      } catch (err) {
        console.warn('[useLojaProntidao] Erro ao consultar prontidão no Supabase:', err);
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setCarregando(false);
        }
      }
    },
    [loja?.retirada_loja_ativa]
  );

  const recarregar = useCallback(async (): Promise<void> => {
    if (!loja?.id) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    const newRequestId = ++requestIdRef.current;
    await consultarDadosSupabase(loja.id, newRequestId);
  }, [loja?.id, consultarDadosSupabase]);

  // Efeito principal: executa consulta ao montar ou alternar loja e gerencia subscription Realtime
  useEffect(() => {
    const lojaId = loja?.id;

    if (!lojaId) {
      setCarregando(false);
      setDadosDb({
        totalCategorias: 0,
        totalProdutos: 0,
        totalFormasPagamento: 0,
        shippingAtivo: false,
      });
      return;
    }

    setCarregando(true);
    const currentRequestId = ++requestIdRef.current;
    consultarDadosSupabase(lojaId, currentRequestId);

    // Canal Realtime para manter as contagens sempre sincronizadas quando o lojista cadastrar registros
    const canalNome = `realtime_prontidao_${lojaId}_${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(canalNome)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categorias', filter: `loja_id=eq.${lojaId}` },
        () => {
          const idAtual = ++requestIdRef.current;
          consultarDadosSupabase(lojaId, idAtual);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'produtos', filter: `loja_id=eq.${lojaId}` },
        () => {
          const idAtual = ++requestIdRef.current;
          consultarDadosSupabase(lojaId, idAtual);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'formas_pagamento', filter: `loja_id=eq.${lojaId}` },
        () => {
          const idAtual = ++requestIdRef.current;
          consultarDadosSupabase(lojaId, idAtual);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'loja_shipping_configs', filter: `loja_id=eq.${lojaId}` },
        () => {
          const idAtual = ++requestIdRef.current;
          consultarDadosSupabase(lojaId, idAtual);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'formas_entrega', filter: `loja_id=eq.${lojaId}` },
        () => {
          const idAtual = ++requestIdRef.current;
          consultarDadosSupabase(lojaId, idAtual);
        }
      )
      .subscribe();

    return () => {
      // Invalida requisições assíncronas ativas desta loja
      requestIdRef.current++;
      supabase.removeChannel(channel);
    };
  }, [loja?.id, consultarDadosSupabase]);

  // Avaliação das 6 etapas essenciais
  const geminiKey = (
    loja?.gemini_api_key ||
    loja?.configuracoes_extras?.ia?.gemini_api_key ||
    ''
  ).trim();
  const concluidoGemini = Boolean(geminiKey.length > 0);

  const serperKey = (
    loja?.serpapi_key ||
    loja?.configuracoes_extras?.ia?.serpapi_key ||
    ''
  ).trim();
  const concluidoSerper = Boolean(serperKey.length > 0);

  const nomeFantasia = (loja?.nome_fantasia || '').trim();
  const whatsapp = (loja?.whatsapp || '').trim();
  const concluidoPerfil = Boolean(nomeFantasia.length > 0 && whatsapp.length > 0);

  const concluidoCategorias = dadosDb.totalCategorias >= 1;
  const concluidoProdutos = dadosDb.totalProdutos >= 1;
  const concluidoEntregaPagamento = dadosDb.shippingAtivo && dadosDb.totalFormasPagamento >= 1;

  const etapas: EtapaProntidao[] = [
    {
      ...ETAPAS_INICIAIS[0],
      concluido: concluidoGemini,
    },
    {
      ...ETAPAS_INICIAIS[1],
      concluido: concluidoSerper,
    },
    {
      ...ETAPAS_INICIAIS[2],
      concluido: concluidoPerfil,
    },
    {
      ...ETAPAS_INICIAIS[3],
      concluido: concluidoCategorias,
    },
    {
      ...ETAPAS_INICIAIS[4],
      concluido: concluidoProdutos,
    },
    {
      ...ETAPAS_INICIAIS[5],
      concluido: concluidoEntregaPagamento,
    },
  ];

  const totalConcluidas = etapas.filter((e) => e.concluido).length;
  const percentual = Math.round((totalConcluidas / 6) * 100);
  const tudoPronto = totalConcluidas === 6;
  const etapaFoco = etapas.find((e) => !e.concluido) || null;
  const rubiDestravada = Boolean(etapas[0]?.concluido);

  return {
    etapas,
    totalConcluidas,
    percentual,
    tudoPronto,
    etapaFoco,
    rubiDestravada,
    carregando,
    recarregar,
  };
};
