# GearVia Agent and On-Premise Operations Design

Date: 2026-09-02
Status: Approved

## 1. Objective

Evolve GearVia into a scale-ready on-premise collaboration and agent platform without prematurely replacing the existing Spring Boot modular monolith.

The release must:

- keep the current OpenAI-powered assistant and report features optional;
- expose user-authorized GearVia tools to Codex, Claude, and internal agents through MCP;
- support OpenAI-compatible internal chat and embedding models;
- optimize safe single-node operation while preserving a clear multi-node path;
- support validated migration to MySQL 8.x-compatible external databases and shared NAS storage;
- add maintenance notifications, rollback, recovery, observability, capacity tests, and production Ubuntu lifecycle scripts.

MCP is available only from configured intranet or VPN CIDRs. Public Internet access is not a supported deployment mode.

## 2. Architectural Direction

Use a scale-ready modular monolith:

```text
Web UI / MCP clients
        |
Nginx or load balancer
        |
Stateless GearVia backend instances
        |
MySQL 8.x + local or shared NAS storage
```

Heavy background work may later run in dedicated worker instances, but Redis, a message broker, and microservices are not mandatory for the first release. Add them only when measured capacity shows that database-backed coordination is insufficient.

## 3. Shared Authorization and Action Boundary

The web assistant, MCP gateway, and internal-model integrations must reuse the existing application services and authorization rules. They must not implement alternate business logic.

Every operation must:

1. authenticate a user or administrator;
2. resolve current account and group membership state;
3. enforce tool scope and resource authorization;
4. enforce maintenance and organization policy;
5. validate current domain state immediately before mutation;
6. create a correlated audit record;
7. return a bounded, non-sensitive result.

High-risk mutations, including deletion, invitations, bulk notifications, and infrastructure changes, always require explicit confirmation. Maintenance mode allows reads but blocks ordinary writes and MCP mutation tools.

## 4. Infrastructure Change Center

Replace direct provider switching with persistent infrastructure change jobs for external MySQL and NAS transitions.

### 4.1 Job states

```text
DRAFT -> TESTING -> TEST_SUCCEEDED -> SCHEDULED
      -> NOTIFYING -> MAINTENANCE -> MIGRATING
      -> VERIFYING -> SWITCHED -> COMPLETED

Any execution failure:
FAILED -> ROLLING_BACK -> ROLLED_BACK
```

The database stores the job type, redacted target description, actor, timestamps, current state, progress, estimated duration, verification summary, failure code, rollback result, and correlation ID. Credentials are encrypted and never copied into job logs.

### 4.2 Preflight and confirmation

The change action is disabled until a fresh test succeeds. Changing target settings invalidates the test result.

MySQL preflight checks:

- MySQL 8.x compatibility;
- TLS and connectivity;
- application and migration credentials;
- required character set, collation, time zone, and transaction behavior;
- Flyway schema compatibility;
- available storage and migration permissions;
- a read/write/delete probe in a dedicated temporary object.

NAS preflight checks:

- resolved fixed root remains inside the configured mount;
- read, write, rename, fsync, delete, and free-space checks;
- stable mount identity before and after the probe;
- source byte count and required target capacity.

After success, confirmation shows target, data volume, estimated duration, affected features, validation steps, and rollback behavior.

### 4.3 Execution

The supported first version uses a maintenance window instead of dual writes:

1. create in-app maintenance notice;
2. queue email notices to every active user;
3. enter maintenance mode at the scheduled time;
4. drain or cancel unsafe background jobs;
5. create and verify a backup or recovery point;
6. copy data with resumable checkpoints;
7. compare row/file counts, sizes, required checksums, and application invariants;
8. switch the active provider;
9. run readiness and smoke checks;
10. leave maintenance mode and send completion notice.

Failure keeps or restores the previous provider, records the rollback outcome, and sends a failure notice. A failed email does not corrupt or automatically reverse a valid migration, but a persistent in-app notice is required before maintenance begins.

### 4.4 Privileged host operations

The web backend must never receive the Docker socket, host root access, or unrestricted command execution. MySQL cutover and service restart are performed by a narrowly scoped host-side operations runner installed with GearVia.

The backend creates a signed, single-use change manifest after administrator confirmation. The runner accepts only predefined migration operations, validates paths and target identifiers, writes a local append-only recovery journal, invokes fixed backup/restore commands without shell interpolation, atomically replaces the approved runtime configuration, and restarts only the GearVia services. Status is reconciled back into the application job after restart. If the application is unavailable, the journal and retained previous configuration support command-line rollback.

NAS provider selection remains an application operation when the mount already exists. Creating or changing the host mount remains an administrator prerequisite and is never attempted by the web backend.

## 5. Organization-Wide Maintenance Notifications

Keep the existing team-leader notice flow and add a separate system-maintenance audience containing every active user.

Each maintenance event produces:

- an in-app notice with start time, estimated finish time, impact, and status;
- per-user email delivery records with bounded retry;
- start, completion, delay, cancellation, or failure updates;
- an administrator-visible recipient and delivery summary.

Notification delivery runs outside the migration transaction and is idempotent by event key.

## 6. Single-Node Optimization and Multi-Node Readiness

### 6.1 Resource isolation

Use independently configurable bounded executors for interactive API work, AI calls, document extraction and embedding, report generation, notifications, and infrastructure jobs. Each executor has a concurrency limit, queue limit, timeout, rejection policy, and metrics. Queue saturation degrades only the affected workload.

Do not perform email, LLM calls, or long file copies inside business database transactions.

### 6.2 Database and API efficiency

- configure Hikari pool size and timeouts from validated environment settings;
- audit common list, dashboard, notification, task, chat, audit, and MCP queries with realistic data;
- add only measured composite indexes;
- enforce pagination and response-size limits;
- use optimistic locking or compare-and-set semantics for concurrent mutations;
- make scheduled and migration jobs idempotent and protect them with database locks;
- batch bulk reads and writes with bounded chunk sizes.

### 6.3 Stateless instances

Persist sessions, MCP token metadata, approvals, job state, and audit data in MySQL. Store shared files on NAS when more than one backend is used. In-memory caches and rate limiters must sit behind replaceable interfaces; their single-node implementation must not be mistaken for cluster-wide enforcement.

WebSocket scale-out initially supports load-balancer affinity. A shared event broker becomes an optional later requirement when cross-instance fan-out is measured as necessary.

### 6.4 Health and telemetry

- liveness checks process health only;
- readiness checks required database and active storage dependencies;
- dependency detail remains administrator-only;
- metrics cover HTTP latency, errors, database pool usage, executor queues, scheduled jobs, WebSockets, mail, storage, AI, MCP, migrations, and disk capacity;
- logs use request, job, and tool-call correlation IDs and redact secrets;
- administrator alerts cover storage pressure, repeated job failure, dependency outage, pool saturation, and abnormal authentication or MCP activity.

## 7. MCP Agent Gateway

Expose Streamable HTTP MCP behind the existing HTTPS reverse proxy and configured intranet/VPN CIDR enforcement.

### 7.1 Personal tokens

Users manage tokens from My Page. A token is shown once and only a strong hash is stored. Metadata includes label, scopes, creation, expiry, last use, last IP, revocation, and optional client label.

Scopes:

- `READ`: bounded queries and searches;
- `WRITE_PROPOSE`: create a pending change for confirmation;
- `WRITE_EXECUTE`: execute only tools allowed by organization policy;
- high-risk tools always remain confirmation-gated regardless of scope.

A confirmation-gated MCP call creates a pending action and returns its identifier and summary. The user approves or rejects it in GearVia My Page or the assistant UI; the external agent can only poll the resulting status. An MCP client confirmation alone cannot bypass the GearVia approval record.

Account suspension, withdrawal, explicit session revocation policy, or administrative token revocation disables access immediately. Apply per-token rate and concurrency limits and reject non-allowed source networks before tool execution.

### 7.2 Tool design

Tools are small, typed business operations rather than generic SQL or arbitrary HTTP access. Initial families cover groups, tasks, checklists, comments, calendars, notifications, projects, and authorized document search. Tool inputs and outputs are size-bounded JSON schemas.

Every call records token ID, user, tool, target, source address, result, latency, approval reference, server instance, and correlation ID without recording token secrets.

## 8. Internal LLM Support

Retain provider ports for assistant chat and embeddings. Provide:

- the existing OpenAI provider;
- an OpenAI-compatible internal provider with separate base URL, model, credential, TLS, and timeout settings;
- independent chat and embedding connection tests;
- administrator policy to prohibit external providers;
- bounded retry and circuit-breaking behavior;
- provider-specific health and usage records.

Direct MCP read tools must remain usable when an LLM provider is unavailable.

## 9. Ubuntu Installation, Upgrade, and Removal

Keep VirtualBox scripts as development validation tools. Add production Ubuntu 24.04 LTS x86_64 lifecycle scripts:

- `install_gearvia_ai_agent_ubuntu.sh`;
- `uninstall_gearvia_ai_agent_ubuntu.sh`.

The installer supports preflight checks, `--dry-run`, fresh install, safe rerun, upgrade detection, external MySQL and NAS configuration, TLS/domain configuration, secret generation, service startup, health checks, and a redacted summary. It writes a resumable state file and never prints secrets.

The uninstaller separates application removal with data preservation from an explicitly confirmed full purge. Exact absolute targets are validated before destructive work. Upgrade and rollback procedures retain the last known-good configuration and image references.

## 10. Delivery Stages and Checkpoints

Work is divided so a new session can resume from a short English status document.

1. operational configuration and persistent job foundations;
2. API, database, pool, and concurrency optimization;
3. executor isolation, health, telemetry, and alerts;
4. organization-wide notices and maintenance mode;
5. external MySQL preflight and compatibility checks;
6. MySQL backup, migration, verification, switch, and rollback;
7. NAS copy, verification, switch, and rollback;
8. personal MCP tokens and Agent Gateway;
9. internal LLM provider and administration;
10. production Ubuntu lifecycle scripts and capacity validation.

Checkpoint A follows stages 1-3 and runs all existing tests plus production-configuration, concurrency, health, and saturation tests.

Checkpoint B follows stages 4-6 and runs maintenance-notice, external-MySQL, migration-integrity, interruption, retry, and rollback integration tests.

Checkpoint C follows stages 7-9 and runs NAS failure, MCP authorization, token revocation, network restriction, tool approval, provider failure, and combined integration tests.

The final checkpoint follows stage 10 and runs fresh install, rerun, upgrade, preserved uninstall, full-purge dry run, recovery, mixed workload, and capacity tests.

## 11. Capacity Validation

Capacity claims must be measurements, not estimates. Test representative datasets and mixed workloads with fixed server profiles.

Report:

- CPU, RAM, storage, network, JVM, database, and deployment topology;
- local versus external MySQL and local versus NAS storage;
- concurrent users and achieved requests per second;
- average, p95, and p99 latency and error rate;
- CPU, memory, database pool, executor queue, disk, and network utilization;
- interactive, WebSocket, upload, AI, MCP, and report workload mixes;
- recovery behavior after dependency failure.

The capacity matrix defines a conservative single-node supported limit, a warning range, the threshold for two or more backend instances, and the threshold for separating API and worker instances. A result is publishable only when functional assertions, data integrity checks, and service-level thresholds all pass.

## 12. Security and Recovery Rules

- never expose MySQL, the backend port, MCP, or storage mounts directly to the public Internet;
- never store plaintext personal tokens or infrastructure credentials;
- require administrator MFA and audit infrastructure changes;
- redact secrets and sensitive document content from logs and metrics;
- verify backups by restoration, not by file existence alone;
- keep rollback possible until post-switch verification completes;
- use idempotency keys for retried notifications, jobs, and agent mutations;
- document recovery commands and last verified restore time in the administrator UI and runbook.

## 13. Documentation and Resume Contract

Maintain concise English Markdown artifacts:

1. this architecture design;
2. a staged implementation plan with exact tests and checkpoint commands;
3. a resume/status log containing completed stages, commits, verification output, known issues, and the next action.

Update the status log after every stage and checkpoint. Do not duplicate large command output; record the command, exit result, and a short evidence summary.

## 14. Out of Scope for the First Release

- PostgreSQL or non-MySQL database migration;
- public Internet MCP access;
- zero-downtime dual-write database migration;
- mandatory Redis, message broker, Kubernetes, or microservices;
- arbitrary shell, SQL, or unrestricted HTTP MCP tools;
- unverified capacity marketing claims.
