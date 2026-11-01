# API

Base path `/api/v1`. JSON only. Every success response uses one envelope:

```json
{
  "data": {},
  "meta": {
    "asOf": "2026-11-01T07:00:00.000Z",
    "source": "snapshot",
    "isEstimated": true,
    "snapshotId": 2,
    "freshness": "recent",
    "budgetLimited": false
  }
}
```

`meta` is rule N4: how old the data is (`asOf`, `freshness`), where it came from
(`source`: `snapshot`, `static`, `replay`), and whether positions are estimated.
The UI shows all three. Errors use `{ "error": { "code", "message", "details?" } }`
with codes `NOT_FOUND`, `VALIDATION`, `BUDGET_EXHAUSTED`, `PROVIDER_DOWN`,
`UNAUTHORIZED`, `RATE_LIMITED`, `INTERNAL`.

Read endpoints never spend a provider request. When the budget is exhausted they
still return saved data, with an old `asOf` and `budgetLimited: true`.

| Method and path | Purpose | Provider cost |
| --- | --- | --- |
| `GET /health` | Service status, provider mode, server time | 0 |
| `GET /corridors` | Active corridors | 0 |
| `GET /corridors/:slug` | Corridor with ordered stations, trains and snapshot counts | 0 |
| `GET /corridors/:slug/map?snapshot=latest\|<id>&at=<iso>` | Trains with estimated positions at an instant | 0 |
| `GET /corridors/:slug/snapshots?date=YYYY-MM-DD` | Recorded snapshot times for replay | 0 |
| `GET /search?q=` | Trains and stations from our own database | 0 |
| `GET /trains/:number` | Timetable, latest observation, position, reason, history | 0 |
| `GET /trains/:number/nearby?snapshot=<id>` | Ahead, behind and opposite trains within 50 km | 0 |
| `POST /share` | Create an anonymous share code (7 days) | 0 |
| `GET /share/:code` | Read-only status for a share page | 0 |
| `GET /admin/budget` | Used, left, allowance and the last 20 calls (admin token) | 0 |
| `POST /admin/snapshot` | Take one snapshot now, if the guard allows (admin token) | 1 |

Admin routes need `x-admin-token: <ADMIN_TOKEN>` or `Authorization: Bearer <token>`.
An empty `ADMIN_TOKEN` closes them rather than opening them.

## Examples

`GET /api/v1/corridors/delhi-kanpur/map`

```json
{
  "data": {
    "corridor": { "id": 1, "slug": "delhi-kanpur", "name": "Delhi — Kanpur", "nameHi": "दिल्ली — कानपुर", "isActive": true },
    "stations": [{ "seq": 0, "kmFromStart": 0, "station": { "code": "NDLS", "name": "New Delhi", "lat": 28.6431, "lng": 77.2197 } }],
    "trains": [
      {
        "trainNumber": "64101",
        "trainName": "Kanpur MEMU",
        "lat": 28.653,
        "lng": 77.335,
        "bearingDeg": 84.37,
        "progress": 0.529,
        "currentStation": "NDLS",
        "nextStation": "GZB",
        "delayMin": 28,
        "delayLevel": "major",
        "isStale": false,
        "minsToNextStation": 16,
        "direction": "down",
        "speedKph": 48,
        "observation": {
          "snapshotId": 2,
          "trainNumber": "64101",
          "takenAt": "2026-11-01T07:00:00.000Z",
          "currentStation": "NDLS",
          "nextStation": "GZB",
          "minsIntoSegment": 18,
          "segmentMinutes": 34,
          "delayMin": 28
        }
      }
    ],
    "snapshot": { "id": 2, "scope": "corridor:delhi-kanpur", "takenAt": "2026-11-01T07:00:00.000Z" }
  },
  "meta": { "asOf": "2026-11-01T07:00:00.000Z", "source": "snapshot", "isEstimated": true, "snapshotId": 2, "freshness": "recent", "budgetLimited": false }
}
```

The `observation` block is what lets the browser move a marker between refreshes
with the same `estimatePosition` function the API used (section 12).

`GET /api/v1/trains/64101` includes `reason` and the evidence it used:

```json
"reason": {
  "rule": "R1",
  "label": "likely",
  "evidence": { "gapMin": 30, "previousDelayMin": 18, "currentDelayMin": 28, "blockedByTrain": "12002", "distanceKm": 6.4 }
}
```

`reasonAvailable: false` with `reason: null` means the last two snapshots are
more than 30 minutes apart; the UI then prints "Not enough fresh data to
estimate a reason" instead of guessing.

## Input validation

Every input is parsed with a schema from `packages/shared`:

- `trainNumber` must be 4 or 5 digits,
- `snapshot` and `at` are mutually exclusive,
- `q` must be 1 to 64 characters (the UI waits for two),
- share codes are 6 to 64 characters.

A validation failure is a `400` with code `VALIDATION` and the first five zod
issues in `details`.
