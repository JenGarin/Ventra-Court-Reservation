# Backend Step 1: API + Roles Contract

This document defines the first backend deliverable:
- Role-based access rules (RBAC)
- API endpoints for current frontend flows
- Request/response payload contract
- Error format

It is based on current app behavior in:
- `src/context/AppContext.tsx`
- `src/types/index.ts`
- UI flows in `src/app/components/*`

## 1) Roles and Access Matrix

Roles:
- `admin`
- `staff`
- `coach`
- `player`

Access policy (high level):

| Capability | admin | staff | coach | player |
|---|---|---|---|---|
| Sign in / sign out | yes | yes | yes | yes |
| View own profile | yes | yes | yes | yes |
| Edit own profile | yes | yes | yes | yes |
| View all users | yes | yes | no | no |
| Edit users (role/status/profile) | yes | yes (limited) | no | no |
| Delete users | yes | staff no | no | no |
| View courts | yes | yes | yes | yes |
| Create/update/delete courts | yes | yes | no | no |
| View pricing plans | yes | yes | yes | yes |
| Edit pricing plans | yes | no | no | no |
| Create booking | yes | yes | yes | yes |
| Approve/reject booking request | yes | yes | no | no |
| View own bookings | yes | yes | yes | yes |
| View all bookings | yes | yes | coach only own sessions | player no |
| Check-in (scan/manual verify) | yes | yes | no | no |
| View analytics/reports | yes | staff (read-only) | no | no |
| Coach session CRUD | no | no | yes | no |
| Join open/training session | no | no | no | yes |

Notes:
- Staff limitations should be explicit in middleware (ex: cannot delete users, cannot edit pricing).
- Coach can only manage sessions where `booking.userId = auth.user.id`.
- Player can only access records where `booking.userId = auth.user.id` unless joining open/training session.

## 2) Global API Conventions

Base URL:
- `/api/v1`

Auth:
- Supabase JWT in `Authorization: Bearer <token>`

JSON response envelope:

```json
{
  "success": true,
  "data": {},
  "meta": {},
  "error": null
}
```

Error envelope:

```json
{
  "success": false,
  "data": null,
  "meta": null,
  "error": {
    "code": "ROLE_MISMATCH",
    "message": "This account is not an admin account.",
    "details": {}
  }
}
```

Standard error codes:
- `UNAUTHENTICATED`
- `FORBIDDEN`
- `ROLE_MISMATCH`
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `CONFLICT`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

## 3) Endpoint Contract by Module

## 3.1 Auth

### `POST /auth/login`
Purpose:
- Login with role validation (matches current UI role picker behavior).

Request:

```json
{
  "email": "admin@court.com",
  "password": "admin",
  "expectedRole": "admin"
}
```

Response success:

```json
{
  "success": true,
  "data": {
    "accessToken": "jwt",
    "refreshToken": "jwt",
    "user": {
      "id": "uuid",
      "email": "admin@court.com",
      "name": "Admin User",
      "role": "admin"
    }
  }
}
```

Response role mismatch:

```json
{
  "success": false,
  "error": {
    "code": "ROLE_MISMATCH",
    "message": "This account is not an admin account."
  }
}
```

### `POST /auth/signup`
Request:

```json
{
  "email": "newuser@email.com",
  "password": "strong-password",
  "role": "player"
}
```

Behavior:
- Creates auth account + user profile row.
- Does not auto-login if app expects redirect back to sign in.

### `POST /auth/oauth/start`
Request:

```json
{
  "provider": "google",
  "expectedRole": "player"
}
```

Behavior:
- Returns redirect URL or starts OAuth flow server-side.
- Persist expected role in secure state parameter.

### `POST /auth/logout`
Behavior:
- Invalidates refresh token/session.

## 3.2 Users / Profile

### `GET /users/me`
Returns current profile.

### `PATCH /users/me`
Allowed fields:
- `name`, `phone`, `avatar`, `skillLevel`

### `GET /admin/users`
Role:
- `admin`, `staff`

Filters:
- `role`, `search`, `page`, `limit`

### `PATCH /admin/users/:id`
Role:
- `admin`, `staff` (staff-limited fields)

### `DELETE /admin/users/:id`
Role:
- `admin` only

## 3.3 Courts

### `GET /courts`
All roles can read.

### `POST /courts`
Role:
- `admin`, `staff`

### `PATCH /courts/:id`
Role:
- `admin`, `staff`

### `DELETE /courts/:id`
Role:
- `admin`, `staff`

## 3.4 Bookings + Requests

### `GET /bookings`
Role behavior:
- player: own bookings
- coach: own training sessions + joined sessions
- admin/staff: all bookings

Filters:
- `status`, `dateFrom`, `dateTo`, `courtId`, `type`

### `POST /bookings`
Create booking request.

Request:

```json
{
  "courtId": "uuid",
  "type": "private",
  "date": "2026-03-18",
  "startTime": "10:00",
  "endTime": "11:00",
  "duration": 60,
  "notes": "optional"
}
```

Response:
- booking starts as `pending` for approval flows.

### `PATCH /bookings/:id`
Use for:
- reschedule
- notes update
- status updates by admins/staff

### `POST /bookings/:id/approve`
Role:
- `admin`, `staff`

### `POST /bookings/:id/reject`
Role:
- `admin`, `staff`

### `POST /bookings/:id/cancel`
Role:
- owner or admin/staff

### `GET /bookings/available-slots`
Query:
- `courtId`, `date`, `bookingType`

## 3.5 Check-In (QR + Manual)

### `POST /check-in/verify`
Role:
- `admin`, `staff`

Request:

```json
{
  "bookingId": "uuid"
}
```

Response:
- booking details + court + player summary for verification UI.

### `POST /check-in/confirm`
Role:
- `admin`, `staff`

Request:

```json
{
  "bookingId": "uuid",
  "checkedInBy": "staff-user-id"
}
```

Behavior:
- sets `checkedIn=true`, `checkedInAt=now()`.

## 3.6 Coach Sessions

### `GET /coach/sessions`
Role:
- `coach`

Returns training-type sessions created by coach.

### `POST /coach/sessions`
Role:
- `coach`

Creates training session booking.

### `PATCH /coach/sessions/:id`
Role:
- `coach` owner

### `DELETE /coach/sessions/:id`
Role:
- `coach` owner

### `POST /sessions/:id/join`
Role:
- `player`

## 3.7 Pricing / Memberships

### `GET /plans`
All roles.

### `POST /plans`
Role:
- `admin` only

### `PATCH /plans/:id`
Role:
- `admin` only

### `DELETE /plans/:id`
Role:
- `admin` only

### `POST /subscriptions`
Role:
- authenticated users

Request:

```json
{
  "planId": "uuid",
  "paymentMethod": "card"
}
```

## 3.8 Notifications

### `GET /notifications`
Own notifications only.

### `POST /notifications/mark-all-read`
Own notifications only.

## 3.9 Analytics (Separate from Dashboard)

### `GET /analytics/bookings`
Role:
- `admin`, `staff` (read-only for staff if needed)

Query:
- `startDate`, `endDate`

### `GET /analytics/courts/:courtId/utilization`
Role:
- `admin`, `staff`

## 4) Validation Rules (Initial)

- `email`: valid email format
- `password`: min length 8 (production)
- `expectedRole`: required on login for role-based sign-in UI
- `date`: ISO date
- `startTime/endTime`: `HH:mm`
- `duration`: positive integer minutes
- `bookingId/courtId/userId/planId`: UUID

Business checks:
- booking time inside court operating hours
- no overlap conflict for exclusive bookings
- check-in allowed only for valid confirmed booking window

## 5) Security and Middleware (Step 1 scope)

Required middleware:
- `requireAuth`
- `requireRole(...roles)`
- `validateBody(schema)`
- `validateQuery(schema)`

Supabase/RLS strategy:
- Use JWT claims for `auth.uid()`
- Enforce row ownership at table policy level for player/coach data
- Admin/staff elevated policies only where needed

## 6) Traceability to Current UI

Mapped screens to APIs:
- Login / RoleSelection -> `/auth/login`
- SignUp -> `/auth/signup`
- BookingInterface + BookingPayment -> `/bookings`, `/subscriptions` (if membership tied)
- MyBookings -> `/bookings`, `/bookings/:id/cancel`
- CheckIn (staff) -> `/check-in/verify`, `/check-in/confirm`
- CoachPortal / CoachSessions -> `/coach/sessions`, `/sessions/:id/join`
- Pricing page -> `/plans` + admin CRUD endpoints
- Notifications -> `/notifications`, `/notifications/mark-all-read`
- Dashboard (admin operations) -> `/bookings`, `/courts`, `/requests`-type endpoints
- Analytics page -> `/analytics/*`

## 7) What to Implement Next (Step 2 suggestion)

After this contract, Step 2 should be:
- Create database tables/enums matching these contracts
- Add RLS policies
- Build endpoint stubs (even before full logic) that return mock data in contract shape

