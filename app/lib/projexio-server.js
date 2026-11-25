function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function projexioErrorMessage(data) {
  if (!data || typeof data !== "object") return "Simulation Projexio refusée.";
  if (typeof data.message === "string" && data.message.trim()) return data.message.trim();
  return "Simulation Projexio refusée.";
}

export function projexioKey(env = process.env) {
  return String(env.PROJEXIO_API_KEY || "").trim();
}

export async function projexioGet(path, params = {}, env = process.env) {
  const key = projexioKey(env);
  if (!key) throw fail("Simulation Projexio indisponible : la clé n’est pas configurée.", 503);

  const url = new URL(`https://www.simulateurcofidis.com/habitat/api${path}`);
  url.searchParams.set("key", key);
  for (const [name, value] of Object.entries(params || {})) {
    if (value == null || value === "") continue;
    url.searchParams.set(name, String(value));
  }

  let response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "MKL-Energies-CRM" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw fail("Projexio ne répond pas.", 502);
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok || !data || data.error === true) {
    throw fail(projexioErrorMessage(data), response.ok ? 400 : 502);
  }
  return data;
}
