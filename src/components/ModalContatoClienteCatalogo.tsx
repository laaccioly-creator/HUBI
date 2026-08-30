import React, { useState, useEffect } from 'react';
import { X, User, Phone, Mail, Calendar, FileText, Check, MessageCircle } from 'lucide-react';

export interface DadosContatoCliente {
  nome: string;
  telefone: string;
  telefoneIsWhatsapp: boolean;
  telefone2?: string;
  telefone2IsWhatsapp?: boolean;
  cpfCnpj?: string;
  dataAniversario?: string;
  email?: string;
}

interface ModalContatoClienteCatalogoProps {
  isOpen: boolean;
  onClose: () => void;
  dadosIniciais: DadosContatoCliente;
  onSalvar: (dados: DadosContatoCliente) => void;
}

export const ModalContatoClienteCatalogo: React.FC<ModalContatoClienteCatalogoProps> = ({
  isOpen,
  onClose,
  dadosIniciais,
  onSalvar
}) => {
  const [nome, setNome] = useState(dadosIniciais.nome || '');
  const [telefone, setTelefone] = useState(dadosIniciais.telefone || '');
  const [telefoneIsWhatsapp, setTelefoneIsWhatsapp] = useState(dadosIniciais.telefoneIsWhatsapp ?? true);
  const [telefone2, setTelefone2] = useState(dadosIniciais.telefone2 || '');
  const [telefone2IsWhatsapp, setTelefone2IsWhatsapp] = useState(dadosIniciais.telefone2IsWhatsapp ?? false);
  const [cpfCnpj, setCpfCnpj] = useState(dadosIniciais.cpfCnpj || '');
  const [dataAniversario, setDataAniversario] = useState(dadosIniciais.dataAniversario || '');
  const [email, setEmail] = useState(dadosIniciais.email || '');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNome(dadosIniciais.nome || '');
      setTelefone(dadosIniciais.telefone || '');
      setTelefoneIsWhatsapp(dadosIniciais.telefoneIsWhatsapp ?? true);
      setTelefone2(dadosIniciais.telefone2 || '');
      setTelefone2IsWhatsapp(dadosIniciais.telefone2IsWhatsapp ?? false);
      setCpfCnpj(dadosIniciais.cpfCnpj || '');
      setDataAniversario(dadosIniciais.dataAniversario || '');
      setEmail(dadosIniciais.email || '');
      setErro(null);
    }
  }, [isOpen, dadosIniciais]);

  if (!isOpen) return null;

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
      if (limpo.length <= 3) return limpo;
      if (limpo.length <= 6) return `${limpo.slice(0, 3)}.${limpo.slice(3)}`;
      if (limpo.length <= 9) return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6)}`;
      return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-${limpo.slice(9, 11)}`;
    } else {
      if (limpo.length <= 12) return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8)}`;
      return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12, 14)}`;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      setErro('Por favor, informe seu nome completo.');
      return;
    }
    if (!telefone.trim() || telefone.replace(/\D/g, '').length < 10) {
      setErro('Por favor, informe um telefone válido com DDD (mínimo 10 dígitos).');
      return;
    }

    onSalvar({
      nome: nome.trim(),
      telefone: telefone.trim(),
      telefoneIsWhatsapp,
      telefone2: telefone2.trim() || undefined,
      telefone2IsWhatsapp,
      cpfCnpj: cpfCnpj.trim() || undefined,
      dataAniversario: dataAniversario.trim() || undefined,
      email: email.trim() || undefined
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-100">Dados de Contato</h3>
              <p className="text-[11px] text-slate-400">Identificação do cliente para o pedido</p>
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
          {erro && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {erro}
            </div>
          )}

          {/* Nome Completo */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
              <span>Nome Completo</span>
              <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                placeholder="Ex: Maria da Silva"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Telefones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Telefone 1 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                <span>Telefone Principal / WhatsApp</span>
                <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  required
                  placeholder="(00) 00000-0000"
                  value={telefone}
                  onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                  className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="button"
                onClick={() => setTelefoneIsWhatsapp(!telefoneIsWhatsapp)}
                className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border text-[11px] font-medium transition cursor-pointer ${
                  telefoneIsWhatsapp
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-300'
                }`}
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>{telefoneIsWhatsapp ? '✓ É WhatsApp' : 'Definir como WhatsApp'}</span>
              </button>
            </div>

            {/* Telefone 2 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Telefone 2 (Opcional)</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  placeholder="(00) 0000-0000"
                  value={telefone2}
                  onChange={(e) => setTelefone2(formatarTelefone(e.target.value))}
                  className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="button"
                onClick={() => setTelefone2IsWhatsapp(!telefone2IsWhatsapp)}
                className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border text-[11px] font-medium transition cursor-pointer ${
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

          {/* CPF/CNPJ e Data de Aniversário */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">CPF ou CNPJ (Opcional)</label>
              <div className="relative">
                <FileText className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="000.000.000-00"
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(formatarCpfCnpj(e.target.value))}
                  className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Data de Aniversário (Opcional)</label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  value={dataAniversario}
                  onChange={(e) => setDataAniversario(e.target.value)}
                  className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* E-mail */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">E-mail (Opcional)</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                placeholder="seuemail@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
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
              <span>Confirmar Contato</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
