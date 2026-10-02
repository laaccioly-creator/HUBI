import React, { useState, useEffect } from 'react';
import {
  X,
  MapPin,
  Navigation,
  Plus,
  Check,
  CheckCircle2,
  Loader2,
  AlertCircle,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { ClienteEndereco, NovoEnderecoFormInput } from '../../types/shipping';
import { ShippingOrchestrator } from '../../services/shippingOrchestrator';
import { obterEnderecoPorCoordenadas } from '../../utils/geoUtils';
import { ESTADOS_BRASIL } from './ModalAtualizarEnderecoCliente';
import { addressParserJevService } from '../../services/addressParserJevService';

interface ModalEscolherOutroEnderecoProps {
  aberto: boolean;
  onFechar: () => void;
  clienteId: string;
  enderecoAtualId?: string | null;
  onConfirmarEndereco: (endereco: ClienteEndereco) => void;
}

export const ModalEscolherOutroEndereco: React.FC<ModalEscolherOutroEnderecoProps> = ({
  aberto,
  onFechar,
  clienteId,
  enderecoAtualId,
  onConfirmarEndereco
}) => {
  const [enderecos, setEnderecos] = useState<ClienteEndereco[]>([]);
  const [carregando, setCarregando] = useState<boolean>(false);
  const [enderecoEscolhido, setEnderecoEscolhido] = useState<ClienteEndereco | null>(null);

  // GPS / Minha Localização Atual
  const [enderecoGps, setEnderecoGps] = useState<ClienteEndereco | null>(null);
  const [carregandoGps, setCarregandoGps] = useState<boolean>(false);

  // Form para Adicionar Novo Endereço
  const [exibirFormNovo, setExibirFormNovo] = useState<boolean>(false);
  const [novoIdentificador, setNovoIdentificador] = useState<string>('Outro');
  const [novoCep, setNovoCep] = useState<string>('');
  const [novoLogradouro, setNovoLogradouro] = useState<string>('');
  const [novoNumero, setNovoNumero] = useState<string>('');
  const [novoComplemento, setNovoComplemento] = useState<string>('');
  const [novoBairro, setNovoBairro] = useState<string>('');
  const [novoCidade, setNovoCidade] = useState<string>('');
  const [novoUf, setNovoUf] = useState<string>('CE');
  const [carregandoCepNovo, setCarregandoCepNovo] = useState<boolean>(false);
  const [salvandoNovo, setSalvandoNovo] = useState<boolean>(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  // Fase 5B: Sanitização de Endereço em Linha Única com Jev TypeSafe
  const [textoEnderecoColado, setTextoEnderecoColado] = useState<string>('');
  const [processandoParse, setProcessandoParse] = useState<boolean>(false);

  const handlePreencherEnderecoInteligente = async () => {
    if (!textoEnderecoColado.trim()) return;
    setProcessandoParse(true);
    setErroMsg(null);
    try {
      const end = await addressParserJevService.sanitizarEnderecoLivre(textoEnderecoColado);
      if (end.logradouro) setNovoLogradouro(end.logradouro);
      if (end.numero && end.numero !== 'S/N') setNovoNumero(end.numero);
      if (end.complemento) setNovoComplemento(end.complemento);
      if (end.bairro) setNovoBairro(end.bairro);
      if (end.cidade) setNovoCidade(end.cidade);
      if (end.uf) setNovoUf(end.uf);
      if (end.cep) setNovoCep(end.cep);
    } catch (e) {
      console.warn('Erro ao interpretar endereço com IA:', e);
    } finally {
      setProcessandoParse(false);
    }
  };

  const carregarEnderecos = async () => {
    if (!clienteId) return;
    setCarregando(true);
    setErroMsg(null);
    try {
      const lista = await ShippingOrchestrator.listarEnderecosCliente(clienteId);
      // Deduplicação defensiva na listagem por ID
      const unicos: ClienteEndereco[] = [];
      const chavesVistas = new Set<string>();
      for (const e of lista) {
        const chave = e.id ? `id_${e.id}` : `${(e.cep || '').replace(/\D/g, '')}_${(e.numero || '').trim().toLowerCase()}_${(e.logradouro || '').trim().toLowerCase()}`;
        if (!chavesVistas.has(chave)) {
          chavesVistas.add(chave);
          unicos.push(e);
        }
      }
      setEnderecos(unicos);
      if (enderecoAtualId) {
        const atual = unicos.find(e => e.id === enderecoAtualId);
        if (atual) {
          setEnderecoEscolhido(atual);
        } else if (unicos.length > 0) {
          setEnderecoEscolhido(unicos[0]);
        }
      } else if (unicos.length > 0) {
        setEnderecoEscolhido(unicos[0]);
      }
    } catch (err) {
      console.warn('Erro ao carregar endereços do cliente:', err);
      setErroMsg('Não foi possível carregar a lista de endereços.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (aberto) {
      carregarEnderecos();
      setExibirFormNovo(false);
      setEnderecoGps(null);
      setErroMsg(null);
    }
  }, [aberto, clienteId]);

  if (!aberto) return null;

  const capturarLocalizacaoAtual = () => {
    if (!navigator.geolocation) {
      setErroMsg('Geolocalização não é suportada por este dispositivo.');
      return;
    }

    setCarregandoGps(true);
    setErroMsg(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const dados = await obterEnderecoPorCoordenadas(latitude, longitude);

          const enderecoTmp: ClienteEndereco = {
            id: `gps-${Date.now()}`,
            cliente_id: clienteId,
            identificador: 'Minha Localização Atual (GPS)',
            cep: dados?.cep || '00000-000',
            logradouro: dados?.logradouro || 'Localização obtida via GPS',
            numero: dados?.numero || 'S/N',
            bairro: dados?.bairro || 'Bairro Atual',
            cidade: dados?.cidade || 'Cidade Atual',
            uf: dados?.uf || 'CE',
            latitude,
            longitude,
            is_principal: false
          };

          setEnderecoGps(enderecoTmp);
          setEnderecoEscolhido(enderecoTmp);
        } catch (err) {
          console.warn('Falha ao processar GPS:', err);
          setErroMsg('Não foi possível converter a localização atual em endereço.');
        } finally {
          setCarregandoGps(false);
        }
      },
      (err) => {
        console.warn('Permissão GPS negada:', err);
        setErroMsg('Permissão de GPS negada pelo usuário.');
        setCarregandoGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const formatarCep = (valor: string): string => {
    const limpo = valor.replace(/\D/g, '').slice(0, 8);
    if (limpo.length > 5) {
      return `${limpo.slice(0, 5)}-${limpo.slice(5)}`;
    }
    return limpo;
  };

  const buscarViaCep = async (cepStr: string) => {
    const limpo = cepStr.replace(/\D/g, '');
    if (limpo.length !== 8) return;

    setCarregandoCepNovo(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const data = await res.json();
      if (!data.erro) {
        if (data.logradouro) setNovoLogradouro(data.logradouro);
        if (data.bairro) setNovoBairro(data.bairro);
        if (data.localidade) setNovoCidade(data.localidade);
        if (data.uf) setNovoUf(data.uf.toUpperCase());
      }
    } catch {
      // Ignora erro
    } finally {
      setCarregandoCepNovo(false);
    }
  };

  const handleSalvarNovoEndereco = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroMsg(null);

    const cepLimpo = novoCep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) {
      setErroMsg('Informe um CEP válido.');
      return;
    }
    if (!novoLogradouro.trim() || !novoNumero.trim() || !novoBairro.trim() || !novoCidade.trim()) {
      setErroMsg('Preencha os campos obrigatórios do novo endereço.');
      return;
    }

    const numLimpo = novoNumero.trim().toLowerCase();
    const compLimpo = novoComplemento.trim().toLowerCase();

    // Se o endereço já está cadastrado, seleciona-o e conclui sem travar com erro
    const enderecoExistente = enderecos.find(e => {
      const eCep = (e.cep || '').replace(/\D/g, '');
      const eNum = (e.numero || '').trim().toLowerCase();
      const eComp = (e.complemento || '').trim().toLowerCase();
      if (eCep === cepLimpo && eNum === numLimpo) {
        if (!compLimpo && !eComp) return true;
        if (compLimpo === eComp) return true;
      }
      return false;
    });

    if (enderecoExistente) {
      setEnderecoEscolhido(enderecoExistente);
      setExibirFormNovo(false);
      return;
    }

    setSalvandoNovo(true);
    try {
      const payload: NovoEnderecoFormInput = {
        identificador: novoIdentificador.trim() || 'Novo Endereço',
        cep: novoCep.trim(),
        logradouro: novoLogradouro.trim(),
        numero: novoNumero.trim(),
        complemento: novoComplemento.trim() || undefined,
        bairro: novoBairro.trim(),
        cidade: novoCidade.trim(),
        uf: novoUf.trim(),
        is_principal: false
      };

      const salvo = await ShippingOrchestrator.salvarNovoEnderecoCliente(clienteId, payload);
      setEnderecos(prev => [salvo, ...prev]);
      setEnderecoEscolhido(salvo);
      setExibirFormNovo(false);

      // Reset form
      setNovoCep('');
      setNovoLogradouro('');
      setNovoNumero('');
      setNovoComplemento('');
      setNovoBairro('');
      setNovoCidade('');

      // Retorno imediato ao modal principal com o endereço selecionado
      onConfirmarEndereco(salvo);
      onFechar();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErroMsg(msg || 'Erro ao cadastrar novo endereço.');
    } finally {
      setSalvandoNovo(false);
    }
  };

  const handleConfirmar = () => {
    if (!enderecoEscolhido) {
      setErroMsg('Selecione um endereço da lista ou capture a localização atual.');
      return;
    }
    onConfirmarEndereco(enderecoEscolhido);
    onFechar();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl sm:rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-white">
                Escolher Endereço de Entrega
              </h3>
              <p className="text-xs text-slate-400">
                Selecione um endereço cadastrado, sua localização atual ou adicione outro
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {erroMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{erroMsg}</span>
            </div>
          )}

          {/* Opção 1: Minha Localização Atual */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-200 block">Usar Localização GPS</span>
            <div
              onClick={() => {
                if (enderecoGps) {
                  setEnderecoEscolhido(enderecoGps);
                } else {
                  capturarLocalizacaoAtual();
                }
              }}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                enderecoEscolhido?.id === enderecoGps?.id && enderecoGps
                  ? 'bg-emerald-950/30 border-2 border-emerald-500 text-white shadow-sm shadow-emerald-950/40'
                  : 'bg-black hover:bg-slate-950 border border-slate-800 text-white font-bold'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                  {carregandoGps ? (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  ) : (
                    <Navigation className="w-4 h-4 text-emerald-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-white block">
                    {enderecoGps ? 'Minha Localização Atual (Capturada)' : 'Minha Localização Atual'}
                  </span>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {enderecoGps
                      ? `${enderecoGps.logradouro}, ${enderecoGps.numero} - ${enderecoGps.bairro}, ${enderecoGps.cidade}-${enderecoGps.uf}`
                      : 'Clique para obter as coordenadas via GPS do dispositivo'}
                  </p>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                {!enderecoGps ? (
                  <button
                    type="button"
                    disabled={carregandoGps}
                    onClick={(e) => {
                      e.stopPropagation();
                      capturarLocalizacaoAtual();
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-[11px] font-bold text-white transition cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    {carregandoGps ? 'Buscando...' : 'Obter GPS'}
                  </button>
                ) : (
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                    enderecoEscolhido?.id === enderecoGps.id
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'border-2 border-slate-500'
                  }`}>
                    {enderecoEscolhido?.id === enderecoGps.id && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Opção 2: Endereços Cadastrados */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-200 block">
              Endereços Cadastrados do Cliente ({enderecos.length})
            </span>

            {carregando ? (
              <div className="py-6 flex items-center justify-center gap-2 text-slate-400 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                <span>Carregando endereços...</span>
              </div>
            ) : enderecos.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 text-center text-xs text-slate-400">
                Nenhum endereço cadastrado para este cliente.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {enderecos.map((end) => {
                  const estaSelecionado = enderecoEscolhido?.id === end.id;
                  return (
                    <div
                      key={end.id}
                      onClick={() => setEnderecoEscolhido(end)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        estaSelecionado
                          ? 'bg-emerald-950/30 border-2 border-emerald-500 text-white shadow-sm shadow-emerald-950/40'
                          : 'bg-black hover:bg-slate-950 border border-slate-800 text-white font-bold'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <MapPin className={`w-4 h-4 shrink-0 mt-0.5 ${estaSelecionado ? 'text-emerald-400' : 'text-slate-400'}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">
                              {end.is_principal ? 'Endereço Principal' : (end.identificador === 'Principal' ? 'Endereço Alternativo' : (end.identificador || 'Endereço'))}
                            </span>
                            {end.is_principal && (
                              <span className="text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                Principal
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-300 mt-0.5 truncate">
                            {end.logradouro}, {end.numero} {end.complemento ? `(${end.complemento})` : ''}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {end.bairro}, {end.cidade}-{end.uf} | CEP: {end.cep}
                          </p>
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        estaSelecionado
                          ? 'bg-emerald-500 text-slate-950 shadow-sm'
                          : 'border-2 border-slate-500'
                      }`}>
                        {estaSelecionado && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Opção 3: Adicionar Novo Endereço */}
          {!exibirFormNovo ? (
            <button
              type="button"
              onClick={() => setExibirFormNovo(true)}
              className="w-full py-3 rounded-2xl border border-dashed border-slate-700 hover:border-emerald-500/60 bg-slate-800/40 hover:bg-slate-800 text-slate-300 hover:text-emerald-400 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Adicionar Novo Endereço</span>
            </button>
          ) : (
            <form id="form-novo-endereco-cliente" onSubmit={handleSalvarNovoEndereco} className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Cadastrar Novo Endereço</span>
                <button
                  type="button"
                  onClick={() => setExibirFormNovo(false)}
                  className="text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
              </div>

              {/* Barra de Preenchimento Inteligente de Endereço (TypeSafe Jev) */}
              <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-700/80">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Cole um endereço completo (ex: Av. Santos Dumont 2828 apto 402 - Aldeota, Fortaleza - CE)..."
                  value={textoEnderecoColado}
                  onChange={(e) => setTextoEnderecoColado(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!textoEnderecoColado.trim() || processandoParse}
                  onClick={handlePreencherEnderecoInteligente}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-[11px] flex items-center gap-1 transition cursor-pointer shrink-0"
                >
                  {processandoParse ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>Preencher com IA</span>}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-6 gap-2.5">
                <div className="sm:col-span-3 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 block">Apelido (ex: Trabalho)</label>
                  <input
                    type="text"
                    value={novoIdentificador}
                    onChange={(e) => setNovoIdentificador(e.target.value)}
                    placeholder="Casa, Trabalho..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  />
                </div>

                <div className="sm:col-span-3 space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-0.5">
                    <label className="text-[11px] font-semibold text-slate-400">CEP *</label>
                    <a
                      href="https://buscacepinter.correios.com.br/app/endereco/index.php"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1 font-medium whitespace-nowrap ml-auto"
                    >
                      <HelpCircle className="w-3 h-3 shrink-0" />
                      <span>Não sei o CEP</span>
                    </a>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={novoCep}
                      onChange={(e) => {
                        const fmt = formatarCep(e.target.value);
                        setNovoCep(fmt);
                        if (fmt.replace(/\D/g, '').length === 8) buscarViaCep(fmt);
                      }}
                      placeholder="00000-000"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                      required
                    />
                    {carregandoCepNovo && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                    )}
                  </div>
                </div>

                <div className="sm:col-span-4 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 block">Rua / Logradouro *</label>
                  <input
                    type="text"
                    value={novoLogradouro}
                    onChange={(e) => setNovoLogradouro(e.target.value)}
                    placeholder="Av., Rua..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                    required
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 block">Número *</label>
                  <input
                    type="text"
                    value={novoNumero}
                    onChange={(e) => setNovoNumero(e.target.value)}
                    placeholder="123"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                    required
                  />
                </div>

                <div className="sm:col-span-3 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 block">Bairro *</label>
                  <input
                    type="text"
                    value={novoBairro}
                    onChange={(e) => setNovoBairro(e.target.value)}
                    placeholder="Bairro"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                    required
                  />
                </div>

                <div className="sm:col-span-3 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 block">Cidade *</label>
                  <input
                    type="text"
                    value={novoCidade}
                    onChange={(e) => setNovoCidade(e.target.value)}
                    placeholder="Cidade"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                    required
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 block">UF *</label>
                  <select
                    value={novoUf}
                    onChange={(e) => setNovoUf(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 cursor-pointer"
                    required
                  >
                    {ESTADOS_BRASIL.map((est) => (
                      <option key={est.sigla} value={est.sigla} className="bg-slate-900 text-white">
                        {est.sigla}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-4 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 block">Complemento</label>
                  <input
                    type="text"
                    value={novoComplemento}
                    onChange={(e) => setNovoComplemento(e.target.value)}
                    placeholder="Apto, Sala..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  />
                </div>
              </div>

            </form>
          )}
        </div>

        {/* Rodapé com Botão de Confirmação Único */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onFechar}
            disabled={salvandoNovo}
            className="px-4 py-2.5 rounded-xl border-2 border-emerald-600 text-emerald-400 hover:bg-emerald-950/40 font-semibold text-xs transition cursor-pointer"
          >
            Cancelar
          </button>

          {exibirFormNovo ? (
            <button
              type="submit"
              form="form-novo-endereco-cliente"
              disabled={salvandoNovo}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition disabled:opacity-50 cursor-pointer"
            >
              {salvandoNovo ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirmar}
              disabled={!enderecoEscolhido}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirmar</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
