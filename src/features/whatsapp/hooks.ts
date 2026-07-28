import { useQuery } from '@tanstack/react-query';

import type { WhatsAppSession } from '@/features/whatsapp/types';
import { supabase } from '@/lib/supabase';

const WHATSAPP_SESSIONS_QUERY_KEY = ['whatsapp-sessions'] as const;

/**
 * Lista de sessões de bot de WhatsApp do tenant — tradução de
 * `base44.entities.WhatsAppSession.filter({ is_deleted: false },
 * "-last_message_at", 100)` (`original-project/src/pages/WhatsAppSessions.jsx`).
 * `nullsFirst: false` para reproduzir fielmente o "-last_message_at" do
 * original (mais recente primeiro, sessões sem nenhuma mensagem registrada
 * ainda vão para o fim, não para o topo).
 *
 * RLS restringe SELECT a `tenant_role = 'admin'` (0073_rls_whatsapp_sessions.sql)
 * — qualquer outro papel recebe lista vazia/erro de acesso, tratado pela
 * página via `isError`. Sem nenhuma mutation neste arquivo: a tabela não tem
 * policy de INSERT/UPDATE/DELETE nenhuma, é só-leitura por desenho (ver
 * comentário de topo da migration).
 */
export function useWhatsAppSessions() {
  return useQuery({
    queryKey: WHATSAPP_SESSIONS_QUERY_KEY,
    queryFn: async (): Promise<WhatsAppSession[]> => {
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('*')
        .eq('is_deleted', false)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
  });
}
