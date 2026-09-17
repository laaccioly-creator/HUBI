import React, { useState, useEffect } from 'react';
import {
  X,
  MapPin,
  HelpCircle,
  Navigation,
  Loader2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { Cliente } from '../../types';
import { ClienteEndereco } from '../../types/shipping';
import { supabase } from '../../lib/supabase';
import { ShippingOrchestrator } from '../../services/shippingOrchestrator';

export const ESTADOS_BRASIL = [
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

interface ModalAtualizarEnderecoClienteProps {
  aberto: boolean;
  onFechar: () => void;
  cliente: Cliente;
  onSucesso: (clienteAtualizado: Cliente, enderecoSalvo: ClienteEndereco) => void;
}

export const ModalAtualizarEnderecoCliente: React.FC<ModalAtualizarEnderecoClienteProps> = ({
  aberto,
  onFechar,
  cliente,
  onSucesso
}) => {
  const [cep, setCep] = useState<string>('');
  const [rua, setRua] = useState<string>('');
  const [numero, setNumero] = useState<string>('');
  const [complemento, setComplemento] = useState<string>('');
  const [bairro, setBairro] = useState<string>('');
  const [cidade, setCidade] = useState<string>('');
  const [estado, setEstado] = useState<string>('CE');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  const [carregandoCep, setCarregandoCep] = useState<boolean>(false);
  const [carregandoGeoloc, setCarregandoGeoloc] = useState<boolean>(false);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  useEffect(() => {
    if (aberto && cliente) {
      setCep(cliente.endereco_cep || cliente.cep || '');
      setRua(cliente.endereco_logradouro || cliente.rua || cliente.endereco || '');
      setNumero(cliente.endereco_numero || cliente.numero || '');
      setComplemento(cliente.endereco_complemento || cliente.complemento || '');
      setBairro(cliente.endereco_bairro || cliente.bairro || '');
      setCidade(cliente.endereco_cidade || cliente.cidade || '');
      setEstado(cliente.endereco_estado || cliente.estado || 'CE');
      setLatitude(null);
      setLongitude(null);
      setErroMsg(null);
    }
  }, [aberto, cliente]);

  if (!aberto) return null;

  const formatarCep = (valor: string): string => {
    const limpo = valor.replace(/\D/g, '').slice(0, 8);
    if (limpo.length > 5) {
      return `${limpo.slice(0, 5)}-${limpo.slice(5)}`;
    }
    return limpo;
  };

  const buscarCep = async (cepParaBuscar: string) => {
    const limpo = cepParaBuscar.replace(/\D/g, '');
    if (limpo.length !== 8) return;

    setCarregandoCep(true);
    setErroMsg(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const data = await res.json();
      if (data.erro) {
        setErroMsg('CEP não localizado. Por favor, preencha o endereço manualmente.');
        return;
      }

      if (data.logradouro) setRua(data.logradouro);
      if (data.bairro) setBairro(data.bairro);
      if (data.localidade) setCidade(data.localidade);
      if (data.uf) setEstado(data.uf.toUpperCase());
    } catch (err) {
      console.warn('Erro ao consultar ViaCEP:', err);
      setErroMsg('Não foi possível consultar o CEP automaticamente.');
    } finally {
      setCarregandoCep(false);
    }
  };

  const usarLocalizacaoAtual = () => {
    if (!navigator.geolocation) {
      setErroMsg('Geolocalização não é suportada por este dispositivo.');
      return;
    }

    setCarregandoGeoloc(true);
    setErroMsg(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          setLatitude(lat);
          setLongitude(lon);

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
            const rawCep = (addr.postcode || '').replace(/\D/g, '');

            if (logradouro) setRua(logradouro);
            if (num) setNumero(num);
            if (b) setBairro(b);
            if (cid) setCidade(cid);
            if (rawCep.length === 8) {
              setCep(formatarCep(rawCep));
            }

            if (est) {
              const ufEncontrada = ESTADOS_BRASIL.find(
                e => e.sigla.toLowerCase() === est.toLowerCase() || e.nome.toLowerCase() === est.toLowerCase()
              );
              if (ufEncontrada) setEstado(ufEncontrada.sigla);
              else if (est.length === 2) setEstado(est.toUpperCase());
            }
          }
        } catch (err) {
          console.warn('Erro na geolocalização reversa:', err);
          setErroMsg('Coordenadas obtidas, mas preencha os detalhes do endereço manualmente.');
        } finally {
          setCarregandoGeoloc(false);
        }
      },
      (err) => {
        console.warn('Erro ao obter GPS:', err);
        setErroMsg('Permissão de GPS negada ou indisponível.');
        setCarregandoGeoloc(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroMsg(null);

    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) {
      setErroMsg('Informe um CEP válido com 8 dígitos.');
      return;
    }
    if (!rua.trim()) {
      setErroMsg('Informe o Logradouro / Rua.');
      return;
    }
    if (!numero.trim()) {
      setErroMsg('Informe o Número do endereço.');
      return;
    }
    if (!bairro.trim()) {
      setErroMsg('Informe o Bairro.');
      return;
    }
    if (!cidade.trim()) {
      setErroMsg('Informe a Cidade.');
      return;
    }
    if (!estado.trim()) {
      setErroMsg('Selecione o Estado (UF).');
      return;
    }

    setSalvando(true);
    try {
      const cepLimpo = cep.replace(/\D/g, '');
      const linhaPrincipalFormatada = `${rua.trim()}, ${numero.trim()}${complemento.trim() ? ` (${complemento.trim()})` : ''}, ${bairro.trim()}, ${cidade.trim()}-${estado.trim()} (CEP: ${cepLimpo})`;

      // 1. Atualiza dados oficiais na tabela clientes
      const clienteAtualizadoPayload = {
        endereco_cep: cepLimpo,
        endereco_logradouro: rua.trim(),
        endereco_numero: numero.trim(),
        endereco_complemento: (complemento || '').trim() || null,
        endereco_bairro: bairro.trim(),
        endereco_cidade: cidade.trim(),
        endereco_estado: estado.trim().toUpperCase(),
        endereco_principal: linhaPrincipalFormatada
      };

      const { error: errCli } = await supabase
        .from('clientes')
        .update(clienteAtualizadoPayload)
        .eq('id', cliente.id);

      if (errCli) {
        console.error('Erro ao atualizar tabela clientes:', errCli);
        setErroMsg(`Erro ao salvar no cadastro do cliente: ${errCli.message}`);
        setSalvando(false);
        return;
      }

      // 2. Cria ou atualiza em cliente_enderecos como endereço principal
      const enderecoSalvo = await ShippingOrchestrator.salvarNovoEnderecoCliente(cliente.id, {
        identificador: 'Principal',
        cep: cepLimpo,
        logradouro: rua.trim(),
        numero: numero.trim(),
        complemento: (complemento || '').trim(),
        bairro: bairro.trim(),
        cidade: cidade.trim(),
        uf: estado.trim().toUpperCase(),
        latitude,
        longitude,
        is_principal: true
      });

      const clienteCompleto: Cliente = {
        ...cliente,
        ...clienteAtualizadoPayload,
        cep: cepLimpo,
        rua: rua.trim(),
        endereco: rua.trim(),
        numero: numero.trim(),
        complemento: (complemento || '').trim() || null,
        bairro: bairro.trim(),
        cidade: cidade.trim(),
        estado: estado.trim().toUpperCase()
      };

      onSucesso(clienteCompleto, enderecoSalvo);
      onFechar();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErroMsg(msg || 'Erro ao salvar o endereço do cliente.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-800">
                Endereço Principal
              </h3>
              <p className="text-xs text-slate-500">
                Cliente: <strong className="text-slate-700">{cliente.nome}</strong>
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

        {/* Formulário */}
        <form onSubmit={handleSalvar} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {erroMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{erroMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">Preencha o endereço completo</span>
            {/* Botão de Localização Atual */}
            <button
              type="button"
              disabled={carregandoGeoloc}
              onClick={usarLocalizacaoAtual}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 transition disabled:opacity-50 cursor-pointer"
            >
              {carregandoGeoloc ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
              ) : (
                <Navigation className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>{carregandoGeoloc ? 'Buscando GPS...' : 'Usar Localização Atual'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
            {/* CEP com Botão Não Sei o CEP */}
            <div className="sm:col-span-3 space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">CEP *</label>
                <a
                  href="https://buscacepinter.correios.com.br/app/endereco/index.php"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1 font-medium"
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
                  className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                  required
                />
                {carregandoCep && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 absolute right-3 top-1/2 -translate-y-1/2" />
                )}
              </div>
            </div>

            {/* Estado (UF) */}
            <div className="sm:col-span-3 space-y-1">
              <label className="text-xs font-semibold text-slate-700 block">Estado (UF) *</label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer"
                required
              >
                <option value="">Selecione</option>
                {ESTADOS_BRASIL.map((est) => (
                  <option key={est.sigla} value={est.sigla}>
                    {est.sigla} - {est.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Cidade */}
            <div className="sm:col-span-3 space-y-1">
              <label className="text-xs font-semibold text-slate-700 block">Cidade *</label>
              <input
                type="text"
                placeholder="Nome da cidade"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                required
              />
            </div>

            {/* Bairro */}
            <div className="sm:col-span-3 space-y-1">
              <label className="text-xs font-semibold text-slate-700 block">Bairro *</label>
              <input
                type="text"
                placeholder="Nome do bairro"
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
                className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                required
              />
            </div>

            {/* Logradouro / Rua */}
            <div className="sm:col-span-4 space-y-1">
              <label className="text-xs font-semibold text-slate-700 block">Rua / Logradouro *</label>
              <input
                type="text"
                placeholder="Av., Rua, Travessa..."
                value={rua}
                onChange={(e) => setRua(e.target.value)}
                className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                required
              />
            </div>

            {/* Número */}
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-slate-700 block">Número *</label>
              <input
                type="text"
                placeholder="Ex: 123 ou S/N"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                required
              />
            </div>

            {/* Complemento */}
            <div className="sm:col-span-6 space-y-1">
              <label className="text-xs font-semibold text-slate-700 block">Complemento / Ponto de Ref.</label>
              <input
                type="text"
                placeholder="Apto, Bloco, Casa dos fundos..."
                value={complemento}
                onChange={(e) => setComplemento(e.target.value)}
                className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onFechar}
              disabled={salvando}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition disabled:opacity-50 cursor-pointer"
            >
              {salvando ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Salvando Endereço...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Salvar e Prosseguir</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
