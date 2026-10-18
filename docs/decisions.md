# Architecture Decision Records

This document records the key design decisions made during the DevOps implementation,
explaining the reasoning, alternatives considered, and tradeoffs accepted.

---

## ADR-001: Deployment vs StatefulSet

**Decision**: Use `Deployment` (not `StatefulSet`)

**Reasoning**: The task-manager-backend is stateless. Tasks are stored in-memory within
each pod — there is no persistent data, no ordered startup, and no stable network identity
required. Deployments support rolling updates, HPA, and arbitrary replica counts without
the complexity of StatefulSet's per-pod identity and PersistentVolumeClaims.

**Alternative**: StatefulSet — appropriate if each pod needed stable DNS (e.g. `pod-0.svc`),
ordered startup, or its own persistent volume (e.g. a database). Overkill here.

**Tradeoff accepted**: In-memory tasks are not shared across pods — a request hitting
Pod A sees different tasks than one hitting Pod B. This is intentional for this demo
scope; in production, MongoDB would be the shared state layer.

---

## ADR-002: Rolling Update vs Blue-Green vs Canary

**Decision**: Rolling update (`maxUnavailable=0, maxSurge=1`)

**Reasoning**: Rolling update provides zero-downtime deployments with minimal resource
overhead. Since the app is stateless and all pod versions are functionally identical
during a rollout, mixed-version traffic is not a concern.

**Alternative — Blue-Green**: Requires 2× resources (a full second Deployment). Useful
when the transition must be atomic (e.g. database schema changes). No such constraint exists here.

**Alternative — Canary**: Routes a percentage of traffic to the new version first.
Useful for high-traffic production systems where gradual exposure reduces blast radius.
The complexity of canary (separate Deployment, traffic splitting via Ingress weights)
is not justified for this project scope.

**Tradeoff accepted**: Rolling deployments cannot atomically switch all traffic — during
rollout, some pods run old code, some run new. Acceptable here because the API has no
breaking schema changes between versions.

---

## ADR-003: kind vs minikube vs cloud Kubernetes

**Decision**: `kind` (Kubernetes IN Docker)

**Reasoning**: kind requires only Docker (already installed). It creates a full multi-node
Kubernetes cluster inside Docker containers in ~30 seconds. No VM, no hypervisor, no cloud
account, no cost. It is the standard tool used in Kubernetes CI testing itself.

**Alternative — minikube**: Requires a hypervisor (VirtualBox, HyperKit) or Docker driver.
Equivalent capability but heavier setup. Docker driver equivalent to kind.

**Alternative — Cloud (GKE/EKS/AKS)**: Real production environment but requires account,
billing, and network configuration. Not required by the assignment; "local is fine".

**Tradeoff accepted**: kind clusters are ephemeral — they don't persist across reboots
without re-creating. Data (in-memory tasks) is lost on cluster restart. Acceptable
for local dev; production would use a managed cluster.

---

## ADR-004: Helm vs raw kubectl manifests

**Decision**: Helm chart wrapping raw manifests

**Reasoning**: Helm provides:
- **Idempotency**: `helm upgrade --install` always produces the desired state
- **Parameterisation**: image tag, replicas, resources changed via `--set` without editing YAML
- **Rollback**: `helm rollback` in one command, using stored release history
- **Template reuse**: `_helpers.tpl` ensures consistent labels across all resources
- **Diff-ability**: `helm diff` shows exactly what will change before applying

Raw manifests are kept in `k8s/` as a readable reference; Helm templates are in `helm/`.

**Alternative — Kustomize**: Good for environment overlays without templating. Less powerful
for parameterised deployments (no `--set`). Helm is more standard for packaging.

**Tradeoff accepted**: Helm adds template syntax complexity. A simple `kubectl apply -f k8s/`
is sometimes easier to debug. The raw `k8s/` manifests serve as the debuggable reference.

---

## ADR-005: prom-client + pino vs no observability

**Decision**: Add `prom-client` (metrics) + `pino` (structured logs) + OpenTelemetry (traces)

**Reasoning**: Without instrumentation, the only signal of a problem is "the app is down."
With metrics, we can observe degradation before failure. The three pillars of observability:

- **Metrics** (prom-client): quantitative signals — request rate, error rate, latency percentiles
- **Logs** (pino): structured JSON that log aggregators (e.g. Loki, CloudWatch) can query
- **Traces** (OpenTelemetry): end-to-end request spans — essential for debugging latency spikes

**Alternative**: No instrumentation (baseline). Operational visibility is zero — impossible
to distinguish "low traffic" from "all requests failing."

**Tradeoff accepted**: `prom-client` adds ~3ms to cold start. pino is faster than `console.log`
(async, low-overhead). OpenTelemetry is disabled by default (`OTEL_SDK_DISABLED=true`) to
avoid the overhead until a collector is deployed.

---

## ADR-006: Manual approval gate in CD

**Decision**: GitHub Environments `production` with required reviewers before deploy

**Reasoning**: Automatic deployment to production on every push is risky. A CI pass does not
guarantee the code is correct — it only means tests passed. A human review point allows:
- Checking test results, Trivy scan findings, and Helm diff before deploying
- Preventing accidental merges from deploying to users

**Alternative**: Fully automated CD (push → deploy). Fast but no safety net.

**Tradeoff accepted**: Introduces human latency in the deployment pipeline. Acceptable for
a course project; in a team setting, the reviewer adds genuine value.

---

## ADR-007: SecurityContext choices

**Decision**: `runAsNonRoot=true`, `readOnlyRootFilesystem=true`, `capabilities.drop=ALL`

**Reasoning**: Defence-in-depth at the container level:

- `runAsNonRoot`: if the process is compromised, the attacker is a non-root user — cannot
  modify system files or escalate privileges easily.
- `readOnlyRootFilesystem`: any write attempt (e.g. by malware writing a binary) fails
  immediately. `/tmp` is provided as an emptyDir for legitimate temporary writes.
- `drop ALL capabilities`: Linux capabilities like `NET_RAW`, `SYS_ADMIN` are not needed
  by a web server. Dropping them shrinks the attack surface.

**Tradeoff accepted**: Requires the app to not write to the container filesystem (except `/tmp`).
Node.js does not write to the root filesystem during normal operation, so this is safe.
