# ── Secrets Manager — NextAuth secret ────────────────────────────────────────
resource "aws_secretsmanager_secret" "nextauth" {
  name                    = "${local.name}/nextauth-secret"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "nextauth" {
  secret_id     = aws_secretsmanager_secret.nextauth.id
  secret_string = var.nextauth_secret
}

# ── IAM Role for all Lambda functions ────────────────────────────────────────
resource "aws_iam_role" "lambda" {
  name = "${local.name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "lambda_secrets" {
  name = "${local.name}-lambda-secrets"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [
          aws_rds_cluster.main.master_user_secret[0].secret_arn,
          aws_secretsmanager_secret.nextauth.arn,
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# ── Common Lambda settings ────────────────────────────────────────────────────
locals {
  lambda_runtime = "nodejs22.x"   # latest GA in AWS Lambda; bumped from nodejs20.x
  lambda_timeout = 29  # Match API Gateway's max timeout
  lambda_memory  = 1024 # More memory = more CPU = faster cold starts

  lambda_env = {
    NODE_ENV        = var.environment
    DB_SECRET_ARN   = aws_rds_cluster.main.master_user_secret[0].secret_arn
    DB_PROXY_HOST   = aws_db_proxy.main.endpoint
    DB_NAME         = var.db_name
    FRONTEND_URL    = var.frontend_url
    NEXTAUTH_SECRET = var.nextauth_secret
  }

  lambda_vpc_config = {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }
}

# ── Archive each Lambda from compiled dist ─────────────────────────────────────
# Assumes: cd infra/lambdas && npm run build produces dist/{handler}/handler.js

data "archive_file" "migrate" {
  type        = "zip"
  source_dir  = "${var.lambda_dist_path}/migrate_pkg"
  output_path = "/tmp/migrate.zip"
}

data "archive_file" "authorizer" {
  type        = "zip"
  source_dir  = "${var.lambda_dist_path}/authorizer_pkg"
  output_path = "/tmp/authorizer.zip"
}

data "archive_file" "users" {
  type        = "zip"
  source_dir  = "${var.lambda_dist_path}/users_pkg"
  output_path = "/tmp/users.zip"
}

data "archive_file" "flights" {
  type        = "zip"
  source_dir  = "${var.lambda_dist_path}/flights_pkg"
  output_path = "/tmp/flights.zip"
}

data "archive_file" "bookings" {
  type        = "zip"
  source_dir  = "${var.lambda_dist_path}/bookings_pkg"
  output_path = "/tmp/bookings.zip"
}

data "archive_file" "checkin" {
  type        = "zip"
  source_dir  = "${var.lambda_dist_path}/checkin_pkg"
  output_path = "/tmp/checkin.zip"
}

data "archive_file" "gate" {
  type        = "zip"
  source_dir  = "${var.lambda_dist_path}/gate_pkg"
  output_path = "/tmp/gate.zip"
}

data "archive_file" "admin" {
  type        = "zip"
  source_dir  = "${var.lambda_dist_path}/admin_pkg"
  output_path = "/tmp/admin.zip"
}

data "archive_file" "planning" {
  type        = "zip"
  source_dir  = "${var.lambda_dist_path}/planning_pkg"
  output_path = "/tmp/planning.zip"
}

data "archive_file" "integrations" {
  type        = "zip"
  source_dir  = "${var.lambda_dist_path}/integrations_pkg"
  output_path = "/tmp/integrations.zip"
}

# ── Lambda: Authorizer (no VPC — only verifies JWT, no DB) ────────────────────
resource "aws_lambda_function" "authorizer" {
  function_name    = "${local.name}-authorizer"
  role             = aws_iam_role.lambda.arn
  runtime          = local.lambda_runtime
  handler          = "authorizer/handler.handler"
  filename         = data.archive_file.authorizer.output_path
  source_code_hash = data.archive_file.authorizer.output_base64sha256
  timeout          = 10
  memory_size      = 256

  environment {
    variables = { NEXTAUTH_SECRET = var.nextauth_secret }
  }

  tags = { Name = "${local.name}-authorizer" }
}

# ── Lambda: Users ─────────────────────────────────────────────────────────────
resource "aws_lambda_function" "users" {
  function_name    = "${local.name}-users"
  role             = aws_iam_role.lambda.arn
  runtime          = local.lambda_runtime
  handler          = "users/handler.handler"
  filename         = data.archive_file.users.output_path
  source_code_hash = data.archive_file.users.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory

  environment { variables = local.lambda_env }

  vpc_config {
    subnet_ids         = local.lambda_vpc_config.subnet_ids
    security_group_ids = local.lambda_vpc_config.security_group_ids
  }

  tags = { Name = "${local.name}-users" }
}

# ── Lambda: Flights ───────────────────────────────────────────────────────────
resource "aws_lambda_function" "flights" {
  function_name    = "${local.name}-flights"
  role             = aws_iam_role.lambda.arn
  runtime          = local.lambda_runtime
  handler          = "flights/handler.handler"
  filename         = data.archive_file.flights.output_path
  source_code_hash = data.archive_file.flights.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory

  environment { variables = local.lambda_env }

  vpc_config {
    subnet_ids         = local.lambda_vpc_config.subnet_ids
    security_group_ids = local.lambda_vpc_config.security_group_ids
  }

  tags = { Name = "${local.name}-flights" }
}

# ── Lambda: Bookings ──────────────────────────────────────────────────────────
resource "aws_lambda_function" "bookings" {
  function_name    = "${local.name}-bookings"
  role             = aws_iam_role.lambda.arn
  runtime          = local.lambda_runtime
  handler          = "bookings/handler.handler"
  filename         = data.archive_file.bookings.output_path
  source_code_hash = data.archive_file.bookings.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory

  environment { variables = local.lambda_env }

  vpc_config {
    subnet_ids         = local.lambda_vpc_config.subnet_ids
    security_group_ids = local.lambda_vpc_config.security_group_ids
  }

  tags = { Name = "${local.name}-bookings" }
}

# ── Lambda: Checkin ───────────────────────────────────────────────────────────
resource "aws_lambda_function" "checkin" {
  function_name    = "${local.name}-checkin"
  role             = aws_iam_role.lambda.arn
  runtime          = local.lambda_runtime
  handler          = "checkin/handler.handler"
  filename         = data.archive_file.checkin.output_path
  source_code_hash = data.archive_file.checkin.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory

  environment { variables = local.lambda_env }

  vpc_config {
    subnet_ids         = local.lambda_vpc_config.subnet_ids
    security_group_ids = local.lambda_vpc_config.security_group_ids
  }

  tags = { Name = "${local.name}-checkin" }
}

# ── Lambda: Gate ──────────────────────────────────────────────────────────────
resource "aws_lambda_function" "gate" {
  function_name    = "${local.name}-gate"
  role             = aws_iam_role.lambda.arn
  runtime          = local.lambda_runtime
  handler          = "gate/handler.handler"
  filename         = data.archive_file.gate.output_path
  source_code_hash = data.archive_file.gate.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory

  environment { variables = local.lambda_env }

  vpc_config {
    subnet_ids         = local.lambda_vpc_config.subnet_ids
    security_group_ids = local.lambda_vpc_config.security_group_ids
  }

  tags = { Name = "${local.name}-gate" }
}

# ── Lambda: Admin ─────────────────────────────────────────────────────────────
resource "aws_lambda_function" "admin" {
  function_name    = "${local.name}-admin"
  role             = aws_iam_role.lambda.arn
  runtime          = local.lambda_runtime
  handler          = "admin/handler.handler"
  filename         = data.archive_file.admin.output_path
  source_code_hash = data.archive_file.admin.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory

  environment { variables = local.lambda_env }

  vpc_config {
    subnet_ids         = local.lambda_vpc_config.subnet_ids
    security_group_ids = local.lambda_vpc_config.security_group_ids
  }

  tags = { Name = "${local.name}-admin" }
}

# ── Lambda: Planning ──────────────────────────────────────────────────────────
resource "aws_lambda_function" "planning" {
  function_name    = "${local.name}-planning"
  role             = aws_iam_role.lambda.arn
  runtime          = local.lambda_runtime
  handler          = "planning/handler.handler"
  filename         = data.archive_file.planning.output_path
  source_code_hash = data.archive_file.planning.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory

  environment { variables = local.lambda_env }

  vpc_config {
    subnet_ids         = local.lambda_vpc_config.subnet_ids
    security_group_ids = local.lambda_vpc_config.security_group_ids
  }

  tags = { Name = "${local.name}-planning" }
}

# ── Lambda: Integrations (per-tenant data-source configuration) ──────────────
resource "aws_lambda_function" "integrations" {
  function_name    = "${local.name}-integrations"
  role             = aws_iam_role.lambda.arn
  runtime          = local.lambda_runtime
  handler          = "integrations/handler.handler"
  filename         = data.archive_file.integrations.output_path
  source_code_hash = data.archive_file.integrations.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory

  environment { variables = local.lambda_env }

  vpc_config {
    subnet_ids         = local.lambda_vpc_config.subnet_ids
    security_group_ids = local.lambda_vpc_config.security_group_ids
  }

  tags = { Name = "${local.name}-integrations" }
}

# ── Lambda: Migrate (one-shot DB migration, invoked by CI after terraform apply) ─
resource "aws_lambda_function" "migrate" {
  function_name    = "${local.name}-migrate"
  role             = aws_iam_role.lambda.arn
  runtime          = local.lambda_runtime
  handler          = "migrate/handler.handler"
  filename         = data.archive_file.migrate.output_path
  source_code_hash = data.archive_file.migrate.output_base64sha256
  timeout          = 120
  memory_size      = 256

  environment { variables = local.lambda_env }

  vpc_config {
    subnet_ids         = local.lambda_vpc_config.subnet_ids
    security_group_ids = local.lambda_vpc_config.security_group_ids
  }

  tags = { Name = "${local.name}-migrate" }
}
