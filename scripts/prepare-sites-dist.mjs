import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/.openai", { recursive: true });
mkdirSync("dist/server", { recursive: true });
mkdirSync("dist/client", { recursive: true });
cpSync(".openai/hosting.json", "dist/.openai/hosting.json");
cpSync(".next/static", "dist/client/_next/static", { recursive: true });
cpSync("public", "dist/client", { recursive: true });
cpSync(".next/server/app/index.html", "dist/client/index.html");

for (const route of ["maintenance-contract", "maintenance-form", "previsite", "pv-study"]) {
  mkdirSync(`dist/client/${route}`, { recursive: true });
  cpSync(`.next/server/app/${route}.html`, `dist/client/${route}/index.html`);
}

writeFileSync(
  "dist/server/index.js",
  `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return Response.json(
        { error: "Le service d’envoi d’emails n’est pas configuré sur cette publication." },
        { status: 503 },
      );
    }
    return env.ASSETS.fetch(request);
  },
};
`,
);
