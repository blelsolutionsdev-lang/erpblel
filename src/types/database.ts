// Gerado a partir do schema do Supabase (projeto erpblel).
// Para regenerar: supabase gen types typescript --project-id uwqsrjpekwaeobdlmsuv
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      auditoria: {
        Row: {
          acao: string
          alterado_em: string
          alterado_por: string | null
          id: number
          mudancas: Json
          registro_id: string
          tabela: string
        }
        Insert: {
          acao: string
          alterado_em?: string
          alterado_por?: string | null
          id?: never
          mudancas?: Json
          registro_id: string
          tabela: string
        }
        Update: {
          acao?: string
          alterado_em?: string
          alterado_por?: string | null
          id?: never
          mudancas?: Json
          registro_id?: string
          tabela?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_alterado_por_fkey"
            columns: ["alterado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedor_produto_codigos: {
        Row: {
          codigo: string
          created_at: string
          descricao_fornecedor: string | null
          fornecedor_id: string
          id: string
          produto_id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          descricao_fornecedor?: string | null
          fornecedor_id: string
          id?: string
          produto_id: string
        }
        Update: {
          codigo?: string
          created_at?: string
          descricao_fornecedor?: string | null
          fornecedor_id?: string
          id?: string
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fornecedor_produto_codigos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fornecedor_produto_codigos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_movimentacoes: {
        Row: {
          conta_pagar_id: string | null
          conta_receber_id: string | null
          created_at: string
          created_by: string | null
          data_movimento: string
          descricao: string | null
          forma_pagamento: string | null
          id: string
          tipo: Database["public"]["Enums"]["caixa_movimento_tipo"]
          valor: number
        }
        Insert: {
          conta_pagar_id?: string | null
          conta_receber_id?: string | null
          created_at?: string
          created_by?: string | null
          data_movimento?: string
          descricao?: string | null
          forma_pagamento?: string | null
          id?: string
          tipo: Database["public"]["Enums"]["caixa_movimento_tipo"]
          valor: number
        }
        Update: {
          conta_pagar_id?: string | null
          conta_receber_id?: string | null
          created_at?: string
          created_by?: string | null
          data_movimento?: string
          descricao?: string | null
          forma_pagamento?: string | null
          id?: string
          tipo?: Database["public"]["Enums"]["caixa_movimento_tipo"]
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "caixa_movimentacoes_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_movimentacoes_conta_receber_id_fkey"
            columns: ["conta_receber_id"]
            isOneToOne: false
            referencedRelation: "contas_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_movimentacoes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_financeiras: {
        Row: {
          created_at: string
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["financeiro_categoria_tipo"]
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          tipo: Database["public"]["Enums"]["financeiro_categoria_tipo"]
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["financeiro_categoria_tipo"]
        }
        Relationships: []
      }
      categorias_produtos: {
        Row: {
          categoria_pai_id: string | null
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          categoria_pai_id?: string | null
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          categoria_pai_id?: string | null
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_produtos_categoria_pai_id_fkey"
            columns: ["categoria_pai_id"]
            isOneToOne: false
            referencedRelation: "categorias_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          ativo: boolean
          cpf_cnpj: string | null
          created_at: string
          email: string | null
          endereco: Json
          id: string
          ie: string | null
          nome: string
          nome_fantasia: string | null
          observacoes: string | null
          telefone: string | null
          tipo_pessoa: Database["public"]["Enums"]["pessoa_tipo"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: Json
          id?: string
          ie?: string | null
          nome: string
          nome_fantasia?: string | null
          observacoes?: string | null
          telefone?: string | null
          tipo_pessoa?: Database["public"]["Enums"]["pessoa_tipo"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: Json
          id?: string
          ie?: string | null
          nome?: string
          nome_fantasia?: string | null
          observacoes?: string | null
          telefone?: string | null
          tipo_pessoa?: Database["public"]["Enums"]["pessoa_tipo"]
          updated_at?: string
        }
        Relationships: []
      }
      configuracoes_fiscais: {
        Row: {
          cnpj: string | null
          razao_social: string | null
          nome_fantasia: string | null
          inscricao_estadual: string | null
          regime_tributario: number
          cfop_padrao: string
          csosn_padrao: string
          logradouro: string | null
          numero: string | null
          bairro: string | null
          municipio: string | null
          codigo_municipio: string | null
          uf: string | null
          cep: string | null
          telefone: string | null
          ambiente: Database["public"]["Enums"]["ambiente_fiscal"]
          ativo: boolean
          created_at: string
          focus_nfe_token: string | null
          id: string
          proximo_numero: number
          serie: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          razao_social?: string | null
          nome_fantasia?: string | null
          inscricao_estadual?: string | null
          regime_tributario?: number
          cfop_padrao?: string
          csosn_padrao?: string
          logradouro?: string | null
          numero?: string | null
          bairro?: string | null
          municipio?: string | null
          codigo_municipio?: string | null
          uf?: string | null
          cep?: string | null
          telefone?: string | null
          ambiente?: Database["public"]["Enums"]["ambiente_fiscal"]
          ativo?: boolean
          created_at?: string
          focus_nfe_token?: string | null
          id?: string
          proximo_numero?: number
          serie?: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          razao_social?: string | null
          nome_fantasia?: string | null
          inscricao_estadual?: string | null
          regime_tributario?: number
          cfop_padrao?: string
          csosn_padrao?: string
          logradouro?: string | null
          numero?: string | null
          bairro?: string | null
          municipio?: string | null
          codigo_municipio?: string | null
          uf?: string | null
          cep?: string | null
          telefone?: string | null
          ambiente?: Database["public"]["Enums"]["ambiente_fiscal"]
          ativo?: boolean
          created_at?: string
          focus_nfe_token?: string | null
          id?: string
          proximo_numero?: number
          serie?: string
          updated_at?: string
        }
        Relationships: []
      }
      contas_pagar: {
        Row: {
          valor_pago: number
          juros: number
          desconto: number
          categoria_id: string | null
          created_at: string
          data_emissao: string
          data_pagamento: string | null
          data_vencimento: string
          descricao: string
          forma_pagamento: string | null
          fornecedor_id: string | null
          id: string
          observacoes: string | null
          origem_id: string | null
          origem_tipo: string | null
          status: Database["public"]["Enums"]["titulo_status"]
          updated_at: string
          valor: number
        }
        Insert: {
          valor_pago?: number
          juros?: number
          desconto?: number
          categoria_id?: string | null
          created_at?: string
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento: string
          descricao: string
          forma_pagamento?: string | null
          fornecedor_id?: string | null
          id?: string
          observacoes?: string | null
          origem_id?: string | null
          origem_tipo?: string | null
          status?: Database["public"]["Enums"]["titulo_status"]
          updated_at?: string
          valor: number
        }
        Update: {
          valor_pago?: number
          juros?: number
          desconto?: number
          categoria_id?: string | null
          created_at?: string
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento?: string
          descricao?: string
          forma_pagamento?: string | null
          fornecedor_id?: string | null
          id?: string
          observacoes?: string | null
          origem_id?: string | null
          origem_tipo?: string | null
          status?: Database["public"]["Enums"]["titulo_status"]
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_receber: {
        Row: {
          valor_pago: number
          juros: number
          desconto: number
          categoria_id: string | null
          cliente_id: string | null
          created_at: string
          data_emissao: string
          data_recebimento: string | null
          data_vencimento: string
          descricao: string
          forma_pagamento: string | null
          id: string
          observacoes: string | null
          origem_id: string | null
          origem_tipo: string | null
          status: Database["public"]["Enums"]["titulo_status"]
          updated_at: string
          valor: number
        }
        Insert: {
          valor_pago?: number
          juros?: number
          desconto?: number
          categoria_id?: string | null
          cliente_id?: string | null
          created_at?: string
          data_emissao?: string
          data_recebimento?: string | null
          data_vencimento: string
          descricao: string
          forma_pagamento?: string | null
          id?: string
          observacoes?: string | null
          origem_id?: string | null
          origem_tipo?: string | null
          status?: Database["public"]["Enums"]["titulo_status"]
          updated_at?: string
          valor: number
        }
        Update: {
          valor_pago?: number
          juros?: number
          desconto?: number
          categoria_id?: string | null
          cliente_id?: string | null
          created_at?: string
          data_emissao?: string
          data_recebimento?: string | null
          data_vencimento?: string
          descricao?: string
          forma_pagamento?: string | null
          id?: string
          observacoes?: string | null
          origem_id?: string | null
          origem_tipo?: string | null
          status?: Database["public"]["Enums"]["titulo_status"]
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "contas_receber_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_receber_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      equipamentos: {
        Row: {
          ativo: boolean
          updated_at: string
          cliente_id: string
          created_at: string
          id: string
          marca: string | null
          modelo: string | null
          numero_serie: string | null
          observacoes: string | null
          tipo: string | null
        }
        Insert: {
          ativo?: boolean
          updated_at?: string
          cliente_id: string
          created_at?: string
          id?: string
          marca?: string | null
          modelo?: string | null
          numero_serie?: string | null
          observacoes?: string | null
          tipo?: string | null
        }
        Update: {
          ativo?: boolean
          updated_at?: string
          cliente_id?: string
          created_at?: string
          id?: string
          marca?: string | null
          modelo?: string | null
          numero_serie?: string | null
          observacoes?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          ativo: boolean
          cpf_cnpj: string | null
          created_at: string
          dados_bancarios: Json
          email: string | null
          endereco: Json
          id: string
          ie: string | null
          nome: string
          nome_fantasia: string | null
          observacoes: string | null
          telefone: string | null
          tipo_pessoa: Database["public"]["Enums"]["pessoa_tipo"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cpf_cnpj?: string | null
          created_at?: string
          dados_bancarios?: Json
          email?: string | null
          endereco?: Json
          id?: string
          ie?: string | null
          nome: string
          nome_fantasia?: string | null
          observacoes?: string | null
          telefone?: string | null
          tipo_pessoa?: Database["public"]["Enums"]["pessoa_tipo"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cpf_cnpj?: string | null
          created_at?: string
          dados_bancarios?: Json
          email?: string | null
          endereco?: Json
          id?: string
          ie?: string | null
          nome?: string
          nome_fantasia?: string | null
          observacoes?: string | null
          telefone?: string | null
          tipo_pessoa?: Database["public"]["Enums"]["pessoa_tipo"]
          updated_at?: string
        }
        Relationships: []
      }
      movimentacoes_estoque: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          observacao: string | null
          origem_id: string | null
          origem_tipo: string | null
          preco_unitario: number | null
          produto_id: string
          quantidade: number
          tipo: Database["public"]["Enums"]["movimento_estoque_tipo"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          observacao?: string | null
          origem_id?: string | null
          origem_tipo?: string | null
          preco_unitario?: number | null
          produto_id: string
          quantidade: number
          tipo: Database["public"]["Enums"]["movimento_estoque_tipo"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          observacao?: string | null
          origem_id?: string | null
          origem_tipo?: string | null
          preco_unitario?: number | null
          produto_id?: string
          quantidade?: number
          tipo?: Database["public"]["Enums"]["movimento_estoque_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_estoque_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_fiscais_entrada: {
        Row: {
          chave_acesso: string | null
          created_at: string
          data_emissao: string | null
          fornecedor_id: string | null
          id: string
          numero: string | null
          pdf_url: string | null
          processed_at: string | null
          serie: string | null
          status: Database["public"]["Enums"]["nota_fiscal_entrada_status"]
          valor_total: number | null
          xml_original: string | null
        }
        Insert: {
          chave_acesso?: string | null
          created_at?: string
          data_emissao?: string | null
          fornecedor_id?: string | null
          id?: string
          numero?: string | null
          pdf_url?: string | null
          processed_at?: string | null
          serie?: string | null
          status?: Database["public"]["Enums"]["nota_fiscal_entrada_status"]
          valor_total?: number | null
          xml_original?: string | null
        }
        Update: {
          chave_acesso?: string | null
          created_at?: string
          data_emissao?: string | null
          fornecedor_id?: string | null
          id?: string
          numero?: string | null
          pdf_url?: string | null
          processed_at?: string | null
          serie?: string | null
          status?: Database["public"]["Enums"]["nota_fiscal_entrada_status"]
          valor_total?: number | null
          xml_original?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_entrada_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_fiscais_entrada_itens: {
        Row: {
          cest: string | null
          codigo_produto_fornecedor: string | null
          descricao: string
          id: string
          ncm: string | null
          nota_id: string
          produto_id: string | null
          quantidade: number
          valor_total: number
          valor_unitario: number
        }
        Insert: {
          cest?: string | null
          codigo_produto_fornecedor?: string | null
          descricao: string
          id?: string
          ncm?: string | null
          nota_id: string
          produto_id?: string | null
          quantidade: number
          valor_total: number
          valor_unitario: number
        }
        Update: {
          cest?: string | null
          codigo_produto_fornecedor?: string | null
          descricao?: string
          id?: string
          ncm?: string | null
          nota_id?: string
          produto_id?: string | null
          quantidade?: number
          valor_total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_entrada_itens_nota_id_fkey"
            columns: ["nota_id"]
            isOneToOne: false
            referencedRelation: "notas_fiscais_entrada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_fiscais_entrada_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_fiscais_saida: {
        Row: {
          ambiente: Database["public"]["Enums"]["ambiente_fiscal"]
          emitida_por: string | null
          autorizada_at: string | null
          chave_acesso: string | null
          cliente_id: string | null
          created_at: string
          danfe_url: string | null
          erro_mensagem: string | null
          focus_nfe_ref: string | null
          id: string
          numero: number | null
          os_id: string | null
          serie: string | null
          status: Database["public"]["Enums"]["nfce_status"]
          valor_total: number
          xml_url: string | null
        }
        Insert: {
          ambiente?: Database["public"]["Enums"]["ambiente_fiscal"]
          emitida_por?: string | null
          autorizada_at?: string | null
          chave_acesso?: string | null
          cliente_id?: string | null
          created_at?: string
          danfe_url?: string | null
          erro_mensagem?: string | null
          focus_nfe_ref?: string | null
          id?: string
          numero?: number | null
          os_id?: string | null
          serie?: string | null
          status?: Database["public"]["Enums"]["nfce_status"]
          valor_total?: number
          xml_url?: string | null
        }
        Update: {
          ambiente?: Database["public"]["Enums"]["ambiente_fiscal"]
          emitida_por?: string | null
          autorizada_at?: string | null
          chave_acesso?: string | null
          cliente_id?: string | null
          created_at?: string
          danfe_url?: string | null
          erro_mensagem?: string | null
          focus_nfe_ref?: string | null
          id?: string
          numero?: number | null
          os_id?: string | null
          serie?: string | null
          status?: Database["public"]["Enums"]["nfce_status"]
          valor_total?: number
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_saida_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_fiscais_saida_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_servico: {
        Row: {
          prioridade: Database["public"]["Enums"]["os_prioridade"]
          data_prevista: string | null
          orcamento_enviado_em: string | null
          aprovado_em: string | null
          aprovado_por: string | null
          reprovado_em: string | null
          motivo_reprovacao: string | null
          garantia_dias: number
          garantia_ate: string | null
          assinatura_cliente_nome: string | null
          assinatura_cliente_url: string | null
          assinatura_em: string | null
          cliente_id: string
          conta_receber_id: string | null
          created_at: string
          data_abertura: string
          data_conclusao: string | null
          eh_garantia: boolean
          equipamento_id: string | null
          id: string
          laudo_tecnico: string | null
          numero: number
          os_origem_id: string | null
          problema_relatado: string | null
          status: Database["public"]["Enums"]["os_status"]
          tecnico_id: string | null
          updated_at: string
          valor_acrescimo: number
          valor_desconto: number
          valor_pecas: number
          valor_servicos: number
          valor_total: number | null
        }
        Insert: {
          prioridade?: Database["public"]["Enums"]["os_prioridade"]
          data_prevista?: string | null
          orcamento_enviado_em?: string | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          reprovado_em?: string | null
          motivo_reprovacao?: string | null
          garantia_dias?: number
          garantia_ate?: string | null
          assinatura_cliente_nome?: string | null
          assinatura_cliente_url?: string | null
          assinatura_em?: string | null
          cliente_id: string
          conta_receber_id?: string | null
          created_at?: string
          data_abertura?: string
          data_conclusao?: string | null
          eh_garantia?: boolean
          equipamento_id?: string | null
          id?: string
          laudo_tecnico?: string | null
          numero?: never
          os_origem_id?: string | null
          problema_relatado?: string | null
          status?: Database["public"]["Enums"]["os_status"]
          tecnico_id?: string | null
          updated_at?: string
          valor_acrescimo?: number
          valor_desconto?: number
          valor_pecas?: number
          valor_servicos?: number
          valor_total?: number | null
        }
        Update: {
          prioridade?: Database["public"]["Enums"]["os_prioridade"]
          data_prevista?: string | null
          orcamento_enviado_em?: string | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          reprovado_em?: string | null
          motivo_reprovacao?: string | null
          garantia_dias?: number
          garantia_ate?: string | null
          assinatura_cliente_nome?: string | null
          assinatura_cliente_url?: string | null
          assinatura_em?: string | null
          cliente_id?: string
          conta_receber_id?: string | null
          created_at?: string
          data_abertura?: string
          data_conclusao?: string | null
          eh_garantia?: boolean
          equipamento_id?: string | null
          id?: string
          laudo_tecnico?: string | null
          numero?: never
          os_origem_id?: string | null
          problema_relatado?: string | null
          status?: Database["public"]["Enums"]["os_status"]
          tecnico_id?: string | null
          updated_at?: string
          valor_acrescimo?: number
          valor_desconto?: number
          valor_pecas?: number
          valor_servicos?: number
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_os_conta_receber"
            columns: ["conta_receber_id"]
            isOneToOne: false
            referencedRelation: "contas_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_os_origem_id_fkey"
            columns: ["os_origem_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_servico_itens: {
        Row: {
          created_at: string
          descricao: string
          id: string
          os_id: string
          produto_id: string | null
          quantidade: number
          servico_id: string | null
          tipo: Database["public"]["Enums"]["os_item_tipo"]
          valor_total: number | null
          valor_unitario: number
        }
        Insert: {
          created_at?: string
          descricao: string
          id?: string
          os_id: string
          produto_id?: string | null
          quantidade?: number
          servico_id?: string | null
          tipo: Database["public"]["Enums"]["os_item_tipo"]
          valor_total?: number | null
          valor_unitario?: number
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          os_id?: string
          produto_id?: string | null
          quantidade?: number
          servico_id?: string | null
          tipo?: Database["public"]["Enums"]["os_item_tipo"]
          valor_total?: number | null
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "ordens_servico_itens_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_itens_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      os_anexos: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          nome_arquivo: string | null
          os_id: string
          storage_path: string
          tipo: Database["public"]["Enums"]["os_anexo_tipo"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          nome_arquivo?: string | null
          os_id: string
          storage_path: string
          tipo: Database["public"]["Enums"]["os_anexo_tipo"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          nome_arquivo?: string | null
          os_id?: string
          storage_path?: string
          tipo?: Database["public"]["Enums"]["os_anexo_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "os_anexos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_anexos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          chave: string
          created_at: string
          descricao: string | null
          id: string
          modulo: string
        }
        Insert: {
          chave: string
          created_at?: string
          descricao?: string | null
          id?: string
          modulo: string
        }
        Update: {
          chave?: string
          created_at?: string
          descricao?: string | null
          id?: string
          modulo?: string
        }
        Relationships: []
      }
      produto_kit_itens: {
        Row: {
          componente_produto_id: string
          id: string
          kit_produto_id: string
          quantidade: number
        }
        Insert: {
          componente_produto_id: string
          id?: string
          kit_produto_id: string
          quantidade?: number
        }
        Update: {
          componente_produto_id?: string
          id?: string
          kit_produto_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "produto_kit_itens_componente_produto_id_fkey"
            columns: ["componente_produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_kit_itens_kit_produto_id_fkey"
            columns: ["kit_produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          categoria_id: string | null
          cest: string | null
          codigo_barras: string | null
          created_at: string
          descricao: string | null
          estoque_atual: number
          estoque_maximo: number | null
          estoque_minimo: number
          id: string
          ncm: string | null
          nome: string
          origem_mercadoria: number
          peso_bruto: number | null
          peso_liquido: number | null
          preco_custo: number
          preco_venda: number
          sku: string | null
          tipo: Database["public"]["Enums"]["produto_tipo"]
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria_id?: string | null
          cest?: string | null
          codigo_barras?: string | null
          created_at?: string
          descricao?: string | null
          estoque_atual?: number
          estoque_maximo?: number | null
          estoque_minimo?: number
          id?: string
          ncm?: string | null
          nome: string
          origem_mercadoria?: number
          peso_bruto?: number | null
          peso_liquido?: number | null
          preco_custo?: number
          preco_venda?: number
          sku?: string | null
          tipo?: Database["public"]["Enums"]["produto_tipo"]
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria_id?: string | null
          cest?: string | null
          codigo_barras?: string | null
          created_at?: string
          descricao?: string | null
          estoque_atual?: number
          estoque_maximo?: number | null
          estoque_minimo?: number
          id?: string
          ncm?: string | null
          nome?: string
          origem_mercadoria?: number
          peso_bruto?: number | null
          peso_liquido?: number | null
          preco_custo?: number
          preco_venda?: number
          sku?: string | null
          tipo?: Database["public"]["Enums"]["produto_tipo"]
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean
          created_at: string
          deve_trocar_senha: boolean
          email: string
          id: string
          nome: string
          role_id: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          deve_trocar_senha?: boolean
          email: string
          id: string
          nome: string
          role_id?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          deve_trocar_senha?: boolean
          email?: string
          id?: string
          nome?: string
          role_id?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      servicos: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          preco: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          preco?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          preco?: number
          updated_at?: string
        }
        Relationships: []
      }
      unidades_medida: {
        Row: {
          descricao: string
          id: string
          sigla: string
        }
        Insert: {
          descricao: string
          id?: string
          sigla: string
        }
        Update: {
          descricao?: string
          id?: string
          sigla?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          allow: boolean
          created_at: string
          permission_id: string
          user_id: string
        }
        Insert: {
          allow: boolean
          created_at?: string
          permission_id: string
          user_id: string
        }
        Update: {
          allow?: boolean
          created_at?: string
          permission_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_produtos_estoque: {
        Row: {
          ativo: boolean | null
          estoque_atual: number | null
          estoque_comprometido: number | null
          estoque_disponivel: number | null
          estoque_minimo: number | null
          id: string | null
          nome: string | null
          preco_custo: number | null
          preco_venda: number | null
          sku: string | null
          tipo: Database["public"]["Enums"]["produto_tipo"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      abrir_sub_os_garantia: { Args: { p_os_id: string; p_problema: string }; Returns: string }
      aprovar_orcamento_os: {
        Args: { p_aprovado_por: string; p_os_id: string }
        Returns: undefined
      }
      baixar_titulo: {
        Args: {
          p_data?: string
          p_desconto?: number
          p_forma_pagamento?: string
          p_juros?: number
          p_tipo: string
          p_titulo_id: string
          p_valor: number
        }
        Returns: Json
      }
      enviar_orcamento_os: { Args: { p_os_id: string }; Returns: undefined }
      marcar_titulos_atrasados: { Args: never; Returns: Json }
      preparar_nfce_os: { Args: { p_os_id: string }; Returns: Json }
      registrar_retorno_nfce: {
        Args: {
          p_chave?: string
          p_danfe_url?: string
          p_erro?: string
          p_nota_id: string
          p_status: string
          p_xml_url?: string
        }
        Returns: undefined
      }
      relatorio_abc_pecas: { Args: { p_ate: string; p_de: string }; Returns: Json }
      relatorio_contas_aging: { Args: never; Returns: Json }
      relatorio_faturamento: { Args: { p_ate: string; p_de: string }; Returns: Json }
      relatorio_tecnicos: { Args: { p_ate: string; p_de: string }; Returns: Json }
      reprovar_orcamento_os: { Args: { p_motivo: string; p_os_id: string }; Returns: undefined }
      sugerir_produtos_nfe: { Args: { p_payload: Json }; Returns: Json }
      ajustar_estoque: {
        Args: {
          p_novo_saldo: number
          p_observacao?: string
          p_produto_id: string
        }
        Returns: number
      }
      consumo_produtos: { Args: { p_dias?: number }; Returns: Json }
      contagem_produtos_por_categoria: { Args: never; Returns: Json }
      definir_estoque_minimo: { Args: { p_itens: Json }; Returns: number }
      totais_caixa: { Args: { p_ate: string; p_de: string }; Returns: Json }
      concluir_os: {
        Args: {
          p_assinatura_nome: string
          p_assinatura_path: string
          p_fotos: Json
          p_laudo: string
          p_os_id: string
        }
        Returns: undefined
      }
      registrar_entrada_nfe: { Args: { p_payload: Json }; Returns: Json }
      resumo_dashboard: { Args: never; Returns: Json }
      user_has_permission: { Args: { p_chave: string }; Returns: boolean }
      usuario_ativo: { Args: never; Returns: boolean }
    }
    Enums: {
      ambiente_fiscal: "homologacao" | "producao"
      caixa_movimento_tipo: "entrada" | "saida"
      financeiro_categoria_tipo: "receita" | "despesa"
      movimento_estoque_tipo: "entrada" | "saida" | "ajuste" | "transferencia"
      nfce_status:
        | "pendente"
        | "autorizada"
        | "cancelada"
        | "erro"
        | "rejeitada"
      nota_fiscal_entrada_status: "pendente" | "processada" | "erro"
      os_anexo_tipo: "foto_conclusao" | "assinatura_cliente" | "outro"
      os_item_tipo: "peca" | "servico"
      os_prioridade: "baixa" | "normal" | "alta" | "urgente"
      os_status:
        | "aberta"
        | "orcamento"
        | "em_andamento"
        | "aguardando_peca"
        | "concluida"
        | "cancelada"
        | "reprovada"
      pessoa_tipo: "PF" | "PJ"
      produto_tipo: "simples" | "kit"
      titulo_status: "pendente" | "pago" | "atrasado" | "cancelado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ambiente_fiscal: ["homologacao", "producao"],
      caixa_movimento_tipo: ["entrada", "saida"],
      financeiro_categoria_tipo: ["receita", "despesa"],
      movimento_estoque_tipo: ["entrada", "saida", "ajuste", "transferencia"],
      nfce_status: ["pendente", "autorizada", "cancelada", "erro", "rejeitada"],
      nota_fiscal_entrada_status: ["pendente", "processada", "erro"],
      os_anexo_tipo: ["foto_conclusao", "assinatura_cliente", "outro"],
      os_item_tipo: ["peca", "servico"],
      os_prioridade: ["baixa", "normal", "alta", "urgente"],
      os_status: [
        "aberta",
        "orcamento",
        "em_andamento",
        "aguardando_peca",
        "concluida",
        "cancelada",
        "reprovada",
      ],
      pessoa_tipo: ["PF", "PJ"],
      produto_tipo: ["simples", "kit"],
      titulo_status: ["pendente", "pago", "atrasado", "cancelado"],
    },
  },
} as const
