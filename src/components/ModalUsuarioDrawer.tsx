import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Eye,
  EyeOff,
  Shield,
  Smartphone,
  Layers,
  Percent,
  Package,
  Boxes,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Crown,
  TrendingUp,
  UserCheck,
  Power,
  DollarSign
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UsuarioLoja, PerfilUsuario } from '../types';
import { useFeedbackModal } from '../contexts/FeedbackContext';
import { useRegisterOverlay } from '../hooks/useRegisterOverlay';
import { usuarioService } from '../services/usuarioService';
import { formatarMoeda } from '../utils/formatters';
import { useTheme } from '../contexts/ThemeContext';

interface ModalUsuarioDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  usuarioEdicao?: UsuarioLoja | null;
  lojaId: string;
  onSalvo: () => void;
}

export const ModalUsuarioDrawer: React.FC<ModalUsuarioDrawerProps> = ({
  isOpen,
  onClose,
  usuarioEdicao,
  lojaId,
  onSalvo
}) => {
  const { isDark } = useTheme();
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  // Campos do formulário
  const [nome, setNome] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [senha, setSenha] = useState<string>('');
  const [mostrarSenha, setMostrarSenha] = useState<boolean>(false);
  const [ativo, setAtivo] = useState<boolean>(true);
  const [perfil, setPerfil] = useState<PerfilUsuario>('vendedor');
  const [telaInicial, setTelaInicial] = useState<string>('dashboard');

  // Permissões
  const [ehAdmin, setEhAdmin] = useState<boolean>(false);
  const [podeCelular, setPodeCelular] = useState<boolean>(true);
  const [podeVerOutros, setPodeVerOutros] = useState<boolean>(false);
  const [podeDesconto, setPodeDesconto] = useState<boolean>(false);
  const [podeProdutos, setPodeProdutos] = useState<boolean>(false);
  const [podeEstoque, setPodeEstoque] = useState<boolean>(false);
  const [podeFiado, setPodeFiado] = useState<boolean>(false);
  const [podeCaixa, setPodeCaixa] = useState<boolean>(false);

  const { confirmar } = useFeedbackModal();
  const ehOwner = usuarioEdicao?.perfil === 'owner';

  const snapshotInicial = useMemo(() => {
    if (!isOpen) return '';
    const perfilAtivo = usuarioEdicao ? (usuarioEdicao.perfil || 'comum') : 'vendedor';
    const isAdmin = usuarioEdicao ? (usuarioEdicao.perfil === 'admin' || usuarioEdicao.perfil === 'owner') : false;
    const ehGestor = isAdmin || perfilAtivo === 'gerente';
    const telaInicialPadrao = usuarioEdicao?.tela_inicial || (ehGestor ? 'dashboard' : 'pos');
    return JSON.stringify({
      nome: usuarioEdicao?.nome_completo || '',
      email: usuarioEdicao?.email || '',
      senha: '',
      perfil: perfilAtivo,
      telaInicial: telaInicialPadrao,
      ativo: usuarioEdicao ? (usuarioEdicao.ativo ?? true) : true,
      ehAdmin: isAdmin,
      podeCelular: usuarioEdicao ? (isAdmin ? true : (usuarioEdicao.pode_uso_celular_pessoal ?? true)) : true,
      podeVerOutros: usuarioEdicao ? (isAdmin ? true : (usuarioEdicao.pode_ver_transacoes_outros ?? false)) : false,
      podeDesconto: usuarioEdicao ? (isAdmin ? true : (usuarioEdicao.pode_dar_desconto ?? false)) : false,
      podeProdutos: usuarioEdicao ? (isAdmin ? true : (usuarioEdicao.pode_cadastrar_alterar_produtos ?? false)) : false,
      podeEstoque: usuarioEdicao ? (isAdmin ? true : (usuarioEdicao.pode_gerenciar_estoque ?? false)) : false,
      podeFiado: usuarioEdicao ? (isAdmin ? true : (usuarioEdicao.pode_ativar_fiado ?? false)) : false,
      podeCaixa: usuarioEdicao ? (isAdmin ? true : (usuarioEdicao.pode_abrir_fechar_caixa ?? false)) : false
    });
  }, [usuarioEdicao, isOpen]);

  const snapshotAtual = useMemo(() => {
    return JSON.stringify({
      nome,
      email,
      senha,
      perfil,
      telaInicial,
      ativo,
      ehAdmin,
      podeCelular,
      podeVerOutros,
      podeDesconto,
      podeProdutos,
      podeEstoque,
      podeFiado,
      podeCaixa
    });
  }, [
    nome,
    email,
    senha,
    perfil,
    telaInicial,
    ativo,
    ehAdmin,
    podeCelular,
    podeVerOutros,
    podeDesconto,
    podeProdutos,
    podeEstoque,
    podeFiado,
    podeCaixa
  ]);

  const temAlteracoesForm = snapshotAtual !== snapshotInicial;

  const handleFecharComConfirmacao = () => {
    if (temAlteracoesForm) {
      confirmar({
        titulo: 'Descartar Alterações?',
        mensagem: 'Você fez alterações neste usuário que ainda não foram salvas. Deseja fechar e descartá-las?',
        textoConfirmar: 'Descartar e Fechar',
        textoCancelar: 'Continuar Editando',
        onConfirmar: () => onClose()
      });
    } else {
      onClose();
    }
  };

  useEffect(() => {
    if (usuarioEdicao) {
      setNome(usuarioEdicao.nome_completo || '');
      setEmail(usuarioEdicao.email || '');
      setSenha('');
      setAtivo(usuarioEdicao.ativo ?? true);
      const p = usuarioEdicao.perfil || 'comum';
      setPerfil(p);

      if (p === 'owner') {
        // Se for Owner, todas as flags são verdadeiras e bloqueadas
        setEhAdmin(true);
        setPodeCelular(true);
        setPodeVerOutros(true);
        setPodeDesconto(true);
        setPodeProdutos(true);
        setPodeEstoque(true);
        setPodeFiado(true);
        setPodeCaixa(true);
      } else {
        const isAdmin = p === 'admin';
        setEhAdmin(isAdmin);
        setPodeCelular(isAdmin ? true : (usuarioEdicao.pode_uso_celular_pessoal ?? true));
        setPodeVerOutros(isAdmin ? true : (usuarioEdicao.pode_ver_transacoes_outros ?? false));
        setPodeDesconto(isAdmin ? true : (usuarioEdicao.pode_dar_desconto ?? false));
        setPodeProdutos(isAdmin ? true : (usuarioEdicao.pode_cadastrar_alterar_produtos ?? false));
        setPodeEstoque(isAdmin ? true : (usuarioEdicao.pode_gerenciar_estoque ?? false));
        setPodeFiado(isAdmin ? true : (usuarioEdicao.pode_ativar_fiado ?? false));
        setPodeCaixa(isAdmin ? true : (usuarioEdicao.pode_abrir_fechar_caixa ?? false));
      }
      const ehGestor = p === 'owner' || p === 'admin' || p === 'gerente';
      setTelaInicial(usuarioEdicao.tela_inicial || (ehGestor ? 'dashboard' : 'pos'));
    } else {
      // Novo usuário (Padrão: Vendedor com celular pessoal ativado e tela inicial no PDV)
      setNome('');
      setEmail('');
      setSenha('');
      setAtivo(true);
      setPerfil('vendedor');
      setTelaInicial('pos');
      setEhAdmin(false);
      setPodeCelular(true);
      setPodeVerOutros(false);
      setPodeDesconto(false);
      setPodeProdutos(false);
      setPodeEstoque(false);
      setPodeFiado(false);
      setPodeCaixa(false);
    }
    setErro(null);
  }, [usuarioEdicao, isOpen]);

  // Alteração de Perfil de Acesso com predefinição inteligente de permissões
  const handleMudarPerfil = (novoPerfil: PerfilUsuario) => {
    if (ehOwner) return;
    setPerfil(novoPerfil);

    if (novoPerfil === 'admin') {
      setEhAdmin(true);
      setPodeCelular(true);
      setPodeVerOutros(true);
      setPodeDesconto(true);
      setPodeProdutos(true);
      setPodeEstoque(true);
      setPodeFiado(true);
      setPodeCaixa(true);
      if (telaInicial === 'pos') setTelaInicial('dashboard');
    } else if (novoPerfil === 'gerente') {
      setEhAdmin(false);
      setPodeCelular(true);
      setPodeVerOutros(true);
      setPodeDesconto(true);
      setPodeProdutos(true);
      setPodeEstoque(true);
      setPodeFiado(true);
      setPodeCaixa(true);
      if (telaInicial === 'pos') setTelaInicial('dashboard');
    } else if (novoPerfil === 'vendedor') {
      setEhAdmin(false);
      setPodeCelular(true);
      setPodeVerOutros(false);
      setPodeDesconto(false);
      setPodeProdutos(false);
      setPodeEstoque(false);
      setPodeFiado(false);
      setPodeCaixa(false);
      if (telaInicial === 'dashboard') setTelaInicial('pos');
    } else {
      setEhAdmin(false);
      setPodeCelular(true);
      setPodeVerOutros(false);
      setPodeDesconto(false);
      setPodeProdutos(false);
      setPodeEstoque(false);
      setPodeFiado(false);
      setPodeCaixa(false);
    }
  };

  // Se marcar/desmarcar Admin
  const handleToggleAdmin = (checked: boolean) => {
    if (ehOwner) return; // Owner não altera
    setEhAdmin(checked);
    if (checked) {
      setPerfil('admin');
      setPodeCelular(true);
      setPodeVerOutros(true);
      setPodeDesconto(true);
      setPodeProdutos(true);
      setPodeEstoque(true);
      setPodeFiado(true);
      setPodeCaixa(true);
    } else {
      setPerfil('comum');
    }
  };

  const handleSalvarUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (!nome.trim()) {
      setErro('Por favor, informe o nome completo do usuário.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErro('Por favor, informe um endereço de e-mail válido.');
      return;
    }

    // Validação de senha
    if (!usuarioEdicao && (!senha || senha.length < 6)) {
      setErro('Para criar um novo usuário, a senha deve conter no mínimo 6 caracteres.');
      return;
    }
    if (usuarioEdicao && senha && senha.length < 6) {
      setErro('A nova senha deve conter no mínimo 6 caracteres.');
      return;
    }

    try {
      setSalvando(true);

      const perfilFinal: PerfilUsuario = ehOwner 
        ? 'owner' 
        : (ehAdmin ? 'admin' : perfil);

      await usuarioService.salvarOperador({
        id: usuarioEdicao?.id,
        lojaId,
        nomeCompleto: nome,
        email,
        senha: senha.trim() || undefined,
        perfil: perfilFinal,
        ativo: ehOwner ? true : ativo,
        usuarioAuthId: usuarioEdicao?.usuario_auth_id || null,
        podeUsoCelularPessoal: ehOwner ? true : (ehAdmin ? true : podeCelular),
        podeVerTransacoesOutros: ehOwner ? true : (ehAdmin ? true : podeVerOutros),
        podeDarDesconto: ehOwner ? true : (ehAdmin ? true : podeDesconto),
        podeCadastrarAlterarProdutos: ehOwner ? true : (ehAdmin ? true : podeProdutos),
        podeGerenciarEstoque: ehOwner ? true : (ehAdmin ? true : podeEstoque),
        podeAtivarFiado: ehOwner ? true : (ehAdmin ? true : podeFiado),
        podeAbrirFecharCaixa: ehOwner ? true : (ehAdmin ? true : podeCaixa),
        podeVerPrecoCusto: ehOwner || ehAdmin,
        podeExportarRelatorios: ehOwner || ehAdmin,
        podeEditarVendasPassadas: ehOwner || ehAdmin,
        telaInicial: (ehOwner || ehAdmin || perfilFinal === 'gerente') ? telaInicial : (telaInicial === 'dashboard' ? 'pos' : telaInicial)
      });

      onSalvo();
      onClose();
    } catch (err: any) {
      console.error('Erro ao salvar usuário:', err);
      setErro(err.message || 'Erro ao gravar usuário no banco de dados.');
    } finally {
      setSalvando(false);
    }
  };

  useRegisterOverlay(isOpen, handleFecharComConfirmacao, 'modal-usuario-drawer');

  if (!isOpen) return null;

  const metricas = usuarioEdicao?.metricas;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-end z-50 animate-in fade-in">
      <div className={`border-l w-full max-w-2xl h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200 ${isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'}`}>
        
        {/* CABEÇALHO DO DRAWER */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between sticky top-0 z-10 ${isDark ? 'bg-[#000000] border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-3">
            <h3 className={`font-black text-lg flex items-center gap-2 ${isDark ? 'text-white' : 'text-black'}`}>
              <span>{usuarioEdicao ? usuarioEdicao.nome_completo : 'Adicionar Usuário'}</span>
            </h3>

            {ehOwner && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-teal-500/15 text-teal-800 dark:text-teal-300 border border-teal-500/30 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                <Crown className="w-3 h-3" />
                OWNER
              </span>
            )}

            {ehAdmin && !ehOwner && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                <Shield className="w-3 h-3" />
                ADMIN
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Switch de Inativar Usuário no cabeçalho */}
            {usuarioEdicao && (
              <div className={`flex items-center gap-2 pr-2 border-r ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <span className={`text-[11px] font-bold hidden sm:inline ${isDark ? 'text-slate-300' : 'text-black'}`}>
                  {ativo ? 'Ativo' : 'Inativo'}
                </span>
                <label className="relative inline-flex items-center cursor-pointer shrink-0" title={ehOwner ? "O proprietário não pode ser inativado" : "Ativar ou inativar acesso"}>
                  <input
                    type="checkbox"
                    checked={ativo}
                    disabled={ehOwner}
                    onChange={(e) => setAtivo(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className={`w-9 h-5 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 ${isDark ? 'bg-slate-700' : 'bg-slate-300'} ${ehOwner ? 'opacity-80 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>
            )}

            <button
              type="button"
              onClick={handleFecharComConfirmacao}
              className={`p-1.5 rounded-xl transition cursor-pointer ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-black hover:bg-slate-100'}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* FAIXA DE INDICADORES DE VENDAS (HOJE, ONTEM, ESTA SEMANA, ESTE MÊS) */}
        {usuarioEdicao && metricas && (
          <div className={`border-b px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs ${isDark ? 'bg-[#08131A] border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <div className={`rounded-xl p-2.5 space-y-0.5 shadow-2xs border ${isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'}`}>
              <span className={`text-[10px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Hoje</span>
              <span className={`font-black block ${isDark ? 'text-white' : 'text-black'}`}>{metricas.hoje_vendas} vendas</span>
              <span className={`text-[11px] font-black block ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                {formatarMoeda(metricas.hoje_faturamento)}
              </span>
            </div>

            <div className={`rounded-xl p-2.5 space-y-0.5 shadow-2xs border ${isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'}`}>
              <span className={`text-[10px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Ontem</span>
              <span className={`font-black block ${isDark ? 'text-white' : 'text-black'}`}>{metricas.ontem_vendas} vendas</span>
              <span className={`text-[11px] font-black block ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>
                {formatarMoeda(metricas.ontem_faturamento)}
              </span>
            </div>

            <div className={`rounded-xl p-2.5 space-y-0.5 shadow-2xs border ${isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'}`}>
              <span className={`text-[10px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Esta Semana</span>
              <span className={`font-black block ${isDark ? 'text-white' : 'text-black'}`}>{metricas.semana_vendas} vendas</span>
              <span className={`text-[11px] font-black block ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                {formatarMoeda(metricas.semana_faturamento)}
              </span>
            </div>

            <div className={`rounded-xl p-2.5 space-y-0.5 shadow-2xs border ${isDark ? 'bg-[#000000] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'}`}>
              <span className={`text-[10px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Este Mês</span>
              <span className={`font-black block ${isDark ? 'text-white' : 'text-black'}`}>{metricas.mes_vendas} vendas</span>
              <span className={`text-[11px] font-black block ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                {formatarMoeda(metricas.mes_faturamento)}
              </span>
            </div>
          </div>
        )}

        {/* MENSAGEM DE ERRO (SE HOUVER) */}
        {erro && (
          <div className={`m-4 p-3.5 rounded-2xl flex items-center gap-2.5 text-xs border ${isDark ? 'bg-rose-950/30 border-rose-500/40 text-rose-300' : 'bg-rose-50 border-2 border-rose-300 text-rose-900 font-bold'}`}>
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{erro}</span>
          </div>
        )}

        {/* FORMULÁRIO UNIFICADO EM TELA ÚNICA */}
        <form onSubmit={handleSalvarUsuario} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* ========================================================================= */}
          {/* SEÇÃO 1: DADOS DO USUÁRIO & ACESSO                                        */}
          {/* ========================================================================= */}
          <div className={`border rounded-3xl p-5 space-y-4 shadow-xs ${isDark ? 'bg-[#08131A] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'}`}>
            <h4 className={`text-xs font-black uppercase tracking-wider flex items-center gap-2 ${isDark ? 'text-white' : 'text-black'}`}>
              <UserCheck className="w-4 h-4 text-emerald-500" />
              <span>Dados do usuário</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={`text-xs font-bold block ${isDark ? 'text-slate-300' : 'text-black'}`}>Nome *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: João Roberto ou Maria Silva"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className={`w-full rounded-xl px-3.5 py-2.5 text-xs font-bold focus:outline-none transition border ${isDark ? 'bg-[#000000] border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'}`}
                />
              </div>

              <div className="space-y-1.5">
                <label className={`text-xs font-bold block ${isDark ? 'text-slate-300' : 'text-black'}`}>Email *</label>
                <input
                  type="email"
                  required
                  placeholder="Ex: jroberto@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full rounded-xl px-3.5 py-2.5 text-xs font-bold focus:outline-none transition border ${isDark ? 'bg-[#000000] border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'}`}
                />
              </div>
            </div>

            {/* Campo de Senha */}
            <div className="space-y-1.5 pt-1">
              <label className={`text-xs font-bold block ${isDark ? 'text-slate-300' : 'text-black'}`}>
                {usuarioEdicao ? 'Redefinir Senha (Opcional)' : 'Senha de Acesso * (Mínimo 6 dígitos)'}
              </label>
              <div className="relative">
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  placeholder={usuarioEdicao ? 'Deixe em branco para manter a senha atual' : '••••••••'}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className={`w-full rounded-xl pl-3.5 pr-10 py-2.5 text-xs font-bold focus:outline-none transition border font-mono ${isDark ? 'bg-[#000000] border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500' : 'bg-white border-2 border-slate-300 text-black placeholder:text-slate-400 focus:border-emerald-500'}`}
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 transition cursor-pointer ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-black'}`}
                >
                  {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <span className={`text-[11px] block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Esta senha é utilizada para entrar no HUBI Web e no aplicativo PDV.
              </span>
            </div>

            {/* Campo de Perfil de Acesso */}
            <div className={`space-y-2 pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <label className={`text-xs font-bold flex items-center justify-between ${isDark ? 'text-slate-300' : 'text-black'}`}>
                <span>Perfil de Acesso *</span>
                {ehOwner && (
                  <span className="text-[10px] text-teal-400 font-bold">Proprietário (Imutável)</span>
                )}
              </label>

              {ehOwner ? (
                <div className={`p-3 rounded-xl text-xs font-bold border ${isDark ? 'bg-teal-950/20 border-teal-500/30 text-teal-300' : 'bg-teal-50 border-2 border-teal-300 text-teal-950'}`}>
                  Perfil de Proprietário da Conta com privilégios totais.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleMudarPerfil('admin')}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                      (ehAdmin || perfil === 'admin')
                        ? (isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30 font-black' : 'bg-emerald-50 text-emerald-950 border-2 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30 font-black')
                        : (isDark ? 'bg-[#000000] border-slate-700 text-slate-300 hover:border-slate-600 hover:text-white font-bold' : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black hover:border-slate-400 font-bold')
                    }`}
                  >
                    <span className={`text-xs font-black ${(ehAdmin || perfil === 'admin') ? (isDark ? 'text-emerald-300' : 'text-emerald-950') : (isDark ? 'text-white' : 'text-black')}`}>Admin</span>
                    <span className={`text-[10px] mt-1 ${(ehAdmin || perfil === 'admin') ? (isDark ? 'text-emerald-400/80' : 'text-emerald-800') : (isDark ? 'text-slate-400' : 'text-slate-600')}`}>Acesso Total</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMudarPerfil('gerente')}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                      (!ehAdmin && perfil === 'gerente')
                        ? (isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30 font-black' : 'bg-emerald-50 text-emerald-950 border-2 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30 font-black')
                        : (isDark ? 'bg-[#000000] border-slate-700 text-slate-300 hover:border-slate-600 hover:text-white font-bold' : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black hover:border-slate-400 font-bold')
                    }`}
                  >
                    <span className={`text-xs font-black ${(!ehAdmin && perfil === 'gerente') ? (isDark ? 'text-emerald-300' : 'text-emerald-950') : (isDark ? 'text-white' : 'text-black')}`}>Gerente</span>
                    <span className={`text-[10px] mt-1 ${(!ehAdmin && perfil === 'gerente') ? (isDark ? 'text-emerald-400/80' : 'text-emerald-800') : (isDark ? 'text-slate-400' : 'text-slate-600')}`}>Gestão & IA</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMudarPerfil('vendedor')}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                      (!ehAdmin && perfil === 'vendedor')
                        ? (isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30 font-black' : 'bg-emerald-50 text-emerald-950 border-2 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30 font-black')
                        : (isDark ? 'bg-[#000000] border-slate-700 text-slate-300 hover:border-slate-600 hover:text-white font-bold' : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black hover:border-slate-400 font-bold')
                    }`}
                  >
                    <span className={`text-xs font-black ${(!ehAdmin && perfil === 'vendedor') ? (isDark ? 'text-emerald-300' : 'text-emerald-950') : (isDark ? 'text-white' : 'text-black')}`}>Vendedor</span>
                    <span className={`text-[10px] mt-1 ${(!ehAdmin && perfil === 'vendedor') ? (isDark ? 'text-emerald-400/80' : 'text-emerald-800') : (isDark ? 'text-slate-400' : 'text-slate-600')}`}>Frente de Caixa</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMudarPerfil('comum')}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                      (!ehAdmin && perfil === 'comum')
                        ? (isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30 font-black' : 'bg-emerald-50 text-emerald-950 border-2 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30 font-black')
                        : (isDark ? 'bg-[#000000] border-slate-700 text-slate-300 hover:border-slate-600 hover:text-white font-bold' : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black hover:border-slate-400 font-bold')
                    }`}
                  >
                    <span className={`text-xs font-black ${(!ehAdmin && perfil === 'comum') ? (isDark ? 'text-emerald-300' : 'text-emerald-950') : (isDark ? 'text-white' : 'text-black')}`}>Comum</span>
                    <span className={`text-[10px] mt-1 ${(!ehAdmin && perfil === 'comum') ? (isDark ? 'text-emerald-400/80' : 'text-emerald-800') : (isDark ? 'text-slate-400' : 'text-slate-600')}`}>Básico</span>
                  </button>
                </div>
              )}
            </div>

            {/* Campo de Tela Inicial Padrão */}
            <div className={`space-y-2 pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <label className={`text-xs font-bold block ${isDark ? 'text-slate-300' : 'text-black'}`}>
                Tela Inicial Padrão *
              </label>

              <div className="grid grid-cols-2 gap-2">
                {(ehOwner || ehAdmin || perfil === 'gerente' || perfil === 'admin') && (
                  <button
                    type="button"
                    onClick={() => setTelaInicial('dashboard')}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                      telaInicial === 'dashboard'
                        ? (isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30 font-black' : 'bg-emerald-50 text-emerald-950 border-2 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30 font-black')
                        : (isDark ? 'bg-[#000000] border-slate-700 text-slate-300 hover:border-slate-600 hover:text-white font-bold' : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black hover:border-slate-400 font-bold')
                    }`}
                  >
                    <span className={`text-xs font-black ${telaInicial === 'dashboard' ? (isDark ? 'text-emerald-300' : 'text-emerald-950') : (isDark ? 'text-white' : 'text-black')}`}>Dashboard Executivo</span>
                    <span className={`text-[10px] mt-0.5 ${telaInicial === 'dashboard' ? (isDark ? 'text-emerald-400/80' : 'text-emerald-800') : (isDark ? 'text-slate-400' : 'text-slate-600')}`}>Cockpit F1 & Metas</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setTelaInicial('pos')}
                  className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                    telaInicial === 'pos'
                      ? (isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30 font-black' : 'bg-emerald-50 text-emerald-950 border-2 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30 font-black')
                      : (isDark ? 'bg-[#000000] border-slate-700 text-slate-300 hover:border-slate-600 hover:text-white font-bold' : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black hover:border-slate-400 font-bold')
                  }`}
                >
                  <span className={`text-xs font-black ${telaInicial === 'pos' ? (isDark ? 'text-emerald-300' : 'text-emerald-950') : (isDark ? 'text-white' : 'text-black')}`}>Vender (PDV)</span>
                  <span className={`text-[10px] mt-0.5 ${telaInicial === 'pos' ? (isDark ? 'text-emerald-400/80' : 'text-emerald-800') : (isDark ? 'text-slate-400' : 'text-slate-600')}`}>Frente de Caixa</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTelaInicial('pedidos')}
                  className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                    telaInicial === 'pedidos'
                      ? (isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30 font-black' : 'bg-emerald-50 text-emerald-950 border-2 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30 font-black')
                      : (isDark ? 'bg-[#000000] border-slate-700 text-slate-300 hover:border-slate-600 hover:text-white font-bold' : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black hover:border-slate-400 font-bold')
                  }`}
                >
                  <span className={`text-xs font-black ${telaInicial === 'pedidos' ? (isDark ? 'text-emerald-300' : 'text-emerald-950') : (isDark ? 'text-white' : 'text-black')}`}>Pedidos em Aberto</span>
                  <span className={`text-[10px] mt-0.5 ${telaInicial === 'pedidos' ? (isDark ? 'text-emerald-400/80' : 'text-emerald-800') : (isDark ? 'text-slate-400' : 'text-slate-600')}`}>Gestão Operacional</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTelaInicial('vendas')}
                  className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                    telaInicial === 'vendas'
                      ? (isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30 font-black' : 'bg-emerald-50 text-emerald-950 border-2 border-emerald-500 shadow-sm ring-1 ring-emerald-500/30 font-black')
                      : (isDark ? 'bg-[#000000] border-slate-700 text-slate-300 hover:border-slate-600 hover:text-white font-bold' : 'bg-white hover:bg-slate-50 border-2 border-slate-300 text-black hover:border-slate-400 font-bold')
                  }`}
                >
                  <span className={`text-xs font-black ${telaInicial === 'vendas' ? (isDark ? 'text-emerald-300' : 'text-emerald-950') : (isDark ? 'text-white' : 'text-black')}`}>Histórico de Vendas</span>
                  <span className={`text-[10px] mt-0.5 ${telaInicial === 'vendas' ? (isDark ? 'text-emerald-400/80' : 'text-emerald-800') : (isDark ? 'text-slate-400' : 'text-slate-600')}`}>Vendas Realizadas</span>
                </button>
              </div>
              <span className={`text-[11px] block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Define qual módulo será aberto automaticamente ao fazer login ou abrir a aplicação.
              </span>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SEÇÃO 2: PERMISSÕES & CONTROLE DE ACESSO                                  */}
          {/* ========================================================================= */}
          <div className={`border rounded-3xl p-5 space-y-4 shadow-xs ${isDark ? 'bg-[#08131A] border-slate-700 text-white' : 'bg-white border-2 border-slate-300 text-black'}`}>
            <div className="flex items-center justify-between">
              <h4 className={`text-xs font-black uppercase tracking-wider flex items-center gap-2 ${isDark ? 'text-white' : 'text-black'}`}>
                <Shield className="w-4 h-4 text-emerald-500" />
                <span>Permissões de Acesso</span>
              </h4>

              {ehOwner && (
                <span className={`text-[10px] font-black border px-2 py-0.5 rounded-lg flex items-center gap-1 ${isDark ? 'bg-teal-950/20 text-teal-300 border-teal-500/30' : 'bg-teal-50 text-teal-800 border-teal-300'}`}>
                  <Lock className="w-3 h-3" />
                  Imutável (Proprietário)
                </span>
              )}
            </div>

            {/* AVISO EXPLICATIVO PARA OWNER */}
            {ehOwner ? (
              <div className={`p-3.5 rounded-2xl flex items-start gap-3 text-xs border ${isDark ? 'bg-teal-950/20 border-teal-500/30 text-teal-300' : 'bg-teal-50 border-2 border-teal-300 text-teal-950'}`}>
                <Crown className="w-5 h-5 text-teal-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-black block">Proprietário da Conta</span>
                  <p className={`text-[11px] leading-relaxed ${isDark ? 'text-teal-300/80' : 'text-teal-900/90'}`}>
                    Como proprietário desta conta, você possui acesso total e irrestrito a todas as funcionalidades do Hubi. Todas as permissões permanecem ativas e não podem ser revogadas.
                  </p>
                </div>
              </div>
            ) : (
              <div className={`p-3.5 rounded-2xl text-[11px] leading-relaxed border ${isDark ? 'bg-[#000000] border-slate-800 text-slate-300' : 'bg-slate-50 border-2 border-slate-200 text-black font-semibold'}`}>
                <p>
                  <strong>Por padrão</strong>, todos os usuários têm acesso a: lançar pedidos e vendas, ver seus próprios pedidos, ver e cadastrar clientes e ver os produtos.
                </p>
              </div>
            )}

            {/* LISTA DE SWITCHES GRANULARES */}
            <div className="space-y-3 pt-1">
              
              {/* 1. Administrador */}
              <div className={`flex items-start justify-between gap-3 p-3.5 rounded-2xl transition border ${isDark ? 'bg-[#000000] border-slate-800 hover:border-slate-700' : 'bg-slate-50 border-2 border-slate-200 hover:border-slate-300'}`}>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-emerald-500" />
                    <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-black'}`}>Administrador</span>
                  </div>
                  <p className={`text-[11px] leading-tight ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Dá acesso a todas as funcionalidades do Hubi - exceto à gestão da assinatura, disponível apenas para o proprietário da conta.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5" title={ehOwner ? "Permissão travada para o proprietário" : ""}>
                  <input
                    type="checkbox"
                    checked={ehOwner ? true : ehAdmin}
                    onChange={(e) => handleToggleAdmin(e.target.checked)}
                    disabled={ehOwner}
                    className="sr-only peer"
                  />
                  <div className={`w-9 h-5 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 ${isDark ? 'bg-slate-700' : 'bg-slate-300'} ${ehOwner ? 'opacity-80 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>

              {/* 2. Permitir uso em celular pessoal */}
              <div className={`flex items-start justify-between gap-3 p-3.5 rounded-2xl transition border ${isDark ? 'bg-[#000000] border-slate-800 hover:border-slate-700' : 'bg-slate-50 border-2 border-slate-200 hover:border-slate-300'}`}>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                    <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-black'}`}>Permitir uso em celular pessoal</span>
                  </div>
                  <p className={`text-[11px] leading-tight ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Permite que o usuário faça login de qualquer dispositivo. Se desativado, será necessário que um administrador faça o primeiro login no celular.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={ehOwner ? true : (ehAdmin ? true : podeCelular)}
                    onChange={(e) => setPodeCelular(e.target.checked)}
                    disabled={ehOwner || ehAdmin}
                    className="sr-only peer"
                  />
                  <div className={`w-9 h-5 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 ${isDark ? 'bg-slate-700' : 'bg-slate-300'} ${(ehOwner || ehAdmin) ? 'opacity-80 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>

              {/* 3. Ver transações de outros usuários */}
              <div className={`flex items-start justify-between gap-3 p-3.5 rounded-2xl transition border ${isDark ? 'bg-[#000000] border-slate-800 hover:border-slate-700' : 'bg-slate-50 border-2 border-slate-200 hover:border-slate-300'}`}>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                    <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-black'}`}>Ver transações de outros usuários</span>
                  </div>
                  <p className={`text-[11px] leading-tight ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Permite ver todos os pedidos e vendas, inclusive de outros usuários e do catálogo online.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={ehOwner ? true : (ehAdmin ? true : podeVerOutros)}
                    onChange={(e) => setPodeVerOutros(e.target.checked)}
                    disabled={ehOwner || ehAdmin}
                    className="sr-only peer"
                  />
                  <div className={`w-9 h-5 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 ${isDark ? 'bg-slate-700' : 'bg-slate-300'} ${(ehOwner || ehAdmin) ? 'opacity-80 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>

              {/* 4. Dar desconto em vendas */}
              <div className={`flex items-start justify-between gap-3 p-3.5 rounded-2xl transition border ${isDark ? 'bg-[#000000] border-slate-800 hover:border-slate-700' : 'bg-slate-50 border-2 border-slate-200 hover:border-slate-300'}`}>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-slate-400" />
                    <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-black'}`}>Dar desconto em vendas</span>
                  </div>
                  <p className={`text-[11px] leading-tight ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Permite aplicar descontos tanto no valor dos produtos, quanto no valor total do pedido.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={ehOwner ? true : (ehAdmin ? true : podeDesconto)}
                    onChange={(e) => setPodeDesconto(e.target.checked)}
                    disabled={ehOwner || ehAdmin}
                    className="sr-only peer"
                  />
                  <div className={`w-9 h-5 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 ${isDark ? 'bg-slate-700' : 'bg-slate-300'} ${(ehOwner || ehAdmin) ? 'opacity-80 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>

              {/* 5. Cadastrar/Alterar produtos */}
              <div className={`flex items-start justify-between gap-3 p-3.5 rounded-2xl transition border ${isDark ? 'bg-[#000000] border-slate-800 hover:border-slate-700' : 'bg-slate-50 border-2 border-slate-200 hover:border-slate-300'}`}>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-slate-400" />
                    <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-black'}`}>Cadastrar/Alterar produtos</span>
                  </div>
                  <p className={`text-[11px] leading-tight ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Permite que o usuário edite os dados dos produtos como preço, nome, descrição e visibilidade no catálogo.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={ehOwner ? true : (ehAdmin ? true : podeProdutos)}
                    onChange={(e) => setPodeProdutos(e.target.checked)}
                    disabled={ehOwner || ehAdmin}
                    className="sr-only peer"
                  />
                  <div className={`w-9 h-5 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 ${isDark ? 'bg-slate-700' : 'bg-slate-300'} ${(ehOwner || ehAdmin) ? 'opacity-80 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>

              {/* 6. Gerenciar estoque */}
              <div className={`flex items-start justify-between gap-3 p-3.5 rounded-2xl transition border ${isDark ? 'bg-[#000000] border-slate-800 hover:border-slate-700' : 'bg-slate-50 border-2 border-slate-200 hover:border-slate-300'}`}>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5 text-slate-400" />
                    <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-black'}`}>Gerenciar estoque</span>
                  </div>
                  <p className={`text-[11px] leading-tight ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Permite alterar o estoque atual dos produtos e também o estoque mínimo de alerta.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={ehOwner ? true : (ehAdmin ? true : podeEstoque)}
                    onChange={(e) => setPodeEstoque(e.target.checked)}
                    disabled={ehOwner || ehAdmin}
                    className="sr-only peer"
                  />
                  <div className={`w-9 h-5 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 ${isDark ? 'bg-slate-700' : 'bg-slate-300'} ${(ehOwner || ehAdmin) ? 'opacity-80 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>

              {/* 7. Ativar Fiado */}
              <div className={`flex items-start justify-between gap-3 p-3.5 rounded-2xl transition border ${isDark ? 'bg-[#000000] border-slate-800 hover:border-slate-700' : 'bg-slate-50 border-2 border-slate-200 hover:border-slate-300'}`}>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                    <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-black'}`}>Ativar Fiado</span>
                  </div>
                  <p className={`text-[11px] leading-tight ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Permite liberar o pagamento com fiado para clientes, além de adicionar ou remover créditos.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={ehOwner ? true : (ehAdmin ? true : podeFiado)}
                    onChange={(e) => setPodeFiado(e.target.checked)}
                    disabled={ehOwner || ehAdmin}
                    className="sr-only peer"
                  />
                  <div className={`w-9 h-5 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 ${isDark ? 'bg-slate-700' : 'bg-slate-300'} ${(ehOwner || ehAdmin) ? 'opacity-80 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>

              {/* 8. Abertura e Fechamento de Caixa */}
              <div className={`flex items-start justify-between gap-3 p-3.5 rounded-2xl transition border ${isDark ? 'bg-[#000000] border-slate-800 hover:border-slate-700' : 'bg-slate-50 border-2 border-slate-200 hover:border-slate-300'}`}>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                    <span className={`text-xs font-black ${isDark ? 'text-white' : 'text-black'}`}>Abertura e Fechamento de Caixa</span>
                  </div>
                  <p className={`text-[11px] leading-tight ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Permite abrir e fechar turnos de caixa formalmente e libera o acesso à funcionalidade de Finanças & Caixa.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={ehOwner ? true : (ehAdmin ? true : podeCaixa)}
                    onChange={(e) => setPodeCaixa(e.target.checked)}
                    disabled={ehOwner || ehAdmin}
                    className="sr-only peer"
                  />
                  <div className={`w-9 h-5 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 ${isDark ? 'bg-slate-700' : 'bg-slate-300'} ${(ehOwner || ehAdmin) ? 'opacity-80 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>

            </div>
          </div>

        </form>

        {/* RODAPÉ DO DRAWER COM AÇÕES */}
        <div className={`p-4 border-t flex items-center justify-between gap-3 sticky bottom-0 z-10 ${isDark ? 'bg-[#000000] border-slate-800' : 'bg-white border-slate-200'}`}>
          <button
            type="button"
            onClick={handleFecharComConfirmacao}
            className={`px-5 py-2.5 rounded-xl border text-xs font-black transition cursor-pointer ${isDark ? 'bg-[#000000] border-slate-700 hover:bg-slate-800 text-white' : 'bg-white border-2 border-slate-300 hover:bg-slate-100 text-black'}`}
          >
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSalvarUsuario}
              disabled={salvando}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-black shadow-md shadow-emerald-500/20 border border-emerald-500 transition cursor-pointer flex items-center gap-2 disabled:opacity-50 active:scale-95"
            >
              {salvando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Gravando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 stroke-[3]" />
                  <span>{usuarioEdicao ? 'Salvar Alterações' : 'Criar usuário'}</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
