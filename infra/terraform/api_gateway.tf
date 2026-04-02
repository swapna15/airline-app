# ── REST API ──────────────────────────────────────────────────────────────────
resource "aws_api_gateway_rest_api" "main" {
  name        = "${local.name}-api"
  description = "AirlineOS API Gateway"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = { Name = "${local.name}-api" }
}

# ── Lambda Token Authorizer ───────────────────────────────────────────────────
resource "aws_api_gateway_authorizer" "jwt" {
  name                             = "${local.name}-jwt-authorizer"
  rest_api_id                      = aws_api_gateway_rest_api.main.id
  authorizer_uri                   = aws_lambda_function.authorizer.invoke_arn
  authorizer_credentials           = aws_iam_role.apigw_invoke.arn
  type                             = "TOKEN"
  identity_source                  = "method.request.header.Authorization"
  authorizer_result_ttl_in_seconds = 300
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

# ── Method + Integration module ───────────────────────────────────────────────
# Define all routes as: [method, resource_id, lambda_function_arn, requires_auth]
locals {
  routes = [
    # Users — public (no authorizer)
    { method = "POST", resource_id = aws_api_gateway_resource.users_register.id,       lambda_arn = aws_lambda_function.users.invoke_arn,    auth = false },
    { method = "POST", resource_id = aws_api_gateway_resource.users_login.id,          lambda_arn = aws_lambda_function.users.invoke_arn,    auth = false },
    { method = "GET",  resource_id = aws_api_gateway_resource.users_id.id,             lambda_arn = aws_lambda_function.users.invoke_arn,    auth = true  },
    { method = "PATCH", resource_id = aws_api_gateway_resource.users_id_role.id,       lambda_arn = aws_lambda_function.users.invoke_arn,    auth = true  },

    # Flights — search is public; seat map requires auth
    { method = "POST", resource_id = aws_api_gateway_resource.flights_search.id,       lambda_arn = aws_lambda_function.flights.invoke_arn,  auth = false },
    { method = "GET",  resource_id = aws_api_gateway_resource.flights_id.id,           lambda_arn = aws_lambda_function.flights.invoke_arn,  auth = false },
    { method = "GET",  resource_id = aws_api_gateway_resource.flights_id_seats.id,     lambda_arn = aws_lambda_function.flights.invoke_arn,  auth = true  },

    # Bookings — all require auth
    { method = "POST",   resource_id = aws_api_gateway_resource.bookings.id,           lambda_arn = aws_lambda_function.bookings.invoke_arn, auth = true  },
    { method = "GET",    resource_id = aws_api_gateway_resource.bookings.id,           lambda_arn = aws_lambda_function.bookings.invoke_arn, auth = true  },
    { method = "GET",    resource_id = aws_api_gateway_resource.bookings_id.id,        lambda_arn = aws_lambda_function.bookings.invoke_arn, auth = true  },
    { method = "DELETE", resource_id = aws_api_gateway_resource.bookings_id.id,        lambda_arn = aws_lambda_function.bookings.invoke_arn, auth = true  },

    # Check-in — all require auth
    { method = "GET",  resource_id = aws_api_gateway_resource.checkin.id,              lambda_arn = aws_lambda_function.checkin.invoke_arn,  auth = true  },
    { method = "POST", resource_id = aws_api_gateway_resource.checkin.id,              lambda_arn = aws_lambda_function.checkin.invoke_arn,  auth = true  },
    { method = "GET",  resource_id = aws_api_gateway_resource.checkin_id_boarding_pass.id, lambda_arn = aws_lambda_function.checkin.invoke_arn, auth = true },
    { method = "GET",  resource_id = aws_api_gateway_resource.checkin_flight_id.id,    lambda_arn = aws_lambda_function.checkin.invoke_arn,  auth = true  },

    # Gate — all require auth
    { method = "GET",   resource_id = aws_api_gateway_resource.gate_flights.id,        lambda_arn = aws_lambda_function.gate.invoke_arn,     auth = true  },
    { method = "GET",   resource_id = aws_api_gateway_resource.gate_flights_id.id,     lambda_arn = aws_lambda_function.gate.invoke_arn,     auth = true  },
    { method = "PATCH", resource_id = aws_api_gateway_resource.gate_flights_id_status.id, lambda_arn = aws_lambda_function.gate.invoke_arn,  auth = true  },
    { method = "POST",  resource_id = aws_api_gateway_resource.gate_flights_id_board.id,  lambda_arn = aws_lambda_function.gate.invoke_arn,  auth = true  },
    { method = "GET",   resource_id = aws_api_gateway_resource.gate_flights_id_manifest.id, lambda_arn = aws_lambda_function.gate.invoke_arn, auth = true },

    # Admin — all require auth
    { method = "GET", resource_id = aws_api_gateway_resource.admin_stats.id,           lambda_arn = aws_lambda_function.admin.invoke_arn,    auth = true  },
    { method = "GET", resource_id = aws_api_gateway_resource.admin_users.id,           lambda_arn = aws_lambda_function.admin.invoke_arn,    auth = true  },
    { method = "GET", resource_id = aws_api_gateway_resource.admin_users_id.id,        lambda_arn = aws_lambda_function.admin.invoke_arn,    auth = true  },
    { method = "PATCH",  resource_id = aws_api_gateway_resource.admin_users_id_role.id, lambda_arn = aws_lambda_function.admin.invoke_arn,   auth = true  },
    { method = "DELETE", resource_id = aws_api_gateway_resource.admin_users_id.id,     lambda_arn = aws_lambda_function.admin.invoke_arn,    auth = true  },
    { method = "GET",    resource_id = aws_api_gateway_resource.admin_flights.id,      lambda_arn = aws_lambda_function.admin.invoke_arn,    auth = true  },
  ]
}

resource "aws_api_gateway_method" "routes" {
  for_each = { for i, r in local.routes : "${r.method}-${r.resource_id}" => r }

  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = each.value.resource_id
  http_method   = each.value.method
  authorization = each.value.auth ? "CUSTOM" : "NONE"
  authorizer_id = each.value.auth ? aws_api_gateway_authorizer.jwt.id : null
}

resource "aws_api_gateway_integration" "routes" {
  for_each = { for i, r in local.routes : "${r.method}-${r.resource_id}" => r }

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

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_method.routes,
      aws_api_gateway_integration.routes,
    ]))
  }

  lifecycle { create_before_destroy = true }
  depends_on = [aws_api_gateway_integration.routes]
}

resource "aws_api_gateway_stage" "main" {
  deployment_id = aws_api_gateway_deployment.main.id
  rest_api_id   = aws_api_gateway_rest_api.main.id
  stage_name    = var.environment

  tags = { Name = "${local.name}-stage" }
}

# ── Lambda permissions for API Gateway ───────────────────────────────────────
locals {
  lambda_permissions = {
    users    = aws_lambda_function.users.function_name
    flights  = aws_lambda_function.flights.function_name
    bookings = aws_lambda_function.bookings.function_name
    checkin  = aws_lambda_function.checkin.function_name
    gate     = aws_lambda_function.gate.function_name
    admin    = aws_lambda_function.admin.function_name
    authorizer = aws_lambda_function.authorizer.function_name
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
