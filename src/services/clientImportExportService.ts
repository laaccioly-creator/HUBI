import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { Cliente, TabelaPreco } from '../types';

export interface LinhaClienteImportacao {
  linha: number;
  nome: string;
  telefone?: string;
  whatsapp?: string;
  telefoneOriginal?: string;
  telefoneAjustadoComDddLoja?: boolean;
  telefoneAjustadoNonoDigito?: boolean;
  email?: string;
  numero_documento?: string;
  tabela_preco_padrao: TabelaPreco;
  permite_fiado: boolean;
  limite_credito: number;
  saldo_devedor_fiado: number;
  permite_caderneta?: boolean;
  limite_caderneta?: number;
  dia_vencimento_caderneta?: number;
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
  statusAcao: 'NOVO' | 'ATUALIZAR' | 'IGNORADO' | 'ERRO';
  mensagemErro?: string;
  clienteExistenteId?: string;
}

export interface OpcoesImportacaoCliente {
  modoDuplicados?: 'ignorar' | 'atualizar';
  dddPadraoLoja?: string;
  ativarCaderneta?: boolean;
  limiteCadernetaPadrao?: number;
  diaVencimentoCadernetaPadrao?: number;
}

export interface TelefoneHigienizado {
  formatado?: string;
  numerosApenas?: string;
  chaveCanonico?: string;
  ajustouDddLoja: boolean;
  ajustouNonoDigito: boolean;
  valido: boolean;
  motivoInvalido?: string;
}

export interface ResultadoParseClienteImportacao {
  totalLinhasLidas: number;
  clientesValidos: LinhaClienteImportacao[];
  clientesComErro: LinhaClienteImportacao[];
  novosCadastros: number;
  atualizacoes: number;
  ignoradosDuplicados: number;
}

export interface RelatorioResultadoClienteImportacao {
  sucesso: boolean;
  totalCadastrados: number;
  totalAtualizados: number;
  totalIgnorados: number;
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

const LINHAS_EXEMPLO_SIMPLIFICADAS = [
  {
    'Nome do Cliente *': 'Maria da Silva',
    'WhatsApp / Celular *': '(11) 98765-4321',
    'Endereço (Rua, Número, Bairro)': 'Rua das Flores, 123, Centro',
    'Observações': 'Cliente assídua, compra aos sábados'
  },
  {
    'Nome do Cliente *': 'João Pedro Santos',
    'WhatsApp / Celular *': '(11) 97654-3210',
    'Endereço (Rua, Número, Bairro)': 'Avenida Paulista, 1000, Apto 42',
    'Observações': 'Comprador quinzenal'
  },
  {
    'Nome do Cliente *': 'Ana Clara Souza',
    'WhatsApp / Celular *': '(21) 99887-6655',
    'Endereço (Rua, Número, Bairro)': 'Rua Barata Ribeiro, 200, Copacabana',
    'Observações': 'Pagamentos preferenciais via Pix'
  }
];

export function sanitizarTelefoneBrasileiro(
  telefoneBruto?: string | null,
  dddPadraoLoja?: string | null
): TelefoneHigienizado {
  if (!telefoneBruto) {
    return { ajustouDddLoja: false, ajustouNonoDigito: false, valido: false };
  }

  // 1. Extrair se vier múltiplos números concatenados (ex: Google Contacts com " ::: " ou barras)
  let str = String(telefoneBruto).split(':::')[0].split('/')[0].split(';')[0].trim();
  // Remover sufixos do WhatsApp Web (@c.us, @s.whatsapp.net)
  str = str.replace(/@c\.us/gi, '').replace(/@s\.whatsapp\.net/gi, '').trim();

  // Limpar tudo que não for dígito
  let digitos = str.replace(/\D/g, '');
  if (!digitos) {
    return { ajustouDddLoja: false, ajustouNonoDigito: false, valido: false };
  }

  // 2. Remover zeros de prefixos de discagem/operadora iniciais (ex: 01511... ou 011...)
  if (digitos.startsWith('0') && digitos.length >= 11) {
    digitos = digitos.replace(/^0+/, '');
  }

  // 3. Remover DDI do Brasil (55) se vier com 12 ou 13 dígitos
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) {
    digitos = digitos.substring(2);
  }

  let ajustouDddLoja = false;
  let ajustouNonoDigito = false;

  // Extrair DDD padrão da loja limpo (2 dígitos)
  const dddLojaLimpo = (dddPadraoLoja || '').replace(/\D/g, '').slice(0, 2);

  // 4. Se tiver 8 ou 9 dígitos (número sem DDD)
  if ((digitos.length === 8 || digitos.length === 9) && dddLojaLimpo && dddLojaLimpo.length === 2) {
    digitos = dddLojaLimpo + digitos;
    ajustouDddLoja = true;
  }

  // 5. Ajustar nono dígito para celulares
  // Formato com DDD (2 dígitos) + 8 dígitos (total 10)
  if (digitos.length === 10) {
    const ddd = digitos.substring(0, 2);
    const primeiroDigitoLocal = digitos.charAt(2);
    // Se o primeiro dígito local for 6, 7, 8 ou 9, é celular sem o nono dígito
    if (['6', '7', '8', '9'].includes(primeiroDigitoLocal)) {
      digitos = ddd + '9' + digitos.substring(2);
      ajustouNonoDigito = true;
    }
  }

  // Validação final de formato nacional (10 para fixo, 11 para celular)
  if (digitos.length !== 10 && digitos.length !== 11) {
    return {
      numerosApenas: digitos,
      formatado: str,
      ajustouDddLoja,
      ajustouNonoDigito,
      valido: false,
      motivoInvalido: `Quantidade de dígitos inválida (${digitos.length})`
    };
  }

  const ddd = digitos.substring(0, 2);
  const dddNum = parseInt(ddd, 10);
  if (dddNum < 11 || dddNum > 99) {
    return {
      numerosApenas: digitos,
      formatado: str,
      ajustouDddLoja,
      ajustouNonoDigito,
      valido: false,
      motivoInvalido: `DDD inválido (${ddd})`
    };
  }

  // Formatação canônica
  let formatado = '';
  if (digitos.length === 11) {
    formatado = `(${ddd}) ${digitos.substring(2, 7)}-${digitos.substring(7)}`;
  } else {
    formatado = `(${ddd}) ${digitos.substring(2, 6)}-${digitos.substring(6)}`;
  }

  const chaveCanonico = `${ddd}${digitos.slice(-8)}`;

  return {
    formatado,
    numerosApenas: digitos,
    chaveCanonico,
    ajustouDddLoja,
    ajustouNonoDigito,
    valido: true
  };
}

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

  downloadModeloSimplificadoXLSX() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(LINHAS_EXEMPLO_SIMPLIFICADAS);

    ws['!cols'] = [
      { wch: 32 }, // Nome do Cliente
      { wch: 24 }, // WhatsApp / Celular
      { wch: 38 }, // Endereço
      { wch: 35 }  // Observações
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Modelo_Simplificado');
    XLSX.writeFile(wb, 'HUBI_Modelo_Simplificado_WhatsApp.xlsx');
  },

  downloadModeloSimplificadoCSV() {
    const colunas = Object.keys(LINHAS_EXEMPLO_SIMPLIFICADAS[0]);
    const cabecalhos = colunas.join(';');

    const linhas = LINHAS_EXEMPLO_SIMPLIFICADAS.map(item => {
      return [
        `"${item['Nome do Cliente *']}"`,
        `"${item['WhatsApp / Celular *']}"`,
        `"${item['Endereço (Rua, Número, Bairro)']}"`,
        `"${item['Observações']}"`
      ].join(';');
    });

    const csvContent = '\uFEFF' + [cabecalhos, ...linhas].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'HUBI_Modelo_Simplificado_WhatsApp.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  sanitizarTelefone: sanitizarTelefoneBrasileiro,

  async processarArquivo(
    arquivo: File,
    clientesExistentes: Cliente[],
    opcoes?: OpcoesImportacaoCliente
  ): Promise<ResultadoParseClienteImportacao> {
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

            // Indexar telefones por chave canônica e dígitos
            const telSanitizado = sanitizarTelefoneBrasileiro(c.telefone, opcoes?.dddPadraoLoja);
            if (telSanitizado.chaveCanonico) porTelefone.set(telSanitizado.chaveCanonico, c);
            if (telSanitizado.numerosApenas) porTelefone.set(telSanitizado.numerosApenas, c);

            const zapSanitizado = sanitizarTelefoneBrasileiro(c.whatsapp, opcoes?.dddPadraoLoja);
            if (zapSanitizado.chaveCanonico) porTelefone.set(zapSanitizado.chaveCanonico, c);
            if (zapSanitizado.numerosApenas) porTelefone.set(zapSanitizado.numerosApenas, c);

            const telLimpo = limparDigitos(c.telefone);
            if (telLimpo) porTelefone.set(telLimpo, c);
            const zapLimpo = limparDigitos(c.whatsapp);
            if (zapLimpo) porTelefone.set(zapLimpo, c);

            const nomeLimpo = c.nome.trim().toLowerCase();
            if (nomeLimpo) porNome.set(nomeLimpo, c);
          });

          // Rastreador de duplicados intra-arquivo
          const chavesVistasNoArquivo = new Set<string>();

          const clientesValidos: LinhaClienteImportacao[] = [];
          const clientesComErro: LinhaClienteImportacao[] = [];
          let novosCadastros = 0;
          let atualizacoes = 0;
          let ignoradosDuplicados = 0;

          linhasBrutas.forEach((linhaRaw, index) => {
            const numLinha = index + 2;

            // Extrair nome aceitando múltiplos padrões (HUBI, Google Contacts, WhatsApp Web)
            let nome = this.obterValor(linhaRaw, [
              'nome do cliente *',
              'nome do cliente',
              'nome',
              'cliente',
              'razao social',
              'name',
              'saved name',
              'display name',
              'public name',
              'contact name',
              'given name'
            ]);

            // Se for Google Contacts com Given Name + Family Name separados
            if (!nome) {
              const given = this.obterValor(linhaRaw, ['given name', 'first name']);
              const family = this.obterValor(linhaRaw, ['family name', 'last name', 'sobrenome']);
              if (given || family) {
                nome = [given, family].filter(Boolean).join(' ');
              }
            }

            // Extrair telefones
            const telefoneRaw = this.obterValor(linhaRaw, [
              'whatsapp / celular *',
              'telefone / celular',
              'telefone',
              'celular',
              'fone',
              'tel',
              'phone 1 - value',
              'phone 1',
              'phone',
              'phone number',
              'formatted phone',
              'number',
              'mobile'
            ]);

            const whatsappRaw = this.obterValor(linhaRaw, [
              'whatsapp',
              'zap',
              'wpp',
              'phone 2 - value',
              'wa_id',
              'wa_number'
            ]);

            // Sanitizar telefone principal
            const telPrincipalRaw = whatsappRaw || telefoneRaw;
            const telSanitizado = sanitizarTelefoneBrasileiro(telPrincipalRaw, opcoes?.dddPadraoLoja);

            // Se o nome vier em branco mas temos telefone válido, preencher amigavelmente
            if ((!nome || !nome.trim()) && telSanitizado.valido) {
              nome = `Cliente ${telSanitizado.formatado || 'WhatsApp'}`;
            }

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
                mensagemErro: 'Nome ou telefone do cliente é obrigatório.'
              });
              return;
            }

            const email = this.obterValor(linhaRaw, ['e-mail', 'email', 'correio eletronico', 'e-mail 1 - value', 'mail']);
            const numeroDoc = this.obterValor(linhaRaw, ['cpf / cnpj', 'cpf', 'cnpj', 'n° doc.', 'documento', 'numero documento']);
            const tabelaPrecoRaw = this.obterValor(linhaRaw, ['tabela de preço (varejo/atacado/autoatacado)', 'tabela de preco', 'tabela de preço', 'tabela']);
            const permiteFiadoRaw = this.obterValor(linhaRaw, ['permite fiado (sim/nao)', 'permite fiado', 'fiado']);
            const limiteCreditoRaw = this.obterValor(linhaRaw, ['limite de crédito fiado (r$)', 'limite de credito', 'limite']);
            const saldoDevedorRaw = this.obterValor(linhaRaw, ['saldo devedor inicial (r$)', 'saldo devedor', 'debito']);
            const cep = this.obterValor(linhaRaw, ['cep', 'postal code', 'address 1 - postal code']);
            
            // Endereço flexível
            let logradouro = this.obterValor(linhaRaw, ['logradouro / rua', 'logradouro', 'rua']);
            const enderecoGeral = this.obterValor(linhaRaw, ['endereço (rua, número, bairro)', 'endereço', 'endereco', 'address 1 - formatted', 'address']);
            if (!logradouro && enderecoGeral) {
              logradouro = enderecoGeral;
            }

            const numero = this.obterValor(linhaRaw, ['número', 'numero', 'n°', 'num']);
            const complemento = this.obterValor(linhaRaw, ['complemento', 'compl']);
            const bairro = this.obterValor(linhaRaw, ['bairro']);
            const cidade = this.obterValor(linhaRaw, ['cidade', 'municipio', 'city', 'address 1 - city']);
            const estado = this.obterValor(linhaRaw, ['estado (uf)', 'estado', 'uf', 'region', 'address 1 - region']);
            const aniversarioRaw = this.obterValor(linhaRaw, ['data de aniversário (aaaa-mm-dd ou dd/mm/aaaa)', 'data de aniversario', 'aniversario', 'data nascimento', 'birthday']);
            const observacoes = this.obterValor(linhaRaw, ['observações', 'observacoes', 'obs', 'notes', 'label', 'etiqueta', 'grupo', 'group']);
            const statusRaw = this.obterValor(linhaRaw, ['status (ativo/inativo)', 'status', 'ativo']);

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

            // Cruzar para verificar se já existe no banco
            const docLimpo = limparDigitos(numeroDoc);
            const nomeNormalizado = nome.trim().toLowerCase();

            let clienteExistente: Cliente | undefined = undefined;
            if (docLimpo && porDocumento.has(docLimpo)) {
              clienteExistente = porDocumento.get(docLimpo);
            } else if (telSanitizado.chaveCanonico && porTelefone.has(telSanitizado.chaveCanonico)) {
              clienteExistente = porTelefone.get(telSanitizado.chaveCanonico);
            } else if (telSanitizado.numerosApenas && porTelefone.has(telSanitizado.numerosApenas)) {
              clienteExistente = porTelefone.get(telSanitizado.numerosApenas);
            } else if (porNome.has(nomeNormalizado)) {
              clienteExistente = porNome.get(nomeNormalizado);
            }

            // Verificar se é duplicado dentro do próprio arquivo enviado
            const chaveUnicaArquivo = telSanitizado.chaveCanonico || docLimpo || (nomeNormalizado.length > 5 ? nomeNormalizado : '');
            let duplicadoNoArquivo = false;
            if (chaveUnicaArquivo) {
              if (chavesVistasNoArquivo.has(chaveUnicaArquivo)) {
                duplicadoNoArquivo = true;
              } else {
                chavesVistasNoArquivo.add(chaveUnicaArquivo);
              }
            }

            const modoDuplicados = opcoes?.modoDuplicados || 'ignorar';
            let statusAcao: 'NOVO' | 'ATUALIZAR' | 'IGNORADO' | 'ERRO' = 'NOVO';

            if (duplicadoNoArquivo) {
              if (modoDuplicados === 'ignorar') {
                statusAcao = 'IGNORADO';
                ignoradosDuplicados++;
              } else {
                statusAcao = 'ATUALIZAR';
                atualizacoes++;
              }
            } else if (clienteExistente) {
              if (modoDuplicados === 'ignorar') {
                statusAcao = 'IGNORADO';
                ignoradosDuplicados++;
              } else {
                statusAcao = 'ATUALIZAR';
                atualizacoes++;
              }
            } else {
              statusAcao = 'NOVO';
              novosCadastros++;
            }

            // Telefone final formatado ou original
            const telefoneFinal = telSanitizado.formatado || telPrincipalRaw;

            // Caderneta em lote
            const ativarCaderneta = Boolean(opcoes?.ativarCaderneta);
            const limiteCaderneta = ativarCaderneta ? Number(opcoes?.limiteCadernetaPadrao || 0) : 0;
            const diaVencimentoCaderneta = ativarCaderneta ? Number(opcoes?.diaVencimentoCadernetaPadrao || 10) : 10;

            clientesValidos.push({
              linha: numLinha,
              nome: nome.trim(),
              telefone: telefoneFinal || undefined,
              whatsapp: telefoneFinal || undefined,
              telefoneOriginal: telPrincipalRaw || undefined,
              telefoneAjustadoComDddLoja: telSanitizado.ajustouDddLoja,
              telefoneAjustadoNonoDigito: telSanitizado.ajustouNonoDigito,
              email: email?.trim() || undefined,
              numero_documento: numeroDoc?.trim() || undefined,
              tabela_preco_padrao: tabelaPreco,
              permite_fiado: permiteFiado,
              limite_credito: limiteCredito,
              saldo_devedor_fiado: saldoDevedor,
              permite_caderneta: ativarCaderneta,
              limite_caderneta: limiteCaderneta,
              dia_vencimento_caderneta: diaVencimentoCaderneta,
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
            atualizacoes,
            ignoradosDuplicados
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
    onProgresso?: (porcentagem: number, texto: string) => void,
    opcoes?: OpcoesImportacaoCliente
  ): Promise<RelatorioResultadoClienteImportacao> {
    let totalCadastrados = 0;
    let totalAtualizados = 0;
    let totalIgnorados = 0;
    const erros: string[] = [];

    // Filtrar ignorados
    const clientesParaProcessar = clientes.filter(c => {
      if (c.statusAcao === 'IGNORADO') {
        totalIgnorados++;
        return false;
      }
      if (c.statusAcao === 'ERRO') {
        return false;
      }
      return true;
    });

    const total = clientesParaProcessar.length;
    if (total === 0) {
      if (onProgresso) onProgresso(100, 'Nenhum cliente novo a processar.');
      return {
        sucesso: true,
        totalCadastrados: 0,
        totalAtualizados: 0,
        totalIgnorados,
        erros: []
      };
    }

    // Separar em Novos (para inserção em lote) e Atualizações (individuais)
    const novosParaInserir: LinhaClienteImportacao[] = [];
    const existentesParaAtualizar: LinhaClienteImportacao[] = [];

    clientesParaProcessar.forEach(c => {
      if (c.statusAcao === 'NOVO' && !c.clienteExistenteId) {
        novosParaInserir.push(c);
      } else {
        existentesParaAtualizar.push(c);
      }
    });

    // 1. Inserir Novos em Lotes (Chunks de 50) para Alta Performance
    const TAMANHO_LOTE = 50;
    for (let i = 0; i < novosParaInserir.length; i += TAMANHO_LOTE) {
      const lote = novosParaInserir.slice(i, i + TAMANHO_LOTE);
      const progresso = Math.round(((i + lote.length) / total) * 100);
      if (onProgresso) {
        onProgresso(progresso, `Cadastrando novos clientes (${Math.min(i + lote.length, novosParaInserir.length)}/${novosParaInserir.length})...`);
      }

      const payloadsLote = lote.map(c => {
        const partesEndereco: string[] = [];
        if (c.endereco_logradouro) partesEndereco.push(c.endereco_logradouro);
        if (c.endereco_numero) partesEndereco.push(c.endereco_numero);
        if (c.endereco_complemento) partesEndereco.push(`(${c.endereco_complemento})`);
        if (c.endereco_bairro) partesEndereco.push(c.endereco_bairro);
        if (c.endereco_cidade) partesEndereco.push(c.endereco_cidade);
        if (c.endereco_estado) partesEndereco.push(c.endereco_estado);
        if (c.endereco_cep) partesEndereco.push(`CEP: ${c.endereco_cep}`);
        const enderecoFormatado = partesEndereco.length > 0 ? partesEndereco.join(', ') : null;

        const payload: any = {
          loja_id: lojaId,
          nome: c.nome,
          telefone: c.telefone || null,
          whatsapp: c.whatsapp || c.telefone || null,
          email: c.email || null,
          numero_documento: c.numero_documento || null,
          tabela_preco_padrao: c.tabela_preco_padrao,
          permite_fiado: c.permite_fiado,
          limite_credito: c.permite_fiado ? c.limite_credito : 0,
          saldo_devedor_fiado: c.saldo_devedor_fiado || 0,
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

        if (c.permite_caderneta !== undefined) {
          payload.permite_caderneta = c.permite_caderneta;
          payload.limite_caderneta = c.limite_caderneta || 0;
          payload.dia_vencimento_caderneta = c.dia_vencimento_caderneta || 10;
        }

        return payload;
      });

      // Tenta gravar o lote completo
      let { error: erroLote } = await supabase
        .from('clientes')
        .insert(payloadsLote);

      if (erroLote && erroLote.message && erroLote.message.includes('ativo')) {
        payloadsLote.forEach(p => { delete p.ativo; });
        const retry = await supabase.from('clientes').insert(payloadsLote);
        erroLote = retry.error;
      }

      if (!erroLote) {
        totalCadastrados += lote.length;
      } else {
        // Fallback: se o lote falhar como um todo, tenta linha por linha
        for (let j = 0; j < lote.length; j++) {
          const item = lote[j];
          const payload = payloadsLote[j];
          try {
            const { error: erroIndividual } = await supabase
              .from('clientes')
              .insert([payload]);

            if (erroIndividual) {
              // Fallback com payload reduzido
              const payloadReduzido = {
                loja_id: lojaId,
                nome: item.nome,
                telefone: item.telefone || null,
                whatsapp: item.whatsapp || null,
                email: item.email || null,
                numero_documento: item.numero_documento || null,
                tabela_preco_padrao: item.tabela_preco_padrao,
                permite_fiado: item.permite_fiado,
                limite_credito: item.permite_fiado ? item.limite_credito : 0,
                saldo_devedor_fiado: item.saldo_devedor_fiado || 0,
                permite_caderneta: item.permite_caderneta || false,
                limite_caderneta: item.limite_caderneta || 0,
                dia_vencimento_caderneta: item.dia_vencimento_caderneta || 10,
                endereco_principal: payload.endereco_principal,
                observacoes: item.observacoes || null
              };
              const { error: errReduzido } = await supabase
                .from('clientes')
                .insert([payloadReduzido]);

              if (errReduzido) throw errReduzido;
            }
            totalCadastrados++;
          } catch (err: any) {
            erros.push(`Linha ${item.linha} (${item.nome}): ${err.message || 'Erro ao gravar cliente'}`);
          }
        }
      }
    }

    // 2. Atualizar Clientes Existentes Individualmente
    for (let k = 0; k < existentesParaAtualizar.length; k++) {
      const c = existentesParaAtualizar[k];
      const progresso = Math.round(((novosParaInserir.length + k + 1) / total) * 100);
      if (onProgresso) {
        onProgresso(progresso, `Atualizando clientes existentes (${k + 1}/${existentesParaAtualizar.length}): ${c.nome}`);
      }

      const partesEndereco: string[] = [];
      if (c.endereco_logradouro) partesEndereco.push(c.endereco_logradouro);
      if (c.endereco_numero) partesEndereco.push(c.endereco_numero);
      if (c.endereco_complemento) partesEndereco.push(`(${c.endereco_complemento})`);
      if (c.endereco_bairro) partesEndereco.push(c.endereco_bairro);
      if (c.endereco_cidade) partesEndereco.push(c.endereco_cidade);
      if (c.endereco_estado) partesEndereco.push(c.endereco_estado);
      if (c.endereco_cep) partesEndereco.push(`CEP: ${c.endereco_cep}`);
      const enderecoFormatado = partesEndereco.length > 0 ? partesEndereco.join(', ') : null;

      const payloadUpdate: any = {
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
        observacoes: c.observacoes || null
      };

      if (c.permite_caderneta !== undefined && opcoes?.ativarCaderneta) {
        payloadUpdate.permite_caderneta = c.permite_caderneta;
        payloadUpdate.limite_caderneta = c.limite_caderneta || 0;
        payloadUpdate.dia_vencimento_caderneta = c.dia_vencimento_caderneta || 10;
      }

      try {
        let { error: erroUpdate } = await supabase
          .from('clientes')
          .update(payloadUpdate)
          .eq('id', c.clienteExistenteId)
          .eq('loja_id', lojaId);

        if (erroUpdate) {
          const payloadReduzido = {
            nome: c.nome,
            telefone: c.telefone || null,
            whatsapp: c.whatsapp || null,
            email: c.email || null,
            numero_documento: c.numero_documento || null,
            endereco_principal: enderecoFormatado,
            observacoes: c.observacoes || null
          };
          const { error: erroFallback } = await supabase
            .from('clientes')
            .update(payloadReduzido)
            .eq('id', c.clienteExistenteId)
            .eq('loja_id', lojaId);

          if (erroFallback) throw erroFallback;
        }
        totalAtualizados++;
      } catch (err: any) {
        erros.push(`Linha ${c.linha} (${c.nome}): ${err.message || 'Erro ao atualizar dados'}`);
      }
    }

    return {
      sucesso: erros.length === 0,
      totalCadastrados,
      totalAtualizados,
      totalIgnorados,
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
