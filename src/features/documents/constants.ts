import { FileCheck, FileText, FileX, HardHat, KeyRound, Landmark, Stamp, type LucideIcon } from 'lucide-react';

import type { DocumentStatus, DocumentType } from '@/features/documents/types';

/** Categorias originais de `DOC_TYPES` (`Constants.jsx`) — não vira coluna no banco (ver comentário em `0030_documents.sql`), só agrupamento de leitura/UI. */
export type DocCategory = 'ENGENHARIA' | 'CAIXA' | 'CARTORIO' | 'REGISTRO' | 'ENTREGA' | 'DISTRATO' | 'OUTROS';

/**
 * Tradução 1:1 de `DOC_TYPES` em `original-project/src/components/shared/Constants.jsx`
 * — label e categoria de cada um dos 23 tipos de documento.
 */
export const DOC_TYPES: Record<DocumentType, { label: string; category: DocCategory }> = {
  // ENGENHARIA
  laudo_eng: { label: 'Laudo de Engenharia', category: 'ENGENHARIA' },

  // CAIXA
  form_caixa_assinado: { label: 'Formulário Caixa assinado pelo cliente', category: 'CAIXA' },
  contrato_caixa_assinado: { label: 'Contrato Caixa (assinado)', category: 'CAIXA' },

  // CARTORIO
  itbi: { label: 'ITBI', category: 'CARTORIO' },
  certidao_negativa: { label: 'Certidão Negativa', category: 'CARTORIO' },
  validacao_assinatura_gov: { label: 'Validação assinatura GOV', category: 'CARTORIO' },

  // REGISTRO
  comprov_registro_pago: { label: 'Comprovante pagto registro cartório', category: 'REGISTRO' },
  matricula_averbada: { label: 'Matrícula averbada', category: 'REGISTRO' },
  contrato_caixa_selo_cartorio: { label: 'Contrato Caixa com selo do cartório', category: 'REGISTRO' },

  // ENTREGA
  termo_vistoria: { label: 'Termo de Vistoria', category: 'ENTREGA' },
  termo_entrega: { label: 'Termo de Entrega', category: 'ENTREGA' },

  // DISTRATO
  termo_distrato: { label: 'Termo de Distrato', category: 'DISTRATO' },

  // OUTROS
  matricula_imovel: { label: 'Matrícula do Imóvel', category: 'OUTROS' },
  rg_cpf_cliente: { label: 'RG/CPF Cliente', category: 'OUTROS' },
  comprovante_renda: { label: 'Comprovante de Renda', category: 'OUTROS' },
  comprovante_residencia: { label: 'Comprovante de Residência', category: 'OUTROS' },
  certidao_casamento: { label: 'Certidão de Casamento', category: 'OUTROS' },
  extrato_fgts: { label: 'Extrato FGTS', category: 'OUTROS' },
  declaracao_ir: { label: 'Declaração IR', category: 'OUTROS' },
  escritura: { label: 'Escritura', category: 'OUTROS' },
  averbacao: { label: 'Averbação', category: 'OUTROS' },
  habite_se: { label: 'Habite-se', category: 'OUTROS' },
  outros: { label: 'Outros', category: 'OUTROS' },
};

/** Tradução de `DOC_TYPE_LABELS` (`Constants.jsx`) — usado no `<Select>` de tipo e na coluna "Tipo" da tabela. */
export const DOC_TYPE_LABELS: Record<DocumentType, string> = Object.fromEntries(
  Object.entries(DOC_TYPES).map(([key, value]) => [key, value.label])
) as Record<DocumentType, string>;

/**
 * Ícone por categoria de tipo de documento — sem correspondência direta no
 * protótipo (`Documents.jsx` usa sempre o mesmo ícone `FileText` genérico
 * para todo documento), resolvido na mesma linguagem visual do resto do
 * app (mesmo padrão de ícone-por-categoria de `COMMISSION_ADJUSTMENT_CONFIG`
 * em `features/commissions/constants.ts`) — usado no círculo de ícone da
 * lista/tabela de documentos em vez do `FileText` fixo do original.
 */
export const DOC_CATEGORY_ICONS: Record<DocCategory, LucideIcon> = {
  ENGENHARIA: HardHat,
  CAIXA: Landmark,
  CARTORIO: Stamp,
  REGISTRO: FileCheck,
  ENTREGA: KeyRound,
  DISTRATO: FileX,
  OUTROS: FileText,
};

/**
 * Tradução 1:1 de `DOC_STATUS_CONFIG` em
 * `original-project/src/components/shared/StatusBadge.jsx` — cores do badge
 * de status do documento. Chaves trocadas para o enum real (`document_status`,
 * PENDENTE/RECEBIDO/APROVADO/REJEITADO -> pendente/recebido/aprovado/rejeitado).
 */
export const DOCUMENT_STATUS_CONFIG: Record<DocumentStatus, { label: string; color: string }> = {
  pendente: { label: 'Pendente', color: 'bg-gray-400' },
  recebido: { label: 'Recebido', color: 'bg-blue-500' },
  aprovado: { label: 'Aprovado', color: 'bg-green-600' },
  rejeitado: { label: 'Rejeitado', color: 'bg-red-500' },
};
