# Task Manager Backend

A Node.js/Express REST API for managing tasks — built as an Advanced DevOps submission demonstrating CI/CD, Kubernetes, observability, and security practices.

[![CI](https://github.com/SyedAyaanAli6786/task-manager-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/SyedAyaanAli6786/task-manager-backend/actions/workflows/ci.yml)
[![Docker Hub](https://img.shields.io/docker/pulls/DOCKERHUB_USERNAME/task-manager-backend)](https://hub.docker.com/r/DOCKERHUB_USERNAME/task-manager-backend)

---

## Quick Start

See the full [Runbook](docs/runbook.md) for detailed instructions. Summary:

```bash
# 1. Local development
npm install && npm test && npm start

# 2. Deploy to local Kubernetes (kind)
kind create cluster --name task-manager
kubectl apply -f k8s/namespace.yaml
helm upgrade --install task-manager ./helm/task-manager \
  --namespace task-manager \
  --set image.repository="DOCKERHUB_USERNAME/task-manager-backend" \
  --set image.tag="latest"

# 3. Test
curl http://task-manager.local/health/ready
curl http://task-manager.local/tasks
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Service info (version, env, status) |
| GET | `/tasks` | List all tasks |
| POST | `/tasks` | Create a task `{"title": "..."}` |
| PUT | `/tasks/:id` | Update a task |
| DELETE | `/tasks/:id` | Delete a task |
| GET | `/health/live` | Kubernetes liveness probe |
| GET | `/health/ready` | Kubernetes readiness probe |
| GET | `/metrics` | Prometheus metrics scrape endpoint |

---

## DevOps Overview

| Area | Implementation |
|------|---------------|
| **Container** | Multi-stage Dockerfile, non-root user, health check, OCI labels |
| **Kubernetes** | Deployment (rolling update), Service, Ingress, ConfigMap, HPA, NetworkPolicy |
| **Configuration** | Helm chart with `values.yaml` + `values-prod.yaml` overrides |
| **CI** | GitHub Actions: lint → CodeQL → npm audit → tests → Docker build+push → Trivy → Helm lint → smoke test |
| **CD** | Helm upgrade with approval gate, rollback on failure |
| **Release** | SHA-tagged images, semver release workflow, Helm revision history |
| **Observability** | prom-client metrics, pino structured logs, OpenTelemetry traces, Grafana dashboard, alert rules |
| **Security** | SecurityContext (runAsNonRoot, readOnlyRootFilesystem, drop ALL caps), NetworkPolicy, secrets out of git |

---

## Repository Structure

```
.
├── Controllers/         Application logic + Prometheus counters
├── Routes/              Express router
├── Models/              Mongoose schema (DB disabled; in-memory store active)
├── tests/               Jest + supertest tests
├── k8s/                 Raw Kubernetes manifests (reference)
│   ├── namespace.yaml
│   ├── deployment.yaml  (probes, resources, securityContext)
│   ├── service.yaml
│   ├── configmap.yaml
│   ├── secret.yaml      (template only — no real values)
│   ├── hpa.yaml
│   ├── networkpolicy.yaml
│   └── ingress.yaml
├── helm/task-manager/   Helm chart (wraps k8s/ manifests)
│   ├── Chart.yaml
│   ├── values.yaml
│   ├── values-prod.yaml
│   └── templates/
├── monitoring/          Observability configuration
│   ├── prometheus-values.yaml
│   ├── grafana-dashboard.json
│   └── alerts.yaml
├── docs/                Architecture and operational documentation
│   ├── architecture.md
│   ├── decisions.md     ADRs explaining every major choice
│   └── runbook.md       Step-by-step setup and operation guide
├── .github/workflows/
│   ├── ci.yml           Build, test, scan, push
│   ├── cd.yml           Helm deploy with approval gate
│   └── release.yml      Semver release + GitHub Release
├── tracing.js           OpenTelemetry SDK setup
├── index.js             Express app with metrics, health probes, logging
└── Dockerfile           Multi-stage, non-root, OCI labels
```

---

## Documentation

- [Architecture](docs/architecture.md) — component map, request path, failure boundaries
- [Decision Records](docs/decisions.md) — why each choice was made vs alternatives
- [Runbook](docs/runbook.md) — full setup, deploy, rollback, and troubleshooting guide

---

## Baseline

DevOps improvements were added on the `devops-improvements` branch as a single pull request.
Baseline commit (before improvements): `a1f7a63`
