import { supabase } from '../lib/supabase';
import { logger } from './loggerService';
import { ConfiguracoesExtrasLoja, PagamentosDigitaisConfig } from '../types';

export type EtapaOnboardingId =
  | 'ia_gemini'
  | 'busca_fotos_serper'
  | 'perfil_negocio_ia'
  | 'dados_loja_cep'
  | 'tipos_venda'
  | 'formas_pagamento'
  | 'status_pedidos'
  | 'categorias_unidades'
  | 'metas_loja'
  | 'colaboradores'
  | 'catalogo_online'
  | 'gateway_pagamento'
  | 'melhor_envio'
  | 'uber_direct'
  | 'apps_corrida'
  | 'transportadoras_manuais'
  | 'whatsapp_auto'
  | 'whatsapp_ia_receptiva'
  | 'mercado_livre'
  | 'agendamento_servicos'
  | 'venda_por_peso'
  | 'caderneta_fiado';

export type ChaveInteresseOnboarding =
  | 'interesse_catalogo_online'
  | 'interesse_gateway_pagamento'
  | 'interesse_melhor_envio'
  | 'interesse_uber_direct'
  | 'interesse_apps_corrida'
  | 'interesse_transportadoras_manuais'
  | 'interesse_ia_gemini'
  | 'interesse_busca_fotos_serper'
  | 'interesse_whatsapp_auto'
  | 'interesse_whatsapp_ia_receptiva'
  | 'interesse_mercado_livre'
  | 'interesse_agendamento_servicos'
  | 'interesse_venda_por_peso'
  | 'interesse_caderneta_fiado';

export interface OnboardingSetupRecord {
  id: string;
  loja_id: string;
  questionario_respondido: boolean;
  respondido_em: string | null;
  interesse_catalogo_online: boolean;
  interesse_gateway_pagamento: boolean;
  interesse_melhor_envio: boolean;
  interesse_uber_direct: boolean;
  interesse_apps_corrida: boolean;
  interesse_transportadoras_manuais: boolean;
  interesse_ia_gemini: boolean;
  interesse_busca_fotos_serper: boolean;
  interesse_whatsapp_auto: boolean;
  interesse_whatsapp_ia_receptiva: boolean;
  interesse_mercado_livre: boolean;
  interesse_agendamento_servicos: boolean;
  interesse_venda_por_peso: boolean;
  interesse_caderneta_fiado: boolean;
  unidades_conferidas: boolean;
  opera_sozinho: boolean;
  metas_conferidas: boolean;
  perfil_ia_conferido: boolean;
  criado_em: string;
  atualizado_em: string;
}

export type AtualizacaoOnboardingSetupPayload = Partial<
  Omit<OnboardingSetupRecord, 'id' | 'loja_id' | 'criado_em' | 'atualizado_em'>
>;

export interface TiposVendaLoja {
  varejo: boolean;
  atacado: boolean;
  distribuidor: boolean;
}

export interface CamposDiretosLojaOnboarding {
  tipos_venda?: TiposVendaLoja;
  status_em_separacao?: boolean;
  status_em_expedicao?: boolean;
  status_aguardando_envio?: boolean;
  status_enviado?: boolean;
  status_entregue?: boolean;
  status_pronto_para_retirar?: boolean;
  caderneta_ativa?: boolean;
  exigir_pesagem_previa_pagamento?: boolean;
}

export interface EtapaOnboardingItem {
  id: EtapaOnboardingId;
  grupo: 'essencial' | 'opcional';
  ordem: number;
  titulo: string;
  descricao: string;
  concluido: boolean;
  rotaDestino: string;
  chaveInteresse?: ChaveInteresseOnboarding;
  interesseAtivo: boolean;
  acaoDiretaModal?: 'gemini' | 'serper' | 'categorias' | null;
}

export interface SnapshotLojaOnboarding {
  tipos_venda: TiposVendaLoja;
  status_em_separacao: boolean;
  status_em_expedicao: boolean;
  status_aguardando_envio: boolean;
  status_enviado: boolean;
  status_entregue: boolean;
  status_pronto_para_retirar: boolean;
  exigir_pesagem_previa_pagamento: boolean;
  caderneta_ativa: boolean;
  trabalha_com_agenda: boolean;
  aceita_pedidos_online: boolean;
  whatsapp_auto_ativo: boolean;
  whatsapp_ia_receptiva_ativa: boolean;
  gemini_configurado: boolean;
  serper_configurado: boolean;
  segmento_negocio: string;
  especialidade_negocio: string;
  tom_voz_rubi: string;
  perfil_ia_configurado: boolean;
  meta_faturamento: number;
  meta_pedidos: number;
  meta_lucro_liquido: number;
  colaboradores_ativos_count: number;
  colaboradores_equipe_count: number;
}

export interface StatusOnboardingCompleto {
  setup: OnboardingSetupRecord;
  lojaSnapshot: SnapshotLojaOnboarding;
  etapasEssenciais: EtapaOnboardingItem[];
  etapasOpcionaisAtivas: EtapaOnboardingItem[];
  etapasOpcionaisTodas: EtapaOnboardingItem[];
  etapasAtivas: EtapaOnboardingItem[];
  totalAtivas: number;
  totalConcluidas: number;
  percentual: number;
  tudoPronto: boolean;
  proximaEtapaPendente: EtapaOnboardingItem | null;
}

export interface RetornoOnboardingEstado {
  etapaId: EtapaOnboardingId;
  etapaTitulo: string;
  registradoEm: number;
}

export const EVENTO_RETORNO_ONBOARDING = 'hubi:retorno-onboarding-alterado';
export const EVENTO_ABRIR_QUESTIONARIO = 'hubi:abrir-questionario-onboarding';
export const EVENTO_ONBOARDING_SALVO = 'hubi:etapa-onboarding-salva';
export const EVENTO_ONBOARDING_ATUALIZADO = 'hubi:onboarding-atualizado';

const STORAGE_KEY_RETORNO = 'hubi_retorno_onboarding';
const STORAGE_PREFIX_FALLBACK = 'hubi_onboarding_setup_';

export interface LojaOnboardingQueryRow {
  id: string;
  whatsapp?: string | null;
  endereco_cep?: string | null;
  gemini_api_key?: string | null;
  serper_api_key?: string | null;
  tipos_venda?: Partial<TiposVendaLoja> | null;
  aceita_pedidos_online?: boolean | null;
  whatsapp_auto_ativo?: boolean | null;
  ia_whatsapp_ativa?: boolean | null;
  whatsapp_ia_receptiva_ativa?: boolean | null;
  meta_phone_number_id?: string | null;
  meta_access_token?: string | null;
  exigir_pesagem_previa_pagamento?: boolean | null;
  caderneta_ativa?: boolean | null;
  trabalha_com_agenda?: boolean | null;
  atendimento_domicilio_ativo?: boolean | null;
  status_em_separacao?: boolean | null;
  status_em_expedicao?: boolean | null;
  status_aguardando_envio?: boolean | null;
  status_enviado?: boolean | null;
  status_entregue?: boolean | null;
  status_pronto_para_retirar?: boolean | null;
  configuracoes_extras?: ConfiguracoesExtrasLoja | null;
}

interface ShippingOnboardingQueryRow {
  origem_cep?: string | null;
  melhor_envio_ativo?: boolean | null;
  melhor_envio_token?: string | null;
  uber_ativo?: boolean | null;
  uber_customer_id?: string | null;
  uber_client_id?: string | null;
  frete_proprio_ativo?: boolean | null;
}

interface FormaPagamentoOnboardingQueryRow {
  id: string;
  tipo: string;
  nome: string;
  ativo: boolean;
  exibir_catalogo: boolean;
}

interface LojaMetasOnboardingQueryRow {
  meta_faturamento?: number | null;
  meta_pedidos?: number | null;
  meta_lucro_liquido?: number | null;
  meta_ticket_medio?: number | null;
}

export interface OpcoesAvaliacaoOnboarding {
  sincronizarDetectados?: boolean;
  ignorarAutoDeteccaoChaves?: ChaveInteresseOnboarding[];
  lojaFallback?: Partial<LojaOnboardingQueryRow> | null;
}

interface ResultadoSetupLoja {
  setup: OnboardingSetupRecord;
  persistidoNoBanco: boolean;
}

const MARGEM_EXPIRACAO_SESSAO_SEGUNDOS = 60;
let promessaVerificacaoSessaoAtiva: Promise<boolean> | null = null;

const criarRegistroPadraoSetup = (lojaId: string): OnboardingSetupRecord => {
  const agora = new Date().toISOString();
  return {
    id: `local-${lojaId}`,
    loja_id: lojaId,
    questionario_respondido: false,
    respondido_em: null,
    interesse_catalogo_online: true,
    interesse_gateway_pagamento: false,
    interesse_melhor_envio: false,
    interesse_uber_direct: false,
    interesse_apps_corrida: false,
    interesse_transportadoras_manuais: false,
    interesse_ia_gemini: true,
    interesse_busca_fotos_serper: true,
    interesse_whatsapp_auto: false,
    interesse_whatsapp_ia_receptiva: false,
    interesse_mercado_livre: false,
    interesse_agendamento_servicos: false,
    interesse_venda_por_peso: false,
    interesse_caderneta_fiado: false,
    unidades_conferidas: false,
    opera_sozinho: false,
    metas_conferidas: false,
    perfil_ia_conferido: false,
    criado_em: agora,
    atualizado_em: agora,
  };
};

const isErroTabelaAusente = (err: { code?: string; message?: string } | null): boolean => {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table')
  );
};

const isErroColunaAusente = (err: { code?: string; message?: string } | null): boolean => {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return err.code === '42703' || err.code === 'PGRST204' || msg.includes('column');
};

const isErroRlsOuPermissao = (
  err: { code?: string; message?: string; status?: number } | null
): boolean => {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return (
    err.code === '42501' ||
    err.code === 'PGRST301' ||
    err.status === 401 ||
    err.status === 403 ||
    msg.includes('row-level security') ||
    msg.includes('permission denied') ||
    msg.includes('jwt')
  );
};

/**
 * Garante que a sessão Auth do Supabase esteja hidratada e renovada preventivamente
 * antes de consultas/escritas protegidas por RLS (ex.: auth.uid() IS NOT NULL).
 */
async function garantirSessaoAuthAtiva(lojaId: string): Promise<boolean> {
  if (promessaVerificacaoSessaoAtiva) {
    return promessaVerificacaoSessaoAtiva;
  }

  promessaVerificacaoSessaoAtiva = (async () => {
    let sessaoAtual: { access_token?: string; expires_at?: number } | null = null;
    const agoraSegundos = Math.floor(Date.now() / 1000);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      sessaoAtual = sessionData?.session ?? null;

      if (sessionError || !sessaoAtual?.access_token) {
        return false;
      }

      const expiraEm = sessaoAtual.expires_at ?? 0;
      if (expiraEm === 0 || expiraEm - agoraSegundos > MARGEM_EXPIRACAO_SESSAO_SEGUNDOS) {
        return true;
      }

      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshData?.session?.access_token) {
        return true;
      }

      if (refreshError) {
        const errMeta = refreshError as { code?: string; status?: number; message?: string };
        const msgRefresh = errMeta.message || 'erro desconhecido';
        if (!msgRefresh.toLowerCase().includes('auth session missing')) {
          logger.warn(
            'onboardingSetupService',
            'garantirSessaoAuthAtiva',
            `[${errMeta.code || errMeta.status || 'AUTH'}] Falha ao renovar sessão Auth: ${msgRefresh}`,
            {
              loja_id: lojaId,
              codigo_erro: errMeta.code || (errMeta.status ? String(errMeta.status) : null),
            }
          );
        }
      }
    } catch (err) {
      const msgCatch = err instanceof Error ? err.message : '';
      if (!msgCatch.toLowerCase().includes('auth session missing')) {
        logger.warn(
          'onboardingSetupService',
          'garantirSessaoAuthAtiva',
          msgCatch || 'Exceção ao validar/renovar sessão Auth.',
          { loja_id: lojaId }
        );
      }
    }

    const expiraEm = sessaoAtual?.expires_at ?? 0;
    return Boolean(sessaoAtual?.access_token && (expiraEm === 0 || expiraEm > agoraSegundos));
  })().finally(() => {
    promessaVerificacaoSessaoAtiva = null;
  });

  return promessaVerificacaoSessaoAtiva;
}

const lerSetupFallbackLocal = (lojaId: string): OnboardingSetupRecord => {
  const padrao = criarRegistroPadraoSetup(lojaId);
  if (typeof window === 'undefined') return padrao;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX_FALLBACK}${lojaId}`);
    if (!raw) return padrao;
    const parsed = JSON.parse(raw) as Partial<OnboardingSetupRecord>;
    return {
      ...padrao,
      ...parsed,
      loja_id: lojaId,
    };
  } catch {
    return padrao;
  }
};

const salvarSetupFallbackLocal = (
  lojaId: string,
  dados: AtualizacaoOnboardingSetupPayload
): OnboardingSetupRecord => {
  const atual = lerSetupFallbackLocal(lojaId);
  const atualizado: OnboardingSetupRecord = {
    ...atual,
    ...dados,
    loja_id: lojaId,
    atualizado_em: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${STORAGE_PREFIX_FALLBACK}${lojaId}`, JSON.stringify(atualizado));
    } catch {
      // Silencioso caso storage esteja bloqueado
    }
  }
  return atualizado;
};

const normalizarRegistroSetup = (
  lojaId: string,
  row: Partial<OnboardingSetupRecord> | null
): OnboardingSetupRecord => {
  const padrao = criarRegistroPadraoSetup(lojaId);
  if (!row) return padrao;
  return {
    id: row.id || padrao.id,
    loja_id: row.loja_id || lojaId,
    questionario_respondido: Boolean(row.questionario_respondido),
    respondido_em: row.respondido_em ?? null,
    interesse_catalogo_online: row.interesse_catalogo_online ?? true,
    interesse_gateway_pagamento: Boolean(row.interesse_gateway_pagamento),
    interesse_melhor_envio: Boolean(row.interesse_melhor_envio),
    interesse_uber_direct: Boolean(row.interesse_uber_direct),
    interesse_apps_corrida: Boolean(row.interesse_apps_corrida),
    interesse_transportadoras_manuais: Boolean(row.interesse_transportadoras_manuais),
    interesse_ia_gemini: row.interesse_ia_gemini ?? true,
    interesse_busca_fotos_serper: row.interesse_busca_fotos_serper ?? true,
    interesse_whatsapp_auto: Boolean(row.interesse_whatsapp_auto),
    interesse_whatsapp_ia_receptiva:
      typeof row.interesse_whatsapp_ia_receptiva === 'boolean'
        ? row.interesse_whatsapp_ia_receptiva
        : Boolean(lerSetupFallbackLocal(lojaId).interesse_whatsapp_ia_receptiva),
    interesse_mercado_livre: Boolean(row.interesse_mercado_livre),
    interesse_agendamento_servicos: Boolean(row.interesse_agendamento_servicos),
    interesse_venda_por_peso: Boolean(row.interesse_venda_por_peso),
    interesse_caderneta_fiado: Boolean(row.interesse_caderneta_fiado),
    unidades_conferidas: Boolean(row.unidades_conferidas),
    opera_sozinho:
      typeof row.opera_sozinho === 'boolean'
        ? row.opera_sozinho
        : Boolean(lerSetupFallbackLocal(lojaId).opera_sozinho),
    metas_conferidas:
      typeof row.metas_conferidas === 'boolean'
        ? row.metas_conferidas
        : Boolean(lerSetupFallbackLocal(lojaId).metas_conferidas),
    perfil_ia_conferido:
      typeof row.perfil_ia_conferido === 'boolean'
        ? row.perfil_ia_conferido
        : Boolean(lerSetupFallbackLocal(lojaId).perfil_ia_conferido),
    criado_em: row.criado_em || padrao.criado_em,
    atualizado_em: row.atualizado_em || padrao.atualizado_em,
  };
};

const dispararEventoJanela = (nome: string, detail?: Record<string, unknown>): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(nome, { detail }));
};

const verificarGatewayPagamentoConfigurado = (
  formas: FormaPagamentoOnboardingQueryRow[],
  pagDigitais?: PagamentosDigitaisConfig
): boolean => {
  const temFormaGateway = formas.some((fp) => {
    if (!fp.ativo) return false;
    if (fp.tipo === 'mercado_pago') return true;
    const nomeLower = (fp.nome || '').toLowerCase();
    return (
      fp.exibir_catalogo &&
      (nomeLower.includes('mercado pago') ||
        nomeLower.includes('mercadopago') ||
        nomeLower.includes('asaas') ||
        nomeLower.includes('pagseguro') ||
        nomeLower.includes('stripe') ||
        nomeLower.includes('picpay') ||
        nomeLower.includes('google pay') ||
        nomeLower.includes('gateway'))
    );
  });

  if (temFormaGateway) return true;
  if (!pagDigitais) return false;

  const prov = pagDigitais.provedor_ativo;
  if (prov === 'nenhum') return false;

  const mpConfigurado = Boolean(
    (pagDigitais.mercado_pago?.ativo === true || prov === 'mercado_pago' || prov === 'todos') &&
      (pagDigitais.mercado_pago?.public_key?.trim() || pagDigitais.mercado_pago?.access_token?.trim())
  );
  const asaasConfigurado = Boolean(
    (pagDigitais.asaas?.ativo === true || prov === 'asaas' || prov === 'todos') &&
      pagDigitais.asaas?.api_key?.trim()
  );
  const pagseguroConfigurado = Boolean(
    (pagDigitais.pagseguro?.ativo === true || prov === 'pagseguro' || prov === 'todos') &&
      (pagDigitais.pagseguro?.token?.trim() || pagDigitais.pagseguro?.email?.trim())
  );
  const stripeConfigurado = Boolean(
    (pagDigitais.stripe?.ativo === true || prov === 'stripe' || prov === 'todos') &&
      (pagDigitais.stripe?.publishable_key?.trim() || pagDigitais.stripe?.secret_key?.trim())
  );
  const picpayConfigurado = Boolean(
    (pagDigitais.picpay?.ativo === true || prov === 'picpay' || prov === 'todos') &&
      (pagDigitais.picpay?.token?.trim() || pagDigitais.picpay?.seller_token?.trim())
  );
  const gpayConfigurado = Boolean(
    (pagDigitais.google_pay?.ativo === true || prov === 'google_pay' || prov === 'todos') &&
      pagDigitais.google_pay?.merchant_id?.trim()
  );

  return (
    mpConfigurado ||
    asaasConfigurado ||
    pagseguroConfigurado ||
    stripeConfigurado ||
    picpayConfigurado ||
    gpayConfigurado
  );
};

async function consultarOuInicializarSetupLojaInterno(
  lojaId: string,
  sessaoJaVerificada?: boolean
): Promise<ResultadoSetupLoja> {
  try {
    const sessaoAtiva =
      sessaoJaVerificada !== undefined
        ? sessaoJaVerificada
        : await garantirSessaoAuthAtiva(lojaId);

    // 1. Sempre realiza SELECT primeiro antes de qualquer INSERT
    const { data: existente, error: erroConsulta } = await supabase
      .from('loja_onboarding_setup')
      .select('*')
      .eq('loja_id', lojaId)
      .maybeSingle();

    if (erroConsulta) {
      if (!isErroTabelaAusente(erroConsulta)) {
        logger.warn(
          'onboardingSetupService',
          'obterOuCriarSetupLoja:select',
          `[${erroConsulta.code || 'SEM_CODIGO'}] ${
            erroConsulta.message || 'Falha ao consultar loja_onboarding_setup'
          }`,
          {
            loja_id: lojaId,
            codigo_erro: erroConsulta.code ?? null,
          }
        );
      }
      return {
        setup: lerSetupFallbackLocal(lojaId),
        persistidoNoBanco: false,
      };
    }

    if (existente) {
      return {
        setup: normalizarRegistroSetup(lojaId, existente as Partial<OnboardingSetupRecord>),
        persistidoNoBanco: true,
      };
    }

    // 2. Somente cria o registro inicial se houver sessão authenticated válida
    if (!sessaoAtiva) {
      logger.warn(
        'onboardingSetupService',
        'obterOuCriarSetupLoja:sem_sessao',
        'Sessão Supabase authenticated indisponível para inicializar registro; seguindo com leitura não-bloqueante.',
        { loja_id: lojaId }
      );
      return {
        setup: lerSetupFallbackLocal(lojaId),
        persistidoNoBanco: false,
      };
    }

    const { data: criado, error: erroCriacao } = await supabase
      .from('loja_onboarding_setup')
      .insert({ loja_id: lojaId })
      .select('*')
      .single();

    if (!erroCriacao && criado) {
      return {
        setup: normalizarRegistroSetup(lojaId, criado as Partial<OnboardingSetupRecord>),
        persistidoNoBanco: true,
      };
    }

    // Trata concorrência de abas/requisições simultâneas (UNIQUE loja_id)
    if (erroCriacao?.code === '23505') {
      const { data: aposConcorrencia } = await supabase
        .from('loja_onboarding_setup')
        .select('*')
        .eq('loja_id', lojaId)
        .maybeSingle();

      if (aposConcorrencia) {
        return {
          setup: normalizarRegistroSetup(
            lojaId,
            aposConcorrencia as Partial<OnboardingSetupRecord>
          ),
          persistidoNoBanco: true,
        };
      }
    }

    if (erroCriacao && !isErroTabelaAusente(erroCriacao)) {
      logger.warn(
        'onboardingSetupService',
        'obterOuCriarSetupLoja:insert',
        `[${erroCriacao.code || 'SEM_CODIGO'}] ${
          erroCriacao.message || 'Falha ao inicializar registro em loja_onboarding_setup'
        }`,
        {
          loja_id: lojaId,
          codigo_erro: erroCriacao.code ?? null,
        }
      );
    }

    return {
      setup: lerSetupFallbackLocal(lojaId),
      persistidoNoBanco: false,
    };
  } catch (err) {
    logger.warn(
      'onboardingSetupService',
      'obterOuCriarSetupLoja:excecao',
      err instanceof Error ? err.message : 'Exceção ao consultar/inicializar onboarding.',
      { loja_id: lojaId }
    );
    return {
      setup: lerSetupFallbackLocal(lojaId),
      persistidoNoBanco: false,
    };
  }
}

/**
 * Obtém o registro de setup de onboarding da loja ou cria um registro inicial de forma não-bloqueante.
 */
export async function obterOuCriarSetupLoja(lojaId: string): Promise<OnboardingSetupRecord> {
  if (!lojaId) {
    throw new Error('Identificador da loja inválido para consulta de implantação.');
  }

  const { setup } = await consultarOuInicializarSetupLojaInterno(lojaId);
  return setup;
}

/**
 * Persiste respostas e interesses do questionário na tabela public.loja_onboarding_setup.
 */
export async function salvarRespostasOnboarding(
  lojaId: string,
  dados: AtualizacaoOnboardingSetupPayload
): Promise<OnboardingSetupRecord> {
  if (!lojaId) {
    throw new Error('Identificador da loja não informado.');
  }

  const sessaoAtiva = await garantirSessaoAuthAtiva(lojaId);
  if (!sessaoAtiva) {
    logger.warn(
      'onboardingSetupService',
      'salvarRespostasOnboarding:sem_sessao',
      'Sessão authenticated indisponível ao salvar preferências; persistindo fallback local.',
      { loja_id: lojaId }
    );
    const localAtualizado = salvarSetupFallbackLocal(lojaId, dados);
    dispararEventoJanela(EVENTO_ONBOARDING_ATUALIZADO, { lojaId });
    return localAtualizado;
  }

  const payload: AtualizacaoOnboardingSetupPayload & {
    loja_id: string;
    atualizado_em: string;
  } = {
    loja_id: lojaId,
    ...dados,
    atualizado_em: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('loja_onboarding_setup')
    .upsert(payload, { onConflict: 'loja_id' })
    .select('*')
    .single();

  if (error) {
    if (isErroColunaAusente(error)) {
      const {
        interesse_whatsapp_ia_receptiva: _wppIa,
        metas_conferidas: _metasConf,
        perfil_ia_conferido: _perfilConf,
        ...payloadCompativel
      } = payload;
      if (Object.keys(payloadCompativel).length > 2) {
        await supabase
          .from('loja_onboarding_setup')
          .upsert(payloadCompativel, { onConflict: 'loja_id' });
      }
      const localAtualizado = salvarSetupFallbackLocal(lojaId, dados);
      dispararEventoJanela(EVENTO_ONBOARDING_ATUALIZADO, { lojaId });
      return localAtualizado;
    }

    if (isErroTabelaAusente(error) || isErroRlsOuPermissao(error)) {
      if (!isErroTabelaAusente(error)) {
        logger.warn(
          'onboardingSetupService',
          'salvarRespostasOnboarding:upsert',
          `[${error.code || 'SEM_CODIGO'}] ${
            error.message || 'Erro de permissão/RLS ao salvar preferências'
          }`,
          {
            loja_id: lojaId,
            codigo_erro: error.code ?? null,
          }
        );
      }
      const localAtualizado = salvarSetupFallbackLocal(lojaId, dados);
      dispararEventoJanela(EVENTO_ONBOARDING_ATUALIZADO, { lojaId });
      return localAtualizado;
    }

    logger.error('onboardingSetupService', 'salvarRespostasOnboarding:upsert', error, {
      loja_id: lojaId,
      codigo_erro: error.code ?? null,
    });
    throw new Error('Não foi possível salvar as preferências do questionário inicial.');
  }

  salvarSetupFallbackLocal(lojaId, dados);
  const normalizado = normalizarRegistroSetup(lojaId, data as Partial<OnboardingSetupRecord>);
  dispararEventoJanela(EVENTO_ONBOARDING_ATUALIZADO, { lojaId });
  return normalizado;
}

/**
 * Atualiza diretamente colunas operacionais homologadas da tabela public.lojas
 * a partir dos controles imediatos do questionário inicial.
 */
export async function atualizarConfiguracaoDiretaLoja(
  lojaId: string,
  camposLoja: CamposDiretosLojaOnboarding
): Promise<void> {
  if (!lojaId) {
    throw new Error('Identificador da loja não informado.');
  }

  const payloadUpdate: Record<string, unknown> = {};
  if (camposLoja.tipos_venda !== undefined) {
    payloadUpdate.tipos_venda = camposLoja.tipos_venda;
  }
  if (typeof camposLoja.status_em_separacao === 'boolean') {
    payloadUpdate.status_em_separacao = camposLoja.status_em_separacao;
  }
  if (typeof camposLoja.status_em_expedicao === 'boolean') {
    payloadUpdate.status_em_expedicao = camposLoja.status_em_expedicao;
  }
  if (typeof camposLoja.status_aguardando_envio === 'boolean') {
    payloadUpdate.status_aguardando_envio = camposLoja.status_aguardando_envio;
  }
  if (typeof camposLoja.status_enviado === 'boolean') {
    payloadUpdate.status_enviado = camposLoja.status_enviado;
  }
  if (typeof camposLoja.status_entregue === 'boolean') {
    payloadUpdate.status_entregue = camposLoja.status_entregue;
  }
  if (typeof camposLoja.status_pronto_para_retirar === 'boolean') {
    payloadUpdate.status_pronto_para_retirar = camposLoja.status_pronto_para_retirar;
  }
  if (typeof camposLoja.caderneta_ativa === 'boolean') {
    payloadUpdate.caderneta_ativa = camposLoja.caderneta_ativa;
  }
  if (typeof camposLoja.exigir_pesagem_previa_pagamento === 'boolean') {
    payloadUpdate.exigir_pesagem_previa_pagamento = camposLoja.exigir_pesagem_previa_pagamento;
  }

  if (Object.keys(payloadUpdate).length === 0) return;

  await garantirSessaoAuthAtiva(lojaId);

  const { error } = await supabase
    .from('lojas')
    .update(payloadUpdate)
    .eq('id', lojaId);

  if (error) {
    const erroColunaTiposVenda =
      camposLoja.tipos_venda !== undefined &&
      (error.code === '42703' ||
        error.code === 'PGRST204' ||
        (error.message || '').includes('tipos_venda'));

    if (erroColunaTiposVenda) {
      const { data: lojaAtual } = await supabase
        .from('lojas')
        .select('configuracoes_extras')
        .eq('id', lojaId)
        .maybeSingle();

      const extrasAtuais =
        ((lojaAtual as { configuracoes_extras?: ConfiguracoesExtrasLoja } | null)
          ?.configuracoes_extras) || {};

      const { tipos_venda: _ignorado, ...restante } = payloadUpdate;
      const payloadFallback: Record<string, unknown> = {
        ...restante,
        configuracoes_extras: {
          ...extrasAtuais,
          tipos_venda_ativos: camposLoja.tipos_venda,
        },
      };

      const { error: erroFallback } = await supabase
        .from('lojas')
        .update(payloadFallback)
        .eq('id', lojaId);

      if (erroFallback) {
        throw new Error('Não foi possível salvar a configuração operacional da loja.');
      }
    } else {
      throw new Error('Não foi possível salvar a configuração operacional da loja.');
    }
  }

  dispararEventoJanela(EVENTO_ONBOARDING_ATUALIZADO, { lojaId });
}

/**
 * Persiste Segmento de Atuação e Especialidade/Foco Principal na mesma estrutura de
 * `ConfiguracoesLoja.tsx` (`lojas.configuracoes_extras.perfil_negocio` e `ia`) para
 * calibrar todas as IAs do sistema e marca `perfil_ia_conferido = true`.
 */
export async function salvarPerfilNegocioIALoja(
  lojaId: string,
  params: {
    segmento: string;
    descricao_especialidade: string;
    tom_voz?: 'consultivo' | 'tecnico' | 'amigavel' | 'formal';
  }
): Promise<void> {
  if (!lojaId) {
    throw new Error('Identificador da loja não informado.');
  }

  await garantirSessaoAuthAtiva(lojaId);

  const { data: lojaAtual, error: erroConsulta } = await supabase
    .from('lojas')
    .select('configuracoes_extras')
    .eq('id', lojaId)
    .maybeSingle();

  if (erroConsulta) {
    throw new Error('Não foi possível ler as configurações atuais da loja.');
  }

  const extrasAtuais =
    ((lojaAtual as { configuracoes_extras?: ConfiguracoesExtrasLoja } | null)
      ?.configuracoes_extras) || {};

  const segmentoLimpo = (params.segmento || 'geral').trim() || 'geral';
  const especialidadeLimpa = (params.descricao_especialidade || '').trim();
  const tomVozFinal: 'consultivo' | 'tecnico' | 'amigavel' | 'formal' =
    params.tom_voz || extrasAtuais.perfil_negocio?.tom_voz || 'consultivo';

  const novasExtras: ConfiguracoesExtrasLoja = {
    ...extrasAtuais,
    perfil_negocio: {
      ...(extrasAtuais.perfil_negocio || {}),
      segmento: segmentoLimpo,
      descricao_especialidade: especialidadeLimpa,
      tom_voz: tomVozFinal,
    },
    ia: {
      ...(extrasAtuais.ia || {}),
      segmento: segmentoLimpo,
    },
  };

  const { error: erroUpdate } = await supabase
    .from('lojas')
    .update({ configuracoes_extras: novasExtras })
    .eq('id', lojaId);

  if (erroUpdate) {
    throw new Error('Não foi possível salvar a identidade de negócio da loja.');
  }

  await salvarRespostasOnboarding(lojaId, { perfil_ia_conferido: true });
  dispararEventoJanela(EVENTO_ONBOARDING_ATUALIZADO, { lojaId });
}

/**
 * Avalia em paralelo no Supabase o estado real de implantação de todas as etapas
 * essenciais (Grupo 1) e opcionais selecionadas pelo lojista (Grupo 2).
 */
export async function avaliarProgressoCompletoOnboarding(
  lojaId: string,
  opcoes?: OpcoesAvaliacaoOnboarding
): Promise<StatusOnboardingCompleto> {
  if (!lojaId) {
    throw new Error('Identificador da loja inválido para avaliar o progresso.');
  }

  const consultarContagemSegura = async (
    queryPromise: PromiseLike<{ count: number | null; error: unknown }>
  ): Promise<number> => {
    try {
      const { count, error } = await queryPromise;
      if (error) return 0;
      return count ?? 0;
    } catch {
      return 0;
    }
  };

  const consultarShippingSeguro = async (): Promise<ShippingOnboardingQueryRow | null> => {
    try {
      const { data, error } = await supabase
        .from('loja_shipping_configs')
        .select('*')
        .eq('loja_id', lojaId)
        .maybeSingle();
      if (error) return null;
      return (data as ShippingOnboardingQueryRow | null) ?? null;
    } catch {
      return null;
    }
  };

  const consultarFormasPagamentoSeguras = async (): Promise<FormaPagamentoOnboardingQueryRow[]> => {
    try {
      const { data, error } = await supabase
        .from('formas_pagamento')
        .select('id, tipo, nome, ativo, exibir_catalogo')
        .eq('loja_id', lojaId)
        .eq('ativo', true);
      if (error || !data) return [];
      return data as FormaPagamentoOnboardingQueryRow[];
    } catch {
      return [];
    }
  };

  const consultarMetasSeguras = async (): Promise<LojaMetasOnboardingQueryRow | null> => {
    try {
      const { data, error } = await supabase
        .from('loja_metas')
        .select('meta_faturamento, meta_pedidos, meta_lucro_liquido, meta_ticket_medio')
        .eq('loja_id', lojaId)
        .maybeSingle();
      if (error) return null;
      return (data as LojaMetasOnboardingQueryRow | null) ?? null;
    } catch {
      return null;
    }
  };

  const consultarLojaSegura = async (): Promise<LojaOnboardingQueryRow | null> => {
    try {
      const { data, error } = await supabase
        .from('lojas')
        .select('*')
        .eq('id', lojaId)
        .maybeSingle();
      if (error) return null;
      return (data as LojaOnboardingQueryRow | null) ?? null;
    } catch {
      return null;
    }
  };

  const sessaoAtiva = await garantirSessaoAuthAtiva(lojaId);

  const [
    setupResultado,
    lojaData,
    shippingConfig,
    formasPagamentoAtivas,
    countCategoriasAtivas,
    lojaMetas,
    countAppsEntrega,
    countTransportadoras,
    countMarketplaceConectadas,
    countProfissionais,
    countProdutosAgendamento,
    countProdutosPeso,
    countClientesFiadoCaderneta,
    countColaboradoresAtivos,
    countColaboradoresEquipe,
  ] = await Promise.all([
    consultarOuInicializarSetupLojaInterno(lojaId, sessaoAtiva),
    consultarLojaSegura(),
    consultarShippingSeguro(),
    consultarFormasPagamentoSeguras(),
    consultarContagemSegura(
      supabase
        .from('categorias')
        .select('id', { count: 'exact', head: true })
        .eq('loja_id', lojaId)
        .eq('ativo', true)
    ),
    consultarMetasSeguras(),
    consultarContagemSegura(
      supabase
        .from('apps_entrega')
        .select('id', { count: 'exact', head: true })
        .eq('loja_id', lojaId)
        .eq('ativo', true)
    ),
    consultarContagemSegura(
      supabase
        .from('transportadoras')
        .select('id', { count: 'exact', head: true })
        .eq('loja_id', lojaId)
        .eq('ativo', true)
    ),
    consultarContagemSegura(
      supabase
        .from('marketplace_contas')
        .select('id', { count: 'exact', head: true })
        .eq('loja_id', lojaId)
        .eq('status_conexao', 'conectado')
    ),
    consultarContagemSegura(
      supabase
        .from('usuarios_loja')
        .select('id', { count: 'exact', head: true })
        .eq('loja_id', lojaId)
        .eq('presta_servicos', true)
    ),
    consultarContagemSegura(
      supabase
        .from('produtos')
        .select('id', { count: 'exact', head: true })
        .eq('loja_id', lojaId)
        .eq('requer_agendamento', true)
    ),
    consultarContagemSegura(
      supabase
        .from('produtos')
        .select('id', { count: 'exact', head: true })
        .eq('loja_id', lojaId)
        .or('venda_por_peso.eq.true,permite_fracionado.eq.true')
    ),
    consultarContagemSegura(
      supabase
        .from('clientes')
        .select('id', { count: 'exact', head: true })
        .eq('loja_id', lojaId)
        .or('permite_fiado.eq.true,permite_caderneta.eq.true')
    ),
    consultarContagemSegura(
      supabase
        .from('usuarios_loja')
        .select('id', { count: 'exact', head: true })
        .eq('loja_id', lojaId)
        .eq('ativo', true)
    ),
    consultarContagemSegura(
      supabase
        .from('usuarios_loja')
        .select('id', { count: 'exact', head: true })
        .eq('loja_id', lojaId)
        .eq('ativo', true)
        .neq('perfil', 'owner')
    ),
  ]);

  const { setup, persistidoNoBanco } = setupResultado;
  const lojaEfetiva: Partial<LojaOnboardingQueryRow> | null = lojaData ?? opcoes?.lojaFallback ?? null;

  const extras = lojaEfetiva?.configuracoes_extras || {};
  const tiposVendaBruto = lojaEfetiva?.tipos_venda ?? extras.tipos_venda_ativos ?? null;
  const tiposVendaSnapshot: TiposVendaLoja = {
    varejo: tiposVendaBruto ? Boolean(tiposVendaBruto.varejo) : true,
    atacado: tiposVendaBruto ? Boolean(tiposVendaBruto.atacado) : true,
    distribuidor: tiposVendaBruto ? Boolean(tiposVendaBruto.distribuidor) : true,
  };

  const statusAtivosExtras = extras.status_pedidos_ativos || {};
  const resolverFlagStatus = (
    colunaDireta: boolean | null | undefined,
    fallbackExtra: boolean | undefined
  ): boolean => {
    if (typeof colunaDireta === 'boolean') return colunaDireta;
    if (typeof fallbackExtra === 'boolean') return fallbackExtra;
    return true;
  };

  const whatsappAutoConfigurado = Boolean(lojaEfetiva?.whatsapp_auto_ativo === true);
  const whatsappIaReceptivaConfigurado = Boolean(
    lojaEfetiva?.whatsapp_ia_receptiva_ativa === true ||
      (lojaEfetiva?.ia_whatsapp_ativa === true &&
        Boolean(lojaEfetiva?.meta_phone_number_id?.trim() || lojaEfetiva?.meta_access_token?.trim()))
  );

  const segmentoAtual =
    extras.perfil_negocio?.segmento ||
    extras.ia?.segmento ||
    'geral';
  const especialidadeAtual = (extras.perfil_negocio?.descricao_especialidade || '').trim();
  const tomVozAtual = extras.perfil_negocio?.tom_voz || 'consultivo';
  const perfilIaConfigurado = Boolean(
    setup.perfil_ia_conferido ||
      especialidadeAtual.length > 0 ||
      (segmentoAtual && segmentoAtual !== 'geral')
  );

  const lojaSnapshot: SnapshotLojaOnboarding = {
    tipos_venda: tiposVendaSnapshot,
    status_em_separacao: resolverFlagStatus(
      lojaEfetiva?.status_em_separacao,
      statusAtivosExtras.em_separacao ?? statusAtivosExtras.em_producao
    ),
    status_em_expedicao: resolverFlagStatus(
      lojaEfetiva?.status_em_expedicao,
      statusAtivosExtras.em_expedicao
    ),
    status_aguardando_envio: resolverFlagStatus(
      lojaEfetiva?.status_aguardando_envio,
      statusAtivosExtras.aguardando_envio
    ),
    status_enviado: resolverFlagStatus(
      lojaEfetiva?.status_enviado,
      statusAtivosExtras.enviado ?? statusAtivosExtras.saiu_para_entrega
    ),
    status_entregue: resolverFlagStatus(
      lojaEfetiva?.status_entregue,
      statusAtivosExtras.entregue
    ),
    status_pronto_para_retirar: resolverFlagStatus(
      lojaEfetiva?.status_pronto_para_retirar,
      statusAtivosExtras.pronto_para_retirar
    ),
    exigir_pesagem_previa_pagamento: Boolean(lojaEfetiva?.exigir_pesagem_previa_pagamento),
    caderneta_ativa: Boolean(lojaEfetiva?.caderneta_ativa),
    trabalha_com_agenda: lojaEfetiva?.trabalha_com_agenda === true,
    aceita_pedidos_online: Boolean(lojaEfetiva?.aceita_pedidos_online),
    whatsapp_auto_ativo: whatsappAutoConfigurado,
    whatsapp_ia_receptiva_ativa: whatsappIaReceptivaConfigurado,
    gemini_configurado: Boolean(
      (lojaEfetiva?.gemini_api_key || extras.ia?.gemini_api_key || '').trim()
    ),
    serper_configurado: Boolean(
      (lojaEfetiva?.serper_api_key || extras.ia?.serper_api_key || '').trim()
    ),
    segmento_negocio: segmentoAtual,
    especialidade_negocio: especialidadeAtual,
    tom_voz_rubi: tomVozAtual,
    perfil_ia_configurado: perfilIaConfigurado,
    meta_faturamento: Number(lojaMetas?.meta_faturamento || 0),
    meta_pedidos: Number(lojaMetas?.meta_pedidos || 0),
    meta_lucro_liquido: Number(lojaMetas?.meta_lucro_liquido || 0),
    colaboradores_ativos_count: countColaboradoresAtivos,
    colaboradores_equipe_count: countColaboradoresEquipe,
  };

  const catalogoOnlineConfigurado = lojaEfetiva?.aceita_pedidos_online === true;
  const gatewayPagamentoConfigurado = verificarGatewayPagamentoConfigurado(
    formasPagamentoAtivas,
    extras.pagamentos_digitais
  );
  const melhorEnvioConfigurado = Boolean(
    shippingConfig?.melhor_envio_ativo === true && shippingConfig?.melhor_envio_token?.trim()
  );
  const uberDirectConfigurado = Boolean(
    shippingConfig?.uber_ativo === true &&
      (shippingConfig?.uber_customer_id?.trim() || shippingConfig?.uber_client_id?.trim())
  );
  const appsCorridaConfigurado = countAppsEntrega >= 1;
  const transportadorasManuaisConfigurado =
    shippingConfig?.frete_proprio_ativo === true || countTransportadoras >= 1;
  const mercadoLivreConfigurado = countMarketplaceConectadas >= 1;
  const trabalhaComAgenda = lojaEfetiva?.trabalha_com_agenda === true;
  const agendamentoServicosConfigurado =
    trabalhaComAgenda && (countProfissionais >= 1 || countProdutosAgendamento >= 1);
  const vendaPorPesoConfigurado =
    lojaSnapshot.exigir_pesagem_previa_pagamento || countProdutosPeso >= 1;
  const cadernetaFiadoConfigurado =
    lojaSnapshot.caderneta_ativa || countClientesFiadoCaderneta >= 1;

  const sincronizarDetectados = opcoes?.sincronizarDetectados !== false;
  const ignorarSet = new Set<ChaveInteresseOnboarding>(opcoes?.ignorarAutoDeteccaoChaves ?? []);
  const modulosDetectados: Partial<Record<ChaveInteresseOnboarding, boolean>> = {
    interesse_ia_gemini: lojaSnapshot.gemini_configurado,
    interesse_busca_fotos_serper: lojaSnapshot.serper_configurado,
    interesse_catalogo_online: catalogoOnlineConfigurado,
    interesse_gateway_pagamento: gatewayPagamentoConfigurado,
    interesse_melhor_envio: melhorEnvioConfigurado,
    interesse_uber_direct: uberDirectConfigurado,
    interesse_apps_corrida: appsCorridaConfigurado,
    interesse_transportadoras_manuais: transportadorasManuaisConfigurado,
    interesse_whatsapp_auto: whatsappAutoConfigurado,
    interesse_whatsapp_ia_receptiva: whatsappIaReceptivaConfigurado,
    interesse_mercado_livre: mercadoLivreConfigurado,
    interesse_agendamento_servicos: agendamentoServicosConfigurado,
    interesse_venda_por_peso: vendaPorPesoConfigurado,
    interesse_caderneta_fiado: cadernetaFiadoConfigurado,
  };

  const patchAutoSync: AtualizacaoOnboardingSetupPayload = {};
  if (sincronizarDetectados) {
    const chavesEssenciaisInteresse = new Set<ChaveInteresseOnboarding>([
      'interesse_ia_gemini',
      'interesse_busca_fotos_serper',
    ]);
    (
      Object.entries(modulosDetectados) as Array<[ChaveInteresseOnboarding, boolean | undefined]>
    ).forEach(([chave, detectado]) => {
      if (ignorarSet.has(chave) || detectado === undefined) return;
      if (chavesEssenciaisInteresse.has(chave)) {
        if (detectado === true && setup[chave] !== true) {
          patchAutoSync[chave] = true;
        }
      } else if (Boolean(setup[chave]) !== Boolean(detectado)) {
        patchAutoSync[chave] = Boolean(detectado);
      }
    });
  }

  const setupEfetivo: OnboardingSetupRecord = {
    ...setup,
    ...patchAutoSync,
  };

  if (Object.keys(patchAutoSync).length > 0 && sessaoAtiva && persistidoNoBanco) {
    try {
      const { error: erroSync } = await supabase
        .from('loja_onboarding_setup')
        .upsert(
          {
            loja_id: lojaId,
            ...patchAutoSync,
            atualizado_em: new Date().toISOString(),
          },
          { onConflict: 'loja_id' }
        );

      if (erroSync) {
        if (isErroTabelaAusente(erroSync)) {
          salvarSetupFallbackLocal(lojaId, patchAutoSync);
        } else {
          logger.warn(
            'onboardingSetupService',
            'avaliarProgresso:autoSync',
            `[${erroSync.code || 'SEM_CODIGO'}] ${
              erroSync.message || 'Falha na sincronização silenciosa do onboarding'
            }`,
            {
              loja_id: lojaId,
              codigo_erro: erroSync.code ?? null,
            }
          );
        }
      }
    } catch {
      // Degradação graciosa: mantém o setupEfetivo em memória sem interromper o diagnóstico
    }
  }

  const colaboradoresConfigurado =
    countColaboradoresEquipe >= 1 ||
    countColaboradoresAtivos >= 2 ||
    Boolean(setupEfetivo.opera_sozinho);

  // Grupo 1 — Essenciais (sempre exibidas)
  const etapasEssenciais: EtapaOnboardingItem[] = [
    {
      id: 'ia_gemini',
      grupo: 'essencial',
      ordem: 1,
      titulo: 'Inteligência Artificial Base (Google Gemini)',
      descricao:
        'Libera a Rubi IA para ajudar no setup, gerar descrições de produtos e atender clientes automaticamente.',
      concluido: lojaSnapshot.gemini_configurado,
      rotaDestino: '/config?tab=dados-loja',
      chaveInteresse: 'interesse_ia_gemini',
      interesseAtivo: true,
      acaoDiretaModal: 'gemini',
    },
    {
      id: 'busca_fotos_serper',
      grupo: 'essencial',
      ordem: 2,
      titulo: 'Busca Automática de Fotos (Serper.dev)',
      descricao:
        'Busca fotos profissionais pelo código de barras ou nome do produto em segundos e alimenta o Radar de Preços.',
      concluido: lojaSnapshot.serper_configurado,
      rotaDestino: '/config?tab=dados-loja',
      chaveInteresse: 'interesse_busca_fotos_serper',
      interesseAtivo: true,
      acaoDiretaModal: 'serper',
    },
    {
      id: 'perfil_negocio_ia',
      grupo: 'essencial',
      ordem: 3,
      titulo: 'Identidade do Negócio (Segmento & Especialidade para IAs)',
      descricao:
        'Define o nicho e o foco principal da loja para calibrar o Cadastro Inteligente, Busca de Fotos, Assistente Executiva Rubi e Vendedora IA.',
      concluido: perfilIaConfigurado,
      rotaDestino: '/config?tab=dados-loja',
      interesseAtivo: true,
    },
    {
      id: 'dados_loja_cep',
      grupo: 'essencial',
      ordem: 4,
      titulo: 'Dados da Loja e Endereço/CEP de Origem',
      descricao:
        'WhatsApp comercial e CEP de origem são obrigatórios para calcular fretes, rotas locais e retirada na loja.',
      concluido: Boolean(
        lojaEfetiva?.whatsapp?.trim() &&
          (lojaEfetiva?.endereco_cep?.trim() || shippingConfig?.origem_cep?.trim())
      ),
      rotaDestino: '/config?tab=dados-loja',
      interesseAtivo: true,
    },
    {
      id: 'tipos_venda',
      grupo: 'essencial',
      ordem: 5,
      titulo: 'Tabelas de Preço e Tipos de Venda',
      descricao:
        'Defina se sua operação trabalha com Varejo, Atacado, Autoatacado / Distribuidor ou mais de uma tabela.',
      concluido: Boolean(
        tiposVendaBruto &&
          (tiposVendaBruto.varejo || tiposVendaBruto.atacado || tiposVendaBruto.distribuidor)
      ),
      rotaDestino: '/config?tab=tipos-venda',
      interesseAtivo: true,
    },
    {
      id: 'formas_pagamento',
      grupo: 'essencial',
      ordem: 6,
      titulo: 'Formas de Pagamento e Taxas de Maquininha',
      descricao:
        'Cadastre Pix, Dinheiro, Cartões e taxas de operadora para apuração fiel do lucro líquido no cockpit.',
      concluido: formasPagamentoAtivas.length >= 1,
      rotaDestino: '/config?tab=pagamentos',
      interesseAtivo: true,
    },
    {
      id: 'status_pedidos',
      grupo: 'essencial',
      ordem: 7,
      titulo: 'Fluxo de Status dos Pedidos',
      descricao:
        'Os status Pendente, Confirmado, Cancelado e Concluído já são padrão do sistema. Personalize etapas opcionais do Kanban apenas se desejar.',
      concluido: true,
      rotaDestino: '/config?tab=pedidos-vendas',
      interesseAtivo: true,
    },
    {
      id: 'categorias_unidades',
      grupo: 'essencial',
      ordem: 8,
      titulo: 'Categorias e Unidades de Medida',
      descricao:
        'Organize seu catálogo em departamentos e valide as unidades de medida (UN, KG, CX, LT) usadas no estoque.',
      concluido: countCategoriasAtivas >= 1,
      rotaDestino: '/auxiliares?tab=unidades',
      interesseAtivo: true,
      acaoDiretaModal: 'categorias',
    },
    {
      id: 'metas_loja',
      grupo: 'essencial',
      ordem: 9,
      titulo: 'Metas da Loja (Cockpit Executivo F1)',
      descricao:
        'Sem metas definidas, os velocímetros do Dashboard / Cockpit F1 ficam zerados (0.00). Defina sua meta mensal para acompanhar o ritmo real.',
      concluido: Number(lojaMetas?.meta_faturamento || 0) > 0,
      rotaDestino: '/config?tab=metas',
      interesseAtivo: true,
    },
    {
      id: 'colaboradores',
      grupo: 'essencial',
      ordem: 10,
      titulo: 'Cadastro de Colaboradores',
      descricao:
        'Adicione vendedores, operadores de caixa, técnicos ou prestadores de serviço',
      concluido: colaboradoresConfigurado,
      rotaDestino: '/users',
      interesseAtivo: true,
    },
  ];

  // Grupo 2 — Módulos e Integrações Opcionais (ativos no termômetro quando configurados)
  const etapasOpcionaisTodas: EtapaOnboardingItem[] = [
    {
      id: 'catalogo_online',
      grupo: 'opcional',
      ordem: 9,
      titulo: 'Vitrine Virtual (Catálogo Online PWA)',
      descricao:
        'Receba pedidos 24h por dia com link próprio e vitrine responsiva sem precisar atender um por um no chat.',
      concluido: catalogoOnlineConfigurado,
      rotaDestino: '/catalog-config',
      chaveInteresse: 'interesse_catalogo_online',
      interesseAtivo: catalogoOnlineConfigurado,
    },
    {
      id: 'gateway_pagamento',
      grupo: 'opcional',
      ordem: 10,
      titulo: 'Gateway de Pagamentos Online (Mercado Pago, Asaas e outros)',
      descricao:
        'Receba via Pix dinâmico com baixa automática instantânea e Cartão de Crédito/Débito direto no catálogo.',
      concluido: gatewayPagamentoConfigurado,
      rotaDestino: '/config?tab=pagamentos',
      chaveInteresse: 'interesse_gateway_pagamento',
      interesseAtivo: gatewayPagamentoConfigurado,
    },
    {
      id: 'melhor_envio',
      grupo: 'opcional',
      ordem: 11,
      titulo: 'Cotação Automática Nacional (Melhor Envio)',
      descricao:
        'Seu cliente calcula PAC, SEDEX e Jadlog direto no catálogo e fecha o pedido sozinho, sem intervenção humana para cotar frete, além de emitir etiquetas em 1 clique.',
      concluido: melhorEnvioConfigurado,
      rotaDestino: '/config/frete',
      chaveInteresse: 'interesse_melhor_envio',
      interesseAtivo: melhorEnvioConfigurado,
    },
    {
      id: 'uber_direct',
      grupo: 'opcional',
      ordem: 12,
      titulo: 'Entregas Expressas Locais (Uber Direct)',
      descricao:
        'Chame entregadores parceiros ponto a ponto automaticamente no fechamento do pedido com rastreio ao vivo.',
      concluido: uberDirectConfigurado,
      rotaDestino: '/config/frete',
      chaveInteresse: 'interesse_uber_direct',
      interesseAtivo: uberDirectConfigurado,
    },
    {
      id: 'apps_corrida',
      grupo: 'opcional',
      ordem: 13,
      titulo: 'Apps de Corrida Externos (99, Lalamove, etc.)',
      descricao:
        'Registre o código da corrida e o link de acompanhamento diretamente nos pedidos despachados.',
      concluido: appsCorridaConfigurado,
      rotaDestino: '/config/frete',
      chaveInteresse: 'interesse_apps_corrida',
      interesseAtivo: appsCorridaConfigurado,
    },
    {
      id: 'transportadoras_manuais',
      grupo: 'opcional',
      ordem: 14,
      titulo: 'Transportadoras Manuais / Frota Própria',
      descricao:
        'Cadastre transportadoras próprias (ônibus, Braspress, motoboy da loja) com link de rastreio personalizado.',
      concluido: transportadorasManuaisConfigurado,
      rotaDestino: '/config/frete',
      chaveInteresse: 'interesse_transportadoras_manuais',
      interesseAtivo: transportadorasManuaisConfigurado,
    },
    {
      id: 'whatsapp_auto',
      grupo: 'opcional',
      ordem: 16,
      titulo: 'Notificações Automáticas no WhatsApp (Meta Cloud API)',
      descricao:
        'Avise o cliente automaticamente quando o pedido sair para entrega, ficar pronto para retirada ou lembrar do agendamento.',
      concluido: whatsappAutoConfigurado,
      rotaDestino: '/config?tab=whatsapp-ia',
      chaveInteresse: 'interesse_whatsapp_auto',
      interesseAtivo: whatsappAutoConfigurado,
    },
    {
      id: 'whatsapp_ia_receptiva',
      grupo: 'opcional',
      ordem: 17,
      titulo: 'Robô Atendente / Vendedora IA no WhatsApp (Meta Cloud API)',
      descricao:
        'Atendimento receptivo 24h com IA respondendo dúvidas, consultando estoque e fechando pedidos. Exige número exclusivo na API Oficial da Meta (não pode ser usado no app WhatsApp do celular).',
      concluido: whatsappIaReceptivaConfigurado,
      rotaDestino: '/config?tab=whatsapp-ia',
      chaveInteresse: 'interesse_whatsapp_ia_receptiva',
      interesseAtivo: whatsappIaReceptivaConfigurado,
    },
    {
      id: 'mercado_livre',
      grupo: 'opcional',
      ordem: 16,
      titulo: 'Integração com Mercado Livre',
      descricao:
        'Sincronize o estoque físico com seus anúncios em tempo real e imprima etiquetas direto pela Rubi.',
      concluido: mercadoLivreConfigurado,
      rotaDestino: '/config?tab=parceiros',
      chaveInteresse: 'interesse_mercado_livre',
      interesseAtivo: mercadoLivreConfigurado,
    },
    ...(trabalhaComAgenda
      ? [
          {
            id: 'agendamento_servicos' as const,
            grupo: 'opcional' as const,
            ordem: 17,
            titulo: 'Agendamento de Serviços com Hora Marcada',
            descricao:
              'Agenda online 24h por profissional, sem conflito de horário e confirmação rápida via link no WhatsApp.',
            concluido: agendamentoServicosConfigurado,
            rotaDestino: '/users',
            chaveInteresse: 'interesse_agendamento_servicos' as const,
            interesseAtivo: agendamentoServicosConfigurado,
          },
        ]
      : []),
    {
      id: 'venda_por_peso',
      grupo: 'opcional',
      ordem: 18,
      titulo: 'Venda por Peso / Balança',
      descricao:
        'O cliente pede no catálogo e o pagamento só é liberado após você pesar o item na balança e confirmar o valor exato.',
      concluido: vendaPorPesoConfigurado,
      rotaDestino: '/catalog-config',
      chaveInteresse: 'interesse_venda_por_peso',
      interesseAtivo: vendaPorPesoConfigurado,
    },
    {
      id: 'caderneta_fiado',
      grupo: 'opcional',
      ordem: 19,
      titulo: 'Caderneta de Mercadinho / Fiado',
      descricao:
        'Conta corrente mensal com dia fixo de vencimento, controle de saldo devedor e limite de crédito por cliente.',
      concluido: cadernetaFiadoConfigurado,
      rotaDestino: '/config?tab=pagamentos',
      chaveInteresse: 'interesse_caderneta_fiado',
      interesseAtivo: cadernetaFiadoConfigurado,
    },
  ];

  const etapasOpcionaisAtivas = etapasOpcionaisTodas.filter((etapa) => etapa.concluido);
  const etapasAtivas: EtapaOnboardingItem[] = [
    ...etapasEssenciais,
    ...etapasOpcionaisAtivas,
  ].map((etapa, idx) => ({
    ...etapa,
    ordem: idx + 1,
  }));

  const totalAtivas = etapasAtivas.length;
  const totalConcluidas = etapasAtivas.filter((etapa) => etapa.concluido).length;
  const percentual = totalAtivas > 0 ? Math.round((totalConcluidas / totalAtivas) * 100) : 100;
  const tudoPronto = totalAtivas > 0 && totalConcluidas === totalAtivas;
  const proximaEtapaPendente = etapasAtivas.find((etapa) => !etapa.concluido) || null;

  return {
    setup: setupEfetivo,
    lojaSnapshot,
    etapasEssenciais,
    etapasOpcionaisAtivas,
    etapasOpcionaisTodas,
    etapasAtivas,
    totalAtivas,
    totalConcluidas,
    percentual,
    tudoPronto,
    proximaEtapaPendente,
  };
}

/**
 * Registra no sessionStorage que o usuário saiu do Questionário para configurar uma etapa.
 */
export function registrarRetornoOnboarding(
  etapaId: EtapaOnboardingId,
  etapaTitulo?: string
): void {
  if (typeof window === 'undefined') return;
  const estado: RetornoOnboardingEstado = {
    etapaId,
    etapaTitulo: etapaTitulo || 'Etapa de Implantação',
    registradoEm: Date.now(),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY_RETORNO, JSON.stringify(estado));
  } catch {
    // Silencioso caso sessionStorage não esteja acessível
  }
  dispararEventoJanela(EVENTO_RETORNO_ONBOARDING, { estado });
}

/**
 * Consulta o estado atual do fluxo "Ida e Volta" sem consumi-lo.
 */
export function obterRetornoOnboardingAtivo(): RetornoOnboardingEstado | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_RETORNO);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RetornoOnboardingEstado>;
    if (!parsed.etapaId) return null;
    return {
      etapaId: parsed.etapaId,
      etapaTitulo: parsed.etapaTitulo || 'Etapa de Implantação',
      registradoEm: typeof parsed.registradoEm === 'number' ? parsed.registradoEm : Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Consome e limpa o marcador de retorno ao Questionário no sessionStorage.
 */
export function consumirRetornoOnboarding(): RetornoOnboardingEstado | null {
  const estado = obterRetornoOnboardingAtivo();
  limparRetornoOnboarding();
  return estado;
}

/**
 * Remove o marcador de retorno ao Questionário do sessionStorage.
 */
export function limparRetornoOnboarding(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY_RETORNO);
  } catch {
    // Silencioso
  }
  dispararEventoJanela(EVENTO_RETORNO_ONBOARDING, { estado: null });
}

/**
 * Dispara a abertura global do ModalQuestionarioOnboarding a partir de qualquer tela interna.
 */
export function solicitarAberturaQuestionarioOnboarding(
  etapaDestaque?: EtapaOnboardingId
): void {
  dispararEventoJanela(EVENTO_ABRIR_QUESTIONARIO, { etapaDestaque: etapaDestaque || null });
}

/**
 * Notifica que uma tela de configuração concluiu o salvamento com sucesso,
 * atualizando o diagnóstico e acionando o retorno automático se houver fluxo ativo.
 */
export function notificarConfiguracaoSalvaParaOnboarding(origem?: string): void {
  dispararEventoJanela(EVENTO_ONBOARDING_ATUALIZADO, { origem: origem || null });
  const retornoAtivo = obterRetornoOnboardingAtivo();
  if (retornoAtivo) {
    dispararEventoJanela(EVENTO_ONBOARDING_SALVO, {
      origem: origem || null,
      retorno: retornoAtivo,
    });
  }
}
