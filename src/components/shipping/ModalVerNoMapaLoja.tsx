import React, { useState } from 'react';
import {
  X,
  MapPin,
  ExternalLink,
  MessageCircle,
  Copy,
  Check,
  Store,
  Navigation
} from 'lucide-react';
import { gerarLinkWhatsAppLocalizacaoLoja } from '../../utils/geoUtils';

interface ModalVerNoMapaLojaProps {
  aberto: boolean;
  onFechar: () => void;
  loja: {
    nome?: string;
    nome_loja?: string;
    endereco_logradouro?: string | null;
    endereco_numero?: string | null;
    endereco_complemento?: string | null;
    endereco_bairro?: string | null;
    endereco_cidade?: string | null;
    endereco_estado?: string | null;
    endereco_cep?: string | null;
    telefone?: string | null;
    whatsapp?: string | null;
  };
  telefoneCliente?: string | null;
}

export const ModalVerNoMapaLoja: React.FC<ModalVerNoMapaLojaProps> = ({
  aberto,
  onFechar,
  loja,
  telefoneCliente
}) => {
  const [copiado, setCopiado] = useState<boolean>(false);

  if (!aberto) return null;

  const { link: linkWhatsApp, linkMaps } = gerarLinkWhatsAppLocalizacaoLoja(loja, telefoneCliente);

  const enderecoCompleto = [
    loja.endereco_logradouro,
    loja.endereco_numero ? `nº ${loja.endereco_numero}` : '',
    loja.endereco_complemento,
    loja.endereco_bairro,
    loja.endereco_cidade && loja.endereco_estado
      ? `${loja.endereco_cidade} - ${loja.endereco_estado}`
      : loja.endereco_cidade || loja.endereco_estado,
    loja.endereco_cep ? `CEP: ${loja.endereco_cep}` : ''
  ]
    .filter(Boolean)
    .join(', ') || 'Endereço da loja física';

  const queryEncoded = encodeURIComponent(
    [
      loja.endereco_logradouro,
      loja.endereco_numero,
      loja.endereco_bairro,
      loja.endereco_cidade,
      loja.endereco_estado
    ].filter(Boolean).join(', ') || (loja.nome || loja.nome_loja || 'Loja')
  );

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(enderecoCompleto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-100">
                Localização da Loja para Retirada
              </h3>
              <p className="text-xs text-slate-400">
                {loja.nome || loja.nome_loja || 'Ponto de Retirada Oficial'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Card de Endereço */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-bold text-slate-200 block">Endereço de Coleta:</span>
                  <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                    {enderecoCompleto}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopiar}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition shrink-0 cursor-pointer"
                title="Copiar endereço"
              >
                {copiado ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Iframe do Mapa */}
          <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 h-64 sm:h-72 relative">
            <iframe
              title="Mapa da Loja"
              width="100%"
              height="100%"
              style={{ border: 0, filter: 'contrast(1.05) saturate(1.1)' }}
              loading="lazy"
              allowFullScreen
              src={`https://maps.google.com/maps?q=${queryEncoded}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
            />
          </div>
        </div>

        {/* Rodapé com Botões de Ação */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <a
            href={linkMaps}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition"
          >
            <Navigation className="w-4 h-4 text-emerald-400" />
            <span>Como Chegar (Google Maps)</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <a
              href={linkWhatsApp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Enviar para o WhatsApp</span>
            </a>

            <button
              type="button"
              onClick={onFechar}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
