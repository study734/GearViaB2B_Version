# GearVia On-Premise Checkpoint A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete stages 1-3: operational foundations, measured single-node database/API tuning, bounded workload isolation, dependency health, and administrator telemetry.

**Architecture:** Keep the Spring Boot modular monolith and make runtime limits explicit. Persist infrastructure-change state in MySQL, move task filtering into bounded database queries, isolate asynchronous workloads with named executors, and expose generic public health plus detailed administrator-only telemetry.

**Tech Stack:** Java 21, Spring Boot 3.3.5, Spring Data JPA, Flyway, MySQL 8.4, Micrometer/Actuator, React, TypeScript, Maven, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-gearvia-agent-onprem-operations-design.md`

## Global Constraints

- Support Ubuntu Server 24.04 LTS x86_64 and MySQL 8.x only.
- Preserve the Spring Boot modular monolith and current REST contracts unless a task explicitly versions a response.
- Do not add Redis, a message broker, Kubernetes, or a microservice.
- Never expose database, storage, executor, or credential details through public health endpoints.
- Do not perform email, LLM, or file-copy I/O inside a business database transaction.
- Every queue, page, timeout, and pool is bounded and validated.
- Write tests before implementation and commit each task independently.
- Update `docs/superpowers/status/gearvia-agent-onprem-status.md` after every task and checkpoint.

---

## File Map

### Runtime and operational state

- Create `backend/src/main/java/com/teamproject/common/config/RuntimeTuningProperties.java`: validated pool, query, and alert limits.
- Create `backend/src/main/java/com/teamproject/common/runtime/InstanceIdentity.java`: stable per-process instance identifier.
- Create `backend/src/main/java/com/teamproject/operations/domain/InfrastructureChangeJob.java`: persistent state machine root.
- Create `backend/src/main/java/com/teamproject/operations/domain/InfrastructureChangeJobRepository.java`: job persistence.
- Create `backend/src/main/java/com/teamproject/operations/application/InfrastructureChangeJobService.java`: legal state transitions.
- Create `backend/src/main/resources/db/migration/V3__create_infrastructure_change_jobs.sql`: operational job schema.

### Query and concurrency tuning

- Create `backend/src/main/java/com/teamproject/task/infrastructure/TaskListQueryRepository.java`: database-side task filters with a hard result cap.
- Modify `backend/src/main/java/com/teamproject/task/application/TaskService.java`: delegate filtered lists to the bounded query.
- Create `backend/src/main/resources/db/migration/V4__add_measured_operational_indexes.sql`: only indexes proven by MySQL plan tests.

### Workload isolation and telemetry

- Create `backend/src/main/java/com/teamproject/common/execution/WorkloadExecutorsConfiguration.java`: named bounded executors.
- Create `backend/src/main/java/com/teamproject/common/execution/ExecutorTelemetry.java`: queue and rejection metrics.
- Create `backend/src/main/java/com/teamproject/common/execution/MetricsConfiguration.java`: common instance metric tag.
- Modify async listeners to select `documentIndexExecutor` or `notificationExecutor` explicitly.
- Add Actuator and Prometheus registry dependencies in `backend/pom.xml`.
- Create `backend/src/main/java/com/teamproject/common/presentation/health/DependencyReadiness.java`: database and active-storage readiness.
- Modify monitoring DTO, service, frontend API type, and admin monitoring page to show instance, pool, executor, dependency, and alert status.

## Task 1: Validated Runtime Tuning Contract

**Files:**
- Create: `backend/src/main/java/com/teamproject/common/config/RuntimeTuningProperties.java`
- Create: `backend/src/main/java/com/teamproject/common/runtime/InstanceIdentity.java`
- Modify: `backend/src/main/java/com/teamproject/B2BGearViaApplication.java`
- Modify: `backend/src/main/resources/application.properties`
- Modify: `infra/b2b/compose.yml`
- Modify: `infra/b2b/runtime.env.example`
- Test: `backend/src/test/java/com/teamproject/common/config/RuntimeTuningPropertiesTest.java`
- Test: `backend/src/test/java/com/teamproject/common/config/B2bConfigurationValidatorTest.java`

**Interfaces:**
- Produces: `RuntimeTuningProperties` with `database`, `queries`, `executors`, and `alerts` records.
- Produces: `InstanceIdentity.value(): String` used by locks, metrics, and later audit records.

- [ ] **Step 1: Write binding and validation tests**

```java
class RuntimeTuningPropertiesTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(TestConfiguration.class);

    @Test void bindsSafeLimits() {
        runner.withPropertyValues(
                "app.runtime.queries.max-task-results=750",
                "app.runtime.executors.document-index.core-size=2",
                "app.runtime.executors.document-index.max-size=4",
                "app.runtime.executors.document-index.queue-capacity=100")
            .run(context -> assertThat(context.getBean(RuntimeTuningProperties.class)
                    .queries().maxTaskResults()).isEqualTo(750));
    }

    @Test void rejectsUnboundedExecutorQueue() {
        runner.withPropertyValues("app.runtime.executors.document-index.queue-capacity=0")
            .run(context -> assertThat(context).hasFailed());
    }
}
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `cd backend && ./mvnw -Dtest=RuntimeTuningPropertiesTest,B2bConfigurationValidatorTest test`

Expected: FAIL because `RuntimeTuningProperties` does not exist.

- [ ] **Step 3: Implement the configuration contract**

```java
@Validated
@ConfigurationProperties("app.runtime")
public record RuntimeTuningProperties(
        @Valid Database database,
        @Valid Queries queries,
        @Valid Executors executors,
        @Valid Alerts alerts) {
    public record Database(@Min(2) @Max(200) int maximumPoolSize,
            @Min(1) @Max(199) int minimumIdle,
            @Min(1000) long connectionTimeoutMs) {}
    public record Queries(@Min(50) @Max(5000) int maxTaskResults) {}
    public record Executor(@Min(1) int coreSize, @Min(1) int maxSize,
            @Min(1) int queueCapacity, @Min(1) int keepAliveSeconds) {}
    public record Executors(@Valid Executor documentIndex,
            @Valid Executor notification) {}
    public record Alerts(@DecimalMin("50") @DecimalMax("100") double warningPercent,
            @DecimalMin("50") @DecimalMax("100") double criticalPercent) {}
}
```

Enable configuration-properties scanning and make `InstanceIdentity` prefer `INSTANCE_ID`, otherwise generate a UUID once at process start. Reject `minimumIdle > maximumPoolSize`, executor `coreSize > maxSize`, and `warningPercent >= criticalPercent` in compact constructors.

- [ ] **Step 4: Wire environment settings**

Add exact defaults to `application.properties` and matching Compose variables:

```properties
app.runtime.database.maximum-pool-size=${DB_POOL_MAX_SIZE:20}
app.runtime.database.minimum-idle=${DB_POOL_MIN_IDLE:5}
app.runtime.database.connection-timeout-ms=${DB_POOL_CONNECTION_TIMEOUT_MS:30000}
spring.datasource.hikari.maximum-pool-size=${app.runtime.database.maximum-pool-size}
spring.datasource.hikari.minimum-idle=${app.runtime.database.minimum-idle}
spring.datasource.hikari.connection-timeout=${app.runtime.database.connection-timeout-ms}
server.tomcat.threads.max=${HTTP_MAX_THREADS:100}
server.tomcat.accept-count=${HTTP_ACCEPT_COUNT:100}
app.runtime.queries.max-task-results=${QUERY_MAX_TASK_RESULTS:1000}
app.runtime.executors.document-index.core-size=${DOCUMENT_INDEX_CORE_SIZE:1}
app.runtime.executors.document-index.max-size=${DOCUMENT_INDEX_MAX_SIZE:2}
app.runtime.executors.document-index.queue-capacity=${DOCUMENT_INDEX_QUEUE_CAPACITY:100}
app.runtime.executors.document-index.keep-alive-seconds=${DOCUMENT_INDEX_KEEP_ALIVE_SECONDS:60}
app.runtime.executors.notification.core-size=${NOTIFICATION_CORE_SIZE:2}
app.runtime.executors.notification.max-size=${NOTIFICATION_MAX_SIZE:4}
app.runtime.executors.notification.queue-capacity=${NOTIFICATION_QUEUE_CAPACITY:500}
app.runtime.executors.notification.keep-alive-seconds=${NOTIFICATION_KEEP_ALIVE_SECONDS:60}
app.runtime.alerts.warning-percent=${RESOURCE_WARNING_PERCENT:75}
app.runtime.alerts.critical-percent=${RESOURCE_CRITICAL_PERCENT:90}
app.instance-id=${INSTANCE_ID:}
```

- [ ] **Step 5: Run tests and Compose validation**

Run: `cd backend && ./mvnw -Dtest=RuntimeTuningPropertiesTest,B2bConfigurationValidatorTest test`

Run: `bash infra/b2b/test-virtualbox-config.sh`

Expected: both commands PASS and no secret value appears in validation errors.

- [ ] **Step 6: Commit and update status**

```bash
git add backend infra docs/superpowers/status/gearvia-agent-onprem-status.md
git commit -m "feat: add validated runtime tuning limits"
```

## Task 2: Persistent Infrastructure Change Job Foundation

**Files:**
- Create: `backend/src/main/resources/db/migration/V3__create_infrastructure_change_jobs.sql`
- Create: `backend/src/main/java/com/teamproject/operations/domain/InfrastructureChangeJob.java`
- Create: `backend/src/main/java/com/teamproject/operations/domain/InfrastructureChangeJobRepository.java`
- Create: `backend/src/main/java/com/teamproject/operations/application/InfrastructureChangeJobService.java`
- Test: `backend/src/test/java/com/teamproject/operations/InfrastructureChangeJobServiceTest.java`
- Modify: `backend/src/test/java/com/teamproject/migration/MySqlFlywayMigrationTest.java`

**Interfaces:**
- Produces: `InfrastructureChangeJob.Type { MYSQL, STORAGE }`.
- Produces: `InfrastructureChangeJob.Status` matching the approved state graph.
- Produces: `InfrastructureChangeJobService.create(type, actorId, redactedTarget, estimatedSeconds, correlationId)`.
- Produces: `InfrastructureChangeJobService.transition(jobId, expectedVersion, targetStatus, progressPercent, summary)`.

- [ ] **Step 1: Write state-machine tests**

```java
@Test void allowsApprovedForwardTransition() {
    var job = service.create(Type.MYSQL, adminId, "mysql.internal:3306/b2bgearvia", 900, "change-1");
    var testing = service.transition(job.id(), job.version(), Status.TESTING, 0, null);
    assertThat(testing.status()).isEqualTo(Status.TESTING);
}

@Test void rejectsSkippedTransition() {
    var job = service.create(Type.STORAGE, adminId, "/opt/b2bgearvia/data/nas", 600, "change-2");
    assertThatThrownBy(() -> service.transition(job.id(), job.version(), Status.MIGRATING, 10, null))
            .isInstanceOf(ApplicationException.class)
            .extracting("code").isEqualTo("INFRASTRUCTURE_CHANGE_TRANSITION_INVALID");
}

@Test void rejectsStaleVersion() {
    var job = service.create(Type.MYSQL, adminId, "mysql.internal", 900, "change-3");
    service.transition(job.id(), job.version(), Status.TESTING, 0, null);
    assertThatThrownBy(() -> service.transition(job.id(), job.version(), Status.TEST_SUCCEEDED, 10, null))
            .isInstanceOf(ApplicationException.class);
}
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `cd backend && ./mvnw -Dtest=InfrastructureChangeJobServiceTest test`

Expected: FAIL because the operations package does not exist.

- [ ] **Step 3: Create the Flyway table**

```sql
CREATE TABLE infrastructure_change_jobs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    change_type VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL,
    actor_user_id BIGINT NOT NULL,
    redacted_target VARCHAR(500) NOT NULL,
    estimated_seconds BIGINT NOT NULL,
    progress_percent INT NOT NULL DEFAULT 0,
    verification_summary VARCHAR(2000) NULL,
    failure_code VARCHAR(100) NULL,
    rollback_summary VARCHAR(2000) NULL,
    correlation_id VARCHAR(80) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    started_at DATETIME(6) NULL,
    completed_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_infrastructure_change_correlation (correlation_id),
    INDEX idx_infrastructure_change_status_updated (status, updated_at, id),
    CONSTRAINT fk_infrastructure_change_actor FOREIGN KEY (actor_user_id) REFERENCES users (id)
) ENGINE = InnoDB;
```

- [ ] **Step 4: Implement explicit transitions**

Store the allowed edges in one immutable map. `transition` loads by ID, compares the supplied version, validates progress `0..100`, applies timestamps, and relies on `@Version` for the final concurrent-write guard. Do not store credentials or executable commands.

- [ ] **Step 5: Extend MySQL migration verification**

Assert Flyway current version is `3`, the table and required columns exist, a second `migrate()` is idempotent, and Hibernate `validate` starts against MySQL 8.4.

- [ ] **Step 6: Run service and MySQL tests**

Run: `cd backend && ./mvnw -Dtest=InfrastructureChangeJobServiceTest test`

Run when Docker is available: `cd backend && ./mvnw -Dtest=MySqlFlywayMigrationTest test`

Expected: PASS; Docker-disabled environments report the Testcontainers test as skipped, not failed.

- [ ] **Step 7: Commit and update status**

```bash
git add backend docs/superpowers/status/gearvia-agent-onprem-status.md
git commit -m "feat: persist infrastructure change jobs"
```

## Task 3: Bounded Database-Side Task Filtering and Measured Indexes

**Files:**
- Create: `backend/src/main/java/com/teamproject/task/infrastructure/TaskListQueryRepository.java`
- Modify: `backend/src/main/java/com/teamproject/task/application/TaskService.java`
- Create: `backend/src/main/resources/db/migration/V4__add_measured_operational_indexes.sql`
- Test: `backend/src/test/java/com/teamproject/task/TaskListQueryRepositoryTest.java`
- Test: `backend/src/test/java/com/teamproject/migration/MySqlOperationalIndexTest.java`
- Modify: `backend/src/test/java/com/teamproject/migration/MySqlFlywayMigrationTest.java`

**Interfaces:**
- Consumes: `RuntimeTuningProperties.queries().maxTaskResults()`.
- Produces: `TaskListQueryRepository.find(groupId, userId, filter, now, limit): List<Task>`.
- Preserves: `GET /api/v1/tasks` response shape.

- [ ] **Step 1: Write query behavior and cap tests**

```java
@Test void filtersBeforeMaterializingEntities() {
    seedTasks(30);
    var filter = new TaskListFilter("release", Task.Status.IN_PROGRESS,
            Task.Priority.HIGH, projectId, Assignment.MINE, Due.OVERDUE);
    assertThat(repository.find(groupId, userId, filter, now, 100))
            .extracting(Task::getTitle).containsExactly("release gate");
}

@Test void reportsThatTheResultMustBeNarrowed() {
    seedTasks(51);
    assertThatThrownBy(() -> repository.find(groupId, userId, emptyFilter, now, 50))
            .isInstanceOf(ApplicationException.class)
            .extracting("code").isEqualTo("TASK_QUERY_LIMIT_EXCEEDED");
}
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd backend && ./mvnw -Dtest=TaskListQueryRepositoryTest test`

Expected: FAIL because filtering is still performed over an unbounded list in Java.

- [ ] **Step 3: Implement the bounded criteria query**

Build predicates for group, query, status, priority, project, assignment, and due window. Fetch group, requester, approver, assignee/user, and project links required by `TaskService.response`. Set `maxResults` to `limit + 1`; if the extra row exists, throw `TASK_QUERY_LIMIT_EXCEEDED` with a stable user message. Preserve created-at-descending ordering.

- [ ] **Step 4: Prove indexes before adding them**

In `MySqlOperationalIndexTest`, seed at least 10,000 task rows across groups and use `EXPLAIN FORMAT=JSON` for the status/due, assignee/status/due, project/status, and group/created queries. Parse `key` and assert the expected existing or new index name. Add only a missing index demonstrated by a failing assertion to `V4`.

```java
assertThat(explainKey("SELECT id FROM tasks WHERE group_id=? AND status=? ORDER BY due_at LIMIT 50"))
        .isIn("idx_tasks_group_status_due", "idx_tasks_group_status_due_id");
```

- [ ] **Step 5: Update migration assertions**

Set the expected Flyway version to `4` and assert every V4 index through `information_schema.statistics`.

- [ ] **Step 6: Run focused and MySQL tests**

Run: `cd backend && ./mvnw -Dtest=TaskListQueryRepositoryTest,TaskApiTest,TaskWorkflowApiTest test`

Run when Docker is available: `cd backend && ./mvnw -Dtest=MySqlOperationalIndexTest,MySqlFlywayMigrationTest test`

Expected: PASS with the existing REST response shape unchanged.

- [ ] **Step 7: Commit and update status**

```bash
git add backend docs/superpowers/status/gearvia-agent-onprem-status.md
git commit -m "perf: bound task queries and verify indexes"
```

## Task 4: Named Bounded Executors and Saturation Metrics

**Files:**
- Create: `backend/src/main/java/com/teamproject/common/execution/WorkloadExecutorsConfiguration.java`
- Create: `backend/src/main/java/com/teamproject/common/execution/ExecutorTelemetry.java`
- Create: `backend/src/main/java/com/teamproject/common/execution/MetricsConfiguration.java`
- Modify: `backend/src/main/java/com/teamproject/assistant/application/AiDocumentAutoIndexListener.java`
- Modify: `backend/src/main/java/com/teamproject/notification/application/WebPushDeliveryService.java`
- Test: `backend/src/test/java/com/teamproject/common/execution/WorkloadExecutorsConfigurationTest.java`
- Test: `backend/src/test/java/com/teamproject/assistant/AiDocumentExecutorIsolationTest.java`

**Interfaces:**
- Consumes: `RuntimeTuningProperties.executors()`.
- Produces beans named `documentIndexExecutor` and `notificationExecutor`.
- Produces `ExecutorTelemetry.snapshots(): List<ExecutorSnapshot>`.

- [ ] **Step 1: Write executor isolation and saturation tests**

```java
@Test void documentQueueCannotConsumeNotificationCapacity() {
    blockAllThreads(documentIndexExecutor);
    fillQueue(documentIndexExecutor);
    assertThatThrownBy(() -> documentIndexExecutor.execute(() -> {}))
            .isInstanceOf(TaskRejectedException.class);
    assertThat(notificationExecutor.getThreadPoolExecutor().getQueue().remainingCapacity()).isPositive();
}

@Test void snapshotReportsQueueAndRejections() {
    saturate(documentIndexExecutor);
    assertThat(telemetry.snapshot("document-index").rejected()).isEqualTo(1);
}
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd backend && ./mvnw -Dtest=WorkloadExecutorsConfigurationTest,AiDocumentExecutorIsolationTest test`

Expected: FAIL because all `@Async` methods use Spring's shared default executor.

- [ ] **Step 3: Implement named executors**

Use `ThreadPoolTaskExecutor` with configured core/max/queue/keep-alive settings, `setWaitForTasksToCompleteOnShutdown(true)`, a 30-second await termination period, workload-specific thread prefixes, and an abort rejection policy. Register Micrometer gauges for active threads, pool size, queue size/capacity, completed tasks, and a counter for rejected tasks. `MetricsConfiguration` registers `InstanceIdentity.value()` as the common `instance` tag so generated identifiers remain unique.

- [ ] **Step 4: Select executors explicitly**

```java
@Async("documentIndexExecutor")
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
public void onResourceUploaded(ResourceUploadedEvent event) { ... }

@Async("notificationExecutor")
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
public void deliver(PushNotificationEvent event) { ... }
```

- [ ] **Step 5: Run focused and regression tests**

Run: `cd backend && ./mvnw -Dtest=WorkloadExecutorsConfigurationTest,AiDocumentExecutorIsolationTest,AiDocumentAutoIndexRetrySchedulerTest,WebPushDeliveryServiceTest test`

Expected: PASS; saturation of one workload does not consume the other executor.

- [ ] **Step 6: Commit and update status**

```bash
git add backend docs/superpowers/status/gearvia-agent-onprem-status.md
git commit -m "feat: isolate bounded background workloads"
```

## Task 5: Dependency Readiness and Internal Metrics

**Files:**
- Modify: `backend/pom.xml`
- Create: `backend/src/main/java/com/teamproject/common/presentation/health/DependencyReadiness.java`
- Modify: `backend/src/main/java/com/teamproject/common/presentation/health/HealthController.java`
- Modify: `backend/src/main/java/com/teamproject/resource/storage/DynamicFileStorage.java`
- Modify: `backend/src/main/resources/application.properties`
- Test: `backend/src/test/java/com/teamproject/common/presentation/health/HealthControllerTest.java`
- Test: `backend/src/test/java/com/teamproject/common/presentation/health/DependencyReadinessTest.java`

**Interfaces:**
- Produces: `DependencyReadiness.check(): ReadinessSnapshot` with database and active-storage components.
- Public `GET /api/v1/health` remains process-only.
- Public `GET /api/v1/health/ready` returns only `{ "status": "UP|DOWN" }`.

- [ ] **Step 1: Write readiness privacy and failure tests**

```java
@Test void readinessDoesNotExposeDependencyNamesOrErrors() throws Exception {
    when(readiness.check()).thenReturn(ReadinessSnapshot.down("database", "connection refused"));
    mvc.perform(get("/api/v1/health/ready"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.status").value("DOWN"))
            .andExpect(content().string(not(containsString("database"))))
            .andExpect(content().string(not(containsString("connection refused"))));
}

@Test void inactiveNasDoesNotFailLocalReadiness() {
    when(storage.status()).thenReturn(localHealthyNasDown());
    assertThat(readiness.check().up()).isTrue();
}
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd backend && ./mvnw -Dtest=HealthControllerTest,DependencyReadinessTest test`

Expected: FAIL because active storage is not part of readiness.

- [ ] **Step 3: Implement dependency readiness**

Check database validity with a two-second maximum and active storage through a non-mutating `DynamicFileStorage.activeHealth()` method. Return component detail only to callers inside the application. Keep the controller response generic.

- [ ] **Step 4: Add internal metrics dependencies and exposure**

Add `spring-boot-starter-actuator` and `micrometer-registry-prometheus`. Expose only `health,metrics,prometheus` on the container-internal backend port. Do not add an Nginx route for `/actuator`.

```properties
management.endpoints.web.exposure.include=health,metrics,prometheus
management.endpoint.health.show-details=never
management.metrics.tags.application=${spring.application.name}
```

- [ ] **Step 5: Run health and security tests**

Run: `cd backend && ./mvnw -Dtest=HealthControllerTest,DependencyReadinessTest,AuthSecurityApiTest,AdminAccessFilterTest test`

Expected: PASS; public health is redacted and existing security behavior is unchanged.

- [ ] **Step 6: Commit and update status**

```bash
git add backend docs/superpowers/status/gearvia-agent-onprem-status.md
git commit -m "feat: add dependency readiness and internal metrics"
```

## Task 6: Administrator Operational Telemetry and Alerts

**Files:**
- Modify: `backend/src/main/java/com/teamproject/admin/application/dto/AdminDtos.java`
- Modify: `backend/src/main/java/com/teamproject/admin/application/AdminMonitoringService.java`
- Create: `backend/src/main/java/com/teamproject/admin/application/OperationalTelemetryReader.java`
- Modify: `frontend/src/api/adminApi.ts`
- Modify: `frontend/src/features/admin/pages/AdminMonitoringPage.tsx`
- Test: `backend/src/test/java/com/teamproject/admin/application/AdminMonitoringServiceTest.java`
- Test: `frontend/src/features/admin/pages/AdminMonitoringPage.test.tsx`

**Interfaces:**
- Consumes: `InstanceIdentity`, `DependencyReadiness`, `ExecutorTelemetry`, Hikari pool MXBean, and alert thresholds.
- Extends: `AdminMonitoringResponse` with `runtime`, `dependencies`, `executors`, and `alerts`.
- Preserves existing `system` and `aiUsage` fields.

- [ ] **Step 1: Write backend monitoring tests**

```java
@Test void overviewIncludesBoundedRuntimeAndAlerts() {
    var response = service.overviewAt(now);
    assertThat(response.runtime().instanceId()).isEqualTo("backend-1");
    assertThat(response.databasePool().active()).isEqualTo(18);
    assertThat(response.executors()).extracting(ExecutorResponse::name)
            .containsExactlyInAnyOrder("document-index", "notification");
    assertThat(response.alerts()).extracting(AlertResponse::code)
            .contains("DATABASE_POOL_CRITICAL");
}
```

- [ ] **Step 2: Write frontend rendering tests**

```tsx
it('renders instance, dependency, pool, queue, and critical alert state', async () => {
  vi.spyOn(adminApi, 'monitoring').mockResolvedValue(criticalMonitoringFixture);
  render(<AdminMonitoringPage />);
  expect(await screen.findByText('backend-1')).toBeInTheDocument();
  expect(screen.getByText('DATABASE_POOL_CRITICAL')).toBeInTheDocument();
  expect(screen.getByText('document-index')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests and verify failure**

Run: `cd backend && ./mvnw -Dtest=AdminMonitoringServiceTest test`

Run: `cd frontend && npm test -- --run src/features/admin/pages/AdminMonitoringPage.test.tsx`

Expected: FAIL because the response does not yet include runtime telemetry.

- [ ] **Step 4: Implement telemetry and deterministic alerts**

Return counts and percentages, never JDBC URLs, storage paths, exception messages, credentials, or host secrets. Alert codes are stable enums: `CPU_WARNING`, `MEMORY_WARNING`, `STORAGE_WARNING`, `DATABASE_POOL_WARNING`, `EXECUTOR_QUEUE_WARNING`, and dependency-specific availability codes. Severity uses validated warning and critical thresholds.

- [ ] **Step 5: Implement compact admin UI cards**

Add sections for instance/dependencies, database pool, executor queues, and active alerts. Reuse existing card/table styles and Korean/English translations. Do not expose the internal Actuator endpoint in the browser.

- [ ] **Step 6: Run backend and frontend tests**

Run: `cd backend && ./mvnw -Dtest=AdminMonitoringServiceTest,AdminMonitoringApiTest test`

Run: `cd frontend && npm test -- --run src/features/admin/pages/AdminMonitoringPage.test.tsx`

Run: `cd frontend && npm run build`

Expected: all PASS.

- [ ] **Step 7: Commit and update status**

```bash
git add backend frontend docs/superpowers/status/gearvia-agent-onprem-status.md
git commit -m "feat: show operational telemetry to administrators"
```

## Task 7: Checkpoint A Integration Verification

**Files:**
- Create: `backend/src/test/java/com/teamproject/qa/OperationalSaturationIntegrationTest.java`
- Modify: `docs/superpowers/status/gearvia-agent-onprem-status.md`
- Create: `docs/operations/checkpoint-a-verification.md`

**Interfaces:**
- Produces: verified Checkpoint A evidence and the input boundary for the Checkpoint B plan.

- [ ] **Step 1: Write saturation integration assertions**

The test starts the application with tiny executor queues, blocks document work, verifies a document request is rejected with a stable overload outcome, then verifies login, task read, notification work, and readiness still succeed. It must release latches in `finally` to avoid hanging the suite.

- [ ] **Step 2: Run focused saturation test**

Run: `cd backend && ./mvnw -Dtest=OperationalSaturationIntegrationTest test`

Expected: PASS without thread leaks or a hung JVM.

- [ ] **Step 3: Run Checkpoint A backend suite**

Run: `cd backend && ./mvnw test`

Expected: PASS. Record test count, failures, skipped Testcontainers tests, and duration without pasting full logs.

- [ ] **Step 4: Run MySQL 8.4 integration tests**

Run with Docker: `cd backend && ./mvnw -Dtest=MySqlFlywayMigrationTest,MySqlOperationalIndexTest test`

Expected: PASS against MySQL 8.4.

- [ ] **Step 5: Run frontend and deployment validation**

Run: `cd frontend && npm test -- --run`

Run: `cd frontend && npm run build`

Run: `bash infra/b2b/test-virtualbox-config.sh`

Expected: all PASS.

- [ ] **Step 6: Record concise evidence**

In `docs/operations/checkpoint-a-verification.md`, record environment, commands, exit status, duration, test count, MySQL version, and any skipped test reason. In the status file, mark stages 1-3 and Checkpoint A complete and set the next action to writing the Checkpoint B implementation plan.

- [ ] **Step 7: Commit Checkpoint A**

```bash
git add backend frontend infra docs
git commit -m "test: verify on-prem checkpoint A"
```
