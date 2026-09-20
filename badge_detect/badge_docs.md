# AI-Badge HTTP API

Control the badge's LEDs and the "% AI" score shown on its screen over your local network. Any Windows backend (or anything that can send an HTTP request) can use it.

## Connecting

- **Base URL:** `http://<badge-ip>` (port 80, plain HTTP, no HTTPS). The IP is shown at the bottom of the badge screen.
- The backend machine and the badge must be on the **same WiFi network**. Networks with "client isolation" (common on event/guest WiFi) block device-to-device traffic. Test with `ping <badge-ip>`.
- The IP can change after a reboot. Reserve a fixed IP for the badge in your router (DHCP reservation), or read it off the screen. `http://badge.local` may work on Windows 10/11, but use the IP for anything important.
- There is **no authentication**. Only use it on a network you trust.

## Endpoints

| Method | Path          | What it does                               |
| ------ | ------------- | ------------------------------------------ |
| GET    | `/api/status` | Current LED state, AI score, IP and uptime |
| GET    | `/api/led`    | Current LED state                          |
| POST   | `/api/led`    | Set the LED state                          |
| GET    | `/api/score`  | Current AI score                           |
| POST   | `/api/score`  | Set the AI score                           |

**Conventions**

- Send values as a JSON body with `Content-Type: application/json`. A query string (`?state=red`) or form body also works.
- A `GET` with a value in the query string also sets it (handy for testing in a browser): `http://<badge-ip>/api/led?state=red`.
- Every response is JSON. Success is HTTP 200 with `"ok": true`. Errors are HTTP 400 (bad or missing value) or 404 (unknown path) with `"ok": false` and an `"error"` message.

## LED states

| `state`       | What the LEDs do                       |
| ------------- | -------------------------------------- | --- |
| `off`         | All LEDs off                           |
| `yellow`      | Solid yellow                           |
| `green`       | Solid green                            | w   |
| `red`         | Solid red                              |
| `flash_red`   | Red blinking (250 ms on, 250 ms off)   |
| `flash_green` | Green blinking (250 ms on, 250 ms off) |

Names are case-insensitive, and `-` or a space is treated as `_` (so `Flash-Red` works). The older names `flash` (= `flash_red`) and `flashgreen` (= `flash_green`) are also accepted. The state stays until you change it and resets to `off` if the badge reboots.

### Set the LED state

`POST /api/led`

```json
{ "state": "flash_red" }
```

Response:

```json
{ "ok": true, "led": "flash_red" }
```

### Read the LED state

`GET /api/led`

```json
{ "ok": true, "led": "flash_red" }
```

## AI score

The score is a number from **0 to 100**. The screen shows it as `87% AI`, in **red at 50 and above** and **green below 50**. Decimals are rounded to the nearest whole number (`87.6` becomes `88`). Anything non-numeric or outside 0-100 returns HTTP 400. After a reboot the score goes back to the sketch's default (87).

### Set the score

`POST /api/score`

```json
{ "score": 87 }
```

Response:

```json
{ "ok": true, "score": 87 }
```

### Read the score

`GET /api/score`

```json
{ "ok": true, "score": 87 }
```

## Status

`GET /api/status`

```json
{
  "ok": true,
  "led": "flash_red",
  "score": 87,
  "ip": "192.168.1.50",
  "uptime_s": 1234
}
```

`uptime_s` is seconds since boot. It is useful as a heartbeat, and if it drops back to a small number, the badge has rebooted and lost its LED state and score.
