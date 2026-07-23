import { type ChangeEvent, useState } from 'react';
import { AlertCircle, FileText, PenTool, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Client } from '@/features/clients/types';
import { useCreateSignature, getInspectionMediaSignedUrl } from '@/features/inspections/hooks';
import type { InspectionSignature } from '@/features/inspections/types';
import { cn } from '@/lib/utils';

const ALLOWED_SIGNATURE_MIME_TYPES = ['application/pdf'];
const MAX_SIGNATURE_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB, mesmo limite do bucket (0035_inspections_storage.sql)

interface SignaturesSectionProps {
  inspectionId: string;
  signatures: InspectionSignature[];
  client: Client | null | undefined;
  currentUserEmail: string | null;
  canRequestSignature: boolean;
  /** `isEditable || status === 'enviado_ao_cliente'` — mesma condição de habilitar o botão "Assinar" do vistoriador no original. */
  canInspectorSign: boolean;
}

/**
 * Aba "Assinaturas" de `InspectionDetail.jsx`: assinatura do vistoriador
 * (só confirma um checkbox, sem arquivo) e assinatura do cliente (upload de
 * PDF já assinado fisicamente/externamente). Sem captura de assinatura
 * gráfica real em nenhum dos dois casos — fiel ao original, que também não
 * tinha (`confirmation_checkbox` é o único registro do vistoriador).
 */
export function SignaturesSection({
  inspectionId,
  signatures,
  client,
  currentUserEmail,
  canRequestSignature,
  canInspectorSign,
}: SignaturesSectionProps) {
  const createSignature = useCreateSignature(inspectionId);
  const [openingPdf, setOpeningPdf] = useState(false);

  const inspectorSignature = signatures.find((s) => s.signer_type === 'vistoriador');
  const clientSignature = signatures.find((s) => s.signer_type === 'cliente');
  const hasInspectorSignature = Boolean(inspectorSignature?.signed_at);
  const hasClientSignature = Boolean(clientSignature?.signed_at);

  function handleInspectorSign() {
    createSignature.mutate(
      { signerType: 'vistoriador', signerName: currentUserEmail ?? 'Vistoriador', signerDocument: currentUserEmail },
      {
        onSuccess: () => toast.success('Assinatura registrada!'),
        onError: () => toast.error('Erro ao registrar assinatura.'),
      }
    );
  }

  function handleClientFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!ALLOWED_SIGNATURE_MIME_TYPES.includes(file.type)) {
      toast.error('Tipo de arquivo não permitido. Envie um PDF.');
      return;
    }
    if (file.size > MAX_SIGNATURE_FILE_SIZE_BYTES) {
      toast.error('Arquivo muito grande. O limite é 20MB.');
      return;
    }

    createSignature.mutate(
      { signerType: 'cliente', signerName: client?.name ?? 'Cliente', signerDocument: client?.cpf ?? null, file },
      {
        onSuccess: () => toast.success('PDF da vistoria anexado com sucesso!'),
        onError: () => toast.error('Erro ao anexar PDF.'),
      }
    );
  }

  async function handleOpenClientPdf() {
    if (!clientSignature?.signature_file_url) return;
    setOpeningPdf(true);
    try {
      const signedUrl = await getInspectionMediaSignedUrl(clientSignature.signature_file_url);
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Não foi possível abrir o PDF assinado.');
    } finally {
      setOpeningPdf(false);
    }
  }

  return (
    <div className="space-y-4">
      {!canRequestSignature && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
              <div>
                <h3 className="font-semibold text-amber-900">Assinatura não disponível</h3>
                <p className="mt-1 text-sm text-amber-700">
                  A assinatura do cliente será liberada somente quando a vistoria estiver 100% conforme e o status for
                  "Enviado ao Cliente".
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vistoriador */}
      <Card className={cn('p-4', hasInspectorSignature ? 'border-green-300 bg-green-50' : 'border-slate-200')}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Badge variant={hasInspectorSignature ? 'default' : 'outline'}>Vistoriador</Badge>
            {hasInspectorSignature ? (
              <>
                <h4 className="mt-2 font-medium text-foreground">{inspectorSignature?.signer_name}</h4>
                <p className="mt-1 text-sm text-muted-foreground/80">
                  Assinado em {inspectorSignature?.signed_at ? new Date(inspectorSignature.signed_at).toLocaleString('pt-BR') : '—'}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Aguardando assinatura do vistoriador</p>
            )}
          </div>
          {!hasInspectorSignature && canInspectorSign && (
            <Button size="sm" onClick={handleInspectorSign} disabled={createSignature.isPending}>
              <PenTool className="mr-2 h-4 w-4" />
              Assinar
            </Button>
          )}
        </div>
      </Card>

      {/* Cliente (PDF) */}
      <Card className={cn('p-4', hasClientSignature ? 'border-green-300 bg-green-50' : 'border-slate-200')}>
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <Badge variant={hasClientSignature ? 'default' : 'outline'}>Vistoria Assinada pelo Cliente</Badge>
              {hasClientSignature ? (
                <>
                  <h4 className="mt-2 font-medium text-foreground">PDF da vistoria anexado</h4>
                  <p className="mt-1 text-sm text-muted-foreground/80">
                    Confirmado em {clientSignature?.signed_at ? new Date(clientSignature.signed_at).toLocaleString('pt-BR') : '—'}
                  </p>
                  {clientSignature?.signature_file_url && (
                    <Button variant="outline" size="sm" className="mt-2" onClick={handleOpenClientPdf} disabled={openingPdf}>
                      <FileText className="mr-2 h-4 w-4" />
                      Ver PDF Assinado
                    </Button>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  {canRequestSignature ? 'Anexe o PDF da vistoria assinado pelo cliente' : 'PDF poderá ser anexado quando a vistoria for enviada ao cliente'}
                </p>
              )}
            </div>
          </div>
          {!hasClientSignature && canRequestSignature && (
            <div>
              <input type="file" accept="application/pdf" id="client-pdf-signature" className="hidden" onChange={handleClientFileChange} />
              <Button
                variant="brand"
                size="sm"
                onClick={() => document.getElementById('client-pdf-signature')?.click()}
                disabled={createSignature.isPending}
              >
                <Upload className="mr-2 h-4 w-4" />
                {createSignature.isPending ? 'Enviando...' : 'Anexar PDF Assinado'}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
