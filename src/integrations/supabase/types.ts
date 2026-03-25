export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type AppRole = 'office_owner' | 'office_staff' | 'company_user'
export type FeatureKey =
  | 'clients'
  | 'items'
  | 'ncm_diagnostics'
  | 'classification'
  | 'price_simulation'
  | 'reports'
  | 'audit_trail'
  | 'integrations'
  | 'users'
  | 'settings'
  | 'api_access'
  | 'rag_assistant'

export type ItemStatus = 'pending' | 'in_review' | 'classified'
export type ItemType = 'goods' | 'services'
export type ClassificationStatus = 'draft' | 'approved' | 'archived'
export type TaxRegime = 'simples' | 'lucro_presumido' | 'lucro_real' | 'mei'
export type AuditAction = 'create' | 'update' | 'delete' | 'approve'

export interface Database {
  public: {
    Tables: {
      offices: {
        Row: {
          id: string
          name: string
          slug: string
          owner_id: string
          cnpj: string | null
          logo_url: string | null
          plan: string
          trial_ends_at: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['offices']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['offices']['Insert']>
      }
      profiles: {
        Row: {
          id: string
          office_id: string | null
          full_name: string
          email: string
          avatar_url: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          office_id: string
          role: AppRole
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['user_roles']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['user_roles']['Insert']>
      }
      feature_permissions: {
        Row: {
          id: string
          office_id: string
          role: AppRole
          feature_key: FeatureKey
          can_read: boolean
          can_write: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['feature_permissions']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['feature_permissions']['Insert']>
      }
      client_companies: {
        Row: {
          id: string
          office_id: string
          cnpj: string
          legal_name: string
          trade_name: string | null
          tax_regime: TaxRegime
          main_cnae: string | null
          sector_flags: Json
          contact_name: string | null
          contact_email: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['client_companies']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['client_companies']['Insert']>
      }
      items: {
        Row: {
          id: string
          company_id: string
          office_id: string
          code: string | null
          description: string
          item_type: ItemType
          ncm_current: string | null
          ncm_validated: string | null
          nbs_code: string | null
          unit: string | null
          base_cost: number | null
          status: ItemStatus
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['items']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['items']['Insert']>
      }
      tax_ncm: {
        Row: {
          code: string
          description: string
          start_date: string
          end_date: string | null
          legal_ref: string | null
          last_update_at: string
        }
        Insert: Database['public']['Tables']['tax_ncm']['Row']
        Update: Partial<Database['public']['Tables']['tax_ncm']['Insert']>
      }
      tax_cclasstrib: {
        Row: {
          code: string
          description: string
          article_ref: string | null
          regime_type: string
          p_red_ibs: number
          p_red_cbs: number
          start_date: string
          end_date: string | null
          last_update_at: string
        }
        Insert: Database['public']['Tables']['tax_cclasstrib']['Row']
        Update: Partial<Database['public']['Tables']['tax_cclasstrib']['Insert']>
      }
      tax_cst_ibs_cbs: {
        Row: {
          code: string
          description: string
          flags: Json
        }
        Insert: Database['public']['Tables']['tax_cst_ibs_cbs']['Row']
        Update: Partial<Database['public']['Tables']['tax_cst_ibs_cbs']['Insert']>
      }
      item_classifications: {
        Row: {
          id: string
          item_id: string
          office_id: string
          company_id: string
          ncm_used: string | null
          nbs_used: string | null
          cst_ibs_cbs: string | null
          cclasstrib_code: string | null
          justification: string | null
          legal_refs: Json
          created_by: string
          created_at: string
          status: ClassificationStatus
        }
        Insert: Omit<Database['public']['Tables']['item_classifications']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['item_classifications']['Insert']>
      }
      price_scenarios: {
        Row: {
          id: string
          item_id: string
          office_id: string
          company_id: string
          scenario_name: string
          cost: number
          target_margin: number
          price_before: number
          price_after: number
          tax_load_before: number
          tax_load_after: number
          created_by: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['price_scenarios']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['price_scenarios']['Insert']>
      }
      audit_logs: {
        Row: {
          id: string
          office_id: string
          entity_type: string
          entity_id: string
          action: AuditAction
          user_id: string
          payload_diff: Json
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['audit_logs']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['audit_logs']['Insert']>
      }
      office_integrations: {
        Row: {
          id: string
          office_id: string
          provider: string
          display_name: string
          api_url: string | null
          api_key: string | null
          is_active: boolean
          last_sync_at: string | null
          config: Json
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['office_integrations']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['office_integrations']['Insert']>
      }
      office_fiscal_params: {
        Row: {
          id: string
          office_id: string
          ibs_state: number
          ibs_municipal: number
          cbs: number
          default_markup: number
          legacy_tax_rate: number
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['office_fiscal_params']['Row'], 'id' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['office_fiscal_params']['Insert']>
      }
    }
    Functions: {
      get_my_office_id: { Args: Record<never, never>; Returns: string }
      setup_new_office: { Args: { name: string; slug: string; cnpj?: string }; Returns: string }
      get_office_stats: { Args: { p_office_id: string }; Returns: Json }
    }
  }
}
