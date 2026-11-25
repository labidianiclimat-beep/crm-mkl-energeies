function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function domofinanceErrorMessage(data) {
  if (!data) return "Simulation Domofinance refusée.";
  if (typeof data === "string") {
    const text = data.trim();
    if (!text || text.length > 400 || text.startsWith("<")) return "Simulation Domofinance refusée.";
    return text;
  }
  const details = data.details || data.Details || data.detail || data.message;
  const title = data.title || data.Title;
  if (typeof details === "string" && details.trim()) return details.trim();
  if (typeof title === "string" && title.trim()) return title.trim();
  return "Simulation Domofinance refusée.";
}

export function domofinanceToken(env = process.env) {
  return String(env.DOMOFINANCE_API_TOKEN || "").trim();
}

export async function domofinanceGet(path, params = {}, env = process.env) {
  const token = domofinanceToken(env);
  if (!token) throw fail("Simulation Domofinance indisponible : le jeton n’est pas configuré.", 503);

  const url = new URL(`https://www.domofinance.com/api-partenaires${path}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  let response;
  try {
    response = await fetch(url, {
      headers: {
        "X-AUTH-TOKEN": token,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw fail("Domofinance ne répond pas.", 502);
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    throw fail(domofinanceErrorMessage(data), response.status >= 400 && response.status < 500 ? 400 : 502);
  }
  return data;
}
