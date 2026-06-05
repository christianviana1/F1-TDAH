# Requirements Document

## Introduction

Este documento especifica os requisitos para o conjunto de features avançadas do F1 Task Manager — uma aplicação gamificada com tema de Fórmula 1. As features cobrem cinco áreas: visualização em Calendário, enriquecimento de Tasks com duração e horário, Agenda com blocos de tempo e validação de conflito, Tasks Recorrentes e Loja de Recompensas (Pit Stop Shop). O sistema já conta com tasks (SOFT/MEDIUM/HARD), XP, níveis e Pomodoro simples (25 min fixo), rodando em Next.js 16, Oracle Autonomous Database e NextAuth.

---

## Glossary

- **System**: A aplicação F1 Task Manager como um todo.
- **Calendar**: Módulo de visualização mensal e semanal de tasks por dia.
- **Agenda**: Módulo de gerenciamento de tasks com blocos de tempo definidos (horário início/fim).
- **Task**: Unidade de trabalho com título, dificuldade (SOFT/MEDIUM/HARD), status (GARAGE/COMPLETED), e opcionalmente horário, duração estimada e tempo de descanso.
- **Pomodoro**: Temporizador de foco vinculado a uma Task, com duração variável.
- **Recurrence_Engine**: Componente responsável por expandir e gerenciar tasks recorrentes.
- **Conflict_Validator**: Componente que valida sobreposição de blocos de tempo entre tasks, respeitando o tempo de descanso.
- **Pit_Stop_Shop**: Módulo de loja de recompensas personalizadas do usuário.
- **XP_Wallet**: Saldo de XP disponível para gasto na Pit_Stop_Shop, acumulado em paralelo ao XP de progressão.
- **Reward_Item**: Item criado pelo usuário na Pit_Stop_Shop com nome, descrição e custo em XP.
- **Redemption**: Registro de resgate de um Reward_Item pelo usuário.
- **Rest_Time**: Intervalo de descanso pós-task (padrão: 5 minutos, mínimo: 1, máximo: 60), configurável por task.
- **Pilot**: Usuário autenticado da aplicação.
- **XP**: Pontos de experiência acumulados ao completar tasks, usados tanto para progressão de nível quanto para a XP_Wallet.

---

## Requirements

### Requirement 1: Visualização em Calendário

**User Story:** Como Piloto, quero visualizar minhas tasks em um calendário mensal e semanal, para que eu possa ter uma visão geral da minha programação e planejar meu cronograma de corridas.

#### Acceptance Criteria

1. WHEN o Piloto autenticado acessa o módulo de Calendário, THE Calendar SHALL exibir as tasks do Piloto em visualização mensal organizada por dia do mês, exibindo o mês corrente por padrão.
2. WHEN o Piloto autenticado seleciona a visualização semanal, THE Calendar SHALL exibir as tasks do Piloto organizadas por dia da semana com blocos de hora em granularidade de 30 minutos.
3. WHEN o Piloto alterna entre visualização mensal e semanal, THE Calendar SHALL manter o mesmo período (semana ou mês) como referência, sem resetar para a data corrente.
4. WHEN uma task possui data agendada correspondente a um dia visível no calendário, THE Calendar SHALL exibir um indicador visual dentro do quadrado daquele dia mostrando no máximo 3 tasks; se houver mais, SHALL exibir um contador de overflow no formato "+N" onde N é o número de tasks ocultas.
5. WHEN o Piloto clica em um indicador de task dentro de um dia do calendário, THE System SHALL exibir um popover com título, horário e status das tasks daquele dia.
6. WHEN o Piloto clica em um dia vazio no calendário mensal, THE System SHALL abrir o formulário de criação de task com a data daquele dia pré-preenchida.
7. THE Calendar SHALL disponibilizar um botão externo "Nova Tarefa" visível em todas as visualizações que abre o formulário de criação sem pré-preencher a data.
8. WHEN o Piloto clica nos controles de navegação (anterior/próximo), THE Calendar SHALL carregar e exibir as tasks do período correspondente ao mês ou semana navegado.
9. IF a requisição de tasks para o período selecionado falhar, THEN THE Calendar SHALL exibir uma mensagem de erro identificando que o carregamento falhou e oferecer opção de tentar novamente, sem travar os controles de navegação.

---

### Requirement 2: Tasks com Duração Estimada e Horário

**User Story:** Como Piloto, quero definir duração estimada, horário de início e fim e tempo de descanso nas minhas tasks, para que eu possa planejar meu dia com precisão e integrar automaticamente com o Pomodoro.

#### Acceptance Criteria

1. WHEN o Piloto cria ou edita uma task, THE System SHALL aceitar os campos opcionais: data agendada (formato YYYY-MM-DD), horário de início (formato HH:MM, entre 00:00 e 23:59), horário de fim (formato HH:MM, entre 00:00 e 23:59), duração estimada em minutos (inteiro entre 1 e 1440) e Rest_Time em minutos (inteiro entre 1 e 60, padrão 5).
2. WHEN o Piloto informa horário de início e horário de fim sendo fim > início, THE System SHALL calcular e exibir a duração estimada automaticamente em minutos como `(fim - início)` em minutos.
3. IF o Piloto informa horário de fim menor ou igual ao horário de início, THEN THE System SHALL exibir mensagem de erro "Horário de fim deve ser posterior ao horário de início" e impedir o salvamento.
4. WHEN o Piloto informa duração estimada e horário de início, THE System SHALL calcular e preencher automaticamente o horário de fim como `início + duração`. IF o resultado ultrapassar 23:59, THEN THE System SHALL exibir aviso "A tarefa ultrapassa meia-noite" sem bloquear o salvamento.
5. THE System SHALL persistir o Rest_Time por task com valor padrão de 5 minutos quando não informado pelo Piloto.
6. WHEN o Piloto inicia o Pomodoro a partir de uma task com duração estimada definida, THE Pomodoro SHALL carregar a duração estimada da task como tempo de foco e o Rest_Time da task como tempo de descanso, substituindo os valores padrão de 25 minutos e 5 minutos respectivamente.
7. WHILE o Pomodoro estiver em execução vinculado a uma task, WHEN o Piloto marca a task como concluída, THE Pomodoro SHALL encerrar o temporizador em no máximo 1 segundo após a confirmação de conclusão.
8. IF uma task não possuir duração estimada definida, THEN THE Pomodoro SHALL utilizar o valor padrão de 25 minutos como tempo de foco ao ser iniciado a partir dessa task.
9. WHEN a task possui duração estimada ou horário de início definidos, THE System SHALL exibir esses campos no card da task na listagem; WHEN esses campos estão ausentes, THE System SHALL omitir a seção de horário do card sem exibir valores nulos ou vazios.

---

### Requirement 3: Agenda com Blocos de Tempo e Validação de Conflito

**User Story:** Como Piloto, quero que o sistema impeça a criação de tasks com horários conflitantes, respeitando o tempo de descanso de cada task, para que minha agenda não tenha sobreposições e eu possa cumprir meu cronograma sem problemas.

#### Acceptance Criteria

1. WHEN o Piloto tenta criar ou editar uma task com horário de início e fim definidos na mesma data, THE Conflict_Validator SHALL consultar todas as tasks do mesmo Piloto naquela data que possuam horário de início e fim definidos.
2. WHEN o intervalo `[novo_início, novo_fim)` se sobrepõe ao intervalo `[início_existente, fim_existente + rest_time_existente)` de qualquer task existente com status GARAGE ou COMPLETED, THE Conflict_Validator SHALL rejeitar a operação e retornar mensagem no formato: "Conflito com '[título da task]' (HH:MM–HH:MM). Próximo horário disponível: HH:MM."
3. WHEN uma task existente termina às 09:00 com Rest_Time de 5 minutos, THE Conflict_Validator SHALL rejeitar qualquer nova task com início antes de 09:05 e aceitar início a partir de 09:05.
4. WHEN uma task existente termina às 09:00 com Rest_Time de 20 minutos, THE Conflict_Validator SHALL rejeitar qualquer nova task com início antes de 09:20 e aceitar início a partir de 09:20.
5. THE Conflict_Validator SHALL considerar tasks com status GARAGE e COMPLETED como ocupantes de bloco de tempo; tasks com status DELETED ou SKIPPED (instâncias recorrentes puladas) SHALL ser ignoradas na validação.
6. IF uma task não possuir horário de início ou horário de fim definido, THEN THE Conflict_Validator SHALL ignorar essa task na verificação de conflito.
7. WHEN uma validação de conflito é executada pela API, THE Conflict_Validator SHALL retornar o resultado em menos de 500ms medido do recebimento da requisição até o envio da resposta.
8. WHEN o Piloto visualiza a agenda na view semanal, THE Agenda SHALL exibir as tasks do dia ordenadas por horário de início com blocos de altura proporcional à duração estimada em minutos.

---

### Requirement 4: Tasks Recorrentes

**User Story:** Como Piloto, quero criar tasks que se repetem automaticamente em padrões diário, semanal ou por período específico, para que eu não precise criar manualmente a mesma task todos os dias.

#### Acceptance Criteria

1. WHEN o Piloto cria uma task, THE System SHALL oferecer campo de recorrência com as opções: "Sem recorrência" (padrão), "Diária", "Semanal" (com seleção dos dias da semana) e "Período específico" (com data de início e data de fim).
2. WHEN o Piloto salva uma task recorrente do tipo "Diária" com data de início D e data de fim F, THE Recurrence_Engine SHALL gerar uma instância da task para cada dia entre D e F inclusive, vinculando todas à mesma série por um `recurrence_series_id`.
3. WHEN o Piloto salva uma task recorrente do tipo "Semanal" com os dias [segunda, quarta, sexta] e período D a F, THE Recurrence_Engine SHALL gerar instâncias apenas nos dias da semana selecionados dentro do intervalo [D, F], ignorando os demais dias.
4. WHEN o Piloto salva uma task recorrente do tipo "Período específico" com data de início D e data de fim F, THE Recurrence_Engine SHALL gerar uma instância para cada dia do intervalo [D, F] inclusive, equivalente ao comportamento diário.
5. WHEN o Piloto marca como concluída uma instância de task recorrente, THE System SHALL atualizar o status apenas dessa instância para COMPLETED, mantendo todas as outras instâncias da mesma série com seus status originais.
6. WHEN o Piloto solicita excluir uma instância de task recorrente, THE System SHALL exibir diálogo de confirmação com as opções: "Excluir apenas esta" (remove só a instância selecionada) e "Excluir esta e as futuras" (remove a instância selecionada e todas as instâncias da mesma série com data posterior).
7. THE Recurrence_Engine SHALL rejeitar a criação de uma série que geraria mais de 365 instâncias e exibir mensagem: "O período selecionado geraria N instâncias. O limite é 365. Reduza o período para continuar."
8. IF durante a geração de instâncias recorrentes uma ou mais instâncias conflitarem com tasks existentes na agenda, THEN THE Recurrence_Engine SHALL criar as instâncias sem conflito, pular as conflitantes com status SKIPPED, e retornar ao Piloto a lista de datas puladas no formato "Puladas por conflito: DD/MM/AAAA, DD/MM/AAAA".
9. WHEN uma task faz parte de uma série recorrente, THE System SHALL exibir um ícone de recorrência (ex: seta circular) no card da task na listagem e no indicador do calendário.

---

### Requirement 5: Loja de Recompensas (Pit Stop Shop)

**User Story:** Como Piloto, quero criar minha própria loja de recompensas pessoais e resgatar itens usando meu XP acumulado, para que eu me sinta recompensado pelo meu progresso sem comprometer minha progressão de nível.

#### Acceptance Criteria

1. THE Pit_Stop_Shop SHALL manter para cada Piloto uma XP_Wallet com saldo numérico não negativo, armazenado separadamente do campo XP de progressão de nível na tabela de usuários.
2. WHEN o Piloto completa uma task, THE System SHALL creditar o XP ganho pelo mesmo valor tanto no XP de progressão de nível quanto na XP_Wallet do Piloto na mesma operação atômica; se a operação falhar, nenhum dos dois campos SHALL ser atualizado.
3. THE Pit_Stop_Shop SHALL permitir que o Piloto crie Reward_Items com: nome obrigatório (1–100 caracteres), descrição opcional (máximo 500 caracteres) e custo em XP obrigatório (inteiro maior que zero).
4. WHEN o Piloto salva um Reward_Item válido, THE System SHALL persistir o item vinculado ao Piloto com status "ativo" e exibi-lo imediatamente na loja do Piloto.
5. WHEN o Piloto edita um Reward_Item ativo, THE System SHALL atualizar nome, descrição e custo do item sem modificar Redemptions já registradas. WHEN o Piloto desativa um Reward_Item, THE System SHALL ocultá-lo da loja sem excluí-lo do banco, preservando o histórico de Redemptions.
6. WHEN o Piloto solicita resgatar um Reward_Item ativo e o saldo da XP_Wallet for maior ou igual ao custo do item, THE Pit_Stop_Shop SHALL debitar o custo da XP_Wallet e registrar um Redemption contendo: id do Piloto, snapshot do nome do item, snapshot do custo debitado e timestamp da operação.
7. IF o saldo da XP_Wallet do Piloto for inferior ao custo do Reward_Item no momento do resgate, THEN THE Pit_Stop_Shop SHALL rejeitar a operação e exibir mensagem no formato: "XP insuficiente. Você tem N XP e precisa de M XP. Faltam X XP."
8. THE System SHALL exibir o histórico de Redemptions do Piloto em lista ordenada do mais recente ao mais antigo, contendo para cada entrada: nome do item (snapshot), custo debitado (snapshot), data e hora do resgate.
9. THE Pit_Stop_Shop SHALL exibir o saldo atual da XP_Wallet do Piloto em campo com rótulo distinto do XP de progressão (ex: "💰 Carteira: N XP" versus "⭐ XP Total: N").
10. WHEN o saldo da XP_Wallet do Piloto é alterado por qualquer operação (conclusão de task ou resgate), THE System SHALL atualizar o valor exibido na interface em no máximo 2 segundos sem recarregar a página inteira.
11. IF o Piloto tentar resgatar um Reward_Item com status inativo, THEN THE Pit_Stop_Shop SHALL rejeitar a operação com mensagem "Este item não está mais disponível" independentemente do saldo da XP_Wallet.
