/**
 * HUBI Print & Receipt Engine
 * Suporta:
 * 1. Impressão Térmica / Bobina (58mm e 80mm) e Folhas A4 / PDF (Conforme modelo de recibo)
 * 2. Janela Dedicada de Impressão com Botão de Ação Direta (compatível com iframes e sandboxes)
 * 3. Impressão Bluetooth ESC/POS Direta (Web Bluetooth API)
 * 4. Formatação de Recibo em Texto para WhatsApp e E-mail
 */

import { Pedido, Loja, ItemPedido } from '../types';

export const formatarDataRecibo = (dataIso?: string | null): string => {
  if (!dataIso) return '';
  try {
    const d = new Date(dataIso);
    if (isNaN(d.getTime())) return '';
    const meses = [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    const dia = d.getDate();
    const mes = meses[d.getMonth()];
    const ano = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dia} de ${mes} de ${ano} às ${hora}:${min}`;
  } catch {
    return '';
  }
};

export const formatarVendedorRecibo = (pedido: Pedido): { label: string; valor: string; ehCatalogo: boolean; contato?: string } => {
  const ehCatalogo = pedido.origem === 'catalogo_online';
  if (ehCatalogo) {
    return {
      label: 'Canal / Vendedor',
      valor: 'Catálogo Online',
      ehCatalogo: true
    };
  }

  const nome = pedido.vendedor?.nome_completo 
    || (pedido as any).nome_vendedor 
    || (pedido.origem === 'pdv_mobile' ? 'PDV Mobile' : 'Caixa / Balcão');

  const contato = pedido.vendedor?.whatsapp_atendimento ? `Tel/Whats: ${pedido.vendedor.whatsapp_atendimento}` : undefined;

  return {
    label: 'Vendedor',
    valor: nome,
    ehCatalogo: false,
    contato
  };
};

export const ehPedidoFiado = (pedido: Pedido): boolean => {
  if (!pedido) return false;
  if (Array.isArray(pedido.pagamentos) && pedido.pagamentos.length > 0) {
    const temPagamentoFiado = pedido.pagamentos.some(p => 
      p.eh_pagamento_fiado === true || 
      p.forma_pagamento?.tipo === 'fiado' ||
      p.forma_pagamento?.nome?.toLowerCase().includes('fiado')
    );
    if (temPagamentoFiado) return true;
  }
  const formaStr = String((pedido as any).forma_pagamento || (pedido as any).tipo_pagamento || '').toLowerCase();
  if (formaStr.includes('fiado')) return true;
  return false;
};

export interface InfoPagamentoRecibo {
  foiPago: boolean;
  ehFiado: boolean;
  statusTexto: string;
  totalPago: number;
  pagamentosDetalhados: Array<{
    forma: string;
    origemGateway?: string;
    valor: number;
    parcelas?: number;
    dataPagamento?: string;
  }>;
}

export const obterDadosPagamentoRecibo = (pedido: Pedido): InfoPagamentoRecibo => {
  const ehFiado = ehPedidoFiado(pedido);

  const statusPag = pedido.status_pagamento 
    || (Number(pedido.saldo_devedor) <= 0 && Number(pedido.valor_pago) > 0 ? 'pago' 
    : pedido.status === 'concluido' && (!ehFiado || Number(pedido.saldo_devedor) <= 0) ? 'pago' 
    : 'aguardando_pagamento');

  const foiPago = statusPag === 'pago' || (Number(pedido.saldo_devedor) <= 0 && Number(pedido.valor_pago) > 0);
  const totalPago = Number(pedido.valor_pago || (foiPago ? pedido.valor_total : 0));

  const itensPag: InfoPagamentoRecibo['pagamentosDetalhados'] = [];

  if (Array.isArray(pedido.pagamentos) && pedido.pagamentos.length > 0) {
    let pagamentosFiltrados = [...pedido.pagamentos];

    // Se houver mais de um registro e o último já cobre o valor total ou pago do pedido,
    // desconsidera a forma provisória anterior que foi substituída (ex: cartão substituído por Pix)
    if (pagamentosFiltrados.length > 1) {
      pagamentosFiltrados.sort((a, b) => {
        const dataA = new Date(a.data_pagamento || a.criado_em || 0).getTime();
        const dataB = new Date(b.data_pagamento || b.criado_em || 0).getTime();
        return dataB - dataA;
      });

      const ultimo = pagamentosFiltrados[0];
      const valUltimo = Number(ultimo.valor || 0);
      const valNecessario = Number(pedido.valor_pago || pedido.valor_total || 0);
      if (valUltimo >= valNecessario && valNecessario > 0) {
        pagamentosFiltrados = [ultimo];
      }
    }

    for (const p of pagamentosFiltrados) {
      let nomeForma = p.forma_pagamento?.nome || 'Pagamento';
      const tipoForma = p.forma_pagamento?.tipo || '';
      const ehMercadoPago = nomeForma.toLowerCase().includes('mercado pago') 
        || tipoForma.toLowerCase().includes('mercado_pago')
        || (pedido.origem === 'catalogo_online' && (tipoForma === 'pix' || tipoForma === 'cartao_credito' || tipoForma === 'cartao_debito' || nomeForma.toLowerCase().includes('pix')));

      let origemGateway: string | undefined = undefined;
      if (ehMercadoPago) {
        origemGateway = 'Mercado Pago';
      } else if (pedido.origem === 'catalogo_online') {
        origemGateway = 'Catálogo Online';
      } else {
        origemGateway = 'PDV / Balcão';
      }

      itensPag.push({
        forma: nomeForma,
        origemGateway,
        valor: Number(p.valor || 0),
        parcelas: p.parcelas && p.parcelas > 1 ? p.parcelas : undefined,
        dataPagamento: p.data_pagamento
      });
    }
  } else if (foiPago) {
    // Fallback caso não haja registro na tabela filha pagamentos_pedido
    const ehCatalogo = pedido.origem === 'catalogo_online';
    itensPag.push({
      forma: ehCatalogo ? 'Mercado Pago Online' : 'Pagamento no Caixa',
      origemGateway: ehCatalogo ? 'Mercado Pago' : 'PDV / Balcão',
      valor: totalPago,
      dataPagamento: pedido.atualizado_em || pedido.data_venda
    });
  }

  return {
    foiPago,
    ehFiado,
    statusTexto: foiPago ? 'PAGO' : 'AGUARDANDO PAGAMENTO',
    totalPago,
    pagamentosDetalhados: itensPag
  };
};

export class PrintService {
  /**
   * Dispara a impressão do recibo formatado abrindo a janela de impressão nativa e/ou popup dedicado
   * (compatível com navegadores desktop, celulares e ambientes embutidos/iframes).
   */
  static printReceipt(pedido: Pedido, loja?: Loja | null, format: '58mm' | '80mm' | 'a4' = '80mm'): void {
    console.log('🖨️ [HUBI PrintService] Início da impressão de recibo:', { format, pedido, loja });

    if (!pedido) {
      console.warn('⚠️ [HUBI PrintService] Pedido inválido ou não fornecido para impressão!');
      return;
    }

    try {
      const isA4 = format === 'a4';
      const is58 = format === '58mm';
      const pageWidth = isA4 ? '210mm' : is58 ? '58mm' : '80mm';
      const maxCssWidth = isA4 ? '680px' : is58 ? '320px' : '380px';
      const nomeLoja = loja?.nome_fantasia || 'HUBI PDV';
      
      // Endereço e telefone da loja formatados
      const enderecoLinha = [
        loja?.endereco_logradouro,
        loja?.endereco_numero,
        loja?.endereco_bairro,
        loja?.endereco_cidade
      ].filter(Boolean).join(', ');

      const telefoneLoja = loja?.whatsapp || loja?.telefone;
      const lojaContatoFormatado = [enderecoLinha, telefoneLoja ? `+55 ${telefoneLoja}` : ''].filter(Boolean).join(' - ');

      // Dados do vendedor / canal de venda (antes do cliente)
      const vendedorInfo = formatarVendedorRecibo(pedido);

      // Dados de pagamento (após o valor total)
      const pagamentoInfo = obterDadosPagamentoRecibo(pedido);

      // Dados do cliente
      const clienteNome = pedido.cliente?.nome || (pedido as any).nome_cliente || 'Cliente';
      const clienteTelefone = pedido.cliente?.whatsapp || pedido.cliente?.telefone;
      const clienteContatoFormatado = clienteTelefone ? (clienteTelefone.startsWith('+') ? clienteTelefone : `+55 ${clienteTelefone}`) : '';

      const itens = (pedido.itens || (pedido as any).itens_pedido || []) as ItemPedido[];
      const totalQuantidade = itens.reduce((acc, item) => acc + Number(item.quantidade || 1), 0);
      const dataFormatada = formatarDataRecibo(pedido.data_venda || pedido.criado_em);

      console.log(`🖨️ [HUBI PrintService] Formatando ${itens.length} itens do pedido #${pedido.numero_pedido}...`);

      const itensHtml = itens.length > 0 ? itens.map(item => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 6px 0; font-size: ${isA4 ? '13px' : '11px'}; color: #1e293b; text-align: left; vertical-align: top;">
            <strong>${Number(item.quantidade || 1)}x</strong> ${item.nome_produto || 'Item'}
            ${item.rotulo_variacao ? ` / ${item.rotulo_variacao}` : ''}
          </td>
          <td style="padding: 6px 0; text-align: right; font-size: ${isA4 ? '13px' : '11px'}; font-weight: 600; color: #1e293b; white-space: nowrap; vertical-align: top;">
            R$ ${Number(item.subtotal || item.preco_venda_unitario || 0).toFixed(2)}
          </td>
        </tr>
      `).join('') : `
        <tr>
          <td colspan="2" style="padding: 8px 0; text-align: center; font-size: 11px; color: #64748b;">
            (Itens não detalhados)
          </td>
        </tr>
      `;

      const logoHtml = loja?.url_logo ? `
        <div style="text-align: center; margin-bottom: 12px;">
          <img src="${loja.url_logo}" alt="${nomeLoja}" style="max-height: ${isA4 ? '60px' : '45px'}; max-width: 200px; object-fit: contain;" />
        </div>
      ` : '';

      const receiptInnerHtml = `
        <div class="receipt-container" style="
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          color: #1e293b !important;
          background: #ffffff !important;
          font-size: ${isA4 ? '13px' : '11px'};
          line-height: 1.4;
          width: 100%;
          max-width: ${maxCssWidth};
          margin: 0 auto;
          padding: ${isA4 ? '35px 25px' : '12px 8px'};
          box-sizing: border-box;
        ">
          <!-- Logo da Loja -->
          ${logoHtml}

          <!-- Título RECIBO # -->
          <div style="text-align: center; margin-bottom: 18px;">
            <h2 style="margin: 0; font-size: ${isA4 ? '20px' : '16px'}; font-weight: 700; color: #334155; letter-spacing: 0.5px;">
              RECIBO #${pedido.numero_pedido}
            </h2>
          </div>

          <!-- Informações da Loja -->
          <div style="margin-bottom: 14px; font-size: ${isA4 ? '13px' : '11px'}; color: #334155;">
            <div style="font-weight: 700; text-transform: uppercase; margin-bottom: 2px;">
              ${nomeLoja}
            </div>
            ${lojaContatoFormatado ? `<div>${lojaContatoFormatado}</div>` : ''}
          </div>

          <!-- Informações do Vendedor / Origem (Antes do Cliente) -->
          <div style="margin-bottom: 12px; font-size: ${isA4 ? '13px' : '11px'}; color: #334155; border-bottom: 1px dashed #e2e8f0; padding-bottom: 6px;">
            <div style="font-size: ${isA4 ? '11px' : '9px'}; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1px;">
              ${vendedorInfo.label}:
            </div>
            <div style="font-weight: 700; color: #0f172a; font-size: ${isA4 ? '14px' : '12px'};">
              ${vendedorInfo.valor}
              ${vendedorInfo.ehCatalogo ? `<span style="font-size: ${isA4 ? '11px' : '9px'}; font-weight: 600; color: #059669; margin-left: 4px;">(Pedido Online)</span>` : ''}
            </div>
            ${vendedorInfo.contato ? `<div style="font-size: ${isA4 ? '11px' : '9px'}; color: #64748b; margin-top: 1px;">${vendedorInfo.contato}</div>` : ''}
          </div>

          <!-- Informações do Cliente -->
          <div style="margin-bottom: 16px; font-size: ${isA4 ? '13px' : '11px'}; color: #334155;">
            <div style="font-size: ${isA4 ? '11px' : '9px'}; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1px;">
              Cliente:
            </div>
            <div style="font-weight: 600; margin-bottom: 2px; color: #0f172a;">
              ${clienteNome}
            </div>
            ${(() => {
              if (!pedido.endereco_entrega) return '';
              const endLimpo = pedido.endereco_entrega
                .replace(/^(\s*entrega\s*[:\-–—]\s*)+/gi, '')
                .replace(/^(\s*retirada\s*[:\-–—]\s*)+/gi, '')
                .trim();
              return endLimpo ? `<div style="font-size: ${isA4 ? '12px' : '10px'}; color: #64748b; margin-top: 2px;">${endLimpo}</div>` : '';
            })()}
          </div>

          <!-- Resumo de Itens -->
          <div style="font-size: ${isA4 ? '14px' : '12px'}; font-weight: 600; color: #334155; margin-bottom: 4px;">
            ${itens.length} itens (Qtd.: ${totalQuantidade})
          </div>

          <!-- Linha Divisória Superior -->
          <div style="border-top: 1.5px solid #334155; margin: 4px 0 8px 0;"></div>

          <!-- Tabela de Itens -->
          <table style="width: 100%; border-collapse: collapse; margin: 4px 0;">
            <tbody>
              ${itensHtml}
            </tbody>
          </table>

          <!-- Acréscimos / Descontos se houver -->
          ${(Number(pedido.valor_desconto || 0) > 0 || Number(pedido.valor_frete || 0) > 0) ? `
            <div style="margin-top: 8px; padding-top: 6px; font-size: ${isA4 ? '12px' : '11px'}; color: #475569; border-top: 1px dashed #e2e8f0;">
              ${Number(pedido.subtotal || 0) > 0 ? `
                <div style="display: flex; justify-content: space-between; margin: 2px 0;">
                  <span>Subtotal:</span>
                  <span>R$ ${Number(pedido.subtotal).toFixed(2)}</span>
                </div>
              ` : ''}
              ${Number(pedido.valor_desconto || 0) > 0 ? `
                <div style="display: flex; justify-content: space-between; margin: 2px 0; color: #dc2626;">
                  <span>Desconto:</span>
                  <span>- R$ ${Number(pedido.valor_desconto).toFixed(2)}</span>
                </div>
              ` : ''}
              ${Number(pedido.valor_frete || 0) > 0 ? `
                <div style="display: flex; justify-content: space-between; margin: 2px 0;">
                  <span>Taxa de Entrega:</span>
                  <span>+ R$ ${Number(pedido.valor_frete).toFixed(2)}</span>
                </div>
              ` : ''}
            </div>
          ` : ''}

          <!-- Total -->
          <div style="text-align: right; margin: 12px 0 6px 0; font-size: ${isA4 ? '16px' : '14px'}; font-weight: 700; color: #0f172a;">
            Total: R$ ${Number(pedido.valor_total || 0).toFixed(2)}
          </div>

          ${(pagamentoInfo.ehFiado && Number(pedido.saldo_devedor || 0) > 0) ? `
            <div style="text-align: right; margin-bottom: 6px; font-size: ${isA4 ? '13px' : '11px'}; font-weight: 600; color: #b45309;">
              Saldo a Pagar (Fiado): R$ ${Number(pedido.saldo_devedor).toFixed(2)}
            </div>
          ` : ''}

          <!-- Dados do Pagamento (Após o Valor Total) -->
          <div style="
            margin-top: 10px;
            padding: 8px 10px;
            background-color: ${pagamentoInfo.foiPago ? '#f0fdf4' : '#fffbeb'};
            border: 1px solid ${pagamentoInfo.foiPago ? '#bbf7d0' : '#fef3c7'};
            border-radius: 6px;
            font-size: ${isA4 ? '12px' : '10px'};
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; border-bottom: 1px dashed ${pagamentoInfo.foiPago ? '#86efac' : '#fde68a'}; padding-bottom: 4px;">
              <span style="font-weight: 700; color: ${pagamentoInfo.foiPago ? '#166534' : '#92400e'}; text-transform: uppercase; letter-spacing: 0.5px;">
                Status Pagamento:
              </span>
              <span style="font-weight: 800; color: ${pagamentoInfo.foiPago ? '#15803d' : '#b45309'}; background: ${pagamentoInfo.foiPago ? '#dcfce7' : '#fef3c7'}; padding: 1px 6px; border-radius: 4px; font-size: ${isA4 ? '11px' : '9px'};">
                ${pagamentoInfo.foiPago ? '✓ PAGO' : '⏳ AGUARDANDO PAGAMENTO'}
              </span>
            </div>

            ${pagamentoInfo.foiPago ? `
              <div style="margin-top: 4px;">
                ${pagamentoInfo.pagamentosDetalhados.map(pag => `
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin: 3px 0; color: #1e293b;">
                    <div>
                      <span style="font-weight: 600;">Forma:</span> ${pag.forma}${pag.parcelas ? ` (${pag.parcelas}x)` : ''}
                      ${pag.origemGateway ? `<div style="font-size: ${isA4 ? '11px' : '9px'}; color: #0284c7; font-weight: 600;">Origem: ${pag.origemGateway}</div>` : ''}
                    </div>
                    <div style="text-align: right;">
                      <span style="font-weight: 700; color: #0f172a;">R$ ${pag.valor.toFixed(2)}</span>
                    </div>
                  </div>
                `).join('')}

                <div style="display: flex; justify-content: space-between; margin-top: 6px; padding-top: 4px; border-top: 1px solid #bbf7d0; font-weight: 800; color: #166534;">
                  <span>Valor Pago:</span>
                  <span>R$ ${pagamentoInfo.totalPago.toFixed(2)}</span>
                </div>
              </div>
            ` : `
              <div style="color: #92400e; font-size: ${isA4 ? '11px' : '9px'}; margin-top: 2px;">
                Aguardando quitação pelo cliente ou confirmação de pagamento.
              </div>
            `}
          </div>

          <!-- Linha Divisória Inferior -->
          <div style="border-top: 1.5px solid #334155; margin: 8px 0 14px 0;"></div>

          <!-- Data e Hora por Extenso -->
          <div style="text-align: center; font-size: ${isA4 ? '12px' : '10px'}; color: #64748b; font-weight: 400;">
            ${dataFormatada}
          </div>
        </div>
      `;

      // 1. Atualizar container local do DOM para window.print() direto
      let printContainer = document.getElementById('hubi-print-container');
      if (!printContainer) {
        printContainer = document.createElement('div');
        printContainer.id = 'hubi-print-container';
        document.body.appendChild(printContainer);
      }
      printContainer.innerHTML = receiptInnerHtml;

      // 2. Montar documento HTML completo para nova janela / popup
      const fullDocHtml = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Recibo Pedido #${pedido.numero_pedido} - ${nomeLoja}</title>
          <style>
            @page {
              size: ${pageWidth} auto;
              margin: ${isA4 ? '10mm' : '2mm'};
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body {
              margin: 0;
              padding: 0;
              background: #f1f5f9;
              color: #1e293b;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            }
            .action-bar {
              position: sticky;
              top: 0;
              left: 0;
              right: 0;
              background: #0f172a;
              color: #fff;
              padding: 12px 16px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              z-index: 1000;
              font-family: sans-serif;
            }
            .btn {
              padding: 8px 16px;
              border-radius: 8px;
              font-weight: bold;
              font-size: 13px;
              border: none;
              cursor: pointer;
              display: inline-flex;
              align-items: center;
              gap: 6px;
            }
            .btn-primary {
              background: #10b981;
              color: #fff;
            }
            .btn-primary:hover {
              background: #059669;
            }
            .btn-secondary {
              background: #334155;
              color: #f8fafc;
            }
            .btn-secondary:hover {
              background: #475569;
            }
            .paper-wrapper {
              background: #fff;
              max-width: ${maxCssWidth};
              margin: 20px auto;
              box-shadow: 0 4px 20px rgba(0,0,0,0.08);
              border-radius: 8px;
              overflow: hidden;
            }
            @media print {
              .action-bar {
                display: none !important;
              }
              body {
                background: #fff !important;
              }
              .paper-wrapper {
                box-shadow: none !important;
                margin: 0 !important;
                max-width: 100% !important;
                border-radius: 0 !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="action-bar">
            <span style="font-size: 13px; font-weight: 600;">Recibo Pedido #${pedido.numero_pedido}</span>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-primary" onclick="window.print()">
                🖨️ Imprimir / Salvar PDF
              </button>
              <button class="btn btn-secondary" onclick="window.close()">
                ✕ Fechar
              </button>
            </div>
          </div>

          <div class="paper-wrapper">
            ${receiptInnerHtml}
          </div>

          <script>
            // Disparar impressão automaticamente ao carregar
            window.addEventListener('load', function() {
              setTimeout(function() {
                window.focus();
                window.print();
              }, 300);
            });
          </script>
        </body>
        </html>
      `;

      // 3. Tentar abrir Popup dedicado (garante compatibilidade 100% mesmo dentro de iframes)
      let popupWin: Window | null = null;
      try {
        const popupWidth = isA4 ? 800 : 420;
        const popupHeight = 700;
        const left = Math.max(0, (window.screen.width - popupWidth) / 2);
        const top = Math.max(0, (window.screen.height - popupHeight) / 2);
        popupWin = window.open('', '_blank', `width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=yes`);
        
        if (popupWin && popupWin.document) {
          popupWin.document.open();
          popupWin.document.write(fullDocHtml);
          popupWin.document.close();
          console.log('✅ [HUBI PrintService] Janela popup de recibo aberta com sucesso.');
          return;
        }
      } catch (popErr) {
        console.warn('⚠️ [HUBI PrintService] Bloqueio ao abrir popup, disparando fallback no container da página:', popErr);
      }

      // 4. Fallback caso popup seja restrito: dispara window.print() na página atual
      console.log('🖨️ [HUBI PrintService] Disparando window.print() na janela principal...');
      window.print();
    } catch (err) {
      console.error('❌ [HUBI PrintService] Erro ao executar impressão:', err);
      alert(`Não foi possível abrir a impressão: ${err}`);
    }
  }

  /**
   * Conecta a uma impressora térmica Bluetooth via Web Bluetooth API e envia comandos ESC/POS
   */
  static async printBluetoothThermal(pedido: Pedido, loja: Loja, paperWidth: '58mm' | '80mm' = '58mm'): Promise<boolean> {
    try {
      if (!('bluetooth' in navigator)) {
        this.printReceipt(pedido, loja, paperWidth);
        return true;
      }

      const nav = navigator as unknown as {
        bluetooth: {
          requestDevice: (options: { acceptAllDevices?: boolean; optionalServices?: string[] }) => Promise<{
            gatt?: {
              connect: () => Promise<{
                getPrimaryServices: () => Promise<Array<{
                  getCharacteristics: () => Promise<Array<{
                    properties: { write: boolean; writeWithoutResponse: boolean };
                    writeValue: (data: Uint8Array) => Promise<void>;
                    writeValueWithoutResponse?: (data: Uint8Array) => Promise<void>;
                  }>>;
                }>>;
              }>;
            };
          }>;
        };
      };

      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455'
        ]
      });

      if (!device.gatt) return false;
      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();
      
      let writeChar: { writeValue: (data: Uint8Array) => Promise<void>; writeValueWithoutResponse?: (data: Uint8Array) => Promise<void> } | null = null;
      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            writeChar = char;
            break;
          }
        }
        if (writeChar) break;
      }

      if (!writeChar) {
        this.printReceipt(pedido, loja, paperWidth);
        return false;
      }

      const escPosCommands = this.generateEscPosBuffer(pedido, loja, paperWidth);
      
      const chunkSize = 100;
      for (let i = 0; i < escPosCommands.length; i += chunkSize) {
        const chunk = escPosCommands.slice(i, i + chunkSize);
        if (writeChar.writeValueWithoutResponse) {
          await writeChar.writeValueWithoutResponse(chunk);
        } else {
          await writeChar.writeValue(chunk);
        }
      }

      return true;
    } catch (err) {
      console.warn('Bluetooth indisponível ou cancelado, acionando impressão nativa do navegador:', err);
      this.printReceipt(pedido, loja, paperWidth);
      return false;
    }
  }

  /**
   * Gera o buffer de bytes ESC/POS com cabeçalho, itens, totais e corte de papel
   */
  private static generateEscPosBuffer(pedido: Pedido, loja: Loja, paperWidth: '58mm' | '80mm'): Uint8Array {
    const encoder = new TextEncoder();
    const cols = paperWidth === '58mm' ? 32 : 48;
    const divider = '-'.repeat(cols) + '\n';
    
    let text = '';
    text += '\x1B\x61\x01'; // Align Center
    text += '\x1B\x45\x01'; // Bold ON
    text += `RECIBO #${pedido.numero_pedido}\n`;
    text += `${(loja.nome_fantasia || 'HUBI').toUpperCase()}\n`;
    text += '\x1B\x45\x00'; // Bold OFF
    if (loja.telefone || loja.whatsapp) text += `Tel/Whats: ${loja.whatsapp || loja.telefone}\n`;
    if (loja.endereco_cidade) text += `${loja.endereco_cidade} - ${loja.endereco_estado || ''}\n`;
    text += divider;

    const vendedorInfo = formatarVendedorRecibo(pedido);
    text += `Vendedor: ${vendedorInfo.valor}\n`;
    if (pedido.cliente?.nome) text += `Cliente: ${pedido.cliente.nome}\n`;
    text += divider;

    text += '\x1B\x61\x00'; // Align Left
    text += 'ITEM               QTD   VALOR\n';
    text += divider;

    if (pedido.itens) {
      for (const item of pedido.itens) {
        const itemLine = `${item.nome_produto} ${item.rotulo_variacao ? `(${item.rotulo_variacao})` : ''}`.slice(0, cols - 16);
        const qtyAndVal = `${item.quantidade}x R$${Number(item.preco_venda_unitario).toFixed(2)}`;
        text += `${itemLine}\n  ${qtyAndVal} = R$${Number(item.subtotal).toFixed(2)}\n`;
      }
    }
    text += divider;

    text += `Subtotal:              R$ ${Number(pedido.subtotal).toFixed(2)}\n`;
    if (Number(pedido.valor_desconto) > 0) text += `Desconto:            - R$ ${Number(pedido.valor_desconto).toFixed(2)}\n`;
    if (Number(pedido.valor_frete) > 0) text += `Taxa de Entrega:     + R$ ${Number(pedido.valor_frete).toFixed(2)}\n`;
    text += '\x1B\x45\x01'; // Bold ON
    text += `TOTAL:                 R$ ${Number(pedido.valor_total).toFixed(2)}\n`;
    text += '\x1B\x45\x00'; // Bold OFF

    const pagamentoInfo = obterDadosPagamentoRecibo(pedido);

    if (pagamentoInfo.ehFiado && Number(pedido.saldo_devedor) > 0) {
      text += `SALDO A PAGAR (FIADO): R$ ${Number(pedido.saldo_devedor).toFixed(2)}\n`;
    }

    text += divider;
    if (pagamentoInfo.foiPago) {
      text += '\x1B\x45\x01'; // Bold ON
      text += 'PAGAMENTO: [PAGO]\n';
      text += '\x1B\x45\x00'; // Bold OFF
      for (const pag of pagamentoInfo.pagamentosDetalhados) {
        const gw = pag.origemGateway ? ` (${pag.origemGateway})` : '';
        const parc = pag.parcelas ? ` [${pag.parcelas}x]` : '';
        text += `> ${pag.forma}${parc}${gw}: R$ ${pag.valor.toFixed(2)}\n`;
      }
      text += `Total Pago: R$ ${pagamentoInfo.totalPago.toFixed(2)}\n`;
    } else {
      text += 'PAGAMENTO: [AGUARDANDO PAGAMENTO]\n';
    }

    text += divider;
    text += '\x1B\x61\x01'; // Center
    text += `${formatarDataRecibo(pedido.data_venda || pedido.criado_em)}\n\n\n`;
    text += '\x1D\x56\x41\x10'; // Cut paper command

    return encoder.encode(text);
  }

  /**
   * Formata o corpo do e-mail com base no modelo de recibo
   */
  static generateEmailBody(pedido: Pedido, loja?: Loja | null): string {
    const nomeLoja = loja?.nome_fantasia || 'HUBI';
    const itens = (pedido.itens || (pedido as any).itens_pedido || []) as ItemPedido[];
    const totalQtd = itens.reduce((acc, i) => acc + Number(i.quantidade || 1), 0);
    const dataFormatada = formatarDataRecibo(pedido.data_venda || pedido.criado_em);
    const clienteNome = pedido.cliente?.nome || (pedido as any).nome_cliente || 'Cliente';
    const vendedorInfo = formatarVendedorRecibo(pedido);
    const pagamentoInfo = obterDadosPagamentoRecibo(pedido);

    const linhasItens = itens.map(i =>
      `${Number(i.quantidade || 1)}x ${i.nome_produto}${i.rotulo_variacao ? ` / ${i.rotulo_variacao}` : ''}  -  R$ ${Number(i.subtotal || 0).toFixed(2)}`
    ).join('\n');

    let pagStr = '';
    if (pagamentoInfo.foiPago) {
      pagStr = `\nSTATUS DO PAGAMENTO: PAGO\n` +
        pagamentoInfo.pagamentosDetalhados.map(p =>
          `Forma: ${p.forma}${p.parcelas ? ` (${p.parcelas}x)` : ''}${p.origemGateway ? ` (Origem: ${p.origemGateway})` : ''} - Valor Pago: R$ ${p.valor.toFixed(2)}`
        ).join('\n') +
        `\nValor Total Pago: R$ ${pagamentoInfo.totalPago.toFixed(2)}\n`;
    } else {
      pagStr = `\nSTATUS DO PAGAMENTO: AGUARDANDO PAGAMENTO\n`;
    }

    return `RECIBO #${pedido.numero_pedido}\n\n` +
      `${nomeLoja.toUpperCase()}\n` +
      (loja?.whatsapp ? `WhatsApp: +55 ${loja.whatsapp}\n` : '') +
      (loja?.endereco_cidade ? `Local: ${loja.endereco_cidade}\n` : '') +
      `\nVendedor: ${vendedorInfo.valor}\n` +
      `Cliente: ${clienteNome}\n` +
      (pedido.cliente?.whatsapp ? `Contato: +55 ${pedido.cliente.whatsapp}\n` : '') +
      `\n${itens.length} itens (Qtd.: ${totalQtd})\n` +
      `--------------------------------------------------\n` +
      linhasItens + `\n` +
      `--------------------------------------------------\n` +
      (Number(pedido.valor_desconto) > 0 ? `Desconto: - R$ ${Number(pedido.valor_desconto).toFixed(2)}\n` : '') +
      (Number(pedido.valor_frete) > 0 ? `Taxa Entrega: + R$ ${Number(pedido.valor_frete).toFixed(2)}\n` : '') +
      `Total: R$ ${Number(pedido.valor_total).toFixed(2)}\n` +
      (pagamentoInfo.ehFiado && Number(pedido.saldo_devedor) > 0 ? `Saldo a Pagar (Fiado): R$ ${Number(pedido.saldo_devedor).toFixed(2)}\n` : '') +
      pagStr +
      `--------------------------------------------------\n` +
      `${dataFormatada}\n\n` +
      `Obrigado pela preferência!`;
  }

  /**
   * Abre o cliente de e-mail do usuário para enviar o recibo
   */
  static openEmail(pedido: Pedido, loja?: Loja | null): void {
    const emailDestino = pedido.cliente?.email || '';
    const assunto = `Recibo Pedido #${pedido.numero_pedido} - ${loja?.nome_fantasia || 'HUBI'}`;
    const corpo = this.generateEmailBody(pedido, loja);
    const mailtoUrl = `mailto:${emailDestino}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
    window.open(mailtoUrl, '_blank');
  }

  /**
   * Formata uma mensagem completa para envio direto ao WhatsApp do cliente
   */
  static generateWhatsAppMessage(pedido: Pedido, loja: Loja): string {
    const itens = (pedido.itens || (pedido as any).itens_pedido || []) as ItemPedido[];
    const totalQtd = itens.reduce((acc, i) => acc + Number(i.quantidade || 1), 0);
    const dataFormatada = formatarDataRecibo(pedido.data_venda || pedido.criado_em);
    const vendedorInfo = formatarVendedorRecibo(pedido);
    const pagamentoInfo = obterDadosPagamentoRecibo(pedido);

    const itensTexto = itens
      ? itens.map((i: ItemPedido) => `▫️ *${i.quantidade}x* ${i.nome_produto} ${i.rotulo_variacao ? `(${i.rotulo_variacao})` : ''} - R$ ${Number(i.subtotal).toFixed(2)}`).join('\n')
      : '';

    let pagWhatsApp = '';
    if (pagamentoInfo.foiPago) {
      const detalhes = pagamentoInfo.pagamentosDetalhados.map(p =>
        `💳 *Forma:* ${p.forma}${p.parcelas ? ` (${p.parcelas}x)` : ''}${p.origemGateway ? ` _[Origem: ${p.origemGateway}]_` : ''}\n💰 *Valor Pago:* R$ ${p.valor.toFixed(2)}`
      ).join('\n');
      pagWhatsApp = `\n✅ *Status do Pagamento:* PAGO\n${detalhes}\n💵 *Total Quitado:* R$ ${pagamentoInfo.totalPago.toFixed(2)}\n`;
    } else {
      pagWhatsApp = `\n⏳ *Status do Pagamento:* AGUARDANDO PAGAMENTO\n`;
    }

    return `🧾 *RECIBO #${pedido.numero_pedido} - ${loja.nome_fantasia || 'HUBI'}*

*${loja.nome_fantasia || 'HUBI'}*
${loja.whatsapp ? `Tel/Whats: +55 ${loja.whatsapp}` : ''}

👤 *Vendedor:* ${vendedorInfo.valor}
👤 *Cliente:* ${pedido.cliente?.nome || 'Cliente'}
${pedido.cliente?.whatsapp ? `Tel: +55 ${pedido.cliente.whatsapp}` : ''}

*${itens.length} itens (Qtd.: ${totalQtd})*
━━━━━━━━━━━━━━━━━━━━
${itensTexto}
━━━━━━━━━━━━━━━━━━━━
${Number(pedido.valor_desconto) > 0 ? `🏷️ *Desconto:* - R$ ${Number(pedido.valor_desconto).toFixed(2)}\n` : ''}${Number(pedido.valor_frete) > 0 ? `🛵 *Taxa de Entrega:* + R$ ${Number(pedido.valor_frete).toFixed(2)}\n` : ''}💵 *TOTAL:* R$ ${Number(pedido.valor_total).toFixed(2)}
${pagamentoInfo.ehFiado && Number(pedido.saldo_devedor) > 0 ? `⚠️ *Saldo a Pagar (Fiado):* R$ ${Number(pedido.saldo_devedor).toFixed(2)}\n` : ''}${pagWhatsApp}━━━━━━━━━━━━━━━━━━━━
${dataFormatada}

Agradecemos a sua preferência! ✨`;
  }

  /**
  /**
   * Dispara a impressão do Relatório Oficial de Fechamento de Caixa com layout executivo de alta fidelidade
   */
  static printFechamentoCaixa(dados: any, loja?: Loja | null, format: '58mm' | '80mm' | 'a4' = '80mm'): void {
    if (!dados) return;

    try {
      const sessao = dados.sessao || dados;
      const isA4 = format === 'a4';
      const is58 = format === '58mm';
      const pageWidth = isA4 ? '210mm' : is58 ? '58mm' : '80mm';
      const maxCssWidth = isA4 ? '680px' : is58 ? '320px' : '400px';

      const nomeLoja = loja?.nome_fantasia || 'HUBI GESTÃO & PDV';
      const razaoSocial = loja?.razao_social && loja.razao_social !== nomeLoja ? loja.razao_social : '';
      const docLoja = loja?.numero_documento || (loja as any)?.cnpj || (loja as any)?.cpf;
      const telLoja = loja?.whatsapp || loja?.telefone;
      const enderecoLoja = [
        loja?.endereco_logradouro,
        loja?.endereco_numero,
        loja?.endereco_bairro,
        loja?.endereco_cidade,
        loja?.endereco_estado
      ].filter(Boolean).join(', ');

      const formatMoeda = (n: number) =>
        Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      // Dados de turno e operadores
      const terminalId = sessao.terminal_id || dados.terminal_id || dados.caixaNumero || 'PDV-01';
      const sessaoId = sessao.id ? String(sessao.id).slice(0, 8) : (dados.sessaoId || '00000000');
      const statusSessao = String(sessao.status || dados.status || 'FECHADO').toUpperCase();
      const dtAberturaRaw = sessao.aberto_em || dados.aberto_em || dados.dataAbertura;
      const dtFechamentoRaw = sessao.fechado_em || dados.fechado_em || dados.dataFechamento;
      const dtAbertura = dtAberturaRaw ? new Date(dtAberturaRaw).toLocaleString('pt-BR') : '-';
      const dtFechamento = dtFechamentoRaw ? new Date(dtFechamentoRaw).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');
      const duracaoTexto = dados.duracaoTexto || dados.duracaoFormatada || dados.turno || 'Turno Normal';
      const operadorAbertura = sessao.aberto_por?.nome_completo || sessao.usuario_abertura?.nome_completo || dados.operadorAbertura || 'Operador PDV';
      const operadorFechamento = sessao.fechado_por?.nome_completo || sessao.usuario_fechamento?.nome_completo || dados.operadorNome || operadorAbertura;

      // Balanço de gaveta (Dinheiro)
      const fundoInicial = Number(dados.fundoInicial ?? sessao.fundo_inicial ?? sessao.fundo_troco_inicial ?? dados.fundo_inicial ?? 0);
      const vendasDinheiro = Number(dados.totalVendasDinheiro ?? sessao.total_vendas_dinheiro ?? dados.vendasDinheiro ?? 0);
      const suprimentos = Number(dados.totalSuprimentos ?? sessao.total_suprimentos ?? dados.suprimentos ?? 0);
      const sangrias = Number(dados.totalSangrias ?? sessao.total_sangrias ?? dados.sangrias ?? 0);
      const despesasCaixa = Number(dados.totalDespesas ?? sessao.total_despesas ?? dados.despesasCaixa ?? 0);

      const saldoEsperado = Number(dados.saldoEsperadoDinheiro ?? sessao.saldo_esperado_dinheiro ?? sessao.saldo_dinheiro_calculado ?? dados.saldoEsperadoGaveta ?? 0);
      const valorDeclarado = Number(sessao.saldo_declarado_dinheiro ?? sessao.saldo_dinheiro_declarado ?? dados.saldo_declarado_dinheiro ?? dados.valorContado ?? 0);
      const dif = Number(sessao.diferenca_dinheiro ?? (valorDeclarado - saldoEsperado));

      const isExato = Math.abs(dif) < 0.01;
      const isSobra = dif >= 0.01;
      const isFalta = dif <= -0.01;

      // Apuração por forma de pagamento
      const vendasPix = Number(dados.totalVendasPix ?? sessao.total_vendas_pix ?? dados.vendasPix ?? 0);
      const vendasCredito = Number(dados.totalVendasCredito ?? sessao.total_vendas_credito ?? dados.vendasCredito ?? 0);
      const vendasDebito = Number(dados.totalVendasDebito ?? sessao.total_vendas_debito ?? dados.vendasDebito ?? 0);
      const vendasOutros = Number(dados.totalVendasOutros ?? sessao.total_vendas_outros ?? dados.vendasOutros ?? 0);
      const totalFaturado = Number(dados.faturamentoTotalVendas ?? dados.totalVendasGeral ?? sessao.faturamento_total ?? dados.totalBruto ?? (vendasDinheiro + vendasPix + vendasCredito + vendasDebito + vendasOutros));

      const qtdDinheiro = dados.qtdVendasPorMetodo?.dinheiro ?? dados.qtdDinheiro ?? 0;
      const qtdPix = dados.qtdVendasPorMetodo?.pix ?? dados.qtdPix ?? 0;
      const qtdCredito = dados.qtdVendasPorMetodo?.cartao_credito ?? dados.qtdCredito ?? 0;
      const qtdDebito = dados.qtdVendasPorMetodo?.cartao_debito ?? dados.qtdDebito ?? 0;
      const qtdOutros = dados.qtdVendasPorMetodo?.outros ?? dados.qtdOutros ?? 0;
      const totalQtdVendas = qtdDinheiro + qtdPix + qtdCredito + qtdDebito + qtdOutros || dados.totalQtdVendas || 0;

      // Movimentações operacionais registradas no turno
      const movimentacoes: any[] = Array.isArray(sessao.movimentacoes) ? sessao.movimentacoes : [];
      const observacoes = sessao.observacoes_fechamento || dados.observacoes || '';

      const logoHtml = loja?.url_logo ? `
        <div style="text-align: center; margin-bottom: 12px;">
          <img src="${loja.url_logo}" alt="${nomeLoja}" style="max-height: ${isA4 ? '56px' : '42px'}; max-width: 180px; object-fit: contain;" />
        </div>
      ` : '';

      const htmlContent = `
        <div class="comprovante-caixa" style="
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, Helvetica, Arial, sans-serif;
          color: #0f172a;
          background: #ffffff;
          font-size: ${isA4 ? '12.5px' : '11px'};
          line-height: 1.45;
          padding: ${isA4 ? '32px 28px' : '14px 10px'};
          max-width: ${maxCssWidth};
          margin: 0 auto;
          box-sizing: border-box;
        ">
          <!-- CABEÇALHO DA LOJA -->
          ${logoHtml}
          <div style="text-align: center; margin-bottom: 10px;">
            <h1 style="margin: 0; font-size: ${isA4 ? '19px' : '15px'}; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a;">
              ${nomeLoja}
            </h1>
            ${razaoSocial ? `<div style="font-size: ${isA4 ? '11px' : '9.5px'}; color: #64748b; margin-top: 1px;">${razaoSocial}</div>` : ''}
            ${docLoja ? `<div style="font-size: ${isA4 ? '11px' : '9.5px'}; color: #475569; margin-top: 1px;"><strong>CNPJ/CPF:</strong> ${docLoja}</div>` : ''}
            ${telLoja ? `<div style="font-size: ${isA4 ? '11px' : '9.5px'}; color: #475569; margin-top: 1px;"><strong>Contato:</strong> ${telLoja}</div>` : ''}
            ${enderecoLoja ? `<div style="font-size: ${isA4 ? '10.5px' : '9px'}; color: #64748b; margin-top: 2px;">${enderecoLoja}</div>` : ''}
          </div>

          <!-- FAIXA DE IDENTIFICAÇÃO DO COMPROVANTE -->
          <div style="
            background: #0f172a;
            color: #ffffff;
            border-radius: 6px;
            padding: 7px 10px;
            text-align: center;
            margin-bottom: 12px;
          ">
            <div style="font-size: ${isA4 ? '13px' : '11.5px'}; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase;">
              COMPROVANTE DE FECHAMENTO DE CAIXA
            </div>
            <div style="font-size: ${isA4 ? '10px' : '8.5px'}; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.3px; margin-top: 1px;">
              Prestação de Contas & Conferência de Turno
            </div>
          </div>

          <!-- METADADOS DO TURNO -->
          <div style="
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 8px 10px;
            margin-bottom: 12px;
            font-size: ${isA4 ? '11.5px' : '10px'};
          ">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 2px 0; color: #64748b; width: 50%;">
                  Terminal: <strong style="color: #0f172a;">${terminalId}</strong>
                </td>
                <td style="padding: 2px 0; text-align: right;">
                  <span style="
                    background: #0f172a;
                    color: #ffffff;
                    padding: 1px 6px;
                    border-radius: 4px;
                    font-weight: 800;
                    font-size: ${isA4 ? '10px' : '8.5px'};
                    letter-spacing: 0.5px;
                  ">
                    ${statusSessao}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding: 2px 0; color: #64748b;" colspan="2">
                  Sessão ID: <code style="font-family: monospace; font-size: 10px; color: #0f172a; font-weight: 700;">#${sessaoId}</code>
                </td>
              </tr>
              <tr>
                <td style="padding: 2px 0; color: #64748b;" colspan="2">
                  Operador: <strong style="color: #0f172a;">${operadorFechamento}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding: 2px 0; color: #64748b;" colspan="2">
                  Abertura: <strong style="color: #0f172a;">${dtAbertura}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding: 2px 0; color: #64748b;" colspan="2">
                  Fechamento: <strong style="color: #0f172a;">${dtFechamento}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding: 2px 0; color: #64748b;" colspan="2">
                  Duração do Turno: <strong style="color: #0f172a;">${duracaoTexto}</strong>
                </td>
              </tr>
            </table>
          </div>

          <!-- SEÇÃO 1: BALANÇO DA GAVETA (DINHEIRO FÍSICO) -->
          <div style="margin-bottom: 12px;">
            <div style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 3px;
              margin-bottom: 6px;
            ">
              <span style="font-weight: 800; font-size: ${isA4 ? '12px' : '10.5px'}; text-transform: uppercase; color: #0f172a; letter-spacing: 0.3px;">
                1. BALANÇO DA GAVETA (DINHEIRO)
              </span>
              <span style="font-size: 9.5px; color: #64748b; font-weight: 600;">Espécie</span>
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: ${isA4 ? '11.5px' : '10px'};">
              <tbody>
                <tr style="border-bottom: 1px dashed #e2e8f0;">
                  <td style="padding: 3px 0; color: #334155;">(+) Fundo de Troco Inicial</td>
                  <td style="padding: 3px 0; text-align: right; font-weight: 600; color: #0f172a;">R$ ${formatMoeda(fundoInicial)}</td>
                </tr>
                <tr style="border-bottom: 1px dashed #e2e8f0;">
                  <td style="padding: 3px 0; color: #334155;">(+) Vendas em Dinheiro</td>
                  <td style="padding: 3px 0; text-align: right; font-weight: 600; color: #047857;">+ R$ ${formatMoeda(vendasDinheiro)}</td>
                </tr>
                <tr style="border-bottom: 1px dashed #e2e8f0;">
                  <td style="padding: 3px 0; color: #334155;">(+) Suprimentos (Aportes)</td>
                  <td style="padding: 3px 0; text-align: right; font-weight: 600; color: #0284c7;">+ R$ ${formatMoeda(suprimentos)}</td>
                </tr>
                <tr style="border-bottom: 1px dashed #e2e8f0;">
                  <td style="padding: 3px 0; color: #334155;">(-) Sangrias (Retiradas)</td>
                  <td style="padding: 3px 0; text-align: right; font-weight: 600; color: #b91c1c;">- R$ ${formatMoeda(sangrias)}</td>
                </tr>
                <tr style="border-bottom: 1px dashed #e2e8f0;">
                  <td style="padding: 3px 0; color: #334155;">(-) Despesas Pagas na Gaveta</td>
                  <td style="padding: 3px 0; text-align: right; font-weight: 600; color: #b91c1c;">- R$ ${formatMoeda(despesasCaixa)}</td>
                </tr>
              </tbody>
            </table>

            <!-- CARD DE CONCILIAÇÃO & RESULTADO -->
            <div style="
              margin-top: 8px;
              border: 1px solid #cbd5e1;
              border-radius: 8px;
              background: #f8fafc;
              padding: 8px 10px;
              font-size: ${isA4 ? '11.5px' : '10px'};
            ">
              <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                <span style="color: #475569; font-weight: 600;">(=) Saldo Teórico Esperado:</span>
                <strong style="color: #0f172a; font-size: ${isA4 ? '12px' : '10.5px'};">R$ ${formatMoeda(saldoEsperado)}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: #475569; font-weight: 600;">(=) Valor Declarado (Contagem):</span>
                <strong style="color: #0f172a; font-size: ${isA4 ? '12px' : '10.5px'};">R$ ${formatMoeda(valorDeclarado)}</strong>
              </div>

              <!-- STATUS DIFERENÇA -->
              <div style="
                border-top: 1px solid #e2e8f0;
                padding-top: 6px;
                text-align: center;
              ">
                <div style="
                  padding: 6px 8px;
                  border-radius: 6px;
                  font-weight: 800;
                  font-size: ${isA4 ? '11.5px' : '10px'};
                  letter-spacing: 0.3px;
                  text-transform: uppercase;
                  ${isExato ? 'background: #dcfce7; border: 1.5px solid #86efac; color: #166534;' : ''}
                  ${isSobra ? 'background: #e0f2fe; border: 1.5px solid #7dd3fc; color: #0369a1;' : ''}
                  ${isFalta ? 'background: #fee2e2; border: 1.5px solid #fca5a5; color: #991b1b;' : ''}
                ">
                  ${isExato ? '✓ CAIXA CONCILIADO COM EXATIDÃO (R$ 0,00)' : ''}
                  ${isSobra ? `SOBRA DE CAIXA: +R$ ${formatMoeda(Math.abs(dif))}` : ''}
                  ${isFalta ? `FALTA DE CAIXA: -R$ ${formatMoeda(Math.abs(dif))}` : ''}
                </div>
              </div>
            </div>
          </div>

          <!-- SEÇÃO 2: VENDAS POR FORMA DE PAGAMENTO -->
          <div style="margin-bottom: 12px;">
            <div style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 3px;
              margin-bottom: 6px;
            ">
              <span style="font-weight: 800; font-size: ${isA4 ? '12px' : '10.5px'}; text-transform: uppercase; color: #0f172a; letter-spacing: 0.3px;">
                2. VENDAS POR MEIO DE PAGAMENTO
              </span>
              <span style="font-size: 9.5px; color: #64748b; font-weight: 600;">Faturamento</span>
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: ${isA4 ? '11.5px' : '10px'};">
              <thead>
                <tr style="border-bottom: 1.5px solid #cbd5e1; color: #64748b; text-transform: uppercase; font-size: 9px;">
                  <th style="padding: 3px 0; text-align: left; font-weight: 700;">Meio / Forma</th>
                  <th style="padding: 3px 0; text-align: center; font-weight: 700; width: 40px;">Qtd</th>
                  <th style="padding: 3px 0; text-align: right; font-weight: 700;">Total (R$)</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px dashed #e2e8f0;">
                  <td style="padding: 3px 0; color: #334155; font-weight: 600;">Dinheiro</td>
                  <td style="padding: 3px 0; text-align: center; color: #64748b;">${qtdDinheiro}</td>
                  <td style="padding: 3px 0; text-align: right; font-weight: 600; color: #0f172a;">R$ ${formatMoeda(vendasDinheiro)}</td>
                </tr>
                <tr style="border-bottom: 1px dashed #e2e8f0;">
                  <td style="padding: 3px 0; color: #334155; font-weight: 600;">Pix / Transferência</td>
                  <td style="padding: 3px 0; text-align: center; color: #64748b;">${qtdPix}</td>
                  <td style="padding: 3px 0; text-align: right; font-weight: 600; color: #0f172a;">R$ ${formatMoeda(vendasPix)}</td>
                </tr>
                <tr style="border-bottom: 1px dashed #e2e8f0;">
                  <td style="padding: 3px 0; color: #334155; font-weight: 600;">Cartão de Crédito</td>
                  <td style="padding: 3px 0; text-align: center; color: #64748b;">${qtdCredito}</td>
                  <td style="padding: 3px 0; text-align: right; font-weight: 600; color: #0f172a;">R$ ${formatMoeda(vendasCredito)}</td>
                </tr>
                <tr style="border-bottom: 1px dashed #e2e8f0;">
                  <td style="padding: 3px 0; color: #334155; font-weight: 600;">Cartão de Débito</td>
                  <td style="padding: 3px 0; text-align: center; color: #64748b;">${qtdDebito}</td>
                  <td style="padding: 3px 0; text-align: right; font-weight: 600; color: #0f172a;">R$ ${formatMoeda(vendasDebito)}</td>
                </tr>
                ${vendasOutros > 0 || qtdOutros > 0 ? `
                <tr style="border-bottom: 1px dashed #e2e8f0;">
                  <td style="padding: 3px 0; color: #334155; font-weight: 600;">Outros Meios</td>
                  <td style="padding: 3px 0; text-align: center; color: #64748b;">${qtdOutros}</td>
                  <td style="padding: 3px 0; text-align: right; font-weight: 600; color: #0f172a;">R$ ${formatMoeda(vendasOutros)}</td>
                </tr>
                ` : ''}
                <!-- TOTAL GERAL -->
                <tr style="border-top: 2px solid #0f172a; background: #f8fafc;">
                  <td style="padding: 6px 4px; font-weight: 800; color: #0f172a; text-transform: uppercase; font-size: ${isA4 ? '12px' : '10.5px'};">
                    TOTAL FATURADO
                  </td>
                  <td style="padding: 6px 0; text-align: center; font-weight: 800; color: #0f172a;">
                    ${totalQtdVendas}
                  </td>
                  <td style="padding: 6px 4px; text-align: right; font-weight: 900; color: #0f172a; font-size: ${isA4 ? '13px' : '11.5px'};">
                    R$ ${formatMoeda(totalFaturado)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- SEÇÃO 3: MOVIMENTAÇÕES DE GAVETA REGISTRADAS (SE HOUVER) -->
          ${movimentacoes.length > 0 ? `
          <div style="margin-bottom: 12px;">
            <div style="
              border-bottom: 1.5px solid #0f172a;
              padding-bottom: 3px;
              margin-bottom: 6px;
              font-weight: 800;
              font-size: ${isA4 ? '11.5px' : '10px'};
              text-transform: uppercase;
              color: #0f172a;
            ">
              3. EXTRATO DE MOVIMENTAÇÕES DO TURNO (${movimentacoes.length})
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: ${isA4 ? '11px' : '9.5px'};">
              <thead>
                <tr style="border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 8.5px; text-transform: uppercase;">
                  <th style="padding: 2px 0; text-align: left;">Hora</th>
                  <th style="padding: 2px 0; text-align: left;">Tipo</th>
                  <th style="padding: 2px 0; text-align: left;">Motivo / Descrição</th>
                  <th style="padding: 2px 0; text-align: right;">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${movimentacoes.map(m => {
                  const hora = m.criado_em ? new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-';
                  const ehSaida = m.tipo === 'sangria' || m.tipo === 'despesa';
                  return `
                    <tr style="border-bottom: 1px dotted #f1f5f9;">
                      <td style="padding: 2.5px 0; color: #64748b;">${hora}</td>
                      <td style="padding: 2.5px 0; font-weight: 700; text-transform: uppercase; color: ${ehSaida ? '#b91c1c' : '#0284c7'};">
                        ${m.tipo}
                      </td>
                      <td style="padding: 2.5px 4px; color: #334155; word-break: break-word;">
                        ${m.descricao || '-'}
                      </td>
                      <td style="padding: 2.5px 0; text-align: right; font-weight: 600; color: ${ehSaida ? '#b91c1c' : '#0f172a'}; white-space: nowrap;">
                        ${ehSaida ? '-' : '+'} R$ ${formatMoeda(m.valor)}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          ` : ''}

          <!-- SEÇÃO 4: OBSERVAÇÕES DO FECHAMENTO (SE HOUVER) -->
          ${observacoes ? `
          <div style="margin-bottom: 12px;">
            <div style="
              border-bottom: 1.5px solid #0f172a;
              padding-bottom: 3px;
              margin-bottom: 6px;
              font-weight: 800;
              font-size: ${isA4 ? '11.5px' : '10px'};
              text-transform: uppercase;
              color: #0f172a;
            ">
              Observações do Operador
            </div>
            <div style="
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 6px;
              padding: 6px 8px;
              font-size: ${isA4 ? '11px' : '9.5px'};
              color: #334155;
              white-space: pre-wrap;
            ">
              ${observacoes}
            </div>
          </div>
          ` : ''}

          <!-- SEÇÃO 5: ASSINATURAS E PROTOCOLO DE AUDITORIA -->
          <div style="margin-top: 18px; border-top: 1.5px dashed #94a3b8; padding-top: 14px;">
            <div style="text-align: center; margin-bottom: 22px;">
              <div style="font-size: 10px; color: #64748b; margin-bottom: 14px;">
                Declaro para os devidos fins que os valores físicos e documentos acima foram conferidos e encerram este turno.
              </div>

              <!-- ASSINATURAS LADO A LADO OU EMPILHADAS -->
              <div style="display: flex; flex-direction: ${isA4 ? 'row' : 'column'}; justify-content: space-around; gap: ${isA4 ? '30px' : '16px'};">
                <div style="flex: 1; text-align: center;">
                  <div style="border-bottom: 1px solid #0f172a; margin-bottom: 4px; height: 26px;"></div>
                  <div style="font-size: ${isA4 ? '11px' : '9.5px'}; font-weight: 700; color: #0f172a;">${operadorFechamento}</div>
                  <div style="font-size: ${isA4 ? '10px' : '8.5px'}; color: #64748b;">Operador do Caixa</div>
                </div>

                <div style="flex: 1; text-align: center;">
                  <div style="border-bottom: 1px solid #0f172a; margin-bottom: 4px; height: 26px;"></div>
                  <div style="font-size: ${isA4 ? '11px' : '9.5px'}; font-weight: 700; color: #0f172a;">Supervisor / Gerente</div>
                  <div style="font-size: ${isA4 ? '10px' : '8.5px'}; color: #64748b;">Conferência & Auditoria</div>
                </div>
              </div>
            </div>

            <!-- RODAPÉ DE AUDITORIA -->
            <div style="
              text-align: center;
              font-size: ${isA4 ? '10px' : '8.5px'};
              color: #64748b;
              border-top: 1px solid #f1f5f9;
              padding-top: 6px;
            ">
              <div>Emitido em: ${new Date().toLocaleString('pt-BR')}</div>
              <div style="font-weight: 600; color: #0f172a; margin-top: 1px;">
                HUBI • Sistema de Gestão & PDV
              </div>
            </div>
          </div>
        </div>
      `;

      const fullDocHtml = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Fechamento de Caixa #${sessaoId} - ${nomeLoja}</title>
          <style>
            @page {
              size: ${pageWidth} auto;
              margin: ${isA4 ? '8mm' : '2mm'};
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              margin: 0;
              padding: 0;
              background: #0f172a;
              color: #0f172a;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, Helvetica, Arial, sans-serif;
            }
            .action-bar {
              position: sticky;
              top: 0;
              left: 0;
              right: 0;
              background: #0f172a;
              color: #ffffff;
              padding: 10px 16px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
              z-index: 1000;
              border-bottom: 1px solid #1e293b;
            }
            .btn {
              padding: 7px 14px;
              border-radius: 8px;
              font-weight: 700;
              font-size: 12px;
              border: none;
              cursor: pointer;
              display: inline-flex;
              align-items: center;
              gap: 6px;
              transition: 0.15s ease;
            }
            .btn-primary {
              background: #10b981;
              color: #ffffff;
            }
            .btn-primary:hover {
              background: #059669;
            }
            .btn-secondary {
              background: #1e293b;
              color: #cbd5e1;
              border: 1px solid #334155;
            }
            .btn-secondary:hover {
              background: #334155;
              color: #ffffff;
            }
            .btn-format {
              background: #1e293b;
              color: #94a3b8;
              border: 1px solid #334155;
              padding: 5px 10px;
              font-size: 11px;
            }
            .btn-format.active {
              background: #3b82f6;
              color: #ffffff;
              border-color: #3b82f6;
            }
            .paper-wrapper {
              background: #ffffff;
              max-width: ${maxCssWidth};
              margin: 20px auto;
              box-shadow: 0 8px 30px rgba(0,0,0,0.4);
              border-radius: 10px;
              overflow: hidden;
              transition: max-width 0.2s ease;
            }
            @media print {
              .action-bar {
                display: none !important;
              }
              body {
                background: #ffffff !important;
              }
              .paper-wrapper {
                box-shadow: none !important;
                margin: 0 !important;
                max-width: 100% !important;
                border-radius: 0 !important;
              }
            }
          </style>
          <script>
            function trocarFormato(formato) {
              const wrapper = document.querySelector('.paper-wrapper');
              const btns = document.querySelectorAll('.btn-format');
              btns.forEach(b => b.classList.remove('active'));
              if (formato === 'a4') {
                wrapper.style.maxWidth = '680px';
                document.getElementById('btn-a4').classList.add('active');
              } else {
                wrapper.style.maxWidth = '400px';
                document.getElementById('btn-termica').classList.add('active');
              }
            }
          </script>
        </head>
        <body>
          <div class="action-bar">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 13px; font-weight: 700; letter-spacing: 0.3px;">
                Fechamento #${sessaoId} • Terminal ${terminalId}
              </span>
            </div>

            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="display: flex; gap: 4px; background: #1e293b; padding: 2px; border-radius: 6px;">
                <button id="btn-termica" class="btn btn-format ${!isA4 ? 'active' : ''}" onclick="trocarFormato('80mm')">
                  Térmica 80mm
                </button>
                <button id="btn-a4" class="btn btn-format ${isA4 ? 'active' : ''}" onclick="trocarFormato('a4')">
                  Folha A4 / PDF
                </button>
              </div>

              <button class="btn btn-primary" onclick="window.print()">
                🖨️ Imprimir / Salvar PDF
              </button>
              <button class="btn btn-secondary" onclick="window.close()">
                ✕ Fechar
              </button>
            </div>
          </div>

          <div class="paper-wrapper">
            ${htmlContent}
          </div>

          <script>
            window.addEventListener('load', function() {
              setTimeout(function() {
                window.focus();
                window.print();
              }, 350);
            });
          </script>
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank', 'width=680,height=850');
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(fullDocHtml);
        printWindow.document.close();
      } else {
        // Fallback caso popup seja bloqueado pelo navegador
        let iframe = document.getElementById('hubi-print-iframe') as HTMLIFrameElement;
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.id = 'hubi-print-iframe';
          iframe.style.position = 'fixed';
          iframe.style.right = '0';
          iframe.style.bottom = '0';
          iframe.style.width = '0';
          iframe.style.height = '0';
          iframe.style.border = '0';
          document.body.appendChild(iframe);
        }
        const doc = iframe.contentWindow?.document || iframe.contentDocument;
        if (doc) {
          doc.open();
          doc.write(fullDocHtml);
          doc.close();
          setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          }, 400);
        }
      }
    } catch (err) {
      console.error('Erro ao imprimir fechamento de caixa:', err);
    }
  }

  /**
   * Formata uma mensagem completa para envio direto ao WhatsApp do cliente
   */
  static openWhatsApp(phone: string, message: string): void {
    const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
    const formattedPhone = cleanPhone ? (cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`) : '';
    const url = formattedPhone
      ? `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  /**
   * Dispara a impressão nativa do navegador
   */
  static printWindow(): void {
    window.print();
  }
}
