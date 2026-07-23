/**
 * Tradução 1:1 do enum `document_type` (ver `supabase/migrations/0030_documents.sql`
 * e `original-project/src/components/shared/Constants.jsx`, `DOC_TYPES`) —
 * 23 valores, chaves convertidas para snake_case minúsculo
 * (ex.: `LAUDO_ENG` -> `laudo_eng`).
 */
export const DOC_TYPE_VALUES = [
  'laudo_eng',
  'form_caixa_assinado',
  'contrato_caixa_assinado',
  'itbi',
  'certidao_negativa',
  'validacao_assinatura_gov',
  'comprov_registro_pago',
  'matricula_averbada',
  'contrato_caixa_selo_cartorio',
  'termo_vistoria',
  'termo_entrega',
  'termo_distrato',
  'matricula_imovel',
  'rg_cpf_cliente',
  'comprovante_renda',
  'comprovante_residencia',
  'certidao_casamento',
  'extrato_fgts',
  'declaracao_ir',
  'escritura',
  'averbacao',
  'habite_se',
  'outros',
] as const;

export type DocumentType = (typeof DOC_TYPE_VALUES)[number];

/**
 * Tradução 1:1 do enum `document_status` — 4 valores confirmados via
 * `DOC_STATUS_CONFIG` em `original-project/src/components/shared/StatusBadge.jsx`
 * (diverge do rascunho inicial de `docs/DOMAIN_MAP.md`/`docs/SCHEMA_PLAN.md`,
 * que listavam só 3 — ver comentário no topo de `0030_documents.sql`).
 */
export const DOCUMENT_STATUS_VALUES = ['pendente', 'recebido', 'aprovado', 'rejeitado'] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUS_VALUES)[number];

/**
 * Tradução 1:1 das colunas de `documents` — documento do módulo de gestão
 * documental MCMV. `project_id`/`unit_id`/`deal_id` todos nullable (o
 * contexto varia por tela de origem — `DocumentsListPage`, `UnitDetailPage`,
 * `DealDetailPage`, ver comentário no topo de `0030_documents.sql`).
 *
 * `file_url` guarda o PATH do objeto no bucket privado `documents`
 * (Storage, `0031_documents_storage.sql`), não uma URL pública — para
 * exibir/baixar o arquivo é preciso gerar uma signed URL (ver
 * `getDocumentSignedUrl` em `hooks.ts`). Nullable: `DocumentFormDialog`
 * permite criar/editar o registro sem arquivo anexado ainda, fiel ao
 * original.
 */
export interface Document {
  id: string;
  tenant_id: string;

  project_id: string | null;
  unit_id: string | null;
  deal_id: string | null;

  doc_type: DocumentType;
  title: string;
  notes: string | null;

  issued_at: string | null;
  received_at: string | null;

  status: DocumentStatus;

  file_url: string | null;
  file_name: string | null;

  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by_user_id: string | null;

  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}
