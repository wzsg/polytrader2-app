# Remote Access

`@polytrader/remote-access` exposes the small WebSocket protocol used when a mobile client needs an operation backed by secrets held by the desktop app.

Public event and market discovery does not belong in this protocol. Mobile clients should query the existing public service directly.

## Transport

- WebSocket request/response messages encoded as JSON
- One response for every request, correlated by `id`
- The first request on every connection must be `auth`
- A reconnecting client must keep its `deviceId` and retry an uncertain request with the same request `id`
- The server caches responses by `deviceId` and request `id`, so a retried write is not executed twice
- Reusing an `id` for a different payload returns `REQUEST_ID_CONFLICT`

## Methods

| Method              | Purpose                                                  | Write |
| ------------------- | -------------------------------------------------------- | ----- |
| `auth`              | Authenticate a device and negotiate the protocol version | No    |
| `ping`              | Check liveness                                           | No    |
| `wallet.list`       | List safe wallet metadata                                | No    |
| `wallet.getBalance` | Refresh and return a wallet balance                      | No    |
| `order.list`        | Query wallet orders                                      | No    |
| `order.place`       | Place a limit or market order                            | Yes   |
| `order.cancel`      | Cancel an order                                          | Yes   |

Raw private keys, API credentials, and generic signing are intentionally not exposed.

Write confirmation is optional and disabled by default. When enabled, callers must provide a `RemoteAccessConfirmationProvider`.

## Example

```json
{
  "id": "auth-1",
  "method": "auth",
  "params": { "protocolVersion": 1, "deviceId": "phone-1", "token": "secret" }
}
```

```json
{ "id": "balance-1", "method": "wallet.getBalance", "params": { "walletId": "wallet-1" } }
```
