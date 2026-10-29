/**
 * Utilitários para geração e validação de payload Pix padrão BR Code (EMV QR Code / Banco Central do Brasil).
 */

/**
 * Calcula o checksum CRC-16/CCITT-FALSE (polinômio 0x1021, valor inicial 0xFFFF).
 * Padrão obrigatório da especificação Pix do Banco Central.
 */
export function calcularCrc16(payload: string): string {
  let crc = 0xffff;
  const polinomio = 0x1021;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polinomio) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Formata um campo no formato TLV (Tag-Length-Value).
 */
export function formatarCampoEmv(id: string, valor: string): string {
  const len = valor.length.toString().padStart(2, '0');
  return `${id}${len}${valor}`;
}

export interface GerarPayloadPixParams {
  chavePix: string;
  nomeRecebedor?: string;
  cidade?: string;
  valor?: number;
  identificador?: string;
}

/**
 * Gera a string do código Pix Copia e Cola (BR Code EMV) válida e interoperável com todos os bancos brasileiros.
 */
export function gerarPayloadPixEmv(params: GerarPayloadPixParams): string {
  const { chavePix, nomeRecebedor = 'LOJA', cidade = 'BRASIL', valor, identificador = '***' } = params;

  const chaveLimpa = (chavePix || '').trim();
  if (!chaveLimpa) return '';

  // Sanitização estrita: remover acentos e caracteres não ASCII
  const nomeLimpo = nomeRecebedor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .slice(0, 25)
    .trim() || 'LOJA';

  const cidadeLimpa = cidade
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .slice(0, 15)
    .trim() || 'BRASIL';

  // 00 - Payload Format Indicator (fixo "01")
  let payload = formatarCampoEmv('00', '01');

  // 26 - Merchant Account Information (GUI + Chave Pix)
  const gui = formatarCampoEmv('00', 'br.gov.bcb.pix');
  const chave = formatarCampoEmv('01', chaveLimpa);
  payload += formatarCampoEmv('26', `${gui}${chave}`);

  // 52 - Merchant Category Code (0000 = não especificado)
  payload += formatarCampoEmv('52', '0000');

  // 53 - Transaction Currency (986 = Real Brasileiro / BRL)
  payload += formatarCampoEmv('53', '986');

  // 54 - Transaction Amount (opcional no padrão, obrigatório se valor > 0)
  if (valor && valor > 0) {
    payload += formatarCampoEmv('54', valor.toFixed(2));
  }

  // 58 - Country Code (fixo "BR")
  payload += formatarCampoEmv('58', 'BR');

  // 59 - Merchant Name
  payload += formatarCampoEmv('59', nomeLimpo);

  // 60 - Merchant City
  payload += formatarCampoEmv('60', cidadeLimpa);

  // 62 - Additional Data Field Template (txid / identificador)
  const txidLimpo = (identificador || '***')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 25) || '***';
  const campoTxid = formatarCampoEmv('05', txidLimpo);
  payload += formatarCampoEmv('62', campoTxid);

  // 63 - CRC16 (Tag 63, comprimento 04, seguido pelo hash)
  const payloadParaCrc = `${payload}6304`;
  const crc = calcularCrc16(payloadParaCrc);

  return `${payloadParaCrc}${crc}`;
}
