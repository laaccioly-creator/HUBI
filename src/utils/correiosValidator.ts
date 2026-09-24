/**
 * Utilitário para validação e crítica de códigos de rastreamento dos Correios (SRO - Padrão UPU/Correios)
 * Formato padrão: 2 letras + 9 dígitos + BR (total de 13 caracteres alfanuméricos)
 *
 * Mapeamento de Prefixos Oficiais:
 * - SEDEX:
 *   - Família S: SA a SZ (SB, SL, SS, SW, SX, SJ, etc.)
 *   - Família D: DA a DZ (DJ, DM, DN, DP, DT, DU, DX, DF, etc.)
 *   - Família O: OA a OZ (OA, OB, OC, etc.)
 *   - Família F: FA, FB, FC (SEDEX Faturamento / Hoje)
 *   - Família A: AA, AB (Etiqueta Lógica SEDEX)
 *
 * - PAC (Prático, Acessível e Confiável):
 *   - Família P: PA a PZ (PA, PB, PC, PD, PE, PF, PG, PH, PI, PJ, etc.)
 *   - Família Q: QA a QZ (QA, QB, QC, QD, etc.)
 *   - Família A: AP (Encomenda PAC), AS (PAC Ação Social)
 *   - Família E: EC, ET (Encomenda PAC)
 *   - Outros: NV
 */

export interface ValidacaoRastreioCorreios {
  valido: boolean;
  motivo?: string;
  servicoDetectado?: 'SEDEX' | 'PAC' | 'OUTRO' | null;
  codigoFormatado: string;
}

/**
 * Detecta se o prefixo de 2 letras corresponde classicamente a SEDEX ou PAC
 */
export function detectarServicoPorCodigo(codigo: string | null | undefined): 'SEDEX' | 'PAC' | 'OUTRO' | null {
  if (!codigo) return null;
  const limpo = codigo.trim().toUpperCase().replace(/\s+/g, '');
  // Código oficial dos Correios (SRO) possui exatamente 13 caracteres e termina com BR
  if (limpo.length !== 13 || !limpo.endsWith('BR')) return null;

  // Valida estrutura alfanumérica básica dos Correios: 2 letras + 9 números + BR
  const regexEstrutura = /^[A-Z]{2}[0-9]{9}BR$/;
  if (!regexEstrutura.test(limpo)) return null;

  const prefixo = limpo.slice(0, 2);
  const p1 = prefixo[0];

  // Prefixos clássicos de PAC
  // P (PA-PZ), Q (QA-QZ), AP (Encomenda PAC), AS (PAC Social), EC, ET (PAC), NV
  if (
    p1 === 'P' ||
    p1 === 'Q' ||
    prefixo === 'AP' ||
    prefixo === 'AS' ||
    prefixo === 'EC' ||
    prefixo === 'ET' ||
    prefixo === 'NV'
  ) {
    return 'PAC';
  }

  // Prefixos clássicos de SEDEX
  // S (SA-SZ), D (DA-DZ), O (OA-OZ), F (FA-FC), AA, AB (Etiqueta Lógica SEDEX)
  if (
    p1 === 'S' ||
    p1 === 'D' ||
    p1 === 'O' ||
    p1 === 'F' ||
    prefixo === 'AA' ||
    prefixo === 'AB'
  ) {
    return 'SEDEX';
  }

  return 'OUTRO';
}

/**
 * Valida o código de rastreamento dos Correios contra o serviço selecionado (SEDEX ou PAC)
 */
export function validarRastreioCorreios(
  codigo: string | null | undefined,
  servico: 'SEDEX' | 'PAC' | string | null | undefined
): ValidacaoRastreioCorreios {
  const servicoAlvo = String(servico || '').trim().toUpperCase();
  const codigoFormatado = String(codigo || '').trim().toUpperCase().replace(/\s+/g, '');

  // 1. Crítica do Serviço
  if (!servicoAlvo) {
    return {
      valido: false,
      motivo: 'Selecione a modalidade dos Correios (SEDEX ou PAC).',
      servicoDetectado: detectarServicoPorCodigo(codigoFormatado),
      codigoFormatado
    };
  }

  if (servicoAlvo !== 'SEDEX' && servicoAlvo !== 'PAC') {
    return {
      valido: false,
      motivo: 'Modalidade inválida. Escolha SEDEX ou PAC.',
      servicoDetectado: detectarServicoPorCodigo(codigoFormatado),
      codigoFormatado
    };
  }

  // 2. Crítica de código vazio
  if (!codigoFormatado) {
    return {
      valido: false,
      motivo: `Informe o código de rastreamento dos Correios para o serviço ${servicoAlvo}.`,
      servicoDetectado: null,
      codigoFormatado: ''
    };
  }

  // 3. Crítica de tamanho
  if (codigoFormatado.length < 13) {
    return {
      valido: false,
      motivo: `Código incompleto (${codigoFormatado.length}/13 caracteres). Padrão Correios: 2 letras + 9 números + BR.`,
      servicoDetectado: detectarServicoPorCodigo(codigoFormatado),
      codigoFormatado
    };
  }

  if (codigoFormatado.length > 13) {
    return {
      valido: false,
      motivo: `Código com tamanho excedente (${codigoFormatado.length}/13 caracteres). O código oficial possui exatamente 13 caracteres.`,
      servicoDetectado: detectarServicoPorCodigo(codigoFormatado),
      codigoFormatado
    };
  }

  // 4. Crítica do sufixo do país (BR)
  if (!codigoFormatado.endsWith('BR')) {
    return {
      valido: false,
      motivo: 'O código dos Correios deve terminar com a sigla BR (Ex: AP492851719BR ou QB123456789BR).',
      servicoDetectado: detectarServicoPorCodigo(codigoFormatado),
      codigoFormatado
    };
  }

  // 5. Crítica da estrutura alfanumérica (2 letras + 9 dígitos + BR)
  const regexEstrutura = /^[A-Z]{2}[0-9]{9}BR$/;
  if (!regexEstrutura.test(codigoFormatado)) {
    return {
      valido: false,
      motivo: 'Formato inválido. Os caracteres centrais devem conter exatamente 9 números (Ex: AP492851719BR).',
      servicoDetectado: detectarServicoPorCodigo(codigoFormatado),
      codigoFormatado
    };
  }

  // 6. Crítica cruzada de prefixo correspondente ao serviço selecionado
  const prefixo = codigoFormatado.slice(0, 2);
  const servicoDetectado = detectarServicoPorCodigo(codigoFormatado);

  if (servicoAlvo === 'SEDEX') {
    if (servicoDetectado === 'PAC') {
      return {
        valido: false,
        motivo: `O prefixo "${prefixo}" pertence ao serviço PAC (ex: AP, PB, QB). Altere o serviço para PAC ou informe o código de SEDEX.`,
        servicoDetectado: 'PAC',
        codigoFormatado
      };
    }
  } else if (servicoAlvo === 'PAC') {
    if (servicoDetectado === 'SEDEX') {
      return {
        valido: false,
        motivo: `O prefixo "${prefixo}" pertence ao serviço SEDEX (ex: SB, DJ, OA). Altere o serviço para SEDEX ou informe o código de PAC.`,
        servicoDetectado: 'SEDEX',
        codigoFormatado
      };
    }
  }

  return {
    valido: true,
    servicoDetectado: servicoDetectado || (servicoAlvo as 'SEDEX' | 'PAC'),
    codigoFormatado
  };
}
