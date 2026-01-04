# Terraform - Deploy no Google Cloud Platform

Esta configuração Terraform provisiona a infraestrutura necessária para rodar o pomi-backend no GCP.

## Recursos Criados

- **Cloud Run**: Serviço serverless para a API
- **Cloud SQL (PostgreSQL 15)**: Banco de dados gerenciado
- **APIs habilitadas**: Cloud Run, Cloud SQL, VPC Access, Compute Engine

## Pré-requisitos

1. Conta no Google Cloud Platform
2. Projeto GCP criado
3. [Terraform](https://www.terraform.io/downloads) instalado (>= 1.0)
4. [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) instalado
5. Imagem Docker da aplicação no Container Registry ou Artifact Registry

## Configuração Inicial

### 1. Autenticar no GCP

```bash
gcloud auth login
gcloud auth application-default login
```

### 2. Configurar o projeto

```bash
gcloud config set project SEU_PROJECT_ID
```

### 3. Build e push da imagem Docker

```bash
# Configurar Docker para usar o GCR
gcloud auth configure-docker

# Build da imagem
docker build -t gcr.io/SEU_PROJECT_ID/pomi-backend:latest .

# Push para o Container Registry
docker push gcr.io/SEU_PROJECT_ID/pomi-backend:latest
```

### 4. Configurar variáveis do Terraform

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edite `terraform.tfvars` com seus valores:

```hcl
project_id      = "seu-projeto-gcp"
region          = "us-central1"
db_password     = "senha-segura-aqui"
jwt_secret      = "seu-jwt-secret"
container_image = "gcr.io/seu-projeto-gcp/pomi-backend:latest"
```

## Deploy

### 1. Inicializar Terraform

```bash
terraform init
```

### 2. Planejar mudanças

```bash
terraform plan
```

### 3. Aplicar configuração

```bash
terraform apply
```

Confirme digitando `yes` quando solicitado.

### 4. Obter URL da API

```bash
terraform output cloud_run_url
```

## Executar Migrations

Após o deploy, você precisa executar as migrations do Prisma:

```bash
# Obter a URL do banco
terraform output database_url

# Executar migrations localmente apontando para o Cloud SQL
DATABASE_URL="postgresql://user:pass@IP:5432/pomi?schema=public" npx prisma migrate deploy
```

Ou use o Cloud Shell:

```bash
gcloud cloud-shell ssh --command="cd /workspace && DATABASE_URL='sua-database-url' npx prisma migrate deploy"
```

## Atualizar a Aplicação

Quando fizer mudanças no código:

```bash
# 1. Build nova imagem
docker build -t gcr.io/SEU_PROJECT_ID/pomi-backend:latest .

# 2. Push
docker push gcr.io/SEU_PROJECT_ID/pomi-backend:latest

# 3. Redesenhar o Cloud Run (força pull da nova imagem)
terraform apply -replace="google_cloud_run_v2_service.api"
```

## Monitoramento

### Logs da aplicação

```bash
gcloud run services logs read pomi-backend --region=us-central1
```

### Status do Cloud SQL

```bash
gcloud sql instances describe pomi-db
```

### Métricas do Cloud Run

Acesse: https://console.cloud.google.com/run

## Custos Estimados

Com a configuração atual (tier gratuito/mínimo):

- **Cloud Run**: ~$0 (free tier: 2 milhões de requests/mês)
- **Cloud SQL (db-f1-micro)**: ~$7-10/mês
- **Egress de rede**: Variável

**Total estimado**: ~$10-15/mês

### Otimizar custos

Para desenvolvimento, você pode:

1. Parar a instância do Cloud SQL quando não estiver usando:
```bash
gcloud sql instances patch pomi-db --activation-policy=NEVER
```

2. Usar `min_instance_count = 0` no Cloud Run (já configurado)

## Destruir Infraestrutura

Para remover todos os recursos:

```bash
terraform destroy
```

## Segurança

### Recomendações para Produção

 
2. **Use Secret Manager para senhas**:
```hcl
data "google_secret_manager_secret_version" "db_password" {
  secret = "db-password"
}
```

3. **Habilite SSL para Cloud SQL**:
```hcl
require_ssl = true
```

4. **Restrinja acesso ao Cloud Run**:
   - Remova `google_cloud_run_service_iam_member.public_access`
   - Use Identity-Aware Proxy (IAP)

5. **Use VPC Connector**:
   - Conecte Cloud Run ao Cloud SQL via IP privado

## Troubleshooting

### Erro: "API not enabled"

```bash
gcloud services enable run.googleapis.com sqladmin.googleapis.com
```

### Erro de permissões

Certifique-se que sua conta tem as roles:
- `roles/run.admin`
- `roles/cloudsql.admin`
- `roles/iam.serviceAccountUser`

### Cloud Run não consegue conectar ao banco

1. Verifique se o Cloud SQL permite conexões do IP do Cloud Run
2. Teste a connection string localmente
3. Verifique os logs: `gcloud run services logs read pomi-backend`

## Referências

- [Terraform Google Provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud SQL Documentation](https://cloud.google.com/sql/docs)
