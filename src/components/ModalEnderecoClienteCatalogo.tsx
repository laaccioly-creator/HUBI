import React, { useState, useEffect } from 'react';
import { X, MapPin, Navigation, HelpCircle, Check, Loader2, AlertCircle } from 'lucide-react';

export interface DadosEnderecoCliente {
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
}

interface ModalEnderecoClienteCatalogoProps {
  isOpen: boolean;
  onClose: () => void;
  dadosIniciais: DadosEnderecoCliente;
  onSalvar: (dados: DadosEnderecoCliente, enderecoFormatado: string) => void;
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

export const ModalEnderecoClienteCatalogo: React.FC<ModalEnderecoClienteCatalogoProps> = ({
  isOpen,
  onClose,
  dadosIniciais,
  onSalvar
}) => {
  const [cep, setCep] = useState(dadosIniciais.cep || '');
  const [rua, setRua] = useState(dadosIniciais.rua || '');
  const [numero, setNumero] = useState(dadosIniciais.numero || '');
  const [complemento, setComplemento] = useState(dadosIniciais.complemento || '');
  const [bairro, setBairro] = useState(dadosIniciais.bairro || '');
  const [cidade, setCidade] = useState(dadosIniciais.cidade || '');
  const [estado, setEstado] = useState(dadosIniciais.estado || '');

  const [carregandoCep, setCarregandoCep] = useState(false);
  const [carregandoGeoloc, setCarregandoGeoloc] = useState(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCep(dadosIniciais.cep || '');
      setRua(dadosIniciais.rua || '');
      setNumero(dadosIniciais.numero || '');
      setComplemento(dadosIniciais.complemento || '');
      setBairro(dadosIniciais.bairro || '');
      setCidade(dadosIniciais.cidade || '');
      setEstado(dadosIniciais.estado || '');
      setErroMsg(null);
    }
  }, [isOpen, dadosIniciais]);

  if (!isOpen) return null;

  const formatarCep = (valor: string) => {
    const limpo = valor.replace(/\D/g, '').slice(0, 8);
    if (limpo.length <= 5) return limpo;
    return `${limpo.slice(0, 5)}-${limpo.slice(5, 8)}`;
  };

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

  const usarLocalizacaoAtual = () => {
    if (!navigator.geolocation) {
      setErroMsg('Geolocalização não é suportada pelo seu dispositivo.');
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
              setCep(formatarCep(rawCep));
            }

            if (est) {
              const siglaEncontrada = ESTADOS_BRASIL.find(
                (u) => u.sigla.toLowerCase() === est.toLowerCase() || u.nome.toLowerCase() === est.toLowerCase()
              );
              if (siglaEncontrada) setEstado(siglaEncontrada.sigla);
            }
          }
        } catch (e) {
          console.error('Erro na geolocalização:', e);
          setErroMsg('Não foi possível obter o endereço pela localização atual.');
        } finally {
          setCarregandoGeoloc(false);
        }
      },
      (err) => {
        console.warn('Erro de permissão GPS:', err);
        setCarregandoGeoloc(false);
        setErroMsg('Permissão de localização não concedida.');
      },
      { timeout: 10000 }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rua.trim()) {
      setErroMsg('Por favor, informe a Rua / Logradouro.');
      return;
    }
    if (!numero.trim()) {
      setErroMsg('Por favor, informe o Número do imóvel (ou S/N).');
      return;
    }
    if (!bairro.trim()) {
      setErroMsg('Por favor, informe o Bairro.');
      return;
    }
    if (!cidade.trim()) {
      setErroMsg('Por favor, informe a Cidade.');
      return;
    }

    const partes = [
      rua.trim(),
      numero.trim() ? `nº ${numero.trim()}` : '',
      complemento.trim() ? `(${complemento.trim()})` : '',
      bairro.trim() ? `- ${bairro.trim()}` : '',
      cidade.trim() ? `${cidade.trim()}` : '',
      estado.trim() ? `/${estado.trim()}` : '',
      cep.trim() ? `• CEP: ${cep.trim()}` : ''
    ].filter(Boolean);

    const enderecoFormatado = partes.join(' ');

    onSalvar(
      {
        cep: cep.trim(),
        rua: rua.trim(),
        numero: numero.trim(),
        complemento: complemento.trim(),
        bairro: bairro.trim(),
        cidade: cidade.trim(),
        estado: estado.trim()
      },
      enderecoFormatado
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-100">Endereço de Entrega</h3>
              <p className="text-[11px] text-slate-400">Onde você deseja receber suas compras</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {erroMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{erroMsg}</span>
            </div>
          )}

          {/* Botão de Localização Atual */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
              Localização Rápida
            </span>
            <button
              type="button"
              disabled={carregandoGeoloc}
              onClick={usarLocalizacaoAtual}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition disabled:opacity-50 cursor-pointer shadow-xs"
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
            {/* CEP com Não sei o CEP */}
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
                  className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
                {carregandoCep && (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400 absolute right-3 top-1/2 -translate-y-1/2" />
                )}
              </div>
            </div>

            {/* Estado (UF) */}
            <div className="sm:col-span-3 space-y-1">
              <label className="text-xs font-semibold text-slate-300 block">Estado (UF)</label>
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
            <div className="sm:col-span-4 space-y-1">
              <label className="text-xs font-semibold text-slate-300 block">
                Rua / Logradouro <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Av. Brasil, Rua das Flores"
                value={rua}
                onChange={(e) => setRua(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Número */}
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-slate-300 block">
                Número <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: 123, S/N"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Bairro */}
            <div className="sm:col-span-3 space-y-1">
              <label className="text-xs font-semibold text-slate-300 block">
                Bairro <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Centro, Jardim América"
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Cidade */}
            <div className="sm:col-span-3 space-y-1">
              <label className="text-xs font-semibold text-slate-300 block">
                Cidade <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: São Paulo, Fortaleza"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Complemento / Ponto de Referência */}
            <div className="sm:col-span-6 space-y-1">
              <label className="text-xs font-semibold text-slate-300 block">
                Complemento / Referência (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: Apto 102, Bloco B, Próximo ao supermercado"
                value={complemento}
                onChange={(e) => setComplemento(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Confirmar Endereço</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
