import React, { useState } from 'react';
import {
  X,
  Store,
  Phone,
  FileText,
  MapPin,
  Sparkles,
  Loader2,
  CheckCircle2,
  Building2,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useFeedbackModal } from '../../contexts/FeedbackContext';
import { useRegisterOverlay } from '../../hooks/useRegisterOverlay';
import { Loja } from '../../types';

interface ModalAdicionarLojaProps {
  isOpen: boolean;
  onClose: () => void;
  onLojaCriada?: (novaLoja: Loja) => void;
}

const ESTADOS_BRASIL = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

export const ModalAdicionarLoja: React.FC<ModalAdicionarLojaProps> = ({
  isOpen,
  onClose,
  onLojaCriada
}) => {
  const { isDark } = useTheme();
  const { organizacao, adicionarNovaFilial, selecionarLoja } = useAuth();
  const { mostrarAlerta, confirmar } = useFeedbackModal();

  const [nome, setNome] = useState<string>('');
  const [whatsapp, setWhatsapp] = useState<string>('');
  const [numeroDocumento, setNumeroDocumento] = useState<string>('');
  const [cidade, setCidade] = useState<string>('');
  const [estado, setEstado] = useState<string>('PE');
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  useRegisterOverlay(isOpen, onClose, 'modal-adicionar-loja');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      setErro('Por favor, informe o nome fantasia da nova filial.');
      return;
    }

    try {
      setSalvando(true);
      setErro(null);

      const novaLoja = await adicionarNovaFilial({
        nome: nomeLimpo,
        whatsapp,
        numero_documento: numeroDocumento,
        cidade: cidade.trim() || undefined,
        estado: estado || undefined
      });

      mostrarAlerta({
        tipo: 'sucesso',
        titulo: 'Nova Filial Adicionada!',
        mensagem: `A unidade "${novaLoja.nome_fantasia}" foi criada com sucesso com 7 dias de degustação gratuita. Você já pode cadastrar produtos e operar o PDV!`
      });

      if (onLojaCriada) {
        onLojaCriada(novaLoja);
      }

      confirmar({
        titulo: 'Alternar para a Nova Filial?',
        mensagem: `Deseja alternar a operação ativa agora para "${novaLoja.nome_fantasia}"?`,
        textoConfirmar: 'Sim, alternar agora',
        textoCancelar: 'Continuar onde estou',
        onConfirmar: async () => {
          await selecionarLoja(novaLoja.id);
          onClose();
        },
        onCancelar: () => {
          onClose();
        }
      });
    } catch (err: any) {
      console.error('[ModalAdicionarLoja] Erro ao criar filial:', err);
      setErro(err.message || 'Erro ao criar nova unidade. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
          isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* CABEÇALHO */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span>Adicionar Nova Loja</span>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase tracking-wider">
                  +7 Dias Trial
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {organizacao?.nome ? `Vinculada ao grupo: ${organizacao.nome}` : 'Expanda sua rede com múltiplos PDVs e catálogos'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CORPO DO FORMULÁRIO */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* BANNER INFORMATIVO TRIAL */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-teal-500/10 border border-emerald-500/30 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <p className="font-bold text-slate-900 dark:text-emerald-400">
                Degustação Gratuita de 7 Dias por Unidade
              </p>
              <p className="text-[11px] leading-relaxed">
                Cada nova filial possui ciclo de vida independente. Esta unidade terá 7 dias de acesso total e irrestrito. Ao final, você poderá ativar a anuidade por apenas R$ 49,90/mês (R$ 598,80/ano em até 12x no Mercado Pago).
              </p>
            </div>
          </div>

          {erro && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {/* CAMPO NOME DA LOJA */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Nome Fantasia da Unidade *</span>
            </label>
            <input
              type="text"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Filial Shopping, Loja 02, Quiosque Centro"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          {/* CAMPO WHATSAPP */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-emerald-500" />
              <span>WhatsApp de Atendimento da Loja</span>
            </label>
            <input
              type="text"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="Ex: (81) 98888-7777"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:border-emerald-500 transition"
            />
            <p className="text-[10px] text-slate-500">
              Pedidos do catálogo virtual desta filial serão enviados para este número.
            </p>
          </div>

          {/* CAMPO CPF / CNPJ OPCIONAL */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>CNPJ ou CPF da Unidade (Opcional)</span>
            </label>
            <input
              type="text"
              value={numeroDocumento}
              onChange={(e) => setNumeroDocumento(e.target.value)}
              placeholder="00.000.000/0001-00"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          {/* CIDADE E UF */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>Cidade</span>
              </label>
              <input
                type="text"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                placeholder="Ex: Recife"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:border-emerald-500 transition"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>UF</span>
              </label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:border-emerald-500 transition"
              >
                {ESTADOS_BRASIL.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* BOTÕES DE AÇÃO */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={salvando}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando || !nome.trim()}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-white flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {salvando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Criando Filial...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Criar Filial & Iniciar Teste</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
