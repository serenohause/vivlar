import { ArrowLeft, ArrowRight, Info, RotateCcw, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { UnitAdminStatusBadge } from '@/features/units/components/UnitAdminStatusBadge';
import { ADMIN_STATUS_CONFIG } from '@/features/units/constants';
import { useApplyUnitDistrato, useUpdateUnitAdminStatus } from '@/features/units/hooks';
import type { Unit, UnitAdminStatus } from '@/features/units/types';

/** Sequência normal do pipeline — sem `distrato`, que não é um "próximo estágio" e sim uma saída lateral do fluxo, disponível a qualquer momento antes da entrega (mesma regra do original: botão "Realizar Distrato" habilitado enquanto `admin_status` não é `ENTREGUE`/`DISTRATO`). */
const PIPELINE_ORDER: UnitAdminStatus[] = [
  'laudo_engenharia',
  'em_conformidade',
  'cliente_conforme',
  'contrato_caixa',
  'cartorio',
  'registro_pago',
  'registrado',
  'entrega_casa',
  'entregue',
];

interface UnitAdminStatusPipelineProps {
  unit: Unit;
}

/**
 * Tradução simplificada da seção "Fluxo Administrativo MCMV" de
 * `original-project/src/pages/UnitDetail.jsx`: avança/retrocede
 * `admin_status` com um `update` simples na unidade (`useUpdateUnitAdminStatus`),
 * SEM a validação de "documentos obrigatórios aprovados antes de avançar"
 * do original (`checkCanAdvance`, que dependia de `Document`/`UnitCheck` —
 * módulo futuro de Documentos) e sem criar histórico de transição
 * (`StatusTransition`/`Activity`, módulo futuro de CRM). O aviso abaixo dos
 * botões comunica essa lacuna de forma discreta, sem alarmismo — não é um
 * erro, é uma limitação conhecida desta leva.
 *
 * "Marcar Distrato" NÃO é mais simplificado (débito quitado pela RPC
 * `apply_unit_distrato`, ver `0070_unit_distrato_rpcs.sql`): exige um
 * `termo_distrato` aprovado para esta unidade (a RPC lança exceção senão,
 * exibida via toast — fiel ao `alert(...)` de `handleDistrato` no
 * original), e faz atomicamente o que o original fazia em 4 escritas
 * sequenciais — marca o negócio ativo como `distratado`/inativo, libera a
 * unidade, grava `status_transitions` e cria a notificação (mural interno).
 */
export function UnitAdminStatusPipeline({ unit }: UnitAdminStatusPipelineProps) {
  const updateAdminStatus = useUpdateUnitAdminStatus(unit.id);
  const applyDistrato = useApplyUnitDistrato();

  function handleDistrato() {
    applyDistrato.mutate(
      { unitId: unit.id, reason: 'Distrato manual via UnitDetail', source: 'manual' },
      {
        onSuccess: () => toast.success('Distrato registrado.'),
        // Mensagem da RPC exibida direto (ex.: termo de distrato não
        // aprovado) — fiel ao `alert(...)` do original, no padrão de toast
        // já estabelecido no resto do app.
        onError: (error) => toast.error(error.message),
      }
    );
  }

  const currentIndex = unit.admin_status ? PIPELINE_ORDER.indexOf(unit.admin_status) : -1;
  const isInPipeline = currentIndex !== -1;
  const isDistrato = unit.admin_status === 'distrato';
  const isEntregue = unit.admin_status === 'entregue';

  const nextStatus: UnitAdminStatus | null = !unit.admin_status
    ? PIPELINE_ORDER[0]
    : isInPipeline && currentIndex < PIPELINE_ORDER.length - 1
      ? PIPELINE_ORDER[currentIndex + 1]
      : null;

  const previousStatus: UnitAdminStatus | null =
    isInPipeline && currentIndex > 0 ? PIPELINE_ORDER[currentIndex - 1] : null;
  const canGoToNotStarted = isInPipeline && currentIndex === 0;

  function handleUpdate(status: UnitAdminStatus | null, successMessage: string) {
    updateAdminStatus.mutate(status, {
      onSuccess: () => toast.success(successMessage),
      onError: () => toast.error('Erro ao atualizar o status administrativo.'),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Status atual</span>
          <UnitAdminStatusBadge status={unit.admin_status} />
        </div>

        {!isDistrato && (
          <div className="flex flex-wrap items-center gap-2">
            {previousStatus && (
              <Button
                variant="outline"
                size="sm"
                disabled={updateAdminStatus.isPending}
                onClick={() => handleUpdate(previousStatus, `Voltou para ${ADMIN_STATUS_CONFIG[previousStatus].label}.`)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
            )}
            {canGoToNotStarted && (
              <Button
                variant="outline"
                size="sm"
                disabled={updateAdminStatus.isPending}
                onClick={() => handleUpdate(null, 'Unidade removida do pipeline.')}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Remover do pipeline
              </Button>
            )}
            {nextStatus && (
              <Button
                variant="brand"
                size="sm"
                disabled={updateAdminStatus.isPending}
                onClick={() => handleUpdate(nextStatus, `Avançou para ${ADMIN_STATUS_CONFIG[nextStatus].label}.`)}
              >
                <ArrowRight className="mr-2 h-4 w-4" />
                {unit.admin_status ? `Avançar para ${ADMIN_STATUS_CONFIG[nextStatus].label}` : 'Iniciar pipeline'}
              </Button>
            )}
            {!isEntregue && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={applyDistrato.isPending}
                onClick={handleDistrato}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Marcar Distrato
              </Button>
            )}
          </div>
        )}
      </div>

      {isInPipeline && (
        <Progress value={((currentIndex + 1) / PIPELINE_ORDER.length) * 100} className="h-2" />
      )}

      <Alert className="border-0 bg-muted py-2.5">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs text-muted-foreground">
          A validação de documentos obrigatórios antes de avançar de estágio ainda não está ativa — esse controle
          depende do módulo de Documentos, que é futuro.
        </AlertDescription>
      </Alert>
    </div>
  );
}
