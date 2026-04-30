# ── REST API ──────────────────────────────────────────────────────────────────
resource "aws_api_gateway_rest_api" "main" {
  name        = "${local.name}-api"
  description = "AirlineOS API Gateway"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = { Name = "${local.name}-api" }
}

# ── Lambda Request Authorizer ─────────────────────────────────────────────────
# REQUEST type (vs TOKEN) lets the authorizer read all headers, including
# X-Tenant-ID. TTL is 0 so each request hits the authorizer Lambda fresh —
# important because the same JWT used across tenants must not return a
# cached policy that carries the wrong tenantSlug in its context.
#
# IMPORTANT: identity_source is the set of REQUIRED headers — if any are
# missing or empty, API Gateway short-circuits to 401 WITHOUT invoking the
# authorizer Lambda (CloudWatch shows status:401 + no Lambda log). Keep it
# minimal: only Authorization is mandatory; X-Tenant-ID is read inside the
# Lambda with 'aeromock' as the default.
resource "aws_api_gateway_authorizer" "jwt" {
  name                             = "${local.name}-jwt-authorizer"
  rest_api_id                      = aws_api_gateway_rest_api.main.id
  authorizer_uri                   = aws_lambda_function.authorizer.invoke_arn
  authorizer_credentials           = aws_iam_role.apigw_invoke.arn
  type                             = "REQUEST"
  identity_source                  = "method.request.header.Authorization"
  authorizer_result_ttl_in_seconds = 0
}

resource "aws_iam_role" "apigw_invoke" {
  name = "${local.name}-apigw-invoke-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "apigateway.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "apigw_invoke_lambda" {
  name = "${local.name}-apigw-invoke-lambda"
  role = aws_iam_role.apigw_invoke.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = [
        aws_lambda_function.authorizer.arn,
        aws_lambda_function.users.arn,
        aws_lambda_function.flights.arn,
        aws_lambda_function.bookings.arn,
        aws_lambda_function.checkin.arn,
        aws_lambda_function.gate.arn,
        aws_lambda_function.admin.arn,
        aws_lambda_function.planning.arn,
        aws_lambda_function.integrations.arn,
      ]
    }]
  })
}

# ── Helper: creates a resource + method + integration (Lambda proxy) ───────────
# We use a flat structure of resources per service prefix.

# /users
resource "aws_api_gateway_resource" "users" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "users"
}

resource "aws_api_gateway_resource" "users_register" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.users.id
  path_part   = "register"
}

resource "aws_api_gateway_resource" "users_auth_debug" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.users.id
  path_part   = "auth-debug"
}

resource "aws_api_gateway_resource" "users_login" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.users.id
  path_part   = "login"
}

resource "aws_api_gateway_resource" "users_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.users.id
  path_part   = "{id}"
}

resource "aws_api_gateway_resource" "users_id_role" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.users_id.id
  path_part   = "role"
}

# /flights
resource "aws_api_gateway_resource" "flights" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "flights"
}

resource "aws_api_gateway_resource" "flights_search" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.flights.id
  path_part   = "search"
}

# /flights/own-today — list of today's airline-operated flights (canonical OwnFlight[])
resource "aws_api_gateway_resource" "flights_own_today" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.flights.id
  path_part   = "own-today"
}

resource "aws_api_gateway_resource" "flights_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.flights.id
  path_part   = "{id}"
}

resource "aws_api_gateway_resource" "flights_id_seats" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.flights_id.id
  path_part   = "seats"
}

# /bookings
resource "aws_api_gateway_resource" "bookings" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "bookings"
}

resource "aws_api_gateway_resource" "bookings_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.bookings.id
  path_part   = "{id}"
}

# /checkin
resource "aws_api_gateway_resource" "checkin" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "checkin"
}

resource "aws_api_gateway_resource" "checkin_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.checkin.id
  path_part   = "{id}"
}

resource "aws_api_gateway_resource" "checkin_id_boarding_pass" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.checkin_id.id
  path_part   = "boarding-pass"
}

resource "aws_api_gateway_resource" "checkin_flight" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.checkin.id
  path_part   = "flight"
}

resource "aws_api_gateway_resource" "checkin_flight_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.checkin_flight.id
  path_part   = "{flightId}"
}

# /gate
resource "aws_api_gateway_resource" "gate" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "gate"
}

resource "aws_api_gateway_resource" "gate_flights" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.gate.id
  path_part   = "flights"
}

resource "aws_api_gateway_resource" "gate_flights_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.gate_flights.id
  path_part   = "{id}"
}

resource "aws_api_gateway_resource" "gate_flights_id_status" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.gate_flights_id.id
  path_part   = "status"
}

resource "aws_api_gateway_resource" "gate_flights_id_board" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.gate_flights_id.id
  path_part   = "board"
}

resource "aws_api_gateway_resource" "gate_flights_id_manifest" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.gate_flights_id.id
  path_part   = "manifest"
}

# /admin
resource "aws_api_gateway_resource" "admin" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "admin"
}

resource "aws_api_gateway_resource" "admin_stats" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "stats"
}

resource "aws_api_gateway_resource" "admin_users" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "users"
}

resource "aws_api_gateway_resource" "admin_users_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin_users.id
  path_part   = "{id}"
}

resource "aws_api_gateway_resource" "admin_users_id_role" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin_users_id.id
  path_part   = "role"
}

resource "aws_api_gateway_resource" "admin_flights" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "flights"
}

# /admin/integrations — per-tenant integration configs (DB-backed in phase 5)
resource "aws_api_gateway_resource" "admin_integrations" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin.id
  path_part   = "integrations"
}

resource "aws_api_gateway_resource" "admin_integrations_kind" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin_integrations.id
  path_part   = "{kind}"
}

resource "aws_api_gateway_resource" "admin_integrations_kind_test" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.admin_integrations_kind.id
  path_part   = "test"
}

# /planning
resource "aws_api_gateway_resource" "planning" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "planning"
}

resource "aws_api_gateway_resource" "planning_flight_plans" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.planning.id
  path_part   = "flight-plans"
}

resource "aws_api_gateway_resource" "planning_flight_plans_id" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.planning_flight_plans.id
  path_part   = "{flightId}"
}

resource "aws_api_gateway_resource" "planning_flight_plans_id_reviews" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.planning_flight_plans_id.id
  path_part   = "reviews"
}

resource "aws_api_gateway_resource" "planning_rejection_comments" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.planning.id
  path_part   = "rejection-comments"
}

resource "aws_api_gateway_resource" "planning_eod_stats" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.planning.id
  path_part   = "eod-stats"
}

# ── Method + Integration module ───────────────────────────────────────────────
# Static map keys are required — for_each keys must be known at plan time,
# so resource IDs (known after apply) cannot be used as keys.
locals {
  routes = {
    # Users — public (no authorizer)
    "POST-users-register"          = { method = "POST",   resource_id = aws_api_gateway_resource.users_register.id,              lambda_arn = aws_lambda_function.users.invoke_arn,    auth = false },
    "POST-users-login"             = { method = "POST",   resource_id = aws_api_gateway_resource.users_login.id,                  lambda_arn = aws_lambda_function.users.invoke_arn,    auth = false },
    "GET-users-auth-debug"         = { method = "GET",    resource_id = aws_api_gateway_resource.users_auth_debug.id,             lambda_arn = aws_lambda_function.users.invoke_arn,    auth = false },
    "GET-users-id"                 = { method = "GET",    resource_id = aws_api_gateway_resource.users_id.id,                     lambda_arn = aws_lambda_function.users.invoke_arn,    auth = true  },
    "PATCH-users-id-role"          = { method = "PATCH",  resource_id = aws_api_gateway_resource.users_id_role.id,                lambda_arn = aws_lambda_function.users.invoke_arn,    auth = true  },

    # Flights — search is public; seat map requires auth
    "POST-flights-search"          = { method = "POST",   resource_id = aws_api_gateway_resource.flights_search.id,               lambda_arn = aws_lambda_function.flights.invoke_arn,  auth = false },
    "GET-flights-own-today"        = { method = "GET",    resource_id = aws_api_gateway_resource.flights_own_today.id,            lambda_arn = aws_lambda_function.flights.invoke_arn,  auth = true  },
    "GET-flights-id"               = { method = "GET",    resource_id = aws_api_gateway_resource.flights_id.id,                   lambda_arn = aws_lambda_function.flights.invoke_arn,  auth = false },
    "GET-flights-id-seats"         = { method = "GET",    resource_id = aws_api_gateway_resource.flights_id_seats.id,             lambda_arn = aws_lambda_function.flights.invoke_arn,  auth = true  },

    # Bookings — all require auth
    "POST-bookings"                = { method = "POST",   resource_id = aws_api_gateway_resource.bookings.id,                     lambda_arn = aws_lambda_function.bookings.invoke_arn, auth = true  },
    "GET-bookings"                 = { method = "GET",    resource_id = aws_api_gateway_resource.bookings.id,                     lambda_arn = aws_lambda_function.bookings.invoke_arn, auth = true  },
    "GET-bookings-id"              = { method = "GET",    resource_id = aws_api_gateway_resource.bookings_id.id,                  lambda_arn = aws_lambda_function.bookings.invoke_arn, auth = true  },
    "DELETE-bookings-id"           = { method = "DELETE", resource_id = aws_api_gateway_resource.bookings_id.id,                  lambda_arn = aws_lambda_function.bookings.invoke_arn, auth = true  },

    # Check-in — all require auth
    "GET-checkin"                  = { method = "GET",    resource_id = aws_api_gateway_resource.checkin.id,                      lambda_arn = aws_lambda_function.checkin.invoke_arn,  auth = true  },
    "POST-checkin"                 = { method = "POST",   resource_id = aws_api_gateway_resource.checkin.id,                      lambda_arn = aws_lambda_function.checkin.invoke_arn,  auth = true  },
    "GET-checkin-id-boarding-pass" = { method = "GET",    resource_id = aws_api_gateway_resource.checkin_id_boarding_pass.id,     lambda_arn = aws_lambda_function.checkin.invoke_arn,  auth = true  },
    "GET-checkin-flight-id"        = { method = "GET",    resource_id = aws_api_gateway_resource.checkin_flight_id.id,            lambda_arn = aws_lambda_function.checkin.invoke_arn,  auth = true  },

    # Gate — all require auth
    "GET-gate-flights"             = { method = "GET",    resource_id = aws_api_gateway_resource.gate_flights.id,                 lambda_arn = aws_lambda_function.gate.invoke_arn,     auth = true  },
    "GET-gate-flights-id"          = { method = "GET",    resource_id = aws_api_gateway_resource.gate_flights_id.id,              lambda_arn = aws_lambda_function.gate.invoke_arn,     auth = true  },
    "PATCH-gate-flights-id-status" = { method = "PATCH",  resource_id = aws_api_gateway_resource.gate_flights_id_status.id,       lambda_arn = aws_lambda_function.gate.invoke_arn,     auth = true  },
    "POST-gate-flights-id-board"   = { method = "POST",   resource_id = aws_api_gateway_resource.gate_flights_id_board.id,        lambda_arn = aws_lambda_function.gate.invoke_arn,     auth = true  },
    "GET-gate-flights-id-manifest" = { method = "GET",    resource_id = aws_api_gateway_resource.gate_flights_id_manifest.id,     lambda_arn = aws_lambda_function.gate.invoke_arn,     auth = true  },

    # Admin — all require auth
    "GET-admin-stats"              = { method = "GET",    resource_id = aws_api_gateway_resource.admin_stats.id,                  lambda_arn = aws_lambda_function.admin.invoke_arn,    auth = true  },
    "GET-admin-users"              = { method = "GET",    resource_id = aws_api_gateway_resource.admin_users.id,                  lambda_arn = aws_lambda_function.admin.invoke_arn,    auth = true  },
    "GET-admin-users-id"           = { method = "GET",    resource_id = aws_api_gateway_resource.admin_users_id.id,               lambda_arn = aws_lambda_function.admin.invoke_arn,    auth = true  },
    "PATCH-admin-users-id-role"    = { method = "PATCH",  resource_id = aws_api_gateway_resource.admin_users_id_role.id,          lambda_arn = aws_lambda_function.admin.invoke_arn,    auth = true  },
    "DELETE-admin-users-id"        = { method = "DELETE", resource_id = aws_api_gateway_resource.admin_users_id.id,               lambda_arn = aws_lambda_function.admin.invoke_arn,    auth = true  },
    "GET-admin-flights"            = { method = "GET",    resource_id = aws_api_gateway_resource.admin_flights.id,                lambda_arn = aws_lambda_function.admin.invoke_arn,    auth = true  },

    # Admin integrations — admin only (enforced by handler)
    "GET-admin-integrations"           = { method = "GET",    resource_id = aws_api_gateway_resource.admin_integrations.id,           lambda_arn = aws_lambda_function.integrations.invoke_arn, auth = true  },
    "PUT-admin-integrations-kind"      = { method = "PUT",    resource_id = aws_api_gateway_resource.admin_integrations_kind.id,      lambda_arn = aws_lambda_function.integrations.invoke_arn, auth = true  },
    "DELETE-admin-integrations-kind"   = { method = "DELETE", resource_id = aws_api_gateway_resource.admin_integrations_kind.id,      lambda_arn = aws_lambda_function.integrations.invoke_arn, auth = true  },
    "POST-admin-integrations-kind-test" = { method = "POST",  resource_id = aws_api_gateway_resource.admin_integrations_kind_test.id, lambda_arn = aws_lambda_function.integrations.invoke_arn, auth = true  },

    # Planning — flight_planner / admin only (enforced by handler)
    "GET-planning-plan"            = { method = "GET",    resource_id = aws_api_gateway_resource.planning_flight_plans_id.id,         lambda_arn = aws_lambda_function.planning.invoke_arn, auth = true  },
    "PUT-planning-plan"            = { method = "PUT",    resource_id = aws_api_gateway_resource.planning_flight_plans_id.id,         lambda_arn = aws_lambda_function.planning.invoke_arn, auth = true  },
    "GET-planning-reviews"         = { method = "GET",    resource_id = aws_api_gateway_resource.planning_flight_plans_id_reviews.id, lambda_arn = aws_lambda_function.planning.invoke_arn, auth = true  },
    "POST-planning-reviews"        = { method = "POST",   resource_id = aws_api_gateway_resource.planning_flight_plans_id_reviews.id, lambda_arn = aws_lambda_function.planning.invoke_arn, auth = true  },
    "GET-planning-rejections"      = { method = "GET",    resource_id = aws_api_gateway_resource.planning_rejection_comments.id,      lambda_arn = aws_lambda_function.planning.invoke_arn, auth = true  },
    "GET-planning-eod-stats"       = { method = "GET",    resource_id = aws_api_gateway_resource.planning_eod_stats.id,               lambda_arn = aws_lambda_function.planning.invoke_arn, auth = true  },
  }
}

resource "aws_api_gateway_method" "routes" {
  for_each = local.routes

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = each.value.resource_id
  http_method   = each.value.method
  authorization = each.value.auth ? "CUSTOM" : "NONE"
  authorizer_id = each.value.auth ? aws_api_gateway_authorizer.jwt.id : null
}

resource "aws_api_gateway_integration" "routes" {
  for_each = local.routes

  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = each.value.resource_id
  http_method             = aws_api_gateway_method.routes[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = each.value.lambda_arn

  depends_on = [aws_api_gateway_method.routes]
}

# ── Deployment & Stage ────────────────────────────────────────────────────────
resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id

  # IMPORTANT: include the authorizer in the trigger hash. Without it,
  # changes to identity_source / authorizer_uri / TTL don't cause a fresh
  # deployment and the stage keeps serving the old config — which silently
  # 401s every authed request when identity_source requires headers the
  # client doesn't send.
  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_method.routes,
      aws_api_gateway_integration.routes,
      aws_api_gateway_authorizer.jwt,
    ]))
  }

  lifecycle { create_before_destroy = true }
  depends_on = [aws_api_gateway_integration.routes]
}

resource "aws_api_gateway_stage" "main" {
  deployment_id = aws_api_gateway_deployment.main.id
  rest_api_id   = aws_api_gateway_rest_api.main.id
  stage_name    = var.environment

  # The account-level CloudWatch role must exist BEFORE API Gateway will let
  # us enable access logging on a stage — without depends_on, Terraform tries
  # to update the stage in parallel with the account setting and AWS rejects
  # with "CloudWatch Logs role ARN must be set in account settings".
  depends_on = [aws_api_gateway_account.main]

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw_access.arn
    # JSON-formatted access log — every request shows up with status, latency,
    # path, method, authorizer principalId/role, and the raw error if a 4xx/5xx.
    format = jsonencode({
      requestTime         = "$context.requestTime"
      requestId           = "$context.requestId"
      httpMethod          = "$context.httpMethod"
      path                = "$context.path"
      status              = "$context.status"
      responseLength      = "$context.responseLength"
      integrationLatency  = "$context.integrationLatency"
      integrationStatus   = "$context.integrationStatus"
      integrationErrorMsg = "$context.integration.error"
      authorizerError     = "$context.authorizer.error"
      authorizerStatus    = "$context.authorizer.status"
      principalId         = "$context.authorizer.principalId"
      role                = "$context.authorizer.role"
    })
  }

  tags = { Name = "${local.name}-stage" }
}

# Per-stage access log group (separate from the Lambda log groups). Retains 14 days.
resource "aws_cloudwatch_log_group" "apigw_access" {
  name              = "/aws/apigateway/${local.name}-access"
  retention_in_days = 14
  tags              = { Name = "${local.name}-apigw-access" }
}

# API Gateway needs a separate IAM role at the *account* level to write to
# CloudWatch. This is a one-per-account setting; declaring it here is
# idempotent — Terraform will leave an existing setting in place.
resource "aws_iam_role" "apigw_cloudwatch" {
  name = "${local.name}-apigw-cloudwatch"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "apigateway.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "apigw_cloudwatch" {
  role       = aws_iam_role.apigw_cloudwatch.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

resource "aws_api_gateway_account" "main" {
  cloudwatch_role_arn = aws_iam_role.apigw_cloudwatch.arn
}

# ── Lambda permissions for API Gateway ───────────────────────────────────────
locals {
  lambda_permissions = {
    users        = aws_lambda_function.users.function_name
    flights      = aws_lambda_function.flights.function_name
    bookings     = aws_lambda_function.bookings.function_name
    checkin      = aws_lambda_function.checkin.function_name
    gate         = aws_lambda_function.gate.function_name
    admin        = aws_lambda_function.admin.function_name
    planning     = aws_lambda_function.planning.function_name
    integrations = aws_lambda_function.integrations.function_name
    authorizer   = aws_lambda_function.authorizer.function_name
  }
}

resource "aws_lambda_permission" "apigw" {
  for_each = local.lambda_permissions

  statement_id  = "AllowAPIGateway-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = each.value
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}
