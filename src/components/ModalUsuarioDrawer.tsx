import React, { useState, useEffect } from 'react';
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
  Trash2,
  Lock,
  Crown,
  TrendingUp,
  UserCheck,
  Power
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UsuarioLoja, PerfilUsuario } from '../types';

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
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  // Campos do formulário
  const [nome, setNome] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [senha, setSenha] = useState<string>('');
  const [mostrarSenha, setMostrarSenha] = useState<boolean>(false);
  const [ativo, setAtivo] = useState<boolean>(true);

  // Permissões
  const [ehAdmin, setEhAdmin] = useState<boolean>(false);
  const [podeCelular, setPodeCelular] = useState<boolean>(true);
  const [podeVerOutros, setPodeVerOutros] = useState<boolean>(false);
  const [podeDesconto, setPodeDesconto] = useState<boolean>(false);
  const [podeProdutos, setPodeProdutos] = useState<boolean>(false);
  const [podeEstoque, setPodeEstoque] = useState<boolean>(false);
  const [podeFiado, setPodeFiado] = useState<boolean>(false);

  const ehOwner = usuarioEdicao?.perfil === 'owner';

  useEffect(() => {
    if (usuarioEdicao) {
      setNome(usuarioEdicao.nome_completo || '');
      setEmail(usuarioEdicao.email || '');
      setSenha('');
      setAtivo(usuarioEdicao.ativo ?? true);

      if (usuarioEdicao.perfil === 'owner') {
        // Se for Owner, todas as flags são verdadeiras e bloqueadas
        setEhAdmin(true);
        setPodeCelular(true);
        setPodeVerOutros(true);
        setPodeDesconto(true);
        setPodeProdutos(true);
        setPodeEstoque(true);
        setPodeFiado(true);
      } else {
        const isAdmin = usuarioEdicao.perfil === 'admin';
        setEhAdmin(isAdmin);
        setPodeCelular(isAdmin ? true : (usuarioEdicao.pode_uso_celular_pessoal ?? true));
        setPodeVerOutros(isAdmin ? true : (usuarioEdicao.pode_ver_transacoes_outros ?? false));
        setPodeDesconto(isAdmin ? true : (usuarioEdicao.pode_dar_desconto ?? false));
        setPodeProdutos(isAdmin ? true : (usuarioEdicao.pode_cadastrar_alterar_produtos ?? false));
        setPodeEstoque(isAdmin ? true : (usuarioEdicao.pode_gerenciar_estoque ?? false));
        setPodeFiado(isAdmin ? true : (usuarioEdicao.pode_ativar_fiado ?? false));
      }
    } else {
      // Novo usuário (Padrão: Comum com celular pessoal ativado)
      setNome('');
      setEmail('');
      setSenha('');
      setAtivo(true);
      setEhAdmin(false);
      setPodeCelular(true);
      setPodeVerOutros(false);
      setPodeDesconto(false);
      setPodeProdutos(false);
      setPodeEstoque(false);
      setPodeFiado(false);
    }
    setErro(null);
  }, [usuarioEdicao, isOpen]);

  // Se marcar/desmarcar Admin
  const handleToggleAdmin = (checked: boolean) => {
    if (ehOwner) return; // Owner não altera
    setEhAdmin(checked);
    if (checked) {
      setPodeCelular(true);
      setPodeVerOutros(true);
      setPodeDesconto(true);
      setPodeProdutos(true);
      setPodeEstoque(true);
      setPodeFiado(true);
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
        : (ehAdmin ? 'admin' : 'comum');

      const payload: any = {
        loja_id: lojaId,
        nome_completo: nome.trim(),
        email: email.trim().toLowerCase(),
        perfil: perfilFinal,
        pode_uso_celular_pessoal: ehOwner ? true : (ehAdmin ? true : podeCelular),
        pode_ver_transacoes_outros: ehOwner ? true : (ehAdmin ? true : podeVerOutros),
        pode_dar_desconto: ehOwner ? true : (ehAdmin ? true : podeDesconto),
        pode_cadastrar_alterar_produtos: ehOwner ? true : (ehAdmin ? true : podeProdutos),
        pode_gerenciar_estoque: ehOwner ? true : (ehAdmin ? true : podeEstoque),
        pode_ativar_fiado: ehOwner ? true : (ehAdmin ? true : podeFiado),
        pode_ver_preco_custo: ehOwner || ehAdmin,
        pode_exportar_relatorios: ehOwner || ehAdmin,
        pode_editar_vendas_passadas: ehOwner || ehAdmin,
        ativo: ehOwner ? true : ativo
      };

      if (senha.trim()) {
        payload.senha_hash = senha.trim();
      }

      if (usuarioEdicao?.id) {
        // Atualizar usuário existente
        const { error: errUpdate } = await supabase
          .from('usuarios_loja')
          .update(payload)
          .eq('id', usuarioEdicao.id);

        if (errUpdate) throw errUpdate;
      } else {
        // Inserir novo usuário
        const { error: errInsert } = await supabase
          .from('usuarios_loja')
          .insert([payload]);

        if (errInsert) throw errInsert;
      }

      onSalvo();
      onClose();
    } catch (err: any) {
      console.error('Erro ao salvar usuário:', err);
      setErro(err.message || 'Erro ao gravar usuário no banco de dados.');
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluirUsuario = async () => {
    if (!usuarioEdicao || ehOwner) return;
    const confirmou = window.confirm(`Deseja realmente remover o colaborador "${usuarioEdicao.nome_completo}"? Esta ação removerá os acessos dele.`);
    if (!confirmou) return;

    try {
      setSalvando(true);
      const { error: errDel } = await supabase
        .from('usuarios_loja')
        .delete()
        .eq('id', usuarioEdicao.id);

      if (errDel) throw errDel;

      onSalvo();
      onClose();
    } catch (err: any) {
      alert(`Não foi possível excluir o usuário: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  if (!isOpen) return null;

  const metricas = usuarioEdicao?.metricas;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-end z-50 animate-in fade-in">
      <div className="bg-slate-900 border-l border-slate-800 w-full max-w-2xl h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        
        {/* CABEÇALHO DO DRAWER */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <h3 className="font-black text-lg text-slate-100 flex items-center gap-2">
              <span>{usuarioEdicao ? usuarioEdicao.nome_completo : 'Adicionar Usuário'}</span>
            </h3>

            {ehOwner && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-teal-500/15 text-teal-300 border border-teal-500/30 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                <Crown className="w-3 h-3" />
                OWNER
              </span>
            )}

            {ehAdmin && !ehOwner && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                <Shield className="w-3 h-3" />
                ADMIN
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Switch de Inativar Usuário no cabeçalho (Conforme telas de referência) */}
            {usuarioEdicao && (
              <div className="flex items-center gap-2 pr-2 border-r border-slate-800">
                <span className="text-[11px] font-semibold text-slate-300 hidden sm:inline">
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
                  <div className={`w-8 h-4.5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-emerald-500 ${ehOwner ? 'opacity-60 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* FAIXA DE INDICADORES DE VENDAS (HOJE, ONTEM, ESTA SEMANA, ESTE MÊS) */}
        {usuarioEdicao && metricas && (
          <div className="bg-slate-950/60 border-b border-slate-800/80 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-2.5 space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Hoje</span>
              <span className="text-slate-200 font-bold block">{metricas.hoje_vendas} vendas</span>
              <span className="text-[11px] text-emerald-400 font-semibold block">
                R$ {metricas.hoje_faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-2.5 space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Ontem</span>
              <span className="text-slate-200 font-bold block">{metricas.ontem_vendas} vendas</span>
              <span className="text-[11px] text-slate-300 font-semibold block">
                R$ {metricas.ontem_faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-2.5 space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Esta Semana</span>
              <span className="text-slate-200 font-bold block">{metricas.semana_vendas} vendas</span>
              <span className="text-[11px] text-emerald-400 font-semibold block">
                R$ {metricas.semana_faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-2.5 space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Este Mês</span>
              <span className="text-slate-200 font-bold block">{metricas.mes_vendas} vendas</span>
              <span className="text-[11px] text-emerald-400 font-semibold block">
                R$ {metricas.mes_faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {/* MENSAGEM DE ERRO (SE HOUVER) */}
        {erro && (
          <div className="m-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{erro}</span>
          </div>
        )}

        {/* FORMULÁRIO UNIFICADO EM TELA ÚNICA */}
        <form onSubmit={handleSalvarUsuario} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* ========================================================================= */}
          {/* SEÇÃO 1: DADOS DO USUÁRIO & ACESSO                                        */}
          {/* ========================================================================= */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-sm">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>Dados do usuário</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Nome *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: João Roberto ou Maria Silva"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Email *</label>
                <input
                  type="email"
                  required
                  placeholder="Ex: jroberto@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none transition"
                />
              </div>
            </div>

            {/* Campo de Senha */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-semibold text-slate-300">
                {usuarioEdicao ? 'Redefinir Senha (Opcional)' : 'Senha de Acesso * (Mínimo 6 dígitos)'}
              </label>
              <div className="relative">
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  placeholder={usuarioEdicao ? 'Deixe em branco para manter a senha atual' : '••••••••'}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-slate-100 focus:outline-none transition font-mono"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                >
                  {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <span className="text-[11px] text-slate-400 block">
                Esta senha é utilizada para entrar no HUBI Web e no aplicativo PDV.
              </span>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SEÇÃO 2: PERMISSÕES & CONTROLE DE ACESSO                                  */}
          {/* ========================================================================= */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Permissões de Acesso</span>
              </h4>

              {ehOwner && (
                <span className="text-[10px] text-teal-400 font-bold bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-lg flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Imutável (Proprietário)
                </span>
              )}
            </div>

            {/* AVISO EXPLICATIVO PARA OWNER */}
            {ehOwner ? (
              <div className="p-3.5 bg-teal-500/10 border border-teal-500/20 rounded-2xl flex items-start gap-3 text-xs text-teal-200">
                <Crown className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold block text-teal-300">Proprietário da Conta</span>
                  <p className="text-[11px] text-teal-300/80 leading-relaxed">
                    Como proprietário desta conta, você possui acesso total e irrestrito a todas as funcionalidades do Hubi. Todas as permissões permanecem ativas e não podem ser revogadas.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3.5 bg-slate-800/60 border border-slate-700/60 rounded-2xl text-[11px] text-slate-300 leading-relaxed">
                <p>
                  <strong>Por padrão</strong>, todos os usuários têm acesso a: lançar pedidos e vendas, ver seus próprios pedidos, ver e cadastrar clientes e ver os produtos.
                </p>
              </div>
            )}

            {/* LISTA DE SWITCHES GRANULARES */}
            <div className="space-y-3 pt-1">
              
              {/* 1. Administrador */}
              <div className="flex items-start justify-between gap-3 p-3 rounded-2xl bg-slate-800/30 border border-slate-800/80 hover:bg-slate-800/60 transition">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-bold text-slate-200">Administrador</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
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
                  <div className={`w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 ${ehOwner ? 'opacity-80 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>

              {/* 2. Permitir uso em celular pessoal */}
              <div className="flex items-start justify-between gap-3 p-3 rounded-2xl bg-slate-800/30 border border-slate-800/80 hover:bg-slate-800/60 transition">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-bold text-slate-200">Permitir uso em celular pessoal</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
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
                  <div className={`w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 ${(ehOwner || ehAdmin) ? 'opacity-80 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>

              {/* 3. Ver transações de outros usuários */}
              <div className="flex items-start justify-between gap-3 p-3 rounded-2xl bg-slate-800/30 border border-slate-800/80 hover:bg-slate-800/60 transition">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-bold text-slate-200">Ver transações de outros usuários</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
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
                  <div className={`w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 ${(ehOwner || ehAdmin) ? 'opacity-80 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>

              {/* 4. Dar desconto em vendas */}
              <div className="flex items-start justify-between gap-3 p-3 rounded-2xl bg-slate-800/30 border border-slate-800/80 hover:bg-slate-800/60 transition">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-bold text-slate-200">Dar desconto em vendas</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
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
                  <div className={`w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 ${(ehOwner || ehAdmin) ? 'opacity-80 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>

              {/* 5. Cadastrar/Alterar produtos */}
              <div className="flex items-start justify-between gap-3 p-3 rounded-2xl bg-slate-800/30 border border-slate-800/80 hover:bg-slate-800/60 transition">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-bold text-slate-200">Cadastrar/Alterar produtos</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
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
                  <div className={`w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 ${(ehOwner || ehAdmin) ? 'opacity-80 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>

              {/* 6. Gerenciar estoque */}
              <div className="flex items-start justify-between gap-3 p-3 rounded-2xl bg-slate-800/30 border border-slate-800/80 hover:bg-slate-800/60 transition">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-bold text-slate-200">Gerenciar estoque</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
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
                  <div className={`w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 ${(ehOwner || ehAdmin) ? 'opacity-80 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>

              {/* 7. Ativar Fiado */}
              <div className="flex items-start justify-between gap-3 p-3 rounded-2xl bg-slate-800/30 border border-slate-800/80 hover:bg-slate-800/60 transition">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-bold text-slate-200">Ativar Fiado</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
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
                  <div className={`w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 ${(ehOwner || ehAdmin) ? 'opacity-80 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>

            </div>
          </div>

        </form>

        {/* RODAPÉ DO DRAWER COM AÇÕES */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/95 flex items-center justify-between gap-3 sticky bottom-0 z-10">
          {usuarioEdicao && !ehOwner ? (
            <button
              type="button"
              onClick={handleExcluirUsuario}
              disabled={salvando}
              className="px-3.5 py-2.5 rounded-xl border border-rose-500/30 hover:bg-rose-500/20 text-rose-400 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
              title="Excluir este usuário"
            >
              <Trash2 className="w-4 h-4" />
              <span>Excluir</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition cursor-pointer"
            >
              Cancelar
            </button>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSalvarUsuario}
              disabled={salvando}
              className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs sm:text-sm shadow-lg shadow-emerald-500/25 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {salvando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Gravando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
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
