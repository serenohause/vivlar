import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import type { Client } from '@/features/clients/types';
import { MAINTENANCE_PRIORITY_CONFIG, MAINTENANCE_STATUS_CONFIG } from '@/features/maintenance/constants';
import type { MaintenancePriority, MaintenanceRequest, MaintenanceStatus } from '@/features/maintenance/types';
import { supabase } from '@/lib/supabase';

/**
 * Tradução de `original-project/src/components/reports/maintenanceReportPdf.jsx`
 * (`exportMaintenanceToPDF`) — relatório da LISTA de chamados de manutenção
 * (tabela resumo + opcionalmente detalhe/fotos de cada um), acionado pelo
 * botão "Gerar Relatório" de `MaintenanceListPage`. Diferenças documentadas
 * em relação ao original:
 *
 * - `mode` é `'resumo' | 'completo'` (minúsculo), seguindo a convenção de
 *   enum do projeto (`maintenance_status`/`maintenance_priority` também são
 *   minúsculos), em vez de `'RESUMO' | 'COMPLETO'`.
 * - "Gerado por" mostra só o e-mail do usuário logado
 *   (`generatedByEmail`, de `useAuth().user?.email`) em vez de
 *   "nome (email)" (`generatedByUser.full_name`) do original — o frontend
 *   não tem acesso ao nome completo de outros usuários do tenant (mesma
 *   limitação já documentada em "Responsável"/"Vistoriador" noutras telas).
 * - Status/Prioridade aparecem traduzidos para o rótulo em português
 *   (`MAINTENANCE_STATUS_CONFIG`/`MAINTENANCE_PRIORITY_CONFIG`) tanto nos
 *   filtros do cabeçalho quanto na tabela/detalhes — no original os valores
 *   já vinham em português do próprio enum (`"Alta"`, `"ABERTO"`); aqui o
 *   enum é minúsculo (`"alta"`, `"aberto"`), então a tradução para label é
 *   necessária para o PDF ficar legível, não é uma mudança de conteúdo.
 * - "Criado por" (Cliente/Operador) usa a mesma checagem de
 *   `getters.clients.find(c => c.user_id === request.created_by_user_id)`
 *   do original, mas sem o nome do operador (frontend não tem diretório de
 *   usuários do tenant — mesma limitação documentada na coluna "Criado Por"
 *   de `MaintenanceListPage`): mostra só "Operador" (ou "Cliente: <nome>",
 *   ou "—" quando `created_by_user_id` é nulo).
 * - Fotos: `request.photos` guarda PATHS do bucket privado
 *   `maintenance-photos` (não URLs públicas como no original) — cada uma é
 *   resolvida para uma signed URL (`supabase.storage...createSignedUrl`,
 *   validade de 5 min, mesma chamada usada por `useMaintenancePhotoSignedUrl`)
 *   antes de baixar como base64 e embutir no PDF; a mesma signed URL também
 *   vira o link de fallback ("Ver imagem") quando o embed falha.
 */

const VIVLAR_COLOR: [number, number, number] = [15, 76, 92];

/** `jsPDF` "aumentado" com o que o plugin `jspdf-autotable` (API baseada em função, v5+) grava na própria instância -- `doc.lastAutoTable` não existe no `.d.ts` de `jspdf`, só em runtime. */
interface JsPdfWithAutoTable extends jsPDF {
  lastAutoTable?: { finalY: number };
}

export type MaintenanceReportMode = 'resumo' | 'completo';

export interface MaintenanceReportFilters {
  status: MaintenanceStatus | 'all';
  category: string;
  priority: MaintenancePriority | 'all';
  project: string;
  projectName: string | null;
  search: string;
}

export interface MaintenanceReportGetters {
  getClientName: (clientId: string) => string;
  getProjectName: (projectId: string) => string;
  getUnitSKU: (unitId: string) => string;
  getResponsibleName: (userId: string | null) => string;
  /** Mesma lista já carregada pela página (`useClients()`) -- necessária para decidir o rótulo "Criado por" de cada chamado, mesmo critério de `getters.clients` no original. */
  clients: Client[];
}

export interface ExportMaintenanceReportToPdfInput {
  requests: MaintenanceRequest[];
  mode: MaintenanceReportMode;
  filters: MaintenanceReportFilters;
  generatedByEmail: string;
  generatedAt: string;
  getters: MaintenanceReportGetters;
}

function createdBySummaryLabel(request: MaintenanceRequest, clients: Client[]): string {
  const client = clients.find((c) => c.user_id === request.created_by_user_id);
  if (client) return 'Cliente';
  if (request.created_by_user_id) return 'Operador';
  return '—';
}

function createdByDetailLabel(request: MaintenanceRequest, clients: Client[]): string {
  const client = clients.find((c) => c.user_id === request.created_by_user_id);
  if (client) return `Cliente: ${client.name}`;
  if (request.created_by_user_id) return 'Operador';
  return '—';
}

/** Negrito/normal preservando a fonte atual do documento -- `doc.setFont(undefined, "bold")` do original não tipa em `jspdf` (fontName é obrigatório), então lemos a fonte corrente com `getFont()` em vez de hardcodar um nome. */
function setFontStyle(doc: jsPDF, style: 'bold' | 'normal'): void {
  doc.setFont(doc.getFont().fontName, style);
}

async function resolveMaintenancePhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('maintenance-photos').createSignedUrl(path, 300);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Baixa a foto (via signed URL) e embute no PDF como base64; devolve a signed URL (para o link de fallback) e se o embed deu certo. */
async function tryEmbedPhoto(
  doc: jsPDF,
  path: string,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<{ signedUrl: string | null; embedded: boolean }> {
  const signedUrl = await resolveMaintenancePhotoUrl(path);
  if (!signedUrl) return { signedUrl: null, embedded: false };

  try {
    const response = await fetch(signedUrl);
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const format = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(dataUrl, format, x, y, width, height);
    return { signedUrl, embedded: true };
  } catch {
    return { signedUrl, embedded: false };
  }
}

function addHeader(
  doc: jsPDF,
  title: string,
  generatedByEmail: string,
  generatedAt: string,
  filters: MaintenanceReportFilters
): number {
  doc.setFontSize(22);
  doc.setTextColor(...VIVLAR_COLOR);
  doc.text(title, 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Gerado em: ${new Date(generatedAt).toLocaleDateString('pt-BR')} às ${new Date(generatedAt).toLocaleTimeString('pt-BR')}`,
    14,
    28
  );
  doc.text(`Por: ${generatedByEmail}`, 14, 33);

  let yPos = 40;
  const activeFilters: string[] = [];

  if (filters.status !== 'all') {
    activeFilters.push(`Status: ${MAINTENANCE_STATUS_CONFIG[filters.status].label}`);
  }
  if (filters.category !== 'all') {
    activeFilters.push(`Categoria: ${filters.category}`);
  }
  if (filters.priority !== 'all') {
    activeFilters.push(`Prioridade: ${MAINTENANCE_PRIORITY_CONFIG[filters.priority].label}`);
  }
  if (filters.project !== 'all') {
    activeFilters.push(`Projeto: ${filters.projectName ?? filters.project}`);
  }
  if (filters.search) {
    activeFilters.push(`Busca: "${filters.search}"`);
  }

  if (activeFilters.length > 0) {
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text('Filtros aplicados:', 14, yPos);
    yPos += 5;
    activeFilters.forEach((filter) => {
      doc.text(`• ${filter}`, 18, yPos);
      yPos += 4;
    });
  }

  return yPos + 5;
}

function addSummaryTable(
  doc: JsPdfWithAutoTable,
  requests: MaintenanceRequest[],
  startY: number,
  getters: MaintenanceReportGetters
): number {
  const tableData = requests.map((request) => [
    new Date(request.created_at).toLocaleDateString('pt-BR'),
    getters.getClientName(request.client_id),
    getters.getProjectName(request.project_id),
    getters.getUnitSKU(request.unit_id),
    request.title.length > 30 ? `${request.title.substring(0, 30)}...` : request.title,
    request.category,
    MAINTENANCE_PRIORITY_CONFIG[request.priority].label,
    MAINTENANCE_STATUS_CONFIG[request.status].label,
    request.scheduled_date ? new Date(request.scheduled_date).toLocaleDateString('pt-BR') : '—',
    getters.getResponsibleName(request.responsible_user_id),
    createdBySummaryLabel(request, getters.clients),
  ]);

  autoTable(doc, {
    startY,
    head: [['Data', 'Cliente', 'Projeto', 'Unidade', 'Título', 'Categoria', 'Prior.', 'Status', 'Agend.', 'Respons.', 'Criado']],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: VIVLAR_COLOR, textColor: 255 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      4: { cellWidth: 40 },
    },
  });

  return doc.lastAutoTable?.finalY ?? startY;
}

async function addRequestDetails(doc: jsPDF, request: MaintenanceRequest, getters: MaintenanceReportGetters): Promise<void> {
  doc.addPage();

  let yPos = 20;

  doc.setFontSize(16);
  doc.setTextColor(...VIVLAR_COLOR);
  doc.text(`Solicitação #${request.id.substring(0, 8)}`, 14, yPos);
  yPos += 10;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  const info: { label: string; value: string }[] = [
    { label: 'Título', value: request.title },
    { label: 'Cliente', value: getters.getClientName(request.client_id) },
    { label: 'Projeto', value: getters.getProjectName(request.project_id) },
    { label: 'Unidade', value: getters.getUnitSKU(request.unit_id) },
    { label: 'Categoria', value: request.category },
    { label: 'Prioridade', value: MAINTENANCE_PRIORITY_CONFIG[request.priority].label },
    { label: 'Status', value: MAINTENANCE_STATUS_CONFIG[request.status].label },
    { label: 'Data de Abertura', value: new Date(request.created_at).toLocaleDateString('pt-BR') },
  ];

  if (request.suggested_date) {
    info.push({ label: 'Data Sugerida', value: new Date(request.suggested_date).toLocaleDateString('pt-BR') });
  }
  if (request.scheduled_date) {
    info.push({ label: 'Data Agendada', value: new Date(request.scheduled_date).toLocaleDateString('pt-BR') });
  }
  if (request.resolved_at) {
    info.push({ label: 'Data de Resolução', value: new Date(request.resolved_at).toLocaleDateString('pt-BR') });
  }

  info.push({ label: 'Criado por', value: createdByDetailLabel(request, getters.clients) });

  if (request.responsible_user_id) {
    info.push({ label: 'Responsável', value: getters.getResponsibleName(request.responsible_user_id) });
  }

  info.forEach((item) => {
    setFontStyle(doc, 'bold');
    doc.text(`${item.label}:`, 14, yPos);
    setFontStyle(doc, 'normal');
    doc.text(item.value, 60, yPos);
    yPos += 6;
  });

  yPos += 5;

  if (request.description) {
    setFontStyle(doc, 'bold');
    doc.text('Descrição:', 14, yPos);
    yPos += 6;
    setFontStyle(doc, 'normal');
    doc.setFontSize(9);
    const descLines = doc.splitTextToSize(request.description, 180);
    doc.text(descLines, 14, yPos);
    yPos += descLines.length * 5 + 5;
  }

  if (request.operator_notes) {
    doc.setFontSize(10);
    setFontStyle(doc, 'bold');
    doc.text('Observações do Operador:', 14, yPos);
    yPos += 6;
    setFontStyle(doc, 'normal');
    doc.setFontSize(9);
    const notesLines = doc.splitTextToSize(request.operator_notes, 180);
    doc.text(notesLines, 14, yPos);
    yPos += notesLines.length * 5 + 5;
  }

  if (request.photos.length > 0) {
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(12);
    setFontStyle(doc, 'bold');
    doc.text('Fotos/Anexos:', 14, yPos);
    yPos += 8;

    const photosPerRow = 2;
    const photoWidth = 80;
    const photoHeight = 60;
    const spacing = 10;

    for (let i = 0; i < Math.min(request.photos.length, 6); i++) {
      const path = request.photos[i];
      const col = i % photosPerRow;
      const row = Math.floor(i / photosPerRow);

      const xPos = 14 + col * (photoWidth + spacing);
      const currentYPos = yPos + row * (photoHeight + 15);

      if (currentYPos + photoHeight > 280) {
        doc.addPage();
        yPos = 20;
        continue;
      }

      const { signedUrl, embedded } = await tryEmbedPhoto(doc, path, xPos, currentYPos, photoWidth, photoHeight);

      if (!embedded) {
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text('Prévia indisponível', xPos, currentYPos + 10);
        if (signedUrl) {
          doc.setTextColor(0, 100, 200);
          doc.textWithLink('Ver imagem', xPos, currentYPos + 16, { url: signedUrl });
        }
        doc.setTextColor(0, 0, 0);
      }

      if (signedUrl) {
        doc.setFontSize(7);
        doc.setTextColor(0, 100, 200);
        doc.textWithLink(`Foto ${i + 1}`, xPos, currentYPos + photoHeight + 5, { url: signedUrl });
        doc.setTextColor(0, 0, 0);
      }
    }

    if (request.photos.length > 6) {
      yPos += Math.ceil(6 / photosPerRow) * (photoHeight + 15) + 5;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`+ ${request.photos.length - 6} foto(s) adicional(is) não exibida(s)`, 14, yPos);
    }
  }
}

/** Gera e baixa o PDF do relatório de manutenção -- ver comentário de topo do arquivo para as divergências em relação ao original. */
export async function exportMaintenanceReportToPdf({
  requests,
  mode,
  filters,
  generatedByEmail,
  generatedAt,
  getters,
}: ExportMaintenanceReportToPdfInput): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape' }) as JsPdfWithAutoTable;

  if (requests.length === 0) {
    doc.setFontSize(16);
    doc.setTextColor(...VIVLAR_COLOR);
    doc.text('Relatório de Manutenção', 14, 20);

    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text('Nenhuma solicitação encontrada para os filtros aplicados.', 14, 40);

    doc.save(`manutencao_relatorio_vazio_${new Date().toISOString().split('T')[0]}.pdf`);
    return;
  }

  const startY = addHeader(doc, 'Relatório de Manutenção', generatedByEmail, generatedAt, filters);

  doc.setDrawColor(200, 200, 200);
  doc.line(14, startY, 283, startY);

  doc.setFontSize(14);
  doc.setTextColor(...VIVLAR_COLOR);
  doc.text(`Resumo: ${requests.length} solicitação(ões)`, 14, startY + 8);

  addSummaryTable(doc, requests, startY + 15, getters);

  if (mode === 'completo') {
    for (const request of requests) {
      await addRequestDetails(doc, request, getters);
    }
  }

  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const filename = `manutencao_relatorio_${mode}_${timestamp}.pdf`;
  doc.save(filename);
}
