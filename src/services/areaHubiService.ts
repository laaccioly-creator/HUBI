// src/services/areaHubiService.ts
// Camada de acesso executivo e comercial da Área HUBI (exclusiva para Super Admin)
// Governança: RPCs SECURITY DEFINER validadas por eh_super_admin_plataforma(), sem exposição de PII/SQLSTATE

import { supabase } from '../lib/supabase';
import { StatusAssinaturaLoja, TipoDocumento } from '../types';
import { configuracoesPlataformaService } from './configuracoesPlataformaService';

export type EstagioComercialLoja =
  | 'trial_ativo'
  | 'trial_vencido'
  | 'churn_nao_renovado'
  | 'assinante_ativo';

export interface PagamentoAssinaturaAdmin {
  id: string;
  status_pagamento: string;
  meio_pagamento?: string | null;
  bandeira_metodo?: string | null;
  valor_total: number;
  ciclo_meses: number;
  periodo_inicio_em?: string | null;
  periodo_fim_em?: string | null;
  aprovado_em?: string | null;
  criado_em?: string | null;
  observacoes_admin?: string | null;
}

export interface LojaAreaHubi {
  id: string;
  organizacao_id?: string | null;
  nome_fantasia: string;
  razao_social?: string | null;
  tipo_documento?: TipoDocumento | null;
  numero_documento?: string | null;
  whatsapp: string;
  email: string;
  endereco_cep?: string | null;
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_complemento?: string | null;
  endereco_bairro?: string | null;
  endereco_cidade?: string | null;
  endereco_estado?: string | null;
  status_assinatura: StatusAssinaturaLoja;
  trial_fim_em?: string | null;
  assinatura_fim_em?: string | null;
  criado_em?: string | null;
  ja_assinou: boolean;
  total_pagamentos_aprovados: number;
  total_investido: number;
  estagio_comercial: EstagioComercialLoja;
  dias_referencia: number;
  pagamentos: PagamentoAssinaturaAdmin[];
}

export interface MetasAreaHubi {
  meta_hubi_faturamento: number;
  meta_hubi_vendas: number;
  meta_hubi_conversao_percentual: number;
  meta_hubi_max_nao_renovados: number;
  meta_hubi_lojas_ativas: number;
  meta_hubi_receita_whatsapp: number;
}

export interface MetricasAreaHubi {
  faturamento_bruto_hubi: number;
  faturamento_assinaturas: number;
  receita_whatsapp: number;
  volume_assinaturas: number;
  cadastros_periodo: number;
  assinantes_do_periodo: number;
  taxa_conversao_percentual: number;
  nao_renovados_e_expirados: number;
  lojas_ativas_pagantes: number;
}

export interface PayloadCockpitAreaHubi {
  metas: MetasAreaHubi;
  metricas: MetricasAreaHubi;
  lojas: LojaAreaHubi[];
}

export interface AtualizarDadosLojaAdminInput {
  loja_id: string;
  nome_fantasia: string;
  razao_social?: string | null;
  tipo_documento?: TipoDocumento | string | null;
  numero_documento?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  endereco_cep?: string | null;
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_complemento?: string | null;
  endereco_bairro?: string | null;
  endereco_cidade?: string | null;
  endereco_estado?: string | null;
  status_assinatura: StatusAssinaturaLoja;
  trial_fim_em?: string | null;
  assinatura_fim_em?: string | null;
}

export interface AtivarAssinaturaManualInput {
  loja_id: string;
  ciclo_tipo: 'anual' | 'mensal' | 'personalizado';
  dias_vigencia: number;
  ciclo_meses: number;
  meio_pagamento: string;
  valor_total: number;
  observacoes_admin?: string;
}

const sanitizarErroRpc = (erro: unknown, mensagemPadrao: string): string => {
  const raw = erro instanceof Error ? erro.message : typeof erro === 'object' && erro && 'message' in erro ? String((erro as { message: unknown }).message) : '';
  const lower = raw.toLowerCase();
  if (lower.includes('acesso negado')) {
    return 'Acesso restrito ao Super Admin da plataforma HUBI.';
  }
  if (lower.includes('obrigatório') || lower.includes('inválido') || lower.includes('não encontrada') || lower.includes('não localizada')) {
    return raw;
  }
  return mensagemPadrao;
};

const toNum = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const normalizarWhatsappParaLink = (raw?: string | null): string => {
  const digits = String(raw || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!digits || digits.length < 10) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
};

export const gerarMensagemWhatsappPorEstagio = (loja: LojaAreaHubi): string => {
  const nome = (loja.nome_fantasia || 'lojista').trim();
  switch (loja.estagio_comercial) {
    case 'trial_ativo':
      return `Olá ${nome}, aqui é o Luiz do sistema HUBI! Vi que você está no período de teste. Como está sendo a experiência? Precisa de alguma ajuda para configurar sua loja ou tirar alguma dúvida?`;
    case 'trial_vencido':
      return `Olá ${nome}, aqui é o Luiz do sistema HUBI! Notei que seu período de teste encerrou. Gostaria de saber o que achou e como posso te ajudar a ativar sua loja hoje!`;
    case 'churn_nao_renovado':
      return `Olá ${nome}, aqui é o Luiz do sistema HUBI! Vi que a assinatura da sua loja venceu. Vamos renovar para você não perder o acesso ao sistema?`;
    case 'assinante_ativo':
    default:
      return `Olá ${nome}, aqui é o Luiz do sistema HUBI! Passando para acompanhar como estão as vendas na loja e saber se precisa de algum suporte.`;
  }
};

export const gerarLinkWhatsappComercial = (loja: LojaAreaHubi): string | null => {
  const numero = normalizarWhatsappParaLink(loja.whatsapp);
  if (!numero) return null;
  const texto = gerarMensagemWhatsappPorEstagio(loja);
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
};

export const areaHubiService = {
  async obterDadosCockpit(
    dataInicioIso: string,
    dataFimIso: string
  ): Promise<PayloadCockpitAreaHubi> {
    const { data, error } = await supabase.rpc('obter_dados_cockpit_area_hubi', {
      p_data_inicio: dataInicioIso,
      p_data_fim: dataFimIso,
    });

    if (error || !data) {
      throw new Error(
        sanitizarErroRpc(
          error,
          'Não foi possível carregar os indicadores executivos da Área HUBI.'
        )
      );
    }

    const raw = data as any;
    const metasRaw = raw.metas || {};
    const metricasRaw = raw.metricas || {};
    const lojasRaw = Array.isArray(raw.lojas) ? raw.lojas : [];

    return {
      metas: {
        meta_hubi_faturamento: toNum(metasRaw.meta_hubi_faturamento, 0),
        meta_hubi_vendas: Math.round(toNum(metasRaw.meta_hubi_vendas, 0)),
        meta_hubi_conversao_percentual: toNum(metasRaw.meta_hubi_conversao_percentual, 0),
        meta_hubi_max_nao_renovados: Math.round(toNum(metasRaw.meta_hubi_max_nao_renovados, 0)),
        meta_hubi_lojas_ativas: Math.round(toNum(metasRaw.meta_hubi_lojas_ativas, 0)),
        meta_hubi_receita_whatsapp: toNum(metasRaw.meta_hubi_receita_whatsapp, 0),
      },
      metricas: {
        faturamento_bruto_hubi: toNum(metricasRaw.faturamento_bruto_hubi, 0),
        faturamento_assinaturas: toNum(metricasRaw.faturamento_assinaturas, 0),
        receita_whatsapp: toNum(metricasRaw.receita_whatsapp, 0),
        volume_assinaturas: Math.round(toNum(metricasRaw.volume_assinaturas, 0)),
        cadastros_periodo: Math.round(toNum(metricasRaw.cadastros_periodo, 0)),
        assinantes_do_periodo: Math.round(toNum(metricasRaw.assinantes_do_periodo, 0)),
        taxa_conversao_percentual: toNum(metricasRaw.taxa_conversao_percentual, 0),
        nao_renovados_e_expirados: Math.round(toNum(metricasRaw.nao_renovados_e_expirados, 0)),
        lojas_ativas_pagantes: Math.round(toNum(metricasRaw.lojas_ativas_pagantes, 0)),
      },
      lojas: lojasRaw.map((l: any): LojaAreaHubi => ({
        id: String(l.id),
        organizacao_id: l.organizacao_id || null,
        nome_fantasia: String(l.nome_fantasia || 'Loja sem nome'),
        razao_social: l.razao_social || null,
        tipo_documento: l.tipo_documento || null,
        numero_documento: l.numero_documento || null,
        whatsapp: String(l.whatsapp || ''),
        email: String(l.email || ''),
        endereco_cep: l.endereco_cep || null,
        endereco_logradouro: l.endereco_logradouro || null,
        endereco_numero: l.endereco_numero || null,
        endereco_complemento: l.endereco_complemento || null,
        endereco_bairro: l.endereco_bairro || null,
        endereco_cidade: l.endereco_cidade || null,
        endereco_estado: l.endereco_estado || null,
        status_assinatura: (l.status_assinatura || 'trial') as StatusAssinaturaLoja,
        trial_fim_em: l.trial_fim_em || null,
        assinatura_fim_em: l.assinatura_fim_em || null,
        criado_em: l.criado_em || null,
        ja_assinou: Boolean(l.ja_assinou),
        total_pagamentos_aprovados: Math.round(toNum(l.total_pagamentos_aprovados, 0)),
        total_investido: toNum(l.total_investido, 0),
        estagio_comercial: (l.estagio_comercial || 'trial_ativo') as EstagioComercialLoja,
        dias_referencia: Math.round(toNum(l.dias_referencia, 0)),
        pagamentos: Array.isArray(l.pagamentos)
          ? l.pagamentos.map((p: any): PagamentoAssinaturaAdmin => ({
              id: String(p.id),
              status_pagamento: String(p.status_pagamento || 'pendente'),
              meio_pagamento: p.meio_pagamento || null,
              bandeira_metodo: p.bandeira_metodo || null,
              valor_total: toNum(p.valor_total, 0),
              ciclo_meses: Math.round(toNum(p.ciclo_meses, 1)),
              periodo_inicio_em: p.periodo_inicio_em || null,
              periodo_fim_em: p.periodo_fim_em || null,
              aprovado_em: p.aprovado_em || null,
              criado_em: p.criado_em || null,
              observacoes_admin: p.observacoes_admin || null,
            }))
          : [],
      })),
    };
  },

  async salvarMetasHubi(metas: MetasAreaHubi): Promise<void> {
    await configuracoesPlataformaService.salvarParametros({
      meta_hubi_faturamento: Number(metas.meta_hubi_faturamento || 0),
      meta_hubi_vendas: Math.max(0, Math.round(Number(metas.meta_hubi_vendas || 0))),
      meta_hubi_conversao_percentual: Number(metas.meta_hubi_conversao_percentual || 0),
      meta_hubi_max_nao_renovados: Math.max(0, Math.round(Number(metas.meta_hubi_max_nao_renovados || 0))),
      meta_hubi_lojas_ativas: Math.max(0, Math.round(Number(metas.meta_hubi_lojas_ativas || 0))),
      meta_hubi_receita_whatsapp: Number(metas.meta_hubi_receita_whatsapp || 0),
    });
  },

  async atualizarDadosLoja(input: AtualizarDadosLojaAdminInput): Promise<void> {
    const { error } = await supabase.rpc('admin_atualizar_dados_loja', {
      p_loja_id: input.loja_id,
      p_nome_fantasia: input.nome_fantasia,
      p_razao_social: input.razao_social || null,
      p_tipo_documento: input.tipo_documento || null,
      p_numero_documento: input.numero_documento || null,
      p_whatsapp: input.whatsapp || null,
      p_email: input.email || null,
      p_endereco_cep: input.endereco_cep || null,
      p_endereco_logradouro: input.endereco_logradouro || null,
      p_endereco_numero: input.endereco_numero || null,
      p_endereco_complemento: input.endereco_complemento || null,
      p_endereco_bairro: input.endereco_bairro || null,
      p_endereco_cidade: input.endereco_cidade || null,
      p_endereco_estado: input.endereco_estado || null,
      p_status_assinatura: input.status_assinatura,
      p_trial_fim_em: input.trial_fim_em || null,
      p_assinatura_fim_em: input.assinatura_fim_em || null,
    });

    if (error) {
      throw new Error(
        sanitizarErroRpc(error, 'Não foi possível salvar os dados cadastrais da loja.')
      );
    }
  },

  async ativarAssinaturaManual(input: AtivarAssinaturaManualInput): Promise<void> {
    const { error } = await supabase.rpc('ativar_assinatura_loja_manual', {
      p_loja_id: input.loja_id,
      p_ciclo_tipo: input.ciclo_tipo,
      p_dias_vigencia: Math.max(1, Math.round(Number(input.dias_vigencia || 30))),
      p_ciclo_meses: Math.max(1, Math.round(Number(input.ciclo_meses || 1))),
      p_meio_pagamento: input.meio_pagamento,
      p_valor_total: Number(input.valor_total || 0),
      p_observacoes_admin: input.observacoes_admin?.trim() || null,
    });

    if (error) {
      throw new Error(
        sanitizarErroRpc(error, 'Não foi possível registrar a ativação manual da assinatura.')
      );
    }
  },
};
