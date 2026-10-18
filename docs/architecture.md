# Architecture — Task Manager Backend

## Overview

The task-manager-backend is a stateless Node.js/Express REST API for CRUD operations on tasks. It runs on Kubernetes (local kind cluster) behind an nginx Ingress, with Prometheus scraping metrics from every pod.

---

## Component Map

```
┌──────────────────────────────────────────────────────────────────────┐
│  Developer Laptop                                                    │
│                                                                      │
│  git push ──► GitHub Actions CI ──► Docker Hub                      │
│                  │                     │                             │
│                  │ (image sha-xxxxxxx)  │                            │
│                  ▼                     │                             │
│           GitHub Actions CD ◄──────────┘                            │
│                  │ helm upgrade --install                            │
│                  ▼                                                   │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │  kind Cluster (Kubernetes IN Docker)                          │   │
│  │                                                               │   │
│  │  Namespace: ingress-nginx                                     │   │
│  │  ┌─────────────────────────────────┐                          │   │
│  │  │  nginx Ingress Controller       │◄── curl/browser          │   │
│  │  │  (NodePort 80 → host port 80)   │    task-manager.local    │   │
│  │  └──────────────┬──────────────────┘                          │   │
│  │                 │ HTTP                                         │   │
│  │  Namespace: task-manager                                       │   │
│  │  ┌──────────────▼──────────────────┐                          │   │
│  │  │  Service: task-manager          │                          │   │
│  │  │  (ClusterIP, port 80→8080)      │                          │   │
│  │  └──────────────┬──────────────────┘                          │   │
│  │                 │ load-balanced                                │   │
│  │         ┌───────┴────────┐                                    │   │
│  │         ▼                ▼                                    │   │
│  │  ┌────────────┐  ┌────────────┐                               │   │
│  │  │  Pod A     │  │  Pod B     │  ← 2 replicas (HPA: 2-5)     │   │
│  │  │  Node.js   │  │  Node.js   │                               │   │
│  │  │  :8080     │  │  :8080     │                               │   │
│  │  └────────────┘  └────────────┘                               │   │
│  │         │                │                                    │   │
│  │         └───────┬────────┘                                    │   │
│  │                 │ /metrics (port 8080)                        │   │
│  │  Namespace: monitoring                                         │   │
│  │  ┌──────────────▼──────────────────┐                          │   │
│  │  │  Prometheus                     │                          │   │
│  │  │  (scrapes every 15s)            │                          │   │
│  │  └──────────────┬──────────────────┘                          │   │
│  │                 │ PromQL                                       │   │
│  │  ┌──────────────▼──────────────────┐                          │   │
│  │  │  Grafana  (NodePort 32000)       │◄── browser               │   │
│  │  └─────────────────────────────────┘                          │   │
│  └───────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Request Path (Happy Path)

Tracing a `GET /tasks` request end-to-end:

1. **Client** → `curl http://task-manager.local/tasks`
2. **DNS / /etc/hosts** → resolves `task-manager.local` to `127.0.0.1`
3. **kind port mapping** → host port 80 → nginx Ingress controller pod (port 80)
4. **nginx Ingress** → matches `host: task-manager.local`, path prefix `/`
5. **Service: task-manager** (ClusterIP) → picks one of 2 pod endpoints
6. **Pod** → Express app receives request
   - `pino-http` middleware logs: `{"method":"GET","url":"/tasks","reqId":"..."}`
   - OpenTelemetry creates a span: `GET /tasks`
   - `TaskController.fetchAllTasks` → returns JSON array
   - Prometheus histogram records request duration
7. **Response** → JSON array of tasks → back to client
8. **Prometheus** → scrapes `/metrics` on next 15s interval → stores data points
9. **Grafana** → queries Prometheus, updates dashboard panels

---

## Failure Boundaries

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Pod crash / OOMKill | Liveness probe fails → K8s restarts pod | Automatic restart, HPA maintains minimum 2 replicas |
| Pod stuck / deadlock | Liveness probe times out | K8s kills + restarts pod after 3 failures × 15s = 45s |
| Pod not ready (startup) | Readiness probe fails | K8s removes pod from Service endpoints → no traffic sent |
| Bad deployment | Rolling update: maxUnavailable=0 → old pods kept alive | `helm rollback task-manager 1` (instant) |
| Node failure | K8s reschedules pods to remaining nodes | topologySpreadConstraints distributes across nodes |
| High load | HPA detects CPU > 70% → adds pods (up to 5) | Scale-down after 5 min stability window |

---

## Dependencies

| Component | Type | Required | Notes |
|-----------|------|----------|-------|
| Node.js 18 | Runtime | Yes | Bundled in container image |
| Express 4 | Library | Yes | HTTP framework |
| prom-client | Library | Yes | Prometheus metrics |
| pino | Library | Yes | Structured logging |
| OpenTelemetry | Library | No | Disabled by default (OTEL_SDK_DISABLED=true) |
| MongoDB | External | No | Currently disabled; in-memory store used |
| Kubernetes (kind) | Infrastructure | Yes | Local dev cluster |
| nginx Ingress | K8s add-on | Yes | HTTP routing |
| Prometheus | K8s add-on | No | Observability stack |
| Grafana | K8s add-on | No | Dashboard visualisation |

---

## Networking

- **External → Cluster**: nginx Ingress on port 80 (NodePort in kind)
- **Ingress → Service**: ClusterIP on port 80
- **Service → Pods**: port 8080 (named port `http`)
- **Prometheus → Pods**: direct pod IP scrape on port 8080
- **NetworkPolicy**: blocks all other ingress/egress (see `k8s/networkpolicy.yaml`)

---

## Configuration Hierarchy

```
ConfigMap (non-sensitive)         Secret (sensitive, not in git)
├── NODE_ENV=production           └── MONGODB_URI=mongodb://...
├── PORT=8080
├── LOG_LEVEL=info
└── OTEL_SDK_DISABLED=true

Deployment env:
└── APP_VERSION=sha-abc1234  (set by CI at deploy time)
```

All config is external to the image. Changing a ConfigMap value + `helm upgrade` triggers a pod restart (via checksum annotation) without rebuilding the image.
