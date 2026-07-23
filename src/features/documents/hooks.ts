import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import type { DocumentMetadataMutationPayload, DocumentUploadMutationPayload } from '@/features/documents/schemas';
import type { Document, DocumentStatus } from '@/features/documents/types';
import { supabase } from '@/lib/supabase';

const DOCUMENTS_QUERY_KEY = ['documents'] as const;

function documentQueryKey(id: string) {
  return ['document', id] as const;
}

function documentsByUnitQueryKey(unitId: string) {
  return ['documents-by-unit', unitId] as const;
}

function documentsByDealQueryKey(dealId: string) {
  return ['documents-by-deal', dealId] as const;
}

/**
 * Invalida tudo que depende de um documento específico depois de uma
 * mutation — lista geral, o documento em si e as duas listas "por contexto"
 * (unidade/negócio), sempre pelas duas chaves (a específica do registro, se
 * conhecida, e as duas globais por prefixo `unit_id`/`deal_id` — usar o
 * prefixo é mais simples do que descobrir de qual unidade/negócio o
 * documento fazia parte antes da mutation).
 */
function invalidateDocumentsQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  options: { id?: string; unitId?: string | null; dealId?: string | null } = {}
) {
  queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
  if (options.id) queryClient.invalidateQueries({ queryKey: documentQueryKey(options.id) });
  if (options.unitId) queryClient.invalidateQueries({ queryKey: documentsByUnitQueryKey(options.unitId) });
  if (options.dealId) queryClient.invalidateQueries({ queryKey: documentsByDealQueryKey(options.dealId) });
  // Sem saber de antemão a unidade/negócio de origem em toda mutation (ex.:
  // soft delete só recebe o id), invalida por prefixo genérico também —
  // `exact: false` é o default do React Query, cobre qualquer
  // `['documents-by-unit', *]`/`['documents-by-deal', *]` já em cache.
  queryClient.invalidateQueries({ queryKey: ['documents-by-unit'] });
  queryClient.invalidateQueries({ queryKey: ['documents-by-deal'] });
}

/** Lista geral de documentos do tenant (RLS restringe a admin/comercial/administrativo), excluindo soft-deleted. Usada por `DocumentsListPage` — filtros (projeto/unidade/tipo/status/busca) são feitos no client, fiel ao original. */
export function useDocuments() {
  return useQuery({
    queryKey: DOCUMENTS_QUERY_KEY,
    queryFn: async (): Promise<Document[]> => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

/** Documentos de uma unidade específica — seção "Documentos" de `UnitDetailPage`. */
export function useDocumentsByUnit(unitId: string | undefined) {
  return useQuery({
    queryKey: documentsByUnitQueryKey(unitId ?? ''),
    queryFn: async (): Promise<Document[]> => {
      const { data, error } = await supabase
        .from('documents')
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

/** Documentos de um negócio específico — aba "Documentos" de `DealDetailPage`. */
export function useDocumentsByDeal(dealId: string | undefined) {
  return useQuery({
    queryKey: documentsByDealQueryKey(dealId ?? ''),
    queryFn: async (): Promise<Document[]> => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('deal_id', dealId as string)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: Boolean(dealId),
  });
}

export function useDocument(id: string | undefined) {
  return useQuery({
    queryKey: documentQueryKey(id ?? ''),
    queryFn: async (): Promise<Document> => {
      const { data, error } = await supabase.from('documents').select('*').eq('id', id as string).single();

      if (error) throw error;
      return data;
    },
    enabled: Boolean(id),
  });
}

/**
 * Sobe o arquivo (se houver) para o bucket privado `documents` e insere a
 * linha em `documents` — tradução de `handleSubmit` (`Documents.jsx`) no
 * caminho de criação. Convenção de path OBRIGATÓRIA (a RLS de
 * `storage.objects`, ver `0032_rls_documents.sql`, depende exatamente disto):
 * `{tenant_id}/{timestamp}-{nome_original}` — primeiro segmento sempre o
 * `tenant_id` do usuário logado, senão a policy de INSERT do bucket rejeita
 * o upload. `/` no nome original do arquivo é trocado por `_` (o primeiro
 * segmento do path é usado por `storage.foldername` para isolar por
 * tenant — um nome de arquivo com `/` criaria segmentos extras e quebraria
 * essa convenção).
 *
 * `file` é opcional (fiel ao original: `Documents.jsx` permite criar o
 * registro sem `selectedFile`) — nesse caso `file_url`/`file_name` ficam
 * `null` e só a linha em `documents` é inserida.
 *
 * Se o upload for bem-sucedido mas o INSERT em `documents` falhar (ex.: rede
 * caiu entre as duas chamadas), o objeto já enviado ao bucket vira órfão —
 * tentamos removê-lo (best-effort, erro de limpeza é só logado, nunca trava
 * nem mascara o erro original do insert que o usuário precisa ver). Duas
 * escritas não-atômicas, mesmo padrão já aceito em `useCreateFinanceAccount`
 * (`features/finance/hooks.ts`) — diferente do caso de `commissions`
 * (`useCreateAdjustment`), aqui a segunda escrita não envolve valor
 * financeiro, então uma RPC dedicada não se justifica nesta leva.
 */
export function useUploadDocument() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: DocumentUploadMutationPayload): Promise<Document> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      let file_url: string | null = null;
      let file_name: string | null = null;

      if (input.file) {
        const sanitizedName = input.file.name.replace(/\//g, '_');
        const path = `${tenantId}/${Date.now()}-${sanitizedName}`;

        const { error: uploadError } = await supabase.storage.from('documents').upload(path, input.file);
        if (uploadError) throw uploadError;

        file_url = path;
        file_name = input.file.name;
      }

      const { data, error: insertError } = await supabase
        .from('documents')
        .insert({
          tenant_id: tenantId,
          project_id: input.project_id,
          unit_id: input.unit_id,
          deal_id: input.deal_id,
          doc_type: input.doc_type,
          title: input.title,
          notes: input.notes,
          issued_at: input.issued_at,
          received_at: new Date().toISOString().split('T')[0],
          status: 'recebido',
          file_url,
          file_name,
          created_by_user_id: user?.id ?? null,
          updated_by_user_id: user?.id ?? null,
        })
        .select()
        .single();

      if (insertError) {
        if (file_url) {
          // Best-effort: não trava nem substitui o erro do insert (que o
          // usuário precisa ver) por um erro de limpeza do storage.
          void supabase.storage
            .from('documents')
            .remove([file_url])
            .catch((cleanupError) => console.error('Falha ao remover arquivo órfão do storage:', cleanupError));
        }
        throw insertError;
      }

      return data;
    },
    onSuccess: (document) => invalidateDocumentsQueries(queryClient, { unitId: document.unit_id, dealId: document.deal_id }),
  });
}

/** Edita metadados de um documento já existente (tipo/título/data de emissão/observações) sem reenviar arquivo — ver comentário em `schemas.ts` sobre a simplificação em relação ao dialog único do original. */
export function useUpdateDocument(id: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: DocumentMetadataMutationPayload): Promise<Document> => {
      const { data, error } = await supabase
        .from('documents')
        .update({ ...input, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (document) =>
      invalidateDocumentsQueries(queryClient, { id, unitId: document.unit_id, dealId: document.deal_id }),
  });
}

/**
 * Aprova/rejeita (ou qualquer outra transição de status) um documento —
 * tradução de `handleApprove`/`handleReject` (`Documents.jsx`), ações de
 * linha exibidas só quando `status === "recebido"`. Recebe `id` no próprio
 * `mutate` (não fixado na criação do hook) — diferente do padrão
 * `useUpdateX(id)` do resto do projeto, porque `DocumentsListPage` precisa
 * aprovar/rejeitar qualquer linha de uma lista com um único hook, não uma
 * instância por documento (mesma ideia de `useUpdateDealStage`/
 * `useSoftDeleteDeal` em `features/deals/hooks.ts`, que recebem a entidade
 * inteira no `mutate` pelo mesmo motivo).
 */
export function useUpdateDocumentStatus() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: DocumentStatus }): Promise<Document> => {
      const { data, error } = await supabase
        .from('documents')
        .update({ status, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (document) =>
      invalidateDocumentsQueries(queryClient, { id: document.id, unitId: document.unit_id, dealId: document.deal_id }),
  });
}

/**
 * Exclusão é sempre soft delete (`is_deleted = true`), igual ao resto do
 * sistema — sem policy de DELETE na RLS (nem na tabela, nem no bucket, ver
 * `0032_rls_documents.sql`). O objeto no Storage não é removido (mesma
 * lacuna já documentada na migration — rotina de limpeza é decisão de
 * produto futura, fora de escopo).
 */
export function useSoftDeleteDocument() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (document: Pick<Document, 'id' | 'unit_id' | 'deal_id'>) => {
      const { error } = await supabase
        .from('documents')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: user?.id ?? null,
        })
        .eq('id', document.id);

      if (error) throw error;
      return document;
    },
    onSuccess: (document) =>
      invalidateDocumentsQueries(queryClient, { id: document.id, unitId: document.unit_id, dealId: document.deal_id }),
  });
}

/**
 * Gera uma signed URL sob demanda para visualizar/baixar um documento —
 * função simples (não um hook React Query: é chamada uma vez, no clique de
 * "Visualizar"/"Baixar", não precisa de cache/refetch/estado de loading
 * compartilhado entre componentes). O bucket é privado (`public = false`,
 * `0031_documents_storage.sql`) — não existe URL pública para montar direto,
 * só uma signed URL de validade curta.
 */
export async function getDocumentSignedUrl(path: string, expiresInSeconds = 60): Promise<string> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
