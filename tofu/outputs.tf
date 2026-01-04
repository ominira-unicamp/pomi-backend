output "cloud_run_url" {
  description = "URL of the Cloud Run service"
  value       = google_cloud_run_v2_service.api.uri
}

output "database_connection_name" {
  description = "Cloud SQL instance connection name"
  value       = google_sql_database_instance.instance.connection_name
}

output "database_public_ip" {
  description = "Cloud SQL instance public IP"
  value       = google_sql_database_instance.instance.public_ip_address
}

output "database_url" {
  description = "Database connection string"
  value       = "postgresql://${var.db_user}:${var.db_password}@${google_sql_database_instance.instance.public_ip_address}:5432/${var.db_name}?schema=public"
  sensitive   = true
}
