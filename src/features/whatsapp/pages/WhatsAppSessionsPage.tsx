import { useState } from 'react';
import { MessageCircle, Shield } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingInline } from '@/components/ui/loading-inline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuth } from '@/features/auth/AuthContext';
import { useWhatsAppSessions } from '@/features/whatsapp/hooks';
import type { WhatsAppFlowType, WhatsAppSessionStatus } from '@/features/whatsapp/types';

const STATUS_LABELS: Record<WhatsAppSessionStatus, string> = {
  ativa: 'Ativa',
  concluida: 'Concluída',
  expirada: 'Expirada',
  escalada: 'Escalada',
};

/** Classes de badge por status — tradução 1:1 de `statusColors` em `original-project/src/pages/WhatsAppSessions.jsx`. */
const STATUS_BADGE_CLASSES: Record<WhatsAppSessionStatus, string> = {
  ativa: 'border-transparent bg-green-100 text-green-700',
  concluida: 'border-transparent bg-blue-100 text-blue-700',
  expirada: 'border-transparent bg-slate-100 text-slate-600',
  escalada: 'border-transparent bg-orange-100 text-orange-700',
};

const FLOW_LABELS: Record<WhatsAppFlowType, string> = {
  manutencao: 'Manutenção',
  corretor: 'Corretor',
  indefinido: 'Indefinido',
};

/**
 * Tradução de `original-project/src/pages/WhatsAppSessions.jsx` — tela
 * 100% leitura (sem botão de ação nenhum, fiel ao original: a tabela não
 * tem policy de INSERT/UPDATE/DELETE, ver `0073_rls_whatsapp_sessions.sql`).
 * Filtros de Status/Fluxo são client-side sobre os dados já carregados
 * (mesmo `filter(...)` em memória do original), não refazem a query.
 *
 * Gate de acesso: `tenantRole === 'admin'`, mesmo critério e vocabulário
 * visual de `FinanceCheckupPage`/`DistratoCheckupPage` — defesa em
 * profundidade, não a autorização real (a RLS já restringe SELECT a
 * `tenant_role = 'admin'`, qualquer outro papel recebe lista vazia por
 * política, nunca chega a esta tela pelo menu).
 *
 * Estado vazio tratado explicitamente e sinalizado de propósito: a tabela
 * `whatsapp_sessions` é alimentada por um bot externo de WhatsApp que nunca
 * foi integrado a este repositório (nem aqui, nem no original) — em
 * produção esta tela fica genuinamente sem nenhuma linha, não é uma falha
 * de carregamento. Mensagem do `EmptyState` reflete isso, em vez de um
 * genérico "nenhum resultado para o filtro".
 */
export function WhatsAppSessionsPage() {
  const { tenantRole } = useAuth();
  const isAdmin = tenantRole === 'admin';

  const { data: sessions, isLoading, isError, refetch } = useWhatsAppSessions();

  const [statusFilter, setStatusFilter] = useState<WhatsAppSessionStatus | 'all'>('all');
  const [flowFilter, setFlowFilter] = useState<WhatsAppFlowType | 'all'>('all');

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <EmptyState
          icon={Shield}
          title="Acesso negado"
          description="Apenas administradores podem acessar as Sessões WhatsApp."
        />
      </div>
    );
  }

  const allSessions = sessions ?? [];
  const filtered = allSessions.filter((session) => {
    const statusOk = statusFilter === 'all' || session.status === statusFilter;
    const flowOk = flowFilter === 'all' || session.flow_type === flowFilter;
    return statusOk && flowOk;
  });

  return (
    <div>
      <PageHeader title="Sessões WhatsApp" subtitle="Monitoramento das sessões do bot de WhatsApp, somente leitura" />

      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <MessageCircle className="h-4 w-4" />
        {filtered.length} sessão(ões)
      </div>

      <Card className="mb-6 border-0 shadow-sm">
        <CardContent className="flex flex-wrap gap-3 pt-6">
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as WhatsAppSessionStatus | 'all')}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="ativa">Ativa</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
              <SelectItem value="expirada">Expirada</SelectItem>
              <SelectItem value="escalada">Escalada</SelectItem>
            </SelectContent>
          </Select>

          <Select value={flowFilter} onValueChange={(value) => setFlowFilter(value as WhatsAppFlowType | 'all')}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Fluxo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os fluxos</SelectItem>
              <SelectItem value="manutencao">Manutenção</SelectItem>
              <SelectItem value="corretor">Corretor</SelectItem>
              <SelectItem value="indefinido">Indefinido</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingInline />
      ) : isError ? (
        <ErrorState
          description="Não foi possível carregar as sessões de WhatsApp. Tente novamente em instantes."
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="Nenhuma sessão encontrada"
          description={
            allSessions.length === 0
              ? 'Esta tabela é alimentada por um bot de WhatsApp externo, que ainda não está integrado a este sistema — por isso nenhuma sessão aparece aqui.'
              : 'Nenhuma sessão corresponde aos filtros selecionados.'
          }
        />
      ) : (
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Fluxo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última mensagem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="font-mono">{session.phone}</TableCell>
                    <TableCell className="text-muted-foreground">{FLOW_LABELS[session.flow_type]}</TableCell>
                    <TableCell>
                      <span className="rounded bg-muted px-2 py-1 font-mono text-xs">{session.state || '—'}</span>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_BADGE_CLASSES[session.status]}>{STATUS_LABELS[session.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {session.last_message_at ? new Date(session.last_message_at).toLocaleString('pt-BR') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
