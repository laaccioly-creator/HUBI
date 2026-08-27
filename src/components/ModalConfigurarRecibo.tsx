import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowLeft,
  Store,
  HelpCircle,
  Check,
  Loader2
} from 'lucide-react';
import { Loja } from '../types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ModalConfigurarReciboProps {
  aberto: boolean;
  onClose: () => void;
  onSalvo?: () => void;
}

export const ModalConfigurarRecibo: React.FC<ModalConfigurarReciboProps> = ({
  aberto,
  onClose,
  onSalvo
}) => {
  const { loja } = useAuth();
  const [salvando, setSalvando] = useState<boolean>(false);
  const [sucesso, setSucesso] = useState<boolean>(false);

  // Campos de Configuração do Recibo
  const [nomeLoja, setNomeLoja] = useState<string>('');
  const [telefone, setTelefone] = useState<string>('');
  const [endereco, setEndereco] = useState<string>('');
  const [complemento, setComplemento] = useState<string>('');
  const [textoCabecalho, setTextoCabecalho] = useState<string>('');
  const [textoRodape, setTextoRodape] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState<string>('');

  useEffect(() => {
    if (loja) {
      setNomeLoja(loja.nome_fantasia || loja.razao_social || '');
      setTelefone(loja.whatsapp || loja.telefone || '');
      const endFormatado = [
        loja.endereco_logradouro,
        loja.endereco_numero,
        loja.endereco_bairro,
        loja.endereco_cidade
      ].filter(Boolean).join(', ');
      setEndereco(endFormatado);
      setLogoUrl((loja as any).logo_url || '');

      const extras = (loja as any).configuracoes_extras || {};
      const configRecibo = extras.recibo || {};
      setComplemento(configRecibo.complemento || '');
      setTextoCabecalho(configRecibo.textoCabecalho || '');
      setTextoRodape(configRecibo.textoRodape || 'Agradecemos a preferência! Volte sempre.');
    }
  }, [loja, aberto]);

  if (!aberto) return null;

  const handleSalvar = async () => {
    if (!loja?.id) return;
    setSalvando(true);
    setSucesso(false);

    try {
      const extras = (loja as any).configuracoes_extras || {};
      const novasConfigs = {
        ...extras,
        recibo: {
          ...(extras.recibo || {}),
          complemento,
          textoCabecalho,
          textoRodape,
          logoUrl
        }
      };

      const { error } = await supabase
        .from('lojas')
        .update({
          nome_fantasia: nomeLoja,
          whatsapp: telefone,
          telefone: telefone,
          configuracoes_extras: novasConfigs,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', loja.id);

      if (error) throw error;

      setSucesso(true);
      setTimeout(() => {
        setSucesso(false);
        if (onSalvo) onSalvo();
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Erro ao salvar configurações do recibo:', err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* HEADER DA GAVETA (TELA010) */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold text-slate-100">Configurar recibos</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTEÚDO SCROLLÁVEL */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Logo da Loja */}
          <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center space-y-2">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo da Loja"
                className="h-16 max-w-[200px] object-contain rounded-lg bg-white/5 p-1"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400">
                <Store className="w-8 h-8" />
              </div>
            )}
            <span className="text-xs text-slate-400">Logotipo exibido no topo do recibo impresso</span>
          </div>

          {/* Grupo 1: Dados da Loja (TELA010) */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-200">Dados da Loja</h3>

            {/* Nome da Loja */}
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Nome da Loja</label>
              <input
                type="text"
                value={nomeLoja}
                onChange={(e) => setNomeLoja(e.target.value)}
                placeholder="Nome da sua loja"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Telefone / Celular */}
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Telefone/Celular (opcional)</label>
              <div className="flex items-center gap-2">
                <div className="px-2.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-1.5 text-xs text-slate-300 shrink-0">
                  <span>🇧🇷</span>
                  <span>+55</span>
                </div>
                <input
                  type="text"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(85) 98607-2144"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Endereço */}
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Endereço</label>
              <input
                type="text"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                placeholder="Rua, Número, Bairro, Cidade"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Complemento */}
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Complemento</label>
              <input
                type="text"
                value={complemento}
                onChange={(e) => setComplemento(e.target.value)}
                placeholder="Sala, Andar, Ponto de referência"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Grupo 2: Outras Informações (TELA010) */}
          <div className="space-y-4 pt-2 border-t border-slate-800">
            <h3 className="text-sm font-bold text-slate-200">Outras informações</h3>

            {/* Texto do cabeçalho */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-400">Texto do cabeçalho</label>
                <div className="group relative">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-500 cursor-help" />
                  <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block w-48 p-2 bg-slate-800 text-[10px] text-slate-200 rounded-lg shadow-lg border border-slate-700">
                    Mensagem que aparece no início do recibo logo abaixo dos dados da loja.
                  </div>
                </div>
              </div>
              <input
                type="text"
                value={textoCabecalho}
                onChange={(e) => setTextoCabecalho(e.target.value)}
                placeholder="Ex: CNPJ 00.000.000/0001-00 • Chave Pix: financeiro@loja.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Texto do rodapé */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-400">Texto do rodapé</label>
                <div className="group relative">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-500 cursor-help" />
                  <div className="absolute right-0 bottom-full mb-1 hidden group-hover:block w-48 p-2 bg-slate-800 text-[10px] text-slate-200 rounded-lg shadow-lg border border-slate-700">
                    Mensagem de agradecimento ou termos de troca no fim do comprovante.
                  </div>
                </div>
              </div>
              <input
                type="text"
                value={textoRodape}
                onChange={(e) => setTextoRodape(e.target.value)}
                placeholder="Ex: Agradecemos a preferência! Trocas em até 7 dias com este recibo."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* FOOTER COM BOTÕES VOLTAR / SALVAR (TELA010) */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition cursor-pointer"
          >
            Voltar
          </button>

          <button
            type="button"
            onClick={handleSalvar}
            disabled={salvando}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
          >
            {salvando ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Salvando...</span>
              </>
            ) : sucesso ? (
              <>
                <Check className="w-3.5 h-3.5 text-white" />
                <span>Salvo com sucesso!</span>
              </>
            ) : (
              <span>Salvar</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
