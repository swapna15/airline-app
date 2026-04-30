# ── DB Subnet Group ───────────────────────────────────────────────────────────
resource "aws_db_subnet_group" "main" {
  name       = "${local.name}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = "${local.name}-db-subnet-group" }
}

# Aurora manages its own Secrets Manager secret when manage_master_user_password = true.
# Access the ARN via: aws_rds_cluster.main.master_user_secret[0].secret_arn

# ── Aurora Serverless v2 ──────────────────────────────────────────────────────
resource "aws_rds_cluster" "main" {
  cluster_identifier      = "${local.name}-aurora"
  engine                  = "aurora-postgresql"
  engine_mode             = "provisioned"
  engine_version          = "17.4"   # latest GA major; bumped from 15.8 — see commit msg for breakage analysis
  database_name           = var.db_name
  master_username         = var.db_master_username
  manage_master_user_password = true   # Secrets Manager rotation managed by AWS

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.aurora.id]

  serverlessv2_scaling_configuration {
    min_capacity = 1
    max_capacity = 16
  }

  storage_encrypted     = true
  deletion_protection   = var.environment == "prod"
  skip_final_snapshot   = var.environment != "prod"
  apply_immediately     = var.environment != "prod"   # major-version upgrade triggers in-place restart
  allow_major_version_upgrade = true

  tags = { Name = "${local.name}-aurora" }
}

resource "aws_rds_cluster_instance" "main" {
  identifier         = "${local.name}-aurora-instance"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version

  db_subnet_group_name = aws_db_subnet_group.main.name
  tags                 = { Name = "${local.name}-aurora-instance" }
}

# ── IAM Role for RDS Proxy ────────────────────────────────────────────────────
resource "aws_iam_role" "rds_proxy" {
  name = "${local.name}-rds-proxy-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "rds.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "rds_proxy_secrets" {
  name = "${local.name}-rds-proxy-secrets"
  role = aws_iam_role.rds_proxy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
      Resource = aws_rds_cluster.main.master_user_secret[0].secret_arn
    }]
  })
}

# ── RDS Proxy ─────────────────────────────────────────────────────────────────
resource "aws_db_proxy" "main" {
  name                   = "${local.name}-rds-proxy"
  debug_logging          = false
  engine_family          = "POSTGRESQL"
  idle_client_timeout    = 1800
  require_tls            = true
  role_arn               = aws_iam_role.rds_proxy.arn
  vpc_security_group_ids = [aws_security_group.rds_proxy.id]
  vpc_subnet_ids         = aws_subnet.private[*].id

  auth {
    auth_scheme = "SECRETS"
    secret_arn  = aws_rds_cluster.main.master_user_secret[0].secret_arn
    iam_auth    = "DISABLED"
  }

  tags = { Name = "${local.name}-rds-proxy" }
}

resource "aws_db_proxy_default_target_group" "main" {
  db_proxy_name = aws_db_proxy.main.name

  connection_pool_config {
    connection_borrow_timeout    = 120
    max_connections_percent      = 100
    max_idle_connections_percent = 50
  }
}

resource "aws_db_proxy_target" "main" {
  db_proxy_name          = aws_db_proxy.main.name
  target_group_name      = aws_db_proxy_default_target_group.main.name
  db_cluster_identifier  = aws_rds_cluster.main.id
}
