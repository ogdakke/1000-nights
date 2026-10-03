type Reader = { id: string; name: string; avatar_url: string | null };
const respond = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
const random = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
const hash = async (s: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
const jar = (request: Request) =>
  Object.fromEntries(
    (request.headers.get("cookie") ?? "")
      .split("; ")
      .filter(Boolean)
      .map((s) => {
        const i = s.indexOf("=");
        return [s.slice(0, i), s.slice(i + 1)];
      }),
  );
const setCookie = (name: string, value: string, age: number) =>
  `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;

async function reader(request: Request, env: Env): Promise<Reader | null> {
  const token = jar(request).night_session;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return env.DB.prepare(
    "SELECT users.id, users.name, users.avatar_url FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > datetime('now')",
  )
    .bind(await hash(token))
    .first<Reader>();
}

async function catalog(request: Request, env: Env) {
  const url = new URL(request.url);
  const page = Math.min(
    100000,
    Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1),
  );
  let q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  while (new TextEncoder().encode(`%${q.replace(/[\\%_]/g, "\\$&")}%`).length > 50)
    q = q.slice(0, -1);
  const term = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const where = q
    ? "WHERE readings.title LIKE ? ESCAPE '\\' OR readings.author LIKE ? ESCAPE '\\'"
    : "";
  const args = q ? [term, term] : [];
  const current = await reader(request, env);
  const count = await env.DB.prepare(`SELECT count(*) AS total FROM readings ${where}`)
    .bind(...args)
    .first<{ total: number }>();
  const rows = await env.DB.prepare(
    `SELECT readings.*, ${current ? "progress.status" : "NULL"} AS progress FROM readings ${current ? "LEFT JOIN progress ON progress.reading_id = readings.id AND progress.user_id = ?" : ""} ${where} ORDER BY night, position LIMIT 30 OFFSET ?`,
  )
    .bind(...(current ? [current.id] : []), ...args, (page - 1) * 30)
    .all();
  return respond({ items: rows.results, total: count?.total ?? 0, page, pageSize: 30 });
}

async function profile(request: Request, env: Env) {
  const current = await reader(request, env);
  if (!current)
    return respond({
      user: null,
      counts: null,
      authAvailable: Boolean(
        env.GITHUB_CLIENT_ID &&
        env.GITHUB_CLIENT_SECRET &&
        env.GITHUB_CLIENT_SECRET !== "local-disabled",
      ),
    });
  const rows = await env.DB.prepare(
    "SELECT status, count(*) AS count FROM progress WHERE user_id = ? GROUP BY status",
  )
    .bind(current.id)
    .all<{ status: string; count: number }>();
  return respond({
    user: current,
    counts: Object.fromEntries(rows.results.map((r) => [r.status, r.count])),
    authAvailable: true,
  });
}

async function progress(request: Request, env: Env) {
  const current = await reader(request, env);
  if (!current) return respond({ error: "Sign in to save progress." }, 401);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return respond({ error: "Invalid origin." }, 403);
  let body: { readingId?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return respond({ error: "Invalid JSON." }, 400);
  }
  if (typeof body.readingId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.readingId))
    return respond({ error: "Invalid reading." }, 400);
  if (body.status !== null && !["want_to_read", "reading", "read"].includes(String(body.status)))
    return respond({ error: "Invalid status." }, 400);
  if (!(await env.DB.prepare("SELECT id FROM readings WHERE id = ?").bind(body.readingId).first()))
    return respond({ error: "Reading not found." }, 404);
  if (body.status === null)
    await env.DB.prepare("DELETE FROM progress WHERE user_id = ? AND reading_id = ?")
      .bind(current.id, body.readingId)
      .run();
  else
    await env.DB.prepare(
      "INSERT INTO progress(user_id, reading_id, status) VALUES (?, ?, ?) ON CONFLICT(user_id, reading_id) DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP",
    )
      .bind(current.id, body.readingId, body.status)
      .run();
  return respond({ ok: true });
}

async function startAuth(request: Request, env: Env) {
  if (
    !env.GITHUB_CLIENT_ID ||
    !env.GITHUB_CLIENT_SECRET ||
    env.GITHUB_CLIENT_SECRET === "local-disabled"
  )
    return respond({ error: "Sign-in is not configured." }, 503);
  const state = random();
  const verifier = random() + random();
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const challenge = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const target = new URL("https://github.com/login/oauth/authorize");
  target.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  target.searchParams.set("redirect_uri", `${new URL(request.url).origin}/api/auth/callback`);
  target.searchParams.set("state", state);
  target.searchParams.set("code_challenge", challenge);
  target.searchParams.set("code_challenge_method", "S256");
  const response = new Response(null, { status: 302, headers: { location: target.toString() } });
  response.headers.append("Set-Cookie", setCookie("night_oauth_state", state, 600));
  response.headers.append("Set-Cookie", setCookie("night_oauth_verifier", verifier, 600));
  return response;
}

async function finishAuth(request: Request, env: Env) {
  const url = new URL(request.url),
    saved = jar(request);
  const code = url.searchParams.get("code"),
    state = url.searchParams.get("state");
  if (!code || !state || state !== saved.night_oauth_state || !saved.night_oauth_verifier)
    return respond({ error: "Sign-in request expired." }, 400);
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/auth/callback`,
      code_verifier: saved.night_oauth_verifier,
    }),
  });
  if (!tokenResponse.ok) return respond({ error: "GitHub token exchange failed." }, 502);
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) return respond({ error: "GitHub did not return a token." }, 502);
  const identityResponse = await fetch("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${token.access_token}`,
      accept: "application/vnd.github+json",
      "user-agent": "thousand-nights",
    },
  });
  if (!identityResponse.ok) return respond({ error: "GitHub identity lookup failed." }, 502);
  const identity = (await identityResponse.json()) as {
    id?: number;
    login?: string;
    name?: string;
    avatar_url?: string;
  };
  if (!identity.id || !identity.login)
    return respond({ error: "GitHub identity incomplete." }, 502);
  const id = `github-${identity.id}`;
  await env.DB.prepare(
    "INSERT INTO users(id, github_id, name, avatar_url) VALUES (?, ?, ?, ?) ON CONFLICT(github_id) DO UPDATE SET name = excluded.name, avatar_url = excluded.avatar_url",
  )
    .bind(id, identity.id, identity.name || identity.login, identity.avatar_url || null)
    .run();
  const session = random();
  await env.DB.prepare(
    "INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))",
  )
    .bind(await hash(session), id)
    .run();
  const response = new Response(null, { status: 302, headers: { location: `${url.origin}/app/` } });
  response.headers.append("Set-Cookie", setCookie("night_session", session, 30 * 24 * 60 * 60));
  response.headers.append("Set-Cookie", setCookie("night_oauth_state", "", 0));
  response.headers.append("Set-Cookie", setCookie("night_oauth_verifier", "", 0));
  return response;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/readings" && request.method === "GET")
        return catalog(request, env);
      if (url.pathname === "/api/profile" && request.method === "GET") return profile(request, env);
      if (url.pathname === "/api/progress" && request.method === "POST")
        return progress(request, env);
      if (url.pathname === "/api/auth/github" && request.method === "GET")
        return startAuth(request, env);
      if (url.pathname === "/api/auth/callback" && request.method === "GET")
        return finishAuth(request, env);
      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        if (request.headers.get("origin") !== url.origin)
          return respond({ error: "Invalid origin." }, 403);
        const token = jar(request).night_session;
        if (token && /^[a-f0-9]{64}$/.test(token))
          await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
            .bind(await hash(token))
            .run();
        const response = respond({ ok: true });
        response.headers.append("Set-Cookie", setCookie("night_session", "", 0));
        return response;
      }
      if (url.pathname.startsWith("/api/")) return respond({ error: "Not found." }, 404);
      if (url.pathname === "/app" || url.pathname.startsWith("/app/"))
        return env.ASSETS.fetch(new URL("/app/index.html", request.url));
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(
        JSON.stringify({
          path: url.pathname,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return respond({ error: "Something went wrong." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
