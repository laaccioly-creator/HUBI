import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { Cliente, TabelaPreco } from '../types';

export interface LinhaClienteImportacao {
  linha: number;
  nome: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  numero_documento?: string;
  tabela_preco_padrao: TabelaPreco;
  permite_fiado: boolean;
  limite_credito: number;
  saldo_devedor_fiado: number;
  endereco_cep?: string;
  endereco_logradouro?: string;
  endereco_numero?: string;
  endereco_complemento?: string;
  endereco_bairro?: string;
  endereco_cidade?: string;
  endereco_estado?: string;
  data_aniversario?: string;
  observacoes?: string;
  ativo: boolean;
  statusAcao: 'NOVO' | 'ATUALIZAR' | 'ERRO';
  mensagemErro?: string;
  clienteExistenteId?: string;
}

export interface ResultadoParseClienteImportacao {
  totalLinhasLidas: number;
  clientesValidos: LinhaClienteImportacao[];
  clientesComErro: LinhaClienteImportacao[];
  novosCadastros: number;
  atualizacoes: number;
}

export interface RelatorioResultadoClienteImportacao {
  sucesso: boolean;
  totalCadastrados: number;
  totalAtualizados: number;
  erros: string[];
}

export const COLUNAS_LAYOUT_CLIENTE = [
  { chave: 'nome', rotulo: 'Nome do Cliente *', exemplo: 'Maria da Silva', obrigatorio: true },
  { chave: 'telefone', rotulo: 'Telefone / Celular', exemplo: '(11) 98765-4321', obrigatorio: false },
  { chave: 'whatsapp', rotulo: 'WhatsApp', exemplo: '(11) 98765-4321', obrigatorio: false },
  { chave: 'email', rotulo: 'E-mail', exemplo: 'maria.silva@email.com', obrigatorio: false },
  { chave: 'numero_documento', rotulo: 'CPF / CNPJ', exemplo: '123.456.789-00', obrigatorio: false },
  { chave: 'tabela_preco_padrao', rotulo: 'Tabela de Preço (VAREJO/ATACADO/AUTOATACADO)', exemplo: 'VAREJO', obrigatorio: false },
  { chave: 'permite_fiado', rotulo: 'Permite Fiado (SIM/NAO)', exemplo: 'SIM', obrigatorio: false },
  { chave: 'limite_credito', rotulo: 'Limite de Crédito Fiado (R$)', exemplo: '500.00', obrigatorio: false },
  { chave: 'saldo_devedor_fiado', rotulo: 'Saldo Devedor Inicial (R$)', exemplo: '0.00', obrigatorio: false },
  { chave: 'endereco_cep', rotulo: 'CEP', exemplo: '01001-000', obrigatorio: false },
  { chave: 'endereco_logradouro', rotulo: 'Logradouro / Rua', exemplo: 'Rua das Flores', obrigatorio: false },
  { chave: 'endereco_numero', rotulo: 'Número', exemplo: '123', obrigatorio: false },
  { chave: 'endereco_complemento', rotulo: 'Complemento', exemplo: 'Apto 101', obrigatorio: false },
  { chave: 'endereco_bairro', rotulo: 'Bairro', exemplo: 'Centro', obrigatorio: false },
  { chave: 'endereco_cidade', rotulo: 'Cidade', exemplo: 'São Paulo', obrigatorio: false },
  { chave: 'endereco_estado', rotulo: 'Estado (UF)', exemplo: 'SP', obrigatorio: false },
  { chave: 'data_aniversario', rotulo: 'Data de Aniversário (AAAA-MM-DD ou DD/MM/AAAA)', exemplo: '15/05/1990', obrigatorio: false },
  { chave: 'observacoes', rotulo: 'Observações', exemplo: 'Cliente preferencial', obrigatorio: false },
  { chave: 'status', rotulo: 'Status (ATIVO/INATIVO)', exemplo: 'ATIVO', obrigatorio: false }
];

const LINHAS_EXEMPLO_CLIENTES = [
  {
    'Nome do Cliente *': 'Maria da Silva Oliveira',
    'Telefone / Celular': '(11) 98765-4321',
    'WhatsApp': '(11) 98765-4321',
    'E-mail': 'maria.silva@exemplo.com',
    'CPF / CNPJ': '123.456.789-00',
    'Tabela de Preço (VAREJO/ATACADO/AUTOATACADO)': 'VAREJO',
    'Permite Fiado (SIM/NAO)': 'SIM',
    'Limite de Crédito Fiado (R$)': 500.00,
    'Saldo Devedor Inicial (R$)': 0.00,
    'CEP': '01310-100',
    'Logradouro / Rua': 'Avenida Paulista',
    'Número': '1000',
    'Complemento': 'Apto 42',
    'Bairro': 'Bela Vista',
    'Cidade': 'São Paulo',
    'Estado (UF)': 'SP',
    'Data de Aniversário (AAAA-MM-DD ou DD/MM/AAAA)': '15/05/1988',
    'Observações': 'Cliente assídua, compra sempre aos sábados',
    'Status (ATIVO/INATIVO)': 'ATIVO'
  },
  {
    'Nome do Cliente *': 'João Pedro Santos (Empresa Silva & Santos)',
    'Telefone / Celular': '(11) 97654-3210',
    'WhatsApp': '(11) 97654-3210',
    'E-mail': 'contato@silvaesantos.com.br',
    'CPF / CNPJ': '12.345.678/0001-90',
    'Tabela de Preço (VAREJO/ATACADO/AUTOATACADO)': 'ATACADO',
    'Permite Fiado (SIM/NAO)': 'SIM',
    'Limite de Crédito Fiado (R$)': 2000.00,
    'Saldo Devedor Inicial (R$)': 0.00,
    'CEP': '04538-133',
    'Logradouro / Rua': 'Rua Funchal',
    'Número': '418',
    'Complemento': 'Conjunto 1002',
    'Bairro': 'Vila Olímpia',
    'Cidade': 'São Paulo',
    'Estado (UF)': 'SP',
    'Data de Aniversário (AAAA-MM-DD ou DD/MM/AAAA)': '22/10/1982',
    'Observações': 'Comprador atacadista quinzenal',
    'Status (ATIVO/INATIVO)': 'ATIVO'
  },
  {
    'Nome do Cliente *': 'Ana Clara Souza',
    'Telefone / Celular': '(21) 99887-6655',
    'WhatsApp': '(21) 99887-6655',
    'E-mail': 'anaclara@email.com',
    'CPF / CNPJ': '987.654.321-11',
    'Tabela de Preço (VAREJO/ATACADO/AUTOATACADO)': 'VAREJO',
    'Permite Fiado (SIM/NAO)': 'NAO',
    'Limite de Crédito Fiado (R$)': 0.00,
    'Saldo Devedor Inicial (R$)': 0.00,
    'CEP': '22041-001',
    'Logradouro / Rua': 'Rua Barata Ribeiro',
    'Número': '200',
    'Complemento': '',
    'Bairro': 'Copacabana',
    'Cidade': 'Rio de Janeiro',
    'Estado (UF)': 'RJ',
    'Data de Aniversário (AAAA-MM-DD ou DD/MM/AAAA)': '03/12/1995',
    'Observações': 'Pagamentos sempre no Pix',
    'Status (ATIVO/INATIVO)': 'ATIVO'
  }
];

export const clientImportExportService = {
  downloadModeloXLSX() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(LINHAS_EXEMPLO_CLIENTES);

    ws['!cols'] = [
      { wch: 32 }, // Nome
      { wch: 20 }, // Telefone
      { wch: 20 }, // WhatsApp
      { wch: 28 }, // Email
      { wch: 20 }, // Documento
      { wch: 28 }, // Tabela Preço
      { wch: 22 }, // Permite Fiado
      { wch: 25 }, // Limite Fiado
      { wch: 24 }, // Saldo Devedor
      { wch: 14 }, // CEP
      { wch: 26 }, // Logradouro
      { wch: 12 }, // Número
      { wch: 18 }, // Complemento
      { wch: 20 }, // Bairro
      { wch: 20 }, // Cidade
      { wch: 12 }, // Estado
      { wch: 28 }, // Aniversário
      { wch: 35 }, // Observações
      { wch: 20 }  // Status
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Modelo_Clientes');
    XLSX.writeFile(wb, 'HUBI_Modelo_Importacao_Clientes.xlsx');
  },

  downloadModeloCSV() {
    const colunas = Object.keys(LINHAS_EXEMPLO_CLIENTES[0]);
    const cabecalhos = colunas.join(';');

    const linhas = LINHAS_EXEMPLO_CLIENTES.map(item => {
      return [
        `"${item['Nome do Cliente *']}"`,
        `"${item['Telefone / Celular']}"`,
        `"${item['WhatsApp']}"`,
        `"${item['E-mail']}"`,
        `"${item['CPF / CNPJ']}"`,
        `"${item['Tabela de Preço (VAREJO/ATACADO/AUTOATACADO)']}"`,
        `"${item['Permite Fiado (SIM/NAO)']}"`,
        item['Limite de Crédito Fiado (R$)'].toFixed(2),
        item['Saldo Devedor Inicial (R$)'].toFixed(2),
        `"${item['CEP']}"`,
        `"${item['Logradouro / Rua']}"`,
        `"${item['Número']}"`,
        `"${item['Complemento']}"`,
        `"${item['Bairro']}"`,
        `"${item['Cidade']}"`,
        `"${item['Estado (UF)']}"`,
        `"${item['Data de Aniversário (AAAA-MM-DD ou DD/MM/AAAA)']}"`,
        `"${item['Observações']}"`,
        `"${item['Status (ATIVO/INATIVO)']}"`
      ].join(';');
    });

    const csvContent = '\uFEFF' + [cabecalhos, ...linhas].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'HUBI_Modelo_Importacao_Clientes.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  async processarArquivo(arquivo: File, clientesExistentes: Cliente[]): Promise<ResultadoParseClienteImportacao> {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();

      leitor.onload = (e) => {
        try {
          const dados = e.target?.result;
          if (!dados) throw new Error('Arquivo vazio ou ilegível');

          const workbook = XLSX.read(dados, { type: 'binary', cellDates: true });
          const primeiroNomeSheet = workbook.SheetNames[0];
          if (!primeiroNomeSheet) throw new Error('Planilha sem abas válidas');

          const worksheet = workbook.Sheets[primeiroNomeSheet];
          const linhasBrutas: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

          if (!linhasBrutas || linhasBrutas.length === 0) {
            throw new Error('Nenhuma linha de dados encontrada na planilha');
          }

          // Dicionários para cruzamento rápido de clientes existentes
          const porDocumento = new Map<string, Cliente>();
          const porTelefone = new Map<string, Cliente>();
          const porNome = new Map<string, Cliente>();

          const limparDigitos = (v?: string | null) => (v ? v.replace(/\D/g, '') : '');

          clientesExistentes.forEach(c => {
            const doc = limparDigitos(c.numero_documento);
            if (doc) porDocumento.set(doc, c);

            const tel = limparDigitos(c.telefone);
            if (tel) porTelefone.set(tel, c);

            const zap = limparDigitos(c.whatsapp);
            if (zap) porTelefone.set(zap, c);

            const nomeLimpo = c.nome.trim().toLowerCase();
            if (nomeLimpo) porNome.set(nomeLimpo, c);
          });

          const clientesValidos: LinhaClienteImportacao[] = [];
          const clientesComErro: LinhaClienteImportacao[] = [];
          let novosCadastros = 0;
          let atualizacoes = 0;

          linhasBrutas.forEach((linhaRaw, index) => {
            const numLinha = index + 2;

            // Extrair campos aceitando variações de rótulos
            const nome = this.obterValor(linhaRaw, ['nome do cliente *', 'nome do cliente', 'nome', 'cliente', 'razao social']);
            const telefone = this.obterValor(linhaRaw, ['telefone / celular', 'telefone', 'celular', 'fone', 'tel']);
            const whatsapp = this.obterValor(linhaRaw, ['whatsapp', 'zap', 'wpp']);
            const email = this.obterValor(linhaRaw, ['e-mail', 'email', 'correio eletronico']);
            const numeroDoc = this.obterValor(linhaRaw, ['cpf / cnpj', 'cpf', 'cnpj', 'n° doc.', 'documento', 'numero documento']);
            const tabelaPrecoRaw = this.obterValor(linhaRaw, ['tabela de preço (varejo/atacado/autoatacado)', 'tabela de preco', 'tabela de preço', 'tabela']);
            const permiteFiadoRaw = this.obterValor(linhaRaw, ['permite fiado (sim/nao)', 'permite fiado', 'fiado']);
            const limiteCreditoRaw = this.obterValor(linhaRaw, ['limite de crédito fiado (r$)', 'limite de credito', 'limite']);
            const saldoDevedorRaw = this.obterValor(linhaRaw, ['saldo devedor inicial (r$)', 'saldo devedor', 'debito']);
            const cep = this.obterValor(linhaRaw, ['cep']);
            const logradouro = this.obterValor(linhaRaw, ['logradouro / rua', 'logradouro', 'rua', 'endereco']);
            const numero = this.obterValor(linhaRaw, ['número', 'numero', 'n°', 'num']);
            const complemento = this.obterValor(linhaRaw, ['complemento', 'compl']);
            const bairro = this.obterValor(linhaRaw, ['bairro']);
            const cidade = this.obterValor(linhaRaw, ['cidade', 'municipio']);
            const estado = this.obterValor(linhaRaw, ['estado (uf)', 'estado', 'uf']);
            const aniversarioRaw = this.obterValor(linhaRaw, ['data de aniversário (aaaa-mm-dd ou dd/mm/aaaa)', 'data de aniversario', 'aniversario', 'data nascimento']);
            const observacoes = this.obterValor(linhaRaw, ['observações', 'observacoes', 'obs']);
            const statusRaw = this.obterValor(linhaRaw, ['status (ativo/inativo)', 'status', 'ativo']);

            // Validação de campos obrigatórios
            if (!nome || !nome.trim()) {
              clientesComErro.push({
                linha: numLinha,
                nome: '(Em branco)',
                tabela_preco_padrao: 'varejo',
                permite_fiado: true,
                limite_credito: 0,
                saldo_devedor_fiado: 0,
                ativo: true,
                statusAcao: 'ERRO',
                mensagemErro: 'Nome do cliente é obrigatório.'
              });
              return;
            }

            // Sanitização de Tabela de Preço
            let tabelaPreco: TabelaPreco = 'varejo';
            if (tabelaPrecoRaw) {
              const tLow = tabelaPrecoRaw.toLowerCase();
              if (tLow.includes('atacado') && !tLow.includes('auto')) tabelaPreco = 'atacado';
              else if (tLow.includes('auto') || tLow.includes('distribuidor')) tabelaPreco = 'autoatacado';
            }

            // Sanitização Permite Fiado
            let permiteFiado = true;
            if (permiteFiadoRaw) {
              const pLow = permiteFiadoRaw.toLowerCase();
              if (pLow.includes('nao') || pLow.includes('não') || pLow === 'false' || pLow === '0') {
                permiteFiado = false;
              }
            }

            // Valores numéricos
            const limiteCredito = this.converterNumero(limiteCreditoRaw);
            const saldoDevedor = this.converterNumero(saldoDevedorRaw);

            // Sanitização de Status
            let ativo = true;
            if (statusRaw) {
              const sLow = statusRaw.toLowerCase();
              if (sLow.includes('inativo') || sLow === 'false' || sLow === '0') {
                ativo = false;
              }
            }

            // Formatação de Aniversário
            const dataAniversario = this.formatarDataIso(aniversarioRaw);

            // Cruzar para verificar se já existe
            const docLimpo = limparDigitos(numeroDoc);
            const telLimpo = limparDigitos(whatsapp || telefone);
            const nomeNormalizado = nome.trim().toLowerCase();

            let clienteExistente: Cliente | undefined = undefined;
            if (docLimpo && porDocumento.has(docLimpo)) {
              clienteExistente = porDocumento.get(docLimpo);
            } else if (telLimpo && porTelefone.has(telLimpo)) {
              clienteExistente = porTelefone.get(telLimpo);
            } else if (porNome.has(nomeNormalizado)) {
              clienteExistente = porNome.get(nomeNormalizado);
            }

            const statusAcao = clienteExistente ? 'ATUALIZAR' : 'NOVO';
            if (statusAcao === 'NOVO') novosCadastros++;
            else atualizacoes++;

            clientesValidos.push({
              linha: numLinha,
              nome: nome.trim(),
              telefone: telefone?.trim() || undefined,
              whatsapp: whatsapp?.trim() || telefone?.trim() || undefined,
              email: email?.trim() || undefined,
              numero_documento: numeroDoc?.trim() || undefined,
              tabela_preco_padrao: tabelaPreco,
              permite_fiado: permiteFiado,
              limite_credito: limiteCredito,
              saldo_devedor_fiado: saldoDevedor,
              endereco_cep: cep?.trim() || undefined,
              endereco_logradouro: logradouro?.trim() || undefined,
              endereco_numero: numero?.trim() || undefined,
              endereco_complemento: complemento?.trim() || undefined,
              endereco_bairro: bairro?.trim() || undefined,
              endereco_cidade: cidade?.trim() || undefined,
              endereco_estado: estado?.trim()?.toUpperCase() || undefined,
              data_aniversario: dataAniversario,
              observacoes: observacoes?.trim() || undefined,
              ativo,
              statusAcao,
              clienteExistenteId: clienteExistente?.id
            });
          });

          resolve({
            totalLinhasLidas: linhasBrutas.length,
            clientesValidos,
            clientesComErro,
            novosCadastros,
            atualizacoes
          });
        } catch (err) {
          reject(err);
        }
      };

      leitor.onerror = () => reject(new Error('Falha ao ler o arquivo selecionado.'));
      leitor.readAsBinaryString(arquivo);
    });
  },

  async executarImportacao(
    lojaId: string,
    clientes: LinhaClienteImportacao[],
    onProgresso?: (porcentagem: number, texto: string) => void
  ): Promise<RelatorioResultadoClienteImportacao> {
    let totalCadastrados = 0;
    let totalAtualizados = 0;
    const erros: string[] = [];

    const total = clientes.length;

    for (let i = 0; i < total; i++) {
      const c = clientes[i];
      const progresso = Math.round(((i + 1) / total) * 100);
      if (onProgresso) {
        onProgresso(progresso, `Processando cliente ${i + 1} de ${total}: ${c.nome}`);
      }

      // Montar partes do endereço principal formatado
      const partesEndereco: string[] = [];
      if (c.endereco_logradouro) partesEndereco.push(c.endereco_logradouro);
      if (c.endereco_numero) partesEndereco.push(c.endereco_numero);
      if (c.endereco_complemento) partesEndereco.push(`(${c.endereco_complemento})`);
      if (c.endereco_bairro) partesEndereco.push(c.endereco_bairro);
      if (c.endereco_cidade) partesEndereco.push(c.endereco_cidade);
      if (c.endereco_estado) partesEndereco.push(c.endereco_estado);
      if (c.endereco_cep) partesEndereco.push(`CEP: ${c.endereco_cep}`);
      const enderecoFormatado = partesEndereco.length > 0 ? partesEndereco.join(', ') : null;

      const payloadCompleto: any = {
        loja_id: lojaId,
        nome: c.nome,
        telefone: c.telefone || null,
        whatsapp: c.whatsapp || c.telefone || null,
        email: c.email || null,
        numero_documento: c.numero_documento || null,
        tabela_preco_padrao: c.tabela_preco_padrao,
        permite_fiado: c.permite_fiado,
        limite_credito: c.permite_fiado ? c.limite_credito : 0,
        endereco_cep: c.endereco_cep || null,
        endereco_logradouro: c.endereco_logradouro || null,
        endereco_numero: c.endereco_numero || null,
        endereco_complemento: c.endereco_complemento || null,
        endereco_bairro: c.endereco_bairro || null,
        endereco_cidade: c.endereco_cidade || null,
        endereco_estado: c.endereco_estado || null,
        endereco_principal: enderecoFormatado,
        data_aniversario: c.data_aniversario || null,
        observacoes: c.observacoes || null,
        ativo: c.ativo
      };

      try {
        if (c.clienteExistenteId) {
          // Update
          let { error: erroUpdate } = await supabase
            .from('clientes')
            .update(payloadCompleto)
            .eq('id', c.clienteExistenteId);

          if (erroUpdate && erroUpdate.message && erroUpdate.message.includes('ativo')) {
            delete payloadCompleto.ativo;
            const retry = await supabase
              .from('clientes')
              .update(payloadCompleto)
              .eq('id', c.clienteExistenteId);
            erroUpdate = retry.error;
          }

          if (erroUpdate) {
            // Fallback reduzido caso colunas específicas de endereço não existam na tabela
            const payloadReduzido = {
              nome: c.nome,
              telefone: c.telefone || null,
              whatsapp: c.whatsapp || null,
              email: c.email || null,
              numero_documento: c.numero_documento || null,
              tabela_preco_padrao: c.tabela_preco_padrao,
              permite_fiado: c.permite_fiado,
              limite_credito: c.permite_fiado ? c.limite_credito : 0,
              endereco_principal: enderecoFormatado,
              observacoes: c.observacoes || null
            };
            const { error: erroFallback } = await supabase
              .from('clientes')
              .update(payloadReduzido)
              .eq('id', c.clienteExistenteId);

            if (erroFallback) throw erroFallback;
          }
          totalAtualizados++;
        } else {
          // Insert
          payloadCompleto.saldo_devedor_fiado = c.saldo_devedor_fiado || 0;

          let { error: erroInsert } = await supabase
            .from('clientes')
            .insert([payloadCompleto]);

          if (erroInsert && erroInsert.message && erroInsert.message.includes('ativo')) {
            delete payloadCompleto.ativo;
            const retry = await supabase
              .from('clientes')
              .insert([payloadCompleto]);
            erroInsert = retry.error;
          }

          if (erroInsert) {
            const payloadReduzido = {
              loja_id: lojaId,
              nome: c.nome,
              telefone: c.telefone || null,
              whatsapp: c.whatsapp || null,
              email: c.email || null,
              numero_documento: c.numero_documento || null,
              tabela_preco_padrao: c.tabela_preco_padrao,
              permite_fiado: c.permite_fiado,
              limite_credito: c.permite_fiado ? c.limite_credito : 0,
              saldo_devedor_fiado: c.saldo_devedor_fiado || 0,
              endereco_principal: enderecoFormatado,
              observacoes: c.observacoes || null
            };
            const { error: erroFallback } = await supabase
              .from('clientes')
              .insert([payloadReduzido]);

            if (erroFallback) throw erroFallback;
          }
          totalCadastrados++;
        }
      } catch (err: any) {
        erros.push(`Linha ${c.linha} (${c.nome}): ${err.message || 'Erro ao gravar no banco de dados'}`);
      }
    }

    return {
      sucesso: erros.length === 0,
      totalCadastrados,
      totalAtualizados,
      erros
    };
  },

  exportarClientesXLSX(clientes: Cliente[], nomeLoja?: string) {
    const dadosFormatados = clientes.map(c => ({
      'Nome do Cliente *': c.nome || '',
      'Telefone / Celular': c.telefone || '',
      'WhatsApp': c.whatsapp || '',
      'E-mail': c.email || '',
      'CPF / CNPJ': c.numero_documento || '',
      'Tabela de Preço': (c.tabela_preco_padrao || 'varejo').toUpperCase(),
      'Permite Fiado': c.permite_fiado !== false ? 'SIM' : 'NÃO',
      'Limite de Crédito (R$)': Number(c.limite_credito || 0),
      'Saldo Devedor (R$)': Number(c.saldo_devedor_fiado || 0),
      'CEP': c.endereco_cep || '',
      'Logradouro / Rua': c.endereco_logradouro || '',
      'Número': c.endereco_numero || '',
      'Complemento': c.endereco_complemento || '',
      'Bairro': c.endereco_bairro || '',
      'Cidade': c.endereco_cidade || '',
      'Estado (UF)': c.endereco_estado || '',
      'Endereço Principal': c.endereco_principal || '',
      'Data de Aniversário': c.data_aniversario || '',
      'Observações': c.observacoes || '',
      'Data de Cadastro': c.criado_em ? new Date(c.criado_em).toLocaleDateString('pt-BR') : ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dadosFormatados);

    ws['!cols'] = [
      { wch: 32 }, // Nome
      { wch: 18 }, // Telefone
      { wch: 18 }, // WhatsApp
      { wch: 28 }, // Email
      { wch: 20 }, // Documento
      { wch: 16 }, // Tabela
      { wch: 14 }, // Permite fiado
      { wch: 22 }, // Limite
      { wch: 20 }, // Saldo
      { wch: 14 }, // CEP
      { wch: 26 }, // Logradouro
      { wch: 10 }, // Numero
      { wch: 16 }, // Complemento
      { wch: 18 }, // Bairro
      { wch: 20 }, // Cidade
      { wch: 12 }, // UF
      { wch: 35 }, // Endereco principal
      { wch: 20 }, // Aniversario
      { wch: 30 }, // Observacoes
      { wch: 16 }  // Cadastro
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    const timestamp = new Date().toISOString().slice(0, 10);
    const safeNomeLoja = (nomeLoja || 'HUBI').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(wb, `${safeNomeLoja}_Clientes_${timestamp}.xlsx`);
  },

  exportarClientesCSV(clientes: Cliente[], nomeLoja?: string) {
    const colunas = [
      'Nome',
      'Telefone',
      'WhatsApp',
      'E-mail',
      'CPF/CNPJ',
      'Tabela de Preço',
      'Permite Fiado',
      'Limite de Crédito (R$)',
      'Saldo Devedor (R$)',
      'Endereço Completo',
      'Data de Cadastro',
      'Observações'
    ];

    const linhas = clientes.map(c => {
      const endereco = c.endereco_principal || [
        c.endereco_logradouro,
        c.endereco_numero,
        c.endereco_bairro,
        c.endereco_cidade,
        c.endereco_estado
      ].filter(Boolean).join(', ');

      return [
        this.formatarCampoCsv(c.nome),
        this.formatarCampoCsv(c.telefone || ''),
        this.formatarCampoCsv(c.whatsapp || ''),
        this.formatarCampoCsv(c.email || ''),
        this.formatarCampoCsv(c.numero_documento || ''),
        this.formatarCampoCsv((c.tabela_preco_padrao || 'varejo').toUpperCase()),
        this.formatarCampoCsv(c.permite_fiado !== false ? 'SIM' : 'NÃO'),
        Number(c.limite_credito || 0).toFixed(2).replace('.', ','),
        Number(c.saldo_devedor_fiado || 0).toFixed(2).replace('.', ','),
        this.formatarCampoCsv(endereco),
        this.formatarCampoCsv(c.criado_em ? new Date(c.criado_em).toLocaleDateString('pt-BR') : ''),
        this.formatarCampoCsv(c.observacoes || '')
      ].join(';');
    });

    const csvHeader = colunas.map(c => `"${c}"`).join(';');
    const csvContent = '\uFEFF' + [csvHeader, ...linhas].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10);
    const safeNomeLoja = (nomeLoja || 'HUBI').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.setAttribute('href', url);
    link.setAttribute('download', `${safeNomeLoja}_Clientes_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  obterValor(obj: any, chavesPossiveis: string[]): string | undefined {
    const chavesObj = Object.keys(obj);
    for (const cp of chavesPossiveis) {
      const chaveEncontrada = chavesObj.find(k => k.trim().toLowerCase() === cp);
      if (chaveEncontrada && obj[chaveEncontrada] !== undefined && obj[chaveEncontrada] !== null) {
        const v = String(obj[chaveEncontrada]).trim();
        if (v !== '') return v;
      }
    }
    return undefined;
  },

  converterNumero(v?: any): number {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isNaN(v) ? 0 : v;
    const str = String(v).replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  },

  formatarDataIso(v?: string): string | undefined {
    if (!v) return undefined;
    const limpo = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(limpo)) return limpo;
    // Tenta DD/MM/AAAA
    const matchBr = limpo.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (matchBr) {
      const dia = matchBr[1].padStart(2, '0');
      const mes = matchBr[2].padStart(2, '0');
      const ano = matchBr[3];
      return `${ano}-${mes}-${dia}`;
    }
    return undefined;
  },

  formatarCampoCsv(valor: any): string {
    if (valor === null || valor === undefined || valor === '') return '""';
    const str = String(valor).replace(/"/g, '""');
    return `"${str}"`;
  }
};
