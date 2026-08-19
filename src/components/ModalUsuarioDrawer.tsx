import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronLeft,
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
  Trash2
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
  const [etapa, setEtapa] = useState<number>(1);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  // Campos do formulário
  const [nome, setNome] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [senha, setSenha] = useState<string>('');
  const [mostrarSenha, setMostrarSenha] = useState<boolean>(false);

  // Permissões
  const [ehAdmin, setEhAdmin] = useState<boolean>(false);
  const [podeCelular, setPodeCelular] = useState<boolean>(true);
  const [podeVerOutros, setPodeVerOutros] = useState<boolean>(false);
  const [podeDesconto, setPodeDesconto] = useState<boolean>(false);
  const [podeProdutos, setPodeProdutos] = useState<boolean>(false);
  const [podeEstoque, setPodeEstoque] = useState<boolean>(false);
  const [podeFiado, setPodeFiado] = useState<boolean>(false);

  useEffect(() => {
    if (usuarioEdicao) {
      setNome(usuarioEdicao.nome_completo || '');
      setEmail(usuarioEdicao.email || '');
      setSenha('');
      setEhAdmin(usuarioEdicao.perfil === 'admin' || usuarioEdicao.perfil === 'owner');
      setPodeCelular(usuarioEdicao.pode_uso_celular_pessoal ?? true);
      setPodeVerOutros(usuarioEdicao.pode_ver_transacoes_outros ?? false);
      setPodeDesconto(usuarioEdicao.pode_dar_desconto ?? false);
      setPodeProdutos(usuarioEdicao.pode_cadastrar_alterar_produtos ?? false);
      setPodeEstoque(usuarioEdicao.pode_gerenciar_estoque ?? false);
      setPodeFiado(usuarioEdicao.pode_ativar_fiado ?? false);
    } else {
      setNome('');
      setEmail('');
      setSenha('');
      setEhAdmin(false);
      setPodeCelular(true);
      setPodeVerOutros(false);
      setPodeDesconto(false);
      setPodeProdutos(false);
      setPodeEstoque(false);
      setPodeFiado(false);
    }
    setEtapa(1);
    setErro(null);
  }, [usuarioEdicao, isOpen]);

  // Se marcar como Admin, ativa todas as permissões
  const handleToggleAdmin = (checked: boolean) => {
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

  const handleAvancarEtapa1 = () => {
    setErro(null);
    if (!nome.trim()) {
      setErro('Por favor, informe o nome completo do usuário.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErro('Por favor, informe um endereço de e-mail válido.');
      return;
    }
    setEtapa(2);
  };

  const handleAvancarEtapa2 = () => {
    setErro(null);
    setEtapa(3);
  };

  const handleSalvarUsuario = async () => {
    setErro(null);

    // Validação de senha
    if (!usuarioEdicao && (!senha || senha.length < 6)) {
      setErro('A senha deve conter no mínimo 6 caracteres.');
      return;
    }
    if (usuarioEdicao && senha && senha.length < 6) {
      setErro('A nova senha deve conter no mínimo 6 caracteres.');
      return;
    }

    try {
      setSalvando(true);

      const perfilFinal: PerfilUsuario = usuarioEdicao?.perfil === 'owner' 
        ? 'owner' 
        : (ehAdmin ? 'admin' : 'comum');

      const payload: any = {
        loja_id: lojaId,
        nome_completo: nome.trim(),
        email: email.trim().toLowerCase(),
        perfil: perfilFinal,
        pode_uso_celular_pessoal: podeCelular,
        pode_ver_transacoes_outros: podeVerOutros,
        pode_dar_desconto: podeDesconto,
        pode_cadastrar_alterar_produtos: podeProdutos,
        pode_gerenciar_estoque: podeEstoque,
        pode_ativar_fiado: podeFiado,
        pode_ver_preco_custo: ehAdmin || perfilFinal === 'owner',
        pode_exportar_relatorios: ehAdmin || perfilFinal === 'owner',
        pode_editar_vendas_passadas: ehAdmin || perfilFinal === 'owner',
        ativo: true
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
    if (!usuarioEdicao || usuarioEdicao.perfil === 'owner') return;
    const confirmou = window.confirm(`Deseja realmente remover o usuário "${usuarioEdicao.nome_completo}"? Esta ação não pode ser desfeita.`);
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

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-end z-50 animate-in fade-in">
      <div className="bg-slate-900 border-l border-slate-800 w-full max-w-md h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        
        {/* CABEÇALHO DO DRAWER */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2">
            {etapa > 1 && (
              <button
                type="button"
                onClick={() => setEtapa(etapa - 1)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                title="Voltar etapa anterior"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <h3 className="font-bold text-base text-slate-100">
              {usuarioEdicao ? 'Editar usuário' : 'Adicionar usuário'}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MENSAGEM DE ERRO (SE HOUVER) */}
        {erro && (
          <div className="m-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{erro}</span>
          </div>
        )}

        {/* CONTEÚDO PRINCIPAL (POR ETAPAS) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {/* ========================================================================= */}
          {/* ETAPA 1: NOME E E-MAIL                                                    */}
          {/* ========================================================================= */}
          {etapa === 1 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Nome *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: José Carlos ou Maria Silva"
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
                  placeholder="Ex: jcarlos@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none transition"
                />
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ETAPA 2: PERMISSÕES GRANULARES COM SWITCHES                               */}
          {/* ========================================================================= */}
          {etapa === 2 && (
            <div className="space-y-4 animate-in fade-in">
              {/* Box Informativo */}
              <div className="p-3.5 bg-slate-800/60 border border-slate-700/60 rounded-2xl text-[11px] text-slate-300 leading-relaxed">
                <p>
                  <strong>Por padrão</strong>, todos os usuários têm acesso a: lançar pedidos e vendas, ver seus próprios pedidos, ver e cadastrar clientes e ver os produtos.
                </p>
              </div>

              <h4 className="text-xs font-bold text-slate-300">
                Se precisar, adicione outras permissões para <span className="text-emerald-400">{nome || 'o usuário'}</span>:
              </h4>

              {/* LISTA DE SWITCHES */}
              <div className="space-y-3.5">
                
                {/* 1. Administrador */}
                <div className="flex items-start justify-between gap-3 p-2.5 rounded-xl hover:bg-slate-800/40 transition">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-xs font-bold text-slate-200">Administrador</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight">
                      Dá acesso a todas as funcionalidades do Hubi - exceto à gestão da assinatura, disponível apenas para o proprietário da conta.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={ehAdmin}
                      onChange={(e) => handleToggleAdmin(e.target.checked)}
                      disabled={usuarioEdicao?.perfil === 'owner'}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* 2. Permitir uso em celular pessoal */}
                <div className="flex items-start justify-between gap-3 p-2.5 rounded-xl hover:bg-slate-800/40 transition">
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
                      checked={podeCelular}
                      onChange={(e) => setPodeCelular(e.target.checked)}
                      disabled={ehAdmin}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* 3. Ver transações de outros usuários */}
                <div className="flex items-start justify-between gap-3 p-2.5 rounded-xl hover:bg-slate-800/40 transition">
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
                      checked={podeVerOutros}
                      onChange={(e) => setPodeVerOutros(e.target.checked)}
                      disabled={ehAdmin}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* 4. Dar desconto em vendas */}
                <div className="flex items-start justify-between gap-3 p-2.5 rounded-xl hover:bg-slate-800/40 transition">
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
                      checked={podeDesconto}
                      onChange={(e) => setPodeDesconto(e.target.checked)}
                      disabled={ehAdmin}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* 5. Cadastrar/Alterar produtos */}
                <div className="flex items-start justify-between gap-3 p-2.5 rounded-xl hover:bg-slate-800/40 transition">
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
                      checked={podeProdutos}
                      onChange={(e) => setPodeProdutos(e.target.checked)}
                      disabled={ehAdmin}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* 6. Gerenciar estoque */}
                <div className="flex items-start justify-between gap-3 p-2.5 rounded-xl hover:bg-slate-800/40 transition">
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
                      checked={podeEstoque}
                      onChange={(e) => setPodeEstoque(e.target.checked)}
                      disabled={ehAdmin}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* 7. Ativar Fiado */}
                <div className="flex items-start justify-between gap-3 p-2.5 rounded-xl hover:bg-slate-800/40 transition">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-bold text-slate-200">Ativar Fiado</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight">
                      Permite ativar vendas a crédito (fiado) para clientes.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={podeFiado}
                      onChange={(e) => setPodeFiado(e.target.checked)}
                      disabled={ehAdmin}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ETAPA 3: SENHA DE ACESSO                                                  */}
          {/* ========================================================================= */}
          {etapa === 3 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  {usuarioEdicao ? 'Nova Senha (Opcional)' : 'Senha * (Mais de 6 dígitos)'}
                </label>
                <div className="relative">
                  <input
                    type={mostrarSenha ? 'text' : 'password'}
                    placeholder={usuarioEdicao ? 'Deixe em branco para manter a atual' : '••••••••'}
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
                <span className="text-[10px] text-slate-500 block">
                  A senha será utilizada pelo colaborador para acessar o HUBI Web e PDV.
                </span>
              </div>
            </div>
          )}

        </div>

        {/* RODAPÉ DO DRAWER COM BOTÕES DE AÇÃO */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between gap-2">
          {usuarioEdicao && usuarioEdicao.perfil !== 'owner' ? (
            <button
              type="button"
              onClick={handleExcluirUsuario}
              disabled={salvando}
              className="p-2.5 rounded-xl border border-rose-500/30 hover:bg-rose-500/20 text-rose-400 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
              title="Excluir este usuário"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Excluir</span>
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
            {etapa === 1 && (
              <button
                type="button"
                onClick={handleAvancarEtapa1}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition cursor-pointer"
              >
                Avançar
              </button>
            )}

            {etapa === 2 && (
              <button
                type="button"
                onClick={handleAvancarEtapa2}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition cursor-pointer"
              >
                Avançar
              </button>
            )}

            {etapa === 3 && (
              <button
                type="button"
                onClick={handleSalvarUsuario}
                disabled={salvando}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
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
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
