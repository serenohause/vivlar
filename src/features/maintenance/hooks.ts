import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import type { MaintenancePriority, MaintenanceRequest, MaintenanceStatus } from '@/features/maintenance/types';
import { supabase } from '@/lib/supabase';

const MAINTENANCE_QUERY_KEY = ['maintenance-requests'] as const;

function maintenanceRequestQueryKey(id: string) {
  return ['maintenance-request', id] as const;
}

function maintenanceByUnitQueryKey(unitId: string) {
  return ['maintenance-requests-by-unit', unitId] as const;
}

function maintenancePhotoSignedUrlQueryKey(path: string) {
  return ['maintenance-photo-signed-url', path] as const;
}

/** Invalida a lista geral e a lista "por unidade" (prefixo — cobre qualquer unitId já em cache), usado sempre que um chamado é criado/atualizado/excluído. */
function invalidateMaintenanceLists(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: MAINTENANCE_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: ['maintenance-requests-by-unit'] });
}

/** Lista de chamados de manutenção do tenant (RLS restringe a admin/comercial/administrativo), excluindo soft-deleted, mais recentes primeiro — fiel a `"-created_date"` de `AdminMaintenance.jsx`. */
export function useMaintenanceRequests() {
  return useQuery({
    queryKey: MAINTENANCE_QUERY_KEY,
    queryFn: async (): Promise<MaintenanceRequest[]> => {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

/** Chamados de manutenção de uma unidade específica — seção "Manutenções" de `UnitDetailPage`. */
export function useMaintenanceRequestsByUnit(unitId: string | undefined) {
  return useQuery({
    queryKey: maintenanceByUnitQueryKey(unitId ?? ''),
    queryFn: async (): Promise<MaintenanceRequest[]> => {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select('*')
        .eq('unit_id', unitId as string)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: Boolean(unitId),
  });
}

/** Um chamado específico — `MaintenanceDetailPage`. */
export function useMaintenanceRequest(id: string | undefined) {
  return useQuery({
    queryKey: maintenanceRequestQueryKey(id ?? ''),
    queryFn: async (): Promise<MaintenanceRequest> => {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select('*')
        .eq('id', id as string)
        .eq('is_deleted', false)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: Boolean(id),
  });
}

type CreateMaintenanceRequestInput = {
  client_id: string;
  unit_id: string;
  title: string;
  description: string;
  category: string;
  priority: MaintenancePriority;
  /** Paths já enviados ao bucket `maintenance-photos` (ver `useUploadMaintenancePhoto`) — upload acontece ANTES do submit, fiel a `handlePhotoUpload`/`uploadedPhotos` (`AdminMaintenance.jsx`). */
  photos: string[];
};

/**
 * Cria o chamado de manutenção — tradução de `createMutation`
 * (`AdminMaintenance.jsx`). `project_id` resolvido a partir de `unit_id`
 * (mesmo critério de `useCreateInspection`, `features/inspections/hooks.ts`)
 * em vez de confiar num valor já carregado no client. `opened_at`/`status`
 * ficam para os defaults do banco (`now()`/`'aberto'`, ver
 * `0037_maintenance_requests.sql`) — sem necessidade de setá-los aqui.
 *
 * DECISÃO: `suggested_date` não é usado neste formulário (nem lido, nem
 * escrito) — o schema documenta a coluna como "sugerida pelo cliente ao
 * abrir o chamado, sem write path nesta rodada" (ver comentário em
 * `0037_maintenance_requests.sql`); esta rodada é só o lado interno/admin,
 * sem portal do cliente. `scheduled_date` (a data que a EQUIPE agenda) já
 * cobre a necessidade de agendamento — ver `useUpdateMaintenanceRequest`.
 */
export function useCreateMaintenanceRequest() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateMaintenanceRequestInput): Promise<MaintenanceRequest> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data: unit, error: unitError } = await supabase
        .from('units')
        .select('project_id')
        .eq('id', input.unit_id)
        .single();
      if (unitError) throw unitError;

      const { data, error: insertError } = await supabase
        .from('maintenance_requests')
        .insert({
          tenant_id: tenantId,
          project_id: unit.project_id,
          unit_id: input.unit_id,
          client_id: input.client_id,
          title: input.title,
          description: input.description,
          category: input.category,
          priority: input.priority,
          photos: input.photos,
          created_by_user_id: user?.id ?? null,
          updated_by_user_id: user?.id ?? null,
        })
        .select()
        .single();
      if (insertError) throw insertError;

      return data;
    },
    onSuccess: () => invalidateMaintenanceLists(queryClient),
  });
}

type UpdateMaintenanceRequestInput = {
  status?: MaintenanceStatus;
  scheduled_date?: string | null;
  responsible_user_id?: string | null;
  operator_notes?: string | null;
  /**
   * Status atual do chamado (já carregado pela página) — usado
   * exclusivamente para decidir o carimbo automático de `resolved_at`
   * abaixo.
   */
  currentStatus?: MaintenanceStatus;
};

/**
 * Atualiza status/agendamento/responsável/observações de um chamado —
 * tradução de `updateMutation` (`MaintenanceDetail.jsx`), SEM a criação de
 * `Notification` (tabela não existe no projeto novo, mesmo critério já
 * usado nos módulos anteriores). Carimba `resolved_at = now()`
 * automaticamente quando `status` transiciona PARA `resolvido` (e só
 * então) — decidido aqui, no hook, nunca a partir de um valor enviado pelo
 * client, fiel ao comentário da migration ("nunca um input manual").
 *
 * A regra "`scheduled_date` obrigatória quando `status` vira `agendado`" já
 * é checada em `MaintenanceDetailPage` antes de chamar esta mutation, mas é
 * reforçada aqui também (achado baixo da auditoria de 2026-07-23: só existir
 * no client não bloqueia uma chamada direta à API) — segunda camada, mesmo
 * critério de "defesa em profundidade" já aplicado em outros módulos.
 */
export function useUpdateMaintenanceRequest(id: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: UpdateMaintenanceRequestInput): Promise<MaintenanceRequest> => {
      const { currentStatus, ...fields } = input;

      if (input.status === 'agendado' && !input.scheduled_date) {
        throw new Error('Para agendar, é obrigatório definir a data.');
      }

      const payload: Record<string, unknown> = { ...fields, updated_by_user_id: user?.id ?? null };

      if (input.status === 'resolvido' && currentStatus !== 'resolvido') {
        payload.resolved_at = new Date().toISOString();
      }

      const { data, error } = await supabase.from('maintenance_requests').update(payload).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: maintenanceRequestQueryKey(id) });
      invalidateMaintenanceLists(queryClient);
    },
  });
}

/** Exclusão é sempre soft delete — tradução de `deleteMutation` (`AdminMaintenance.jsx`/`MaintenanceDetail.jsx`). */
export function useSoftDeleteMaintenanceRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('maintenance_requests')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: user?.id ?? null,
        })
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: maintenanceRequestQueryKey(id) });
      invalidateMaintenanceLists(queryClient);
    },
  });
}

/**
 * Sobe uma foto para o bucket privado `maintenance-photos` e devolve só o
 * PATH (não insere nada em tabela — diferente de `useUploadInspectionMedia`,
 * `MaintenanceRequest` não tem uma entidade de mídia própria, `photos` é um
 * `text[]` direto na própria linha, ver `0037_maintenance_requests.sql`).
 * Chamada uma vez por arquivo selecionado no dialog de criação, fiel a
 * `handlePhotoUpload`/`uploadedPhotos` (`AdminMaintenance.jsx`) — os paths
 * acumulados em estado local do dialog só são gravados na tabela quando o
 * chamado é de fato criado (`useCreateMaintenanceRequest`). Mesma convenção
 * de path dos outros dois buckets (`documents`/`inspection-media`):
 * `{tenant_id}/{timestamp}-{nome_sanitizado}`.
 */
export function useUploadMaintenancePhoto() {
  const { tenantId } = useAuth();

  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const sanitizedName = file.name.replace(/\//g, '_');
      const path = `${tenantId}/${Date.now()}-${sanitizedName}`;

      const { error } = await supabase.storage.from('maintenance-photos').upload(path, file);
      if (error) throw error;

      return path;
    },
  });
}

/**
 * URL assinada de uma foto do bucket privado `maintenance-photos` — bucket
 * privado (`public = false`, `0038_maintenance_requests_storage.sql`), sem
 * URL pública para montar direto. Hook (não função solta) pelo mesmo motivo
 * de `useInspectionMediaSignedUrl`: a galeria de um chamado renderiza várias
 * fotos ao mesmo tempo, cada uma com seu próprio cache/estado de loading.
 * `staleTime` menor que a validade da URL (5 min) para nunca servir do
 * cache uma signed URL já expirada.
 */
export function useMaintenancePhotoSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: maintenancePhotoSignedUrlQueryKey(path ?? ''),
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage.from('maintenance-photos').createSignedUrl(path as string, 300);
      if (error) throw error;
      return data.signedUrl;
    },
    enabled: Boolean(path),
    staleTime: 4 * 60 * 1000,
  });
}
