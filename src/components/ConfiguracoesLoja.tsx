import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  Store,
  CreditCard,
  Truck,
  Printer
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { FormaPagamento, FormaEntrega } from '../types';

export const ConfiguracoesLoja: React.FC = () => {
  const { loja, recarregarDadosLoja } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();

  useEffect(() => {
    if (!permissions.podeAcessarConfig) {
      navigate('/pos');
    }
  }, [permissions.podeAcessarConfig, navigate]);
  const [abaAtiva, setAbaAtiva] = useState<'loja' | 'pagamentos' | 'entrega' | 'recibo'>('loja');
  const [salvando, setSalvando] = useState<boolean>(false);

  const [nomeFantasia, setNomeFantasia] = useState<string>('');
  const [razaoSocial, setRazaoSocial] = useState<string>('');
  const [whatsapp, setWhatsapp] = useState<string>('');
  const [telefone, setTelefone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [slugCatalogo, setSlugCatalogo] = useState<string>('');
  const [sobreLoja, setSobreLoja] = useState<string>('');
  const [corPrimaria, setCorPrimaria] = useState<string>('#10B981');

  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [formasEntrega, setFormasEntrega] = useState<FormaEntrega[]>([]);

  useEffect(() => {
    if (loja) {
      setNomeFantasia(loja.nome_fantasia || '');
      setRazaoSocial(loja.razao_social || '');
      setWhatsapp(loja.whatsapp || '');
      setTelefone(loja.telefone || '');
      setEmail(loja.email || '');
      setSlugCatalogo(loja.slug_catalogo || '');
      setSobreLoja(loja.sobre_loja || '');
      setCorPrimaria(loja.cor_primaria || '#10B981');

      const carregarAux = async () => {
        const { data: p } = await supabase.from('formas_pagamento').select('*').eq('loja_id', loja.id);
        if (p) setFormasPagamento(p);
        const { data: e } = await supabase.from('formas_entrega').select('*').eq('loja_id', loja.id);
        if (e) setFormasEntrega(e);
      };
      carregarAux();
    }
  }, [loja]);

  const handleSalvarLoja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id) return;

    try {
      setSalvando(true);
      const { error } = await supabase
        .from('lojas')
        .update({
          nome_fantasia: nomeFantasia,
          razao_social: razaoSocial,
          whatsapp,
          telefone,
          email,
          slug_catalogo: slugCatalogo,
          sobre_loja: sobreLoja,
          cor_primaria: corPrimaria,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', loja.id);

      if (error) throw error;
      await recarregarDadosLoja();
      alert('Configurações salvas com sucesso!');
    } catch (err: any) {
      alert(`Erro ao salvar: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  const atualizarTaxaPagamento = async (id: string, taxa: number) => {
    try {
      await supabase.from('formas_pagamento').update({ taxa_percentual: taxa }).eq('id', id);
      setFormasPagamento(prev => prev.map(fp => fp.id === id ? { ...fp, taxa_percentual: taxa } : fp));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-slate-950 p-4 md:p-6 space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Settings className="w-5 h-5 text-emerald-400" />
          <span>Configurações do Sistema</span>
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Identificação da sua loja, taxas de cartão, formas de entrega e personalização de recibos.
        </p>

        <div className="flex items-center gap-2 mt-4 overflow-x-auto scrollbar-none">
          {[
            { id: 'loja', label: 'Dados da Loja', icon: Store },
            { id: 'pagamentos', label: 'Taxas de Maquininha', icon: CreditCard },
            { id: 'entrega', label: 'Opções de Frete', icon: Truck },
            { id: 'recibo', label: 'Recibo & Impressão', icon: Printer }
          ].map(aba => {
            const Icon = aba.icon;
            return (
              <button
                key={aba.id}
                onClick={() => setAbaAtiva(aba.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  abaAtiva === aba.id
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{aba.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {abaAtiva === 'loja' && (
        <form onSubmit={handleSalvarLoja} className="max-w-3xl space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-200">Identificação & Catálogo</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Nome Fantasia da Loja *</label>
                <input
                  type="text"
                  required
                  value={nomeFantasia}
                  onChange={(e) => setNomeFantasia(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Razão Social / Titular</label>
                <input
                  type="text"
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">WhatsApp para Pedidos *</label>
                <input
                  type="text"
                  required
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Link do Catálogo (Slug)</label>
                <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl overflow-hidden px-3">
                  <span className="text-xs text-slate-500">hubi.app/</span>
                  <input
                    type="text"
                    required
                    value={slugCatalogo}
                    onChange={(e) => setSlugCatalogo(e.target.value)}
                    className="flex-1 bg-transparent py-2 text-xs text-slate-100 focus:outline-none"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-slate-300 block mb-1">Texto "Sobre a Loja"</label>
                <textarea
                  rows={2}
                  value={sobreLoja}
                  onChange={(e) => setSobreLoja(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-slate-100"
                ></textarea>
              </div>
            </div>

            <button
              type="submit"
              disabled={salvando}
              className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 transition"
            >
              {salvando ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      )}

      {abaAtiva === 'pagamentos' && (
        <div className="max-w-3xl space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-200">Taxas por Meio de Pagamento</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Defina as taxas cobradas pela sua maquininha para cálculo exato do Lucro Líquido Real.
              </p>
            </div>

            <div className="space-y-3">
              {formasPagamento.map(fp => (
                <div key={fp.id} className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-200">{fp.nome}</span>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400">Taxa (%):</label>
                    <input
                      type="number"
                      step="0.1"
                      value={fp.taxa_percentual}
                      onChange={(e) => atualizarTaxaPagamento(fp.id, Number(e.target.value))}
                      className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-right font-bold text-emerald-400"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {abaAtiva === 'entrega' && (
        <div className="max-w-3xl space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-200">Opções de Entrega e Retirada</h2>
            <div className="space-y-3">
              {formasEntrega.map(fe => (
                <div key={fe.id} className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-xs text-slate-200 block">{fe.nome}</span>
                    <span className="text-[10px] text-slate-500 capitalize">{fe.tipo}</span>
                  </div>
                  <span className="font-bold text-xs text-emerald-400">
                    R$ {Number(fe.valor_taxa).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {abaAtiva === 'recibo' && (
        <div className="max-w-3xl space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 md:p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-200">Personalizador de Recibo</h2>
            <p className="text-xs text-slate-400">
              Suporte a impressoras térmicas Bluetooth de <b>58mm</b> e <b>80mm</b> e folhas <b>A4</b>.
            </p>

            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 max-w-xs mx-auto font-mono text-xs text-slate-300 space-y-2 text-center shadow-lg">
              <p className="font-extrabold text-white text-sm">{loja?.nome_fantasia || 'HUBI STORE'}</p>
              <p className="text-[10px] text-slate-500">Tel: {loja?.whatsapp || '(85) 99999-9999'}</p>
              <div className="border-b border-dashed border-slate-700 my-2"></div>
              <p className="text-left">PEDIDO #145</p>
              <p className="text-left text-slate-400">1x Camiseta Dry Fit - R$ 49,90</p>
              <div className="border-b border-dashed border-slate-700 my-2"></div>
              <p className="font-bold text-emerald-400 text-sm">TOTAL: R$ 49,90</p>
              <p className="text-[10px] text-slate-500 mt-2">Obrigado pela preferência!</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
