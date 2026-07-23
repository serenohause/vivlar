import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import type { InspectionResult, InspectionSignature, InspectionSignerType } from '@/features/inspections/types';
import type { Inspection, InspectionItemResult, InspectionMedia } from '@/features/inspections/types';
import { computeInspectionTotals } from '@/features/inspections/utils';
import { supabase } from '@/lib/supabase';

const INSPECTIONS_QUERY_KEY = ['inspections'] as const;

function inspectionQueryKey(id: string) {
  return ['inspection', id] as const;
}

function itemResultsQueryKey(inspectionId: string) {
  return ['inspection-item-results', inspectionId] as const;
}

function mediaByInspectionQueryKey(inspectionId: string) {
  return ['inspection-media', inspectionId] as const;
}

function signaturesQueryKey(inspectionId: string) {
  return ['inspection-signatures', inspectionId] as const;
}

function mediaSignedUrlQueryKey(path: string) {
  return ['inspection-media-signed-url', path] as const;
}

/** Invalida a lista geral de vistorias e a lista "por unidade" (prefixo — cobre qualquer unitId já em cache), usado sempre que uma vistoria é criada/atualizada/excluída. */
function invalidateInspectionsLists(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: INSPECTIONS_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: ['inspections-by-unit'] });
}

/** Lista de vistorias do tenant (RLS restringe a admin/comercial/administrativo), excluindo soft-deleted, mais recentes primeiro — fiel a `"-created_date"` de `Inspections.jsx`. */
export function useInspections() {
  return useQuery({
    queryKey: INSPECTIONS_QUERY_KEY,
    queryFn: async (): Promise<Inspection[]> => {
      const { data, error } = await supabase
        .from('inspections')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

/** Vistorias de uma unidade específica — seção "Vistorias" de `UnitDetailPage`. */
export function useInspectionsByUnit(unitId: string | undefined) {
  return useQuery({
    queryKey: ['inspections-by-unit', unitId ?? ''],
    queryFn: async (): Promise<Inspection[]> => {
      const { data, error } = await supabase
        .from('inspections')
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

/** Uma vistoria específica — `InspectionDetailPage`. */
export function useInspection(id: string | undefined) {
  return useQuery({
    queryKey: inspectionQueryKey(id ?? ''),
    queryFn: async (): Promise<Inspection> => {
      const { data, error } = await supabase
        .from('inspections')
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

type CreateInspectionInput = {
  unit_id: string;
  template_id: string;
};

/**
 * Cria a vistoria E os `inspection_item_results` iniciais (1 por item ativo
 * do template, `result = 'pendente'`, `severity` copiado de
 * `severity_default`) — tradução de `handleCreateInspection`/`createMutation`
 * (`CreateInspection.jsx`). `client_id` resolvido fiel a `getClientForUnit`:
 * negócio com `sales_stage = 'vendido'` e `is_deleted = false` para a
 * unidade, se existir (`null` caso contrário). A checagem de "já existe
 * vistoria ativa para esta unidade" (`getActiveInspection`) é feita em
 * `CreateInspectionPage` a partir de `useInspections()` já carregada, não
 * aqui — regra de fluxo sobre um subconjunto de status, não uma constraint
 * de banco (ver comentário no topo de `0034_inspections.sql`).
 *
 * Duas escritas não atômicas (`inspections`, depois `inspection_item_results`)
 * — mesmo padrão já aceito em `useDuplicateInspectionTemplate`
 * (`features/inspection-templates/hooks.ts`): se a segunda falhar, a
 * vistoria nasce sem itens (visível/corrigível ao reabrir o detalhe, que
 * lista os itens vazios); sem valor financeiro envolvido, uma RPC dedicada
 * não se justifica nesta leva.
 */
export function useCreateInspection() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateInspectionInput): Promise<Inspection> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data: unit, error: unitError } = await supabase
        .from('units')
        .select('id, project_id')
        .eq('id', input.unit_id)
        .single();
      if (unitError) throw unitError;

      const { data: activeDeal, error: dealError } = await supabase
        .from('deals')
        .select('client_id')
        .eq('unit_id', input.unit_id)
        .eq('sales_stage', 'vendido')
        .eq('is_deleted', false)
        .limit(1)
        .maybeSingle();
      if (dealError) throw dealError;

      const { data: templateItems, error: itemsError } = await supabase
        .from('inspection_template_items')
        .select('id, severity_default')
        .eq('template_id', input.template_id)
        .eq('is_deleted', false);
      if (itemsError) throw itemsError;

      const { data: inspection, error: insertError } = await supabase
        .from('inspections')
        .insert({
          tenant_id: tenantId,
          project_id: unit.project_id,
          unit_id: input.unit_id,
          client_id: activeDeal?.client_id ?? null,
          template_id: input.template_id,
          inspector_user_id: user?.id ?? null,
          inspection_date: new Date().toISOString().split('T')[0],
          status: 'rascunho',
          totals_pending: templateItems.length,
          created_by_user_id: user?.id ?? null,
          updated_by_user_id: user?.id ?? null,
        })
        .select()
        .single();
      if (insertError) throw insertError;

      if (templateItems.length > 0) {
        const { error: insertItemsError } = await supabase.from('inspection_item_results').insert(
          templateItems.map((item) => ({
            tenant_id: tenantId,
            inspection_id: inspection.id,
            template_item_id: item.id,
            result: 'pendente' as const,
            severity: item.severity_default,
            created_by_user_id: user?.id ?? null,
            updated_by_user_id: user?.id ?? null,
          }))
        );
        if (insertItemsError) throw insertItemsError;
      }

      return inspection;
    },
    onSuccess: () => invalidateInspectionsLists(queryClient),
  });
}

/** Resultados de checklist de uma vistoria — `InspectionDetailPage`. */
export function useInspectionItemResults(inspectionId: string | undefined) {
  return useQuery({
    queryKey: itemResultsQueryKey(inspectionId ?? ''),
    queryFn: async (): Promise<InspectionItemResult[]> => {
      const { data, error } = await supabase
        .from('inspection_item_results')
        .select('*')
        .eq('inspection_id', inspectionId as string)
        .eq('is_deleted', false);

      if (error) throw error;
      return data;
    },
    enabled: Boolean(inspectionId),
  });
}

type UpdateItemResultInput = {
  id: string;
  result?: InspectionResult;
  comment?: string | null;
  /**
   * Status atual da vistoria (já carregado pela página, evita um SELECT
   * extra só para decidir a transição automática abaixo) — usado
   * exclusivamente para a regra "Rascunho -> Em Vistoria" abaixo.
   */
  currentInspectionStatus?: Inspection['status'];
};

/**
 * Muda `result`/`comment` de um item, deriva `requires_fix` (fiel a
 * `handleResultChange`: `true` quando `result` é `nao_conforme` ou
 * `pendente`), aplica a transição automática `rascunho -> em_vistoria` no
 * primeiro resultado registrado, e recalcula/regrava os totais da
 * `inspection` a partir do estado atual em banco (não do cache do React
 * Query) — mesma fonte de verdade de `recalculateTotals` no original, sem a
 * etapa de dedupe (ver comentário em `computeInspectionTotals`, `utils.ts`).
 *
 * DECISÃO DE ATOMICIDADE: até 3 escritas sequenciais não atômicas (o item,
 * depois os totais da vistoria, e opcionalmente o status). Diferente de
 * `commissions` (`useCreateAdjustment`/`useCreateAdjustment` em
 * `features/commissions/hooks.ts`, que usa RPC transacional porque o valor
 * em jogo é dinheiro pago a um corretor), aqui o "valor" são contadores de
 * progresso (`totals_*`/`score_conformity_percent`) derivados só de
 * `inspection_item_results.result` — se a escrita de totais falhar depois
 * da escrita do item, a tabela de itens (fonte de verdade) já está
 * correta, e a próxima chamada bem-sucedida deste mesmo hook recalcula os
 * totais do zero (a partir do banco, não incrementalmente), corrigindo
 * qualquer atraso. Não há como o usuário perder o resultado que acabou de
 * marcar, só o contador de progresso ficar temporariamente desatualizado —
 * mesmo padrão non-crítico já aceito para `documents`/`inspection_templates`
 * (upload/duplicação), uma RPC dedicada não se justifica aqui.
 */
export function useUpdateItemResult(inspectionId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: UpdateItemResultInput): Promise<InspectionItemResult> => {
      const itemPayload: Record<string, unknown> = { updated_by_user_id: user?.id ?? null };
      if (input.comment !== undefined) itemPayload.comment = input.comment;
      if (input.result !== undefined) {
        itemPayload.result = input.result;
        itemPayload.requires_fix = input.result === 'nao_conforme' || input.result === 'pendente';
      }

      const { data: updatedItem, error: updateError } = await supabase
        .from('inspection_item_results')
        .update(itemPayload)
        .eq('id', input.id)
        .select()
        .single();
      if (updateError) throw updateError;

      const { data: allItems, error: itemsError } = await supabase
        .from('inspection_item_results')
        .select('result')
        .eq('inspection_id', inspectionId)
        .eq('is_deleted', false);
      if (itemsError) throw itemsError;

      const inspectionPayload: Record<string, unknown> = {
        ...computeInspectionTotals(allItems),
        updated_by_user_id: user?.id ?? null,
      };
      if (input.result !== undefined && input.currentInspectionStatus === 'rascunho') {
        inspectionPayload.status = 'em_vistoria';
      }

      const { error: inspectionError } = await supabase.from('inspections').update(inspectionPayload).eq('id', inspectionId);
      if (inspectionError) throw inspectionError;

      return updatedItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: itemResultsQueryKey(inspectionId) });
      queryClient.invalidateQueries({ queryKey: inspectionQueryKey(inspectionId) });
      invalidateInspectionsLists(queryClient);
    },
  });
}

/** Mídias de uma vistoria inteira (todas as fotos, de todos os itens) — `InspectionDetailPage` (aba Checklist filtra por `item_result_id` no client, aba Mídias mostra tudo agrupado por categoria, fiel a `media`/`getItemMedia` do original). */
export function useInspectionMediaByInspection(inspectionId: string | undefined) {
  return useQuery({
    queryKey: mediaByInspectionQueryKey(inspectionId ?? ''),
    queryFn: async (): Promise<InspectionMedia[]> => {
      const { data, error } = await supabase
        .from('inspection_media')
        .select('*')
        .eq('inspection_id', inspectionId as string)
        .eq('is_deleted', false);

      if (error) throw error;
      return data;
    },
    enabled: Boolean(inspectionId),
  });
}

type UploadInspectionMediaInput = {
  file: File;
  inspectionId: string;
  itemResultId: string;
  caption?: string | null;
};

/**
 * Sobe a foto para o bucket privado `inspection-media` e insere a linha em
 * `inspection_media` — tradução de `uploadMediaMutation`/`handleMediaUpload`
 * (`InspectionDetail.jsx`). Mesma convenção de path do bucket `documents`
 * (`useUploadDocument`, `features/documents/hooks.ts`):
 * `{tenant_id}/{timestamp}-{nome_sanitizado}`. Mesmo tratamento de órfão
 * best-effort se o INSERT falhar depois do upload ter dado certo.
 */
export function useUploadInspectionMedia() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: UploadInspectionMediaInput): Promise<InspectionMedia> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const sanitizedName = input.file.name.replace(/\//g, '_');
      const path = `${tenantId}/${Date.now()}-${sanitizedName}`;

      const { error: uploadError } = await supabase.storage.from('inspection-media').upload(path, input.file);
      if (uploadError) throw uploadError;

      const { data, error: insertError } = await supabase
        .from('inspection_media')
        .insert({
          tenant_id: tenantId,
          inspection_id: input.inspectionId,
          item_result_id: input.itemResultId,
          file_url: path,
          file_name: input.file.name,
          caption: input.caption ?? null,
          taken_at: new Date().toISOString(),
          created_by_user_id: user?.id ?? null,
          updated_by_user_id: user?.id ?? null,
        })
        .select()
        .single();

      if (insertError) {
        void supabase.storage
          .from('inspection-media')
          .remove([path])
          .catch((cleanupError) => console.error('Falha ao remover arquivo órfão do storage:', cleanupError));
        throw insertError;
      }

      return data;
    },
    onSuccess: (media) => queryClient.invalidateQueries({ queryKey: mediaByInspectionQueryKey(media.inspection_id) }),
  });
}

/** Exclusão de mídia é sempre soft delete — tradução de `deleteMediaMutation`/`handleMediaDelete`. O objeto no Storage não é removido (mesma lacuna documentada em `0035_inspections_storage.sql`/`0036_rls_inspections.sql`). */
export function useSoftDeleteInspectionMedia() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (media: Pick<InspectionMedia, 'id' | 'inspection_id'>) => {
      const { error } = await supabase
        .from('inspection_media')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: user?.id ?? null,
        })
        .eq('id', media.id);

      if (error) throw error;
      return media;
    },
    onSuccess: (media) => queryClient.invalidateQueries({ queryKey: mediaByInspectionQueryKey(media.inspection_id) }),
  });
}

/**
 * URL assinada de um arquivo do bucket privado `inspection-media` — bucket
 * privado (`public = false`, `0035_inspections_storage.sql`), sem URL
 * pública para montar direto, mesma razão de `getDocumentSignedUrl`
 * (`features/documents/hooks.ts`). Diferente daquela função solta, aqui é
 * um HOOK React Query: cada foto do grid de um item/da galeria precisa do
 * próprio cache/estado de loading (várias fotos por vistoria renderizadas
 * ao mesmo tempo como `<img>`), não uma chamada avulsa de clique único como
 * o "Baixar" de `DocumentsListPage`. `staleTime` menor que a validade da
 * URL (5 min) para nunca servir do cache uma signed URL já expirada.
 */
export function useInspectionMediaSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: mediaSignedUrlQueryKey(path ?? ''),
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage.from('inspection-media').createSignedUrl(path as string, 300);
      if (error) throw error;
      return data.signedUrl;
    },
    enabled: Boolean(path),
    staleTime: 4 * 60 * 1000,
  });
}

/** Mesma URL assinada acima, mas como função solta (não hook) — para o clique avulso de "Ver PDF Assinado" (assinatura do cliente), mesmo padrão de `getDocumentSignedUrl`. */
export async function getInspectionMediaSignedUrl(path: string, expiresInSeconds = 60): Promise<string> {
  const { data, error } = await supabase.storage.from('inspection-media').createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

/** Assinaturas de uma vistoria (vistoriador + cliente) — `InspectionDetailPage`. */
export function useInspectionSignatures(inspectionId: string | undefined) {
  return useQuery({
    queryKey: signaturesQueryKey(inspectionId ?? ''),
    queryFn: async (): Promise<InspectionSignature[]> => {
      const { data, error } = await supabase.from('inspection_signatures').select('*').eq('inspection_id', inspectionId as string);

      if (error) throw error;
      return data;
    },
    enabled: Boolean(inspectionId),
  });
}

type CreateSignatureInput =
  | { signerType: Extract<InspectionSignerType, 'vistoriador'>; signerName: string; signerDocument: string | null }
  | { signerType: Extract<InspectionSignerType, 'cliente'>; signerName: string; signerDocument: string | null; file: File };

/**
 * Cria uma assinatura — tradução de `createSignatureMutation`
 * (`InspectionDetail.jsx`). `vistoriador` não anexa arquivo, só confirma
 * (`confirmation_checkbox: true`, fiel ao botão "Assinar" do original, que
 * não abre nenhum modal de captura de assinatura real); `cliente` sempre
 * anexa um PDF (upload real para o bucket `inspection-media`, mesma
 * convenção de path do bucket `documents`). Write-once na tabela (sem
 * update/delete, RLS de `inspection_signatures` só concede select/insert,
 * `0036_rls_inspections.sql`) — não existe `useUpdateSignature`.
 */
export function useCreateSignature(inspectionId: string) {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateSignatureInput): Promise<InspectionSignature> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      let signature_file_url: string | null = null;
      if (input.signerType === 'cliente') {
        const sanitizedName = input.file.name.replace(/\//g, '_');
        const path = `${tenantId}/${Date.now()}-${sanitizedName}`;

        const { error: uploadError } = await supabase.storage.from('inspection-media').upload(path, input.file);
        if (uploadError) throw uploadError;

        signature_file_url = path;
      }

      const { data, error: insertError } = await supabase
        .from('inspection_signatures')
        .insert({
          tenant_id: tenantId,
          inspection_id: inspectionId,
          signer_type: input.signerType,
          signer_name: input.signerName,
          signer_document: input.signerDocument,
          signature_file_url,
          signed_at: new Date().toISOString(),
          confirmation_checkbox: true,
          created_by_user_id: user?.id ?? null,
        })
        .select()
        .single();

      if (insertError) {
        if (signature_file_url) {
          void supabase.storage
            .from('inspection-media')
            .remove([signature_file_url])
            .catch((cleanupError) => console.error('Falha ao remover PDF órfão do storage:', cleanupError));
        }
        throw insertError;
      }

      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: signaturesQueryKey(inspectionId) }),
  });
}

/**
 * Atualiza campos de topo da vistoria (status, `notes_general`, etc.) —
 * tradução de `updateInspectionMutation`/`updateStatusMutation`
 * (`InspectionDetail.jsx`, unificados aqui num único hook, mesmo padrão de
 * `useUpdateInspectionTemplate`).
 */
export function useUpdateInspection(id: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (
      input: Partial<Pick<Inspection, 'status' | 'notes_general' | 'inspection_date' | 'inspector_user_id'>>
    ): Promise<Inspection> => {
      const { data, error } = await supabase
        .from('inspections')
        .update({ ...input, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inspectionQueryKey(id) });
      invalidateInspectionsLists(queryClient);
    },
  });
}

/** Exclusão é sempre soft delete — tradução de `deleteMutation` (`Inspections.jsx`). */
export function useSoftDeleteInspection() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('inspections')
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
      queryClient.invalidateQueries({ queryKey: inspectionQueryKey(id) });
      invalidateInspectionsLists(queryClient);
    },
  });
}
