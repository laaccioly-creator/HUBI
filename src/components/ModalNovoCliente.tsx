import React, { useState } from 'react';
import {
  X,
  User,
  Phone,
  Mail,
  Calendar,
  MapPin,
  FileText,
  DollarSign,
  Navigation,
  HelpCircle,
  Check,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  MessageCircle,
  Lock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Cliente, TabelaPreco } from '../types';

interface ModalNovoClienteProps {
  isOpen: boolean;
  onClose: () => void;
  onClienteCadastrado: (cliente: Cliente) => void;
  clienteEditar?: Cliente | null;
}

const ESTADOS_BRASIL = [
  { sigla: 'AC', nome: 'Acre' },
  { sigla: 'AL', nome: 'Alagoas' },
  { sigla: 'AP', nome: 'Amapá' },
  { sigla: 'AM', nome: 'Amazonas' },
  { sigla: 'BA', nome: 'Bahia' },
  { sigla: 'CE', nome: 'Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal' },
  { sigla: 'ES', nome: 'Espírito Santo' },
  { sigla: 'GO', nome: 'Goiás' },
  { sigla: 'MA', nome: 'Maranhão' },
  { sigla: 'MT', nome: 'Mato Grosso' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais' },
  { sigla: 'PA', nome: 'Pará' },
  { sigla: 'PB', nome: 'Paraíba' },
  { sigla: 'PR', nome: 'Paraná' },
  { sigla: 'PE', nome: 'Pernambuco' },
  { sigla: 'PI', nome: 'Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro' },
  { sigla: 'RN', nome: 'Rio Grande do Norte' },
  { sigla: 'RS', nome: 'Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondônia' },
  { sigla: 'RR', nome: 'Roraima' },
  { sigla: 'SC', nome: 'Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo' },
  { sigla: 'SE', nome: 'Sergipe' },
  { sigla: 'TO', nome: 'Tocantins' }
];

export const ModalNovoCliente: React.FC<ModalNovoClienteProps> = ({
  isOpen,
  onClose,
  onClienteCadastrado,
  clienteEditar
}) => {
  const { loja } = useAuth();
  const permissions = usePermissions();

  // Estados dos Campos
  const [ativo, setAtivo] = useState(true);
  const [nome, setNome] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [dataAniversario, setDataAniversario] = useState('');
  const [email, setEmail] = useState('');
  const [observacoes, setObservacoes] = useState('');

  // Telefones com Indicador WhatsApp
  const [telefone1, setTelefone1] = useState('');
  const [telefone1IsWhatsapp, setTelefone1IsWhatsapp] = useState(true);
  const [telefone2, setTelefone2] = useState('');
  const [telefone2IsWhatsapp, setTelefone2IsWhatsapp] = useState(false);

  // Fiado e Tabela de Preço
  const [permiteFiado, setPermiteFiado] = useState(permissions.podeAtivarFiado);
  const [limiteCredito, setLimiteCredito] = useState('500.00');
  const [tabelaPreco, setTabelaPreco] = useState<TabelaPreco>('varejo');

  // Endereço
  const [cep, setCep] = useState('');
  const [rua, setRua] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');

  // Estados de Controle de UI
  const [carregandoCep, setCarregandoCep] = useState(false);
  const [carregandoGeoloc, setCarregandoGeoloc] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  // Sincronizar dados para Edição ou Criação
  React.useEffect(() => {
    if (isOpen) {
      if (clienteEditar) {
        setAtivo((clienteEditar as any).ativo !== false);
        setNome(clienteEditar.nome || '');
        setCpfCnpj(clienteEditar.numero_documento || '');
        setDataAniversario(clienteEditar.data_aniversario || '');
        setEmail(clienteEditar.email || '');
        setObservacoes(clienteEditar.observacoes || '');
        setTelefone1(clienteEditar.telefone || clienteEditar.whatsapp || '');
        setTelefone1IsWhatsapp(clienteEditar.telefone_is_whatsapp ?? true);
        setTelefone2(clienteEditar.telefone2 || '');
        setTelefone2IsWhatsapp(clienteEditar.telefone2_is_whatsapp ?? false);
        setPermiteFiado(clienteEditar.permite_fiado ?? permissions.podeAtivarFiado);
        setLimiteCredito(String(clienteEditar.limite_credito ?? '500.00'));
        setTabelaPreco(clienteEditar.tabela_preco_padrao || 'varejo');
        setCep(clienteEditar.endereco_cep || '');
        setRua(clienteEditar.endereco_logradouro || '');
        setNumero(clienteEditar.endereco_numero || '');
        setComplemento(clienteEditar.endereco_complemento || '');
        setBairro(clienteEditar.endereco_bairro || '');
        setCidade(clienteEditar.endereco_cidade || '');
        setEstado(clienteEditar.endereco_estado || '');
      } else {
        setAtivo(true);
        setNome('');
        setCpfCnpj('');
        setDataAniversario('');
        setEmail('');
        setObservacoes('');
        setTelefone1('');
        setTelefone1IsWhatsapp(true);
        setTelefone2('');
        setTelefone2IsWhatsapp(false);
        setPermiteFiado(permissions.podeAtivarFiado);
        setLimiteCredito(permissions.podeAtivarFiado ? '500.00' : '0.00');
        setTabelaPreco('varejo');
        setCep('');
        setRua('');
        setNumero('');
        setComplemento('');
        setBairro('');
        setCidade('');
        setEstado('');
      }
      setErroMsg(null);
    }
  }, [isOpen, clienteEditar]);

  if (!isOpen) return null;

  // Formatadores de Máscara
  const formatarTelefone = (valor: string) => {
    const limpo = valor.replace(/\D/g, '').slice(0, 11);
    if (limpo.length <= 2) return limpo;
    if (limpo.length <= 6) return `(${limpo.slice(0, 2)}) ${limpo.slice(2)}`;
    if (limpo.length <= 10) return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 6)}-${limpo.slice(6)}`;
    return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7, 11)}`;
  };

  const formatarCpfCnpj = (valor: string) => {
    const limpo = valor.replace(/\D/g, '').slice(0, 14);
    if (limpo.length <= 11) {
      // CPF: 000.000.000-00
      if (limpo.length <= 3) return limpo;
      if (limpo.length <= 6) return `${limpo.slice(0, 3)}.${limpo.slice(3)}`;
      if (limpo.length <= 9) return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6)}`;
      return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-${limpo.slice(9, 11)}`;
    } else {
      // CNPJ: 00.000.000/0000-00
      if (limpo.length <= 12) return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8)}`;
      return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12, 14)}`;
    }
  };

  const formatarCep = (valor: string) => {
    const limpo = valor.replace(/\D/g, '').slice(0, 8);
    if (limpo.length <= 5) return limpo;
    return `${limpo.slice(0, 5)}-${limpo.slice(5, 8)}`;
  };

  // Buscar CEP via ViaCEP
  const buscarCep = async (cepParaBuscar: string) => {
    const cepLimpo = cepParaBuscar.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;

    try {
      setCarregandoCep(true);
      setErroMsg(null);
      const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await response.json();

      if (data.erro) {
        setErroMsg('CEP não encontrado nos Correios.');
        return;
      }

      if (data.logradouro) setRua(data.logradouro);
      if (data.bairro) setBairro(data.bairro);
      if (data.localidade) setCidade(data.localidade);
      if (data.uf) setEstado(data.uf.toUpperCase());
    } catch (err) {
      console.error('Erro ao consultar CEP:', err);
      setErroMsg('Não foi possível consultar o CEP automaticamente.');
    } finally {
      setCarregandoCep(false);
    }
  };

  // Obter Localização Atual do Navegador e Fazer Geocoding Reverso
  const usarLocalizacaoAtual = () => {
    if (!navigator.geolocation) {
      alert('Geolocalização não é suportada pelo seu navegador.');
      return;
    }

    setCarregandoGeoloc(true);
    setErroMsg(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;

          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,
            {
              headers: {
                'Accept-Language': 'pt-BR,pt;q=0.9'
              }
            }
          );
          const data = await res.json();

          if (data && data.address) {
            const addr = data.address;
            const logradouro = addr.road || addr.street || addr.pedestrian || addr.footway || '';
            const num = addr.house_number || '';
            const b = addr.suburb || addr.neighbourhood || addr.city_district || '';
            const cid = addr.city || addr.town || addr.municipality || addr.village || '';
            const est = addr['ISO3166-2-lvl4']?.split('-')[1] || addr.state_code || addr.state || '';
            const rawCep = addr.postcode || '';

            if (logradouro) setRua(logradouro);
            if (num) setNumero(num);
            if (b) setBairro(b);
            if (cid) setCidade(cid);
            if (rawCep) {
              const cepFormatado = formatarCep(rawCep);
              setCep(cepFormatado);
            }

            // Normalizar sigla do estado
            if (est) {
              const ufEncontrada = ESTADOS_BRASIL.find(
                e => e.sigla.toLowerCase() === est.toLowerCase() || e.nome.toLowerCase() === est.toLowerCase()
              );
              if (ufEncontrada) setEstado(ufEncontrada.sigla);
              else if (est.length === 2) setEstado(est.toUpperCase());
            }
          }
        } catch (err) {
          console.error('Erro na geolocalização reversa:', err);
          setErroMsg('Localização obtida, mas não foi possível converter em endereço automaticamente.');
        } finally {
          setCarregandoGeoloc(false);
        }
      },
      (erro) => {
        setCarregandoGeoloc(false);
        let msg = 'Erro ao obter localização.';
        if (erro.code === erro.PERMISSION_DENIED) {
          msg = 'Permissão de localização negada pelo navegador.';
        } else if (erro.code === erro.POSITION_UNAVAILABLE) {
          msg = 'Informações de localização indisponíveis.';
        } else if (erro.code === erro.TIMEOUT) {
          msg = 'Tempo limite esgotado ao buscar localização.';
        }
        setErroMsg(msg);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSubmeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id) {
      setErroMsg('Loja não identificada. Faça login novamente.');
      return;
    }

    if (!nome.trim()) {
      setErroMsg('Por favor, informe o nome do cliente.');
      return;
    }

    setSalvando(true);
    setErroMsg(null);

    // Formatar endereço completo estruturado
    const partesEndereco = [];
    if (rua.trim()) partesEndereco.push(rua.trim());
    if (numero.trim()) partesEndereco.push(`nº ${numero.trim()}`);
    if (complemento.trim()) partesEndereco.push(`(${complemento.trim()})`);
    if (bairro.trim()) partesEndereco.push(bairro.trim());
    if (cidade.trim()) partesEndereco.push(cidade.trim());
    if (estado.trim()) partesEndereco.push(estado.trim());
    if (cep.trim()) partesEndereco.push(`CEP: ${cep.trim()}`);

    const enderecoPrincipalFormatado = partesEndereco.join(', ');

    // Definir número principal para WhatsApp
    let whatsappPrincipal = '';
    if (telefone1IsWhatsapp && telefone1.trim()) {
      whatsappPrincipal = telefone1.replace(/\D/g, '');
    } else if (telefone2IsWhatsapp && telefone2.trim()) {
      whatsappPrincipal = telefone2.replace(/\D/g, '');
    } else if (telefone1.trim()) {
      whatsappPrincipal = telefone1.replace(/\D/g, '');
    }

    const payloadCompleto = {
      loja_id: loja.id,
      nome: nome.trim(),
      numero_documento: cpfCnpj.trim() || null,
      data_aniversario: dataAniversario || null,
      email: email.trim() || null,
      telefone: telefone1.trim() || null,
      telefone2: telefone2.trim() || null,
      telefone_is_whatsapp: telefone1IsWhatsapp,
      telefone2_is_whatsapp: telefone2IsWhatsapp,
      whatsapp: whatsappPrincipal || null,
      permite_fiado: permiteFiado,
      limite_credito: permiteFiado ? (Number(limiteCredito) || 0) : 0,
      saldo_devedor_fiado: clienteEditar ? (Number(clienteEditar.saldo_devedor_fiado) || 0) : 0,
      tabela_preco_padrao: tabelaPreco,
      observacoes: observacoes.trim() || null,
      endereco_cep: cep.trim() || null,
      endereco_logradouro: rua.trim() || null,
      endereco_numero: numero.trim() || null,
      endereco_complemento: complemento.trim() || null,
      endereco_bairro: bairro.trim() || null,
      endereco_cidade: cidade.trim() || null,
      endereco_estado: estado.trim() || null,
      endereco_principal: enderecoPrincipalFormatado || null,
      ativo: ativo
    };

    try {
      let data: any = null;
      let error: any = null;

      if (clienteEditar?.id) {
        // ATUALIZAÇÃO (UPDATE)
        const res = await supabase
          .from('clientes')
          .update(payloadCompleto)
          .eq('id', clienteEditar.id)
          .select()
          .single();

        data = res.data;
        error = res.error;

        if (error && error.message && error.message.includes('column')) {
          const payloadLegado = {
            nome: nome.trim(),
            numero_documento: cpfCnpj.trim() || null,
            data_aniversario: dataAniversario || null,
            email: email.trim() || null,
            telefone: telefone1.trim() || null,
            whatsapp: whatsappPrincipal || null,
            permite_fiado: permiteFiado,
            limite_credito: permiteFiado ? (Number(limiteCredito) || 0) : 0,
            tabela_preco_padrao: tabelaPreco,
            observacoes: observacoes.trim() || null,
            endereco_principal: enderecoPrincipalFormatado || null,
            ativo: ativo
          };
          const resFallback = await supabase
            .from('clientes')
            .update(payloadLegado)
            .eq('id', clienteEditar.id)
            .select()
            .single();
          data = resFallback.data;
          error = resFallback.error;
        }
      } else {
        // INSERÇÃO (INSERT NOVO)
        const res = await supabase
          .from('clientes')
          .insert([payloadCompleto])
          .select()
          .single();

        data = res.data;
        error = res.error;

        if (error && error.message && error.message.includes('column')) {
          const payloadLegado = {
            loja_id: loja.id,
            nome: nome.trim(),
            numero_documento: cpfCnpj.trim() || null,
            data_aniversario: dataAniversario || null,
            email: email.trim() || null,
            telefone: telefone1.trim() || null,
            whatsapp: whatsappPrincipal || null,
            permite_fiado: permiteFiado,
            limite_credito: permiteFiado ? (Number(limiteCredito) || 0) : 0,
            saldo_devedor_fiado: 0,
            tabela_preco_padrao: tabelaPreco,
            observacoes: observacoes.trim() || null,
            endereco_principal: enderecoPrincipalFormatado || null
          };
          const resFallback = await supabase
            .from('clientes')
            .insert([payloadLegado])
            .select()
            .single();
          data = resFallback.data;
          error = resFallback.error;
        }
      }

      if (error) throw error;

      if (data) {
        onClienteCadastrado(data as Cliente);
        onClose();
      }
    } catch (err: any) {
      console.error('Erro ao salvar cliente:', err);
      setErroMsg(err.message || 'Erro inesperado ao salvar cliente.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100">
                {clienteEditar ? 'Editar Dados do Cliente' : 'Cadastrar Novo Cliente'}
              </h2>
              <p className="text-xs text-slate-400">
                {clienteEditar
                  ? 'Atualize os dados de contato, endereço e condições de crédito'
                  : 'Preencha os dados de contato, endereço e controle de crédito'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensagem de Erro / Alerta */}
        {erroMsg && (
          <div className="mx-4 mt-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-rose-300">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="flex-1">{erroMsg}</span>
          </div>
        )}

        {/* Formulário com Scroll */}
        <form onSubmit={handleSubmeter} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Status do Cliente (Ativo / Inativo) - Apenas em Edição e Restrito a Owner / Admin */}
          {clienteEditar && (
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3 shadow-inner">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-200">Status do Cadastro:</span>
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    ativo ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}>
                    {ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  {ativo ? 'Cliente ativo e disponível para vendas e emissão de fiado.' : 'Cliente inativado no sistema.'}
                </span>
              </div>

              {permissions.ehAdmin ? (
                <button
                  type="button"
                  onClick={() => setAtivo(!ativo)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm ${
                    ativo
                      ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40'
                      : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  <span>{ativo ? 'Inativar Cliente' : 'Ativar Cliente'}</span>
                </button>
              ) : (
                <div className="flex items-center gap-1 text-[11px] text-slate-500 bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-800">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Apenas Owner / Admin</span>
                </div>
              )}
            </div>
          )}

          {/* SEÇÃO 1: DADOS BÁSICOS */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              <span>Identificação do Cliente</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Nome */}
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Nome Completo <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="Ex: João Carlos da Silva"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* CPF / CNPJ */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">CPF ou CNPJ</label>
                <div className="relative">
                  <FileText className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="000.000.000-00 ou CNPJ"
                    value={cpfCnpj}
                    onChange={(e) => setCpfCnpj(formatarCpfCnpj(e.target.value))}
                    className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Data de Aniversário */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Data de Aniversário</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="date"
                    value={dataAniversario}
                    onChange={(e) => setDataAniversario(e.target.value)}
                    className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* E-mail */}
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-300 block mb-1">E-mail</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    placeholder="exemplo@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 2: TELEFONES & WHATSAPP */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" />
              <span>Contatos & WhatsApp</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Telefone 1 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">Telefone 1</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="(00) 00000-0000"
                    value={telefone1}
                    onChange={(e) => setTelefone1(formatarTelefone(e.target.value))}
                    className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setTelefone1IsWhatsapp(!telefone1IsWhatsapp)}
                  className={`w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg border text-[11px] font-medium transition ${
                    telefone1IsWhatsapp
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{telefone1IsWhatsapp ? '✓ É WhatsApp' : 'Definir como WhatsApp'}</span>
                </button>
              </div>

              {/* Telefone 2 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">Telefone 2</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="(00) 00000-0000"
                    value={telefone2}
                    onChange={(e) => setTelefone2(formatarTelefone(e.target.value))}
                    className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setTelefone2IsWhatsapp(!telefone2IsWhatsapp)}
                  className={`w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg border text-[11px] font-medium transition ${
                    telefone2IsWhatsapp
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{telefone2IsWhatsapp ? '✓ É WhatsApp' : 'Definir como WhatsApp'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* SEÇÃO 3: CONTROLE DE FIADO & PREÇOS */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              <span>Controle de Fiado & Tabela de Preço</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Tabela de Preço */}
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-300 block mb-1">Tabela de Preço Padrão</label>
                <select
                  value={tabelaPreco}
                  onChange={(e) => setTabelaPreco(e.target.value as TabelaPreco)}
                  className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 capitalize"
                >
                  <option value="varejo">Varejo (Preço Normal)</option>
                  <option value="atacado">Atacado</option>
                  <option value="autoatacado">Autoatacado</option>
                </select>
              </div>

              {/* Indicador se Permite Fiado (Apenas se autorizado a ativar fiado) */}
              {permissions.podeAtivarFiado && (
                <>
                  <div className="sm:col-span-2 bg-slate-950/60 border border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${permiteFiado ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">Permite Venda no Fiado / A Prazo?</span>
                        <span className="text-[11px] text-slate-400">
                          {permiteFiado
                            ? 'Cliente habilitado para compras a prazo com limite de crédito'
                            : 'Cliente bloqueado para fiado (apenas pagamentos à vista)'}
                        </span>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={permiteFiado}
                        onChange={(e) => setPermiteFiado(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>

                  {/* LIMITE DE FIADO: SÓ EXIBIDO/SOLICITADO SE PERMITE FIADO FOR VERDADEIRO */}
                  {permiteFiado && (
                    <div className="sm:col-span-2 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl p-3.5 space-y-1.5 animate-in fade-in slide-in-from-top-2">
                      <label className="text-xs font-bold text-emerald-300 flex items-center justify-between">
                        <span>Limite de Crédito / Fiado (R$) *</span>
                        <span className="text-[10px] text-emerald-400 font-normal">Valor máximo de débito pendente</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-400">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required={permiteFiado}
                          placeholder="500,00"
                          value={limiteCredito}
                          onChange={(e) => setLimiteCredito(e.target.value)}
                          className="w-full bg-slate-800 border border-emerald-500/50 rounded-xl pl-10 pr-3 py-2.5 text-sm font-bold text-emerald-300 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* SEÇÃO 4: ENDEREÇO COMPLETO */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                <span>Endereço Completo</span>
              </h3>

              {/* Botão de Localização Atual */}
              <button
                type="button"
                disabled={carregandoGeoloc}
                onClick={usarLocalizacaoAtual}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition disabled:opacity-50"
              >
                {carregandoGeoloc ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                ) : (
                  <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>{carregandoGeoloc ? 'Buscando GPS...' : 'Usar Localização Atual'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              {/* CEP com Botão Não Sei o CEP */}
              <div className="sm:col-span-3 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">CEP</label>
                  <a
                    href="https://buscacepinter.correios.com.br/app/endereco/index.php"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1"
                  >
                    <HelpCircle className="w-3 h-3" />
                    <span>Não sei o CEP</span>
                  </a>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="00000-000"
                    value={cep}
                    onChange={(e) => {
                      const formatado = formatarCep(e.target.value);
                      setCep(formatado);
                      if (formatado.replace(/\D/g, '').length === 8) {
                        buscarCep(formatado);
                      }
                    }}
                    className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  {carregandoCep && (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  )}
                </div>
              </div>

              {/* Estado (UF) */}
              <div className="sm:col-span-3">
                <label className="text-xs font-semibold text-slate-300 block mb-1">Estado (UF)</label>
                <select
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                  className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione o Estado</option>
                  {ESTADOS_BRASIL.map((uf) => (
                    <option key={uf.sigla} value={uf.sigla}>
                      {uf.sigla} - {uf.nome}
                    </option>
                  ))}
                </select>
              </div>

              {/* Rua / Logradouro */}
              <div className="sm:col-span-4">
                <label className="text-xs font-semibold text-slate-300 block mb-1">Rua / Logradouro</label>
                <input
                  type="text"
                  placeholder="Ex: Av. Santos Dumont, Rua das Flores"
                  value={rua}
                  onChange={(e) => setRua(e.target.value)}
                  className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Número */}
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-300 block mb-1">Número</label>
                <input
                  type="text"
                  placeholder="Ex: 123, S/N"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Bairro */}
              <div className="sm:col-span-3">
                <label className="text-xs font-semibold text-slate-300 block mb-1">Bairro</label>
                <input
                  type="text"
                  placeholder="Ex: Aldeota, Centro"
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                  className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Cidade */}
              <div className="sm:col-span-3">
                <label className="text-xs font-semibold text-slate-300 block mb-1">Cidade</label>
                <input
                  type="text"
                  placeholder="Ex: Fortaleza, São Paulo"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Complemento */}
              <div className="sm:col-span-6">
                <label className="text-xs font-semibold text-slate-300 block mb-1">Complemento / Ponto de Referência</label>
                <input
                  type="text"
                  placeholder="Ex: Apto 204, Bloco B, Próximo ao supermercado"
                  value={complemento}
                  onChange={(e) => setComplemento(e.target.value)}
                  className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* SEÇÃO 5: OBSERVAÇÕES */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              <span>Observações Gerais</span>
            </h3>
            <textarea
              rows={2}
              placeholder="Preferências de atendimento, notas de entrega, histórico ou detalhes importantes..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>
        </form>

        {/* Rodapé com Ações */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/90 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={salvando}
            onClick={handleSubmeter}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            {salvando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{clienteEditar ? 'Salvando...' : 'Cadastrando...'}</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>{clienteEditar ? 'Salvar Alterações' : 'Salvar Cliente'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
