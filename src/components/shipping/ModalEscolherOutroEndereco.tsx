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
  HelpCircle
} from 'lucide-react';
import { ClienteEndereco, NovoEnderecoFormInput } from '../../types/shipping';
import { ShippingOrchestrator } from '../../services/shippingOrchestrator';
import { obterEnderecoPorCoordenadas } from '../../utils/geoUtils';
import { ESTADOS_BRASIL } from './ModalAtualizarEnderecoCliente';

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

    // Validação estrita contra duplicidade na lista do cliente
    const ehDuplicado = enderecos.some(e => {
      const eCep = (e.cep || '').replace(/\D/g, '');
      const eNum = (e.numero || '').trim().toLowerCase();
      const eComp = (e.complemento || '').trim().toLowerCase();
      if (eCep === cepLimpo && eNum === numLimpo) {
        if (!compLimpo && !eComp) return true;
        if (compLimpo === eComp) return true;
      }
      return false;
    });

    if (ehDuplicado) {
      setErroMsg('Este endereço já está cadastrado na sua lista.');
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-800">
                Escolher Endereço de Entrega
              </h3>
              <p className="text-xs text-slate-500">
                Selecione um endereço cadastrado, sua localização atual ou adicione outro
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {erroMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{erroMsg}</span>
            </div>
          )}

          {/* Opção 1: Minha Localização Atual */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700 block">Usar Localização GPS</span>
            <div
              onClick={() => {
                if (enderecoGps) {
                  setEnderecoEscolhido(enderecoGps);
                } else {
                  capturarLocalizacaoAtual();
                }
              }}
              className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                enderecoEscolhido?.id === enderecoGps?.id && enderecoGps
                  ? 'bg-emerald-50/80 border-emerald-500 text-slate-900 shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100/70 border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center shrink-0">
                  {carregandoGps ? (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  ) : (
                    <Navigation className="w-4 h-4 text-emerald-600" />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-slate-900 block">
                    {enderecoGps ? 'Minha Localização Atual (Capturada)' : 'Minha Localização Atual'}
                  </span>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
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
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[11px] font-bold text-white transition"
                  >
                    {carregandoGps ? 'Buscando...' : 'Obter GPS'}
                  </button>
                ) : (
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    enderecoEscolhido?.id === enderecoGps.id
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-300'
                  }`}>
                    {enderecoEscolhido?.id === enderecoGps.id && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Opção 2: Endereços Cadastrados */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700 block">
              Endereços Cadastrados do Cliente ({enderecos.length})
            </span>

            {carregando ? (
              <div className="py-6 flex items-center justify-center gap-2 text-slate-500 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                <span>Carregando endereços...</span>
              </div>
            ) : enderecos.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                Nenhum endereço secundário cadastrado para este cliente.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {enderecos.map((end) => {
                  const estaSelecionado = enderecoEscolhido?.id === end.id;
                  return (
                    <div
                      key={end.id}
                      onClick={() => setEnderecoEscolhido(end)}
                      className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                        estaSelecionado
                          ? 'bg-emerald-50/80 border-emerald-500 text-slate-900 shadow-sm'
                          : 'bg-slate-50 hover:bg-slate-100/70 border-slate-200 text-slate-700'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <MapPin className={`w-4 h-4 shrink-0 mt-0.5 ${estaSelecionado ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">
                              {end.is_principal ? 'Endereço Principal' : (end.identificador === 'Principal' ? 'Endereço Alternativo' : (end.identificador || 'Endereço'))}
                            </span>
                            {end.is_principal && (
                              <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200">
                                Principal
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-700 mt-0.5 truncate">
                            {end.logradouro}, {end.numero} {end.complemento ? `(${end.complemento})` : ''}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {end.bairro}, {end.cidade}-{end.uf} | CEP: {end.cep}
                          </p>
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        estaSelecionado
                          ? 'bg-emerald-600 text-white'
                          : 'border border-slate-300'
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
              className="w-full py-3 rounded-2xl border border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/50 text-slate-600 hover:text-emerald-700 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Adicionar Novo Endereço</span>
            </button>
          ) : (
            <form onSubmit={handleSalvarNovoEndereco} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Cadastrar Novo Endereço</span>
                <button
                  type="button"
                  onClick={() => setExibirFormNovo(false)}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-6 gap-2.5">
                <div className="sm:col-span-3 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 block">Apelido (ex: Trabalho)</label>
                  <input
                    type="text"
                    value={novoIdentificador}
                    onChange={(e) => setNovoIdentificador(e.target.value)}
                    placeholder="Casa, Trabalho..."
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div className="sm:col-span-3 space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-0.5">
                    <label className="text-[11px] font-semibold text-slate-600">CEP *</label>
                    <a
                      href="https://buscacepinter.correios.com.br/app/endereco/index.php"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1 font-medium whitespace-nowrap ml-auto"
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
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      required
                    />
                    {carregandoCepNovo && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 absolute right-2.5 top-1/2 -translate-y-1/2" />
                    )}
                  </div>
                </div>

                <div className="sm:col-span-4 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 block">Rua / Logradouro *</label>
                  <input
                    type="text"
                    value={novoLogradouro}
                    onChange={(e) => setNovoLogradouro(e.target.value)}
                    placeholder="Av., Rua..."
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    required
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 block">Número *</label>
                  <input
                    type="text"
                    value={novoNumero}
                    onChange={(e) => setNovoNumero(e.target.value)}
                    placeholder="123"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    required
                  />
                </div>

                <div className="sm:col-span-3 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 block">Bairro *</label>
                  <input
                    type="text"
                    value={novoBairro}
                    onChange={(e) => setNovoBairro(e.target.value)}
                    placeholder="Bairro"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    required
                  />
                </div>

                <div className="sm:col-span-3 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 block">Cidade *</label>
                  <input
                    type="text"
                    value={novoCidade}
                    onChange={(e) => setNovoCidade(e.target.value)}
                    placeholder="Cidade"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    required
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 block">UF *</label>
                  <select
                    value={novoUf}
                    onChange={(e) => setNovoUf(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
                    required
                  >
                    {ESTADOS_BRASIL.map((est) => (
                      <option key={est.sigla} value={est.sigla}>
                        {est.sigla}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-4 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 block">Complemento</label>
                  <input
                    type="text"
                    value={novoComplemento}
                    onChange={(e) => setNovoComplemento(e.target.value)}
                    placeholder="Apto, Sala..."
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={salvandoNovo}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition cursor-pointer"
                >
                  {salvandoNovo ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Salvar e Usar Este Endereço</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Rodapé com Botão de Confirmação */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onFechar}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirmar}
            disabled={!enderecoEscolhido}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition disabled:opacity-50 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Confirmar Endereço</span>
          </button>
        </div>
      </div>
    </div>
  );
};
