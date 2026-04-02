# /run-agent

Invoke an AirlineOS agent directly from the Claude Code CLI.

## Usage
```
/run-agent <agent-name> "<message>"
```

## Available Agents
| Agent | Description | Example |
|-------|-------------|---------|
| `search` | Parse NL query into SearchParams | "cheap flights NYC to Tokyo next month" |
| `recommend` | Recommend seat/class | "I'm 6'4\" on a 14-hour flight, what class?" |
| `support` | Answer policy/FAQ questions | "What's the baggage allowance for economy?" |
| `disruption` | Handle disruption scenarios | "My flight is delayed 4 hours, what are my options?" |

## What this does
Calls `POST /api/agents` with the agent name and message, then prints the agent's response.

Example invocation:
```
/run-agent search "I need a flight from London to Singapore on April 15 for 2 adults in business class"
```

Expected output:
```json
{
  "origin": { "code": "LHR", "city": "London" },
  "destination": { "code": "SIN", "city": "Singapore" },
  "departureDate": "2026-04-15",
  "passengers": { "adults": 2, "children": 0, "infants": 0 },
  "class": "business",
  "tripType": "oneWay"
}
```
