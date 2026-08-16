# ResQLink Architecture (Phase 1–4)

> **Disclaimer:** ResQLink is a software prototype / simulation system. It is NOT a medical diagnosis system and must NOT replace doctors, paramedics, dispatchers, or hospital professionals. AI recommendations remain decision support only. Use synthetic/demo data only.

## System Overview

ResQLink is a modular Django monolith with a React/TypeScript frontend. Phase 1–4 establishes core emergency management, authentication, CRUD APIs, and optimization algorithms.

```
┌─────────────────┐     REST/JWT      ┌──────────────────────────────────┐
│  React Frontend │ ◄──────────────► │  Django Monolith (DRF)            │
│  (Vite + TS)    │                   │  accounts | emergencies | ...    │
└─────────────────┘                   └──────────────┬───────────────────┘
                                                     │
                                                     ▼
                                            ┌────────────────┐
                                            │  PostgreSQL    │
                                            └────────────────┘
```

## Django Apps

| App | Responsibility |
|-----|----------------|
| `config` | Project settings, URLs, exception handling |
| `accounts` | Custom User, Organization, JWT auth |
| `emergencies` | Emergency lifecycle, events, verification |
| `ambulances` | Ambulance fleet, equipment, assignment |
| `hospitals` | Hospital profiles, resource capacity |
| `dispatch` | Basic Dispatch model (workflow in Prompt 2) |
| `optimization` | Ambulance/hospital ranking algorithms |
| `realtime` | Placeholder for WebSocket tracking |
| `simulation` | Demo data seeding |
| `analytics` | Placeholder for reporting |
| `ml` | Placeholder for AI screening |

## Database Relationships

- `Organization` 1—N `User`, `Ambulance`, `Hospital`
- `Emergency` N—1 `User` (created_by, verified_by)
- `Emergency` 1—N `EmergencyEvent`
- `Ambulance` 1—N `AmbulanceEquipment`
- `Ambulance` N—1 `Emergency` (current_emergency)
- `Hospital` 1—N `HospitalResource`
- `Dispatch` links Emergency + Ambulance + Hospital + Dispatcher

## Authentication Flow

1. Client POSTs credentials to `/api/auth/login/`
2. Server returns JWT access + refresh tokens (SimpleJWT)
3. Client sends `Authorization: Bearer <access>` on API calls
4. Refresh via `/api/auth/refresh/`
5. Logout blacklists refresh token via `/api/auth/logout/`
6. Current user profile at `/api/auth/me/`

## Role Permissions

| Role | Access |
|------|--------|
| ADMIN | Full access |
| DISPATCHER | Emergencies, ambulances, hospitals (read), optimization, verify |
| AMBULANCE_OPERATOR | Own-org ambulances, status/equipment updates |
| HOSPITAL_STAFF | Own-org hospital, resource updates |

Non-admin users are scoped to their organization where applicable.

## Emergency Lifecycle

```
CREATED → UNDER_REVIEW → VERIFIED → AMBULANCE_ASSIGNMENT → HOSPITAL_SELECTION
→ HOSPITAL_PENDING → DISPATCHED → EN_ROUTE → ARRIVED → HANDOVER → COMPLETED
                                                              ↘ CANCELLED
```

Invalid transitions are rejected by `emergencies/state_machine.py` and `emergencies/services.py`.

## Ambulance Lifecycle

```
AVAILABLE ↔ ASSIGNED → ACCEPTED → EN_ROUTE → ARRIVED → AVAILABLE
AVAILABLE ↔ UNAVAILABLE / MAINTENANCE
```

Assignment uses `select_for_update()` to prevent double-booking.

## Hospital Lifecycle

```
OPERATIONAL ↔ LIMITED ↔ CLOSED
```

Emergency department status: OPEN, OVERCROWDED, DIVERT.

## Service Layer

Business logic lives in service modules, not views:

- `emergencies/services.py` — create, verify, transition, events
- `ambulances/services.py` — CRUD helpers, assignment, equipment
- `hospitals/services.py` — resource updates with validation
- `optimization/ambulance.py` — ranking algorithms
- `optimization/hospital.py` — ranking algorithms

Views handle HTTP, permissions, and serialization only.

## Future WebSocket Architecture

The `realtime` app will host Django Channels consumers for:

- Ambulance GPS position streaming
- Emergency status broadcasts
- Hospital readiness notifications

Phase 1 uses REST only.

## Future AI Architecture

The `ml` app will expose a screening endpoint invoked after emergency creation:

- Populate `ai_risk_score` and `ai_priority`
- Results remain decision support for dispatcher verification

Phase 1 leaves AI fields null.

## Future Simulation Architecture

The `simulation` app will run scenario scripts that inject synthetic emergencies and update entity positions over time. Phase 1 includes `seed_demo_data` only.
