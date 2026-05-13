export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      payment_requests: {
        Row: {
          amount_usd: number
          billing_cycle: string
          created_at: string
          discount_usd: number
          id: string
          notes: string | null
          payment_method: string
          plan_id: string
          receipt_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          tenant_id: string
        }
        Insert: {
          amount_usd: number
          billing_cycle: string
          created_at?: string
          discount_usd?: number
          id?: string
          notes?: string | null
          payment_method: string
          plan_id: string
          receipt_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          tenant_id: string
        }
        Update: {
          amount_usd?: number
          billing_cycle?: string
          created_at?: string
          discount_usd?: number
          id?: string
          notes?: string | null
          payment_method?: string
          plan_id?: string
          receipt_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "payment_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_contact_only: boolean
          max_charts_per_company: number | null
          max_companies: number | null
          max_employees_per_company: number | null
          name: string
          price_annual_usd: number
          price_monthly_usd: number
          price_quarterly_usd: number
          product_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_contact_only?: boolean
          max_charts_per_company?: number | null
          max_companies?: number | null
          max_employees_per_company?: number | null
          name: string
          price_annual_usd: number
          price_monthly_usd: number
          price_quarterly_usd: number
          product_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_contact_only?: boolean
          max_charts_per_company?: number | null
          max_companies?: number | null
          max_employees_per_company?: number | null
          name?: string
          price_annual_usd?: number
          price_monthly_usd?: number
          price_quarterly_usd?: number
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          name: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          name?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      referral_credits: {
        Row: {
          amount_usd: number
          created_at: string
          id: string
          referred_tenant_id: string
          referrer_tenant_id: string
          remaining_usd: number
          source_payment_request_id: string
          status: string
        }
        Insert: {
          amount_usd: number
          created_at?: string
          id?: string
          referred_tenant_id: string
          referrer_tenant_id: string
          remaining_usd: number
          source_payment_request_id: string
          status?: string
        }
        Update: {
          amount_usd?: number
          created_at?: string
          id?: string
          referred_tenant_id?: string
          referrer_tenant_id?: string
          remaining_usd?: number
          source_payment_request_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_credits_referred_tenant_id_fkey"
            columns: ["referred_tenant_id"]
            isOneToOne: true
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "referral_credits_referred_tenant_id_fkey"
            columns: ["referred_tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_credits_referrer_tenant_id_fkey"
            columns: ["referrer_tenant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "referral_credits_referrer_tenant_id_fkey"
            columns: ["referrer_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_credits_source_payment_request_id_fkey"
            columns: ["source_payment_request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_redemptions: {
        Row: {
          amount_usd: number
          created_at: string
          credit_id: string
          id: string
          payment_request_id: string
        }
        Insert: {
          amount_usd: number
          created_at?: string
          credit_id: string
          id?: string
          payment_request_id: string
        }
        Update: {
          amount_usd?: number
          created_at?: string
          credit_id?: string
          id?: string
          payment_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_redemptions_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "referral_credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_redemptions_payment_request_id_fkey"
            columns: ["payment_request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      seniat_reminder_subscriptions: {
        Row: {
          categories: string[]
          created_at: string
          days_before: number
          email: string | null
          enabled: boolean
          id: string
          last_sent_at: string | null
          phone: string | null
          rif: string
          taxpayer_type: string
          user_id: string
        }
        Insert: {
          categories?: string[]
          created_at?: string
          days_before?: number
          email?: string | null
          enabled?: boolean
          id?: string
          last_sent_at?: string | null
          phone?: string | null
          rif: string
          taxpayer_type: string
          user_id: string
        }
        Update: {
          categories?: string[]
          created_at?: string
          days_before?: number
          email?: string | null
          enabled?: boolean
          id?: string
          last_sent_at?: string | null
          phone?: string | null
          rif?: string
          taxpayer_type?: string
          user_id?: string
        }
        Relationships: []
      }
      status_checks: {
        Row: {
          checked_at: string
          client_fingerprint: string | null
          error_message: string | null
          http_status: number | null
          id: string
          response_time_ms: number | null
          service_id: string
          source: string
          status: string
        }
        Insert: {
          checked_at?: string
          client_fingerprint?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          response_time_ms?: number | null
          service_id: string
          source?: string
          status: string
        }
        Update: {
          checked_at?: string
          client_fingerprint?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          response_time_ms?: number | null
          service_id?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_checks_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "status_services"
            referencedColumns: ["id"]
          },
        ]
      }
      status_incidents: {
        Row: {
          description: string | null
          id: string
          resolved_at: string | null
          service_id: string
          started_at: string
        }
        Insert: {
          description?: string | null
          id?: string
          resolved_at?: string | null
          service_id: string
          started_at?: string
        }
        Update: {
          description?: string | null
          id?: string
          resolved_at?: string | null
          service_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_incidents_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "status_services"
            referencedColumns: ["id"]
          },
        ]
      }
      status_services: {
        Row: {
          active: boolean
          category: string
          check_method: string
          created_at: string
          degraded_threshold_ms: number
          description: string | null
          display_order: number
          id: string
          logo_url: string | null
          name: string
          slug: string
          timeout_ms: number
          url: string
        }
        Insert: {
          active?: boolean
          category: string
          check_method?: string
          created_at?: string
          degraded_threshold_ms?: number
          description?: string | null
          display_order?: number
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          timeout_ms?: number
          url: string
        }
        Update: {
          active?: boolean
          category?: string
          check_method?: string
          created_at?: string
          degraded_threshold_ms?: number
          description?: string | null
          display_order?: number
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          timeout_ms?: number
          url?: string
        }
        Relationships: []
      }
      tenant_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          tenant_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role: string
          tenant_id: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_memberships: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_by: string | null
          member_id: string
          revoked_at: string | null
          role: string
          tenant_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          member_id: string
          revoked_at?: string | null
          role: string
          tenant_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          member_id?: string
          revoked_at?: string | null
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_metrics: {
        Row: {
          company_count: number
          employee_count: number
          last_activity_at: string | null
          payroll_run_count: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          company_count?: number
          employee_count?: number
          last_activity_at?: string | null
          payroll_run_count?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          company_count?: number
          employee_count?: number
          last_activity_at?: string | null
          payroll_run_count?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscriptions: {
        Row: {
          billing_cycle: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          last_payment_at: string | null
          plan_id: string | null
          product_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          billing_cycle?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          last_payment_at?: string | null
          plan_id?: string | null
          product_id: string
          status?: string
          tenant_id: string
        }
        Update: {
          billing_cycle?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          last_payment_at?: string | null
          plan_id?: string | null
          product_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          billing_cycle: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          last_payment_at: string | null
          plan_id: string
          referral_code: string | null
          referred_by: string | null
          schema_name: string
          status: string
          updated_at: string
        }
        Insert: {
          billing_cycle?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id: string
          last_payment_at?: string | null
          plan_id: string
          referral_code?: string | null
          referred_by?: string | null
          schema_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          billing_cycle?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          last_payment_at?: string | null
          plan_id?: string
          referral_code?: string | null
          referred_by?: string | null
          schema_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenants_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_tenant_overview: {
        Row: {
          billing_cycle: string | null
          company_count: number | null
          current_period_end: string | null
          current_period_start: string | null
          email: string | null
          employee_count: number | null
          last_activity_at: string | null
          last_payment_at: string | null
          member_count: number | null
          member_of_tenants: string | null
          payroll_run_count: number | null
          plan_max_companies: number | null
          plan_max_employees: number | null
          plan_name: string | null
          schema_name: string | null
          status: string | null
          tenant_id: string | null
          tenant_since: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _inv_drafts_install: {
        Args: { p_user_id: string; v_schema: string }
        Returns: undefined
      }
      activate_own_tenant: { Args: never; Returns: Json }
      generate_referral_code: { Args: never; Returns: string }
      get_platform_summary: {
        Args: never
        Returns: {
          active_tenants: number
          pending_payments: number
          suspended_tenants: number
          total_companies: number
          total_employees: number
          total_payroll_runs: number
          total_tenants: number
          trial_tenants: number
        }[]
      }
      is_admin: { Args: { p_user_id: string }; Returns: boolean }
      provision_documents_tables: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      provision_tenant_drafts_table: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      provision_tenant_schema: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      refresh_tenant_metrics: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      tenant_accounting_account_delete: {
        Args: { p_account_id: string; p_user_id: string }
        Returns: undefined
      }
      tenant_accounting_account_upsert: {
        Args: { p_account: Json; p_user_id: string }
        Returns: string
      }
      tenant_accounting_accounts_get: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: {
          chart_id: string
          code: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_group: boolean
          name: string
          parent_code: string
          saldo_inicial: number
          type: string
          updated_at: string
        }[]
      }
      tenant_accounting_chart_delete: {
        Args: { p_chart_id: string; p_user_id: string }
        Returns: undefined
      }
      tenant_accounting_chart_import: {
        Args: {
          p_accounts: Json
          p_company_id: string
          p_name: string
          p_user_id: string
        }
        Returns: string
      }
      tenant_accounting_chart_save: {
        Args: { p_chart: Json; p_user_id: string }
        Returns: string
      }
      tenant_accounting_charts_get: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: {
          account_count: number
          company_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }[]
      }
      tenant_accounting_entries_delete_by_source: {
        Args: {
          p_company_id: string
          p_source: string
          p_source_ref: string
          p_user_id: string
        }
        Returns: {
          entry_id: string
        }[]
      }
      tenant_accounting_entries_get: {
        Args: { p_company_id: string; p_period_id?: string; p_user_id: string }
        Returns: {
          company_id: string
          created_at: string
          date: string
          description: string
          entry_number: number
          id: string
          period_id: string
          posted_at: string
          source: string
          source_ref: string
          status: string
          updated_at: string
        }[]
      }
      tenant_accounting_entry_post: {
        Args: { p_entry_id: string; p_user_id: string }
        Returns: undefined
      }
      tenant_accounting_entry_save: {
        Args: { p_entry: Json; p_lines: Json; p_user_id: string }
        Returns: string
      }
      tenant_accounting_entry_with_lines_get: {
        Args: { p_entry_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_accounting_integration_log_get: {
        Args: { p_company_id: string; p_limit?: number; p_user_id: string }
        Returns: {
          company_id: string
          created_at: string
          entry_id: string
          error_message: string
          id: string
          source: string
          source_ref: string
          status: string
        }[]
      }
      tenant_accounting_integration_log_save: {
        Args: { p_log: Json; p_user_id: string }
        Returns: string
      }
      tenant_accounting_integration_rule_delete: {
        Args: { p_rule_id: string; p_user_id: string }
        Returns: undefined
      }
      tenant_accounting_integration_rule_save: {
        Args: { p_rule: Json; p_user_id: string }
        Returns: string
      }
      tenant_accounting_integration_rules_get: {
        Args: { p_company_id: string; p_source?: string; p_user_id: string }
        Returns: {
          amount_field: string
          company_id: string
          created_at: string
          credit_account_id: string
          debit_account_id: string
          description: string
          id: string
          is_active: boolean
          source: string
          updated_at: string
        }[]
      }
      tenant_accounting_period_close: {
        Args: { p_period_id: string; p_user_id: string }
        Returns: undefined
      }
      tenant_accounting_period_find_open_for_date: {
        Args: { p_company_id: string; p_date: string; p_user_id: string }
        Returns: {
          closed_at: string
          company_id: string
          created_at: string
          end_date: string
          id: string
          name: string
          start_date: string
          status: string
          updated_at: string
        }[]
      }
      tenant_accounting_period_save: {
        Args: { p_period: Json; p_user_id: string }
        Returns: string
      }
      tenant_accounting_periods_get: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: {
          closed_at: string
          company_id: string
          created_at: string
          end_date: string
          id: string
          name: string
          start_date: string
          status: string
          updated_at: string
        }[]
      }
      tenant_accounting_trial_balance_get: {
        Args: { p_company_id: string; p_period_id?: string; p_user_id: string }
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          account_type: string
          balance: number
          total_credit: number
          total_debit: number
        }[]
      }
      tenant_bono_guerra_receipts_by_run: {
        Args: { p_run_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_bono_guerra_run_save: {
        Args: {
          p_receipts: Json
          p_run: Json
          p_status?: string
          p_user_id: string
        }
        Returns: string
      }
      tenant_bono_guerra_runs_by_company: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_cesta_ticket_receipts_by_run: {
        Args: { p_run_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_cesta_ticket_run_save: {
        Args: {
          p_receipts: Json
          p_run: Json
          p_status?: string
          p_user_id: string
        }
        Returns: string
      }
      tenant_cesta_ticket_runs_by_company: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_companies_get_all: { Args: { p_user_id: string }; Returns: Json }
      tenant_company_delete: {
        Args: { p_id: string; p_user_id: string }
        Returns: undefined
      }
      tenant_company_get_by_id: {
        Args: { p_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_company_get_inventory_config: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_company_get_payroll_settings: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_company_save:
        | {
            Args: {
              p_id: string
              p_name: string
              p_owner_id: string
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_id: string
              p_name: string
              p_owner_id: string
              p_rif?: string
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_address?: string
              p_id: string
              p_logo_url?: string
              p_name: string
              p_owner_id: string
              p_phone?: string
              p_rif?: string
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_address?: string
              p_id: string
              p_logo_url?: string
              p_name: string
              p_owner_id: string
              p_phone?: string
              p_rif?: string
              p_sector?: string
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_address?: string
              p_id: string
              p_logo_url?: string
              p_name: string
              p_owner_id: string
              p_phone?: string
              p_rif?: string
              p_sector?: string
              p_taxpayer_type?: string
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_address?: string
              p_contact_email?: string
              p_id: string
              p_logo_url?: string
              p_name: string
              p_owner_id: string
              p_phone?: string
              p_rif?: string
              p_sector?: string
              p_taxpayer_type?: string
              p_user_id: string
            }
            Returns: undefined
          }
      tenant_company_save_inventory_config: {
        Args: { p_company_id: string; p_config: Json; p_user_id: string }
        Returns: undefined
      }
      tenant_company_save_payroll_settings: {
        Args: { p_company_id: string; p_settings: Json; p_user_id: string }
        Returns: undefined
      }
      tenant_company_update:
        | {
            Args: { p_id: string; p_name: string; p_user_id: string }
            Returns: Json
          }
        | {
            Args: {
              p_id: string
              p_name: string
              p_rif?: string
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_address?: string
              p_id: string
              p_logo_url?: string
              p_name: string
              p_phone?: string
              p_rif?: string
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_address?: string
              p_id: string
              p_logo_url?: string
              p_name: string
              p_phone?: string
              p_rif?: string
              p_show_logo_in_pdf?: boolean
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_address?: string
              p_id: string
              p_logo_url?: string
              p_name: string
              p_phone?: string
              p_rif?: string
              p_sector?: string
              p_show_logo_in_pdf?: boolean
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_address?: string
              p_id: string
              p_logo_url?: string
              p_name: string
              p_phone?: string
              p_rif?: string
              p_sector?: string
              p_show_logo_in_pdf?: boolean
              p_taxpayer_type?: string
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_address?: string
              p_contact_email?: string
              p_id: string
              p_logo_url?: string
              p_name: string
              p_phone?: string
              p_rif?: string
              p_sector?: string
              p_show_logo_in_pdf?: boolean
              p_taxpayer_type?: string
              p_user_id: string
            }
            Returns: Json
          }
      tenant_documents_delete: {
        Args: { p_id: string; p_user_id: string }
        Returns: undefined
      }
      tenant_documents_folder_delete: {
        Args: { p_id: string; p_user_id: string }
        Returns: undefined
      }
      tenant_documents_folder_insert: {
        Args: {
          p_company_id?: string
          p_created_by?: string
          p_name: string
          p_parent_id?: string
          p_user_id: string
        }
        Returns: {
          company_id: string
          created_at: string
          created_by: string
          id: string
          name: string
          parent_id: string
          updated_at: string
        }[]
      }
      tenant_documents_folder_update: {
        Args: { p_id: string; p_name: string; p_user_id: string }
        Returns: {
          company_id: string
          created_at: string
          created_by: string
          id: string
          name: string
          parent_id: string
          updated_at: string
        }[]
      }
      tenant_documents_folders_get: {
        Args: { p_company_id?: string; p_parent_id?: string; p_user_id: string }
        Returns: {
          company_id: string
          created_at: string
          created_by: string
          id: string
          name: string
          parent_id: string
          updated_at: string
        }[]
      }
      tenant_documents_get: {
        Args: { p_company_id?: string; p_folder_id?: string; p_user_id: string }
        Returns: {
          company_id: string
          created_at: string
          folder_id: string
          id: string
          mime_type: string
          name: string
          size_bytes: number
          storage_path: string
          updated_at: string
          uploaded_by: string
        }[]
      }
      tenant_documents_get_by_id: {
        Args: { p_id: string; p_user_id: string }
        Returns: {
          company_id: string
          created_at: string
          folder_id: string
          id: string
          mime_type: string
          name: string
          size_bytes: number
          storage_path: string
          updated_at: string
          uploaded_by: string
        }[]
      }
      tenant_documents_insert: {
        Args: {
          p_company_id?: string
          p_folder_id?: string
          p_mime_type?: string
          p_name: string
          p_size_bytes?: number
          p_storage_path: string
          p_uploaded_by: string
          p_user_id: string
        }
        Returns: {
          company_id: string
          created_at: string
          folder_id: string
          id: string
          mime_type: string
          name: string
          size_bytes: number
          storage_path: string
          updated_at: string
          uploaded_by: string
        }[]
      }
      tenant_documents_update_folder: {
        Args: { p_folder_id?: string; p_id: string; p_user_id: string }
        Returns: {
          company_id: string
          created_at: string
          folder_id: string
          id: string
          mime_type: string
          name: string
          size_bytes: number
          storage_path: string
          updated_at: string
          uploaded_by: string
        }[]
      }
      tenant_employee_salary_history: {
        Args: {
          p_company_id: string
          p_employee_cedula: string
          p_user_id: string
        }
        Returns: {
          created_at: string
          fecha_desde: string
          id: string
          moneda: string
          salario_mensual: number
        }[]
      }
      tenant_employees_delete: {
        Args: { p_ids: string[]; p_user_id: string }
        Returns: undefined
      }
      tenant_employees_get_by_company: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: {
          cargo: string
          cedula: string
          company_id: string
          estado: string
          fecha_ingreso: string
          id: string
          moneda: string
          nombre: string
          porcentaje_islr: number
          salario_mensual: number
        }[]
      }
      tenant_employees_rename_cedula: {
        Args: {
          p_company_id: string
          p_new_cedula: string
          p_old_cedula: string
          p_user_id: string
        }
        Returns: undefined
      }
      tenant_employees_upsert: {
        Args: { p_employees: Json; p_user_id: string }
        Returns: undefined
      }
      tenant_get_plan_limits: {
        Args: { p_user_id: string }
        Returns: {
          max_companies: number
          max_employees_per_company: number
        }[]
      }
      tenant_get_schema: { Args: { p_user_id: string }; Returns: string }
      tenant_inventario_cierre_save:
        | {
            Args: {
              p_empresa_id: string
              p_notas?: string
              p_periodo: string
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_empresa_id: string
              p_notas?: string
              p_periodo: string
              p_tasa_dolar?: number
              p_user_id: string
            }
            Returns: Json
          }
      tenant_inventario_cierres_get: {
        Args: { p_empresa_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_departamentos_delete: {
        Args: { p_id: string; p_user_id: string }
        Returns: undefined
      }
      tenant_inventario_departamentos_get: {
        Args: { p_empresa_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_departamentos_upsert: {
        Args: { p_data: Json; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_factura_confirmar: {
        Args: { p_factura_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_factura_delete: {
        Args: { p_factura_id: string; p_user_id: string }
        Returns: undefined
      }
      tenant_inventario_factura_desconfirmar: {
        Args: { p_factura_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_factura_get: {
        Args: { p_factura_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_factura_imputar_items: {
        Args: { p_factura_id: string; p_items: Json; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_factura_migrate: {
        Args: {
          p_empresa_destino_id: string
          p_factura_ids: string[]
          p_periodo_destino?: string
          p_user_id: string
        }
        Returns: Json
      }
      tenant_inventario_factura_save: {
        Args: { p_factura: Json; p_items: Json; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_facturas_get: {
        Args: { p_empresa_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_islr_retenciones_periodo: {
        Args: { p_empresa_id: string; p_periodo: string; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_kardex_periodo: {
        Args: { p_empresa_id: string; p_periodo: string; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_libro_compras: {
        Args: { p_empresa_id: string; p_periodo: string; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_libro_inventarios: {
        Args: { p_anio: number; p_empresa_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_libro_ventas: {
        Args: { p_empresa_id: string; p_periodo: string; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_movimiento_delete: {
        Args: { p_id: string; p_user_id: string }
        Returns: undefined
      }
      tenant_inventario_movimiento_update_meta: {
        Args: {
          p_fecha: string
          p_id: string
          p_notas: string
          p_referencia: string
          p_user_id: string
        }
        Returns: Json
      }
      tenant_inventario_movimientos_draft_confirmar_grupo: {
        Args: {
          p_draft_group_id: string
          p_empresa_id: string
          p_user_id: string
        }
        Returns: Json
      }
      tenant_inventario_movimientos_draft_descartar: {
        Args: {
          p_draft_group_id: string
          p_empresa_id: string
          p_user_id: string
        }
        Returns: Json
      }
      tenant_inventario_movimientos_draft_get_grupo: {
        Args: {
          p_draft_group_id: string
          p_empresa_id: string
          p_user_id: string
        }
        Returns: Json
      }
      tenant_inventario_movimientos_draft_listar_ultimo: {
        Args: { p_empresa_id: string; p_kind: string; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_movimientos_draft_save: {
        Args: {
          p_context: Json
          p_direction: string
          p_draft_group_id: string
          p_empresa_id: string
          p_iva_mode: string
          p_kind: string
          p_movements: Json
          p_user_id: string
        }
        Returns: Json
      }
      tenant_inventario_movimientos_get: {
        Args: { p_empresa_id: string; p_periodo?: string; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_movimientos_save: {
        Args: { p_row: Json; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_productos_delete: {
        Args: { p_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_productos_get: {
        Args: { p_empresa_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_productos_set_existencia: {
        Args: {
          p_empresa_id: string
          p_existencia: number
          p_producto_id: string
          p_user_id: string
        }
        Returns: Json
      }
      tenant_inventario_productos_upsert: {
        Args: { p_row: Json; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_proveedores_delete: {
        Args: { p_id: string; p_user_id: string }
        Returns: undefined
      }
      tenant_inventario_proveedores_get: {
        Args: { p_empresa_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_proveedores_upsert: {
        Args: { p_row: Json; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_reporte_periodo: {
        Args: { p_empresa_id: string; p_periodo: string; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_reporte_saldo: {
        Args: { p_empresa_id: string; p_periodo: string; p_user_id: string }
        Returns: Json
      }
      tenant_inventario_retenciones_iva_periodo: {
        Args: { p_empresa_id: string; p_periodo: string; p_user_id: string }
        Returns: Json
      }
      tenant_payroll_receipts_by_run: {
        Args: { p_run_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_payroll_run_save: {
        Args: {
          p_receipts: Json
          p_run: Json
          p_status?: string
          p_user_id: string
        }
        Returns: string
      }
      tenant_payroll_runs_by_company: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_ventas_cliente_delete: {
        Args: { p_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_ventas_cliente_save: {
        Args: { p_cliente: Json; p_user_id: string }
        Returns: Json
      }
      tenant_ventas_clientes_get: {
        Args: { p_empresa_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_ventas_factura_confirmar: {
        Args: { p_factura_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_ventas_factura_delete: {
        Args: { p_factura_id: string; p_user_id: string }
        Returns: undefined
      }
      tenant_ventas_factura_desconfirmar: {
        Args: { p_factura_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_ventas_factura_get: {
        Args: { p_factura_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_ventas_factura_save: {
        Args: { p_factura: Json; p_items: Json; p_user_id: string }
        Returns: Json
      }
      tenant_ventas_facturas_get: {
        Args: { p_empresa_id: string; p_user_id: string }
        Returns: Json
      }
      tenant_ventas_igtf_quincena: {
        Args: {
          p_empresa_id: string
          p_month: number
          p_quincena: number
          p_user_id: string
          p_year: number
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
