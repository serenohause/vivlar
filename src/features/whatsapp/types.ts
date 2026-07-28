/** Tradução 1:1 do enum `whatsapp_flow_type` (ver `supabase/migrations/0072_whatsapp_sessions.sql`). */
export type WhatsAppFlowType = 'manutencao' | 'corretor' | 'indefinido';

/** Tradução 1:1 do enum `whatsapp_session_status` (ver `0072_whatsapp_sessions.sql`). */
export type WhatsAppSessionStatus = 'ativa' | 'concluida' | 'expirada' | 'escalada';

/**
 * Tradução 1:1 das colunas de `whatsapp_sessions` — tabela genuinamente
 * só-leitura (ver comentário de topo de `0072_whatsapp_sessions.sql`/
 * `0073_rls_whatsapp_sessions.sql`: nenhum código do original ou deste
 * projeto cria/atualiza esta entidade, é o estado de um bot de WhatsApp
 * externo que nunca foi integrado). `state` é texto livre (chave de state
 * machine sem vocabulário fechado), não um enum.
 */
export interface WhatsAppSession {
  id: string;
  tenant_id: string;

  phone: string;
  flow_type: WhatsAppFlowType;
  state: string | null;
  status: WhatsAppSessionStatus;
  last_message_at: string | null;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}
