# output.tf

output "service_account_email" {
  description = "Email da Service Account para GitHub Actions"
  value       = google_service_account.tofu_github.email
}

output "database_instance_name" {
  description = "Nome da instância Cloud SQL"
  value       = google_sql_database_instance.instance.name
}

output "database_connection_name" {
  description = "Nome de conexão da instância Cloud SQL"
  value       = google_sql_database_instance.instance.connection_name
}

output "database_public_ip" {
  description = "IP público do banco de dados"
  value       = google_sql_database_instance.instance.public_ip_address
}

output "workload_identity_pool_id" {
  description = "ID do Workload Identity Pool"
  value       = google_iam_workload_identity_pool.pool.workload_identity_pool_id
}

output "workload_identity_pool_provider_id" {
  description = "ID do Workload Identity Provider"
  value       = google_iam_workload_identity_pool_provider.github.workload_identity_pool_provider_id
}

output "workload_identity_pool_name" {
  description = "Nome completo do Workload Identity Pool"
  value       = google_iam_workload_identity_pool.pool.name
}

output "workload_identity_pool_provider_name" {
  description = "Nome completo do Workload Identity Provider"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "github_actions_config" {
  description = "Configuração para GitHub Actions"
  value = {
    workload_identity_provider = google_iam_workload_identity_pool_provider.github.name
    service_account_email      = google_service_account.tofu_github.email
    repository_owner_id        = var.repository_owner_id
    repository                 = "gh-org/gh-repo"
    branch                     = "main"
  }
}

output "terraform_to_github_secrets" {
  description = "Valores para configurar como secrets no GitHub"
  sensitive   = true
  value = {
    GCP_WORKLOAD_IDENTITY_PROVIDER = google_iam_workload_identity_pool_provider.github.name
    GCP_SERVICE_ACCOUNT            = google_service_account.tofu_github.email
    GCP_PROJECT_ID                 = var.project_id
    GCP_REGION                     = var.region
  }
}

output "github_workflow_example" {
  description = "Exemplo de configuração para GitHub Actions workflow"
  value = <<-EOT
  # .github/workflows/deploy.yml
  name: Deploy to GCP
  
  on:
    push:
      branches: [ main ]
  
  permissions:
    id-token: write
    contents: read
  
  jobs:
    deploy:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        
        - id: 'auth'
          name: 'Authenticate to Google Cloud'
          uses: 'google-github-actions/auth@v1'
          with:
            workload_identity_provider: '${google_iam_workload_identity_pool_provider.github.name}'
            service_account: '${google_service_account.tofu_github.email}'
            
        - name: 'Set up OpenTofu'
          uses: 'opentofu/setup-opentofu@v1'
          with:
            tofu_version: 'latest'
            
        - name: 'OpenTofu Init'
          run: tofu init
          
        - name: 'OpenTofu Apply'
          run: tofu apply -auto-approve
  EOT
}

output "attribute_condition" {
  description = "Condição de atributo configurada no provider"
  value       = google_iam_workload_identity_pool_provider.github.attribute_condition
}

output "attribute_mapping" {
  description = "Mapeamento de atributos configurado"
  value       = google_iam_workload_identity_pool_provider.github.attribute_mapping
}

output "oidc_issuer_uri" {
  description = "URI do issuer OIDC"
  value       = google_iam_workload_identity_pool_provider.github.oidc[0].issuer_uri
}

output "iam_binding_member" {
  description = "Membro IAM configurado para Workload Identity"
  value       = google_service_account_iam_member.github_account_iam.member
}

output "project_info" {
  description = "Informações do projeto GCP"
  value = {
    project_id = var.project_id
    region     = var.region
  }
}

# Outputs sensíveis ou que podem expor informações - use com cuidado
output "sensitive_outputs" {
  description = "Outputs sensíveis - não compartilhe publicamente"
  sensitive   = true
  value = {
    # Lista de recursos criados
    resources = [
      {
        type = "google_service_account"
        name = google_service_account.tofu_github.name
        id   = google_service_account.tofu_github.id
      },
      {
        type = "google_iam_workload_identity_pool"
        name = google_iam_workload_identity_pool.pool.name
        id   = google_iam_workload_identity_pool.pool.id
      },
      {
        type = "google_iam_workload_identity_pool_provider"
        name = google_iam_workload_identity_pool_provider.github.name
        id   = google_iam_workload_identity_pool_provider.github.id
      }
    ]
  }
}