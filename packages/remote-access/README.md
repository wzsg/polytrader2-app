# Remote Access

`@polytrader/remote-access` provides the outbound desktop WebSocket client used when a mobile client needs an operation backed by secrets held by the desktop app.

Public event and market discovery does not belong in this protocol. Mobile clients should query the existing public service directly.

## Topology

```text
Mobile WebSocket client
          |
Remote Tunnel / relay server
          |
Desktop WebSocket client (outbound connection)
          |
Local wallets and Polymarket credentials
```

The desktop does not listen on a local port. It initiates and maintains a connection to the configured Tunnel endpoint.

## Transport

- WebSocket request/response messages encoded as JSON
- One response for every request, correlated by `id`
- The desktop authenticates immediately after every connection
- The desktop reconnects with exponential backoff when the connection is lost
- The relay retries an uncertain request with the same request `id`
- The desktop caches responses by request `id`, so a retried write is not executed twice
- Reusing an `id` for a different payload returns `REQUEST_ID_CONFLICT`

## Methods handled by the desktop

| Method              | Purpose                             | Write |
| ------------------- | ----------------------------------- | ----- |
| `ping`              | Check desktop liveness              | No    |
| `wallet.list`       | List safe wallet metadata           | No    |
| `wallet.getBalance` | Refresh and return a wallet balance | No    |
| `order.list`        | Query wallet orders                 | No    |
| `order.place`       | Place a limit or market order       | Yes   |
| `order.cancel`      | Cancel an order                     | Yes   |

Raw private keys, API credentials, and generic signing are intentionally not exposed.

Write confirmation is optional and disabled by default. When enabled, callers must provide a `RemoteAccessConfirmationProvider`.

## Authentication handshake

After connecting, the desktop sends:

```json
{
  "id": "auth:...",
  "method": "auth",
  "params": { "protocolVersion": 1, "deviceId": "desktop-1", "token": "secret" }
}
```

The relay responds with the same `id` before forwarding operation requests:

```json
{ "id": "auth:...", "ok": true, "data": { "protocolVersion": 1, "deviceId": "desktop-1" } }
```
