import React, { useState } from 'react';
import {
  Store,
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Sparkles,
  ShoppingBag,
  HelpCircle,
  AlertTriangle,
  Briefcase
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { TipoDocumento } from '../types';

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

export const CadastroPdv: React.FC = () => {
  const { lojasDisponiveis, cadastrarPdv, selecionarLoja } = useAuth();

  const [abaAtiva, setAbaAtiva] = useState<'novo' | 'existente'>(
    lojasDisponiveis.length > 0 ? 'existente' : 'novo'
  );

  // Dados do PDV
  const [tipoPessoa, setTipoPessoa] = useState<TipoDocumento>('CNPJ');
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [documento, setDocumento] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [nomeAdmin, setNomeAdmin] = useState('');
  const [segmento, setSegmento] = useState('Varejo Geral');

  // Endereço
  const [cep, setCep] = useState('');
  const [rua, setRua] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('CE');

  // UI States
  const [carregandoCep, setCarregandoCep] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [buscaLoja, setBuscaLoja] = useState('');

  // Formatadores
  const formatarTelefone = (valor: string) => {
    const limpo = valor.replace(/\D/g, '').slice(0, 11);
    if (limpo.length <= 2) return limpo;
    if (limpo.length <= 6) return `(${limpo.slice(0, 2)}) ${limpo.slice(2)}`;
    if (limpo.length <= 10) return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 6)}-${limpo.slice(6)}`;
    return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7, 11)}`;
  };

  const formatarDocumento = (valor: string, tipo: TipoDocumento) => {
    const limpo = valor.replace(/\D/g, '');
    if (tipo === 'CPF') {
      const v = limpo.slice(0, 11);
      if (v.length <= 3) return v;
      if (v.length <= 6) return `${v.slice(0, 3)}.${v.slice(3)}`;
      if (v.length <= 9) return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6)}`;
      return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9, 11)}`;
    } else {
      const v = limpo.slice(0, 14);
      if (v.length <= 2) return v;
      if (v.length <= 5) return `${v.slice(0, 2)}.${v.slice(2)}`;
      if (v.length <= 8) return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5)}`;
      if (v.length <= 12) return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8)}`;
      return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12, 14)}`;
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
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();

      if (data.erro) {
        setErroMsg('CEP não localizado. Preencha o endereço manualmente.');
        return;
      }

      if (data.logradouro) setRua(data.logradouro);
      if (data.bairro) setBairro(data.bairro);
      if (data.localidade) setCidade(data.localidade);
      if (data.uf) setEstado(data.uf.toUpperCase());
    } catch (e) {
      console.error('Erro ao buscar CEP:', e);
    } finally {
      setCarregandoCep(false);
    }
  };

  const handleSubmeterCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeFantasia.trim()) {
      setErroMsg('Por favor, informe o Nome do Estabelecimento / PDV.');
      return;
    }
    if (!whatsapp.trim()) {
      setErroMsg('Por favor, informe o WhatsApp de atendimento do PDV.');
      return;
    }
    if (!email.trim()) {
      setErroMsg('Por favor, informe o e-mail do PDV.');
      return;
    }

    try {
      setSalvando(true);
      setErroMsg(null);

      await cadastrarPdv(
        {
          nome_fantasia: nomeFantasia,
          razao_social: razaoSocial || nomeFantasia,
          tipo_documento: tipoPessoa,
          numero_documento: documento,
          whatsapp,
          telefone,
          email,
          endereco_cep: cep,
          endereco_logradouro: rua,
          endereco_numero: numero,
          endereco_complemento: complemento,
          endereco_bairro: bairro,
          endereco_cidade: cidade,
          endereco_estado: estado
        },
        {
          nome_completo: nomeAdmin || 'Administrador',
          email,
          whatsapp_atendimento: whatsapp
        }
      );
    } catch (err: any) {
      console.error('Erro ao salvar PDV:', err);
      setErroMsg(err.message || 'Erro ao realizar o cadastro do PDV.');
    } finally {
      setSalvando(false);
    }
  };

  const lojasFiltradas = lojasDisponiveis.filter(l =>
    l.nome_fantasia.toLowerCase().includes(buscaLoja.toLowerCase()) ||
    (l.numero_documento && l.numero_documento.includes(buscaLoja)) ||
    (l.email && l.email.toLowerCase().includes(buscaLoja.toLowerCase())) ||
    (l.endereco_cidade && l.endereco_cidade.toLowerCase().includes(buscaLoja.toLowerCase()))
  );

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 overflow-y-auto">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 my-8">
        {/* Header Superior */}
        <div className="p-6 sm:p-8 bg-slate-900/80 border-b border-slate-800 text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-black text-2xl shadow-lg shadow-emerald-500/20 mb-1">
            <Store className="w-7 h-7 text-emerald-400" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight">
            Bem-vindo ao <span className="text-emerald-400">HUBI</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
            Identifique seu Ponto de Venda (PDV) para gerenciar pedidos, clientes, estoque e finanças.
          </p>

          {/* Abas Alternadoras */}
          {lojasDisponiveis.length > 0 && (
            <div className="flex p-1 bg-slate-950/80 border border-slate-800 rounded-2xl max-w-md mx-auto mt-4">
              <button
                type="button"
                onClick={() => { setAbaAtiva('existente'); setErroMsg(null); }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  abaAtiva === 'existente'
                    ? 'bg-emerald-500 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Store className="w-4 h-4" />
                <span>Acessar PDV ({lojasDisponiveis.length})</span>
              </button>
              <button
                type="button"
                onClick={() => { setAbaAtiva('novo'); setErroMsg(null); }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  abaAtiva === 'novo'
                    ? 'bg-emerald-500 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Novo Cadastro</span>
              </button>
            </div>
          )}
        </div>

        {/* Mensagem de Erro / Alerta */}
        {erroMsg && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-rose-300">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="flex-1">{erroMsg}</span>
          </div>
        )}

        {/* CONTEÚDO DA ABA: SELECIONAR PDV EXISTENTE */}
        {abaAtiva === 'existente' && lojasDisponiveis.length > 0 && (
          <div className="p-6 sm:p-8 space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Store className="w-4 h-4 text-emerald-400" />
                <span>Selecione o Estabelecimento para Acessar</span>
              </h2>
              <p className="text-xs text-slate-400">
                Selecione o seu PDV cadastrado para abrir o painel de vendas e controle.
              </p>
            </div>

            {lojasDisponiveis.length > 3 && (
              <input
                type="text"
                placeholder="Buscar PDV por nome, CNPJ ou cidade..."
                value={buscaLoja}
                onChange={(e) => setBuscaLoja(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
            )}

            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {lojasFiltradas.map((lojaItem) => (
                <div
                  key={lojaItem.id}
                  onClick={() => selecionarLoja(lojaItem.id)}
                  className="p-4 bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-emerald-500/60 rounded-2xl cursor-pointer transition flex items-center justify-between group shadow-sm"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center group-hover:scale-105 transition">
                      {lojaItem.nome_fantasia.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-100 group-hover:text-emerald-400 transition">
                        {lojaItem.nome_fantasia}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        {lojaItem.numero_documento && <span>{lojaItem.tipo_documento || 'DOC'}: {lojaItem.numero_documento}</span>}
                        {lojaItem.endereco_cidade && <span>• {lojaItem.endereco_cidade}/{lojaItem.endereco_estado}</span>}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="px-3.5 py-2 rounded-xl bg-emerald-500/10 group-hover:bg-emerald-500 text-emerald-400 group-hover:text-white text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <span>Entrar</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-800 text-center">
              <button
                type="button"
                onClick={() => { setAbaAtiva('novo'); setErroMsg(null); }}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
              >
                + Cadastrar um Novo Estabelecimento / PDV
              </button>
            </div>
          </div>
        )}

        {/* CONTEÚDO DA ABA: NOVO CADASTRO DO PDV */}
        {abaAtiva === 'novo' && (
          <form onSubmit={handleSubmeterCadastro} className="p-6 sm:p-8 space-y-6">
            {/* SELEÇÃO: PESSOA JURÍDICA / FÍSICA */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block uppercase tracking-wider">
                Tipo de Estabelecimento / Titular
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setTipoPessoa('CNPJ');
                    setDocumento('');
                  }}
                  className={`p-3 rounded-2xl border flex items-center justify-center gap-2 text-xs font-bold transition ${
                    tipoPessoa === 'CNPJ'
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  <span>Pessoa Jurídica (CNPJ)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTipoPessoa('CPF');
                    setDocumento('');
                  }}
                  className={`p-3 rounded-2xl border flex items-center justify-center gap-2 text-xs font-bold transition ${
                    tipoPessoa === 'CPF'
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>Pessoa Física / MEI (CPF)</span>
                </button>
              </div>
            </div>

            {/* IDENTIFICAÇÃO DO PDV */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5" />
                <span>Dados do Ponto de Venda</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Nome Fantasia */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Nome Fantasia / Nome do Estabelecimento <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Store className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="Ex: Mercadinho Central, Boutique Chic, Hamburgueria Gourmet"
                      value={nomeFantasia}
                      onChange={(e) => setNomeFantasia(e.target.value)}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-10 pr-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Razão Social */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    {tipoPessoa === 'CNPJ' ? 'Razão Social' : 'Nome Completo do Titular'}
                  </label>
                  <input
                    type="text"
                    placeholder={tipoPessoa === 'CNPJ' ? 'Ex: Silva & Santos Alimentos Ltda' : 'Ex: Carlos Alberto da Silva'}
                    value={razaoSocial}
                    onChange={(e) => setRazaoSocial(e.target.value)}
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Documento (CPF / CNPJ) */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    {tipoPessoa === 'CNPJ' ? 'CNPJ' : 'CPF do Titular'}
                  </label>
                  <div className="relative">
                    <FileText className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder={tipoPessoa === 'CNPJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                      value={documento}
                      onChange={(e) => setDocumento(formatarDocumento(e.target.value, tipoPessoa))}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-10 pr-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* WhatsApp do PDV */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    WhatsApp do PDV / Pedidos <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="(00) 00000-0000"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(formatarTelefone(e.target.value))}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-10 pr-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Telefone Adicional */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Telefone Fixo / Adicional</label>
                  <input
                    type="text"
                    placeholder="(00) 0000-0000"
                    value={telefone}
                    onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* E-mail */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    E-mail do Estabelecimento <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      placeholder="contato@minhaloja.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-10 pr-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Nome do Administrador */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Nome do Operador / Administrador</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Ex: Carlos Silva"
                      value={nomeAdmin}
                      onChange={(e) => setNomeAdmin(e.target.value)}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-10 pr-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Segmento */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Ramo de Atuação / Segmento</label>
                  <div className="relative">
                    <Briefcase className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <select
                      value={segmento}
                      onChange={(e) => setSegmento(e.target.value)}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-10 pr-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="Varejo Geral">Varejo & Comércio Geral</option>
                      <option value="Alimentação">Alimentação / Lanchonete / Restaurante</option>
                      <option value="Moda & Vestuário">Moda, Calçados & Vestuário</option>
                      <option value="Mercado & Conveniência">Minimercado / Mercearia / Conveniência</option>
                      <option value="Beleza & Cosméticos">Saúde, Beleza & Cosméticos</option>
                      <option value="Eletrônicos & Informática">Eletrônicos & Acessórios</option>
                      <option value="Serviços">Prestação de Serviços</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* ENDEREÇO DO ESTABELECIMENTO */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                <span>Endereço do Estabelecimento</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                {/* CEP */}
                <div className="sm:col-span-3">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">CEP</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="00000-000"
                      value={cep}
                      onChange={(e) => {
                        const fmt = formatarCep(e.target.value);
                        setCep(fmt);
                        if (fmt.replace(/\D/g, '').length === 8) {
                          buscarCep(fmt);
                        }
                      }}
                      className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    {carregandoCep && (
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    )}
                  </div>
                </div>

                {/* Estado */}
                <div className="sm:col-span-3">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Estado (UF)</label>
                  <select
                    value={estado}
                    onChange={(e) => setEstado(e.target.value)}
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    {ESTADOS_BRASIL.map((uf) => (
                      <option key={uf.sigla} value={uf.sigla}>
                        {uf.sigla} - {uf.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rua */}
                <div className="sm:col-span-4">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Logradouro / Rua</label>
                  <input
                    type="text"
                    placeholder="Ex: Av. Principal, Rua do Comércio"
                    value={rua}
                    onChange={(e) => setRua(e.target.value)}
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Número */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Número</label>
                  <input
                    type="text"
                    placeholder="Ex: 100, S/N"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Bairro */}
                <div className="sm:col-span-3">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Bairro</label>
                  <input
                    type="text"
                    placeholder="Ex: Centro"
                    value={bairro}
                    onChange={(e) => setBairro(e.target.value)}
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
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
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Complemento */}
                <div className="sm:col-span-6">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Complemento / Referência</label>
                  <input
                    type="text"
                    placeholder="Ex: Loja 02, Próximo à praça"
                    value={complemento}
                    onChange={(e) => setComplemento(e.target.value)}
                    className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* BOTÃO DE SUBMISSÃO */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={salvando}
                className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
              >
                {salvando ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Inicializando seu PDV...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Concluir Cadastro & Abrir Sistema HUBI</span>
                  </>
                )}
              </button>
              <p className="text-[11px] text-slate-500 text-center mt-2">
                Ao cadastrar, as formas de pagamento padrão e configurações do PDV serão criadas automaticamente.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
