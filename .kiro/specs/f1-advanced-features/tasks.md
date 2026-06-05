# Implementation Plan: F1 Advanced Features

## Overview

Implementação das cinco features avançadas do F1 Task Manager em TypeScript/Next.js 16 (App Router), Oracle Autonomous Database via `oracledb` direto, Tailwind CSS + shadcn/ui e fast-check para property-based testing. Todas as migrações de banco são opcionais nos campos existentes — nenhuma breaking change nas APIs atuais.

A ordem de implementação segue dependências técnicas: (1) fundação de DB + utilitários puros, (2) Tasks com horário + Conflict Validator, (3) Calendar, (4) Agenda, (5) Recorrência, (6) Pit Stop Shop, (7) integração e wiring final.

---

## Tasks

- [x] 1. Setup: ambiente de testes e migrações de banco
  - [x] 1.1 Instalar e configurar fast-check e Vitest
    - Instalar `fast-check`, `vitest`, `@vitest/coverage-v8` como devDependencies com versões exatas
    - Criar `vitest.config.ts` na raiz com suporte a TypeScript e path aliases (`@/`)
    - Criar `lib/__tests__/` e os arquivos de teste stub (`.property.test.ts`) para cada módulo puro
    - _Requirements: (infraestrutura de teste para todas as features)_

  - [x] 1.2 Criar script de migração de banco Oracle
    - Criar `scripts/migrate-advanced-features.js` que executa via `oracledb` os DDL abaixo em ordem:
      - `ALTER TABLE tasks ADD (scheduled_date DATE, start_time VARCHAR2(5), end_time VARCHAR2(5), estimated_duration NUMBER(4), rest_time NUMBER(2) DEFAULT 5, recurrence_series_id VARCHAR2(36), recurrence_instance_date DATE)`
      - `ALTER TABLE users ADD (xp_wallet NUMBER DEFAULT 0 NOT NULL)` com `CONSTRAINT chk_xp_wallet_nonneg CHECK (xp_wallet >= 0)`
      - `CREATE TABLE task_recurrence_series (...)` conforme design
      - `CREATE TABLE reward_items (...)` com constraints `chk_cost_positive` e `chk_status`
      - `CREATE TABLE redemptions (...)` com índice `idx_redemptions_user_date`
      - `CREATE INDEX idx_tasks_user_date ON tasks(user_id, scheduled_date)`
      - `CREATE INDEX idx_tasks_series ON tasks(recurrence_series_id)`
    - O script deve ser idempotente: usar `BEGIN EXECUTE IMMEDIATE ...; EXCEPTION WHEN OTHERS THEN NULL; END;` para DDL que pode já existir
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 4.2, 5.1_

- [x] 2. Utilitários puros de tempo (`lib/time-utils.ts`)
  - [x] 2.1 Implementar funções de cálculo de tempo
    - Exportar `parseTimeToMinutes(hhmm: string): number` — converte `'HH:MM'` em minutos desde meia-noite
    - Exportar `minutesToTime(minutes: number): string` — converte minutos de volta para `'HH:MM'`
    - Exportar `calculateDuration(startHHMM: string, endHHMM: string): number` — retorna `endMinutes - startMinutes`
    - Exportar `calculateEndTime(startHHMM: string, durationMinutes: number): { endTime: string; overMidnight: boolean }` — retorna horário de fim e flag se ultrapassa `1440`
    - Exportar `validateTimeRange(startHHMM: string, endHHMM: string): { valid: boolean; error?: string }` — retorna erro se `end <= start`
    - _Requirements: 2.2, 2.3, 2.4_

  - [ ]* 2.2 Escrever property tests para lib/time-utils.ts
    - **Property 4: Cálculo de duração a partir de início e fim é correto**
    - **Validates: Requirements 2.2**
    - **Property 5: Validação de fim <= início rejeita para qualquer par inválido**
    - **Validates: Requirements 2.3**
    - **Property 6: Cálculo de horário de fim a partir de início e duração é correto**
    - **Validates: Requirements 2.4**
    - Arquivo: `lib/__tests__/time-utils.property.test.ts`

- [x] 3. Utilitários de Pomodoro (`lib/pomodoro-utils.ts`)
  - [x] 3.1 Implementar initPomodoroFromTask
    - Exportar interface `PomodoroConfig { focusMinutes: number; restMinutes: number }`
    - Exportar interface `TaskWithTiming { estimatedDuration: number | null; restTime: number | null }`
    - Exportar `initPomodoroFromTask(task: TaskWithTiming): PomodoroConfig`
      - `focusMinutes = task.estimatedDuration ?? 25`
      - `restMinutes = task.restTime ?? 5`
    - _Requirements: 2.6, 2.8_

  - [ ]* 3.2 Escrever property tests para lib/pomodoro-utils.ts
    - **Property 7: Pomodoro inicializado com dados corretos da task**
    - **Validates: Requirements 2.6, 2.8**
    - Arquivo: `lib/__tests__/pomodoro-utils.property.test.ts`

- [x] 4. Conflict Validator (`lib/conflict-validator.ts`)
  - [x] 4.1 Implementar validateConflict
    - Exportar interfaces `TimeBlock` e `ConflictResult` conforme design
    - Exportar `validateConflict(newBlock, existingBlocks: TimeBlock[]): ConflictResult`
    - Algoritmo: filtrar blocks com status `GARAGE | COMPLETED` e `startTime + endTime` definidos; para cada candidato verificar `newStart < (existEnd + restTime) && newEnd > existStart`
    - Calcular `nextAvailableTime` como `minutesToTime(Math.max(...conflitantesFim + restTime))`
    - Formatar mensagem: `"Conflito com '[título]' (HH:MM–HH:MM). Próximo horário disponível: HH:MM."`
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 4.2 Escrever property tests para lib/conflict-validator.ts
    - **Property 9: Conflict_Validator detecta sobreposição corretamente**
    - **Validates: Requirements 3.2, 3.3, 3.4**
    - **Property 10: Conflict_Validator filtra corretamente por status**
    - **Validates: Requirements 3.5, 3.6**
    - Arquivo: `lib/__tests__/conflict-validator.property.test.ts`

- [x] 5. Recurrence Engine (`lib/recurrence-engine.ts`)
  - [x] 5.1 Implementar generateRecurrenceInstances e countInstances
    - Exportar tipos `RecurrenceType`, `RecurrenceConfig`, `RecurrenceGenerationResult` conforme design
    - Exportar `countInstances(config: RecurrenceConfig): number` — conta instâncias que seriam geradas sem criar nada
    - Exportar `generateRecurrenceInstances(config, existingConflicts: Set<string>): RecurrenceGenerationResult`
      - `DAILY` e `PERIOD`: uma instância por dia em `[startDate, endDate]`
      - `WEEKLY`: instâncias apenas nos dias da semana em `weekdays[]` dentro do intervalo
      - Se `countInstances > 365`: retornar `{ error: "O período selecionado geraria N instâncias. O limite é 365. Reduza o período para continuar.", instances: [], skippedDates: [], totalGenerated: 0 }`
      - Datas em `existingConflicts`: gerar instância com `status: 'SKIPPED'`; demais: `status: 'GARAGE'`
    - _Requirements: 4.2, 4.3, 4.4, 4.7, 4.8_

  - [ ]* 5.2 Escrever property tests para lib/recurrence-engine.ts
    - **Property 12: Geração diária/período produz instâncias para cada dia do intervalo**
    - **Validates: Requirements 4.2, 4.4**
    - **Property 13: Geração semanal respeita os dias selecionados**
    - **Validates: Requirements 4.3**
    - **Property 14: Limite de 365 instâncias é aplicado**
    - **Validates: Requirements 4.7**
    - **Property 15: Conclusão de instância recorrente afeta apenas aquela instância**
    - **Validates: Requirements 4.5**
    - **Property 16: Geração parcial com conflitos — instâncias não-conflitantes GARAGE, conflitantes SKIPPED**
    - **Validates: Requirements 4.8**
    - Arquivo: `lib/__tests__/recurrence-engine.property.test.ts`

- [x] 6. XP Wallet (`lib/xp-wallet.ts`)
  - [x] 6.1 Implementar creditXpBoth e debitWallet
    - Exportar `creditXpBoth(conn: oracledb.Connection, userId: string, amount: number): Promise<void>`
      - Dois `UPDATE` na mesma conexão com `autoCommit: false`: `UPDATE users SET xp = xp + :amount WHERE id = :userId` e `UPDATE users SET xp_wallet = xp_wallet + :amount WHERE id = :userId`
      - `conn.commit()` após ambos; `conn.rollback()` em caso de erro — nunca deixar um atualizado sem o outro
    - Exportar `debitWallet(conn: oracledb.Connection, userId: string, amount: number): Promise<{ success: boolean; newBalance: number; error?: string }>`
      - Verificar saldo atual com `SELECT xp_wallet FROM users WHERE id = :userId FOR UPDATE`
      - Se saldo < amount: retornar `{ success: false, newBalance: saldo, error: "XP insuficiente..." }`
      - Se saldo >= amount: executar `UPDATE users SET xp_wallet = xp_wallet - :amount WHERE id = :userId`, commit, retornar novo saldo
    - _Requirements: 5.1, 5.2, 5.7_

- [x] 7. Checkpoint — testes unitários de utilitários puros
  - Garantir que todos os testes em `lib/__tests__/` passem com `npx vitest --run`
  - Verificar que `time-utils`, `pomodoro-utils`, `conflict-validator` e `recurrence-engine` têm cobertura
  - Perguntar ao usuário se há dúvidas antes de prosseguir para as APIs

- [x] 8. Estender API de tasks (`app/api/tasks/`) com novos campos
  - [x] 8.1 Atualizar GET /api/tasks e GET /api/tasks/[id] para retornar novos campos
    - Modificar query SELECT em `app/api/tasks/route.ts` para incluir: `scheduled_date`, `start_time`, `end_time`, `estimated_duration`, `rest_time`, `recurrence_series_id`, `recurrence_instance_date`
    - Mapear colunas Oracle (uppercase) para camelCase no response: `scheduledDate`, `startTime`, `endTime`, `estimatedDuration`, `restTime`, `recurrenceSeriesId`, `recurrenceInstanceDate`
    - Atualizar `app/api/tasks/[id]/route.ts` da mesma forma no GET
    - _Requirements: 2.1, 2.9_

  - [x] 8.2 Atualizar POST /api/tasks para aceitar e persistir novos campos opcionais
    - Ler do body: `scheduledDate`, `startTime`, `endTime`, `estimatedDuration`, `restTime` (default `5`)
    - Validar com `validateTimeRange` se ambos `startTime` e `endTime` presentes; retornar HTTP 400 se inválido
    - Se `startTime` + `estimatedDuration` presentes e `endTime` ausente: calcular `endTime` via `calculateEndTime`; incluir aviso no response se `overMidnight`
    - Executar `validateConflict` contra tasks existentes do usuário naquela data antes de inserir; retornar HTTP 409 com mensagem se conflito
    - Incluir novos campos no `INSERT INTO tasks`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.7_

  - [x] 8.3 Atualizar PATCH /api/tasks/[id] para suportar novos campos e conclusão com XP duplo
    - Aceitar patch de `scheduledDate`, `startTime`, `endTime`, `estimatedDuration`, `restTime`
    - Aplicar mesmas validações de horário e conflito que o POST (excluindo a própria task da verificação de conflito)
    - Quando `status` muda para `COMPLETED`: usar `creditXpBoth` de `lib/xp-wallet.ts` com `autoCommit: false` em vez do UPDATE simples atual
    - Quando `status` muda para `COMPLETED` e Pomodoro está ativo: o front-end receberá o sinal via resposta da API (não é responsabilidade desta rota encerrar o timer — o componente React já assiste ao status)
    - _Requirements: 2.5, 2.7, 5.2_

- [x] 9. Calendar Utils e API (`app/calendar/`)
  - [x] 9.1 Implementar funções utilitárias do Calendar (`app/calendar/utils.ts`)
    - Exportar interface `CalendarTask` conforme design
    - Exportar `groupTasksByDay(tasks: CalendarTask[]): Record<string, CalendarTask[]>` — chave = `scheduledDate`, tasks sem data são ignoradas
    - Exportar `getOverflowDisplay(tasks: CalendarTask[]): { visible: CalendarTask[]; overflowCount: number }` — `visible = tasks.slice(0, 3)`, `overflowCount = Math.max(0, tasks.length - 3)`
    - Exportar `getCalendarWeekRange(year: number, isoWeek: number): { start: Date; end: Date }` — datas de segunda a domingo da semana ISO
    - _Requirements: 1.1, 1.4_

  - [ ]* 9.2 Escrever property tests para app/calendar/utils.ts
    - **Property 1: Agrupamento de tasks por dia é exato**
    - **Validates: Requirements 1.1**
    - **Property 2: Alternância de visualização preserva data de referência**
    - **Validates: Requirements 1.3**
    - **Property 3: Overflow display respeita limite de 3 tasks visíveis**
    - **Validates: Requirements 1.4**
    - Arquivo: `app/calendar/__tests__/utils.property.test.ts`

  - [x] 9.3 Implementar GET /api/calendar
    - Criar `app/api/calendar/route.ts`
    - Aceitar query params: `year`, `month` (view mensal) ou `year`, `week` (view semanal ISO)
    - Validar params; retornar HTTP 400 se inválidos
    - Query Oracle: `SELECT id, title, difficulty, status, scheduled_date, start_time, end_time, recurrence_series_id FROM tasks WHERE user_id = :userId AND scheduled_date BETWEEN :startDate AND :endDate ORDER BY scheduled_date, start_time`
    - Retornar array de `CalendarTask` com datas no formato `'YYYY-MM-DD'`
    - _Requirements: 1.1, 1.2, 1.8, 1.9_

  - [x] 9.4 Implementar página Calendar (`app/calendar/page.tsx`)
    - Componente React client-side com estado: `viewMode: 'monthly' | 'weekly'`, `referenceDate: Date`
    - Botões "Mensal" / "Semanal" — alternar `viewMode` sem alterar `referenceDate` (Requirement 1.3)
    - Navegação anterior/próximo: atualiza `referenceDate` por mês ou semana conforme `viewMode`; fetch `/api/calendar` com params corretos
    - View mensal: grid 7×5/6 com dias do mês; cada célula mostra até 3 tasks via `getOverflowDisplay` + badge `+N` se overflow; clique em day vazio abre dialog de criação com data pré-preenchida
    - View semanal: coluna por dia (seg–dom) com blocos de 30 min; tasks posicionadas pelo `startTime`
    - Popover ao clicar em indicador de task: título, horário, status
    - Botão "Nova Tarefa" sempre visível sem pré-preencher data
    - Em caso de erro de fetch: exibir mensagem de erro + botão "Tentar novamente"; controles de navegação não travam
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

- [x] 10. Agenda API e página (`app/agenda/`)
  - [x] 10.1 Implementar GET /api/agenda
    - Criar `app/api/agenda/route.ts`
    - Aceitar query params: `date` (YYYY-MM-DD) — retorna tasks do dia com `startTime` e `endTime` definidos
    - Query Oracle com `scheduled_date = :date AND user_id = :userId AND start_time IS NOT NULL AND end_time IS NOT NULL ORDER BY start_time`
    - Retornar tasks ordenadas por `startTime` com todos os campos de `CalendarTask` + `estimatedDuration` + `restTime`
    - _Requirements: 3.1, 3.7, 3.8_

  - [x] 10.2 Implementar página Agenda (`app/agenda/page.tsx`)
    - Componente client-side com seletor de data e lista de blocos do dia
    - Buscar tasks via `GET /api/agenda?date=YYYY-MM-DD`
    - Exibir tasks ordenadas por `startTime` com altura de bloco proporcional a `estimatedDuration` (1 min = N px, definir constante)
    - Exibir ícone de recorrência (seta circular) em tasks com `recurrenceSeriesId` não-nulo
    - _Requirements: 3.8, 4.9_

- [x] 11. Formulário de criação/edição de task — campos avançados
  - [x] 11.1 Atualizar componente de criação de task no Dashboard e Calendar
    - Adicionar campos opcionais ao Dialog de "Nova Tarefa" no `app/dashboard/page.tsx`:
      - `scheduledDate` (input date)
      - `startTime` (input time, HH:MM)
      - `endTime` (input time, calculado automaticamente se `estimatedDuration` preenchido)
      - `estimatedDuration` (input number, 1–1440 min)
      - `restTime` (input number, 1–60 min, placeholder "5")
      - Select de recorrência: "Sem recorrência" | "Diária" | "Semanal" | "Período específico"
    - Lógica de auto-cálculo no front-end: quando `startTime` + `estimatedDuration` mudam, calcular e preencher `endTime`; exibir aviso se ultrapassa meia-noite
    - Lógica de auto-cálculo: quando `startTime` + `endTime` presentes, calcular e preencher `estimatedDuration`
    - Exibir mensagem de erro inline se `endTime <= startTime`
    - Exibir mensagem de conflito retornada pelo API (HTTP 409) inline no form
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.1_

  - [x] 11.2 Atualizar card de task no Dashboard para exibir campos de tempo
    - Modificar card de task pendente em `app/dashboard/page.tsx`
    - Se `startTime` ou `estimatedDuration` não-nulos: exibir seção de horário com `startTime`–`endTime` e duração
    - Se ambos nulos: omitir seção (sem valores nulos ou "—")
    - Se `recurrenceSeriesId` não-nulo: exibir ícone de recorrência (ex: `<RotateCcw>` do lucide-react)
    - Botão "Iniciar Pomodoro" na task: chamar `initPomodoroFromTask` para configurar o timer com duração e restTime da task
    - Integrar Pomodoro com task: quando task for completada enquanto Pomodoro está rodando vinculado a ela, encerrar timer (setar `running = false` e `secondsLeft = 0`)
    - _Requirements: 2.6, 2.7, 2.8, 2.9, 4.9_

- [x] 12. API e lógica de Recorrência (`app/api/recurrence/`)
  - [x] 12.1 Implementar POST /api/recurrence — criar série recorrente
    - Criar `app/api/recurrence/route.ts`
    - Aceitar body: `title`, `difficulty`, `recurrenceType`, `startDate`, `endDate`, `weekdays?`, `startTime?`, `endTime?`, `estimatedDuration?`, `restTime?`
    - Chamar `countInstances` — se > 365, retornar HTTP 422 com mensagem do design
    - Para cada data a gerar: verificar conflito com tasks existentes do usuário naquela data usando `validateConflict`; coletar datas conflitantes em `Set<string>`
    - Chamar `generateRecurrenceInstances(config, conflictSet)`
    - Em transação Oracle (`autoCommit: false`):
      1. `INSERT INTO task_recurrence_series (...)` com UUID gerado
      2. `INSERT INTO tasks (...)` para cada instância com `status` correspondente (`GARAGE` ou `SKIPPED`), `recurrence_series_id` e `recurrence_instance_date`
      3. Commit após todos os inserts
    - Se instâncias puladas: retornar HTTP 207 com `skippedDates`; caso contrário HTTP 201
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.7, 4.8_

  - [x] 12.2 Implementar DELETE /api/recurrence/[id] — excluir instância ou série futura
    - Criar `app/api/recurrence/[id]/route.ts`
    - Aceitar query param `mode: 'single' | 'future'`
    - `single`: `DELETE FROM tasks WHERE id = :id`
    - `future`: `DELETE FROM tasks WHERE recurrence_series_id = :seriesId AND recurrence_instance_date >= :instanceDate`
    - Retornar HTTP 200 com count de registros deletados
    - _Requirements: 4.6_

- [x] 13. Pit Stop Shop — utilitários, validação e componentes de estado
  - [x] 13.1 Implementar utilitários e validação do Pit Stop Shop (`app/pit-stop-shop/utils.ts`)
    - Exportar `validateRewardItem(name: string, description: string, cost: number): { valid: boolean; errors: string[] }`
      - `name`: 1–100 chars; `description`: 0–500 chars; `cost`: inteiro > 0
    - Exportar `formatInsufficientXpMessage(current: number, required: number): string`
      - Formato: `"XP insuficiente. Você tem N XP e precisa de M XP. Faltam X XP."`
    - Exportar `sortRedemptionsByDate(redemptions: Redemption[]): Redemption[]` — ordena por `redeemedAt` decrescente
    - Exportar função de simulação de resgate puro `simulateRedeem(walletBalance: number, item: RewardItem): { success: boolean; newBalance?: number; error?: string }`
    - _Requirements: 5.3, 5.7, 5.8_

  - [ ]* 13.2 Escrever property tests para app/pit-stop-shop/utils.ts
    - **Property 18: XP_Wallet nunca é negativa após qualquer sequência de operações**
    - **Validates: Requirements 5.1, 5.7**
    - **Property 20: Validação de Reward_Item aceita entradas válidas e rejeita inválidas**
    - **Validates: Requirements 5.3**
    - **Property 21: Resgate debita wallet e registra snapshot correto**
    - **Validates: Requirements 5.6**
    - **Property 22: Resgate de item inativo é sempre rejeitado**
    - **Validates: Requirements 5.11**
    - **Property 23: Histórico de resgates ordenado por data decrescente**
    - **Validates: Requirements 5.8**
    - **Property 24: Edição de Reward_Item não altera snapshots de Redemptions existentes**
    - **Validates: Requirements 5.5**
    - Arquivo: `app/pit-stop-shop/__tests__/utils.property.test.ts`

- [ ] 14. Pit Stop Shop — APIs
  - [x] 14.1 Implementar GET /api/pit-stop-shop/wallet e GET /api/pit-stop-shop/items
    - Criar `app/api/pit-stop-shop/wallet/route.ts`: `SELECT xp_wallet FROM users WHERE id = :userId`; retornar `{ walletBalance: number }`
    - Criar `app/api/pit-stop-shop/items/route.ts`: `SELECT * FROM reward_items WHERE user_id = :userId AND status = 'ACTIVE' ORDER BY created_at DESC`; retornar array de `RewardItem`
    - _Requirements: 5.1, 5.4, 5.9_

  - [x] 14.2 Implementar POST e PATCH /api/pit-stop-shop/items
    - POST: validar com `validateRewardItem`; gerar UUID; `INSERT INTO reward_items`; retornar item criado com HTTP 201
    - PATCH `[id]`: aceitar `name?`, `description?`, `cost?`, `status?`; atualizar apenas campos fornecidos; `UPDATE reward_items SET updated_at = CURRENT_TIMESTAMP`; **não** modificar redemptions existentes
    - PATCH com `status: 'INACTIVE'`: apenas muda status, não deleta do banco
    - _Requirements: 5.3, 5.4, 5.5_

  - [x] 14.3 Implementar POST /api/pit-stop-shop/redeem
    - Criar `app/api/pit-stop-shop/redeem/route.ts`
    - Aceitar body: `{ rewardItemId: string }`
    - Buscar item: verificar `status === 'ACTIVE'`; se não: HTTP 410 com `"Este item não está mais disponível"`
    - Usar `debitWallet` de `lib/xp-wallet.ts` em conexão com `autoCommit: false`
    - Se saldo insuficiente: HTTP 402 com mensagem de `formatInsufficientXpMessage`
    - Se sucesso: `INSERT INTO redemptions (id, user_id, reward_item_id, name_snapshot, cost_snapshot, redeemed_at)` com `name_snapshot = item.name` e `cost_snapshot = item.cost` **no momento do resgate**; commit; retornar `RedeemResult`
    - _Requirements: 5.6, 5.7, 5.11_

  - [x] 14.4 Implementar GET /api/pit-stop-shop/redemptions
    - Criar `app/api/pit-stop-shop/redemptions/route.ts`
    - Query: `SELECT * FROM redemptions WHERE user_id = :userId ORDER BY redeemed_at DESC`
    - Retornar array de `Redemption` com campos mapeados para camelCase
    - _Requirements: 5.8_

- [x] 15. Pit Stop Shop — página e componentes UI
  - [x] 15.1 Implementar página Pit Stop Shop (`app/pit-stop-shop/page.tsx`)
    - Componente client-side com três seções: saldo da wallet, lista de reward items, histórico de resgates
    - Exibir saldo com label distinto: `"💰 Carteira: N XP"` separado do XP de progressão (`"⭐ XP Total: N"`)
    - Formulário de criação de Reward_Item: campos `name`, `description`, `cost`; validação inline via `validateRewardItem`
    - Lista de itens ativos com botão "Resgatar" (desabilitado se saldo insuficiente); mostrar custo em XP
    - Botão "Desativar" em cada item ativo
    - Histórico de resgates: lista ordenada por data decrescente com `nameSnapshot`, `costSnapshot`, `redeemedAt`
    - Após resgate bem-sucedido: atualizar saldo da wallet no estado React sem recarregar a página (Requirement 5.10, ≤ 2s)
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11_

  - [ ]* 15.2 Escrever testes unitários para componentes do Pit Stop Shop
    - Testar que o formulário exibe dois labels distintos para wallet e XP de progressão (Requirement 5.9)
    - Testar que o botão "Resgatar" é desabilitado quando saldo < custo
    - Arquivo: `app/pit-stop-shop/__tests__/page.test.tsx`

- [x] 16. Integração: Property 8 e Property 17 — rendering de card de task
  - [x] 16.1 Implementar e testar função de rendering de informações do card
    - Criar `app/dashboard/utils.ts` com funções puras extraídas do componente:
      - `getTaskTimeInfo(task: Task): { hasTime: boolean; display: string | null }` — retorna `hasTime: true` sse `startTime` ou `estimatedDuration` não-nulos
      - `hasRecurrenceIcon(task: Task): boolean` — retorna `true` sse `recurrenceSeriesId` não-nulo
    - Essas funções são usadas pelo card de task no Dashboard e pelos componentes de Calendar
    - _Requirements: 2.9, 4.9_

  - [ ]* 16.2 Escrever property tests para app/calendar/utils.ts (Property 8) e dashboard/utils.ts (Property 17)
    - **Property 8: Card de task exibe campos de tempo sse presentes**
    - **Validates: Requirements 2.9**
    - **Property 17: Card de task recorrente exibe ícone de recorrência sse série presente**
    - **Validates: Requirements 4.9**
    - Adicionar ao arquivo `app/calendar/__tests__/utils.property.test.ts`

- [x] 17. Integração: Property 19 — simetria de crédito de XP
  - [x] 17.1 Escrever property test para simetria de crédito XP
    - Criar `lib/__tests__/xp-wallet.property.test.ts`
    - **Property 19: Crédito de XP é simétrico entre progressão e wallet**
    - **Validates: Requirements 5.2**
    - Testar `creditXpBoth` com mock da conexão Oracle: verificar que ambos os campos são incrementados pelo mesmo valor `G`

- [x] 18. Checkpoint final — todos os testes e integração completa
  - Garantir que `npx vitest --run` passa sem erros
  - Verificar que as páginas `/calendar`, `/agenda` e `/pit-stop-shop` carregam sem erros (verificação por código, não execução)
  - Verificar que navegação do app referencia as novas páginas (adicionar links no layout ou nav existente se ausentes)
  - Verificar que `scripts/migrate-advanced-features.js` está completo e documentado
  - Perguntar ao usuário se há dúvidas antes de encerrar

---

## Notes

- Tarefas marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- O projeto **não tem Prisma em runtime** — todas as queries usam `lib/oracle.ts` (`query<T>` e `execute`) diretamente
- Antes de escrever qualquer código Next.js, consultar `node_modules/next/dist/docs/` conforme AGENTS.md — esta é a versão 16 com potenciais breaking changes
- Colunas Oracle são retornadas em UPPERCASE pelo driver `oracledb` — sempre mapear para camelCase no response
- A operação atômica de XP duplo (`creditXpBoth`) é crítica: nunca usar `autoCommit: true` nela
- O design.md tem uma inconsistência de formatação na seção "Property Reflection" com `###` — ignorar; as propriedades numeradas acima são a fonte de verdade
- Instalar fast-check antes de criar qualquer teste de propriedade: `npm install --save-dev fast-check vitest @vitest/coverage-v8`
- Cada property test deve incluir o comentário: `// Feature: f1-advanced-features, Property N: <descrição>`
- Status `SKIPPED` precisa ser adicionado como valor válido na coluna `status` da tabela `tasks` no Oracle (não há `ENUM` em Oracle — é implícito pela aplicação)

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "5.1", "6.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.2", "5.2", "9.1"] },
    { "id": 3, "tasks": ["8.1", "9.2", "9.3", "13.1"] },
    { "id": 4, "tasks": ["8.2", "8.3", "9.4", "10.1", "13.2"] },
    { "id": 5, "tasks": ["10.2", "11.1", "12.1", "14.1"] },
    { "id": 6, "tasks": ["11.2", "12.2", "14.2", "14.3", "14.4"] },
    { "id": 7, "tasks": ["15.1", "16.1"] },
    { "id": 8, "tasks": ["15.2", "16.2", "17.1"] }
  ]
}
```
