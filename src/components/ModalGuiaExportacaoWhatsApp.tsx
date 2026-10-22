import React, { useState } from 'react';
import {
  X,
  Smartphone,
  MessageCircle,
  FileSpreadsheet,
  Download,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  HelpCircle
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { clientImportExportService } from '../services/clientImportExportService';

interface ModalGuiaExportacaoWhatsAppProps {
  isOpen: boolean;
  onClose: () => void;
  onIrParaImportacao?: () => void;
}

export const ModalGuiaExportacaoWhatsApp: React.FC<ModalGuiaExportacaoWhatsAppProps> = ({
  isOpen,
  onClose,
  onIrParaImportacao
}) => {
  const { isDark } = useTheme();
  const [abaAtiva, setAbaAtiva] = useState<'google' | 'whatsapp' | 'planilha'>('google');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`w-full max-w-3xl rounded-3xl border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden transition-all ${
          isDark
            ? 'bg-[#0B151D] border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Cabeçalho */}
        <div
          className={`p-4 sm:p-6 border-b flex items-center justify-between shrink-0 ${
            isDark ? 'border-slate-800/80 bg-slate-900/40' : 'border-slate-100 bg-slate-50/60'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight">
                Como extrair seus contatos para o HUBI
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                Escolha o método mais prático para o seu dia a dia e importe em segundos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl border transition cursor-pointer ${
              isDark
                ? 'border-slate-800 hover:bg-slate-800/60 text-slate-400 hover:text-white'
                : 'border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-black'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas Superiores */}
        <div
          className={`px-4 sm:px-6 pt-3 border-b flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none ${
            isDark ? 'border-slate-800/80 bg-[#091117]' : 'border-slate-200 bg-slate-100/60'
          }`}
        >
          <button
            type="button"
            onClick={() => setAbaAtiva('google')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition border-b-2 cursor-pointer shrink-0 ${
              abaAtiva === 'google'
                ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>1. Celular / Google Contatos</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-extrabold uppercase tracking-wider">
              Recomendado
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva('whatsapp')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition border-b-2 cursor-pointer shrink-0 ${
              abaAtiva === 'whatsapp'
                ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span>2. WhatsApp Web / Business</span>
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva('planilha')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition border-b-2 cursor-pointer shrink-0 ${
              abaAtiva === 'planilha'
                ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>3. Planilha Modelo HUBI</span>
          </button>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-sm">
          {/* ABA 1: GOOGLE CONTATOS */}
          {abaAtiva === 'google' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div
                className={`p-4 rounded-2xl border flex items-start gap-3.5 ${
                  isDark ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50/80 border-emerald-200'
                }`}
              >
                <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <strong className="block text-emerald-600 dark:text-emerald-400 font-black mb-0.5">
                    O caminho mais rápido para quem usa celular Android ou salva contatos no Gmail
                  </strong>
                  Ao exportar seus contatos pelo Google, todos os nomes e números de clientes que você salvou no
                  celular vêm prontos em um único arquivo CSV oficial.
                </div>
              </div>

              {/* Passos Numerados */}
              <div className="grid grid-cols-1 gap-3">
                <div
                  className={`p-4 rounded-2xl border ${
                    isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-black text-xs sm:text-sm text-emerald-500 mb-1">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[11px] font-black">
                      1
                    </span>
                    <span>Acesse o Google Contatos no Navegador</span>
                  </div>
                  <p className="text-xs text-slate-400 ml-7">
                    No seu computador ou celular, abra o site oficial do Google Contatos pelo link:
                  </p>
                  <div className="ml-7 mt-2">
                    <a
                      href="https://contacts.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-sm"
                    >
                      <span>Abrir contacts.google.com</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                <div
                  className={`p-4 rounded-2xl border ${
                    isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-black text-xs sm:text-sm text-emerald-500 mb-1">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[11px] font-black">
                      2
                    </span>
                    <span>Selecione os Contatos ou um Marcador</span>
                  </div>
                  <p className="text-xs text-slate-400 ml-7">
                    Se você tiver uma etiqueta/marcador específico (como <em>"Clientes"</em> ou <em>"Loja"</em>),
                    clique nele no menu lateral esquerdo. Caso queira todos os contatos da agenda, basta permanecer na tela
                    inicial de <strong>Contatos</strong>.
                  </p>
                </div>

                <div
                  className={`p-4 rounded-2xl border ${
                    isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-black text-xs sm:text-sm text-emerald-500 mb-1">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[11px] font-black">
                      3
                    </span>
                    <span>Clique em "Exportar" e marque "CSV do Google"</span>
                  </div>
                  <p className="text-xs text-slate-400 ml-7">
                    No menu lateral esquerdo (ou no ícone de compartilhamento/três pontinhos no topo), clique em{' '}
                    <strong>Exportar</strong>. No pop-up que abrir, confirme a opção <strong>"CSV do Google"</strong> e
                    clique em <strong>Exportar</strong>.
                  </p>
                </div>

                <div
                  className={`p-4 rounded-2xl border ${
                    isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-black text-xs sm:text-sm text-emerald-500 mb-1">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[11px] font-black">
                      4
                    </span>
                    <span>Arraste o arquivo baixado para o HUBI</span>
                  </div>
                  <p className="text-xs text-slate-400 ml-7">
                    O arquivo <strong>contacts.csv</strong> será baixado no seu dispositivo. Agora basta enviá-lo aqui no
                    HUBI — nosso sistema reconhece automaticamente os nomes, limpa prefixos e organiza os números para
                    você!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ABA 2: WHATSAPP WEB */}
          {abaAtiva === 'whatsapp' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div
                className={`p-4 rounded-2xl border flex items-start gap-3.5 ${
                  isDark ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50/80 border-amber-200'
                }`}
              >
                <Zap className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <strong className="block text-amber-600 dark:text-amber-400 font-black mb-0.5">
                    Extraia contatos diretamente das conversas e etiquetas do WhatsApp
                  </strong>
                  Se você conversa com centenas de clientes pelo WhatsApp Business e muitos não estão salvos na agenda do
                  celular, utilize uma extensão leve de navegador para gerar o arquivo CSV.
                </div>
              </div>

              {/* Passos WhatsApp */}
              <div className="grid grid-cols-1 gap-3">
                <div
                  className={`p-4 rounded-2xl border ${
                    isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-black text-xs sm:text-sm text-emerald-500 mb-1">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[11px] font-black">
                      1
                    </span>
                    <span>Abra o WhatsApp Web no Computador</span>
                  </div>
                  <p className="text-xs text-slate-400 ml-7">
                    Utilize os navegadores <strong>Google Chrome</strong> ou <strong>Microsoft Edge</strong> no seu computador e
                    acesse <code>web.whatsapp.com</code> conectando seu celular via QR Code.
                  </p>
                </div>

                <div
                  className={`p-4 rounded-2xl border ${
                    isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-black text-xs sm:text-sm text-emerald-500 mb-1">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[11px] font-black">
                      2
                    </span>
                    <span>Instale uma Extensão Gratuita de Exportação</span>
                  </div>
                  <p className="text-xs text-slate-400 ml-7">
                    Na Chrome Web Store, procure por extensões confiáveis de exportação de contatos (como{' '}
                    <em>"WAXP - Contacts Exporter for WhatsApp"</em> ou <em>"Export Contacts for WhatsApp"</em>).
                  </p>
                  <div className="ml-7 mt-2">
                    <a
                      href="https://chromewebstore.google.com/search/whatsapp%20contacts%20export"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 hover:border-emerald-500 hover:text-emerald-400 font-bold text-xs transition"
                    >
                      <span>Buscar Extensões na Chrome Web Store</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                <div
                  className={`p-4 rounded-2xl border ${
                    isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-black text-xs sm:text-sm text-emerald-500 mb-1">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[11px] font-black">
                      3
                    </span>
                    <span>Escolha a Origem e Exporte como CSV ou Excel</span>
                  </div>
                  <p className="text-xs text-slate-400 ml-7">
                    Abra a extensão no WhatsApp Web e selecione exportar:
                    <br />
                    • <strong>Todas as conversas / chats recentes</strong>
                    <br />
                    • <strong>Contatos de uma Etiqueta do Business</strong> (ex: <em>Clientes</em>, <em>Pedidos Fechados</em>)
                    <br />• <strong>Participantes de um Grupo VIP de Clientes</strong> da sua loja.
                  </p>
                </div>

                <div
                  className={`p-4 rounded-2xl border ${
                    isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-black text-xs sm:text-sm text-emerald-500 mb-1">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[11px] font-black">
                      4
                    </span>
                    <span>O HUBI faz o trabalho pesado de limpeza</span>
                  </div>
                  <p className="text-xs text-slate-400 ml-7">
                    Mesmo que os números venham com código <code>+55</code>, traços ou sem nome salvo, o motor do HUBI
                    higieniza os dados e preenche automaticamente como <code>Cliente (XX) 9XXXX-XXXX</code>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ABA 3: PLANILHA MODELO HUBI */}
          {abaAtiva === 'planilha' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div
                className={`p-4 rounded-2xl border flex items-start gap-3.5 ${
                  isDark ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50/80 border-emerald-200'
                }`}
              >
                <FileSpreadsheet className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <strong className="block text-emerald-600 dark:text-emerald-400 font-black mb-0.5">
                    Preencha ou cole os dados usando a Planilha Modelo Oficial do HUBI
                  </strong>
                  Perfeito para quem tem uma caderneta física, anotações em papel ou quer migrar contatos de outro sistema
                  de forma rápida e organizada.
                </div>
              </div>

              {/* Box de Download */}
              <div
                className={`p-5 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-4 ${
                  isDark ? 'bg-slate-900/70 border-slate-800' : 'bg-slate-100/80 border-slate-300'
                }`}
              >
                <div>
                  <h4 className="text-sm font-black flex items-center gap-2">
                    <span>Planilha Modelo Simplificada</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-extrabold uppercase">
                      Mais Fácil
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Contém apenas as 4 colunas essenciais: <em>Nome</em>, <em>WhatsApp/Celular</em>, <em>Endereço</em> e{' '}
                    <em>Observações</em>.
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => clientImportExportService.downloadModeloSimplificadoXLSX()}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer shadow-sm"
                    title="Baixar em Excel (.xlsx)"
                  >
                    <Download className="w-4 h-4" />
                    <span>Excel (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => clientImportExportService.downloadModeloSimplificadoCSV()}
                    className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
                      isDark
                        ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                        : 'border-slate-300 hover:bg-slate-200 text-slate-700'
                    }`}
                    title="Baixar em CSV (.csv)"
                  >
                    <Download className="w-4 h-4" />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              {/* Dica Inteligente */}
              <div
                className={`p-4 rounded-2xl border text-xs space-y-2 ${
                  isDark ? 'bg-[#000000] border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-amber-500">
                  <Sparkles className="w-4 h-4" />
                  <span>Dica de Ouro de Preenchimento:</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Não se preocupe com pontuações! Você pode preencher telefones como <code>(11) 98765-4321</code>,{' '}
                  <code>11987654321</code> ou apenas <code>987654321</code> — se você omitir o DDD, o HUBI insere
                  automaticamente o DDD da sua loja para você não perder tempo.
                </p>
              </div>

              {/* Link para Modelo Completo */}
              <div className="pt-2 text-center sm:text-left">
                <button
                  type="button"
                  onClick={() => clientImportExportService.downloadModeloXLSX()}
                  className="text-xs text-slate-400 hover:text-emerald-500 underline font-medium cursor-pointer transition inline-flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Precisa cadastrar limites de fiado, CPF e datas de aniversário? Baixar Planilha Completa HUBI</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé de Ações */}
        <div
          className={`p-4 sm:p-5 border-t flex flex-col-reverse sm:flex-row items-center justify-between gap-3 shrink-0 ${
            isDark ? 'border-slate-800 bg-[#091117]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Compatível com arquivos .CSV, .XLSX e .XLS</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className={`w-full sm:w-auto px-4 py-2.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                isDark
                  ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                  : 'border-slate-300 hover:bg-slate-200 text-slate-700'
              }`}
            >
              Fechar Guia
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onIrParaImportacao) onIrParaImportacao();
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition shadow-md shadow-emerald-600/20 cursor-pointer active:scale-95"
            >
              <span>Ir para a Importação</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
