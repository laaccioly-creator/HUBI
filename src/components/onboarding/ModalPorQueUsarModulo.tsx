import React, { useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Check,
  ArrowRight,
  HelpCircle,
  Sliders,
  Ruler,
  FolderTree,
  Sparkles,
  Lightbulb,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { EtapaOnboardingId } from '../../services/onboardingSetupService';

export interface ConteudoPorQueUsarItem {
  id: EtapaOnboardingId;
  grupo: 'essencial' | 'opcional';
  titulo: string;
  subtitulo: string;
  resumoPratico: string;
  problemasResolvidos: string[];
  ganhosReais: string[];
  exemploPratico: string;
}

export interface AcaoModalPorQueUsar {
  id: string;
  rotulo: string;
  variante: 'primaria_neutra' | 'secundaria_neutra';
  icone?: 'arrow' | 'help' | 'check' | 'sliders' | 'ruler' | 'folder' | 'sparkles';
  disabled?: boolean;
  ativo?: boolean;
  onClick: () => void;
}

export interface ModalPorQueUsarModuloProps {
  etapaId: EtapaOnboardingId | null;
  icone: React.ComponentType<{ className?: string }> | null;
  configurado?: boolean;
  acoes: AcaoModalPorQueUsar[];
  onClose: () => void;
}

export const CONTEUDO_POR_QUE_USAR_ETAPAS: Record<EtapaOnboardingId, ConteudoPorQueUsarItem> = {
  ia_gemini: {
    id: 'ia_gemini',
    grupo: 'essencial',
    titulo: 'Inteligência Artificial Base (Google Gemini)',
    subtitulo: 'Motor oficial da Rubi IA para automatizar cadastros, descrições e análises da loja',
    resumoPratico:
      'Ao conectar sua chave gratuita do Google Gemini, a Rubi IA passa a trabalhar junto com você no dia a dia: escreve descrições vendedoras para o catálogo, sugere categorias, identifica itens parados em estoque e atende dúvidas de clientes com base nos seus dados reais.',
    problemasResolvidos: [
      'Cadastros demorados com descrições curtas ou pouco atrativas no catálogo.',
      'Falta de tempo para analisar quais produtos estão encalhados ou dando margem baixa.',
      'Atendimento repetitivo sobre variações, medidas e informações dos itens.',
    ],
    ganhosReais: [
      'Cadastro completo em segundos por foto, texto ou código de barras.',
      'Acesso à assistente executiva Rubi IA conectada aos indicadores da loja.',
      'Cota gratuita oficial do Google, sem necessidade de cartão de crédito.',
    ],
    exemploPratico:
      'Você tira a foto ou digita o nome de um produto recém-chegado e a Rubi IA gera título limpo, descrição comercial persuasiva e ficha técnica pronta para publicar no Catálogo Online.',
  },
  busca_fotos_serper: {
    id: 'busca_fotos_serper',
    grupo: 'essencial',
    titulo: 'Busca Automática de Fotos (Serper.dev)',
    subtitulo: 'Imagens profissionais em 1 clique e pesquisa de preços da concorrência',
    resumoPratico:
      'Lojas com fotos nítidas vendem muito mais no Catálogo Online e no PDV. Com a chave gratuita do Serper.dev (2.500 consultas), o HUBI busca imagens direto pelo código de barras ou nome do produto e habilita o Radar de Preços.',
    problemasResolvidos: [
      'Produtos sem foto que derrubam a conversão e passam pouca confiança na vitrine.',
      'Perda de tempo baixando imagens manualmente no navegador e salvando pastas.',
      'Precificação no escuro sem referência rápida de mercado no Radar de Preços.',
    ],
    ganhosReais: [
      'Importação instantânea de fotos nítidas direto dentro do cadastro de produtos.',
      'Vitrine online padronizada e visualmente profissional em poucos minutos.',
      'Radar de Preços ativo para comparar valores de venda com o mercado.',
    ],
    exemploPratico:
      'Ao bipar o código de barras de 30 bebidas ou cosméticos novos, você escolhe a melhor foto em segundos sem precisar fotografar item por item.',
  },
  dados_loja_cep: {
    id: 'dados_loja_cep',
    grupo: 'essencial',
    titulo: 'Dados da Loja e Endereço/CEP de Origem',
    subtitulo: 'Base obrigatória para fretes, entregas locais, retirada e envio de pedidos',
    resumoPratico:
      'O CEP de origem e o WhatsApp comercial são o ponto de partida para todo cálculo logístico e comunicação com o cliente. Sem esses campos, cotações de frete nacional, entregas expressas, raio de frota própria e envio de resumo no WhatsApp ficam bloqueados.',
    problemasResolvidos: [
      'Erros ou falhas ao calcular frete no Melhor Envio, Uber Direct ou entrega por raio.',
      'Pedidos do catálogo sem endereço claro para retirada no balcão.',
      'Recibos térmicos e digitais sem telefone, endereço ou identificação profissional da loja.',
    ],
    ganhosReais: [
      'Cálculo automático de frete por distância e CEP real de saída.',
      'Recebimento imediato dos pedidos no WhatsApp oficial da loja.',
      'Recibos e comprovantes completos que fortalecem a credibilidade da marca.',
    ],
    exemploPratico:
      'Quando um cliente informa o CEP dele no Catálogo Online, o sistema usa o seu CEP de origem para calcular automaticamente o valor exato da entrega ou mostrar o endereço de retirada.',
  },
  tipos_venda: {
    id: 'tipos_venda',
    grupo: 'essencial',
    titulo: 'Tabelas de Preço e Tipos de Venda',
    subtitulo: 'Regras automáticas para Varejo, Atacado e Autoatacado / Distribuidor',
    resumoPratico:
      'Defina exatamente quais modalidades comerciais sua loja opera. O motor de preços do HUBI aplica automaticamente os descontos progressivos ou valores de fardo fechado quando o carrinho atinge a quantidade ou valor mínimo configurado.',
    problemasResolvidos: [
      'Operador calculando desconto de atacado na calculadora e errando a margem.',
      'Exibir tabelas que a loja não usa, poluindo a tela do PDV e do catálogo.',
      'Clientes de atacado pedindo cotação no WhatsApp por falta de regra automática na vitrine.',
    ],
    ganhosReais: [
      'Troca instantânea entre preços de Varejo, Atacado e Distribuidor sem retrabalho.',
      'Aumento do ticket médio incentivando o cliente a levar a quantidade mínima do lote.',
      'Proteção de margem aplicando exatamente a política comercial aprovada.',
    ],
    exemploPratico:
      'Um cliente adiciona 1 unidade pelo preço de varejo; ao aumentar para 6 unidades no carrinho, o sistema aplica automaticamente o preço de atacado configurado.',
  },
  formas_pagamento: {
    id: 'formas_pagamento',
    grupo: 'essencial',
    titulo: 'Formas de Pagamento e Taxas de Maquininha',
    subtitulo: 'Recebimento organizado no PDV e apuração fiel do Lucro Líquido Real',
    resumoPratico:
      'Cadastrar seus meios de pagamento (Pix, Dinheiro, Débito, Crédito e taxas de operadora) garante que cada venda dê baixa correta no caixa e que os indicadores financeiros descontem as taxas reais antes de mostrar o lucro.',
    problemasResolvidos: [
      'Falsa impressão de lucro alto por ignorar taxas de cartão e prazos de recebimento.',
      'Fechamento de caixa confuso sem separação por forma de pagamento.',
      'Falta de opções claras para o cliente escolher na hora de fechar o pedido online.',
    ],
    ganhosReais: [
      'Quebra de caixa por modalidade (Pix, Dinheiro, Cartão) conferida no fechamento.',
      'Cockpit financeiro exibindo o Lucro Líquido Real já descontando operadoras.',
      'Suporte nativo a pagamento dividido (split payment) no balcão.',
    ],
    exemploPratico:
      'Ao vender R$ 200,00 no cartão de crédito com taxa de 3,5%, o Cockpit já registra o custo financeiro de R$ 7,00 automaticamente no resultado líquido.',
  },
  status_pedidos: {
    id: 'status_pedidos',
    grupo: 'essencial',
    titulo: 'Fluxo de Status dos Pedidos (Kanban)',
    subtitulo: 'Adapte o acompanhamento dos pedidos ao tamanho real da sua equipe',
    resumoPratico:
      'Os 4 status padrão do sistema (Pendente, Confirmado, Cancelado e Concluído) já atendem perfeitamente operações ágeis de balcão e atendimento direto. As etapas opcionais permitem detalhar separação, expedição, envio e retirada quando há equipe dedicada.',
    problemasResolvidos: [
      'Kanban cheio de colunas desnecessárias quando o atendimento é enxuto.',
      'Ou, em equipes maiores, falta de visibilidade sobre o que já foi separado ou embalado.',
      'Confusão entre pedidos para entrega e pedidos prontos aguardando retirada.',
    ],
    ganhosReais: [
      'Operação simples e sem cliques extras usando apenas os 4 status padrão.',
      'Escalabilidade imediata ligando etapas extras conforme a equipe cresce.',
      'Visão limpa do andamento de cada pedido em tempo real.',
    ],
    exemploPratico:
      'Uma loja enxuta mantém apenas os 4 status padrão para concluir pedidos rapidamente; já uma distribuidora liga "Em separação" e "Em expedição" para coordenar o estoque e o despacho.',
  },
  categorias_unidades: {
    id: 'categorias_unidades',
    grupo: 'essencial',
    titulo: 'Categorias e Unidades de Medida',
    subtitulo: 'Organização do catálogo e precisão no controle de estoque (UN, KG, CX, LT)',
    resumoPratico:
      'Categorias bem definidas facilitam a navegação do cliente no Catálogo Online e agilizam os filtros do operador no PDV. Conferir as unidades de medida assegura que vendas unitárias, por caixa ou fracionadas baixem o estoque corretamente.',
    problemasResolvidos: [
      'Clientes desistindo do catálogo por não encontrarem produtos separados por departamento.',
      'Divergências de estoque ao vender por caixa, pacote, metro ou quilo.',
      'Relatórios de vendas por categoria vazios ou misturados em "Geral".',
    ],
    ganhosReais: [
      'Busca rápida no PDV e vitrine organizada por departamentos e subcategorias.',
      'Baixa exata de estoque para produtos unitários, em lote ou fracionados.',
      'Relatórios gerenciais mostrando quais categorias geram mais faturamento.',
    ],
    exemploPratico:
      'Separar "Bebidas -> Refrigerantes" e usar unidade CX/UN permite que o cliente filtre rapidamente no celular e o estoque dê baixa correta por embalagem.',
  },
  metas_loja: {
    id: 'metas_loja',
    grupo: 'essencial',
    titulo: 'Metas da Loja (Cockpit Executivo F1)',
    subtitulo: 'Acompanhamento diário do ritmo de faturamento, pedidos e lucro',
    resumoPratico:
      'As metas transformam os números do mês em um painel visual claro: o Dashboard compara o faturamento realizado até hoje com a meta proporcional do dia, sinalizando rapidamente se a loja está no ritmo esperado ou precisa de ação comercial.',
    problemasResolvidos: [
      'Chegar ao fim do mês sem perceber que o faturamento ficou abaixo do planejado.',
      'Velocímetros do Cockpit zerados ou sem referência clara de desempenho.',
      'Falta de direcionamento para campanhas promocionais e metas da equipe.',
    ],
    ganhosReais: [
      'Painel executivo vivo mostrando percentual atingido em tempo real.',
      'Previsibilidade financeira para compras de reposição e despesas fixas.',
      'Visão rápida de ticket médio, margem e ritmo diário necessário.',
    ],
    exemploPratico:
      'Com meta mensal de R$ 30.000, no dia 15 o Cockpit mostra exatamente se os R$ 15.000 esperados até a metade do mês já foram alcançados.',
  },
  catalogo_online: {
    id: 'catalogo_online',
    grupo: 'opcional',
    titulo: 'Vitrine Virtual (Catálogo Online PWA)',
    subtitulo: 'Receba pedidos 24h por dia com link próprio, carrinho e cálculo de entrega',
    resumoPratico:
      'Ative sua vitrine virtual para compartilhar o link na bio do Instagram, status e WhatsApp. O cliente navega pelas fotos, vê preços atualizados em tempo real, escolhe entrega ou retirada e envia o pedido estruturado direto para o painel.',
    problemasResolvidos: [
      'Perder vendas à noite ou nos fins de semana por demora em responder o chat.',
      'Enviar dezenas de fotos avulsas e ficar digitando preços manualmente no WhatsApp.',
      'Pedidos confusos sem endereço, variação correta ou forma de pagamento definida.',
    ],
    ganhosReais: [
      'Canal de vendas automático 24/7 sem taxa de comissão por pedido.',
      'Integração direta com seu estoque físico, evitando vender item esgotado.',
      'Experiência fluida como aplicativo no celular do cliente (PWA).',
    ],
    exemploPratico:
      'Você envia o link do catálogo como resposta automática no WhatsApp; o cliente monta o carrinho sozinho e o pedido já cai pronto no painel para separar.',
  },
  gateway_pagamento: {
    id: 'gateway_pagamento',
    grupo: 'opcional',
    titulo: 'Gateway de Pagamentos Online (Mercado Pago, Asaas e outros)',
    subtitulo: 'Pix dinâmico com confirmação automática e cartão direto no catálogo',
    resumoPratico:
      'Ao integrar um gateway online, o cliente gera o QR Code Pix ou paga com cartão dentro do próprio Catálogo Online. Assim que o banco confirma o pagamento, o pedido é marcado como pago automaticamente no HUBI.',
    problemasResolvidos: [
      'Risco de comprovante falso ou tempo gasto conferindo extrato bancário a cada Pix.',
      'Clientes desistindo da compra por precisar esperar você mandar a chave e confirmar.',
      'Impossibilidade de parcelar no cartão à distância sem maquininha presencial.',
    ],
    ganhosReais: [
      'Baixa automática instantânea via webhook ao receber o Pix.',
      'Mais segurança contra fraudes e redução de carrinhos abandonados.',
      'Aceitação de cartão online sem enviar link manual em outro aplicativo.',
    ],
    exemploPratico:
      'O cliente fecha uma compra às 22h pelo catálogo, paga o Pix dinâmico na hora e o pedido já aparece como Pago e pronto para despacho na manhã seguinte.',
  },
  melhor_envio: {
    id: 'melhor_envio',
    grupo: 'opcional',
    titulo: 'Cotação Automática Nacional (Melhor Envio)',
    subtitulo: 'Frete Correios e transportadoras calculado no carrinho com etiqueta em 1 clique',
    resumoPratico:
      'Conecte sua conta do Melhor Envio para que o próprio cliente veja prazos e valores de PAC, SEDEX e Jadlog no fechamento do pedido. Depois, você gera a etiqueta e acompanha o rastreio sem sair do painel do HUBI.',
    problemasResolvidos: [
      'Demorar horas respondendo "quanto fica o frete para o CEP tal?" e perder a venda.',
      'Pagar frete de balcão mais caro nos Correios por falta de tabela negociada.',
      'Digitar manualmente nome, CPF e endereço do cliente para gerar cada etiqueta.',
    ],
    ganhosReais: [
      'Frete calculado na hora no checkout, aumentando a conversão para outras cidades.',
      'Tarifas reduzidas de envio nacional em relação ao balcão tradicional.',
      'Emissão ágil de etiquetas e atualização automática de código de rastreio.',
    ],
    exemploPratico:
      'Um comprador de outro estado informa o CEP no catálogo, escolhe Jadlog por R$ 19,80, paga o pedido inteiro e você gera a etiqueta em segundos no painel de pedidos.',
  },
  uber_direct: {
    id: 'uber_direct',
    grupo: 'opcional',
    titulo: 'Entregas Expressas Locais (Uber Direct)',
    subtitulo: 'Chame entregadores sob demanda direto do pedido com rastreio ao vivo',
    resumoPratico:
      'Com o Uber Direct, você oferece entrega expressa na mesma hora na sua cidade sem precisar manter motoboy fixo ocioso. O sistema calcula a corrida na hora e dispara o entregador direto do HUBI quando o pedido estiver embalado.',
    problemasResolvidos: [
      'Custo fixo alto com entregador próprio em horários de pouco movimento.',
      'Ficar abrindo vários aplicativos no celular e copiando endereço cliente por cliente.',
      'Cliente perguntando no chat "onde está meu entregador?" sem link de mapa.',
    ],
    ganhosReais: [
      'Entrega local rápida pagando somente pelas corridas realizadas.',
      'Solicitação e despacho integrados diretamente na tela do pedido.',
      'Link de acompanhamento ao vivo que transmite confiança ao comprador.',
    ],
    exemploPratico:
      'No pico da tarde, dois pedidos locais são confirmados: com um clique no pedido, o entregador parceiro retira na sua loja e leva direto ao cliente.',
  },
  apps_corrida: {
    id: 'apps_corrida',
    grupo: 'opcional',
    titulo: 'Apps de Corrida Externos (99, Lalamove, etc.)',
    subtitulo: 'Organize entregas chamadas por fora registrando código e link no pedido',
    resumoPratico:
      'Se você já utiliza 99 Entrega, Lalamove, Indrive ou mototáxi por aplicativo externo, esse módulo permite registrar o app utilizado, o código de retirada e o link de rastreio dentro do pedido do HUBI.',
    problemasResolvidos: [
      'Perder o histórico de qual app ou motorista levou cada encomenda.',
      'Ficar procurando link de corrida no celular quando o cliente pede posição.',
      'Mistura de custos e falta de controle nos despachos locais manuais.',
    ],
    ganhosReais: [
      'Histórico centralizado de cada despacho local vinculado ao número do pedido.',
      'Envio padronizado do link de acompanhamento para o cliente final.',
      'Flexibilidade para usar qualquer aplicativo disponível na sua região.',
    ],
    exemploPratico:
      'Você chama uma corrida na 99 Entrega pelo celular, cola o link de acompanhamento no despacho do pedido e todo o time sabe quem retirou o pacote.',
  },
  transportadoras_manuais: {
    id: 'transportadoras_manuais',
    grupo: 'opcional',
    titulo: 'Transportadoras Manuais / Frota Própria',
    subtitulo: 'Motoboy próprio, taxa fixa/bairro/raio e transportadoras regionais ou ônibus',
    resumoPratico:
      'Ideal para quem entrega com veículo próprio ou despacha via transportadoras regionais (Braspress, rodoviário, encomenda em ônibus). Configure suas próprias regras de taxa local e cadastre transportadoras com contato e URL de rastreio.',
    problemasResolvidos: [
      'Regras locais de entrega por bairro ou quilometragem que apps não cobrem.',
      'Despachos em transportadoras de carga sem registro organizado de contato e código.',
      'Falta de transparência do prazo estimado e frete no Catálogo Online.',
    ],
    ganhosReais: [
      'Controle total das taxas de entrega própria por raio, bairro ou valor fixo.',
      'Cadastro reutilizável de transportadoras regionais no momento do despacho.',
      'Possibilidade de liberar frete grátis acima de um valor mínimo de compra.',
    ],
    exemploPratico:
      'Você define taxa fixa de R$ 8,00 até 5 km com entrega grátis acima de R$ 150,00, e ainda mantém a transportadora regional cadastrada para clientes do interior.',
  },
  whatsapp_auto: {
    id: 'whatsapp_auto',
    grupo: 'opcional',
    titulo: 'Notificações Automáticas no WhatsApp (Meta Cloud API)',
    subtitulo: 'Avisos automáticos de status de pedido, rastreio e lembretes de agenda',
    resumoPratico:
      'Conecte a API oficial do WhatsApp (ou utilize a carteira pré-paga HUBI) para enviar notificações automáticas sempre que um pedido for confirmado, pesado, separado, despachado ou quando houver um agendamento próximo.',
    problemasResolvidos: [
      'Atendentes sobrecarregados respondendo "meu pedido já saiu?" o dia inteiro.',
      'Faltas em serviços agendados por esquecimento do cliente.',
      'Risco de bloqueio usando automações não-oficiais no celular pessoal.',
    ],
    ganhosReais: [
      'Comunicação proativa que reduz drasticamente mensagens de suporte.',
      'Redução de faltas (no-show) com lembretes automáticos antes do horário.',
      'Envio profissional de recibos, códigos de rastreio e comprovantes de caderneta.',
    ],
    exemploPratico:
      'Assim que você marca o pedido como "Pronto para retirar" ou informa o código de rastreio, o cliente recebe o aviso automático no WhatsApp na mesma hora.',
  },
  mercado_livre: {
    id: 'mercado_livre',
    grupo: 'opcional',
    titulo: 'Integração com Mercado Livre',
    subtitulo: 'Estoque unificado entre loja física, catálogo e anúncios do marketplace',
    resumoPratico:
      'Vincule sua conta do Mercado Livre para sincronizar automaticamente o saldo de estoque dos produtos e importar pedidos e etiquetas de envio para dentro do mesmo fluxo operacional do HUBI.',
    problemasResolvidos: [
      'Vender a última unidade no balcão e esquecer de pausar o anúncio no Mercado Livre.',
      'Alternar entre duas plataformas o dia todo para conferir pedidos e imprimir etiquetas.',
      'Estoque desatualizado gerando cancelamentos e queda de reputação no marketplace.',
    ],
    ganhosReais: [
      'Baixa e atualização de estoque sincronizadas em tempo real.',
      'Centralização dos pedidos e impressão de etiquetas em um único painel.',
      'Mais segurança para escalar vendas online sem perder o controle do físico.',
    ],
    exemploPratico:
      'Quando o último par de um produto é vendido no PDV da loja, o HUBI atualiza o anúncio vinculado no Mercado Livre automaticamente para evitar venda sem estoque.',
  },
  agendamento_servicos: {
    id: 'agendamento_servicos',
    grupo: 'opcional',
    titulo: 'Agendamento de Serviços com Hora Marcada',
    subtitulo: 'Agenda online por profissional sem conflito de horários e confirmação por link',
    resumoPratico:
      'Para salões, barbearias, clínicas, estética, oficinas ou consultorias: cadastre serviços com duração, vincule profissionais e horários de expediente, permitindo que o cliente agende sozinho online e confirme ou remarque pelo link.',
    problemasResolvidos: [
      'Caderno de papel ou mensagens soltas causando horários duplicados e buracos na agenda.',
      'Idas e vindas longas no WhatsApp só para descobrir qual horário está livre.',
      'Esquecimento de atendimentos e dificuldade para fechar comissões/recebimentos no PDV.',
    ],
    ganhosReais: [
      'Autoatendimento 24h respeitando intervalos, expediente e duração de cada serviço.',
      'Puxa o agendamento direto para o PDV na hora de receber e lançar itens extras.',
      'Link público para confirmação e remarcação rápida sem ocupar a recepção.',
    ],
    exemploPratico:
      'O cliente acessa o catálogo às 23h, escolhe o serviço e o profissional para quinta às 14h, e na hora do atendimento você conclui o pagamento no PDV em 2 cliques.',
  },
  venda_por_peso: {
    id: 'venda_por_peso',
    grupo: 'opcional',
    titulo: 'Venda por Peso / Balança',
    subtitulo: 'Fluxo de pesagem prévia para produtos em KG, gramas e frações variáveis',
    resumoPratico:
      'Indispensável para açougues, hortifrútis, peixarias, queijarias e vendas a granel. No catálogo online, o cliente pede pelo peso estimado e o pagamento só é liberado depois que você pesa na balança real e confirma o peso exato no painel.',
    problemasResolvidos: [
      'Cobrar valor aproximado do cliente antes de pesar e ter diferença no valor final.',
      'Dificuldade de vender cortes de carne, frios ou frutas fracionadas online.',
      'Ajustes manuais fora do sistema que quebram o controle de caixa e estoque.',
    ],
    ganhosReais: [
      'Valor final recalculado com precisão milimétrica após a pesagem real.',
      'Fluxo seguro: cliente só paga ou finaliza depois da conferência de peso.',
      'Suporte nativo a gramas e frações (ex.: 0,350 kg) tanto no PDV quanto no catálogo.',
    ],
    exemploPratico:
      'O cliente pede 1 kg de alcatra no catálogo; na balança dá 1,085 kg — você informa 1,085 no painel de conferência e o valor exato é atualizado antes de cobrar.',
  },
  caderneta_fiado: {
    id: 'caderneta_fiado',
    grupo: 'opcional',
    titulo: 'Caderneta de Mercadinho / Fiado',
    subtitulo: 'Conta corrente mensal por cliente com limite de crédito e vencimento fixo',
    resumoPratico:
      'Substitua o caderninho de papel por uma caderneta digital segura. Controle quem pode comprar a prazo, defina limite de crédito e dia fixo de vencimento mensal, receba pagamentos parciais e envie o extrato transparente no WhatsApp.',
    problemasResolvidos: [
      'Anotações perdidas, rasuradas ou dúvidas do cliente sobre o que comprou no mês.',
      'Clientes ultrapassando o combinado por falta de alerta de limite na frente de caixa.',
      'Cobranças constrangedoras sem histórico organizado de compras e abatimentos.',
    ],
    ganhosReais: [
      'Bloqueio automático ao atingir o limite de crédito autorizado para o cliente.',
      'Quitação total ou parcial com atualização instantânea do saldo devedor.',
      'Extrato digital e comprovante compartilhável no WhatsApp com 1 clique.',
    ],
    exemploPratico:
      'Um cliente mensalista passa compras na semana pelo PDV ou catálogo; no dia 10, ele paga parte do saldo e recebe na hora o comprovante atualizado no WhatsApp.',
  },
};

export const ModalPorQueUsarModulo: React.FC<ModalPorQueUsarModuloProps> = ({
  etapaId,
  icone: Icone,
  configurado = false,
  acoes,
  onClose,
}) => {
  const { isDark } = useTheme();
  const aberto = Boolean(etapaId);

  useRegisterOverlay(aberto, onClose, 'modal-por-que-usar-modulo', 'modal');

  useEffect(() => {
    if (!aberto) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [aberto, onClose]);

  if (!etapaId) return null;

  const conteudo = CONTEUDO_POR_QUE_USAR_ETAPAS[etapaId];
  if (!conteudo) return null;

  const renderIconeAcao = (icone?: AcaoModalPorQueUsar['icone']) => {
    switch (icone) {
      case 'arrow':
        return <ArrowRight className="w-3.5 h-3.5 shrink-0" />;
      case 'help':
        return <HelpCircle className="w-3.5 h-3.5 shrink-0" />;
      case 'check':
        return <Check className="w-3.5 h-3.5 shrink-0" />;
      case 'sliders':
        return <Sliders className="w-3.5 h-3.5 shrink-0" />;
      case 'ruler':
        return <Ruler className="w-3.5 h-3.5 shrink-0" />;
      case 'folder':
        return <FolderTree className="w-3.5 h-3.5 shrink-0" />;
      case 'sparkles':
        return <Sparkles className="w-3.5 h-3.5 shrink-0" />;
      default:
        return null;
    }
  };

  const classeBotaoPrimariaNeutra = isDark
    ? 'bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 shadow-xs'
    : 'bg-slate-200 hover:bg-slate-300 text-slate-900 border border-slate-300 shadow-xs';

  const classeBotaoSecundariaNeutra = isDark
    ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700'
    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-modal-por-que-usar"
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl shadow-2xl border overflow-hidden ${
          isDark
            ? 'bg-slate-950 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* CABEÇALHO */}
        <div
          className={`p-5 sm:p-6 border-b shrink-0 flex items-start justify-between gap-4 ${
            isDark ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-slate-50/90'
          }`}
        >
          <div className="flex items-start gap-3.5 min-w-0">
            <div
              className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${
                isDark
                  ? 'bg-slate-800 border-slate-700 text-slate-200'
                  : 'bg-slate-100 border-slate-200 text-slate-800'
              }`}
            >
              {Icone ? <Icone className="w-5 h-5" /> : <Lightbulb className="w-5 h-5" />}
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                    isDark
                      ? 'bg-slate-800 border-slate-700 text-slate-300'
                      : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  {conteudo.grupo === 'essencial' ? 'Configuração Essencial' : 'Módulo Opcional'}
                </span>

                {configurado && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>✓ Configurado</span>
                  </span>
                )}
              </div>

              <h3
                id="titulo-modal-por-que-usar"
                className="text-base sm:text-lg font-black tracking-tight leading-snug"
              >
                {conteudo.titulo}
              </h3>
              <p className={`text-xs sm:text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                {conteudo.subtitulo}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="Fechar (Esc)"
            className={`p-2 rounded-xl transition cursor-pointer shrink-0 ${
              isDark
                ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CORPO SCROLLÁVEL */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Resumo Prático */}
          <div
            className={`p-4 rounded-2xl border ${
              isDark
                ? 'bg-slate-900/70 border-slate-800'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Lightbulb className={`w-4 h-4 shrink-0 ${isDark ? 'text-slate-300' : 'text-slate-700'}`} />
              <h4 className="text-xs font-black uppercase tracking-wider">
                Por que ativar na sua loja?
              </h4>
            </div>
            <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              {conteudo.resumoPratico}
            </p>
          </div>

          {/* Grid Problemas x Ganhos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div
              className={`p-4 rounded-2xl border space-y-2.5 ${
                isDark
                  ? 'bg-slate-900/50 border-slate-800'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertCircle className={`w-4 h-4 shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-600'}`} />
                <h4 className="text-xs font-black uppercase tracking-wider">
                  Problemas que resolve
                </h4>
              </div>
              <ul className="space-y-2">
                {conteudo.problemasResolvidos.map((item, idx) => (
                  <li
                    key={idx}
                    className={`flex items-start gap-2 text-xs leading-relaxed ${
                      isDark ? 'text-slate-300' : 'text-slate-700'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                        isDark ? 'bg-slate-500' : 'bg-slate-400'
                      }`}
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div
              className={`p-4 rounded-2xl border space-y-2.5 ${
                isDark
                  ? 'bg-slate-900/50 border-slate-800'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <TrendingUp className={`w-4 h-4 shrink-0 ${isDark ? 'text-slate-300' : 'text-slate-700'}`} />
                <h4 className="text-xs font-black uppercase tracking-wider">
                  Ganhos reais no dia a dia
                </h4>
              </div>
              <ul className="space-y-2">
                {conteudo.ganhosReais.map((item, idx) => (
                  <li
                    key={idx}
                    className={`flex items-start gap-2 text-xs leading-relaxed ${
                      isDark ? 'text-slate-300' : 'text-slate-700'
                    }`}
                  >
                    <Check
                      className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                        isDark ? 'text-slate-300' : 'text-slate-700'
                      }`}
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Exemplo Prático */}
          <div
            className={`p-4 rounded-2xl border ${
              isDark
                ? 'bg-slate-900/90 border-slate-800'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <span
              className={`text-[10px] font-black uppercase tracking-wider block mb-1 ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              Exemplo prático de uso
            </span>
            <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              {conteudo.exemploPratico}
            </p>
          </div>
        </div>

        {/* RODAPÉ COM AÇÕES ESPELHADAS EM CINZA SÓBRIO */}
        <div
          className={`p-4 sm:p-5 border-t shrink-0 flex flex-wrap items-center justify-between gap-2.5 ${
            isDark ? 'border-slate-800 bg-slate-900/80' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${classeBotaoSecundariaNeutra}`}
          >
            Fechar
          </button>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {acoes.map((acao) => (
              <button
                key={acao.id}
                type="button"
                disabled={acao.disabled}
                onClick={acao.onClick}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                  acao.variante === 'primaria_neutra'
                    ? classeBotaoPrimariaNeutra
                    : classeBotaoSecundariaNeutra
                }`}
              >
                {acao.ativo && !acao.icone && <Check className="w-3.5 h-3.5 shrink-0" />}
                <span>{acao.rotulo}</span>
                {renderIconeAcao(acao.icone)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
