# Status do Projeto — Vivlar

> **Leia este arquivo primeiro**, em qualquer sessão nova do Claude Code
> neste projeto (inclusive se for você mesmo, semanas depois). Ele existe
> pra situar rápido: onde o projeto está, como ele é construído, e onde
> cavar mais fundo pra cada assunto. Atualizado ao final de cada módulo —
> se este arquivo estiver desatualizado, o `git log` e o `## Status` no
> final de `docs/ARCHITECTURE.md` são a fonte da verdade.

## O que é o Vivlar, em uma frase

Um sistema de gestão para incorporadoras/construtoras residenciais
(foco em empreendimentos MCMV — Minha Casa Minha Vida) que acompanha o
negócio do terreno até a entrega da casa: terrenos → projetos → unidades
→ funil de vendas → pipeline documental/cartorial → financeiro →
comissão de corretores → vistoria e manutenção pós-entrega. É uma
clonagem fiel de um app que o usuário já tinha rodando no Base44
(pasta `original-project/`), agora reconstruído como SaaS multitenant
(várias incorporadoras usando a mesma plataforma, dados isolados entre
si).

## Em produção agora

**https://vivlar.vercel.app** (Vercel + Supabase, projeto `vivlar`,
região `sa-east-1`, ref `hppeqpmxupfghymkulne`)

- ✅ Módulo 1 — Auth (login, signup, criação de empresa/tenant)
- ✅ Módulo 2 — Dashboard (menu lateral + página inicial)
- ✅ Módulo 3 — Catálogo (Terrenos, Projetos, Unidades)
- ✅ Módulo 4 — CRM (Clientes, Corretores, Imobiliárias, Kanban de negócios)
- ✅ Módulo 5 — Financeiro (Contas a Receber, Dashboard Financeiro, Inadimplência)
- ✅ Módulo 6 — Comissões
- ✅ Módulo 7 — Documentos (upload real de arquivo)
- ✅ Módulo 8 — Vistorias (templates de checklist + execução com fotos/assinatura)
- ✅ Módulo 9 — Manutenção pós-entrega (lista + detalhe, upload de fotos, só lado interno — sem portal do cliente ainda)
- ⏳ Investidores (**próximo**)

## Como o projeto é construído (processo, pra sessões novas entenderem)

Módulo por módulo, cada um seguindo esta ordem, com commit ao final de
cada etapa:

1. **Schema** (subagente `schema-architect`) — tabelas novas no Supabase, lidas contra o código-fonte real de `original-project/` (nunca supor campo, sempre confirmar).
2. **RLS** (subagente `rls-guardian`) — políticas de isolamento entre tenants + teste de isolamento rodado de verdade contra o banco remoto.
3. **UI** (subagente `frontend-builder`) — hooks + telas, fiéis ao layout do `original-project/`.
4. **Fechar loops** — módulos anteriores costumam deixar uma ponta solta (uma aba que dependia de uma tabela que ainda não existia); quando o módulo que resolve isso chega, a gente volta e conecta.
5. **Débito técnico documentado** — tudo que foi simplificado/adiado vai pra `docs/ARCHITECTURE.md`, seção "Débito técnico por módulo".
6. **Auditoria de segurança** (subagente `security-auditor`) — achado crítico/alto é sempre corrigido antes do deploy; achado médio/baixo é decisão do usuário (corrigir ou aceitar como risco documentado).
7. **Deploy** — push pro GitHub, a Vercel builda automaticamente.

## Mapa da documentação

| Arquivo | Pra que serve |
|---|---|
| `CLAUDE.md` | Convenções gerais do template + resumo do domínio deste projeto. Lido automaticamente no início de toda sessão. |
| `docs/STATUS.md` | Este arquivo — ponto de partida rápido. |
| `docs/ARCHITECTURE.md` | Registro detalhado: decisões de limpeza do schema, débito técnico por módulo, riscos de segurança aceitos, checklist de status completo. |
| `docs/DOMAIN_MAP.md` | Levantamento completo (campo a campo) das ~35 entidades do app original (Base44), fluxos de ponta a ponta, papéis de usuário. |
| `docs/SCHEMA_PLAN.md` | Mapa geral do banco pensado no início do projeto — histórico, algumas coisas mudaram depois (ver `ARCHITECTURE.md` pras decisões reais tomadas módulo a módulo). |
| `original-project/` | O app antigo (Base44) — fonte da verdade visual e funcional. Toda tela nova replica o layout de lá, a menos que o usuário peça mudança. Só existe localmente, não vai pro GitHub. |

## Acessos (onde estão, não o que são — nunca commitar segredo)

- **Supabase**: projeto `vivlar`. CLI já linkada neste ambiente (`npx supabase ...`).
- **Vercel**: projeto `vivlar`, time `serenohause-8780s-projects`. Deploy automático a cada push em `main`.
- **`.env.local`** (raiz do projeto, não commitado): chaves de cliente do Supabase.
- **GitHub**: `github.com/serenohause/vivlar`.

## Glossário rápido do domínio (pra quem não é do ramo imobiliário)

- **MCMV**: "Minha Casa Minha Vida", programa habitacional do governo federal. Várias regras do sistema (documentos exigidos, faixas de renda, subsídio, financiamento pela Caixa) existem por causa dele.
- **`admin_status` de uma unidade**: o pipeline documental/cartorial que uma unidade percorre *depois de vendida* — laudo de engenharia → conformidade → contrato Caixa → cartório → registro pago → registrado → entrega da casa → entregue. É **diferente** do status comercial (disponível/reservada/vendida/bloqueada), que é sobre a venda em si.
- **Deal (negócio)**: uma oportunidade de venda no funil comercial (CRM), do lead até vendido ou perdido. Uma unidade só pode ter 1 negócio ativo por vez.
- **Tenant**: uma incorporadora/construtora cliente da plataforma. Multitenancy = várias empresas usando o mesmo sistema, cada uma só enxergando os próprios dados (garantido por RLS no banco, não só por filtro na tela).
- **Vistoria**: inspeção de conformidade de uma unidade contra um checklist (template), com fotos e assinatura — normalmente feita antes da entrega ou em pós-venda.
- **Corretor / Comissão**: quem vende a unidade (autônomo ou de uma imobiliária parceira) recebe uma comissão, calculada sobre o valor de venda, que pode ter ajustes (desconto/acréscimo/bônus) e é paga em parcelas.

## Regra de processo (pedido do usuário, 2026-07-23)

O usuário é mais frontend do que backend/regra de negócio, e este é um
domínio (incorporação imobiliária residencial) que ele mesmo ainda está
aprendendo através do sistema. **Antes de começar a construir um módulo
novo, explique em linguagem simples**: o que o módulo faz na prática, que
problema de negócio ele resolve, e as principais decisões/trade-offs —
não assuma conhecimento prévio do domínio. Isso vale tanto pro chat
quanto, quando fizer sentido, pra documentação.
