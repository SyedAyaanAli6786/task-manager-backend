# Runbook — Task Manager Backend

Complete guide to build, deploy, operate, and observe the task-manager-backend
on a local Kubernetes cluster using kind.

---

## Prerequisites

Install the following tools before proceeding:

```bash
# Docker (already installed — verify)
docker --version   # expected: Docker version 29.x or later

# kind — Kubernetes IN Docker
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.24.0/kind-linux-amd64
chmod +x ./kind && sudo mv ./kind /usr/local/bin/kind
kind --version

# kubectl
curl -LO "https://dl.k8s.io/release/$(curl -Ls https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl && sudo mv kubectl /usr/local/bin/kubectl
kubectl version --client

# Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version
```

---

## 1. Clone the repository

```bash
git clone https://github.com/SyedAyaanAli6786/task-manager-backend.git
cd task-manager-backend
git checkout devops-improvements
```

---

## 2. Build and run locally (without Kubernetes)

```bash
npm install
npm test           # run unit tests
npm start          # starts on http://localhost:8080

# Verify
curl http://localhost:8080/           # {"service":"task-manager-backend","status":"ok",...}
curl http://localhost:8080/health/live
curl http://localhost:8080/health/ready
curl http://localhost:8080/metrics    # Prometheus text format
curl http://localhost:8080/tasks      # [{"id":"1","title":"Learn Jest",...}]
```

---

## 3. Build the Docker image

```bash
# Replace DOCKERHUB_USERNAME with your Docker Hub username
export DOCKERHUB_USERNAME=your-dockerhub-username
export SHORT_SHA=$(git rev-parse --short HEAD)

docker build \
  --build-arg APP_VERSION=${SHORT_SHA} \
  -t ${DOCKERHUB_USERNAME}/task-manager-backend:sha-${SHORT_SHA} \
  -t ${DOCKERHUB_USERNAME}/task-manager-backend:latest \
  .

# Verify image runs correctly
docker run --rm -p 8080:8080 \
  -e NODE_ENV=production \
  ${DOCKERHUB_USERNAME}/task-manager-backend:latest &
sleep 5
curl http://localhost:8080/health/live
curl http://localhost:8080/metrics
docker stop $(docker ps -q --filter ancestor=${DOCKERHUB_USERNAME}/task-manager-backend:latest)
```

---

## 4. Create the kind cluster

```bash
# Create a 1-control-plane + 1-worker cluster with port mappings for Ingress
cat <<EOF | kind create cluster --name task-manager --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    kubeadmConfigPatches:
      - |
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-labels: "ingress-ready=true"
    extraPortMappings:
      - containerPort: 80
        hostPort: 80
        protocol: TCP
      - containerPort: 443
        hostPort: 443
        protocol: TCP
  - role: worker
EOF

# Verify cluster is up
kubectl cluster-info --context kind-task-manager
kubectl get nodes
```

---

## 5. Install nginx Ingress Controller

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# Wait for Ingress controller to be ready
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s
```

---

## 6. Add /etc/hosts entry

```bash
# Add task-manager.local → 127.0.0.1 so the Ingress host rule matches
echo "127.0.0.1 task-manager.local" | sudo tee -a /etc/hosts
```

---

## 7. Load the Docker image into kind

```bash
# kind clusters use their own container runtime — push the image in
kind load docker-image \
  ${DOCKERHUB_USERNAME}/task-manager-backend:sha-${SHORT_SHA} \
  --name task-manager
```

---

## 8. Deploy with Helm

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Install/upgrade the Helm release
helm upgrade --install task-manager ./helm/task-manager \
  --namespace task-manager \
  --set image.repository="${DOCKERHUB_USERNAME}/task-manager-backend" \
  --set image.tag="sha-${SHORT_SHA}" \
  --set app.version="${SHORT_SHA}" \
  --wait \
  --timeout 3m

# Verify deployment
kubectl get all -n task-manager
kubectl rollout status deployment/task-manager -n task-manager
```

---

## 9. Verify the deployment

```bash
# Check pods are Running and Ready (2/2)
kubectl get pods -n task-manager

# Check probes + resource limits
kubectl describe deployment task-manager -n task-manager

# Check HPA
kubectl get hpa -n task-manager

# Test the API via Ingress
curl http://task-manager.local/
curl http://task-manager.local/health/live
curl http://task-manager.local/health/ready
curl http://task-manager.local/tasks

# Create a task
curl -X POST http://task-manager.local/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title": "Test deployment"}'

# Check structured logs
kubectl logs -l app.kubernetes.io/name=task-manager -n task-manager --follow

# Check Prometheus metrics from inside cluster
kubectl port-forward svc/task-manager 8080:80 -n task-manager &
curl http://localhost:8080/metrics | grep -E "(http_requests|task_operations)"
```

---

## 10. Install observability stack (optional)

```bash
# Add Prometheus community Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install kube-prometheus-stack
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  -f monitoring/prometheus-values.yaml \
  --wait --timeout 5m

# Apply alert rules
kubectl apply -f monitoring/alerts.yaml

# Access Grafana (admin / admin)
echo "Grafana: http://localhost:32000"
# If NodePort isn't reachable, port-forward:
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring &
echo "Grafana: http://localhost:3000"

# Import dashboard
# Grafana UI → Dashboards → Import → Upload JSON file → monitoring/grafana-dashboard.json
```

---

## 11. Rolling update (release new version)

```bash
# Simulate a code change: bump the APP_VERSION
export NEW_SHA=$(git rev-parse --short HEAD)-v2

docker build --build-arg APP_VERSION=${NEW_SHA} \
  -t ${DOCKERHUB_USERNAME}/task-manager-backend:sha-${NEW_SHA} .

kind load docker-image \
  ${DOCKERHUB_USERNAME}/task-manager-backend:sha-${NEW_SHA} \
  --name task-manager

# Upgrade — watch rolling update in real time
helm upgrade task-manager ./helm/task-manager \
  --namespace task-manager \
  --set image.tag="sha-${NEW_SHA}" \
  --set app.version="${NEW_SHA}" \
  --wait &

kubectl rollout status deployment/task-manager -n task-manager --watch

# Confirm running version
curl http://task-manager.local/ | python3 -m json.tool
```

---

## 12. Rollback

```bash
# Option A: Helm rollback (fastest — uses stored release history)
helm history task-manager -n task-manager    # see all revisions
helm rollback task-manager 1 -n task-manager # roll back to revision 1

# Option B: kubectl rollout undo (uses ReplicaSet history)
kubectl rollout undo deployment/task-manager -n task-manager
kubectl rollout status deployment/task-manager -n task-manager

# Verify rollback
curl http://task-manager.local/ | python3 -m json.tool   # check 'version' field
```

---

## 13. Cleanup

```bash
# Uninstall Helm releases
helm uninstall task-manager -n task-manager
helm uninstall monitoring  -n monitoring

# Delete kind cluster (removes all cluster resources)
kind delete cluster --name task-manager

# Remove /etc/hosts entry
sudo sed -i '/task-manager.local/d' /etc/hosts
```

---

## Known Limitations

| Limitation | Explanation |
|------------|-------------|
| In-memory task store | Tasks reset on pod restart. Each pod has its own memory — no shared state across replicas. |
| No TLS | Ingress runs on HTTP only. In production, use cert-manager + Let's Encrypt. |
| No persistent volume | No StatefulSet or PVC; appropriate for this stateless demo app. |
| kind is ephemeral | Cluster data lost on `kind delete cluster`. Acceptable for local dev. |
| GitHub Environments | Manual approval gate requires the `production` environment to be configured in GitHub Settings. |
| OTEL disabled by default | Tracing requires a running OTLP collector (e.g. Jaeger). Enable with `OTEL_SDK_DISABLED=false`. |

---

## Useful Commands Reference

```bash
# Pods
kubectl get pods -n task-manager -o wide
kubectl describe pod <pod-name> -n task-manager
kubectl logs <pod-name> -n task-manager --previous   # logs from crashed container

# Events (first thing to check on deployment issues)
kubectl get events -n task-manager --sort-by='.lastTimestamp'

# Exec into a pod
kubectl exec -it <pod-name> -n task-manager -- sh

# Helm
helm status  task-manager -n task-manager
helm history task-manager -n task-manager
helm diff upgrade task-manager ./helm/task-manager --set image.tag=new-sha  # preview changes

# Metrics
kubectl top pods -n task-manager      # requires metrics-server
kubectl top nodes
```
