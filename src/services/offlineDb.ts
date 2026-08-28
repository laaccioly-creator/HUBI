// Serviço de Banco de Dados Local (IndexedDB) para Operação Offline do HUBI PDV

import { Produto, Cliente, FormaPagamento } from '../types';

export interface VendaOfflineFila {
  id_local: string;
  loja_id: string;
  vendedor_id: string;
  cliente_id: string | null;
  origem: string;
  tabela_preco_aplicada: string;
  status: string;
  subtotal: number;
  valor_desconto: number;
  valor_frete: number;
  valor_total: number;
  valor_pago: number;
  saldo_devedor: number;
  fiado_quitado: boolean;
  data_venda: string;
  itens: Array<{
    loja_id: string;
    produto_id: string;
    variacao_id: string | null;
    tabela_preco_utilizada: string;
    nome_produto: string;
    rotulo_variacao: string | null;
    preco_custo_unitario: number;
    preco_venda_unitario: number;
    quantidade: number;
    subtotal: number;
    observacoes: string | null;
  }>;
  pagamento: {
    loja_id: string;
    forma_pagamento_id: string;
    valor: number;
    parcelas: number;
    valor_taxa: number;
    valor_liquido: number;
    data_pagamento: string;
    eh_pagamento_fiado: boolean;
  };
  cliente_dados?: Cliente | null;
  vendedor_dados?: any;
  criado_em: string;
  tentativas_sync: number;
  ultimo_erro?: string;
}

const DB_NAME = 'hubi_pos_offline_db';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

export const abrirBancoOffline = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('produtos')) {
        db.createObjectStore('produtos', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('clientes')) {
        db.createObjectStore('clientes', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('formas_pagamento')) {
        db.createObjectStore('formas_pagamento', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('loja_config')) {
        db.createObjectStore('loja_config', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('pedidos_fila')) {
        const store = db.createObjectStore('pedidos_fila', { keyPath: 'id_local' });
        store.createIndex('criado_em', 'criado_em', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('Erro ao abrir IndexedDB:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

// ==========================================
// OPERAÇÕES DE PRODUTOS
// ==========================================

export const salvarProdutosOffline = async (produtos: Produto[]): Promise<void> => {
  const db = await abrirBancoOffline();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('produtos', 'readwrite');
    const store = tx.objectStore('produtos');

    store.clear(); // Atualiza cache limpo
    for (const p of produtos) {
      store.put(p);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const carregarProdutosOffline = async (): Promise<Produto[]> => {
  const db = await abrirBancoOffline();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('produtos', 'readonly');
    const store = tx.objectStore('produtos');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

// ==========================================
// OPERAÇÕES DE CLIENTES
// ==========================================

export const salvarClientesOffline = async (clientes: Cliente[]): Promise<void> => {
  const db = await abrirBancoOffline();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('clientes', 'readwrite');
    const store = tx.objectStore('clientes');

    store.clear();
    for (const c of clientes) {
      store.put(c);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const carregarClientesOffline = async (): Promise<Cliente[]> => {
  const db = await abrirBancoOffline();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('clientes', 'readonly');
    const store = tx.objectStore('clientes');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

// ==========================================
// OPERAÇÕES DE FORMAS DE PAGAMENTO
// ==========================================

export const salvarFormasPagamentoOffline = async (formas: FormaPagamento[]): Promise<void> => {
  const db = await abrirBancoOffline();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('formas_pagamento', 'readwrite');
    const store = tx.objectStore('formas_pagamento');

    store.clear();
    for (const f of formas) {
      store.put(f);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const carregarFormasPagamentoOffline = async (): Promise<FormaPagamento[]> => {
  const db = await abrirBancoOffline();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('formas_pagamento', 'readonly');
    const store = tx.objectStore('formas_pagamento');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

// ==========================================
// FILA DE VENDAS OFFLINE (SYNC QUEUE)
// ==========================================

export const adicionarVendaFilaOffline = async (venda: VendaOfflineFila): Promise<void> => {
  const db = await abrirBancoOffline();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['pedidos_fila', 'produtos'], 'readwrite');
    const storeFila = tx.objectStore('pedidos_fila');
    const storeProdutos = tx.objectStore('produtos');

    // 1. Inserir na fila de envio
    storeFila.put(venda);

    // 2. Abater estoque localmente no IndexedDB para manter coerência
    for (const item of venda.itens) {
      const getReq = storeProdutos.get(item.produto_id);
      getReq.onsuccess = () => {
        const prod = getReq.result as Produto | undefined;
        if (prod) {
          if (item.variacao_id && prod.variacoes) {
            const v = prod.variacoes.find(varItem => varItem.id === item.variacao_id);
            if (v) {
              v.quantidade_estoque = Math.max(0, (v.quantidade_estoque || 0) - item.quantidade);
            }
          } else {
            prod.quantidade_estoque = Math.max(0, (prod.quantidade_estoque || 0) - item.quantidade);
          }
          storeProdutos.put(prod);
        }
      };
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const obterVendasFilaOffline = async (): Promise<VendaOfflineFila[]> => {
  const db = await abrirBancoOffline();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pedidos_fila', 'readonly');
    const store = tx.objectStore('pedidos_fila');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

export const removerVendaFilaOffline = async (idLocal: string): Promise<void> => {
  const db = await abrirBancoOffline();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pedidos_fila', 'readwrite');
    const store = tx.objectStore('pedidos_fila');
    const request = store.delete(idLocal);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const contarVendasFilaOffline = async (): Promise<number> => {
  try {
    const db = await abrirBancoOffline();
    return new Promise((resolve) => {
      const tx = db.transaction('pedidos_fila', 'readonly');
      const store = tx.objectStore('pedidos_fila');
      const request = store.count();

      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
};
