provider "google" {
  project     = var.project_id
  region      = var.region
}

resource "google_project_service" "cloud_run" {
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloud_sql" {
  service            = "sqladmin.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "vpcaccess" {
  service            = "vpcaccess.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "compute" {
  service            = "compute.googleapis.com"
  disable_on_destroy = false
}

resource "google_sql_database_instance" "instance" {
  name             = var.db_instance_name
  database_version = "POSTGRES_15"
  settings {
    tier = "db-g1-small"
	ip_configuration {
      ipv4_enabled    = true
      authorized_networks {
        name  = "all"
        value = "0.0.0.0/0"
      }
    }
  }
}

resource "google_sql_user" "users" {
  name     = var.db_user
  instance = google_sql_database_instance.instance.name
  password = var.db_password
}

resource "google_sql_database" "database" {
  name     = var.db_name
  instance = google_sql_database_instance.instance.name
}

resource "google_cloud_run_v2_service" "api" {
  name     = var.app_name
  location = var.region
  deletion_protection = false
  
  template {
    health_check_disabled = true

    containers {
	  image = var.container_image
	  
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

	        ports {
        container_port = 3000
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "DATABASE_URL"
        value = "postgresql://${var.db_user}:${var.db_password}@${google_sql_database_instance.instance.public_ip_address}:5432/${var.db_name}?schema=public"
      }

      env {
        name  = "secretKey"
        value = var.jwt_secret
      }
      startup_probe {
        initial_delay_seconds = 0
        timeout_seconds       = 120
        period_seconds        = 10
        failure_threshold     = 8
        tcp_socket {
          port = 3000
        }
      }
    }
  }
  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_service.cloud_run,
    google_sql_database_instance.instance
  ]
}

resource "google_cloud_run_service_iam_member" "public_access" {
  location = google_cloud_run_v2_service.api.location
  service  = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
