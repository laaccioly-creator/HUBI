// HUBI - Modal de Gerenciamento de Dados Cadastrais e Endereços do Cliente no Catálogo Online
import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Phone,
  Mail,
  MapPin,
  Plus,
  Trash2,
  Edit2,
  Check,
  Star,
  Loader2,
  AlertCircle,
  Save,
  Building,
  Home
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';
import { Cliente } from '../../types';
import { ClienteEndereco, NovoEnderecoFormInput } from '../../types/shipping';
import { ShippingOrchestrator } from '../../services/shippingOrchestrator';

export const ESTADOS_BRASIL = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

interface ModalMeusDadosClienteProps {
  isOpen: boolean;
  onClose: () => void;
  cliente: Cliente | null;
  lojaId: string;
  slugKey?: string;
  onClienteAtualizado: (clienteAtualizado: Cliente) => void;
}

export const ModalMeusDadosCliente: React.FC<ModalMeusDadosClienteProps> = ({
  isOpen,
  onClose,
  cliente,
  lojaId,
  slugKey,
  onClienteAtualizado
}) => {
  const { tema } = useTheme();
  const isDark = tema === 'dark';

  const [abaAtiva, setAbaAtiva] = useState<'dados' | 'enderecos'>('dados');

  // Dados Pessoais Form
  const [nome, setNome] = useState<string>('');
  const [whatsapp, setWhatsapp] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [salvandoDados, setSalvandoDados] = useState<boolean>(false);
  const [mensagemSucessoDados, setMensagemSucessoDados] = useState<string | null>(null);

  // Endereços Form e Lista
  const [enderecos, setEnderecos] = useState<ClienteEndereco[]>([]);
  const [carregandoEnderecos, setCarregandoEnderecos] = useState<boolean>(false);
  const [exibirFormEndereco, setExibirFormEndereco] = useState<boolean>(false);
  const [enderecoEditandoId, setEnderecoEditandoId] = useState<string | null>(null);

  const [novoIdentificador, setNovoIdentificador] = useState<string>('Casa');
  const [novoCep, setNovoCep] = useState<string>('');
  const [novoLogradouro, setNovoLogradouro] = useState<string>('');
  const [novoNumero, setNovoNumero] = useState<string>('');
  const [novoComplemento, setNovoComplemento] = useState<string>('');
  const [novoBairro, setNovoBairro] = useState<string>('');
  const [novoCidade, setNovoCidade] = useState<string>('');
  const [novoUf, setNovoUf] = useState<string>('CE');
  const [novoIsPrincipal, setNovoIsPrincipal] = useState<boolean>(false);

  const [buscandoCep, setBuscandoCep] = useState<boolean>(false);
  const [salvandoEndereco, setSalvandoEndereco] = useState<boolean>(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [sucessoMsg, setSucessoMsg] = useState<string | null>(null);

  // Sincronizar dados do cliente ao abrir
  useEffect(() => {
    if (isOpen && cliente) {
      setNome(cliente.nome || '');
      setWhatsapp(cliente.whatsapp || cliente.telefone || '');
      setEmail(cliente.email || '');
      setErroMsg(null);
      setSucessoMsg(null);
      setMensagemSucessoDados(null);
      carregarEnderecos(cliente.id);
    }
  }, [isOpen, cliente?.id]);

  const carregarEnderecos = async (cliId: string) => {
    if (!cliId) return;
    setCarregandoEnderecos(true);
    try {
      const lista = await ShippingOrchestrator.listarEnderecosCliente(cliId);
      setEnderecos(lista);
    } catch (err) {
      console.warn('Erro ao carregar endereços do cliente:', err);
    } finally {
      setCarregandoEnderecos(false);
    }
  };

  const handleSalvarDadosPessoais = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliente?.id || !lojaId) return;

    const nomeTrim = nome.trim();
    const telLimpo = whatsapp.replace(/\D/g, '');
    const emailTrim = email.trim();

    if (!nomeTrim) {
      setErroMsg('Por favor, informe seu Nome Completo.');
      return;
    }

    if (telLimpo.length < 10) {
      setErroMsg('Informe um número de WhatsApp válido com DDD (mínimo 10 dígitos).');
      return;
    }

    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      setErroMsg('Por favor, informe um endereço de e-mail válido.');
      return;
    }

    setSalvandoDados(true);
    setErroMsg(null);
    setMensagemSucessoDados(null);

    try {
      const { data, error } = await supabase
        .from('clientes')
        .update({
          nome: nomeTrim,
          whatsapp: telLimpo,
          telefone: telLimpo,
          email: emailTrim || null,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', cliente.id)
        .eq('loja_id', lojaId)
        .select('*')
        .single();

      if (error) throw error;

      const clienteAtualizado = { ...cliente, ...data };

      // Atualizar cache de sessão
      const storageKey = slugKey ? `hubi_cliente_catalogo_${slugKey}` : `hubi_cliente_catalogo_${lojaId}`;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(clienteAtualizado));
        localStorage.setItem(storageKey, JSON.stringify(clienteAtualizado));
      } catch {}

      onClienteAtualizado(clienteAtualizado);
      setMensagemSucessoDados('Seus dados foram atualizados com sucesso!');
      setTimeout(() => setMensagemSucessoDados(null), 3000);
    } catch (err: any) {
      console.error('Erro ao atualizar dados pessoais:', err);
      setErroMsg(err.message || 'Erro ao salvar suas alterações. Tente novamente.');
    } finally {
      setSalvandoDados(false);
    }
  };

  const handleBuscarCep = async (cepInput: string) => {
    const cepLimpo = cepInput.replace(/\D/g, '');
    setNovoCep(cepInput);
    if (cepLimpo.length !== 8) return;

    setBuscandoCep(true);
    setErroMsg(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const dados = await res.json();
      if (!dados.erro) {
        setNovoLogradouro(dados.logradouro || '');
        setNovoBairro(dados.bairro || '');
        setNovoCidade(dados.localidade || '');
        setNovoUf(dados.uf ? dados.uf.toUpperCase() : 'CE');
      } else {
        setErroMsg('CEP não localizado. Preencha os campos manualmente.');
      }
    } catch {
      setErroMsg('Não foi possível consultar o CEP automaticamente. Preencha manualmente.');
    } finally {
      setBuscandoCep(false);
    }
  };

  const limparFormEndereco = () => {
    setNovoIdentificador('Casa');
    setNovoCep('');
    setNovoLogradouro('');
    setNovoNumero('');
    setNovoComplemento('');
    setNovoBairro('');
    setNovoCidade('');
    setNovoUf('CE');
    setNovoIsPrincipal(false);
    setEnderecoEditandoId(null);
    setExibirFormEndereco(false);
  };

  const handleAbrirEditarEndereco = (end: ClienteEndereco) => {
    setEnderecoEditandoId(end.id);
    setNovoIdentificador(end.identificador || 'Casa');
    setNovoCep(end.cep || '');
    setNovoLogradouro(end.logradouro || '');
    setNovoNumero(end.numero || '');
    setNovoComplemento(end.complemento || '');
    setNovoBairro(end.bairro || '');
    setNovoCidade(end.cidade || '');
    setNovoUf(end.uf || 'CE');
    setNovoIsPrincipal(Boolean(end.is_principal));
    setExibirFormEndereco(true);
    setErroMsg(null);
  };

  const handleSalvarEndereco = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliente?.id) return;

    const cepLimpo = novoCep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) {
      setErroMsg('Informe um CEP válido com 8 dígitos.');
      return;
    }
    if (!novoLogradouro.trim()) {
      setErroMsg('Informe a rua / logradouro.');
      return;
    }
    if (!novoNumero.trim()) {
      setErroMsg('Informe o número do endereço.');
      return;
    }
    if (!novoBairro.trim()) {
      setErroMsg('Informe o bairro.');
      return;
    }
    if (!novoCidade.trim()) {
      setErroMsg('Informe a cidade.');
      return;
    }

    setSalvandoEndereco(true);
    setErroMsg(null);
    setSucessoMsg(null);

    try {
      const payloadInput: NovoEnderecoFormInput = {
        identificador: novoIdentificador.trim() || 'Principal',
        cep: cepLimpo,
        logradouro: novoLogradouro.trim(),
        numero: novoNumero.trim(),
        complemento: novoComplemento.trim() || undefined,
        bairro: novoBairro.trim(),
        cidade: novoCidade.trim(),
        uf: novoUf.trim().toUpperCase(),
        is_principal: novoIsPrincipal || enderecos.length === 0
      };

      await ShippingOrchestrator.salvarNovoEnderecoCliente(
        cliente.id,
        payloadInput,
        enderecoEditandoId
      );

      limparFormEndereco();
      await carregarEnderecos(cliente.id);
      setSucessoMsg(enderecoEditandoId ? 'Endereço atualizado com sucesso!' : 'Novo endereço adicionado!');
      setTimeout(() => setSucessoMsg(null), 3000);
    } catch (err: any) {
      console.error('Erro ao salvar endereço:', err);
      setErroMsg(err.message || 'Erro ao registrar endereço. Verifique os dados.');
    } finally {
      setSalvandoEndereco(false);
    }
  };

  const handleDefinirPrincipal = async (end: ClienteEndereco) => {
    if (!cliente?.id || end.is_principal) return;

    try {
      await supabase
        .from('cliente_enderecos')
        .update({ is_principal: false })
        .eq('cliente_id', cliente.id);

      if (end.id && !end.id.startsWith('cli-') && !end.id.startsWith('end-')) {
        await supabase
          .from('cliente_enderecos')
          .update({ is_principal: true })
          .eq('id', end.id)
          .eq('cliente_id', cliente.id);
      }

      // Atualiza também os dados cadastrais primários do cliente
      await supabase
        .from('clientes')
        .update({
          endereco_cep: end.cep,
          endereco_logradouro: end.logradouro,
          endereco_numero: end.numero,
          endereco_complemento: end.complemento || null,
          endereco_bairro: end.bairro,
          endereco_cidade: end.cidade,
          endereco_estado: end.uf
        })
        .eq('id', cliente.id)
        .eq('loja_id', lojaId);

      await carregarEnderecos(cliente.id);
      setSucessoMsg('Endereço principal atualizado!');
      setTimeout(() => setSucessoMsg(null), 3000);
    } catch (err: any) {
      console.error('Erro ao definir endereço principal:', err);
      setErroMsg('Erro ao alterar endereço principal.');
    }
  };

  const handleExcluirEndereco = async (end: ClienteEndereco) => {
    if (!cliente?.id) return;
    if (enderecos.length <= 1) {
      setErroMsg('Você deve manter pelo menos um endereço cadastrado.');
      return;
    }
    if (!window.confirm(`Deseja realmente remover o endereço "${end.identificador || end.logradouro}"?`)) {
      return;
    }

    try {
      if (end.id && !end.id.startsWith('cli-') && !end.id.startsWith('end-')) {
        const { error } = await supabase
          .from('cliente_enderecos')
          .delete()
          .eq('id', end.id)
          .eq('cliente_id', cliente.id);

        if (error) throw error;
      }

      // Se apagou o que era principal, elege o primeiro restante como principal
      if (end.is_principal && enderecos.length > 1) {
        const proximo = enderecos.find(e => e.id !== end.id);
        if (proximo && proximo.id && !proximo.id.startsWith('cli-') && !proximo.id.startsWith('end-')) {
          await supabase
            .from('cliente_enderecos')
            .update({ is_principal: true })
            .eq('id', proximo.id)
            .eq('cliente_id', cliente.id);
        }
      }

      await carregarEnderecos(cliente.id);
      setSucessoMsg('Endereço excluído com sucesso!');
      setTimeout(() => setSucessoMsg(null), 3000);
    } catch (err: any) {
      console.error('Erro ao excluir endereço:', err);
      setErroMsg('Não foi possível remover este endereço.');
    }
  };

  if (!isOpen || !cliente) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[80] animate-in fade-in">
      <div className={`border rounded-3xl w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col ${
        isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20 shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Meus Dados</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gerencie seus dados pessoais e endereços de entrega
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex items-center gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => {
              setAbaAtiva('dados');
              setErroMsg(null);
            }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              abaAtiva === 'dados'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Dados Pessoais</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAbaAtiva('enderecos');
              setErroMsg(null);
            }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              abaAtiva === 'enderecos'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Endereços ({enderecos.length})</span>
          </button>
        </div>

        {/* Alertas */}
        {erroMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{erroMsg}</span>
          </div>
        )}
        {(sucessoMsg || mensagemSucessoDados) && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 shrink-0">
            <Check className="w-4 h-4 shrink-0" />
            <span>{sucessoMsg || mensagemSucessoDados}</span>
          </div>
        )}

        {/* Conteúdo com Scroll */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-0.5">
          {/* ABA DADOS PESSOAIS */}
          {abaAtiva === 'dados' && (
            <form onSubmit={handleSalvarDadosPessoais} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Seu nome completo"
                  className={`w-full px-3.5 py-2.5 rounded-2xl border text-xs font-semibold focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition ${
                    isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  WhatsApp / Celular (com DDD)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="(00) 00000-0000"
                    className={`w-full pl-10 pr-3.5 py-2.5 rounded-2xl border text-xs font-semibold focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition ${
                      isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Utilizado para notificações e atualizações de entrega dos seus pedidos.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="exemplo@email.com"
                    className={`w-full pl-10 pr-3.5 py-2.5 rounded-2xl border text-xs font-semibold focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition ${
                      isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Utilizado para envio de recibos e comunicações do pedido.
                </p>
              </div>

              <button
                type="submit"
                disabled={salvandoDados}
                className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer active:scale-98"
              >
                {salvandoDados ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Salvar Dados Pessoais</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* ABA GESTÃO DE ENDEREÇOS */}
          {abaAtiva === 'enderecos' && (
            <div className="space-y-3">
              {/* Botão Adicionar Endereço */}
              {!exibirFormEndereco && (
                <button
                  type="button"
                  onClick={() => {
                    limparFormEndereco();
                    setExibirFormEndereco(true);
                  }}
                  className="w-full py-2.5 px-3 rounded-2xl border border-dashed border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/15 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98"
                >
                  <Plus className="w-4 h-4" />
                  <span>Cadastrar Novo Endereço</span>
                </button>
              )}

              {/* Formulário Novo / Editar Endereço */}
              {exibirFormEndereco && (
                <form onSubmit={handleSalvarEndereco} className={`p-4 rounded-2xl border space-y-3 ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {enderecoEditandoId ? 'Editar Endereço' : 'Novo Endereço de Entrega'}
                    </span>
                    <button
                      type="button"
                      onClick={limparFormEndereco}
                      className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Identificador
                      </label>
                      <input
                        type="text"
                        value={novoIdentificador}
                        onChange={(e) => setNovoIdentificador(e.target.value)}
                        placeholder="Casa, Trabalho..."
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 ${
                          isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        CEP (com busca)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={novoCep}
                          onChange={(e) => handleBuscarCep(e.target.value)}
                          placeholder="00000-000"
                          maxLength={9}
                          className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 ${
                            isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                          required
                        />
                        {buscandoCep && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-500" />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Rua / Logradouro
                      </label>
                      <input
                        type="text"
                        value={novoLogradouro}
                        onChange={(e) => setNovoLogradouro(e.target.value)}
                        placeholder="Nome da rua ou avenida"
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 ${
                          isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Número
                      </label>
                      <input
                        type="text"
                        value={novoNumero}
                        onChange={(e) => setNovoNumero(e.target.value)}
                        placeholder="Nº"
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 ${
                          isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Complemento (opcional)
                      </label>
                      <input
                        type="text"
                        value={novoComplemento}
                        onChange={(e) => setNovoComplemento(e.target.value)}
                        placeholder="Apto, Bloco, Casa B..."
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 ${
                          isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Bairro
                      </label>
                      <input
                        type="text"
                        value={novoBairro}
                        onChange={(e) => setNovoBairro(e.target.value)}
                        placeholder="Bairro"
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 ${
                          isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Cidade
                      </label>
                      <input
                        type="text"
                        value={novoCidade}
                        onChange={(e) => setNovoCidade(e.target.value)}
                        placeholder="Cidade"
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 ${
                          isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        UF
                      </label>
                      <select
                        value={novoUf}
                        onChange={(e) => setNovoUf(e.target.value)}
                        className={`w-full px-2 py-2 rounded-xl border text-xs focus:outline-none focus:border-emerald-500 font-bold ${
                          isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      >
                        {ESTADOS_BRASIL.map(uf => (
                          <option key={uf} value={uf}>{uf}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={novoIsPrincipal}
                      onChange={(e) => setNovoIsPrincipal(e.target.checked)}
                      className="w-4 h-4 rounded-md text-emerald-600 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:ring-emerald-500 accent-emerald-500 cursor-pointer"
                    />
                    <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">
                      Definir como endereço de entrega padrão
                    </span>
                  </label>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={limparFormEndereco}
                      className="py-2.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={salvandoEndereco}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                    >
                      {salvandoEndereco ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Salvando...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>{enderecoEditandoId ? 'Atualizar Endereço' : 'Salvar Endereço'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Lista de Endereços */}
              {carregandoEnderecos ? (
                <div className="p-8 text-center text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                  <span className="text-xs">Carregando seus endereços...</span>
                </div>
              ) : enderecos.length === 0 ? (
                <div className="p-6 text-center text-slate-400 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl">
                  <MapPin className="w-6 h-6 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">Nenhum endereço cadastrado ainda.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {enderecos.map((end) => (
                    <div
                      key={end.id}
                      className={`p-3.5 rounded-2xl border transition flex items-start justify-between gap-3 ${
                        end.is_principal
                          ? 'border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-500/10'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950'
                      }`}
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1">
                            {end.identificador?.toLowerCase().includes('trabalho') ? (
                              <Building className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <Home className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            {end.identificador || 'Endereço'}
                          </span>
                          {end.is_principal && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <Star className="w-2.5 h-2.5 fill-current" />
                              Padrão
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-tight">
                          {end.logradouro}, {end.numero}
                          {end.complemento ? ` - ${end.complemento}` : ''}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {end.bairro} • {end.cidade}/{end.uf} • CEP: {end.cep}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 pt-0.5">
                        {!end.is_principal && (
                          <button
                            type="button"
                            onClick={() => handleDefinirPrincipal(end)}
                            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-500 transition cursor-pointer"
                            title="Tornar este endereço padrão"
                          >
                            <Star className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleAbrirEditarEndereco(end)}
                          className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                          title="Editar endereço"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {enderecos.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleExcluirEndereco(end)}
                            className="p-1.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-500 transition cursor-pointer"
                            title="Excluir endereço"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
