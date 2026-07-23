import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthContext';
import type {
  TemplateFormMutationPayload,
  TemplateItemMutationPayload,
  TemplateSettingsMutationPayload,
} from '@/features/inspection-templates/schemas';
import type { InspectionTemplate, InspectionTemplateItem } from '@/features/inspection-templates/types';
import { supabase } from '@/lib/supabase';

const TEMPLATES_QUERY_KEY = ['inspection-templates'] as const;
// Chave própria (não aninhada em `templateItemsQueryKey`) porque é
// consultada isoladamente por `TemplatesListPage` (contagem de itens por
// card, mesma necessidade do `allItems` de `Templates.jsx`), sem depender
// de nenhum `templateId` específico.
const TEMPLATE_ITEM_COUNTS_QUERY_KEY = ['inspection-template-item-counts'] as const;

function templateQueryKey(id: string) {
  return ['inspection-template', id] as const;
}

function templateItemsQueryKey(templateId: string) {
  return ['inspection-template-items', templateId] as const;
}

/** Invalida a lista de templates e a contagem de itens (mudam junto: nome/status/soft-delete de um template, ou criação/remoção de item, afetam o card na lista). */
function invalidateTemplatesListQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: TEMPLATES_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: TEMPLATE_ITEM_COUNTS_QUERY_KEY });
}

/** Lista de templates do tenant (RLS restringe a admin/comercial/administrativo), excluindo soft-deleted, mais recentes primeiro (fiel a `"-updated_date"` de `Templates.jsx`). Usada por `TemplatesListPage`. */
export function useInspectionTemplates() {
  return useQuery({
    queryKey: TEMPLATES_QUERY_KEY,
    queryFn: async (): Promise<InspectionTemplate[]> => {
      const { data, error } = await supabase
        .from('inspection_templates')
        .select('*')
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Contagem de itens ativos por `template_id`, para o "N itens" exibido em
 * cada card de `TemplatesListPage` — tradução de `getItemCount`
 * (`Templates.jsx`), que soma `allItems` (todos os itens do tenant, sem
 * filtro de template) client-side. Só busca `id`/`template_id` (sem os
 * demais campos), reduzido aqui num mapa em vez de devolver a lista crua.
 */
export function useInspectionTemplateItemCounts() {
  return useQuery({
    queryKey: TEMPLATE_ITEM_COUNTS_QUERY_KEY,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.from('inspection_template_items').select('id, template_id').eq('is_deleted', false);

      if (error) throw error;
      return data.reduce<Record<string, number>>((counts, item) => {
        counts[item.template_id] = (counts[item.template_id] ?? 0) + 1;
        return counts;
      }, {});
    },
  });
}

/** Um template específico — `TemplateDetailPage`. */
export function useInspectionTemplate(id: string | undefined) {
  return useQuery({
    queryKey: templateQueryKey(id ?? ''),
    queryFn: async (): Promise<InspectionTemplate> => {
      const { data, error } = await supabase
        .from('inspection_templates')
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

/** Cria um template — tradução do dialog "Novo Template" de `Templates.jsx` (`createMutation`). Sempre nasce ativo (`is_active: true`), fiel ao original. */
export function useCreateInspectionTemplate() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: TemplateFormMutationPayload): Promise<InspectionTemplate> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data, error } = await supabase
        .from('inspection_templates')
        .insert({
          tenant_id: tenantId,
          name: input.name,
          description: input.description,
          is_active: true,
          created_by_user_id: user?.id ?? null,
          updated_by_user_id: user?.id ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateTemplatesListQueries(queryClient),
  });
}

/**
 * Edita um template já existente — usado pelo modal "Editar Template"
 * (nome/descrição) e pela aba "Configurações" (nome/descrição/`is_active`)
 * de `TemplateDetail.jsx`, e pelo botão "Ativar"/"Desativar" da própria
 * página de detalhe — todos operam sobre UM template já em foco na tela
 * (`id` fixado na criação do hook). Para o toggle de status na
 * `TemplatesListPage` (várias linhas, um único componente), ver
 * `useToggleInspectionTemplateActive` abaixo — mesma dualidade de padrão já
 * usada em `features/documents/hooks.ts` (`useUpdateDocument(id)` vs
 * `useUpdateDocumentStatus()`).
 */
export function useUpdateInspectionTemplate(id: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: Partial<TemplateSettingsMutationPayload>): Promise<InspectionTemplate> => {
      const { data, error } = await supabase
        .from('inspection_templates')
        .update({ ...input, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateQueryKey(id) });
      invalidateTemplatesListQueries(queryClient);
    },
  });
}

/**
 * Ativa/desativa um template a partir de uma linha de `TemplatesListPage`
 * (`toggleActiveMutation` de `Templates.jsx`) — recebe `id` no próprio
 * `mutate` (não fixado na criação do hook), porque a lista precisa
 * ativar/desativar qualquer card com uma única instância do hook, não uma
 * por template.
 */
export function useToggleInspectionTemplateActive() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }): Promise<InspectionTemplate> => {
      const { data, error } = await supabase
        .from('inspection_templates')
        .update({ is_active, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: templateQueryKey(template.id) });
      invalidateTemplatesListQueries(queryClient);
    },
  });
}

/** Exclusão é sempre soft delete (`is_deleted = true`), igual ao resto do sistema — tradução de `deleteMutation`/`deleteTemplateMutation`. Os itens do template não são soft-deletados junto (mesma lacuna do original: `InspectionTemplateItem` não é tocado quando o template é excluído). */
export function useSoftDeleteInspectionTemplate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('inspection_templates')
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
      queryClient.invalidateQueries({ queryKey: templateQueryKey(id) });
      invalidateTemplatesListQueries(queryClient);
    },
  });
}

/**
 * Duplica um template e todos os seus itens ativos — tradução de
 * `duplicateMutation` (`Templates.jsx`). A cópia nasce inativa
 * (`is_active: false`, fiel ao original) com o nome prefixado por "Cópia -".
 * Busca o template/itens de origem diretamente do banco (não do cache),
 * itens copiados num único `insert` em lote (uma requisição, não uma por
 * item como `Promise.all` do original) — ainda assim duas escritas não
 * atômicas (template, depois itens): se a segunda falhar, o template novo
 * fica sem itens, mesmo padrão non-atômico já aceito em
 * `useUploadDocument`/`useCreateFinanceAccount` para operações sem valor
 * financeiro envolvido.
 */
export function useDuplicateInspectionTemplate() {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (templateId: string): Promise<InspectionTemplate> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data: original, error: originalError } = await supabase
        .from('inspection_templates')
        .select('*')
        .eq('id', templateId)
        .single();
      if (originalError) throw originalError;

      const { data: items, error: itemsError } = await supabase
        .from('inspection_template_items')
        .select('*')
        .eq('template_id', templateId)
        .eq('is_deleted', false);
      if (itemsError) throw itemsError;

      const { data: newTemplate, error: insertTemplateError } = await supabase
        .from('inspection_templates')
        .insert({
          tenant_id: tenantId,
          name: `Cópia - ${original.name}`,
          description: original.description,
          is_active: false,
          created_by_user_id: user?.id ?? null,
          updated_by_user_id: user?.id ?? null,
        })
        .select()
        .single();
      if (insertTemplateError) throw insertTemplateError;

      if (items.length > 0) {
        const { error: insertItemsError } = await supabase.from('inspection_template_items').insert(
          items.map((item) => ({
            tenant_id: tenantId,
            template_id: newTemplate.id,
            category: item.category,
            title: item.title,
            instructions: item.instructions,
            severity_default: item.severity_default,
            requires_photo: item.requires_photo,
            order_index: item.order_index,
            created_by_user_id: user?.id ?? null,
            updated_by_user_id: user?.id ?? null,
          }))
        );
        if (insertItemsError) throw insertItemsError;
      }

      return newTemplate;
    },
    onSuccess: () => invalidateTemplatesListQueries(queryClient),
  });
}

/** Itens de um template, ordenados por `order_index` — tradução de `TemplateDetail.jsx` (`items`, `order_index` ascendente). */
export function useTemplateItems(templateId: string | undefined) {
  return useQuery({
    queryKey: templateItemsQueryKey(templateId ?? ''),
    queryFn: async (): Promise<InspectionTemplateItem[]> => {
      const { data, error } = await supabase
        .from('inspection_template_items')
        .select('*')
        .eq('template_id', templateId as string)
        .eq('is_deleted', false)
        .order('order_index', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: Boolean(templateId),
  });
}

/**
 * Cria um item de checklist — tradução de `createItemMutation`
 * (`TemplateDetail.jsx`). `order_index` é sempre o próximo disponível: o
 * original computa `Math.max(...items.map(i => i.order_index))` a partir do
 * array já carregado no componente; aqui a mesma conta é feita com uma
 * consulta direta ao banco (maior `order_index` ativo do template + 1) para
 * não depender do cache do React Query estar em dia no momento do clique.
 */
export function useCreateTemplateItem(templateId: string) {
  const queryClient = useQueryClient();
  const { tenantId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: TemplateItemMutationPayload): Promise<InspectionTemplateItem> => {
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data: lastItem, error: lastItemError } = await supabase
        .from('inspection_template_items')
        .select('order_index')
        .eq('template_id', templateId)
        .eq('is_deleted', false)
        .order('order_index', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastItemError) throw lastItemError;

      const { data, error } = await supabase
        .from('inspection_template_items')
        .insert({
          tenant_id: tenantId,
          template_id: templateId,
          category: input.category,
          title: input.title,
          instructions: input.instructions,
          severity_default: input.severity_default,
          requires_photo: input.requires_photo,
          order_index: (lastItem?.order_index ?? 0) + 1,
          created_by_user_id: user?.id ?? null,
          updated_by_user_id: user?.id ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateItemsQueryKey(templateId) });
      queryClient.invalidateQueries({ queryKey: TEMPLATE_ITEM_COUNTS_QUERY_KEY });
    },
  });
}

/** Edita um item já existente — tradução de `updateItemMutation` (`TemplateDetail.jsx`). */
export function useUpdateTemplateItem(templateId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, data: input }: { id: string; data: TemplateItemMutationPayload }): Promise<InspectionTemplateItem> => {
      const { data, error } = await supabase
        .from('inspection_template_items')
        .update({ ...input, updated_by_user_id: user?.id ?? null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateItemsQueryKey(templateId) }),
  });
}

/** Exclusão é sempre soft delete — tradução de `deleteItemMutation`. */
export function useSoftDeleteTemplateItem(templateId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('inspection_template_items')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: user?.id ?? null,
        })
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateItemsQueryKey(templateId) });
      queryClient.invalidateQueries({ queryKey: TEMPLATE_ITEM_COUNTS_QUERY_KEY });
    },
  });
}

/**
 * Sobe/desce um item na lista — tradução exata de `reorderItemMutation`
 * (`TemplateDetail.jsx`): troca o `order_index` entre o item e o adjacente
 * (não reescreve os índices da lista inteira). Diferente do original (que
 * usa o array `items` já carregado no componente para achar o vizinho), a
 * lista de itens ativos é consultada de novo dentro da mutation — mesmo
 * motivo de `useCreateTemplateItem`, não depender do cache estar em dia.
 * Duas `update` sequenciais, não atômicas (mesmo padrão non-crítico já
 * aceito no resto do projeto para operações sem valor financeiro) — se a
 * segunda falhar depois da primeira, os dois itens podem ficar com o mesmo
 * `order_index` até uma nova tentativa de reordenação corrigir.
 */
export function useReorderTemplateItem(templateId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ itemId, direction }: { itemId: string; direction: 'up' | 'down' }) => {
      const { data: items, error: itemsError } = await supabase
        .from('inspection_template_items')
        .select('id, order_index')
        .eq('template_id', templateId)
        .eq('is_deleted', false)
        .order('order_index', { ascending: true });
      if (itemsError) throw itemsError;

      const currentIndex = items.findIndex((item) => item.id === itemId);
      if (currentIndex === -1) return;

      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (newIndex < 0 || newIndex >= items.length) return;

      const current = items[currentIndex];
      const swapItem = items[newIndex];

      const { error: updateCurrentError } = await supabase
        .from('inspection_template_items')
        .update({ order_index: swapItem.order_index, updated_by_user_id: user?.id ?? null })
        .eq('id', current.id);
      if (updateCurrentError) throw updateCurrentError;

      const { error: updateSwapError } = await supabase
        .from('inspection_template_items')
        .update({ order_index: current.order_index, updated_by_user_id: user?.id ?? null })
        .eq('id', swapItem.id);
      if (updateSwapError) throw updateSwapError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateItemsQueryKey(templateId) }),
  });
}
