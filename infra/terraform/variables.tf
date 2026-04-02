variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "app_name" {
  description = "Application name prefix for resources"
  type        = string
  default     = "airlineos"
}

variable "db_name" {
  description = "Aurora database name"
  type        = string
  default     = "airlineos"
}

variable "db_master_username" {
  description = "Aurora master username"
  type        = string
  default     = "airlineos_admin"
}

variable "frontend_url" {
  description = "Next.js frontend URL for CORS (e.g. https://airlineos.vercel.app)"
  type        = string
}

variable "nextauth_secret" {
  description = "NextAuth.js secret (same value used in the Next.js app)"
  type        = string
  sensitive   = true
}

variable "lambda_dist_path" {
  description = "Path to the compiled Lambda dist directory"
  type        = string
  default     = "../lambdas/dist"
}
