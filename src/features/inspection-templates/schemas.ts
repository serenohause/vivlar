import { z } from 'zod';

import { INSPECTION_SEVERITY_VALUES } from '@/features/inspection-templates/types';

// Diálogo "Novo/Editar Template" — fiel ao form de `Templates.jsx`
// (`showCreateModal`) e ao modal "Editar Template" de `TemplateDetail.jsx`
// (`showEditModal`): só nome (obrigatório) e descrição (opcional). O toggle
// `is_active` fica de fora deste schema — só aparece na aba "Configurações"
// de `TemplateDetail.jsx` (ver `templateSettingsFormSchema` abaixo).
export const templateFormSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do template.'),
  description: z.string().trim().optional(),
});

export type TemplateFormInput = z.infer<typeof templateFormSchema>;

export type TemplateFormMutationPayload = {
  name: string;
  description: string | null;
};

// Aba "Configurações" de `TemplateDetail.jsx` (`updateTemplateMutation` no
// form da tab `settings`) — mesmos campos de `templateFormSchema` + o
// toggle `is_active`.
export const templateSettingsFormSchema = templateFormSchema.extend({
  is_active: z.boolean(),
});

export type TemplateSettingsFormInput = z.infer<typeof templateSettingsFormSchema>;

export type TemplateSettingsMutationPayload = TemplateFormMutationPayload & {
  is_active: boolean;
};

// Diálogo "Novo/Editar Item" — fiel ao form de item de `TemplateDetail.jsx`
// (`showItemModal`): categoria e severidade padrão via `<Select>` (lista
// fixa, ver `CATEGORY_SUGGESTIONS`/`INSPECTION_SEVERITY_VALUES`), título
// obrigatório, instruções opcionais, foto obrigatória via switch.
export const templateItemFormSchema = z.object({
  category: z.string().trim().min(1, 'Selecione a categoria.'),
  title: z.string().trim().min(1, 'Informe o título do item.'),
  instructions: z.string().trim().optional(),
  severity_default: z.enum(INSPECTION_SEVERITY_VALUES, { error: 'Selecione a severidade padrão.' }),
  requires_photo: z.boolean(),
});

export type TemplateItemFormInput = z.infer<typeof templateItemFormSchema>;

export type TemplateItemMutationPayload = {
  category: string;
  title: string;
  instructions: string | null;
  severity_default: TemplateItemFormInput['severity_default'];
  requires_photo: boolean;
};
