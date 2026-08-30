import React, { useState } from 'react';
import { Search, X, User, Phone, Check, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Cliente } from '../types';

interface ModalBuscaClienteCatalogoProps {
  isOpen: boolean;
  onClose: () => void;
  lojaId: string;
  onSelectCliente: (cliente: Cliente) => void;
}

export const ModalBuscaClienteCatalogo: React.FC<ModalBuscaClienteCatalogoProps> = ({
  isOpen,
  onClose,
  lojaId,
  onSelectCliente
}) => {
  const [nomeBusca, setNomeBusca] = useState<string>('');
  const [carregando, setCarregando] = useState<boolean>(false);
  const [clientesEncontrados, setClientesEncontrados] = useState<Cliente[]>([]);
  const [buscaRealizada, setBuscaRealizada] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleBuscar = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const termo = nomeBusca.trim();
    if (!termo) return;

    try {
      setCarregando(true);
      setErro(null);
      setBuscaRealizada(true);

      const { data, error: err } = await supabase
        .from('clientes')
        .select('*')
        .eq('loja_id', lojaId)
        .ilike('nome', `%${termo}%`)
        .limit(20);

      if (err) {
        console.error('Erro ao buscar clientes:', err);
        setErro('Não foi possível consultar os clientes cadastrados.');
        setClientesEncontrados([]);
        return;
      }

      setClientesEncontrados((data as Cliente[]) || []);
    } catch (e: any) {
      console.error('Erro de busca:', e);
      setErro(e.message || 'Erro ao buscar cadastro.');
    } finally {
      setCarregando(false);
    }
  };

  const handleSelecionar = (cliente: Cliente) => {
    onSelectCliente(cliente);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-100">Já tenho cadastro</h3>
              <p className="text-[11px] text-slate-400">Localize seu cadastro para preencher o pedido</p>
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

        {/* Input de Busca */}
        <form onSubmit={handleBuscar} className="p-4 border-b border-slate-800 bg-slate-900 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              placeholder="Digite seu nome..."
              value={nomeBusca}
              onChange={(e) => setNomeBusca(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            type="submit"
            disabled={!nomeBusca.trim() || carregando}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-600/20"
          >
            {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Buscar</span>}
          </button>
        </form>

        {/* Lista de Resultados */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs">
          {erro && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {carregando && (
            <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <span className="text-xs">Buscando cadastros...</span>
            </div>
          )}

          {!carregando && buscaRealizada && clientesEncontrados.length === 0 && !erro && (
            <div className="py-8 text-center text-slate-400 space-y-2">
              <p className="font-semibold text-slate-300">Nenhum cadastro encontrado com esse nome.</p>
              <p className="text-[11px] text-slate-500">
                Você pode fechar esta busca e clicar em <b>"Contato"</b> e <b>"Endereço"</b> para preencher seus dados.
              </p>
            </div>
          )}

          {!carregando && !buscaRealizada && (
            <div className="py-8 text-center text-slate-500 text-xs">
              Digite seu primeiro nome ou nome completo acima e clique em <b>Buscar</b>.
            </div>
          )}

          {!carregando && clientesEncontrados.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                {clientesEncontrados.length} {clientesEncontrados.length === 1 ? 'cadastro encontrado' : 'cadastros encontrados'} (Toque para selecionar):
              </span>

              {clientesEncontrados.map((cliente) => {
                const fone = cliente.whatsapp || cliente.telefone || cliente.telefone2 || 'Sem telefone registrado';
                return (
                  <button
                    key={cliente.id}
                    type="button"
                    onClick={() => handleSelecionar(cliente)}
                    className="w-full p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700/80 hover:border-emerald-500/50 flex items-center justify-between text-left transition group cursor-pointer"
                  >
                    <div className="space-y-1">
                      <span className="font-bold text-xs text-slate-100 group-hover:text-emerald-400 transition block">
                        {cliente.nome}
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Phone className="w-3 h-3 text-emerald-400" />
                        <span>{fone}</span>
                        {cliente.endereco_cidade && (
                          <span className="text-slate-500 ml-1">• {cliente.endereco_cidade}</span>
                        )}
                      </div>
                    </div>
                    <div className="w-7 h-7 rounded-xl bg-emerald-500/10 group-hover:bg-emerald-500 text-emerald-400 group-hover:text-slate-950 flex items-center justify-center transition">
                      <Check className="w-4 h-4" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40 text-center">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-slate-200 font-medium"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
