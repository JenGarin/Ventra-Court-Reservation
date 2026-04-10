import { assertEquals } from "jsr:@std/assert@1";
import { app, __resetSupabaseClientsForTests, __setSupabaseCreateClientFactoryForTests } from "./index.tsx";
import * as kv from "./kv_store.tsx";

const { __resetForTests } = kv;

const json = async (res: Response) => await res.json();

const authed = (path: string, userId: string, role: string, method = "GET", body?: unknown) =>
  app.request(`http://local.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-user-id": userId,
      "x-user-role": role,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const authedWithHeaders = (
  path: string,
  userId: string,
  role: string,
  headers: Record<string, string>,
  method = "GET",
  body?: unknown,
) =>
  app.request(`http://local.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-user-id": userId,
      "x-user-role": role,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const authedBearer = (path: string, token: string, method = "GET", body?: unknown) =>
  app.request(`http://local.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

Deno.test("health endpoint responds ok", async () => {
  __resetForTests();
  const res = await app.request("http://local.test/api/v1/health");
  const payload = await json(res);
  assertEquals(res.status, 200);
  assertEquals(payload.success, true);
  assertEquals(payload.data.status, "ok");
  assertEquals(typeof payload.meta.requestId, "string");
  assertEquals(payload.meta.requestId.length > 0, true);
  assertEquals(res.headers.get("x-request-id"), payload.meta.requestId);
});

Deno.test("request id from header is echoed in response meta and header", async () => {
  __resetForTests();
  const requestId = "req-test-123";
  const res = await app.request("http://local.test/api/v1/health", {
    method: "GET",
    headers: {
      "x-request-id": requestId,
    },
  });
  const payload = await json(res);
  assertEquals(res.status, 200);
  assertEquals(payload.meta.requestId, requestId);
  assertEquals(res.headers.get("x-request-id"), requestId);
});

Deno.test("unknown route returns structured 404 with requestId", async () => {
  __resetForTests();
  const res = await app.request("http://local.test/api/v1/not-a-real-route");
  const payload = await json(res);
  assertEquals(res.status, 404);
  assertEquals(payload.success, false);
  assertEquals(payload.error.code, "NOT_FOUND");
  assertEquals(typeof payload.meta.requestId, "string");
  assertEquals(payload.meta.requestId.length > 0, true);
  assertEquals(res.headers.get("x-request-id"), payload.meta.requestId);
});

Deno.test("facility config endpoint returns defaults", async () => {
  __resetForTests();
  const res = await app.request("http://local.test/api/v1/config/facility");
  const payload = await json(res);
  assertEquals(res.status, 200);
  assertEquals(payload.success, true);
  assertEquals(payload.data.openingTime, "07:00");
  assertEquals(payload.data.closingTime, "22:00");
  assertEquals(payload.data.bookingInterval, 60);
});

Deno.test("admin can update facility config", async () => {
  __resetForTests();
  const patchRes = await authed("/api/v1/config/facility", "admin-1", "admin", "PATCH", {
    bookingInterval: 30,
    maintenanceMode: true,
    peakHours: [{ start: "18:00", end: "21:00" }],
  });
  const patched = await json(patchRes);
  assertEquals(patchRes.status, 200);
  assertEquals(patched.data.bookingInterval, 30);
  assertEquals(patched.data.maintenanceMode, true);
  assertEquals(Array.isArray(patched.data.peakHours), true);
  assertEquals(patched.data.peakHours[0].start, "18:00");

  const getRes = await app.request("http://local.test/api/v1/config/facility");
  const after = await json(getRes);
  assertEquals(getRes.status, 200);
  assertEquals(after.data.bookingInterval, 30);
  assertEquals(after.data.maintenanceMode, true);
});

Deno.test("facility config rejects invalid time range and blocks player updates", async () => {
  __resetForTests();
  const forbiddenRes = await authed("/api/v1/config/facility", "player-1", "player", "PATCH", {
    bookingInterval: 45,
  });
  const forbidden = await json(forbiddenRes);
  assertEquals(forbiddenRes.status, 403);
  assertEquals(forbidden.error.code, "FORBIDDEN");

  const invalidRes = await authed("/api/v1/config/facility", "admin-1", "admin", "PATCH", {
    openingTime: "23:00",
    closingTime: "08:00",
  });
  const invalid = await json(invalidRes);
  assertEquals(invalidRes.status, 400);
  assertEquals(invalid.error.code, "VALIDATION_ERROR");
});

Deno.test("booking lifecycle: create pending then approve", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-25",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);
  assertEquals(created.success, true);
  assertEquals(created.data.status, "pending");

  const approveRes = await app.request(`http://local.test/api/v1/requests/${created.data.id}/approve`, {
    method: "POST",
    headers: {
      "x-user-id": "staff-1",
      "x-user-role": "staff",
    },
  });
  const approved = await json(approveRes);
  assertEquals(approveRes.status, 200);
  assertEquals(approved.success, true);
  assertEquals(approved.data.status, "confirmed");
});

Deno.test("booking create ignores client paymentStatus override", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-26",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 500,
    paymentStatus: "paid",
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);
  assertEquals(created.data.paymentStatus, "unpaid");
});

Deno.test("booking create ignores client players and maxPlayers overrides", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-27",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 500,
    players: ["player-2", "player-3"],
    maxPlayers: 99,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);
  assertEquals(Array.isArray(created.data.players), true);
  assertEquals(created.data.players.length, 0);
  assertEquals(created.data.maxPlayers, 4);
});

Deno.test("bearer token can authenticate booking create without x-user-id header", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authedBearer("/api/v1/bookings", "mock-access-player-1", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-25",
    startTime: "12:00",
    endTime: "13:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);
  assertEquals(created.success, true);
  assertEquals(created.data.userId, "player-1");
});

Deno.test("bearer token role cannot be elevated by x-user-role header", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const listUsersRes = await app.request("http://local.test/api/v1/admin/users?page=1&limit=20", {
    method: "GET",
    headers: {
      authorization: "Bearer mock-access-player-1",
      "x-user-role": "admin",
    },
  });
  const payload = await json(listUsersRes);
  assertEquals(listUsersRes.status, 403);
  assertEquals(payload.error.code, "FORBIDDEN");
});

Deno.test("admin can update user role via admin/users patch", async () => {
  __resetForTests();
  const res = await authed("/api/v1/admin/users/player-1", "admin-1", "admin", "PATCH", {
    role: "coach",
    name: "Alex Updated",
  });
  const payload = await json(res);
  assertEquals(res.status, 200);
  assertEquals(payload.data.role, "coach");
  assertEquals(payload.data.name, "Alex Updated");
});

Deno.test("admin/users patch rejects immutable fields", async () => {
  __resetForTests();
  const res = await authed("/api/v1/admin/users/player-1", "admin-1", "admin", "PATCH", {
    email: "hijack@court.com",
  });
  const payload = await json(res);
  assertEquals(res.status, 400);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
});

Deno.test("staff cannot update user role via admin/users patch", async () => {
  __resetForTests();
  const res = await authed("/api/v1/admin/users/player-1", "staff-1", "staff", "PATCH", {
    role: "coach",
  });
  const payload = await json(res);
  assertEquals(res.status, 400);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
});

Deno.test("staff cannot modify admin accounts via admin/users patch", async () => {
  __resetForTests();
  const res = await authed("/api/v1/admin/users/admin-1", "staff-1", "staff", "PATCH", {
    name: "Tampered Admin",
  });
  const payload = await json(res);
  assertEquals(res.status, 403);
  assertEquals(payload.error.code, "FORBIDDEN");
});

Deno.test("admin/users delete returns 404 for missing user", async () => {
  __resetForTests();
  const res = await authed("/api/v1/admin/users/user-does-not-exist", "admin-1", "admin", "DELETE");
  const payload = await json(res);
  assertEquals(res.status, 404);
  assertEquals(payload.error.code, "NOT_FOUND");
});

Deno.test("admin/users delete blocks self-deletion", async () => {
  __resetForTests();
  const res = await authed("/api/v1/admin/users/admin-1", "admin-1", "admin", "DELETE");
  const payload = await json(res);
  assertEquals(res.status, 409);
  assertEquals(payload.error.code, "CONFLICT");
});

Deno.test("admin/users delete removes account and prevents login", async () => {
  __resetForTests();
  const deleteRes = await authed("/api/v1/admin/users/player-1", "admin-1", "admin", "DELETE");
  assertEquals(deleteRes.status, 200);

  const loginRes = await app.request("http://local.test/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "player@court.com", password: "player", expectedRole: "player" }),
  });
  const loginPayload = await json(loginRes);
  assertEquals(loginRes.status, 401);
  assertEquals(loginPayload.error.code, "UNAUTHENTICATED");
});

Deno.test("admin user patch writes audit log entry", async () => {
  __resetForTests();
  const requestId = "req-admin-user-patch-audit";
  const patchRes = await authedWithHeaders(
    "/api/v1/admin/users/player-1",
    "admin-1",
    "admin",
    { "x-request-id": requestId },
    "PATCH",
    { role: "coach", name: "Audit User Patch" },
  );
  assertEquals(patchRes.status, 200);

  const logsRes = await authed("/api/v1/admin/audit-logs?entityType=user&entityId=player-1&page=1&limit=50", "admin-1", "admin", "GET");
  const logsPayload = await json(logsRes);
  assertEquals(logsRes.status, 200);
  const match = (logsPayload.data as any[]).find((log) => log.action === "admin_user_updated");
  assertEquals(Boolean(match), true);
  assertEquals(match.metadata?.requestId, requestId);
});

Deno.test("admin user delete writes audit log entry", async () => {
  __resetForTests();
  const requestId = "req-admin-user-delete-audit";
  const deleteRes = await authedWithHeaders(
    "/api/v1/admin/users/player-1",
    "admin-1",
    "admin",
    { "x-request-id": requestId },
    "DELETE",
  );
  assertEquals(deleteRes.status, 200);

  const logsRes = await authed("/api/v1/admin/audit-logs?entityType=user&entityId=player-1&page=1&limit=50", "admin-1", "admin", "GET");
  const logsPayload = await json(logsRes);
  assertEquals(logsRes.status, 200);
  const match = (logsPayload.data as any[]).find((log) => log.action === "admin_user_deleted");
  assertEquals(Boolean(match), true);
  assertEquals(match.metadata?.requestId, requestId);
});

Deno.test("auth rejects mismatch between bearer identity and x-user-id header", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const res = await app.request("http://local.test/api/v1/users/me", {
    method: "GET",
    headers: {
      authorization: "Bearer mock-access-player-1",
      "x-user-id": "staff-1",
      "x-user-role": "staff",
    },
  });
  const payload = await json(res);
  assertEquals(res.status, 401);
  assertEquals(payload.error.code, "UNAUTHENTICATED");
});

Deno.test("strict bearer mode requires authorization header", async () => {
  __resetForTests();
  const previous = Deno.env.get("AUTH_REQUIRE_BEARER");
  Deno.env.set("AUTH_REQUIRE_BEARER", "true");
  try {
    await app.request("http://local.test/api/v1/courts");

    const noBearerRes = await authed("/api/v1/users/me", "player-1", "player", "GET");
    const noBearerPayload = await json(noBearerRes);
    assertEquals(noBearerRes.status, 401);
    assertEquals(noBearerPayload.error.code, "UNAUTHENTICATED");

    const bearerRes = await authedBearer("/api/v1/users/me", "mock-access-player-1", "GET");
    const bearerPayload = await json(bearerRes);
    assertEquals(bearerRes.status, 200);
    assertEquals(bearerPayload.data.id, "player-1");
  } finally {
    if (previous == null) Deno.env.delete("AUTH_REQUIRE_BEARER");
    else Deno.env.set("AUTH_REQUIRE_BEARER", previous);
  }
});

Deno.test("auth login is rate limited after configured attempts", async () => {
  __resetForTests();
  const prevMax = Deno.env.get("RATE_LIMIT_AUTH_LOGIN_MAX");
  const prevWindow = Deno.env.get("RATE_LIMIT_AUTH_LOGIN_WINDOW_SEC");
  Deno.env.set("RATE_LIMIT_AUTH_LOGIN_MAX", "2");
  Deno.env.set("RATE_LIMIT_AUTH_LOGIN_WINDOW_SEC", "60");
  try {
    const makeLogin = () =>
      app.request("http://local.test/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.5",
        },
        body: JSON.stringify({ email: "player@court.com", password: "player", expectedRole: "player" }),
      });

    const first = await makeLogin();
    assertEquals(first.status, 200);
    const second = await makeLogin();
    assertEquals(second.status, 200);
    const third = await makeLogin();
    const thirdPayload = await json(third);
    assertEquals(third.status, 429);
    assertEquals(thirdPayload.error.code, "RATE_LIMITED");
  } finally {
    if (prevMax == null) Deno.env.delete("RATE_LIMIT_AUTH_LOGIN_MAX");
    else Deno.env.set("RATE_LIMIT_AUTH_LOGIN_MAX", prevMax);
    if (prevWindow == null) Deno.env.delete("RATE_LIMIT_AUTH_LOGIN_WINDOW_SEC");
    else Deno.env.set("RATE_LIMIT_AUTH_LOGIN_WINDOW_SEC", prevWindow);
  }
});

Deno.test("auth login requires password", async () => {
  __resetForTests();
  const res = await app.request("http://local.test/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "player@court.com", expectedRole: "player" }),
  });
  const payload = await json(res);
  assertEquals(res.status, 400);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
});

Deno.test("auth login falls back to legacy accounts in supabase mode", async () => {
  __resetForTests();
  __resetSupabaseClientsForTests();
  const prevAuthMode = Deno.env.get("AUTH_MODE");
  const prevUrl = Deno.env.get("SUPABASE_URL");
  const prevAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  Deno.env.set("AUTH_MODE", "supabase");
  Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "anon-key");

  await kv.set("user:legacy-player-1", {
    id: "legacy-player-1",
    email: "legacy-player@court.com",
    name: "Legacy Player",
    role: "player",
    status: "active",
    createdAt: "2099-01-01T00:00:00.000Z",
  });
  await kv.set("authcred:legacy-player-1", "legacy-pass");

  __setSupabaseCreateClientFactoryForTests((_url, key) => {
    if (key === "anon-key") {
      return {
        auth: {
          signInWithPassword: async () => ({
            data: { user: null, session: null },
            error: { message: "Invalid login credentials" },
          }),
        },
      };
    }
    return {};
  });

  try {
    const res = await app.request("http://local.test/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "legacy-player@court.com",
        password: "legacy-pass",
        expectedRole: "player",
      }),
    });
    const payload = await json(res);
    assertEquals(res.status, 200);
    assertEquals(payload.data.accessToken, "mock-access-legacy-player-1");
    assertEquals(payload.data.user.id, "legacy-player-1");
    assertEquals(payload.data.user.email, "legacy-player@court.com");
  } finally {
    __resetSupabaseClientsForTests();
    if (prevAuthMode == null) Deno.env.delete("AUTH_MODE");
    else Deno.env.set("AUTH_MODE", prevAuthMode);
    if (prevUrl == null) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", prevUrl);
    if (prevAnonKey == null) Deno.env.delete("SUPABASE_ANON_KEY");
    else Deno.env.set("SUPABASE_ANON_KEY", prevAnonKey);
  }
});

Deno.test("auth signup requires password", async () => {
  __resetForTests();
  const res = await app.request("http://local.test/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "missing-password@court.com", role: "player" }),
  });
  const payload = await json(res);
  assertEquals(res.status, 400);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
});

Deno.test("auth signup enforces password minimum length", async () => {
  __resetForTests();
  const res = await app.request("http://local.test/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "short-password@court.com", password: "12345", role: "player" }),
  });
  const payload = await json(res);
  assertEquals(res.status, 400);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
});

Deno.test("auth signup in supabase mode does not block legacy local users", async () => {
  __resetForTests();
  __resetSupabaseClientsForTests();
  const prevAuthMode = Deno.env.get("AUTH_MODE");
  const prevUrl = Deno.env.get("SUPABASE_URL");
  const prevAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  Deno.env.set("AUTH_MODE", "supabase");
  Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "anon-key");

  await kv.set("user:legacy-signup-1", {
    id: "legacy-signup-1",
    email: "legacy-signup@court.com",
    name: "Legacy Signup",
    role: "player",
    status: "active",
    createdAt: "2099-01-01T00:00:00.000Z",
  });

  __setSupabaseCreateClientFactoryForTests((_url, key) => {
    if (key === "anon-key") {
      return {
        auth: {
          signUp: async () => ({
            data: {
              user: {
                id: "supabase-user-1",
              },
            },
            error: null,
          }),
        },
      };
    }
    return {};
  });

  try {
    const res = await app.request("http://local.test/api/v1/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "legacy-signup@court.com",
        password: "new-password",
        role: "player",
        name: "Legacy Signup",
      }),
    });
    const payload = await json(res);
    assertEquals(res.status, 200);
    assertEquals(payload.data.id, "supabase-user-1");
    assertEquals(payload.data.email, "legacy-signup@court.com");
  } finally {
    __resetSupabaseClientsForTests();
    if (prevAuthMode == null) Deno.env.delete("AUTH_MODE");
    else Deno.env.set("AUTH_MODE", prevAuthMode);
    if (prevUrl == null) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", prevUrl);
    if (prevAnonKey == null) Deno.env.delete("SUPABASE_ANON_KEY");
    else Deno.env.set("SUPABASE_ANON_KEY", prevAnonKey);
  }
});

Deno.test("auth signup honors configured password minimum length", async () => {
  __resetForTests();
  const prevMin = Deno.env.get("AUTH_PASSWORD_MIN_LENGTH");
  Deno.env.set("AUTH_PASSWORD_MIN_LENGTH", "8");
  try {
    const tooShortRes = await app.request("http://local.test/api/v1/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "short-by-policy@court.com", password: "1234567", role: "player" }),
    });
    const tooShortPayload = await json(tooShortRes);
    assertEquals(tooShortRes.status, 400);
    assertEquals(tooShortPayload.error.code, "VALIDATION_ERROR");

    const okRes = await app.request("http://local.test/api/v1/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "valid-by-policy@court.com", password: "12345678", role: "player" }),
    });
    assertEquals(okRes.status, 200);
  } finally {
    if (prevMin == null) Deno.env.delete("AUTH_PASSWORD_MIN_LENGTH");
    else Deno.env.set("AUTH_PASSWORD_MIN_LENGTH", prevMin);
  }
});

Deno.test("auth signup is rate limited after configured attempts", async () => {
  __resetForTests();
  const prevMax = Deno.env.get("RATE_LIMIT_AUTH_SIGNUP_MAX");
  const prevWindow = Deno.env.get("RATE_LIMIT_AUTH_SIGNUP_WINDOW_SEC");
  Deno.env.set("RATE_LIMIT_AUTH_SIGNUP_MAX", "1");
  Deno.env.set("RATE_LIMIT_AUTH_SIGNUP_WINDOW_SEC", "60");
  try {
    const makeSignup = (email: string) =>
      app.request("http://local.test/api/v1/auth/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.11",
        },
        body: JSON.stringify({ email, password: "player1", role: "player" }),
      });

    const first = await makeSignup("rate-signup-1@court.com");
    assertEquals(first.status, 200);
    const second = await makeSignup("rate-signup-2@court.com");
    const secondPayload = await json(second);
    assertEquals(second.status, 429);
    assertEquals(secondPayload.error.code, "RATE_LIMITED");
  } finally {
    if (prevMax == null) Deno.env.delete("RATE_LIMIT_AUTH_SIGNUP_MAX");
    else Deno.env.set("RATE_LIMIT_AUTH_SIGNUP_MAX", prevMax);
    if (prevWindow == null) Deno.env.delete("RATE_LIMIT_AUTH_SIGNUP_WINDOW_SEC");
    else Deno.env.set("RATE_LIMIT_AUTH_SIGNUP_WINDOW_SEC", prevWindow);
  }
});

Deno.test("public signup cannot create admin/staff by default", async () => {
  __resetForTests();
  const adminRes = await app.request("http://local.test/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "new-admin@court.com", password: "admin1", role: "admin" }),
  });
  const adminPayload = await json(adminRes);
  assertEquals(adminRes.status, 403);
  assertEquals(adminPayload.error.code, "FORBIDDEN");

  const staffRes = await app.request("http://local.test/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "new-staff@court.com", password: "staff1", role: "staff" }),
  });
  const staffPayload = await json(staffRes);
  assertEquals(staffRes.status, 403);
  assertEquals(staffPayload.error.code, "FORBIDDEN");
});

Deno.test("privileged signup can be enabled via env flag", async () => {
  __resetForTests();
  const prev = Deno.env.get("AUTH_ALLOW_PRIVILEGED_SIGNUP");
  Deno.env.set("AUTH_ALLOW_PRIVILEGED_SIGNUP", "true");
  try {
    const adminRes = await app.request("http://local.test/api/v1/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "optin-admin@court.com", password: "admin1", role: "admin" }),
    });
    const adminPayload = await json(adminRes);
    assertEquals(adminRes.status, 200);
    assertEquals(adminPayload.data.role, "admin");
  } finally {
    if (prev == null) Deno.env.delete("AUTH_ALLOW_PRIVILEGED_SIGNUP");
    else Deno.env.set("AUTH_ALLOW_PRIVILEGED_SIGNUP", prev);
  }
});

Deno.test("admin signup in supabase mode uses service role provisioning without email confirmation", async () => {
  __resetForTests();
  __resetSupabaseClientsForTests();
  const prevAuthMode = Deno.env.get("AUTH_MODE");
  const prevUrl = Deno.env.get("SUPABASE_URL");
  const prevAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const prevServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const prevAdminCode = Deno.env.get("ADMIN_SIGNUP_CODE");

  Deno.env.set("AUTH_MODE", "supabase");
  Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  Deno.env.set("ADMIN_SIGNUP_CODE", "ADMIN1234");

  __setSupabaseCreateClientFactoryForTests((_url, key) => {
    if (key === "service-role-key") {
      return {
        auth: {
          admin: {
            createUser: async () => ({
              data: {
                user: {
                  id: "supabase-admin-1",
                },
              },
              error: null,
            }),
          },
        },
      };
    }
    return {
      auth: {
        signUp: async () => ({
          data: {
            user: {
              id: "anon-user-should-not-be-used",
            },
          },
          error: null,
        }),
      },
    };
  });

  try {
    const signupRes = await app.request("http://local.test/api/v1/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "new-admin@court.com",
        password: "admin1234",
        role: "admin",
        adminCode: "ADMIN1234",
        name: "New Admin",
      }),
    });
    const signupPayload = await json(signupRes);
    assertEquals(signupRes.status, 200);
    assertEquals(signupPayload.data.id, "supabase-admin-1");
    assertEquals(signupPayload.data.role, "admin");
    assertEquals(signupPayload.data.emailConfirmationRequired, false);
    assertEquals(signupPayload.data.message, "Admin account created successfully! Please sign in.");
  } finally {
    __resetSupabaseClientsForTests();
    if (prevAuthMode == null) Deno.env.delete("AUTH_MODE");
    else Deno.env.set("AUTH_MODE", prevAuthMode);
    if (prevUrl == null) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", prevUrl);
    if (prevAnonKey == null) Deno.env.delete("SUPABASE_ANON_KEY");
    else Deno.env.set("SUPABASE_ANON_KEY", prevAnonKey);
    if (prevServiceKey == null) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
    else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", prevServiceKey);
    if (prevAdminCode == null) Deno.env.delete("ADMIN_SIGNUP_CODE");
    else Deno.env.set("ADMIN_SIGNUP_CODE", prevAdminCode);
  }
});

Deno.test("auth oauth/start validates provider and expectedRole", async () => {
  __resetForTests();
  const invalidProviderRes = await app.request("http://local.test/api/v1/auth/oauth/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "invalid-provider", expectedRole: "player" }),
  });
  const invalidProvider = await json(invalidProviderRes);
  assertEquals(invalidProviderRes.status, 400);
  assertEquals(invalidProvider.error.code, "VALIDATION_ERROR");

  const invalidRoleRes = await app.request("http://local.test/api/v1/auth/oauth/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "google", expectedRole: "owner" }),
  });
  const invalidRole = await json(invalidRoleRes);
  assertEquals(invalidRoleRes.status, 400);
  assertEquals(invalidRole.error.code, "VALIDATION_ERROR");
});

Deno.test("auth oauth/start rejects invalid redirectUri", async () => {
  __resetForTests();
  const res = await app.request("http://local.test/api/v1/auth/oauth/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "google", expectedRole: "player", redirectUri: "not-a-url" }),
  });
  const payload = await json(res);
  assertEquals(res.status, 400);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
});

Deno.test("auth oauth/start returns redirect with oauth callback state", async () => {
  __resetForTests();
  const res = await app.request("http://local.test/api/v1/auth/oauth/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: "google",
      expectedRole: "player",
      redirectUri: "http://localhost:5173/sign-in",
    }),
  });
  const payload = await json(res);
  assertEquals(res.status, 200);
  assertEquals(payload.data.provider, "google");
  assertEquals(typeof payload.data.redirectUrl, "string");
  assertEquals(payload.data.redirectUrl.includes("oauth=1"), true);
  const redirect = new URL(payload.data.redirectUrl);
  assertEquals(redirect.searchParams.get("oauth"), "1");
  assertEquals(typeof redirect.searchParams.get("state"), "string");
  assertEquals((redirect.searchParams.get("state") || "").length > 0, true);
});

Deno.test("auth oauth/callback returns session payload for matching role", async () => {
  __resetForTests();
  const startRes = await app.request("http://local.test/api/v1/auth/oauth/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: "google",
      expectedRole: "player",
      redirectUri: "http://localhost:5173/sign-in",
    }),
  });
  const startPayload = await json(startRes);
  const state = new URL(startPayload.data.redirectUrl).searchParams.get("state") || "";

  const res = await app.request("http://local.test/api/v1/auth/oauth/callback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state }),
  });
  const payload = await json(res);
  assertEquals(res.status, 200);
  assertEquals(typeof payload.data.accessToken, "string");
  assertEquals(payload.data.user.email, "player@court.com");
  assertEquals(payload.data.user.role, "player");
});

Deno.test("auth oauth/callback rejects role mismatch", async () => {
  __resetForTests();
  const token = "test-oauth-state-role-mismatch";
  await kv.set(`oauth_state:${token}`, {
    token,
    provider: "google",
    expectedRole: "admin",
    email: "player@court.com",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  const res = await app.request("http://local.test/api/v1/auth/oauth/callback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state: token }),
  });
  const payload = await json(res);
  assertEquals(res.status, 403);
  assertEquals(payload.error.code, "ROLE_MISMATCH");
});

Deno.test("auth oauth/callback rejects reused state token", async () => {
  __resetForTests();
  const startRes = await app.request("http://local.test/api/v1/auth/oauth/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: "google",
      expectedRole: "player",
      redirectUri: "http://localhost:5173/sign-in",
    }),
  });
  const startPayload = await json(startRes);
  const state = new URL(startPayload.data.redirectUrl).searchParams.get("state") || "";

  const firstRes = await app.request("http://local.test/api/v1/auth/oauth/callback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state }),
  });
  assertEquals(firstRes.status, 200);

  const secondRes = await app.request("http://local.test/api/v1/auth/oauth/callback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state }),
  });
  const secondPayload = await json(secondRes);
  assertEquals(secondRes.status, 401);
  assertEquals(secondPayload.error.code, "UNAUTHENTICATED");
});

Deno.test("auth oauth/callback rejects expired state token", async () => {
  __resetForTests();
  const token = "test-oauth-state-expired";
  await kv.set(`oauth_state:${token}`, {
    token,
    provider: "google",
    expectedRole: "player",
    email: "player@court.com",
    createdAt: new Date(Date.now() - 120_000).toISOString(),
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  });

  const res = await app.request("http://local.test/api/v1/auth/oauth/callback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state: token }),
  });
  const payload = await json(res);
  assertEquals(res.status, 401);
  assertEquals(payload.error.code, "UNAUTHENTICATED");
});

Deno.test("auth oauth/start enforces redirect allowlist in strict mode", async () => {
  __resetForTests();
  const prevStrict = Deno.env.get("AUTH_OAUTH_STRICT_REDIRECT");
  const prevOrigins = Deno.env.get("AUTH_OAUTH_REDIRECT_ORIGINS");
  const prevPublicBase = Deno.env.get("PUBLIC_APP_BASE_URL");
  Deno.env.set("AUTH_OAUTH_STRICT_REDIRECT", "true");
  Deno.env.set("AUTH_OAUTH_REDIRECT_ORIGINS", "http://localhost:5173");
  Deno.env.delete("PUBLIC_APP_BASE_URL");
  try {
    const missingRedirectRes = await app.request("http://local.test/api/v1/auth/oauth/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", expectedRole: "player" }),
    });
    const missingRedirectPayload = await json(missingRedirectRes);
    assertEquals(missingRedirectRes.status, 400);
    assertEquals(missingRedirectPayload.error.code, "VALIDATION_ERROR");

    const disallowedRes = await app.request("http://local.test/api/v1/auth/oauth/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "google",
        expectedRole: "player",
        redirectUri: "https://evil.example.com/sign-in",
      }),
    });
    const disallowedPayload = await json(disallowedRes);
    assertEquals(disallowedRes.status, 400);
    assertEquals(disallowedPayload.error.code, "VALIDATION_ERROR");

    const allowedRes = await app.request("http://local.test/api/v1/auth/oauth/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "google",
        expectedRole: "player",
        redirectUri: "http://localhost:5173/sign-in",
      }),
    });
    assertEquals(allowedRes.status, 200);
  } finally {
    if (prevStrict == null) Deno.env.delete("AUTH_OAUTH_STRICT_REDIRECT");
    else Deno.env.set("AUTH_OAUTH_STRICT_REDIRECT", prevStrict);
    if (prevOrigins == null) Deno.env.delete("AUTH_OAUTH_REDIRECT_ORIGINS");
    else Deno.env.set("AUTH_OAUTH_REDIRECT_ORIGINS", prevOrigins);
    if (prevPublicBase == null) Deno.env.delete("PUBLIC_APP_BASE_URL");
    else Deno.env.set("PUBLIC_APP_BASE_URL", prevPublicBase);
  }
});

Deno.test("auth reset-password validates email and returns generic success", async () => {
  __resetForTests();
  const invalidRes = await app.request("http://local.test/api/v1/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "not-an-email" }),
  });
  const invalid = await json(invalidRes);
  assertEquals(invalidRes.status, 400);
  assertEquals(invalid.error.code, "VALIDATION_ERROR");

  const okKnownRes = await app.request("http://local.test/api/v1/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "player@court.com" }),
  });
  const okKnown = await json(okKnownRes);
  assertEquals(okKnownRes.status, 200);
  assertEquals(okKnown.data.sent, true);

  const okUnknownRes = await app.request("http://local.test/api/v1/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "unknown-user@court.com" }),
  });
  const okUnknown = await json(okUnknownRes);
  assertEquals(okUnknownRes.status, 200);
  assertEquals(okUnknown.data.sent, true);
});

Deno.test("auth reset-password is rate limited after configured attempts", async () => {
  __resetForTests();
  const prevMax = Deno.env.get("RATE_LIMIT_AUTH_RESET_PASSWORD_MAX");
  const prevWindow = Deno.env.get("RATE_LIMIT_AUTH_RESET_PASSWORD_WINDOW_SEC");
  Deno.env.set("RATE_LIMIT_AUTH_RESET_PASSWORD_MAX", "1");
  Deno.env.set("RATE_LIMIT_AUTH_RESET_PASSWORD_WINDOW_SEC", "60");
  try {
    const makeReset = () =>
      app.request("http://local.test/api/v1/auth/reset-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.99",
        },
        body: JSON.stringify({ email: "player@court.com" }),
      });

    const first = await makeReset();
    assertEquals(first.status, 200);
    const second = await makeReset();
    const secondPayload = await json(second);
    assertEquals(second.status, 429);
    assertEquals(secondPayload.error.code, "RATE_LIMITED");
  } finally {
    if (prevMax == null) Deno.env.delete("RATE_LIMIT_AUTH_RESET_PASSWORD_MAX");
    else Deno.env.set("RATE_LIMIT_AUTH_RESET_PASSWORD_MAX", prevMax);
    if (prevWindow == null) Deno.env.delete("RATE_LIMIT_AUTH_RESET_PASSWORD_WINDOW_SEC");
    else Deno.env.set("RATE_LIMIT_AUTH_RESET_PASSWORD_WINDOW_SEC", prevWindow);
  }
});

Deno.test("auth change-password updates credentials for subsequent login", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const changeRes = await authed("/api/v1/auth/change-password", "player-1", "player", "POST", {
    currentPassword: "player",
    newPassword: "player-new-pass",
  });
  const changePayload = await json(changeRes);
  assertEquals(changeRes.status, 200);
  assertEquals(changePayload.data.changed, true);

  const oldLoginRes = await app.request("http://local.test/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "player@court.com", password: "player", expectedRole: "player" }),
  });
  assertEquals(oldLoginRes.status, 401);

  const newLoginRes = await app.request("http://local.test/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "player@court.com", password: "player-new-pass", expectedRole: "player" }),
  });
  assertEquals(newLoginRes.status, 200);
});

Deno.test("auth change-password rejects incorrect current password", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const changeRes = await authed("/api/v1/auth/change-password", "player-1", "player", "POST", {
    currentPassword: "wrong-current",
    newPassword: "player-new-pass",
  });
  const payload = await json(changeRes);
  assertEquals(changeRes.status, 401);
  assertEquals(payload.error.code, "UNAUTHENTICATED");
});

Deno.test("auth change-password enforces minimum length policy", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");
  const res = await authed("/api/v1/auth/change-password", "player-1", "player", "POST", {
    currentPassword: "player",
    newPassword: "12345",
  });
  const payload = await json(res);
  assertEquals(res.status, 400);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
});

Deno.test("auth oauth/start is rate limited after configured attempts", async () => {
  __resetForTests();
  const prevMax = Deno.env.get("RATE_LIMIT_AUTH_OAUTH_START_MAX");
  const prevWindow = Deno.env.get("RATE_LIMIT_AUTH_OAUTH_START_WINDOW_SEC");
  Deno.env.set("RATE_LIMIT_AUTH_OAUTH_START_MAX", "1");
  Deno.env.set("RATE_LIMIT_AUTH_OAUTH_START_WINDOW_SEC", "60");
  try {
    const makeOauthStart = () =>
      app.request("http://local.test/api/v1/auth/oauth/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.12",
        },
        body: JSON.stringify({ provider: "google", expectedRole: "player" }),
      });

    const first = await makeOauthStart();
    assertEquals(first.status, 200);
    const second = await makeOauthStart();
    const secondPayload = await json(second);
    assertEquals(second.status, 429);
    assertEquals(secondPayload.error.code, "RATE_LIMITED");
  } finally {
    if (prevMax == null) Deno.env.delete("RATE_LIMIT_AUTH_OAUTH_START_MAX");
    else Deno.env.set("RATE_LIMIT_AUTH_OAUTH_START_MAX", prevMax);
    if (prevWindow == null) Deno.env.delete("RATE_LIMIT_AUTH_OAUTH_START_WINDOW_SEC");
    else Deno.env.set("RATE_LIMIT_AUTH_OAUTH_START_WINDOW_SEC", prevWindow);
  }
});

Deno.test("auth endpoints write audit logs with requestId metadata", async () => {
  __resetForTests();

  const signupRes = await app.request("http://local.test/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "audit-auth@court.com", password: "player1", role: "player" }),
  });
  assertEquals(signupRes.status, 200);

  const loginSuccessRes = await app.request("http://local.test/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "audit-auth@court.com", password: "player1", expectedRole: "player" }),
  });
  assertEquals(loginSuccessRes.status, 200);

  const loginFailRes = await app.request("http://local.test/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "missing-user@court.com", password: "player", expectedRole: "player" }),
  });
  assertEquals(loginFailRes.status, 401);

  const oauthRes = await app.request("http://local.test/api/v1/auth/oauth/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "google", expectedRole: "player" }),
  });
  assertEquals(oauthRes.status, 200);

  const logoutRes = await app.request("http://local.test/api/v1/auth/logout", {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  assertEquals(logoutRes.status, 200);

  const logsRes = await authed("/api/v1/admin/audit-logs?entityType=auth&page=1&limit=100", "admin-1", "admin", "GET");
  const logs = await json(logsRes);
  assertEquals(logsRes.status, 200);

  const actions = (logs.data as Array<{ action: string }>).map((row) => row.action);
  assertEquals(actions.includes("auth_signup_succeeded"), true);
  assertEquals(actions.includes("auth_login_succeeded"), true);
  assertEquals(actions.includes("auth_login_failed"), true);
  assertEquals(actions.includes("auth_oauth_start"), true);
  assertEquals(actions.includes("auth_logout"), true);

  const withRequestId = (logs.data as Array<{ metadata?: Record<string, unknown> }>).filter(
    (row) => typeof row.metadata?.requestId === "string" && String(row.metadata?.requestId || "").length > 0,
  );
  assertEquals(withRequestId.length >= 5, true);
});

Deno.test("cannot create overlapping booking on same court/date", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-26",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 500,
  });

  const conflictRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-26",
    startTime: "10:30",
    endTime: "11:30",
    duration: 60,
    amount: 500,
  });
  const conflict = await json(conflictRes);
  assertEquals(conflictRes.status, 409);
  assertEquals(conflict.success, false);
  assertEquals(conflict.error.code, "CONFLICT");
});

Deno.test("booking create rejects negative amount", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-30",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: -100,
  });
  const payload = await json(createRes);
  assertEquals(createRes.status, 400);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
});

Deno.test("booking create rejects amount with more than 2 decimal places", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-31",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 100.123,
  });
  const payload = await json(createRes);
  assertEquals(createRes.status, 400);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
});

Deno.test("training booking requires coachId", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "training",
    date: "2099-12-31",
    startTime: "12:00",
    endTime: "13:00",
    duration: 60,
    amount: 100,
  });
  const payload = await json(createRes);
  assertEquals(createRes.status, 400);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
});

Deno.test("booking create rejects coachId that is not a coach account", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "training",
    coachId: "admin-1",
    date: "2099-12-31",
    startTime: "13:00",
    endTime: "14:00",
    duration: 60,
    amount: 100,
  });
  const payload = await json(createRes);
  assertEquals(createRes.status, 400);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
});

Deno.test("booking create rejects unknown coachId", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "training",
    coachId: "coach-does-not-exist",
    date: "2099-12-31",
    startTime: "14:00",
    endTime: "15:00",
    duration: 60,
    amount: 100,
  });
  const payload = await json(createRes);
  assertEquals(createRes.status, 404);
  assertEquals(payload.error.code, "NOT_FOUND");
});

Deno.test("player can join then leave a coach training session", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createdRes = await authed("/api/v1/coach/sessions", "coach-1", "coach", "POST", {
    courtId: "c1",
    date: "2099-12-27",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    maxPlayers: 2,
    amount: 500,
  });
  const created = await json(createdRes);
  assertEquals(createdRes.status, 200);
  assertEquals(created.success, true);

  const joinRes = await authed(`/api/v1/sessions/${created.data.id}/join`, "player-1", "player", "POST");
  const joined = await json(joinRes);
  assertEquals([200, 409].includes(joinRes.status), true);
  assertEquals(joined.success, true);
  assertEquals((joined.data.players || []).includes("player-1"), true);

  const dupJoinRes = await authed(`/api/v1/sessions/${created.data.id}/join`, "player-1", "player", "POST");
  const dupJoin = await json(dupJoinRes);
  assertEquals(dupJoinRes.status, 409);
  assertEquals(dupJoin.success, false);
  assertEquals(dupJoin.error.code, "CONFLICT");

  const leaveRes = await authed(`/api/v1/sessions/${created.data.id}/leave`, "player-1", "player", "POST");
  const left = await json(leaveRes);
  assertEquals(leaveRes.status, 200);
  assertEquals(left.success, true);
  assertEquals((left.data.players || []).includes("player-1"), false);
});

Deno.test("player bookings list includes joined training sessions", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createdRes = await authed("/api/v1/coach/sessions", "coach-1", "coach", "POST", {
    courtId: "c1",
    date: "2099-12-29",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    maxPlayers: 4,
    amount: 500,
  });
  const created = await json(createdRes);
  assertEquals(createdRes.status, 200);

  const joinRes = await authed(`/api/v1/sessions/${created.data.id}/join`, "player-1", "player", "POST");
  assertEquals([200, 409].includes(joinRes.status), true);

  const listRes = await authed("/api/v1/bookings?type=training&page=1&limit=50", "player-1", "player", "GET");
  const listPayload = await json(listRes);
  assertEquals(listRes.status, 200);
  assertEquals(listPayload.data.some((b: { id: string }) => b.id === created.data.id), true);
});

Deno.test("player bookings history includes joined active training sessions", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createdRes = await authed("/api/v1/coach/sessions", "coach-1", "coach", "POST", {
    courtId: "c1",
    date: "2099-12-30",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    maxPlayers: 4,
    amount: 500,
  });
  const created = await json(createdRes);
  assertEquals(createdRes.status, 200);

  const joinRes = await authed(`/api/v1/sessions/${created.data.id}/join`, "player-1", "player", "POST");
  assertEquals([200, 409].includes(joinRes.status), true);

  const historyRes = await authed("/api/v1/bookings/history?view=active&page=1&limit=50", "player-1", "player", "GET");
  const historyPayload = await json(historyRes);
  assertEquals(historyRes.status, 200);
  assertEquals(historyPayload.data.some((b: { id: string }) => b.id === created.data.id), true);
});

Deno.test("joined player can read booking detail for joined training session", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createdRes = await authed("/api/v1/coach/sessions", "coach-1", "coach", "POST", {
    courtId: "c1",
    date: "2099-12-30",
    startTime: "12:00",
    endTime: "13:00",
    duration: 60,
    maxPlayers: 4,
    amount: 500,
  });
  const created = await json(createdRes);
  assertEquals(createdRes.status, 200);

  const joinRes = await authed(`/api/v1/sessions/${created.data.id}/join`, "player-1", "player", "POST");
  assertEquals(joinRes.status, 200);

  const detailRes = await authed(`/api/v1/bookings/${created.data.id}`, "player-1", "player", "GET");
  const detailPayload = await json(detailRes);
  assertEquals(detailRes.status, 200);
  assertEquals(detailPayload.data.id, created.data.id);
});

Deno.test("joined player can read booking timeline for joined training session", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createdRes = await authed("/api/v1/coach/sessions", "coach-1", "coach", "POST", {
    courtId: "c1",
    date: "2099-12-30",
    startTime: "14:00",
    endTime: "15:00",
    duration: 60,
    maxPlayers: 4,
    amount: 500,
  });
  const created = await json(createdRes);
  assertEquals(createdRes.status, 200);

  const joinRes = await authed(`/api/v1/sessions/${created.data.id}/join`, "player-1", "player", "POST");
  assertEquals(joinRes.status, 200);

  const timelineRes = await authed(`/api/v1/bookings/${created.data.id}/timeline`, "player-1", "player", "GET");
  const timelinePayload = await json(timelineRes);
  assertEquals(timelineRes.status, 200);
  assertEquals(Array.isArray(timelinePayload.data), true);
  assertEquals(timelinePayload.data.length >= 1, true);
});

Deno.test("coach session create rejects amount with more than 2 decimal places", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/coach/sessions", "coach-1", "coach", "POST", {
    courtId: "c1",
    date: "2099-12-28",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    maxPlayers: 4,
    amount: 250.999,
  });
  const payload = await json(createRes);
  assertEquals(createRes.status, 400);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
});

Deno.test("coach session patch rejects workflow fields like status", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/coach/sessions", "coach-1", "coach", "POST", {
    courtId: "c1",
    date: "2099-12-29",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    maxPlayers: 4,
    amount: 300,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const patchRes = await authed(`/api/v1/coach/sessions/${created.data.id}`, "coach-1", "coach", "PATCH", {
    status: "cancelled",
  });
  const patchPayload = await json(patchRes);
  assertEquals(patchRes.status, 400);
  assertEquals(patchPayload.error.code, "VALIDATION_ERROR");
});

Deno.test("coach can patch own session notes and amount", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/coach/sessions", "coach-1", "coach", "POST", {
    courtId: "c1",
    date: "2099-12-30",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    maxPlayers: 4,
    amount: 300,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const patchRes = await authed(`/api/v1/coach/sessions/${created.data.id}`, "coach-1", "coach", "PATCH", {
    notes: "Bring cones and bibs",
    amount: 350.5,
  });
  const patched = await json(patchRes);
  assertEquals(patchRes.status, 200);
  assertEquals(patched.data.notes, "Bring cones and bibs");
  assertEquals(patched.data.amount, 350.5);
});

Deno.test("admin can mark past confirmed booking as completed", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2020-01-01",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const approveRes = await authed(`/api/v1/bookings/${created.data.id}/approve`, "admin-1", "admin", "POST");
  assertEquals(approveRes.status, 200);

  const completeRes = await authed(`/api/v1/bookings/${created.data.id}/complete`, "admin-1", "admin", "POST");
  const completed = await json(completeRes);
  assertEquals(completeRes.status, 200);
  assertEquals(completed.data.status, "completed");
});

Deno.test("assigned coach can mark past confirmed training booking as completed", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "training",
    coachId: "coach-1",
    date: "2020-01-03",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const approveRes = await authed(`/api/v1/bookings/${created.data.id}/approve`, "staff-1", "staff", "POST");
  assertEquals(approveRes.status, 200);

  const completeRes = await authed(`/api/v1/bookings/${created.data.id}/complete`, "coach-1", "coach", "POST");
  const completed = await json(completeRes);
  assertEquals(completeRes.status, 200);
  assertEquals(completed.data.status, "completed");
});

Deno.test("unassigned coach cannot mark training booking as completed", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const signupRes = await app.request("http://local.test/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "coach2@court.com", password: "coach12", role: "coach" }),
  });
  const signup = await json(signupRes);
  assertEquals(signupRes.status, 200);
  const coach2Id = signup.data.id as string;

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "training",
    coachId: "coach-1",
    date: "2020-01-04",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const approveRes = await authed(`/api/v1/bookings/${created.data.id}/approve`, "staff-1", "staff", "POST");
  assertEquals(approveRes.status, 200);

  const forbiddenRes = await authed(`/api/v1/bookings/${created.data.id}/complete`, coach2Id, "coach", "POST");
  const forbidden = await json(forbiddenRes);
  assertEquals(forbiddenRes.status, 403);
  assertEquals(forbidden.error.code, "FORBIDDEN");
});

Deno.test("staff can mark past unchecked confirmed booking as no-show", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2020-01-02",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const approveRes = await authed(`/api/v1/bookings/${created.data.id}/approve`, "staff-1", "staff", "POST");
  assertEquals(approveRes.status, 200);

  const noShowRes = await authed(`/api/v1/bookings/${created.data.id}/no-show`, "staff-1", "staff", "POST");
  const noShow = await json(noShowRes);
  assertEquals(noShowRes.status, 200);
  assertEquals(noShow.data.status, "no_show");
});

Deno.test("non-owner cannot mark another user's notification as read", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-28",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const approveRes = await authed(`/api/v1/requests/${created.data.id}/approve`, "staff-1", "staff", "POST");
  assertEquals(approveRes.status, 200);

  const notificationsRes = await authed("/api/v1/notifications?page=1&limit=20", "player-1", "player", "GET");
  const notificationsPayload = await json(notificationsRes);
  assertEquals(notificationsRes.status, 200);
  const targetNotificationId = notificationsPayload.data[0].id;

  const forbiddenReadRes = await authed(`/api/v1/notifications/${targetNotificationId}/read`, "staff-1", "staff", "POST");
  const forbidden = await json(forbiddenReadRes);
  assertEquals(forbiddenReadRes.status, 403);
  assertEquals(forbidden.error.code, "FORBIDDEN");
});

Deno.test("player cannot access another player's booking by id", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const signupRes = await app.request("http://local.test/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "player2@court.com", password: "player1", role: "player" }),
  });
  const signupPayload = await json(signupRes);
  assertEquals(signupRes.status, 200);
  const player2Id = signupPayload.data.id as string;

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-29",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const forbiddenRes = await authed(`/api/v1/bookings/${created.data.id}`, player2Id, "player", "GET");
  const forbidden = await json(forbiddenRes);
  assertEquals(forbiddenRes.status, 403);
  assertEquals(forbidden.error.code, "FORBIDDEN");
});

Deno.test("notifications unread-count reflects mark-all-read", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-30",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  await authed(`/api/v1/requests/${created.data.id}/approve`, "staff-1", "staff", "POST");

  const unreadBeforeRes = await authed("/api/v1/notifications/unread-count", "player-1", "player", "GET");
  const unreadBefore = await json(unreadBeforeRes);
  assertEquals(unreadBeforeRes.status, 200);
  assertEquals(unreadBefore.data.unread > 0, true);

  const markAllRes = await authed("/api/v1/notifications/mark-all-read", "player-1", "player", "POST");
  assertEquals(markAllRes.status, 200);

  const unreadAfterRes = await authed("/api/v1/notifications/unread-count", "player-1", "player", "GET");
  const unreadAfter = await json(unreadAfterRes);
  assertEquals(unreadAfterRes.status, 200);
  assertEquals(unreadAfter.data.unread, 0);
});

Deno.test("requests/:id returns only pending requests", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-31",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const pendingRes = await authed(`/api/v1/requests/${created.data.id}`, "staff-1", "staff", "GET");
  assertEquals(pendingRes.status, 200);

  await authed(`/api/v1/requests/${created.data.id}/approve`, "staff-1", "staff", "POST");
  const noLongerPendingRes = await authed(`/api/v1/requests/${created.data.id}`, "staff-1", "staff", "GET");
  const noLongerPending = await json(noLongerPendingRes);
  assertEquals(noLongerPendingRes.status, 409);
  assertEquals(noLongerPending.error.code, "CONFLICT");
});

Deno.test("player cannot patch booking status directly", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-01",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const patchRes = await authed(`/api/v1/bookings/${created.data.id}`, "player-1", "player", "PATCH", {
    status: "confirmed",
  });
  const patchPayload = await json(patchRes);
  assertEquals(patchRes.status, 400);
  assertEquals(patchPayload.error.code, "VALIDATION_ERROR");
});

Deno.test("player can patch own booking notes", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-02",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const patchRes = await authed(`/api/v1/bookings/${created.data.id}`, "player-1", "player", "PATCH", {
    notes: "Please prepare training balls.",
  });
  const patched = await json(patchRes);
  assertEquals(patchRes.status, 200);
  assertEquals(patched.data.notes, "Please prepare training balls.");
});

Deno.test("booking creation is rate limited per user when configured", async () => {
  __resetForTests();
  const prevMax = Deno.env.get("RATE_LIMIT_BOOKING_CREATE_MAX");
  const prevWindow = Deno.env.get("RATE_LIMIT_BOOKING_CREATE_WINDOW_SEC");
  Deno.env.set("RATE_LIMIT_BOOKING_CREATE_MAX", "1");
  Deno.env.set("RATE_LIMIT_BOOKING_CREATE_WINDOW_SEC", "60");
  try {
    await app.request("http://local.test/api/v1/courts");

    const firstCreate = await authed("/api/v1/bookings", "player-1", "player", "POST", {
      courtId: "c1",
      type: "private",
      date: "2099-11-04",
      startTime: "08:00",
      endTime: "09:00",
      duration: 60,
      amount: 500,
    });
    assertEquals(firstCreate.status, 200);

    const secondCreate = await authed("/api/v1/bookings", "player-1", "player", "POST", {
      courtId: "c1",
      type: "private",
      date: "2099-11-05",
      startTime: "08:00",
      endTime: "09:00",
      duration: 60,
      amount: 500,
    });
    const secondPayload = await json(secondCreate);
    assertEquals(secondCreate.status, 429);
    assertEquals(secondPayload.error.code, "RATE_LIMITED");
  } finally {
    if (prevMax == null) Deno.env.delete("RATE_LIMIT_BOOKING_CREATE_MAX");
    else Deno.env.set("RATE_LIMIT_BOOKING_CREATE_MAX", prevMax);
    if (prevWindow == null) Deno.env.delete("RATE_LIMIT_BOOKING_CREATE_WINDOW_SEC");
    else Deno.env.set("RATE_LIMIT_BOOKING_CREATE_WINDOW_SEC", prevWindow);
  }
});

Deno.test("player cannot patch workflow check-in field", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-03",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const patchRes = await authed(`/api/v1/bookings/${created.data.id}`, "player-1", "player", "PATCH", {
    checkedIn: true,
  });
  const patchPayload = await json(patchRes);
  assertEquals(patchRes.status, 400);
  assertEquals(patchPayload.error.code, "VALIDATION_ERROR");
});

Deno.test("coach can submit verification then staff can approve", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const submitRes = await authed("/api/v1/coach/verification/submit", "coach-1", "coach", "POST", {
    method: "certification",
    documentName: "National Coaching Certificate",
    verificationId: "CERT-12345",
  });
  const submitted = await json(submitRes);
  assertEquals(submitRes.status, 200);
  assertEquals(submitted.data.coachVerificationStatus, "pending");

  const pendingListRes = await authed("/api/v1/admin/coaches/verification?status=pending", "staff-1", "staff", "GET");
  const pendingList = await json(pendingListRes);
  assertEquals(pendingListRes.status, 200);
  assertEquals(pendingList.data.some((coach: { id: string }) => coach.id === "coach-1"), true);

  const approveRes = await authed("/api/v1/admin/coaches/coach-1/verification/approve", "staff-1", "staff", "POST");
  const approved = await json(approveRes);
  assertEquals(approveRes.status, 200);
  assertEquals(approved.data.coachVerificationStatus, "verified");
});

Deno.test("cannot approve coach verification that is not pending", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const approveRes = await authed("/api/v1/admin/coaches/coach-1/verification/approve", "admin-1", "admin", "POST");
  const approvePayload = await json(approveRes);
  assertEquals(approveRes.status, 409);
  assertEquals(approvePayload.error.code, "CONFLICT");
});

Deno.test("coach signup creates pending registration and blocks coach login until approved", async () => {
  __resetForTests();

  const signupRes = await app.request("http://local.test/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "coach-pending@court.com",
      password: "coach123",
      role: "coach",
      name: "Pending Coach",
      coachProfile: "Player development specialist",
      coachExpertise: ["Basketball"],
      verificationMethod: "certification",
      verificationDocumentName: "National Coaching Certificate",
      verificationId: "CERT-123",
    }),
  });
  const signupPayload = await json(signupRes);
  assertEquals(signupRes.status, 200);
  assertEquals(signupPayload.data.pending, true);
  assertEquals(signupPayload.data.role, "coach");

  const statusRes = await app.request("http://local.test/api/v1/auth/coach-registration-status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "coach-pending@court.com" }),
  });
  const statusPayload = await json(statusRes);
  assertEquals(statusRes.status, 200);
  assertEquals(statusPayload.data.status, "pending");
  assertEquals(statusPayload.data.canWithdraw, true);

  const loginRes = await app.request("http://local.test/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "coach-pending@court.com",
      password: "coach123",
      expectedRole: "coach",
    }),
  });
  const loginPayload = await json(loginRes);
  assertEquals(loginRes.status, 403);
  assertEquals(loginPayload.error.code, "COACH_APPLICATION_PENDING");
});

Deno.test("coach applicant can update and withdraw pending registration", async () => {
  __resetForTests();

  const signupRes = await app.request("http://local.test/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "coach-withdraw@court.com",
      password: "coach123",
      role: "coach",
      name: "Withdraw Coach",
      verificationMethod: "experience",
      verificationDocumentName: "Resume",
    }),
  });
  assertEquals(signupRes.status, 200);

  const updateRes = await app.request("http://local.test/api/v1/auth/coach-registration-update", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "coach-withdraw@court.com",
      password: "coach123",
      name: "Updated Withdraw Coach",
      coachProfile: "Updated profile",
      coachExpertise: ["Tennis", "Footwork"],
      verificationMethod: "license",
      verificationDocumentName: "Updated License",
      verificationId: "LIC-2026",
    }),
  });
  const updatePayload = await json(updateRes);
  assertEquals(updateRes.status, 200);
  assertEquals(updatePayload.data.name, "Updated Withdraw Coach");
  assertEquals(updatePayload.data.verificationMethod, "license");

  const withdrawRes = await app.request("http://local.test/api/v1/auth/coach-registration-withdraw", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "coach-withdraw@court.com",
      password: "coach123",
    }),
  });
  const withdrawPayload = await json(withdrawRes);
  assertEquals(withdrawRes.status, 200);
  assertEquals(withdrawPayload.data.withdrawn, true);

  const statusRes = await app.request("http://local.test/api/v1/auth/coach-registration-status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "coach-withdraw@court.com" }),
  });
  const statusPayload = await json(statusRes);
  assertEquals(statusRes.status, 200);
  assertEquals(statusPayload.data.status, "none");
});

Deno.test("admin can approve queued coach registration and coach can then log in", async () => {
  __resetForTests();

  const signupRes = await app.request("http://local.test/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "coach-approved@court.com",
      password: "coach123",
      role: "coach",
      name: "Approved Coach",
      coachProfile: "Approved profile",
      coachExpertise: ["Basketball"],
      verificationMethod: "certification",
      verificationDocumentName: "Coach Cert",
    }),
  });
  assertEquals(signupRes.status, 200);

  const listRes = await authed("/api/v1/admin/coach-registrations?page=1&limit=20", "admin-1", "admin", "GET");
  const listPayload = await json(listRes);
  assertEquals(listRes.status, 200);
  const registration = (listPayload.data as any[]).find((item) => item.email === "coach-approved@court.com");
  assertEquals(Boolean(registration), true);

  const approveRes = await authed(
    `/api/v1/admin/coaches/coach-reg-${registration.id}/verification/approve`,
    "admin-1",
    "admin",
    "POST",
    { notes: "Verified and approved" },
  );
  const approvePayload = await json(approveRes);
  assertEquals(approveRes.status, 200);
  assertEquals(approvePayload.data.role, "coach");
  assertEquals(approvePayload.data.coachVerificationStatus, "verified");

  const loginRes = await app.request("http://local.test/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "coach-approved@court.com",
      password: "coach123",
      expectedRole: "coach",
    }),
  });
  const loginPayload = await json(loginRes);
  assertEquals(loginRes.status, 200);
  assertEquals(loginPayload.data.user.role, "coach");
});

Deno.test("rejected coach registration can be resubmitted and reopened by admin", async () => {
  __resetForTests();

  const signupRes = await app.request("http://local.test/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "coach-resubmit@court.com",
      password: "coach123",
      role: "coach",
      name: "Resubmit Coach",
      verificationMethod: "other",
      verificationDocumentName: "Portfolio",
    }),
  });
  assertEquals(signupRes.status, 200);

  const listRes = await authed("/api/v1/admin/coach-registrations?page=1&limit=20", "admin-1", "admin", "GET");
  const listPayload = await json(listRes);
  const registration = (listPayload.data as any[]).find((item) => item.email === "coach-resubmit@court.com");
  assertEquals(Boolean(registration), true);

  const rejectRes = await authed(
    `/api/v1/admin/coaches/coach-reg-${registration.id}/verification/reject`,
    "admin-1",
    "admin",
    "POST",
    { reason: "Need additional documents" },
  );
  const rejectPayload = await json(rejectRes);
  assertEquals(rejectRes.status, 200);
  assertEquals(rejectPayload.data.coachVerificationStatus, "rejected");

  const rejectedLoginRes = await app.request("http://local.test/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "coach-resubmit@court.com",
      password: "coach123",
      expectedRole: "coach",
    }),
  });
  const rejectedLoginPayload = await json(rejectedLoginRes);
  assertEquals(rejectedLoginRes.status, 403);
  assertEquals(rejectedLoginPayload.error.code, "COACH_APPLICATION_REJECTED");

  const resubmitRes = await app.request("http://local.test/api/v1/auth/coach-registration-resubmit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "coach-resubmit@court.com",
      password: "coach123",
      name: "Resubmit Coach",
      verificationMethod: "license",
      verificationDocumentName: "Renewed License",
    }),
  });
  const resubmitPayload = await json(resubmitRes);
  assertEquals(resubmitRes.status, 200);
  assertEquals(resubmitPayload.data.status, "pending");

  const refreshListRes = await authed("/api/v1/admin/coach-registrations?page=1&limit=20", "admin-1", "admin", "GET");
  const refreshListPayload = await json(refreshListRes);
  const refreshedRegistration = (refreshListPayload.data as any[]).find((item) => item.email === "coach-resubmit@court.com");
  assertEquals(Boolean(refreshedRegistration), true);

  const reopenRes = await authed(
    `/api/v1/admin/coach-registrations/${refreshedRegistration.id}/reopen`,
    "admin-1",
    "admin",
    "POST",
    { note: "Moved back to review queue" },
  );
  const reopenPayload = await json(reopenRes);
  assertEquals(reopenRes.status, 200);
  assertEquals(reopenPayload.data.status, "pending");
});

Deno.test("admin coach registration endpoints return summary detail and allow delete", async () => {
  __resetForTests();

  const firstSignupRes = await app.request("http://local.test/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "coach-summary-1@court.com",
      password: "coach123",
      role: "coach",
      name: "Coach Summary One",
      verificationMethod: "certification",
      verificationDocumentName: "Summary Cert One",
    }),
  });
  assertEquals(firstSignupRes.status, 200);

  const secondSignupRes = await app.request("http://local.test/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "coach-summary-2@court.com",
      password: "coach123",
      role: "coach",
      name: "Coach Summary Two",
      verificationMethod: "experience",
      verificationDocumentName: "Summary Resume Two",
    }),
  });
  assertEquals(secondSignupRes.status, 200);

  const listRes = await authed(
    "/api/v1/admin/coach-registrations?status=pending&search=summary&page=1&limit=20",
    "staff-1",
    "staff",
    "GET",
  );
  const listPayload = await json(listRes);
  assertEquals(listRes.status, 200);
  assertEquals(Array.isArray(listPayload.data), true);
  assertEquals(listPayload.data.length >= 2, true);
  assertEquals(listPayload.meta.counts.pending >= 2, true);

  const target = (listPayload.data as any[]).find((item) => item.email === "coach-summary-1@court.com");
  assertEquals(Boolean(target), true);

  const detailRes = await authed(
    `/api/v1/admin/coach-registrations/${target.id}`,
    "staff-1",
    "staff",
    "GET",
  );
  const detailPayload = await json(detailRes);
  assertEquals(detailRes.status, 200);
  assertEquals(detailPayload.data.email, "coach-summary-1@court.com");
  assertEquals(typeof detailPayload.data.password, "undefined");

  const summaryRes = await authed("/api/v1/admin/coach-registrations/summary", "staff-1", "staff", "GET");
  const summaryPayload = await json(summaryRes);
  assertEquals(summaryRes.status, 200);
  assertEquals(summaryPayload.data.pending >= 2, true);
  assertEquals(summaryPayload.data.total >= 2, true);

  const deleteRes = await authed(
    `/api/v1/admin/coach-registrations/${target.id}`,
    "admin-1",
    "admin",
    "DELETE",
  );
  const deletePayload = await json(deleteRes);
  assertEquals(deleteRes.status, 200);
  assertEquals(deletePayload.data.deleted, true);

  const missingDetailRes = await authed(
    `/api/v1/admin/coach-registrations/${target.id}`,
    "staff-1",
    "staff",
    "GET",
  );
  const missingDetailPayload = await json(missingDetailRes);
  assertEquals(missingDetailRes.status, 404);
  assertEquals(missingDetailPayload.error.code, "NOT_FOUND");
});

Deno.test("public coaches endpoint returns only verified by default", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const promoteRes = await authed("/api/v1/admin/users/player-1", "admin-1", "admin", "PATCH", {
    role: "coach",
    name: "Unverified Coach",
  });
  const promotePayload = await json(promoteRes);
  assertEquals(promoteRes.status, 200);
  assertEquals(promotePayload.data.role, "coach");

  const coachesRes = await app.request("http://local.test/api/v1/coaches");
  const coachesPayload = await json(coachesRes);
  assertEquals(coachesRes.status, 200);
  assertEquals(coachesPayload.data.some((coach: { id: string }) => coach.id === "player-1"), false);

  const allCoachesRes = await app.request("http://local.test/api/v1/coaches?includeUnverified=true");
  const allCoachesPayload = await json(allCoachesRes);
  assertEquals(allCoachesRes.status, 200);
  assertEquals(allCoachesPayload.data.some((coach: { id: string }) => coach.id === "player-1"), true);
});

Deno.test("owner can fetch booking receipt", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c3",
    type: "private",
    date: "2099-11-10",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    amount: 300,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const receiptRes = await authed(`/api/v1/bookings/${created.data.id}/receipt`, "player-1", "player", "GET");
  const receipt = await json(receiptRes);
  assertEquals(receiptRes.status, 200);
  assertEquals(receipt.data.bookingId, created.data.id);
  assertEquals(receipt.data.paymentSummary.total, 300);
  assertEquals(typeof receipt.data.receiptToken, "string");
});

Deno.test("joined player cannot fetch receipt for another user's training booking", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "coach-1", "coach", "POST", {
    courtId: "c2",
    type: "training",
    date: "2099-12-29",
    startTime: "16:00",
    endTime: "17:00",
    duration: 60,
    amount: 400,
    coachId: "coach-1",
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const joinRes = await authed(`/api/v1/sessions/${created.data.id}/join`, "player-1", "player", "POST");
  assertEquals([200, 409].includes(joinRes.status), true);

  const receiptRes = await authed(`/api/v1/bookings/${created.data.id}/receipt`, "player-1", "player", "GET");
  const receipt = await json(receiptRes);
  assertEquals(receiptRes.status, 403);
  assertEquals(receipt.error.code, "FORBIDDEN");
});

Deno.test("public receipt endpoint returns receipt by token", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-13",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const privateReceiptRes = await authed(`/api/v1/bookings/${created.data.id}/receipt`, "player-1", "player", "GET");
  const privateReceipt = await json(privateReceiptRes);
  assertEquals(privateReceiptRes.status, 200);

  const token = privateReceipt.data.receiptToken as string;
  const publicReceiptRes = await app.request(`http://local.test/api/v1/public/receipts/${token}`);
  const publicReceipt = await json(publicReceiptRes);
  assertEquals(publicReceiptRes.status, 200);
  assertEquals(publicReceipt.data.bookingId, created.data.id);
  assertEquals(typeof publicReceipt.data.player?.name, "string");
  assertEquals(publicReceipt.data.player?.email, undefined);
});

Deno.test("public receipt endpoint returns 404 for unknown token", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const res = await app.request("http://local.test/api/v1/public/receipts/not-a-real-token");
  const payload = await json(res);
  assertEquals(res.status, 404);
  assertEquals(payload.error.code, "NOT_FOUND");
});

Deno.test("staff can update booking payment status", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c2",
    type: "private",
    date: "2099-11-11",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const payRes = await authed(`/api/v1/bookings/${created.data.id}/payment`, "staff-1", "staff", "POST", {
    paymentStatus: "paid",
  });
  const paid = await json(payRes);
  assertEquals(payRes.status, 200);
  assertEquals(paid.data.paymentStatus, "paid");
});

Deno.test("invalid booking payment status is rejected", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c2",
    type: "private",
    date: "2099-11-12",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const payRes = await authed(`/api/v1/bookings/${created.data.id}/payment`, "admin-1", "admin", "POST", {
    paymentStatus: "something_else",
  });
  const pay = await json(payRes);
  assertEquals(payRes.status, 400);
  assertEquals(pay.error.code, "VALIDATION_ERROR");
});

Deno.test("player can create payment checkout transaction", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-19",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "gcash",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 200);
  assertEquals(checkout.data.bookingId, created.data.id);
  assertEquals(checkout.data.method, "gcash");
  assertEquals(checkout.data.status, "pending");
});

Deno.test("joined player cannot initiate payment checkout for another user's training booking", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "coach-1", "coach", "POST", {
    courtId: "c3",
    type: "training",
    date: "2099-12-30",
    startTime: "13:00",
    endTime: "14:00",
    duration: 60,
    amount: 500,
    coachId: "coach-1",
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const joinRes = await authed(`/api/v1/sessions/${created.data.id}/join`, "player-1", "player", "POST");
  assertEquals([200, 409].includes(joinRes.status), true);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "gcash",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 403);
  assertEquals(checkout.error.code, "FORBIDDEN");
});

Deno.test("payment webhook paid marks booking as paid", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-18",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "maya",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 200);

  const webhookRes = await app.request("http://local.test/api/v1/payments/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ txId: checkout.data.id, status: "paid" }),
  });
  const webhook = await json(webhookRes);
  assertEquals(webhookRes.status, 200);
  assertEquals(webhook.data.acknowledged, true);
  assertEquals(webhook.data.status, "paid");

  const bookingRes = await authed(`/api/v1/bookings/${created.data.id}`, "player-1", "player", "GET");
  const booking = await json(bookingRes);
  assertEquals(bookingRes.status, 200);
  assertEquals(booking.data.paymentStatus, "paid");
});

Deno.test("payment webhook duplicate event is replayed once", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-15",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "maya",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 200);

  const webhookBody = { eventId: "evt-1", txId: checkout.data.id, status: "paid" };
  const firstRes = await app.request("http://local.test/api/v1/payments/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(webhookBody),
  });
  const firstPayload = await json(firstRes);
  assertEquals(firstRes.status, 200);
  assertEquals(firstPayload.data.replayed ?? false, false);

  const secondRes = await app.request("http://local.test/api/v1/payments/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(webhookBody),
  });
  const secondPayload = await json(secondRes);
  assertEquals(secondRes.status, 200);
  assertEquals(secondPayload.data.replayed, true);

  const notificationsRes = await authed("/api/v1/notifications?page=1&limit=100", "player-1", "player", "GET");
  const notificationsPayload = await json(notificationsRes);
  assertEquals(notificationsRes.status, 200);
  const confirmedCount = (notificationsPayload.data as Array<{ title: string }>).filter(
    (n) => n.title === "Payment Confirmed",
  ).length;
  assertEquals(confirmedCount, 1);
});

Deno.test("payment webhook does not downgrade paid transaction status", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-16",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "maya",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 200);

  const paidRes = await app.request("http://local.test/api/v1/payments/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventId: "evt-paid-1", txId: checkout.data.id, status: "paid" }),
  });
  assertEquals(paidRes.status, 200);

  const failedAfterPaidRes = await app.request("http://local.test/api/v1/payments/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventId: "evt-failed-1", txId: checkout.data.id, status: "failed" }),
  });
  const failedAfterPaid = await json(failedAfterPaidRes);
  assertEquals(failedAfterPaidRes.status, 200);
  assertEquals(failedAfterPaid.data.status, "paid");

  const txRes = await authed(`/api/v1/payments/${checkout.data.id}`, "player-1", "player", "GET");
  const txPayload = await json(txRes);
  assertEquals(txRes.status, 200);
  assertEquals(txPayload.data.status, "paid");

  const bookingRes = await authed(`/api/v1/bookings/${created.data.id}`, "player-1", "player", "GET");
  const bookingPayload = await json(bookingRes);
  assertEquals(bookingRes.status, 200);
  assertEquals(bookingPayload.data.paymentStatus, "paid");
});

Deno.test("payment webhook with unknown status does not mutate transaction state", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c2",
    type: "private",
    date: "2099-11-17",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 450,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "gcash",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 200);
  assertEquals(checkout.data.status, "pending");

  const webhookRes = await app.request("http://local.test/api/v1/payments/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventId: "evt-unknown-1", txId: checkout.data.id, status: "not_a_real_status" }),
  });
  const webhookPayload = await json(webhookRes);
  assertEquals(webhookRes.status, 200);
  assertEquals(webhookPayload.data.status, "pending");

  const txRes = await authed(`/api/v1/payments/${checkout.data.id}`, "player-1", "player", "GET");
  const txPayload = await json(txRes);
  assertEquals(txRes.status, 200);
  assertEquals(txPayload.data.status, "pending");

  const bookingRes = await authed(`/api/v1/bookings/${created.data.id}`, "player-1", "player", "GET");
  const bookingPayload = await json(bookingRes);
  assertEquals(bookingRes.status, 200);
  assertEquals(bookingPayload.data.paymentStatus, "unpaid");
});

Deno.test("payment webhook paid does not mark cancelled booking as paid", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c3",
    type: "private",
    date: "2099-11-20",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "maya",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 200);

  const cancelRes = await authed(`/api/v1/bookings/${created.data.id}/cancel`, "player-1", "player", "POST");
  assertEquals(cancelRes.status, 200);

  const webhookRes = await app.request("http://local.test/api/v1/payments/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventId: "evt-paid-cancelled-1", txId: checkout.data.id, status: "paid" }),
  });
  const webhookPayload = await json(webhookRes);
  assertEquals(webhookRes.status, 200);
  assertEquals(webhookPayload.data.status, "paid");

  const bookingRes = await authed(`/api/v1/bookings/${created.data.id}`, "player-1", "player", "GET");
  const bookingPayload = await json(bookingRes);
  assertEquals(bookingRes.status, 200);
  assertEquals(bookingPayload.data.status, "cancelled");
  assertEquals(bookingPayload.data.paymentStatus, "unpaid");

  const txRes = await authed(`/api/v1/payments/${checkout.data.id}`, "player-1", "player", "GET");
  const txPayload = await json(txRes);
  assertEquals(txRes.status, 200);
  assertEquals(txPayload.data.status, "paid");
});

Deno.test("payment webhook rejects invalid signature when secret is configured", async () => {
  __resetForTests();
  const prevSecret = Deno.env.get("PAYMENT_WEBHOOK_SECRET");
  Deno.env.set("PAYMENT_WEBHOOK_SECRET", "expected-signature");
  try {
    await app.request("http://local.test/api/v1/courts");

    const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
      courtId: "c1",
      type: "private",
      date: "2099-11-14",
      startTime: "09:00",
      endTime: "10:00",
      duration: 60,
      amount: 500,
    });
    const created = await json(createRes);
    assertEquals(createRes.status, 200);

    const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
      bookingId: created.data.id,
      method: "maya",
    });
    const checkout = await json(checkoutRes);
    assertEquals(checkoutRes.status, 200);

    const webhookRes = await app.request("http://local.test/api/v1/payments/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-signature": "wrong-signature",
      },
      body: JSON.stringify({ txId: checkout.data.id, status: "paid" }),
    });
    const webhook = await json(webhookRes);
    assertEquals(webhookRes.status, 401);
    assertEquals(webhook.error.code, "UNAUTHENTICATED");
  } finally {
    if (prevSecret == null) Deno.env.delete("PAYMENT_WEBHOOK_SECRET");
    else Deno.env.set("PAYMENT_WEBHOOK_SECRET", prevSecret);
  }
});

Deno.test("payment webhook duplicate event still requires valid signature when secret is configured", async () => {
  __resetForTests();
  const prevSecret = Deno.env.get("PAYMENT_WEBHOOK_SECRET");
  Deno.env.set("PAYMENT_WEBHOOK_SECRET", "expected-signature");
  try {
    await app.request("http://local.test/api/v1/courts");

    const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
      courtId: "c1",
      type: "private",
      date: "2099-12-14",
      startTime: "09:00",
      endTime: "10:00",
      duration: 60,
      amount: 500,
    });
    const created = await json(createRes);
    assertEquals(createRes.status, 200);

    const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
      bookingId: created.data.id,
      method: "maya",
    });
    const checkout = await json(checkoutRes);
    assertEquals(checkoutRes.status, 200);

    const eventBody = { eventId: "evt-signed-dup-1", txId: checkout.data.id, status: "paid" };

    const firstRes = await app.request("http://local.test/api/v1/payments/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-signature": "expected-signature",
      },
      body: JSON.stringify(eventBody),
    });
    assertEquals(firstRes.status, 200);

    const secondRes = await app.request("http://local.test/api/v1/payments/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-signature": "wrong-signature",
      },
      body: JSON.stringify(eventBody),
    });
    const secondPayload = await json(secondRes);
    assertEquals(secondRes.status, 401);
    assertEquals(secondPayload.error.code, "UNAUTHENTICATED");
  } finally {
    if (prevSecret == null) Deno.env.delete("PAYMENT_WEBHOOK_SECRET");
    else Deno.env.set("PAYMENT_WEBHOOK_SECRET", prevSecret);
  }
});

Deno.test("admin can dry-run stale payment expiration", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-29",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "gcash",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 200);

  const dryRunRes = await authed("/api/v1/admin/payments/expire-stale", "admin-1", "admin", "POST", {
    dryRun: true,
    olderThanMinutes: 1,
    referenceNow: "2100-01-01T00:00:00.000Z",
  });
  const dryRun = await json(dryRunRes);
  assertEquals(dryRunRes.status, 200);
  assertEquals(dryRun.data.matched >= 1, true);
  assertEquals(dryRun.data.txIds.includes(checkout.data.id), true);

  const txRes = await authed(`/api/v1/payments/${checkout.data.id}`, "player-1", "player", "GET");
  const txPayload = await json(txRes);
  assertEquals(txRes.status, 200);
  assertEquals(txPayload.data.status, "pending");
});

Deno.test("admin can expire stale payment transactions", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-30",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "maya",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 200);

  const expireRes = await authed("/api/v1/admin/payments/expire-stale", "staff-1", "staff", "POST", {
    dryRun: false,
    olderThanMinutes: 1,
    referenceNow: "2100-01-01T00:00:00.000Z",
  });
  const expired = await json(expireRes);
  assertEquals(expireRes.status, 200);
  assertEquals(expired.data.expired >= 1, true);
  assertEquals(expired.data.txIds.includes(checkout.data.id), true);

  const txRes = await authed(`/api/v1/payments/${checkout.data.id}`, "player-1", "player", "GET");
  const txPayload = await json(txRes);
  assertEquals(txRes.status, 200);
  assertEquals(txPayload.data.status, "expired");
});

Deno.test("player can retry expired payment transaction", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-01",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "maya",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 200);

  await authed("/api/v1/admin/payments/expire-stale", "admin-1", "admin", "POST", {
    dryRun: false,
    olderThanMinutes: 1,
    referenceNow: "2100-01-01T00:00:00.000Z",
  });

  const retryRes = await authed(`/api/v1/payments/${checkout.data.id}/retry`, "player-1", "player", "POST");
  const retryPayload = await json(retryRes);
  assertEquals(retryRes.status, 200);
  assertEquals(retryPayload.data.id === checkout.data.id, false);
  assertEquals(retryPayload.data.bookingId, created.data.id);
  assertEquals(retryPayload.data.method, "maya");
});

Deno.test("player can retry expired payment transaction when bearer auth is required", async () => {
  __resetForTests();
  const previous = Deno.env.get("AUTH_REQUIRE_BEARER");
  Deno.env.set("AUTH_REQUIRE_BEARER", "true");
  try {
    await app.request("http://local.test/api/v1/courts");

    const createRes = await authedBearer("/api/v1/bookings", "mock-access-player-1", "POST", {
      courtId: "c1",
      type: "private",
      date: "2099-12-10",
      startTime: "09:00",
      endTime: "10:00",
      duration: 60,
      amount: 500,
    });
    const created = await json(createRes);
    assertEquals(createRes.status, 200);

    const checkoutRes = await authedBearer("/api/v1/payments/checkout", "mock-access-player-1", "POST", {
      bookingId: created.data.id,
      method: "maya",
    });
    const checkout = await json(checkoutRes);
    assertEquals(checkoutRes.status, 200);

    const expireRes = await authedBearer("/api/v1/admin/payments/expire-stale", "mock-access-admin-1", "POST", {
      dryRun: false,
      olderThanMinutes: 1,
      referenceNow: "2100-01-01T00:00:00.000Z",
    });
    assertEquals(expireRes.status, 200);

    const retryRes = await authedBearer(`/api/v1/payments/${checkout.data.id}/retry`, "mock-access-player-1", "POST");
    const retryPayload = await json(retryRes);
    assertEquals(retryRes.status, 200);
    assertEquals(retryPayload.data.id === checkout.data.id, false);
    assertEquals(retryPayload.data.bookingId, created.data.id);
  } finally {
    if (previous == null) Deno.env.delete("AUTH_REQUIRE_BEARER");
    else Deno.env.set("AUTH_REQUIRE_BEARER", previous);
  }
});

Deno.test("cannot retry pending payment transaction", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-02",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "gcash",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 200);

  const retryRes = await authed(`/api/v1/payments/${checkout.data.id}/retry`, "player-1", "player", "POST");
  const retryPayload = await json(retryRes);
  assertEquals(retryRes.status, 409);
  assertEquals(retryPayload.error.code, "CONFLICT");
});

Deno.test("cannot retry payment transaction for cancelled booking", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-23",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "maya",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 200);

  const cancelRes = await authed(`/api/v1/bookings/${created.data.id}/cancel`, "player-1", "player", "POST");
  assertEquals(cancelRes.status, 200);

  const webhookFailedRes = await app.request("http://local.test/api/v1/payments/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventId: "evt-retry-cancelled-1", txId: checkout.data.id, status: "failed" }),
  });
  assertEquals(webhookFailedRes.status, 200);

  const retryRes = await authed(`/api/v1/payments/${checkout.data.id}/retry`, "player-1", "player", "POST");
  const retryPayload = await json(retryRes);
  assertEquals(retryRes.status, 409);
  assertEquals(retryPayload.error.code, "CONFLICT");
});

Deno.test("admin can view payment health summary", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-03",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "maya",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 200);

  await authed("/api/v1/admin/payments/expire-stale", "admin-1", "admin", "POST", {
    dryRun: false,
    olderThanMinutes: 1,
    referenceNow: "2100-01-01T00:00:00.000Z",
  });
  await authed(`/api/v1/payments/${checkout.data.id}/retry`, "player-1", "player", "POST");

  const healthRes = await authed("/api/v1/admin/payments/health?days=365", "staff-1", "staff", "GET");
  const health = await json(healthRes);
  assertEquals(healthRes.status, 200);
  assertEquals(typeof health.data.totals.transactions, "number");
  assertEquals(typeof health.data.totals.retries, "number");
  assertEquals(typeof health.data.statusCounts.pending, "number");
  assertEquals(typeof health.data.mismatch.paidTxBookingUnpaid, "number");
});

Deno.test("payment health validates days query", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const res = await authed("/api/v1/admin/payments/health?days=0", "admin-1", "admin", "GET");
  const payload = await json(res);
  assertEquals(res.status, 400);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
});

Deno.test("player can list own payment transactions", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-17",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "gcash",
  });

  const listRes = await authed("/api/v1/payments?page=1&limit=10", "player-1", "player", "GET");
  const listPayload = await json(listRes);
  assertEquals(listRes.status, 200);
  assertEquals(Array.isArray(listPayload.data), true);
  assertEquals(listPayload.data.length > 0, true);
  assertEquals(listPayload.data[0].userId, "player-1");
});

Deno.test("player cannot access another user's payment transaction", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const signupRes = await app.request("http://local.test/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "player3@court.com", password: "player1", role: "player" }),
  });
  const signupPayload = await json(signupRes);
  assertEquals(signupRes.status, 200);
  const player3Id = signupPayload.data.id as string;

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-16",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "maya",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 200);

  const forbiddenRes = await authed(`/api/v1/payments/${checkout.data.id}`, player3Id, "player", "GET");
  const forbidden = await json(forbiddenRes);
  assertEquals(forbiddenRes.status, 403);
  assertEquals(forbidden.error.code, "FORBIDDEN");
});

Deno.test("staff can query reconciliation for paid tx but unpaid booking mismatch", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-14",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "maya",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 200);

  const webhookRes = await app.request("http://local.test/api/v1/payments/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ txId: checkout.data.id, status: "paid" }),
  });
  assertEquals(webhookRes.status, 200);

  const forceUnpaidRes = await authed(`/api/v1/bookings/${created.data.id}/payment`, "staff-1", "staff", "POST", {
    paymentStatus: "unpaid",
  });
  assertEquals(forceUnpaidRes.status, 200);

  const reconRes = await authed(
    "/api/v1/admin/payments/reconciliation?issueType=paid_tx_booking_unpaid&page=1&limit=20",
    "staff-1",
    "staff",
    "GET",
  );
  const reconPayload = await json(reconRes);
  assertEquals(reconRes.status, 200);
  assertEquals(reconPayload.data.length > 0, true);
  assertEquals(reconPayload.data[0].issueType, "paid_tx_booking_unpaid");
});

Deno.test("staff reconciliation detects confirmed unpaid booking without tx", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-22",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const confirmRes = await authed(`/api/v1/bookings/${created.data.id}/status`, "staff-1", "staff", "PATCH", {
    status: "confirmed",
  });
  assertEquals(confirmRes.status, 200);

  const reconRes = await authed(
    "/api/v1/admin/payments/reconciliation?issueType=confirmed_unpaid_without_tx&page=1&limit=20",
    "staff-1",
    "staff",
    "GET",
  );
  const reconPayload = await json(reconRes);
  assertEquals(reconRes.status, 200);
  assertEquals(reconPayload.data.length > 0, true);
  assertEquals(reconPayload.data[0].issueType, "confirmed_unpaid_without_tx");
});

Deno.test("staff can resolve paid_tx_booking_unpaid mismatch", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-23",
    startTime: "11:00",
    endTime: "12:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "gcash",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 200);

  const webhookRes = await app.request("http://local.test/api/v1/payments/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ txId: checkout.data.id, status: "paid" }),
  });
  assertEquals(webhookRes.status, 200);

  const forceUnpaidRes = await authed(`/api/v1/bookings/${created.data.id}/payment`, "staff-1", "staff", "POST", {
    paymentStatus: "unpaid",
  });
  assertEquals(forceUnpaidRes.status, 200);

  const resolveRes = await authed("/api/v1/admin/payments/reconciliation/resolve", "staff-1", "staff", "POST", {
    issueType: "paid_tx_booking_unpaid",
    bookingId: created.data.id,
    dryRun: false,
  });
  const resolvePayload = await json(resolveRes);
  assertEquals(resolveRes.status, 200);
  assertEquals(resolvePayload.data.resolved, true);

  const bookingRes = await authed(`/api/v1/bookings/${created.data.id}`, "player-1", "player", "GET");
  const booking = await json(bookingRes);
  assertEquals(bookingRes.status, 200);
  assertEquals(booking.data.paymentStatus, "paid");
});

Deno.test("staff can resolve booking_paid_without_paid_tx mismatch", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-24",
    startTime: "11:00",
    endTime: "12:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const setPaidRes = await authed(`/api/v1/bookings/${created.data.id}/payment`, "staff-1", "staff", "POST", {
    paymentStatus: "paid",
  });
  assertEquals(setPaidRes.status, 200);

  const resolveRes = await authed("/api/v1/admin/payments/reconciliation/resolve", "staff-1", "staff", "POST", {
    issueType: "booking_paid_without_paid_tx",
    bookingId: created.data.id,
    dryRun: false,
  });
  const resolvePayload = await json(resolveRes);
  assertEquals(resolveRes.status, 200);
  assertEquals(resolvePayload.data.resolved, true);

  const bookingRes = await authed(`/api/v1/bookings/${created.data.id}`, "player-1", "player", "GET");
  const booking = await json(bookingRes);
  assertEquals(bookingRes.status, 200);
  assertEquals(booking.data.paymentStatus, "unpaid");
});

Deno.test("staff can export reconciliation report as csv", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-25",
    startTime: "11:00",
    endTime: "12:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  await authed(`/api/v1/bookings/${created.data.id}/status`, "staff-1", "staff", "PATCH", {
    status: "confirmed",
  });

  const exportRes = await authed(
    "/api/v1/admin/payments/reconciliation/export?format=csv&issueType=confirmed_unpaid_without_tx",
    "staff-1",
    "staff",
    "GET",
  );
  const payload = await json(exportRes);
  assertEquals(exportRes.status, 200);
  assertEquals(payload.data.format, "csv");
  assertEquals(typeof payload.data.data, "string");
  assertEquals(payload.data.data.includes("issueType,severity,bookingId"), true);
});

Deno.test("reconciliation export rejects invalid format", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const exportRes = await authed(
    "/api/v1/admin/payments/reconciliation/export?format=xml",
    "staff-1",
    "staff",
    "GET",
  );
  const payload = await json(exportRes);
  assertEquals(exportRes.status, 400);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
});

Deno.test("bulk reconciliation resolve supports partial success", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-26",
    startTime: "11:00",
    endTime: "12:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "gcash",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 200);

  const webhookRes = await app.request("http://local.test/api/v1/payments/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ txId: checkout.data.id, status: "paid" }),
  });
  assertEquals(webhookRes.status, 200);

  const forceUnpaidRes = await authed(`/api/v1/bookings/${created.data.id}/payment`, "staff-1", "staff", "POST", {
    paymentStatus: "unpaid",
  });
  assertEquals(forceUnpaidRes.status, 200);

  const bulkRes = await authed("/api/v1/admin/payments/reconciliation/resolve/bulk", "staff-1", "staff", "POST", {
    dryRun: false,
    items: [
      { issueType: "paid_tx_booking_unpaid", bookingId: created.data.id },
      { issueType: "not_a_real_issue", bookingId: created.data.id },
    ],
  });
  const bulkPayload = await json(bulkRes);
  assertEquals(bulkRes.status, 200);
  assertEquals(bulkPayload.meta.successCount, 1);
  assertEquals(bulkPayload.meta.failureCount, 1);
});

Deno.test("bulk reconciliation dry-run does not mutate booking payment status", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-27",
    startTime: "11:00",
    endTime: "12:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "maya",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 200);

  const webhookRes = await app.request("http://local.test/api/v1/payments/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ txId: checkout.data.id, status: "paid" }),
  });
  assertEquals(webhookRes.status, 200);

  await authed(`/api/v1/bookings/${created.data.id}/payment`, "staff-1", "staff", "POST", {
    paymentStatus: "unpaid",
  });

  const bulkRes = await authed("/api/v1/admin/payments/reconciliation/resolve/bulk", "staff-1", "staff", "POST", {
    dryRun: true,
    items: [{ issueType: "paid_tx_booking_unpaid", bookingId: created.data.id }],
  });
  assertEquals(bulkRes.status, 200);

  const bookingRes = await authed(`/api/v1/bookings/${created.data.id}`, "player-1", "player", "GET");
  const bookingPayload = await json(bookingRes);
  assertEquals(bookingRes.status, 200);
  assertEquals(bookingPayload.data.paymentStatus, "unpaid");
});

Deno.test("resolve-by-filter processes matched reconciliation issues", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-28",
    startTime: "11:00",
    endTime: "12:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const checkoutRes = await authed("/api/v1/payments/checkout", "player-1", "player", "POST", {
    bookingId: created.data.id,
    method: "gcash",
  });
  const checkout = await json(checkoutRes);
  assertEquals(checkoutRes.status, 200);

  const webhookRes = await app.request("http://local.test/api/v1/payments/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ txId: checkout.data.id, status: "paid" }),
  });
  assertEquals(webhookRes.status, 200);

  await authed(`/api/v1/bookings/${created.data.id}/payment`, "staff-1", "staff", "POST", {
    paymentStatus: "unpaid",
  });

  const resolveRes = await authed(
    "/api/v1/admin/payments/reconciliation/resolve/by-filter",
    "staff-1",
    "staff",
    "POST",
    {
      issueType: "paid_tx_booking_unpaid",
      maxItems: 10,
      dryRun: false,
    },
  );
  const resolvePayload = await json(resolveRes);
  assertEquals(resolveRes.status, 200);
  assertEquals(resolvePayload.meta.successCount >= 1, true);

  const bookingRes = await authed(`/api/v1/bookings/${created.data.id}`, "player-1", "player", "GET");
  const bookingPayload = await json(bookingRes);
  assertEquals(bookingRes.status, 200);
  assertEquals(bookingPayload.data.paymentStatus, "paid");
});

Deno.test("resolve-by-filter works when bearer auth is required", async () => {
  __resetForTests();
  const previous = Deno.env.get("AUTH_REQUIRE_BEARER");
  Deno.env.set("AUTH_REQUIRE_BEARER", "true");
  try {
    await app.request("http://local.test/api/v1/courts");

    const createRes = await authedBearer("/api/v1/bookings", "mock-access-player-1", "POST", {
      courtId: "c1",
      type: "private",
      date: "2099-12-11",
      startTime: "11:00",
      endTime: "12:00",
      duration: 60,
      amount: 500,
    });
    const created = await json(createRes);
    assertEquals(createRes.status, 200);

    const checkoutRes = await authedBearer("/api/v1/payments/checkout", "mock-access-player-1", "POST", {
      bookingId: created.data.id,
      method: "gcash",
    });
    const checkout = await json(checkoutRes);
    assertEquals(checkoutRes.status, 200);

    const webhookRes = await app.request("http://local.test/api/v1/payments/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txId: checkout.data.id, status: "paid" }),
    });
    assertEquals(webhookRes.status, 200);

    const forceUnpaidRes = await authedBearer(`/api/v1/bookings/${created.data.id}/payment`, "mock-access-staff-1", "POST", {
      paymentStatus: "unpaid",
    });
    assertEquals(forceUnpaidRes.status, 200);

    const resolveRes = await authedBearer(
      "/api/v1/admin/payments/reconciliation/resolve/by-filter",
      "mock-access-staff-1",
      "POST",
      {
        issueType: "paid_tx_booking_unpaid",
        maxItems: 10,
        dryRun: false,
      },
    );
    const resolvePayload = await json(resolveRes);
    assertEquals(resolveRes.status, 200);
    assertEquals(resolvePayload.meta.successCount >= 1, true);

    const bookingRes = await authedBearer(`/api/v1/bookings/${created.data.id}`, "mock-access-player-1", "GET");
    const bookingPayload = await json(bookingRes);
    assertEquals(bookingRes.status, 200);
    assertEquals(bookingPayload.data.paymentStatus, "paid");
  } finally {
    if (previous == null) Deno.env.delete("AUTH_REQUIRE_BEARER");
    else Deno.env.set("AUTH_REQUIRE_BEARER", previous);
  }
});

Deno.test("resolve-by-filter validates issue type", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const res = await authed(
    "/api/v1/admin/payments/reconciliation/resolve/by-filter",
    "staff-1",
    "staff",
    "POST",
    {
      issueType: "bad_issue",
    },
  );
  const payload = await json(res);
  assertEquals(res.status, 400);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
});

Deno.test("staff can set and clear booking payment deadline", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-20",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const confirmRes = await authed(`/api/v1/bookings/${created.data.id}/status`, "staff-1", "staff", "PATCH", {
    status: "confirmed",
  });
  assertEquals(confirmRes.status, 200);

  const setRes = await authed(`/api/v1/bookings/${created.data.id}/payment-deadline`, "staff-1", "staff", "POST", {
    ttlMinutes: 45,
    referenceNow: "2099-11-20T08:00:00.000Z",
  });
  const setPayload = await json(setRes);
  assertEquals(setRes.status, 200);
  assertEquals(setPayload.data.paymentDueAt, "2099-11-20T08:45:00.000Z");

  const clearRes = await authed(`/api/v1/bookings/${created.data.id}/payment-deadline`, "staff-1", "staff", "POST", {
    clear: true,
  });
  const clearPayload = await json(clearRes);
  assertEquals(clearRes.status, 200);
  assertEquals(clearPayload.data.paymentDueAt, undefined);
});

Deno.test("payment deadline endpoint rejects multiple modes", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-21",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  await authed(`/api/v1/bookings/${created.data.id}/status`, "staff-1", "staff", "PATCH", {
    status: "confirmed",
  });

  const invalidRes = await authed(
    `/api/v1/bookings/${created.data.id}/payment-deadline`,
    "staff-1",
    "staff",
    "POST",
    {
      clear: true,
      ttlMinutes: 30,
    },
  );
  const invalidPayload = await json(invalidRes);
  assertEquals(invalidRes.status, 400);
  assertEquals(invalidPayload.error.code, "VALIDATION_ERROR");
});

Deno.test("staff can monitor unpaid booking deadlines (at-risk and overdue)", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-11-30",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const confirmRes = await authed(`/api/v1/bookings/${created.data.id}/status`, "staff-1", "staff", "PATCH", {
    status: "confirmed",
  });
  const confirmed = await json(confirmRes);
  assertEquals(confirmRes.status, 200);
  assertEquals(typeof confirmed.data.paymentDueAt, "string");

  const dueAtMs = new Date(confirmed.data.paymentDueAt as string).getTime();
  const atRiskReference = new Date(dueAtMs - 30 * 60 * 1000).toISOString();
  const overdueReference = new Date(dueAtMs + 1 * 60 * 1000).toISOString();

  const atRiskRes = await authed(
    `/api/v1/admin/bookings/unpaid-monitor?status=at_risk&windowMinutes=60&referenceNow=${encodeURIComponent(atRiskReference)}`,
    "staff-1",
    "staff",
    "GET",
  );
  const atRisk = await json(atRiskRes);
  assertEquals(atRiskRes.status, 200);
  assertEquals(atRisk.data.some((row: { id: string; urgency: string }) => row.id === created.data.id && row.urgency === "at_risk"), true);

  const overdueRes = await authed(
    `/api/v1/admin/bookings/unpaid-monitor?status=overdue&windowMinutes=60&referenceNow=${encodeURIComponent(overdueReference)}`,
    "staff-1",
    "staff",
    "GET",
  );
  const overdue = await json(overdueRes);
  assertEquals(overdueRes.status, 200);
  assertEquals(overdue.data.some((row: { id: string; urgency: string }) => row.id === created.data.id && row.urgency === "overdue"), true);
});

Deno.test("player can apply to coach and approved app appears in coach students", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const applyRes = await authed("/api/v1/coach/applications", "player-1", "player", "POST", {
    coachId: "coach-1",
    sport: "Basketball",
    message: "I want skills training.",
  });
  const applied = await json(applyRes);
  assertEquals(applyRes.status, 200);
  assertEquals(applied.data.status, "pending");

  const approveRes = await authed(`/api/v1/coach/applications/${applied.data.id}/approve`, "coach-1", "coach", "POST");
  const approved = await json(approveRes);
  assertEquals(approveRes.status, 200);
  assertEquals(approved.data.status, "approved");

  const studentsRes = await authed("/api/v1/coach/students?sport=Basketball", "coach-1", "coach", "GET");
  const students = await json(studentsRes);
  assertEquals(studentsRes.status, 200);
  assertEquals(students.data.some((row: { player: { id: string } }) => row.player.id === "player-1"), true);
});

Deno.test("cannot submit duplicate pending coach application for same sport", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const firstRes = await authed("/api/v1/coach/applications", "player-1", "player", "POST", {
    coachId: "coach-1",
    sport: "Basketball",
  });
  assertEquals(firstRes.status, 200);

  const secondRes = await authed("/api/v1/coach/applications", "player-1", "player", "POST", {
    coachId: "coach-1",
    sport: "Basketball",
  });
  const second = await json(secondRes);
  assertEquals(secondRes.status, 409);
  assertEquals(second.error.code, "CONFLICT");
});

Deno.test("coach session auto-enrolls approved students for matching sport", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const applyRes = await authed("/api/v1/coach/applications", "player-1", "player", "POST", {
    coachId: "coach-1",
    sport: "Basketball",
  });
  const applied = await json(applyRes);
  assertEquals(applyRes.status, 200);

  const approveRes = await authed(`/api/v1/coach/applications/${applied.data.id}/approve`, "coach-1", "coach", "POST");
  assertEquals(approveRes.status, 200);

  const createSessionRes = await authed("/api/v1/coach/sessions", "coach-1", "coach", "POST", {
    courtId: "c1",
    date: "2099-12-27",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    maxPlayers: 4,
  });
  const session = await json(createSessionRes);
  assertEquals(createSessionRes.status, 200);
  assertEquals(session.data.sport, "Basketball");
  assertEquals((session.data.players || []).includes("player-1"), true);
});

Deno.test("eligible-students endpoint returns approved students by sport", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const applyRes = await authed("/api/v1/coach/applications", "player-1", "player", "POST", {
    coachId: "coach-1",
    sport: "Basketball",
  });
  const applied = await json(applyRes);
  assertEquals(applyRes.status, 200);

  const approveRes = await authed(`/api/v1/coach/applications/${applied.data.id}/approve`, "coach-1", "coach", "POST");
  assertEquals(approveRes.status, 200);

  const eligibleRes = await authed("/api/v1/coach/sessions/eligible-students?courtId=c1", "coach-1", "coach", "GET");
  const eligible = await json(eligibleRes);
  assertEquals(eligibleRes.status, 200);
  assertEquals(eligible.data.some((row: { playerId: string }) => row.playerId === "player-1"), true);
});

Deno.test("coach can mark attendance for enrolled training student", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const sessionRes = await authed("/api/v1/coach/sessions", "coach-1", "coach", "POST", {
    courtId: "c1",
    date: "2099-12-28",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    maxPlayers: 4,
  });
  const session = await json(sessionRes);
  assertEquals(sessionRes.status, 200);

  const joinRes = await authed(`/api/v1/sessions/${session.data.id}/join`, "player-1", "player", "POST");
  assertEquals(joinRes.status, 200);

  const markRes = await authed(`/api/v1/coach/sessions/${session.data.id}/attendance`, "coach-1", "coach", "POST", {
    playerId: "player-1",
    attended: true,
  });
  const marked = await json(markRes);
  assertEquals(markRes.status, 200);
  assertEquals(marked.data.attendance["player-1"], true);

  const listRes = await authed(`/api/v1/coach/sessions/${session.data.id}/attendance`, "coach-1", "coach", "GET");
  const list = await json(listRes);
  assertEquals(listRes.status, 200);
  assertEquals(list.data.some((row: { playerId: string; attended: boolean }) => row.playerId === "player-1" && row.attended), true);
});

Deno.test("coach attendance report summarizes student attendance", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const sessionRes = await authed("/api/v1/coach/sessions", "coach-1", "coach", "POST", {
    courtId: "c1",
    date: "2099-12-29",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    maxPlayers: 4,
    autoEnrollApproved: false,
  });
  const session = await json(sessionRes);
  assertEquals(sessionRes.status, 200);

  const joinRes = await authed(`/api/v1/sessions/${session.data.id}/join`, "player-1", "player", "POST");
  assertEquals(joinRes.status, 200);

  await authed(`/api/v1/coach/sessions/${session.data.id}/attendance`, "coach-1", "coach", "POST", {
    playerId: "player-1",
    attended: true,
  });

  const reportRes = await authed(
    "/api/v1/coach/reports/attendance?dateFrom=2099-12-01&dateTo=2099-12-31&sport=basketball",
    "coach-1",
    "coach",
    "GET",
  );
  const report = await json(reportRes);
  assertEquals(reportRes.status, 200);
  assertEquals(report.data.summary.totalTrainingSessions >= 1, true);
  assertEquals(report.data.students.some((row: { playerId: string; attendedSessions: number }) => row.playerId === "player-1" && row.attendedSessions >= 1), true);
});

Deno.test("staff can get global attendance overview analytics", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const sessionRes = await authed("/api/v1/coach/sessions", "coach-1", "coach", "POST", {
    courtId: "c1",
    date: "2099-12-20",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    maxPlayers: 4,
    autoEnrollApproved: false,
  });
  const session = await json(sessionRes);
  assertEquals(sessionRes.status, 200);

  await authed(`/api/v1/sessions/${session.data.id}/join`, "player-1", "player", "POST");
  await authed(`/api/v1/coach/sessions/${session.data.id}/attendance`, "coach-1", "coach", "POST", {
    playerId: "player-1",
    attended: true,
  });

  const analyticsRes = await authed(
    "/api/v1/analytics/attendance/overview?startDate=2099-12-01&endDate=2099-12-31&sport=basketball",
    "staff-1",
    "staff",
    "GET",
  );
  const analytics = await json(analyticsRes);
  assertEquals(analyticsRes.status, 200);
  assertEquals(analytics.data.summary.sessions >= 1, true);
  assertEquals(analytics.data.summary.attendedCount >= 1, true);
});

Deno.test("admin can get per-coach attendance analytics", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const sessionRes = await authed("/api/v1/coach/sessions", "coach-1", "coach", "POST", {
    courtId: "c1",
    date: "2099-12-21",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    maxPlayers: 4,
    autoEnrollApproved: false,
  });
  const session = await json(sessionRes);
  assertEquals(sessionRes.status, 200);

  await authed(`/api/v1/sessions/${session.data.id}/join`, "player-1", "player", "POST");
  await authed(`/api/v1/coach/sessions/${session.data.id}/attendance`, "coach-1", "coach", "POST", {
    playerId: "player-1",
    attended: true,
  });

  const coachAnalyticsRes = await authed(
    "/api/v1/analytics/coaches/coach-1/attendance?startDate=2099-12-01&endDate=2099-12-31",
    "admin-1",
    "admin",
    "GET",
  );
  const coachAnalytics = await json(coachAnalyticsRes);
  assertEquals(coachAnalyticsRes.status, 200);
  assertEquals(coachAnalytics.data.coach.id, "coach-1");
  assertEquals(coachAnalytics.data.summary.sessions >= 1, true);
});

Deno.test("staff can get per-court attendance analytics", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const sessionRes = await authed("/api/v1/coach/sessions", "coach-1", "coach", "POST", {
    courtId: "c1",
    date: "2099-12-22",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    maxPlayers: 4,
    autoEnrollApproved: false,
  });
  const session = await json(sessionRes);
  assertEquals(sessionRes.status, 200);

  await authed(`/api/v1/sessions/${session.data.id}/join`, "player-1", "player", "POST");
  await authed(`/api/v1/coach/sessions/${session.data.id}/attendance`, "coach-1", "coach", "POST", {
    playerId: "player-1",
    attended: true,
  });

  const analyticsRes = await authed(
    "/api/v1/analytics/courts/c1/attendance?startDate=2099-12-01&endDate=2099-12-31",
    "staff-1",
    "staff",
    "GET",
  );
  const analytics = await json(analyticsRes);
  assertEquals(analyticsRes.status, 200);
  assertEquals(analytics.data.court.id, "c1");
  assertEquals(analytics.data.summary.sessions >= 1, true);
  assertEquals(Array.isArray(analytics.data.trend), true);
});

Deno.test("court attendance analytics returns 404 for unknown court", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const res = await authed("/api/v1/analytics/courts/does-not-exist/attendance", "admin-1", "admin", "GET");
  const payload = await json(res);
  assertEquals(res.status, 404);
  assertEquals(payload.error.code, "NOT_FOUND");
});

Deno.test("staff can export bookings analytics as csv", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-23",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  assertEquals(createRes.status, 200);

  const exportRes = await authed(
    "/api/v1/analytics/bookings/export?format=csv&startDate=2099-12-01&endDate=2099-12-31",
    "staff-1",
    "staff",
    "GET",
  );
  const payload = await json(exportRes);
  assertEquals(exportRes.status, 200);
  assertEquals(payload.data.format, "csv");
  assertEquals(typeof payload.data.data, "string");
  assertEquals(payload.data.data.includes("bookingId"), true);
});

Deno.test("staff can filter bookings analytics by courtId", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const c1Res = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-10",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 500,
  });
  assertEquals(c1Res.status, 200);

  const c2Res = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c2",
    type: "private",
    date: "2099-12-10",
    startTime: "12:00",
    endTime: "13:00",
    duration: 60,
    amount: 700,
  });
  assertEquals(c2Res.status, 200);

  const analyticsRes = await authed(
    "/api/v1/analytics/bookings?startDate=2099-12-01&endDate=2099-12-31&courtId=c1",
    "staff-1",
    "staff",
    "GET",
  );
  const payload = await json(analyticsRes);
  assertEquals(analyticsRes.status, 200);
  assertEquals(payload.data.totalBookings, 1);
  assertEquals(payload.data.totalRevenue, 500);
  assertEquals(payload.data.averageBookingValue, 500);
  assertEquals(payload.data.noShows, 0);
});

Deno.test("bookings analytics rejects invalid type filter", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const res = await authed(
    "/api/v1/analytics/bookings?type=not_real_type",
    "staff-1",
    "staff",
    "GET",
  );
  const payload = await json(res);
  assertEquals(res.status, 400);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
});

Deno.test("bookings analytics export rejects invalid status filter", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const exportRes = await authed(
    "/api/v1/analytics/bookings/export?format=csv&status=not_real_status",
    "staff-1",
    "staff",
    "GET",
  );
  const payload = await json(exportRes);
  assertEquals(exportRes.status, 400);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
});

Deno.test("bookings analytics export rejects invalid type filter", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const exportRes = await authed(
    "/api/v1/analytics/bookings/export?format=json&type=not_real_type",
    "staff-1",
    "staff",
    "GET",
  );
  const payload = await json(exportRes);
  assertEquals(exportRes.status, 400);
  assertEquals(payload.error.code, "VALIDATION_ERROR");
});

Deno.test("player cannot access bookings analytics export", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const res = await authed("/api/v1/analytics/bookings/export?format=json", "player-1", "player", "GET");
  const payload = await json(res);
  assertEquals(res.status, 403);
  assertEquals(payload.error.code, "FORBIDDEN");
});

Deno.test("coach cannot access attendance analytics overview", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const res = await authed("/api/v1/analytics/attendance/overview?startDate=2099-12-01&endDate=2099-12-31", "coach-1", "coach", "GET");
  const payload = await json(res);
  assertEquals(res.status, 403);
  assertEquals(payload.error.code, "FORBIDDEN");
});

Deno.test("admin can export attendance analytics as json", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const sessionRes = await authed("/api/v1/coach/sessions", "coach-1", "coach", "POST", {
    courtId: "c1",
    date: "2099-12-24",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    maxPlayers: 4,
    autoEnrollApproved: false,
  });
  const session = await json(sessionRes);
  assertEquals(sessionRes.status, 200);

  await authed(`/api/v1/sessions/${session.data.id}/join`, "player-1", "player", "POST");
  await authed(`/api/v1/coach/sessions/${session.data.id}/attendance`, "coach-1", "coach", "POST", {
    playerId: "player-1",
    attended: true,
  });

  const exportRes = await authed(
    "/api/v1/analytics/attendance/export?format=json&startDate=2099-12-01&endDate=2099-12-31",
    "admin-1",
    "admin",
    "GET",
  );
  const payload = await json(exportRes);
  assertEquals(exportRes.status, 200);
  assertEquals(payload.data.format, "json");
  assertEquals(Array.isArray(payload.data.data), true);
  assertEquals(payload.data.data.length >= 1, true);
});

Deno.test("admin can view audit logs after booking approval", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-26",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const approveRes = await authed(`/api/v1/bookings/${created.data.id}/approve`, "staff-1", "staff", "POST");
  assertEquals(approveRes.status, 200);

  const logsRes = await authed(
    `/api/v1/admin/audit-logs?entityType=booking&entityId=${created.data.id}`,
    "admin-1",
    "admin",
    "GET",
  );
  const logs = await json(logsRes);
  assertEquals(logsRes.status, 200);
  assertEquals(logs.data.some((row: { action: string }) => row.action === "booking_approved"), true);
});

Deno.test("player cannot access audit logs endpoint", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const res = await authed("/api/v1/admin/audit-logs", "player-1", "player", "GET");
  const payload = await json(res);
  assertEquals(res.status, 403);
  assertEquals(payload.error.code, "FORBIDDEN");
});

Deno.test("staff can export audit logs as csv", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-27",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);
  await authed(`/api/v1/bookings/${created.data.id}/approve`, "staff-1", "staff", "POST");

  const exportRes = await authed("/api/v1/admin/audit-logs/export?format=csv", "staff-1", "staff", "GET");
  const payload = await json(exportRes);
  assertEquals(exportRes.status, 200);
  assertEquals(payload.data.format, "csv");
  assertEquals(typeof payload.data.data, "string");
  assertEquals(payload.data.data.includes("action"), true);
});

Deno.test("admin can purge audit logs with dry-run and actual delete", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2000-01-01",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);
  await authed(`/api/v1/bookings/${created.data.id}/approve`, "admin-1", "admin", "POST");

  const dryRunRes = await authed("/api/v1/admin/audit-logs/purge", "admin-1", "admin", "POST", {
    beforeDate: "2100-01-01",
    dryRun: true,
  });
  const dryRun = await json(dryRunRes);
  assertEquals(dryRunRes.status, 200);
  assertEquals(dryRun.data.dryRun, true);
  assertEquals(dryRun.data.matched >= 1, true);

  const purgeRes = await authed("/api/v1/admin/audit-logs/purge", "admin-1", "admin", "POST", {
    beforeDate: "2100-01-01",
    dryRun: false,
  });
  const purge = await json(purgeRes);
  assertEquals(purgeRes.status, 200);
  assertEquals(purge.data.deleted >= 1, true);
});

Deno.test("staff can export admin data snapshot", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const res = await authed("/api/v1/admin/data/export", "staff-1", "staff", "GET");
  const payload = await json(res);
  assertEquals(res.status, 200);
  assertEquals(typeof payload.data.filename, "string");
  assertEquals(Array.isArray(payload.data.data.users), true);
  assertEquals(Array.isArray(payload.data.data.courts), true);
  assertEquals(typeof payload.data.data.config.openingTime, "string");
});

Deno.test("admin reset returns system to seeded state", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-29",
    startTime: "09:00",
    endTime: "10:00",
    duration: 60,
    amount: 500,
  });
  assertEquals(createRes.status, 200);

  const resetRes = await authed("/api/v1/admin/data/reset", "admin-1", "admin", "POST", {});
  const resetPayload = await json(resetRes);
  assertEquals(resetRes.status, 200);
  assertEquals(resetPayload.data.reset, true);

  const bookingsRes = await authed("/api/v1/bookings", "admin-1", "admin", "GET");
  const bookings = await json(bookingsRes);
  assertEquals(bookingsRes.status, 200);
  assertEquals(Array.isArray(bookings.data), true);
  assertEquals(bookings.data.length, 0);

  const courtsRes = await app.request("http://local.test/api/v1/courts");
  const courts = await json(courtsRes);
  assertEquals(courtsRes.status, 200);
  assertEquals(courts.data.length >= 1, true);

  const configRes = await app.request("http://local.test/api/v1/config/facility");
  const config = await json(configRes);
  assertEquals(configRes.status, 200);
  assertEquals(config.data.bookingInterval, 60);
});

Deno.test("admin can import snapshot data", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const snapshot = {
    users: [
      { id: "admin-1", email: "admin@court.com", name: "Admin User", role: "admin", createdAt: "2099-01-01T00:00:00.000Z" },
      { id: "player-1", email: "player@court.com", name: "Alex Johnson", role: "player", createdAt: "2099-01-01T00:00:00.000Z" },
    ],
    courts: [
      {
        id: "c1",
        name: "Imported Court",
        courtNumber: "1",
        type: "indoor",
        surfaceType: "hardcourt",
        hourlyRate: 500,
        peakHourRate: 700,
        status: "active",
        operatingHours: { start: "06:00", end: "22:00" },
      },
    ],
    bookings: [
      {
        id: "bk-import-1",
        courtId: "c1",
        userId: "player-1",
        type: "private",
        date: "2099-12-30",
        startTime: "08:00",
        endTime: "09:00",
        duration: 60,
        status: "confirmed",
        paymentStatus: "unpaid",
        amount: 500,
        players: [],
        maxPlayers: 4,
        checkedIn: false,
        createdAt: "2099-12-01T00:00:00.000Z",
      },
    ],
    memberships: [
      { id: "m1", name: "Basic", price: 1000, interval: "month", tier: "basic", description: "Imported", features: [] },
    ],
    subscriptions: [],
    notifications: [],
    coachApplications: [],
    config: {
      openingTime: "06:00",
      closingTime: "23:00",
      bookingInterval: 30,
      bufferTime: 10,
      maxBookingDuration: 180,
      advanceBookingDays: 14,
      cancellationCutoffHours: 12,
      peakHours: [{ start: "18:00", end: "21:00" }],
      maintenanceMode: false,
    },
  };

  const importRes = await authed("/api/v1/admin/data/import", "admin-1", "admin", "POST", {
    overwrite: true,
    data: snapshot,
  });
  const imported = await json(importRes);
  assertEquals(importRes.status, 200);
  assertEquals(imported.data.imported.bookings, 1);

  const bookingsRes = await authed("/api/v1/bookings", "admin-1", "admin", "GET");
  const bookings = await json(bookingsRes);
  assertEquals(bookingsRes.status, 200);
  assertEquals(bookings.data.some((row: { id: string }) => row.id === "bk-import-1"), true);

  const configRes = await app.request("http://local.test/api/v1/config/facility");
  const config = await json(configRes);
  assertEquals(configRes.status, 200);
  assertEquals(config.data.bookingInterval, 30);
});

Deno.test("admin data export and import include coach registrations", async () => {
  __resetForTests();

  const signupRes = await app.request("http://local.test/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "coach-backup@court.com",
      password: "coach123",
      role: "coach",
      name: "Coach Backup",
      verificationMethod: "license",
      verificationDocumentName: "Backup License",
      verificationId: "BK-2026",
    }),
  });
  assertEquals(signupRes.status, 200);

  const exportRes = await authed("/api/v1/admin/data/export", "admin-1", "admin", "GET");
  const exportPayload = await json(exportRes);
  assertEquals(exportRes.status, 200);
  assertEquals(Array.isArray(exportPayload.data.data.coachRegistrations), true);
  assertEquals(
    exportPayload.data.data.coachRegistrations.some((item: { email: string }) => item.email === "coach-backup@court.com"),
    true,
  );

  const snapshot = exportPayload.data.data;
  const resetRes = await authed("/api/v1/admin/data/reset", "admin-1", "admin", "POST", {});
  assertEquals(resetRes.status, 200);

  const importRes = await authed("/api/v1/admin/data/import", "admin-1", "admin", "POST", {
    overwrite: true,
    data: snapshot,
  });
  const importPayload = await json(importRes);
  assertEquals(importRes.status, 200);
  assertEquals(importPayload.data.imported.coachRegistrations >= 1, true);

  const listRes = await authed("/api/v1/admin/coach-registrations?page=1&limit=50", "admin-1", "admin", "GET");
  const listPayload = await json(listRes);
  assertEquals(listRes.status, 200);
  assertEquals(
    (listPayload.data as any[]).some((item) => item.email === "coach-backup@court.com"),
    true,
  );
});

Deno.test("booking create is idempotent with same key and payload", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const body = {
    courtId: "c1",
    type: "private",
    date: "2099-12-28",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  };
  const firstRes = await authedWithHeaders(
    "/api/v1/bookings",
    "player-1",
    "player",
    { "x-idempotency-key": "idem-book-1" },
    "POST",
    body,
  );
  const first = await json(firstRes);
  assertEquals(firstRes.status, 200);

  const secondRes = await authedWithHeaders(
    "/api/v1/bookings",
    "player-1",
    "player",
    { "x-idempotency-key": "idem-book-1" },
    "POST",
    body,
  );
  const second = await json(secondRes);
  assertEquals(secondRes.status, 200);
  assertEquals(second.data.id, first.data.id);
});

Deno.test("booking create idempotency key with different payload returns conflict", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const firstRes = await authedWithHeaders(
    "/api/v1/bookings",
    "player-1",
    "player",
    { "x-idempotency-key": "idem-book-2" },
    "POST",
    {
      courtId: "c1",
      type: "private",
      date: "2099-12-29",
      startTime: "08:00",
      endTime: "09:00",
      duration: 60,
      amount: 500,
    },
  );
  assertEquals(firstRes.status, 200);

  const secondRes = await authedWithHeaders(
    "/api/v1/bookings",
    "player-1",
    "player",
    { "x-idempotency-key": "idem-book-2" },
    "POST",
    {
      courtId: "c1",
      type: "private",
      date: "2099-12-29",
      startTime: "09:00",
      endTime: "10:00",
      duration: 60,
      amount: 500,
    },
  );
  const second = await json(secondRes);
  assertEquals(secondRes.status, 409);
  assertEquals(second.error.code, "CONFLICT");
});

Deno.test("bookings history splits active and past (done-only by default)", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const activeCreateRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-30",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 500,
  });
  const activeCreated = await json(activeCreateRes);
  assertEquals(activeCreateRes.status, 200);

  const completedCreateRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2020-01-03",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 500,
  });
  const completedCreated = await json(completedCreateRes);
  assertEquals(completedCreateRes.status, 200);
  await authed(`/api/v1/bookings/${completedCreated.data.id}/approve`, "staff-1", "staff", "POST");
  await authed(`/api/v1/bookings/${completedCreated.data.id}/complete`, "staff-1", "staff", "POST");

  const noShowCreateRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2020-01-04",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 500,
  });
  const noShowCreated = await json(noShowCreateRes);
  assertEquals(noShowCreateRes.status, 200);
  await authed(`/api/v1/bookings/${noShowCreated.data.id}/approve`, "staff-1", "staff", "POST");
  await authed(`/api/v1/bookings/${noShowCreated.data.id}/no-show`, "staff-1", "staff", "POST");

  const activeHistoryRes = await authed("/api/v1/bookings/history?view=active", "player-1", "player", "GET");
  const activeHistory = await json(activeHistoryRes);
  assertEquals(activeHistoryRes.status, 200);
  assertEquals(activeHistory.data.some((b: { id: string }) => b.id === activeCreated.data.id), true);
  assertEquals(activeHistory.data.some((b: { id: string }) => b.id === completedCreated.data.id), false);
  assertEquals(activeHistory.meta.counts.active, 1);

  const pastHistoryRes = await authed("/api/v1/bookings/history?view=past", "player-1", "player", "GET");
  const pastHistory = await json(pastHistoryRes);
  assertEquals(pastHistoryRes.status, 200);
  assertEquals(pastHistory.data.some((b: { id: string }) => b.id === completedCreated.data.id), true);
  assertEquals(pastHistory.data.some((b: { id: string }) => b.id === noShowCreated.data.id), false);
  assertEquals(pastHistory.meta.counts.past, 1);

  const pastWithNoShowRes = await authed(
    "/api/v1/bookings/history?view=past&includeNoShow=true",
    "player-1",
    "player",
    "GET",
  );
  const pastWithNoShow = await json(pastWithNoShowRes);
  assertEquals(pastWithNoShowRes.status, 200);
  assertEquals(pastWithNoShow.data.some((b: { id: string }) => b.id === noShowCreated.data.id), true);
  assertEquals(pastWithNoShow.meta.counts.past, 2);
});

Deno.test("staff can transition booking status via unified status endpoint", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-31",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);
  assertEquals(created.data.status, "pending");

  const transitionRes = await authed(`/api/v1/bookings/${created.data.id}/status`, "staff-1", "staff", "PATCH", {
    status: "confirmed",
  });
  const transitioned = await json(transitionRes);
  assertEquals(transitionRes.status, 200);
  assertEquals(transitioned.data.status, "confirmed");
});

Deno.test("status endpoint rejects invalid transition", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-20",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  await authed(`/api/v1/bookings/${created.data.id}/status`, "staff-1", "staff", "PATCH", {
    status: "confirmed",
  });
  const invalidRes = await authed(`/api/v1/bookings/${created.data.id}/status`, "staff-1", "staff", "PATCH", {
    status: "pending",
  });
  const invalid = await json(invalidRes);
  assertEquals(invalidRes.status, 409);
  assertEquals(invalid.error.code, "CONFLICT");
});

Deno.test("player cannot transition booking status via status endpoint", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-21",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const forbiddenRes = await authed(`/api/v1/bookings/${created.data.id}/status`, "player-1", "player", "PATCH", {
    status: "confirmed",
  });
  const forbidden = await json(forbiddenRes);
  assertEquals(forbiddenRes.status, 403);
  assertEquals(forbidden.error.code, "FORBIDDEN");
});

Deno.test("booking timeline returns created and audit status events", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-22",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const approveRes = await authed(`/api/v1/bookings/${created.data.id}/status`, "staff-1", "staff", "PATCH", {
    status: "confirmed",
  });
  assertEquals(approveRes.status, 200);

  const timelineRes = await authed(`/api/v1/bookings/${created.data.id}/timeline?order=asc`, "player-1", "player", "GET");
  const timeline = await json(timelineRes);
  assertEquals(timelineRes.status, 200);
  assertEquals(timeline.data.length >= 2, true);
  assertEquals(timeline.data.some((row: { action: string }) => row.action === "booking_created"), true);
  assertEquals(
    timeline.data.some((row: { action: string }) => row.action === "booking_status_set_confirmed"),
    true,
  );
});

Deno.test("booking timeline is forbidden for unrelated player", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const signupRes = await app.request("http://local.test/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "player3@court.com", password: "player1", role: "player" }),
  });
  const signupPayload = await json(signupRes);
  assertEquals(signupRes.status, 200);
  const player3Id = signupPayload.data.id as string;

  const createRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-23",
    startTime: "08:00",
    endTime: "09:00",
    duration: 60,
    amount: 500,
  });
  const created = await json(createRes);
  assertEquals(createRes.status, 200);

  const forbiddenRes = await authed(`/api/v1/bookings/${created.data.id}/timeline`, player3Id, "player", "GET");
  const forbidden = await json(forbiddenRes);
  assertEquals(forbiddenRes.status, 403);
  assertEquals(forbidden.error.code, "FORBIDDEN");
});

Deno.test("player can create hold and another player cannot hold same slot", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const firstHoldRes = await authed("/api/v1/bookings/holds", "player-1", "player", "POST", {
    courtId: "c1",
    date: "2099-12-24",
    startTime: "10:00",
    endTime: "11:00",
    ttlMinutes: 10,
  });
  const firstHold = await json(firstHoldRes);
  assertEquals(firstHoldRes.status, 200);
  assertEquals(firstHold.data.userId, "player-1");

  const signupRes = await app.request("http://local.test/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "player4@court.com", password: "player1", role: "player" }),
  });
  const signupPayload = await json(signupRes);
  assertEquals(signupRes.status, 200);
  const player4Id = signupPayload.data.id as string;

  const secondHoldRes = await authed("/api/v1/bookings/holds", player4Id, "player", "POST", {
    courtId: "c1",
    date: "2099-12-24",
    startTime: "10:00",
    endTime: "11:00",
    ttlMinutes: 10,
  });
  const secondHold = await json(secondHoldRes);
  assertEquals(secondHoldRes.status, 409);
  assertEquals(secondHold.error.code, "CONFLICT");
});

Deno.test("booking create is blocked by another user's active hold", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const holdRes = await authed("/api/v1/bookings/holds", "player-1", "player", "POST", {
    courtId: "c1",
    date: "2099-12-25",
    startTime: "10:00",
    endTime: "11:00",
    ttlMinutes: 10,
  });
  assertEquals(holdRes.status, 200);

  const signupRes = await app.request("http://local.test/api/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "player5@court.com", password: "player1", role: "player" }),
  });
  const signupPayload = await json(signupRes);
  assertEquals(signupRes.status, 200);
  const player5Id = signupPayload.data.id as string;

  const bookingRes = await authed("/api/v1/bookings", player5Id, "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-25",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 500,
  });
  const booking = await json(bookingRes);
  assertEquals(bookingRes.status, 409);
  assertEquals(booking.error.code, "CONFLICT");
});

Deno.test("player booking consumes own overlapping hold", async () => {
  __resetForTests();
  await app.request("http://local.test/api/v1/courts");

  const holdRes = await authed("/api/v1/bookings/holds", "player-1", "player", "POST", {
    courtId: "c1",
    date: "2099-12-26",
    startTime: "10:00",
    endTime: "11:00",
    ttlMinutes: 10,
  });
  const hold = await json(holdRes);
  assertEquals(holdRes.status, 200);

  const bookingRes = await authed("/api/v1/bookings", "player-1", "player", "POST", {
    courtId: "c1",
    type: "private",
    date: "2099-12-26",
    startTime: "10:00",
    endTime: "11:00",
    duration: 60,
    amount: 500,
  });
  assertEquals(bookingRes.status, 200);

  const holdsRes = await authed("/api/v1/bookings/holds/me?courtId=c1&date=2099-12-26", "player-1", "player", "GET");
  const holds = await json(holdsRes);
  assertEquals(holdsRes.status, 200);
  assertEquals(holds.data.some((row: { id: string }) => row.id === hold.data.id), false);
});
