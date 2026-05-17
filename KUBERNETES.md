# Kubernetes Deployment Guide for climb512

## Prerequisites
- A Kubernetes cluster (minikube, EKS, GKE, or local k3s)
- `kubectl` configured to access your cluster
- Docker images pushed to a registry accessible from your cluster, or built locally

## Quick Start

### 1. Build Docker images
Build images for your services and push them to a registry:

```bash
cd /path/to/climb512

# Build each service
docker build -t climb512-simulator:latest ./simulator
docker build -t climb512-web:latest ./app
docker build -t climb512-worker:latest ./app

# Push to registry (or use local for minikube)
docker tag climb512-simulator:latest your-registry/climb512-simulator:latest
docker push your-registry/climb512-simulator:latest
# ... repeat for web and worker
```

For **minikube**, load images directly:
```bash
minikube image load climb512-simulator:latest
minikube image load climb512-web:latest
minikube image load climb512-worker:latest
```

### 2. Deploy to Kubernetes
```bash
kubectl apply -f k8s-deployment.yaml
```

### 3. Verify deployment
```bash
kubectl get pods -n climb512
kubectl get svc -n climb512
```

### 4. Wait for services to be ready
```bash
kubectl wait --for=condition=ready pod -l app=web -n climb512 --timeout=300s
```

### 5. Access the application
For **LoadBalancer** service:
```bash
kubectl get svc web -n climb512
# Use the EXTERNAL-IP
```

For **minikube** (which doesn't provide EXTERNAL-IP):
```bash
minikube service web -n climb512
```

For **port forwarding**:
```bash
kubectl port-forward svc/web 8080:8080 -n climb512
# Access at http://localhost:8080
```

## Scaling

Scale the web deployment:
```bash
kubectl scale deployment web --replicas=3 -n climb512
```

## Viewing Logs
```bash
# Check pod logs
kubectl logs deployment/web -n climb512
kubectl logs deployment/plan-worker -n climb512

# Stream logs
kubectl logs -f deployment/web -n climb512
```

## Environment Variables

Edit the ConfigMap to change runtime settings:
```bash
kubectl edit configmap climb512-config -n climb512
```

Edit the Secret for sensitive data:
```bash
kubectl edit secret climb512-secrets -n climb512
```

## Troubleshooting

### Check pod status
```bash
kubectl describe pod <pod-name> -n climb512
```

### View all events
```bash
kubectl get events -n climb512
```

### Check database connectivity
```bash
kubectl exec -it deployment/postgres -n climb512 -- psql -U climber -d climbapp
```

### Re-run migrations
```bash
kubectl delete job migrate -n climb512
kubectl apply -f k8s-deployment.yaml
```

## Storage

The PostgreSQL data is stored in a PersistentVolumeClaim. By default, Kubernetes uses the cluster's default StorageClass. To specify a different storage class, edit the `postgres-pvc` PVC in the manifest.

## Cleanup

Delete the entire deployment:
```bash
kubectl delete namespace climb512
```

## Production Recommendations

- Use a managed database service (RDS, Cloud SQL) instead of in-cluster PostgreSQL
- Use a private container registry and configure ImagePullSecrets
- Set resource requests/limits for each container
- Use network policies to restrict traffic
- Enable pod security policies
- Use HTTPS/TLS for web service
- Configure horizontal pod autoscaling (HPA) for web and plan-worker
- Set up monitoring and logging (Prometheus, ELK, etc.)
