import { useAuth } from '../contexts/AuthContext';

export interface PermissionsState {
  ehOwner: boolean;
  ehAdmin: boolean;
  ehGerente: boolean;
  ehVendedorOuComum: boolean;

  // Permissões granulares
  podeUsoCelularPessoal: boolean;
  podeVerTransacoesOutros: boolean;
  podeDarDesconto: boolean;
  podeCadastrarAlterarProdutos: boolean;
  podeGerenciarEstoque: boolean;
  podeAtivarFiado: boolean;
  podeVerPrecoCusto: boolean;
  podeExportarRelatorios: boolean;
  podeEditarVendasPassadas: boolean;

  // Acessos aos módulos do sistema
  podeAcessarPdv: boolean;
  podeAcessarPedidos: boolean;
  podeAcessarProdutos: boolean;
  podeAcessarClientes: boolean;
  podeAcessarFinancas: boolean;
  podeAcessarAnalytics: boolean;
  podeAcessarRubiIA: boolean;
  podeAcessarAuxiliares: boolean;
  podeAcessarUsuarios: boolean;
  podeAcessarConfig: boolean;

  // Verificação de dispositivo
  bloqueadoPorDispositivoMovel: boolean;
}

export const usePermissions = (): PermissionsState => {
  const { usuario } = useAuth();

  const perfil = usuario?.perfil || 'comum';
  const ehOwner = perfil === 'owner';
  const ehAdmin = ehOwner || perfil === 'admin';
  const ehGerente = ehAdmin || perfil === 'gerente';
  const ehVendedorOuComum = !ehAdmin && !ehGerente;

  // Permissões Granulares
  const podeUsoCelularPessoal = ehAdmin || (usuario?.pode_uso_celular_pessoal ?? true);
  const podeVerTransacoesOutros = ehAdmin || (usuario?.pode_ver_transacoes_outros ?? false);
  const podeDarDesconto = ehAdmin || (usuario?.pode_dar_desconto ?? false);
  const podeCadastrarAlterarProdutos = ehAdmin || (usuario?.pode_cadastrar_alterar_produtos ?? false);
  const podeGerenciarEstoque = ehAdmin || (usuario?.pode_gerenciar_estoque ?? false);
  const podeAtivarFiado = ehAdmin || (usuario?.pode_ativar_fiado ?? false);
  const podeVerPrecoCusto = ehAdmin || (usuario?.pode_ver_preco_custo ?? false);
  const podeExportarRelatorios = ehAdmin || (usuario?.pode_exportar_relatorios ?? false);
  const podeEditarVendasPassadas = ehAdmin || (usuario?.pode_editar_vendas_passadas ?? false);

  // Módulos
  const podeAcessarPdv = true; // Todos os operadores autorizados podem vender no PDV
  const podeAcessarPedidos = true; // Todos os operadores podem acessar tela de pedidos (com escopo filtrado)
  const podeAcessarProdutos = true; // Usuários comuns podem consultar produtos e preços
  const podeAcessarClientes = true; // Usuários comuns podem consultar e cadastrar clientes
  const podeAcessarFinancas = ehGerente; // Somente Owner, Admin e Gerente
  const podeAcessarAnalytics = ehGerente || podeExportarRelatorios; // Gestores ou com permissão explícita
  const podeAcessarRubiIA = ehGerente; // Assistente IA estratégica para gestores
  const podeAcessarAuxiliares = ehAdmin; // Somente Owner e Admin
  const podeAcessarUsuarios = ehAdmin; // Somente Owner e Admin
  const podeAcessarConfig = ehAdmin; // Somente Owner e Admin

  // Detecção de celular para verificar se o operador tem permissão de usar celular pessoal
  const isMobileScreen = typeof window !== 'undefined' && (
    window.innerWidth < 768 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );

  const bloqueadoPorDispositivoMovel = isMobileScreen && !ehAdmin && !podeUsoCelularPessoal;

  return {
    ehOwner,
    ehAdmin,
    ehGerente,
    ehVendedorOuComum,
    podeUsoCelularPessoal,
    podeVerTransacoesOutros,
    podeDarDesconto,
    podeCadastrarAlterarProdutos,
    podeGerenciarEstoque,
    podeAtivarFiado,
    podeVerPrecoCusto,
    podeExportarRelatorios,
    podeEditarVendasPassadas,
    podeAcessarPdv,
    podeAcessarPedidos,
    podeAcessarProdutos,
    podeAcessarClientes,
    podeAcessarFinancas,
    podeAcessarAnalytics,
    podeAcessarRubiIA,
    podeAcessarAuxiliares,
    podeAcessarUsuarios,
    podeAcessarConfig,
    bloqueadoPorDispositivoMovel
  };
};
