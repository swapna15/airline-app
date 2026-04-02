output "api_gateway_url" {
  description = "Base URL of the API Gateway stage"
  value       = aws_api_gateway_stage.main.invoke_url
}

output "migrate_function_name" {
  description = "Name of the DB migration Lambda function"
  value       = aws_lambda_function.migrate.function_name
}

output "aurora_endpoint" {
  description = "Aurora cluster writer endpoint"
  value       = aws_rds_cluster.main.endpoint
  sensitive   = true
}

output "rds_proxy_endpoint" {
  description = "RDS Proxy endpoint (used by Lambdas)"
  value       = aws_db_proxy.main.endpoint
  sensitive   = true
}

output "db_secret_arn" {
  description = "Secrets Manager ARN for DB credentials"
  value       = aws_secretsmanager_secret.db.arn
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "Private subnet IDs (Lambdas + Aurora)"
  value       = aws_subnet.private[*].id
}
