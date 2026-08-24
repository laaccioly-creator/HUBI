import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DollarSign,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Lock,
  Unlock,
  Repeat,
  X,
  ArrowLeft,
  Printer,
  Copy,
  Share2,
  CheckCircle2,
  Banknote,
  Zap,
  CreditCard,
  ArrowDown,
  ArrowUp,
  Info
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { TransacaoFinanceira, Caixa, CaixaMovimentacao, Pedido } from '../types';
import { PrintService } from '../services/printService';

export const FinancasCaixa: React.FC = () => {
  const { loja, usuario } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();

  useEffect(() => {
    if (!permissions.podeAcessarFinancas) {
      navigate('/pos');
    }
  }, [permissions.podeAcessarFinancas, navigate]);

  const [transacoes, setTransacoes] = useState<TransacaoFinanceira[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [caixaAberto, setCaixaAberto] = useState<Caixa | null>(null);
  const [movimentacoesCaixa, setMovimentacoesCaixa] = useState<CaixaMovimentacao[]>([]);
  const [historicoCaixas, setHistoricoCaixas] = useState<Caixa[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [abaAtiva, setAbaAtiva] = useState<'caixa_atual' | 'fluxo' | 'pagar' | 'historico_caixas'>('caixa_atual');
  const [modalDetalhesMetrica, setModalDetalhesMetrica] = useState<'entradas' | 'saidas' | 'pagar' | 'lucro' | null>(null);

  // Modais de Operação
  const [modalNovaDespesa, setModalNovaDespesa] = useState<boolean>(false);
  const [descricao, setDescricao] = useState<string>('');
  const [categoria, setCategoria] = useState<string>('Fornecedor');
  const [valor, setValor] = useState<string>('');
  const [dataVencimento, setDataVencimento] = useState<string>(new Date().toISOString().split('T')[0]);
  const [ehRecorrente, setEhRecorrente] = useState<boolean>(false);
  const [formaPagamentoDespesa, setFormaPagamentoDespesa] = useState<string>('dinheiro');

  // Abertura de Caixa
  const [modalAberturaCaixa, setModalAberturaCaixa] = useState<boolean>(false);
  const [fundoTroco, setFundoTroco] = useState<string>('100.00');
  const [turnoAbertura, setTurnoAbertura] = useState<string>('Integral');
  const [numeroCaixaAbertura, setNumeroCaixaAbertura] = useState<string>('01');

  // Sangria
  const [modalSangria, setModalSangria] = useState<boolean>(false);
  const [valorSangria, setValorSangria] = useState<string>('');
  const [motivoSangria, setMotivoSangria] = useState<string>('');

  // Suprimento
  const [modalSuprimento, setModalSuprimento] = useState<boolean>(false);
  const [valorSuprimento, setValorSuprimento] = useState<string>('');
  const [motivoSuprimento, setMotivoSuprimento] = useState<string>('');

  // Fechamento Cego de Caixa
  const [modalFechamentoCego, setModalFechamentoCego] = useState<boolean>(false);
  const [valorContadoFechamento, setValorContadoFechamento] = useState<string>('');
  const [observacaoFechamento, setObservacaoFechamento] = useState<string>('');
  const [processandoFechamento, setProcessandoFechamento] = useState<boolean>(false);

  // Relatório de Fechamento de Caixa
  const [modalRelatorioFechamento, setModalRelatorioFechamento] = useState<boolean>(false);
  const [relatorioDados, setRelatorioDados] = useState<any | null>(null);
  const [copiadoRelatorio, setCopiadoRelatorio] = useState<boolean>(false);

  // Carregamento de dados
  const carregarFinanceiro = async () => {
    if (!loja?.id) return;
    try {
      setCarregando(true);

      // 1. Carregar transações manuais
      const { data: trData } = await supabase
        .from('transacoes_financeiras')
        .select('*, fornecedor:fornecedores(*)')
        .eq('loja_id', loja.id)
        .order('data_vencimento', { ascending: false });

      if (trData) setTransacoes(trData);

      // 2. Carregar pedidos e pagamentos para unificação do fluxo
      const { data: pedData } = await supabase
        .from('pedidos')
        .select('*, cliente:clientes(*), vendedor:usuarios_loja(*), pagamentos:pagamentos_pedido(*, forma_pagamento:formas_pagamento(*))')
        .eq('loja_id', loja.id)
        .order('criado_em', { ascending: false });

      if (pedData) setPedidos(pedData as unknown as Pedido[]);

      // 3. Carregar Caixa Aberto
      let caixaAtivo: Caixa | null = null;
      try {
        const { data: cxData } = await supabase
          .from('caixas')
          .select('*, usuario:usuarios_loja(*)')
          .eq('loja_id', loja.id)
          .eq('status', 'ABERTO')
          .order('data_abertura', { ascending: false })
          .limit(1);

        if (cxData && cxData.length > 0) {
          const cx = cxData[0];
          const metaLocal = localStorage.getItem(`hubi_caixa_meta_${cx.id}`);
          if (metaLocal) {
            try {
              const parsed = JSON.parse(metaLocal);
              cx.turno = parsed.turno || 'Integral';
              cx.numero_caixa = parsed.numero_caixa || '01';
            } catch (e) {
              console.error(e);
            }
          }
          caixaAtivo = cx;
        }
      } catch (e) {
        console.warn('Aviso ao consultar caixas no Supabase:', e);
      }

      // Se não encontrou no Supabase, verificar fallback local ativo
      if (!caixaAtivo) {
        const localAtivo = localStorage.getItem('hubi_caixa_ativo');
        if (localAtivo) {
          try {
            const parsed = JSON.parse(localAtivo);
            if (parsed.status === 'ABERTO' && parsed.loja_id === loja.id) {
              caixaAtivo = parsed;
            }
          } catch (e) {
            console.error(e);
          }
        }
      }

      setCaixaAberto(caixaAtivo);

      // 4. Carregar histórico de caixas
      let histCaixasLista: Caixa[] = [];
      try {
        const { data: histData } = await supabase
          .from('caixas')
          .select('*, usuario:usuarios_loja(*)')
          .eq('loja_id', loja.id)
          .order('data_abertura', { ascending: false })
          .limit(30);

        if (histData) {
          histCaixasLista = histData.map(cx => {
            const metaLocal = localStorage.getItem(`hubi_caixa_meta_${cx.id}`);
            if (metaLocal) {
              try {
                const parsed = JSON.parse(metaLocal);
                return { ...cx, turno: parsed.turno || cx.turno || 'Integral', numero_caixa: parsed.numero_caixa || cx.numero_caixa || '01' };
              } catch (e) {
                console.error(e);
              }
            }
            return cx;
          });
        }
      } catch (e) {
        console.warn('Aviso ao consultar historico de caixas no Supabase:', e);
      }

      // Conciliar com histórico local caso exista
      const localHist = localStorage.getItem(`hubi_historico_caixas_${loja.id}`);
      if (localHist) {
        try {
          const parsedHist: Caixa[] = JSON.parse(localHist);
          const idsExistentes = new Set(histCaixasLista.map(c => c.id));
          parsedHist.forEach(c => {
            if (!idsExistentes.has(c.id)) {
              histCaixasLista.push(c);
            }
          });
        } catch (e) {
          console.error(e);
        }
      }

      setHistoricoCaixas(histCaixasLista);

      // 5. Carregar movimentações do caixa atual (do Supabase ou localStorage fallback)
      if (caixaAtivo?.id) {
        try {
          const { data: movData } = await supabase
            .from('caixas_movimentacoes')
            .select('*')
            .eq('caixa_id', caixaAtivo.id)
            .order('criado_em', { ascending: true });

          if (movData && movData.length > 0) {
            setMovimentacoesCaixa(movData);
          } else {
            const localMov = localStorage.getItem(`hubi_caixa_mov_${caixaAtivo.id}`);
            if (localMov) setMovimentacoesCaixa(JSON.parse(localMov));
          }
        } catch {
          const localMov = localStorage.getItem(`hubi_caixa_mov_${caixaAtivo.id}`);
          if (localMov) setMovimentacoesCaixa(JSON.parse(localMov));
        }
      } else {
        setMovimentacoesCaixa([]);
      }
    } catch (err) {
      console.error('Erro ao carregar dados financeiros:', err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarFinanceiro();
  }, [loja?.id]);

  // Salvar movimentação auxiliar no storage e supabase
  const registrarMovimentacaoLocal = async (mov: CaixaMovimentacao) => {
    setMovimentacoesCaixa(prev => {
      const nova = [...prev, mov];
      if (mov.caixa_id) {
        localStorage.setItem(`hubi_caixa_mov_${mov.caixa_id}`, JSON.stringify(nova));
      }
      return nova;
    });

    try {
      await supabase.from('caixas_movimentacoes').insert([mov]);
    } catch (e) {
      // Tabela auxiliar silenciosa
    }
  };

  // 1. Cadastrar Nova Despesa (Item 7)
  const handleCadastrarDespesa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissions.ehAdmin) {
      alert('Permissão restrita. Apenas usuários Proprietários (Owner) ou Administradores (Admin) podem lançar despesas.');
      return;
    }
    if (!loja?.id || !descricao.trim() || !valor) return;

    try {
      const valNum = Number(valor);
      const { data, error } = await supabase.from('transacoes_financeiras').insert([
        {
          loja_id: loja.id,
          tipo: 'SAIDA',
          categoria,
          descricao,
          valor: valNum,
          data_vencimento: dataVencimento,
          status: 'pago',
          eh_recorrente: ehRecorrente,
          frequencia_recorrencia: ehRecorrente ? 'mensal' : null,
          forma_pagamento: formaPagamentoDespesa,
          caixa_id: caixaAberto?.id || null
        }
      ]).select().single();

      if (error) throw error;
      if (data) setTransacoes(prev => [data, ...prev]);

      // Se paga em dinheiro no caixa aberto, registrar como movimentação de gaveta
      if (formaPagamentoDespesa === 'dinheiro' && caixaAberto) {
        await registrarMovimentacaoLocal({
          id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now()),
          caixa_id: caixaAberto.id,
          loja_id: loja.id,
          usuario_id: usuario?.id || null,
          tipo: 'despesa',
          forma_pagamento: 'dinheiro',
          valor: valNum,
          descricao: `Despesa: ${descricao} (${categoria})`,
          criado_em: new Date().toISOString()
        });
      }

      setModalNovaDespesa(false);
      setDescricao('');
      setValor('');
      alert('Despesa lançada com sucesso!');
    } catch (err: any) {
      alert(`Erro ao lançar despesa: ${err.message || 'Tente novamente.'}`);
    }
  };

  // 2. Abertura de Caixa (Item 9)
  const handleAbrirCaixa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loja?.id || !usuario?.id) return;
    try {
      const valInicial = Number(fundoTroco) || 0;
      const idGerado = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `cx_${Date.now()}`;
      
      const payloadCaixa = {
        loja_id: loja.id,
        usuario_id: usuario.id,
        saldo_inicial: valInicial,
        status: 'ABERTO' as const
      };

      let caixaSalvo: any = null;

      try {
        const { data, error } = await supabase.from('caixas').insert([payloadCaixa]).select().single();
        if (!error && data) {
          caixaSalvo = data;
        } else if (error) {
          console.warn('Aviso ao inserir no Supabase (RLS ou offline):', error.message);
        }
      } catch (errDb: any) {
        console.warn('Falha DB caixas:', errDb.message);
      }

      // Se o Supabase retornou sucesso ou se usamos o fallback local:
      const idFinal = caixaSalvo?.id || idGerado;
      const dataAberturaFinal = caixaSalvo?.data_abertura || new Date().toISOString();

      const novoCaixa: Caixa = {
        id: idFinal,
        loja_id: loja.id,
        usuario_id: usuario.id,
        saldo_inicial: valInicial,
        data_abertura: dataAberturaFinal,
        status: 'ABERTO',
        turno: turnoAbertura,
        numero_caixa: numeroCaixaAbertura,
        usuario
      };

      // Salvar metadados e caixa ativo localmente
      localStorage.setItem(`hubi_caixa_meta_${idFinal}`, JSON.stringify({
        turno: turnoAbertura,
        numero_caixa: numeroCaixaAbertura
      }));
      localStorage.setItem('hubi_caixa_ativo', JSON.stringify(novoCaixa));

      setCaixaAberto(novoCaixa);
      setModalAberturaCaixa(false);

      await registrarMovimentacaoLocal({
        id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now()),
        caixa_id: idFinal,
        loja_id: loja.id,
        usuario_id: usuario.id,
        tipo: 'abertura',
        forma_pagamento: 'dinheiro',
        valor: valInicial,
        descricao: `Fundo de Troco Inicial (${turnoAbertura})`,
        criado_em: new Date().toISOString()
      });

      alert('Caixa aberto com sucesso!');
    } catch (err: any) {
      alert(`Erro ao abrir caixa: ${err.message || 'Tente novamente.'}`);
    }
  };

  // 3. Registrar Sangria (Retirada)
  const handleRegistrarSangria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissions.ehAdmin) {
      alert('Permissão restrita. Apenas usuários Proprietários (Owner) ou Administradores (Admin) podem realizar sangria.');
      return;
    }
    if (!caixaAberto || !valorSangria) return;

    try {
      const valNum = Number(valorSangria);
      if (valNum <= 0) {
        alert('Informe um valor válido para a sangria.');
        return;
      }

      await registrarMovimentacaoLocal({
        id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now()),
        caixa_id: caixaAberto.id,
        loja_id: loja?.id || '',
        usuario_id: usuario?.id || null,
        tipo: 'sangria',
        forma_pagamento: 'dinheiro',
        valor: valNum,
        descricao: `Sangria: ${motivoSangria || 'Retirada de Dinheiro da Gaveta'}`,
        observacao: motivoSangria,
        criado_em: new Date().toISOString()
      });

      setModalSangria(false);
      setValorSangria('');
      setMotivoSangria('');
      alert(`Sangria de R$ ${valNum.toFixed(2)} registrada com sucesso!`);
    } catch (err: any) {
      alert(`Erro ao registrar sangria: ${err.message}`);
    }
  };

  // 4. Registrar Suprimento (Troco Extra)
  const handleRegistrarSuprimento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissions.ehAdmin) {
      alert('Permissão restrita. Apenas usuários Proprietários (Owner) ou Administradores (Admin) podem realizar suprimento.');
      return;
    }
    if (!caixaAberto || !valorSuprimento) return;

    try {
      const valNum = Number(valorSuprimento);
      if (valNum <= 0) {
        alert('Informe um valor válido para o suprimento.');
        return;
      }

      await registrarMovimentacaoLocal({
        id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now()),
        caixa_id: caixaAberto.id,
        loja_id: loja?.id || '',
        usuario_id: usuario?.id || null,
        tipo: 'suprimento',
        forma_pagamento: 'dinheiro',
        valor: valNum,
        descricao: `Suprimento: ${motivoSuprimento || 'Adição de Troco Extra'}`,
        observacao: motivoSuprimento,
        criado_em: new Date().toISOString()
      });

      setModalSuprimento(false);
      setValorSuprimento('');
      setMotivoSuprimento('');
      alert(`Suprimento de R$ ${valNum.toFixed(2)} registrado com sucesso!`);
    } catch (err: any) {
      alert(`Erro ao registrar suprimento: ${err.message}`);
    }
  };

  // 5. Cálculos do Turno Atual (Item 9 e 4a)
  const apuracaoTurnoAtual = useMemo(() => {
    if (!caixaAberto) {
      return {
        vendasDinheiro: 0,
        qtdDinheiro: 0,
        vendasPix: 0,
        qtdPix: 0,
        vendasDebito: 0,
        qtdDebito: 0,
        vendasCredito: 0,
        qtdCredito: 0,
        totalBruto: 0,
        totalQtdVendas: 0,
        suprimentos: 0,
        sangrias: 0,
        despesasCaixa: 0,
        saldoEsperadoGaveta: 0
      };
    }

    const dataInicio = new Date(caixaAberto.data_abertura).getTime();

    let vendasDinheiro = 0;
    let qtdDinheiro = 0;
    let vendasPix = 0;
    let qtdPix = 0;
    let vendasDebito = 0;
    let qtdDebito = 0;
    let vendasCredito = 0;
    let qtdCredito = 0;

    pedidos.forEach(p => {
      if (p.status === 'cancelado') return;
      const dataPed = new Date(p.data_venda || p.criado_em || '').getTime();
      const pedidoNoTurno = dataPed >= dataInicio;

      if (p.pagamentos && p.pagamentos.length > 0) {
        p.pagamentos.forEach(pag => {
          const dataPag = new Date(pag.criado_em || pag.data_pagamento || p.data_venda || p.criado_em || '').getTime();
          if (dataPag < dataInicio && !pedidoNoTurno) return;

          const tipoRaw = String(pag.forma_pagamento?.tipo || pag.forma_pagamento?.nome || (pag as any).tipo_pagamento || '').toLowerCase();
          const val = Number(pag.valor) || 0;

          if (tipoRaw.includes('debito') || tipoRaw.includes('débito')) {
            vendasDebito += val;
            qtdDebito += 1;
          } else if (tipoRaw.includes('credito') || tipoRaw.includes('crédito')) {
            vendasCredito += val;
            qtdCredito += 1;
          } else if (tipoRaw.includes('pix')) {
            vendasPix += val;
            qtdPix += 1;
          } else {
            vendasDinheiro += val;
            qtdDinheiro += 1;
          }
        });
      } else if (pedidoNoTurno) {
        const val = Number(p.valor_pago || p.valor_total) || 0;
        vendasDinheiro += val;
        qtdDinheiro += 1;
      }
    });

    const suprimentos = movimentacoesCaixa
      .filter(m => m.tipo === 'suprimento')
      .reduce((acc, m) => acc + Number(m.valor || 0), 0);

    const sangrias = movimentacoesCaixa
      .filter(m => m.tipo === 'sangria')
      .reduce((acc, m) => acc + Number(m.valor || 0), 0);

    const despesasCaixa = movimentacoesCaixa
      .filter(m => m.tipo === 'despesa' && (m.forma_pagamento === 'dinheiro' || !m.forma_pagamento))
      .reduce((acc, m) => acc + Number(m.valor || 0), 0);

    const totalBruto = vendasDinheiro + vendasPix + vendasDebito + vendasCredito;
    const totalQtdVendas = qtdDinheiro + qtdPix + qtdDebito + qtdCredito;

    const saldoEsperadoGaveta = Number(caixaAberto.saldo_inicial) + vendasDinheiro + suprimentos - sangrias - despesasCaixa;

    return {
      vendasDinheiro,
      qtdDinheiro,
      vendasPix,
      qtdPix,
      vendasDebito,
      qtdDebito,
      vendasCredito,
      qtdCredito,
      totalBruto,
      totalQtdVendas,
      suprimentos,
      sangrias,
      despesasCaixa,
      saldoEsperadoGaveta
    };
  }, [caixaAberto, pedidos, movimentacoesCaixa]);

  // 6. Etapa 1: Conferir e Gerar Relatório de Fechamento (SEM fechar o caixa automaticamente)
  const handleConferirFechamentoCego = (e: React.FormEvent) => {
    e.preventDefault();
    if (!caixaAberto || valorContadoFechamento === '') return;

    const valorContado = Number(valorContadoFechamento) || 0;
    const {
      vendasDinheiro,
      qtdDinheiro,
      vendasPix,
      qtdPix,
      vendasDebito,
      qtdDebito,
      vendasCredito,
      qtdCredito,
      totalBruto,
      totalQtdVendas,
      suprimentos,
      sangrias,
      despesasCaixa,
      saldoEsperadoGaveta
    } = apuracaoTurnoAtual;

    const diferenca = valorContado - saldoEsperadoGaveta;
    const dataFechamento = new Date().toISOString();

    let situacaoTexto = 'CAIXA CORRETO (Sem divergência)';
    if (diferenca > 0.01) {
      situacaoTexto = `SOBRA DE CAIXA (+R$ ${diferenca.toFixed(2)})`;
    } else if (diferenca < -0.01) {
      situacaoTexto = `FALTA DE CAIXA (-R$ ${Math.abs(diferenca).toFixed(2)})`;
    }

    const relatorioCompleto = {
      isPendenteFechamento: true,
      caixaId: caixaAberto.id,
      caixaNumero: caixaAberto.numero_caixa || '01',
      turno: caixaAberto.turno || 'Integral',
      operadorNome: caixaAberto.usuario?.nome_completo || usuario?.nome_completo || 'Operador',
      dataAbertura: caixaAberto.data_abertura,
      dataFechamento: dataFechamento,
      qtdDinheiro,
      vendasDinheiro,
      qtdPix,
      vendasPix,
      qtdDebito,
      vendasDebito,
      qtdCredito,
      vendasCredito,
      totalQtdVendas,
      totalBruto,
      fundoInicial: Number(caixaAberto.saldo_inicial),
      suprimentos,
      sangrias,
      despesasCaixa,
      saldoEsperadoGaveta,
      valorContado,
      diferenca,
      situacaoTexto,
      observacoes: observacaoFechamento,
      movimentacoes: movimentacoesCaixa
    };

    setRelatorioDados(relatorioCompleto);
    setModalFechamentoCego(false);
    setModalRelatorioFechamento(true);
  };

  // 6b. Etapa 2: Confirmar e Fechar Caixa Definitivamente (Acionado dentro do Relatório)
  const handleConfirmarFechamentoDefinitivo = async () => {
    if (!relatorioDados || !caixaAberto) return;

    try {
      setProcessandoFechamento(true);
      const dataFechamento = new Date().toISOString();

      const payloadFechamento = {
        data_fechamento: dataFechamento,
        saldo_final_declarado: relatorioDados.valorContado,
        saldo_final_calculado: relatorioDados.saldoEsperadoGaveta,
        diferenca_quebra: relatorioDados.diferenca,
        status: 'FECHADO' as const
      };

      try {
        await supabase.from('caixas').update(payloadFechamento).eq('id', caixaAberto.id);
      } catch (errDb: any) {
        console.warn('Aviso fechamento Supabase:', errDb.message);
      }

      // Salvar relatório completo no storage
      try {
        localStorage.setItem(`hubi_caixa_rel_${caixaAberto.id}`, JSON.stringify({
          ...relatorioDados,
          isPendenteFechamento: false,
          dataFechamento
        }));
      } catch (e) {
        console.error(e);
      }

      // Remover caixa ativo local e salvar no histórico local
      localStorage.removeItem('hubi_caixa_ativo');
      if (loja?.id) {
        try {
          const histKey = `hubi_historico_caixas_${loja.id}`;
          const prevHist = localStorage.getItem(histKey);
          const listaHist: Caixa[] = prevHist ? JSON.parse(prevHist) : [];
          const caixaFechadoObj: Caixa = {
            ...caixaAberto,
            data_fechamento: dataFechamento,
            saldo_final_declarado: relatorioDados.valorContado,
            saldo_final_calculado: relatorioDados.saldoEsperadoGaveta,
            diferenca_quebra: relatorioDados.diferenca,
            status: 'FECHADO'
          };
          listaHist.unshift(caixaFechadoObj);
          localStorage.setItem(histKey, JSON.stringify(listaHist.slice(0, 50)));
        } catch (e) {
          console.error(e);
        }
      }

      setRelatorioDados((prev: any) => prev ? { ...prev, isPendenteFechamento: false, dataFechamento } : null);
      setCaixaAberto(null);
      setValorContadoFechamento('');
      setObservacaoFechamento('');

      await carregarFinanceiro();
      alert('Caixa encerrado com sucesso!');
    } catch (err: any) {
      alert(`Erro ao fechar caixa: ${err.message || 'Tente novamente.'}`);
    } finally {
      setProcessandoFechamento(false);
    }
  };

  // Gerar texto puro idêntico ao modelo solicitado
  const gerarTextoRelatorioPlain = (dados: any) => {
    if (!dados) return '';
    const formatMoeda = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dtAbertura = new Date(dados.dataAbertura).toLocaleString('pt-BR');
    const dtFechamento = new Date(dados.dataFechamento).toLocaleString('pt-BR');

    return `======================================================================
                  RELATÓRIO DE FECHAMENTO DE CAIXA                    
======================================================================
Caixa Nº: ${dados.caixaNumero.toString().padEnd(22)} Turno: ${dados.turno}
Operador: ${dados.operadorNome.padEnd(22)} Data/Hora Abertura: ${dtAbertura}
Status: FECHADO                 Data/Hora Fechamento: ${dtFechamento}
----------------------------------------------------------------------

RESUMO POR FORMA DE PAGAMENTO (VENDAS TOTAIS)
----------------------------------------------------------------------
Forma de Pagamento          Qtd. Transações             Valor Total (R$)
----------------------------------------------------------------------
Dinheiro                                  ${String(dados.qtdDinheiro).padStart(2)}                    ${formatMoeda(dados.vendasDinheiro).padStart(10)}
Pix (Mercado Pago / QrCode)               ${String(dados.qtdPix).padStart(2)}                    ${formatMoeda(dados.vendasPix).padStart(10)}
Cartão de Débito                          ${String(dados.qtdDebito).padStart(2)}                    ${formatMoeda(dados.vendasDebito).padStart(10)}
Cartão de Crédito                         ${String(dados.qtdCredito).padStart(2)}                    ${formatMoeda(dados.vendasCredito).padStart(10)}
----------------------------------------------------------------------
TOTAL BRUTO FATURADO                      ${String(dados.totalQtdVendas).padStart(2)}                    ${formatMoeda(dados.totalBruto).padStart(10)}

MOVIMENTAÇÃO DE DINHEIRO (GAVETA FÍSICA)
----------------------------------------------------------------------
(+) Fundo de Troco Inicial (Abertura):                        R$ ${formatMoeda(dados.fundoInicial).padStart(8)}
(+) Vendas em Dinheiro:                                       R$ ${formatMoeda(dados.vendasDinheiro).padStart(8)}
(+) Suprimentos Extras:                                       R$ ${formatMoeda(dados.suprimentos).padStart(8)}
(-) Sangrias (Retiradas p/ Cofre):                           -R$ ${formatMoeda(dados.sangrias).padStart(8)}
(-) Despesas Pagas no Caixa:                                 -R$ ${formatMoeda(dados.despesasCaixa).padStart(8)}
----------------------------------------------------------------------
(=) SALDO TEÓRICO ESPERADO NA GAVETA:                         R$ ${formatMoeda(dados.saldoEsperadoGaveta).padStart(8)}

CONCILIAÇÃO & CONFERÊNCIA
----------------------------------------------------------------------
Valor Informado / Contado pelo Operador:                      R$ ${formatMoeda(dados.valorContado).padStart(8)}
Diferença de Caixa (Sobra / Falta):                            R$ ${formatMoeda(dados.diferenca).padStart(8)}
Situação: ${dados.situacaoTexto}

----------------------------------------------------------------------
OBSERVAÇÕES / OCORRÊNCIAS
${dados.observacoes ? `- ${dados.observacoes}` : '- Nenhuma observação registrada.'}
======================================================================
Assinatura do Operador: _____________________________________________
Assinatura do Supervisor: ___________________________________________
`;
  };

  const handleCopiarRelatorio = () => {
    const texto = gerarTextoRelatorioPlain(relatorioDados);
    navigator.clipboard.writeText(texto);
    setCopiadoRelatorio(true);
    setTimeout(() => setCopiadoRelatorio(false), 2500);
  };

  const handleImprimirRelatorio = () => {
    if (relatorioDados) {
      PrintService.printFechamentoCaixa(relatorioDados, loja, '80mm');
    }
  };

  const handleEnviarWhatsappRelatorio = () => {
    const texto = gerarTextoRelatorioPlain(relatorioDados);
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, '_blank');
  };

  // 7. Lista unificada de transações com descrições limpas e sem duplicações (Item 8 e 4b)
  const listaTransacoesUnificada = useMemo(() => {
    const resultado: Array<{
      id: string;
      tipo: 'ENTRADA' | 'SAIDA';
      categoria: string;
      descricao: string;
      valor: number;
      data: string;
      status: string;
      ehRecorrente?: boolean;
      formaPagamento?: string;
    }> = [];

    // Mapeamento de pedidos por id e por numero_pedido para enriquecer transações de vendas
    const pedidosMap = new Map<string, Pedido>();
    const pedidosNumMap = new Map<number, Pedido>();
    pedidos.forEach(p => {
      pedidosMap.set(p.id, p);
      if (p.numero_pedido != null) {
        pedidosNumMap.set(Number(p.numero_pedido), p);
      }
    });

    // Rastrear quais pedidos já possuem transação financeira registrada
    const pedidosContabilizados = new Set<string>();

    // 1. Processar todas as transações financeiras reais da tabela transacoes_financeiras
    transacoes.forEach(t => {
      const tipo = String(t.tipo || '').toUpperCase() === 'SAIDA' || String(t.tipo || '').toLowerCase() === 'despesa'
        ? 'SAIDA'
        : 'ENTRADA';

      let descFormatada = t.descricao || (tipo === 'ENTRADA' ? 'Recebimento Venda' : 'Despesa');
      let fpNome = t.forma_pagamento || undefined;
      let categoria = t.categoria || (tipo === 'ENTRADA' ? 'Venda Balcão / PDV' : 'Despesas Gerais');

      // Se a transação estiver atrelada a um pedido
      let ped: Pedido | undefined = undefined;
      if (t.pedido_id) {
        ped = pedidosMap.get(t.pedido_id);
        pedidosContabilizados.add(t.pedido_id);
        if (ped && ped.numero_pedido != null) {
          pedidosContabilizados.add(String(ped.numero_pedido));
        }
      }

      // Procurar por menção ao número do pedido ou venda na descrição
      const numMatch = descFormatada.match(/(?:recebimento\s+)?(?:pedido|venda)\s*#\s*(\d+)/i);
      if (numMatch && numMatch[1]) {
        const numPed = Number(numMatch[1]);
        pedidosContabilizados.add(String(numPed));
        if (!ped) {
          ped = pedidosNumMap.get(numPed);
          if (ped) pedidosContabilizados.add(ped.id);
        }
      }

      if (ped) {
        pedidosContabilizados.add(ped.id);
        if (ped.numero_pedido != null) pedidosContabilizados.add(String(ped.numero_pedido));
        const nomeCli = ped.cliente?.nome || 'Cliente Balcão';
        descFormatada = `Recebimento Venda #${ped.numero_pedido} - ${nomeCli}`;
        if (!fpNome && ped.pagamentos && ped.pagamentos.length > 0) {
          fpNome = ped.pagamentos[0].forma_pagamento?.nome;
        }
      } else {
        descFormatada = descFormatada.replace(/recebimento pedido #/gi, 'Recebimento Venda #');
      }

      const status = String(t.status || 'pago').toLowerCase();

      resultado.push({
        id: t.id,
        tipo,
        categoria,
        descricao: descFormatada,
        valor: Number(t.valor || 0),
        data: t.data_pagamento || t.data_vencimento || t.criado_em || new Date().toISOString(),
        status: status === 'pago' ? 'pago' : status === 'pendente' ? 'pendente' : status,
        ehRecorrente: t.eh_recorrente,
        formaPagamento: fpNome
      });
    });

    // 2. Fallback: Se houver pedidos que porventura não tenham registro em transacoes_financeiras
    pedidos.forEach(p => {
      if (p.status === 'cancelado') return;
      if (pedidosContabilizados.has(p.id)) return;
      if (p.numero_pedido != null && pedidosContabilizados.has(String(p.numero_pedido))) return;

      const valPago = Number(p.valor_pago || 0);
      if (valPago <= 0) return; // Pedidos pendentes sem pagamento realizado não entram no fluxo de caixa

      const nomeCliente = p.cliente?.nome || 'Cliente Balcão';
      const fpNome = p.pagamentos?.[0]?.forma_pagamento?.nome || 'Dinheiro';

      resultado.push({
        id: `ped_${p.id}`,
        tipo: 'ENTRADA',
        categoria: 'Venda Balcão / PDV',
        descricao: `Recebimento Venda #${p.numero_pedido} - ${nomeCliente}`,
        valor: valPago,
        data: p.data_venda || p.criado_em || new Date().toISOString(),
        status: p.status_pagamento === 'pago' || p.status === 'concluido' ? 'pago' : 'concluído',
        formaPagamento: fpNome
      });
    });

    // Ordenar por data decrescente
    return resultado.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [pedidos, transacoes]);

  const totalReceitas = listaTransacoesUnificada
    .filter(t => t.tipo === 'ENTRADA' && (t.status === 'pago' || t.status === 'concluido' || t.status === 'concluído'))
    .reduce((acc, t) => acc + t.valor, 0);

  const totalDespesasPagas = listaTransacoesUnificada
    .filter(t => t.tipo === 'SAIDA' && (t.status === 'pago' || t.status === 'concluido' || t.status === 'concluído'))
    .reduce((acc, t) => acc + t.valor, 0);

  const totalDespesasPendentes = listaTransacoesUnificada
    .filter(t => t.tipo === 'SAIDA' && t.status === 'pendente')
    .reduce((acc, t) => acc + t.valor, 0);

  const lucroLiquido = totalReceitas - totalDespesasPagas;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950 font-sans">
      {/* ========================================================================= */}
      {/* HEADER SUPERIOR                                                           */}
      {/* ========================================================================= */}
      <div className="p-4 md:p-6 border-b border-slate-800 bg-slate-900/60 backdrop-blur space-y-4 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition cursor-pointer"
              title="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <span>Finanças & Fluxo de Caixa</span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Controle de frente de caixa, sangrias, suprimentos, despesas e apuração cega de turnos.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {caixaAberto ? (
              <>
                {permissions.ehAdmin && (
                  <>
                    <button
                      type="button"
                      onClick={() => setModalSuprimento(true)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-400 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                      title="Adicionar Troco Extra"
                    >
                      <ArrowDown className="w-4 h-4 text-emerald-400" />
                      <span>Suprimento</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setModalSangria(true)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-rose-400 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                      title="Retirar Dinheiro para o Cofre"
                    >
                      <ArrowUp className="w-4 h-4 text-rose-400" />
                      <span>Sangria</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setModalFechamentoCego(true)}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  <span>Fechar Caixa</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setModalAberturaCaixa(true)}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Unlock className="w-4 h-4" />
                <span>Abrir Caixa</span>
              </button>
            )}

            {permissions.ehAdmin && (
              <button
                type="button"
                onClick={() => setModalNovaDespesa(true)}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs shadow-lg shadow-rose-500/25 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Despesa</span>
              </button>
            )}
          </div>
        </div>

        {/* CARDS DE RESUMO FINANCEIRO GERAL COMPACTOS COM BOTÃO DETALHAR */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {/* Entradas Totais */}
          <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-3 space-y-1.5 shadow-sm transition">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 flex items-center gap-1 font-semibold">
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" /> Entradas
              </span>
              <button
                type="button"
                onClick={() => setModalDetalhesMetrica('entradas')}
                className="px-2 py-0.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-bold transition cursor-pointer border border-emerald-500/20"
                title="Detalhar Entradas"
              >
                Detalhar
              </button>
            </div>
            <span className="text-base font-black text-emerald-400 block truncate">R$ {totalReceitas.toFixed(2)}</span>
          </div>

          {/* Despesas */}
          <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-3 space-y-1.5 shadow-sm transition">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 flex items-center gap-1 font-semibold">
                <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" /> Despesas
              </span>
              <button
                type="button"
                onClick={() => setModalDetalhesMetrica('saidas')}
                className="px-2 py-0.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] font-bold transition cursor-pointer border border-rose-500/20"
                title="Detalhar Despesas"
              >
                Detalhar
              </button>
            </div>
            <span className="text-base font-black text-rose-400 block truncate">R$ {totalDespesasPagas.toFixed(2)}</span>
          </div>

          {/* Contas a Pagar */}
          <div className="bg-slate-900/90 border border-amber-500/30 hover:border-amber-500/50 rounded-2xl p-3 space-y-1.5 shadow-sm transition">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-amber-400 flex items-center gap-1 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" /> A Pagar
              </span>
              <button
                type="button"
                onClick={() => setModalDetalhesMetrica('pagar')}
                className="px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-[10px] font-bold transition cursor-pointer border border-amber-500/20"
                title="Detalhar Contas a Pagar"
              >
                Detalhar
              </button>
            </div>
            <span className="text-base font-black text-amber-400 block truncate">R$ {totalDespesasPendentes.toFixed(2)}</span>
          </div>

          {/* Resultado Acumulado */}
          <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-3 space-y-1.5 shadow-sm transition">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 font-semibold truncate block">Resultado Acumulado</span>
              <button
                type="button"
                onClick={() => setModalDetalhesMetrica('lucro')}
                className="px-2 py-0.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-[10px] font-bold transition cursor-pointer border border-indigo-500/20 shrink-0"
                title="Detalhar Resultado Acumulado"
              >
                Detalhar
              </button>
            </div>
            <span className={`text-base font-black block truncate ${lucroLiquido >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>
              R$ {lucroLiquido.toFixed(2)}
            </span>
          </div>
        </div>

        {/* NAVEGAÇÃO DE ABAS (ORDEM: TURNO/GAVETA ATUAL, FLUXO GERAL, CONTAS A PAGAR, HISTÓRICO) */}
        <div className="flex items-center gap-2 border-b border-slate-800 overflow-x-auto">
          <button
            type="button"
            onClick={() => setAbaAtiva('caixa_atual')}
            className={`pb-2 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer ${
              abaAtiva === 'caixa_atual' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Turno / Gaveta Atual {caixaAberto ? '🟢' : '⚪'}
          </button>
          <button
            type="button"
            onClick={() => setAbaAtiva('fluxo')}
            className={`pb-2 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer ${
              abaAtiva === 'fluxo' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Fluxo Geral ({listaTransacoesUnificada.length})
          </button>
          <button
            type="button"
            onClick={() => setAbaAtiva('pagar')}
            className={`pb-2 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer ${
              abaAtiva === 'pagar' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Contas a Pagar ({listaTransacoesUnificada.filter(t => t.tipo === 'SAIDA' && t.status === 'pendente').length})
          </button>
          <button
            type="button"
            onClick={() => setAbaAtiva('historico_caixas')}
            className={`pb-2 px-3 text-xs font-bold border-b-2 transition whitespace-nowrap cursor-pointer ${
              abaAtiva === 'historico_caixas' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Histórico de Fechamentos ({historicoCaixas.length})
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CORPO / LISTAGEM DA ABA SELECIONADA                                       */}
      {/* ========================================================================= */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
        {carregando ? (
          <div className="text-center py-16 text-slate-500 text-sm">Carregando dados financeiros...</div>
        ) : (
          <>
            {/* ABA 1 & 2: FLUXO GERAL / CONTAS A PAGAR */}
            {(abaAtiva === 'fluxo' || abaAtiva === 'pagar') && (
              <div className="space-y-2">
                {listaTransacoesUnificada
                  .filter(t => (abaAtiva === 'pagar' ? t.tipo === 'SAIDA' && t.status === 'pendente' : true))
                  .map((tr) => (
                    <div
                      key={tr.id}
                      className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-3.5 flex items-center justify-between gap-4 transition shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            tr.tipo === 'ENTRADA' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                          }`}
                        >
                          {tr.tipo === 'ENTRADA' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                        </div>

                        <div>
                          <h4 className="text-xs font-bold text-slate-100">{tr.descricao}</h4>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5 flex-wrap">
                            <span className="font-semibold text-slate-300">{tr.categoria}</span>
                            {tr.formaPagamento && (
                              <>
                                <span>•</span>
                                <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded uppercase font-bold text-[9px]">
                                  {tr.formaPagamento}
                                </span>
                              </>
                            )}
                            <span>•</span>
                            <span>{new Date(tr.data).toLocaleDateString('pt-BR')}</span>
                            {tr.ehRecorrente && (
                              <span className="text-indigo-400 flex items-center gap-0.5">
                                <Repeat className="w-2.5 h-2.5" /> Mensal
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`font-bold text-sm block ${
                            tr.tipo === 'ENTRADA' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {tr.tipo === 'ENTRADA' ? '+' : '-'} R$ {tr.valor.toFixed(2)}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-slate-500">
                          {tr.status}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* ABA 3: TURNO / GAVETA ATUAL (RESUMO EM TEMPO REAL) */}
            {abaAtiva === 'caixa_atual' && (
              <div className="space-y-6 max-w-4xl mx-auto">
                {caixaAberto ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          <span className="font-bold text-xs text-emerald-400 uppercase tracking-wider">Caixa Aberto - Turno {caixaAberto.turno || 'Integral'}</span>
                        </div>
                        <h3 className="text-lg font-black text-slate-100 mt-1">Caixa Nº {caixaAberto.numero_caixa || '01'}</h3>
                        <p className="text-xs text-slate-400">
                          Aberto às {new Date(caixaAberto.data_abertura).toLocaleTimeString('pt-BR')} por {caixaAberto.usuario?.nome_completo || 'Operador'}
                        </p>
                      </div>

                      <div className="bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-right">
                        <span className="text-[11px] text-slate-400 block font-semibold">Fundo de Troco Inicial</span>
                        <span className="text-base font-black text-emerald-400">R$ {Number(caixaAberto.saldo_inicial).toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Resumo por Forma de Pagamento */}
                    <div>
                      <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-3">Vendas do Turno por Método de Pagamento</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400 font-semibold">Dinheiro</span>
                            <Banknote className="w-4 h-4 text-emerald-400" />
                          </div>
                          <span className="text-base font-bold text-emerald-400 block">R$ {apuracaoTurnoAtual.vendasDinheiro.toFixed(2)}</span>
                          <span className="text-[10px] text-slate-500">{apuracaoTurnoAtual.qtdDinheiro} transações</span>
                        </div>

                        <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400 font-semibold">Pix</span>
                            <Zap className="w-4 h-4 text-cyan-400" />
                          </div>
                          <span className="text-base font-bold text-cyan-400 block">R$ {apuracaoTurnoAtual.vendasPix.toFixed(2)}</span>
                          <span className="text-[10px] text-slate-500">{apuracaoTurnoAtual.qtdPix} transações</span>
                        </div>

                        <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400 font-semibold">Cartão Débito</span>
                            <CreditCard className="w-4 h-4 text-blue-400" />
                          </div>
                          <span className="text-base font-bold text-blue-400 block">R$ {apuracaoTurnoAtual.vendasDebito.toFixed(2)}</span>
                          <span className="text-[10px] text-slate-500">{apuracaoTurnoAtual.qtdDebito} transações</span>
                        </div>

                        <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400 font-semibold">Cartão Crédito</span>
                            <CreditCard className="w-4 h-4 text-purple-400" />
                          </div>
                          <span className="text-base font-bold text-purple-400 block">R$ {apuracaoTurnoAtual.vendasCredito.toFixed(2)}</span>
                          <span className="text-[10px] text-slate-500">{apuracaoTurnoAtual.qtdCredito} transações</span>
                        </div>
                      </div>
                    </div>

                    {/* Movimentações da Gaveta Física */}
                    <div className="border-t border-slate-800 pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Movimentações de Dinheiro (Gaveta)</h4>
                        {permissions.ehAdmin ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setModalSuprimento(true)}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-bold rounded-xl border border-slate-700 cursor-pointer"
                            >
                              + Suprimento
                            </button>
                            <button
                              type="button"
                              onClick={() => setModalSangria(true)}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-400 text-xs font-bold rounded-xl border border-slate-700 cursor-pointer"
                            >
                              - Sangria
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">Movimentações restritas a administradores</span>
                        )}
                      </div>

                      <div className="space-y-2">
                        {movimentacoesCaixa.length === 0 ? (
                          <p className="text-xs text-slate-500 py-4 text-center">Nenhuma sangria ou suprimento registrado neste turno.</p>
                        ) : (
                          movimentacoesCaixa.map(m => (
                            <div key={m.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                              <div>
                                <span className="font-bold text-slate-200 block">{m.descricao}</span>
                                <span className="text-[10px] text-slate-500">{new Date(m.criado_em || '').toLocaleTimeString('pt-BR')}</span>
                              </div>
                              <span className={`font-bold ${m.tipo === 'sangria' || m.tipo === 'despesa' ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {m.tipo === 'sangria' || m.tipo === 'despesa' ? '-' : '+'} R$ {Number(m.valor).toFixed(2)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Botão de Fechar Caixa */}
                    <div className="border-t border-slate-800 pt-4 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => setModalFechamentoCego(true)}
                        className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-2xl shadow-lg shadow-amber-500/25 transition cursor-pointer"
                      >
                        Realizar Fechamento Cego de Caixa
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-4 shadow-xl">
                    <div className="w-16 h-16 rounded-3xl bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center mx-auto">
                      <Lock className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-slate-100">Nenhum Caixa Aberto no Momento</h3>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                        Abra o caixa informando o fundo de troco para iniciar o turno de atendimento e registro de vendas.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalAberturaCaixa(true)}
                      className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs rounded-2xl shadow-lg shadow-emerald-500/25 transition cursor-pointer"
                    >
                      Abrir Novo Caixa
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ABA 4: HISTÓRICO DE FECHAMENTOS DE CAIXA */}
            {abaAtiva === 'historico_caixas' && (
              <div className="space-y-3 max-w-5xl mx-auto">
                {historicoCaixas.length === 0 ? (
                  <div className="text-center py-16 text-slate-500 text-sm">Nenhum histórico de caixa fechado.</div>
                ) : (
                  historicoCaixas.map((cx) => (
                    <div
                      key={cx.id}
                      className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-100">Caixa Nº {cx.numero_caixa || '01'} • Turno {cx.turno || 'Integral'}</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            cx.status === 'ABERTO' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {cx.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Operador: {cx.usuario?.nome_completo || 'Operador'} • Abertura: {new Date(cx.data_abertura).toLocaleString('pt-BR')}
                          {cx.data_fechamento && ` • Fechamento: ${new Date(cx.data_fechamento).toLocaleString('pt-BR')}`}
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 block">Diferença</span>
                          <span className={`text-xs font-bold ${
                            Number(cx.diferenca_quebra || 0) === 0 ? 'text-emerald-400' : Number(cx.diferenca_quebra || 0) > 0 ? 'text-cyan-400' : 'text-rose-400'
                          }`}>
                            {Number(cx.diferenca_quebra || 0) === 0 ? 'R$ 0,00' : `R$ ${Number(cx.diferenca_quebra).toFixed(2)}`}
                          </span>
                        </div>

                        {cx.data_fechamento && (
                          <button
                            type="button"
                            onClick={() => {
                              const relCached = localStorage.getItem(`hubi_caixa_rel_${cx.id}`);
                              if (relCached) {
                                try {
                                  setRelatorioDados(JSON.parse(relCached));
                                  setModalRelatorioFechamento(true);
                                  return;
                                } catch (e) {
                                  console.error(e);
                                }
                              }

                              const rel = {
                                caixaNumero: cx.numero_caixa || '01',
                                turno: cx.turno || 'Integral',
                                operadorNome: cx.usuario?.nome_completo || 'Operador',
                                dataAbertura: cx.data_abertura,
                                dataFechamento: cx.data_fechamento,
                                qtdDinheiro: 0,
                                vendasDinheiro: Number(cx.total_vendas_dinheiro || 0),
                                qtdPix: 0,
                                vendasPix: Number(cx.total_vendas_pix || 0),
                                qtdDebito: 0,
                                vendasDebito: Number(cx.total_vendas_debito || 0),
                                qtdCredito: 0,
                                vendasCredito: Number(cx.total_vendas_credito || 0),
                                totalQtdVendas: 0,
                                totalBruto: Number(cx.total_vendas_dinheiro || 0) + Number(cx.total_vendas_pix || 0) + Number(cx.total_vendas_debito || 0) + Number(cx.total_vendas_credito || 0),
                                fundoInicial: Number(cx.saldo_inicial || 0),
                                suprimentos: Number(cx.total_suprimentos || 0),
                                sangrias: Number(cx.total_sangrias || 0),
                                despesasCaixa: Number(cx.total_despesas_caixa || 0),
                                saldoEsperadoGaveta: Number(cx.saldo_final_calculado || 0),
                                valorContado: Number(cx.saldo_final_declarado || 0),
                                diferenca: Number(cx.diferenca_quebra || 0),
                                situacaoTexto: Number(cx.diferenca_quebra || 0) === 0 ? 'CAIXA CORRETO (Sem divergência)' : Number(cx.diferenca_quebra || 0) > 0 ? `SOBRA DE CAIXA (+R$ ${Number(cx.diferenca_quebra).toFixed(2)})` : `FALTA DE CAIXA (-R$ ${Math.abs(Number(cx.diferenca_quebra)).toFixed(2)})`,
                                observacoes: cx.observacoes
                              };
                              setRelatorioDados(rel);
                              setModalRelatorioFechamento(true);
                            }}
                            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 text-xs font-bold transition cursor-pointer"
                            title="Visualizar Relatório de Fechamento"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: LANÇAR NOVA DESPESA (ITEM 7)                                       */}
      {/* ========================================================================= */}
      {modalNovaDespesa && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-100">Lançar Nova Despesa</h3>
              <button onClick={() => setModalNovaDespesa(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCadastrarDespesa} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 font-semibold block mb-1">Descrição do Gasto *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Compra de Gelo / Limpeza / Fornecedor"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">Valor (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Ex: 40.00"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-semibold block mb-1">Categoria</label>
                  <select
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                  >
                    <option value="Fornecedor">Fornecedor / Insumos</option>
                    <option value="Aluguel">Aluguel / Ponto</option>
                    <option value="Energia/Água">Energia / Água / Internet</option>
                    <option value="Salário">Salário / Comissão</option>
                    <option value="Marketing">Marketing / Anúncios</option>
                    <option value="Outros">Outros / Avulso</option>
                  </select>
                </div>
              </div>

              {/* Forma de Pagamento da Despesa (Item 7) */}
              <div>
                <label className="text-xs text-slate-300 font-semibold block mb-1">Forma de Pagamento da Despesa *</label>
                <select
                  value={formaPagamentoDespesa}
                  onChange={(e) => setFormaPagamentoDespesa(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-bold focus:outline-none focus:border-emerald-500"
                >
                  <option value="dinheiro">Dinheiro (Gaveta do Caixa Aberto)</option>
                  <option value="pix">Pix</option>
                  <option value="debito">Cartão de Débito</option>
                  <option value="credito">Cartão de Crédito</option>
                  <option value="transferencia">Transferência Bancária / Boleto</option>
                </select>
                {formaPagamentoDespesa === 'dinheiro' && caixaAberto && (
                  <span className="text-[10px] text-amber-400 block mt-1">
                    ℹ️ Esta despesa será debitada automaticamente da gaveta do caixa atual.
                  </span>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-300 font-semibold block mb-1">Data</label>
                <input
                  type="date"
                  value={dataVencimento}
                  onChange={(e) => setDataVencimento(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chkRecorrente"
                  checked={ehRecorrente}
                  onChange={(e) => setEhRecorrente(e.target.checked)}
                  className="rounded border-slate-700"
                />
                <label htmlFor="chkRecorrente" className="text-xs text-slate-300 font-medium cursor-pointer">
                  Despesa Fixa Recorrente (Repetir mensalmente)
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-rose-500 hover:bg-rose-400 font-bold text-white text-xs shadow-lg shadow-rose-500/25 transition mt-2 cursor-pointer"
              >
                Salvar Despesa
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ABERTURA DE CAIXA (ITEM 9)                                         */}
      {/* ========================================================================= */}
      {modalAberturaCaixa && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-100">Abertura de Caixa</h3>
              <button onClick={() => setModalAberturaCaixa(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAbrirCaixa} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Nº do Caixa:</label>
                  <input
                    type="text"
                    value={numeroCaixaAbertura}
                    onChange={(e) => setNumeroCaixaAbertura(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Turno:</label>
                  <select
                    value={turnoAbertura}
                    onChange={(e) => setTurnoAbertura(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-semibold"
                  >
                    <option value="Manhã">Manhã</option>
                    <option value="Tarde">Tarde</option>
                    <option value="Noite">Noite</option>
                    <option value="Integral">Integral</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Fundo de Troco Inicial em Dinheiro (R$):
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ex: 200.00"
                  value={fundoTroco}
                  onChange={(e) => setFundoTroco(e.target.value)}
                  className="w-full bg-slate-800 border border-emerald-500 rounded-xl px-4 py-2.5 text-base font-bold text-emerald-400 text-center"
                />
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400">
                Operador autenticado: <strong className="text-slate-200">{usuario?.nome_completo || 'Operador'}</strong>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 transition cursor-pointer"
              >
                Confirmar Abertura de Caixa
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SANGRIA (RETIRADA DE DINHEIRO)                                      */}
      {/* ========================================================================= */}
      {modalSangria && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <ArrowUp className="w-5 h-5 text-rose-400" />
                <span>Sangria de Caixa (Retirada)</span>
              </h3>
              <button onClick={() => setModalSangria(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRegistrarSangria} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Valor a Retirar da Gaveta (R$):</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ex: 500.00"
                  value={valorSangria}
                  onChange={(e) => setValorSangria(e.target.value)}
                  className="w-full bg-slate-800 border border-rose-500/60 rounded-xl px-4 py-2.5 text-base font-bold text-rose-400 text-center"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Motivo / Destino:</label>
                <input
                  type="text"
                  placeholder="Ex: Recolhimento para cofre / depósito bancário"
                  value={motivoSangria}
                  onChange={(e) => setMotivoSangria(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs shadow-lg shadow-rose-500/25 transition cursor-pointer"
              >
                Confirmar Sangria
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SUPRIMENTO (TROCO EXTRA)                                           */}
      {/* ========================================================================= */}
      {modalSuprimento && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <ArrowDown className="w-5 h-5 text-emerald-400" />
                <span>Suprimento de Caixa (Troco Extra)</span>
              </h3>
              <button onClick={() => setModalSuprimento(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRegistrarSuprimento} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Valor a Adicionar na Gaveta (R$):</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Ex: 100.00"
                  value={valorSuprimento}
                  onChange={(e) => setValorSuprimento(e.target.value)}
                  className="w-full bg-slate-800 border border-emerald-500/60 rounded-xl px-4 py-2.5 text-base font-bold text-emerald-400 text-center"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Motivo / Origem:</label>
                <input
                  type="text"
                  placeholder="Ex: Adição de moedas / notas trocadas"
                  value={motivoSuprimento}
                  onChange={(e) => setMotivoSuprimento(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 transition cursor-pointer"
              >
                Confirmar Suprimento
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: FECHAMENTO DE CAIXA COM CONFERÊNCIA CEGA (ITEM 9)                  */}
      {/* ========================================================================= */}
      {modalFechamentoCego && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-100">Fechamento Cego de Caixa</h3>
                <p className="text-xs text-slate-400">Contagem física de dinheiro da gaveta</p>
              </div>
              <button onClick={() => setModalFechamentoCego(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConferirFechamentoCego} className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 text-xs text-amber-300 space-y-1">
                <span className="font-bold block">🔒 Procedimento de Conferência Cega:</span>
                <p className="text-[11px] leading-tight text-amber-200/80">
                  Conte todo o dinheiro físico presente na gaveta e digite o total abaixo. O sistema apurará as vendas, sangrias e suprimentos automaticamente para gerar o relatório final para conferência.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-200 block mb-1">
                  Valor Total Contado na Gaveta em Dinheiro (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={valorContadoFechamento}
                  onChange={(e) => setValorContadoFechamento(e.target.value)}
                  className="w-full bg-slate-800 border border-amber-500 rounded-xl px-4 py-3 text-lg font-black text-amber-400 text-center focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Observações / Ocorrências do Turno:</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Sangria realizada às 19:30 por Gerente Ana; comprovante de gelo anexado."
                  value={observacaoFechamento}
                  onChange={(e) => setObservacaoFechamento(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 transition cursor-pointer"
              >
                Conferir e Gerar Relatório de Fechamento
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RELATÓRIO OFICIAL DE FECHAMENTO DE CAIXA (ITEM 5 e 4c)              */}
      {/* ========================================================================= */}
      {modalRelatorioFechamento && relatorioDados && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl p-6 space-y-5 shadow-2xl my-8 animate-in zoom-in-95 duration-150">
            {/* Topo do Modal */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-400 font-bold flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-100">Relatório de Fechamento de Caixa</h3>
                  <p className="text-xs text-slate-400">
                    Caixa Nº <span className="text-slate-200 font-bold">{relatorioDados.caixaNumero}</span> • Turno: <span className="text-slate-200 font-bold">{relatorioDados.turno}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalRelatorioFechamento(false)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metadados do Turno */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-950 p-3 rounded-2xl border border-slate-800 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 font-semibold block">Operador Responsável</span>
                <span className="text-slate-200 font-bold truncate block">{relatorioDados.operadorNome}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-semibold block">Data / Hora Abertura</span>
                <span className="text-slate-300 font-medium">{new Date(relatorioDados.dataAbertura).toLocaleString('pt-BR')}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-semibold block">Data / Hora Fechamento</span>
                <span className="text-slate-300 font-medium">{new Date(relatorioDados.dataFechamento).toLocaleString('pt-BR')}</span>
              </div>
            </div>

            {/* Cards de Resumo Executivo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-1">
                <span className="text-[11px] text-slate-400 font-semibold block">Total Faturado</span>
                <span className="text-lg font-black text-emerald-400 block">R$ {Number(relatorioDados.totalBruto).toFixed(2)}</span>
                <span className="text-[10px] text-slate-500">{relatorioDados.totalQtdVendas} vendas registradas</span>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 space-y-1">
                <span className="text-[11px] text-slate-400 font-semibold block">Esperado em Gaveta</span>
                <span className="text-lg font-black text-slate-100 block">R$ {Number(relatorioDados.saldoEsperadoGaveta).toFixed(2)}</span>
                <span className="text-[10px] text-slate-500">Fundo + Dinheiro - Sangrias</span>
              </div>

              <div className={`rounded-2xl p-3.5 space-y-1 border ${
                relatorioDados.diferenca === 0
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                  : relatorioDados.diferenca > 0
                  ? 'bg-blue-950/30 border-blue-500/40 text-blue-300'
                  : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
              }`}>
                <span className="text-[11px] font-semibold block">Contado / Diferença</span>
                <span className="text-lg font-black block">R$ {Number(relatorioDados.valorContado).toFixed(2)}</span>
                <span className="text-[10px] font-bold block">
                  {relatorioDados.diferenca === 0 ? '✓ Caixa Conferido' : relatorioDados.diferenca > 0 ? `+ R$ ${relatorioDados.diferenca.toFixed(2)} (Sobra)` : `- R$ ${Math.abs(relatorioDados.diferenca).toFixed(2)} (Falta)`}
                </span>
              </div>
            </div>

            {/* Tabela de Vendas por Meio de Pagamento */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-300 block">Vendas por Meio de Pagamento:</span>
              <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-[11px] uppercase font-semibold">
                    <tr>
                      <th className="p-2.5">Forma</th>
                      <th className="p-2.5 text-center">Qtd</th>
                      <th className="p-2.5 text-right">Total (R$)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    <tr>
                      <td className="p-2.5 font-medium text-slate-200">Dinheiro</td>
                      <td className="p-2.5 text-center text-slate-400">{relatorioDados.qtdDinheiro || 0}</td>
                      <td className="p-2.5 text-right font-bold text-slate-100">R$ {Number(relatorioDados.vendasDinheiro || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium text-slate-200">Pix</td>
                      <td className="p-2.5 text-center text-slate-400">{relatorioDados.qtdPix || 0}</td>
                      <td className="p-2.5 text-right font-bold text-cyan-400">R$ {Number(relatorioDados.vendasPix || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium text-slate-200">Cartão de Débito</td>
                      <td className="p-2.5 text-center text-slate-400">{relatorioDados.qtdDebito || 0}</td>
                      <td className="p-2.5 text-right font-bold text-blue-400">R$ {Number(relatorioDados.vendasDebito || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-medium text-slate-200">Cartão de Crédito</td>
                      <td className="p-2.5 text-center text-slate-400">{relatorioDados.qtdCredito || 0}</td>
                      <td className="p-2.5 text-right font-bold text-purple-400">R$ {Number(relatorioDados.vendasCredito || 0).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Observações se houver */}
            {relatorioDados.observacoes && (
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl text-xs space-y-1">
                <span className="text-slate-400 font-semibold block">Observações do Fechamento:</span>
                <p className="text-slate-200">{relatorioDados.observacoes}</p>
              </div>
            )}

            {/* Ações de Fechamento, Impressão e Compartilhamento */}
            <div className="flex items-center justify-between gap-2 pt-2 flex-wrap border-t border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopiarRelatorio}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Copy className="w-4 h-4 text-slate-400" />
                  <span>{copiadoRelatorio ? 'Copiado!' : 'Copiar Texto'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleEnviarWhatsappRelatorio}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>WhatsApp</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleImprimirRelatorio}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-slate-400" />
                  <span>Imprimir</span>
                </button>

                {relatorioDados.isPendenteFechamento && caixaAberto && (
                  <button
                    type="button"
                    disabled={processandoFechamento}
                    onClick={handleConfirmarFechamentoDefinitivo}
                    className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-black flex items-center gap-2 transition cursor-pointer shadow-lg shadow-rose-500/25 active:scale-95 disabled:opacity-50"
                  >
                    <Lock className="w-4 h-4" />
                    <span>{processandoFechamento ? 'Fechando Caixa...' : 'Fechar Caixa'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setModalRelatorioFechamento(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  Fechar Janela
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DETALHAMENTO DE MÉTRICAS FINANCEIRAS (ITEM 7, 4d, 4e)                */}
      {/* ========================================================================= */}
      {modalDetalhesMetrica && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl p-6 space-y-4 shadow-2xl my-8 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 text-indigo-400 font-bold flex items-center justify-center">
                  <Info className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-100">
                    {modalDetalhesMetrica === 'entradas' && 'Detalhamento de Entradas (Receitas)'}
                    {modalDetalhesMetrica === 'saidas' && 'Detalhamento de Despesas'}
                    {modalDetalhesMetrica === 'pagar' && 'Detalhamento de Contas a Pagar'}
                    {modalDetalhesMetrica === 'lucro' && 'Resultado Acumulado'}
                  </h3>
                  <span className="text-xs text-slate-400">Composição detalhada dos valores apurados</span>
                </div>
              </div>
              <button
                onClick={() => setModalDetalhesMetrica(null)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo específico para cada métrica */}
            <div className="space-y-4">
              {modalDetalhesMetrica === 'entradas' && (
                <div className="space-y-3">
                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-semibold">Total de Entradas Recebidas:</span>
                    <span className="text-xl font-black text-emerald-400">R$ {totalReceitas.toFixed(2)}</span>
                  </div>
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-300 block">Últimas Transações de Entrada:</span>
                    <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                      {listaTransacoesUnificada.filter(t => t.tipo === 'ENTRADA').slice(0, 20).map((t) => (
                        <div key={t.id} className="p-2.5 bg-slate-950/70 rounded-xl border border-slate-800/80 flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-slate-200 block truncate">{t.descricao}</span>
                            <span className="text-[10px] text-slate-400">{t.categoria} • {new Date(t.data).toLocaleDateString('pt-BR')}</span>
                          </div>
                          <span className="font-bold text-emerald-400 text-xs shrink-0">+ R$ {t.valor.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {modalDetalhesMetrica === 'saidas' && (
                <div className="space-y-3">
                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-semibold">Total de Despesas:</span>
                    <span className="text-xl font-black text-rose-400">R$ {totalDespesasPagas.toFixed(2)}</span>
                  </div>
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-300 block">Últimas Despesas Registradas:</span>
                    <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                      {listaTransacoesUnificada.filter(t => t.tipo === 'SAIDA' && t.status === 'pago').slice(0, 25).map((t) => {
                        const descLimpa = t.descricao.replace(/\s*\(entrada manual\)/gi, '').trim();
                        return (
                          <div key={t.id} className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/80 flex items-start justify-between gap-4 text-xs">
                            <div className="flex-1 min-w-0">
                              <span className="font-bold text-slate-200 block line-clamp-2 leading-tight">
                                {descLimpa}
                              </span>
                              <span className="text-[10px] text-slate-400 block mt-1">
                                {t.categoria} • {new Date(t.data).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-black text-rose-400 text-xs block">
                                - R$ {t.valor.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {modalDetalhesMetrica === 'pagar' && (
                <div className="space-y-3">
                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <span className="text-xs text-amber-400 font-semibold">Total de Contas Pendentes a Pagar:</span>
                    <span className="text-xl font-black text-amber-400">R$ {totalDespesasPendentes.toFixed(2)}</span>
                  </div>
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-300 block">Lista de Contas a Pagar:</span>
                    <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                      {listaTransacoesUnificada.filter(t => t.tipo === 'SAIDA' && t.status === 'pendente').map((t) => (
                        <div key={t.id} className="p-2.5 bg-slate-950/70 rounded-xl border border-slate-800/80 flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-slate-200 block truncate">{t.descricao}</span>
                            <span className="text-[10px] text-amber-400">Vencimento: {new Date(t.data).toLocaleDateString('pt-BR')}</span>
                          </div>
                          <span className="font-bold text-amber-400 text-xs shrink-0">R$ {t.valor.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {modalDetalhesMetrica === 'lucro' && (
                <div className="space-y-3">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2.5 text-xs">
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="flex items-center gap-1.5 font-medium">
                        <ArrowUpRight className="w-4 h-4 text-emerald-400" /> (+) Entradas / Receitas Totais:
                      </span>
                      <span className="font-bold text-emerald-400 text-sm">+ R$ {totalReceitas.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center text-slate-300">
                      <span className="flex items-center gap-1.5 font-medium">
                        <ArrowDownRight className="w-4 h-4 text-rose-400" /> (-) Saídas / Despesas Pagas:
                      </span>
                      <span className="font-bold text-rose-400 text-sm">- R$ {totalDespesasPagas.toFixed(2)}</span>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                      <span className="font-bold text-slate-100 text-sm">(=) Resultado Acumulado em Caixa:</span>
                      <span className={`text-lg font-black ${lucroLiquido >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>
                        R$ {lucroLiquido.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                    💡 O resultado acumulado considera o fluxo financeiro efetivamente realizado (dinheiro que entrou menos o dinheiro que já foi pago). Contas pendentes a pagar de R$ {totalDespesasPendentes.toFixed(2)} ainda não foram debitadas.
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé */}
            <div className="p-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setModalDetalhesMetrica(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

