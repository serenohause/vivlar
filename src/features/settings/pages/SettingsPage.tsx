import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/PageHeader';
import { AccountTab } from '@/features/settings/components/AccountTab';
import { DocumentsTab } from '@/features/settings/components/DocumentsTab';
import { UsersTab } from '@/features/settings/components/UsersTab';

/**
 * Tradução de `original-project/src/pages/Settings.jsx` — só as 3 abas
 * reais desta rodada (`Usuários`/`Documentos`/`Conta`), por decisão já
 * tomada: "Notificações" só linkava para uma tela que ainda não existe
 * (módulo de Notificações não construído) e "Teams" (integração Microsoft
 * Teams) está fora de escopo desde o início do projeto — nenhuma das duas
 * vira aba "em breve", só saem do `<TabsList>`.
 */
export function SettingsPage() {
  return (
    <div>
      <PageHeader title="Configurações" subtitle="Gerencie usuários e regras do sistema" />

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="doc-rules">Documentos</TabsTrigger>
          <TabsTrigger value="account">Conta</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <UsersTab />
        </TabsContent>

        <TabsContent value="doc-rules">
          <DocumentsTab />
        </TabsContent>

        <TabsContent value="account">
          <AccountTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
