# ResQLink API Documentation (Phase 1–4)

Base URL: `http://localhost:8000/api`

All endpoints except auth login/refresh require `Authorization: Bearer <access_token>`.

---

## Authentication

### POST /auth/login/

```json
{ "email": "demo.dispatcher@resqlink.local", "password": "DemoPass123!" }
```

Response:

```json
{
  "access": "<jwt>",
  "refresh": "<jwt>",
  "user": { "id": 1, "email": "...", "name": "...", "role": "DISPATCHER", "organization": 1 }
}
```

### POST /auth/refresh/

```json
{ "refresh": "<refresh_token>" }
```

### POST /auth/logout/

```json
{ "refresh": "<refresh_token>" }
```

### GET /auth/me/

Returns current user profile.

---

## Users (Admin only)

| Method | Path | Description |
|--------|------|-------------|
| GET | /users/ | List users |
| POST | /users/ | Create user |
| GET | /users/{id}/ | Retrieve user |
| PATCH | /users/{id}/ | Update user |

---

## Organizations

| Method | Path | Description |
|--------|------|-------------|
| GET | /organizations/ | List (authenticated) |
| POST | /organizations/ | Create (admin) |
| GET/PATCH/DELETE | /organizations/{id}/ | Admin for write |

---

## Emergencies (Dispatcher/Admin)

### POST /emergencies/

```json
{
  "latitude": "12.971600",
  "longitude": "77.594600",
  "age": 45,
  "emergency_type": "CARDIAC",
  "reported_conditions": ["chest_pain"],
  "vital_data": { "heart_rate": 110, "spo2": 94 }
}
```

Creates emergency with status `CREATED` and `EMERGENCY_CREATED` event.

### POST /emergencies/{id}/verify/

```json
{ "verified_priority": "HIGH" }
```

Dispatcher sets verified priority. Status becomes `VERIFIED`. Creates `EMERGENCY_VERIFIED` event.

### PATCH /emergencies/{id}/status/

```json
{ "status": "AMBULANCE_ASSIGNMENT" }
```

Validates state machine transitions.

---

## Ambulances

| Method | Path | Description |
|--------|------|-------------|
| GET | /ambulances/ | List (role-scoped) |
| POST | /ambulances/ | Create (dispatcher/admin) |
| GET/PATCH | /ambulances/{id}/ | View/update |
| PATCH | /ambulances/{id}/status/ | Update status |
| PUT/PATCH | /ambulances/{id}/equipment/ | Manage equipment list |
| POST | /ambulances/assign/ | Assign ambulance (body: `emergency_id`, `ambulance_id`) |

Assignment returns **409 Conflict** if ambulance is no longer available.

---

## Hospitals

| Method | Path | Description |
|--------|------|-------------|
| GET | /hospitals/ | List |
| POST | /hospitals/ | Create (admin) |
| GET/PATCH | /hospitals/{id}/ | View/update |
| PATCH | /hospitals/{id}/resources/ | Update resources |

Resource update body (array):

```json
[
  { "resource_type": "ICU_BED", "total": 10, "available": 5 }
]
```

Negative `available` values are rejected.

---

## Optimization

### POST /optimization/ambulance/

```json
{
  "emergency_id": 1,
  "strategy": "intelligent",
  "required_capability": "ADVANCED",
  "required_equipment": ["defibrillator", "oxygen"]
}
```

`strategy`: `baseline` | `intelligent`

Response:

```json
{
  "strategy": "intelligent",
  "emergency_id": 1,
  "candidates": [
    {
      "ambulance": "A17",
      "ambulance_id": 17,
      "rank": 1,
      "score": 0.21,
      "eta_minutes": 7,
      "distance_km": 4.2,
      "capability_match": true,
      "equipment_match": true,
      "reason": ["Required capability available", "Low ETA"]
    }
  ]
}
```

### POST /optimization/hospital/

```json
{
  "emergency_id": 1,
  "strategy": "intelligent",
  "required_resources": [
    { "resource_type": "ICU_BED", "quantity": 2 }
  ]
}
```

Response includes ranked hospitals with `reasons`, `capacity`, `resource_match`.

---

## Error Responses

| Code | Meaning |
|------|---------|
| 400 | Validation / invalid state transition |
| 401 | Unauthenticated |
| 403 | Permission denied |
| 404 | Not found |
| 409 | Resource conflict (concurrent assignment) |
