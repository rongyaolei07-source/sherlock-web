// Full popular-mode run (65 sites, batches of 10) for TESTS.md numbers.
// Usage: node test/full-popular.mjs
import { readFileSync } from "node:fs";
import handler from "../api/search.js";

const data = JSON.parse(readFileSync(new URL("../data/sites.json", import.meta.url), "utf8"));
delete data.$schema;
const html = readFileSync(new URL("../search.html", import.meta.url), "utf8");
const POPULAR = JSON.parse(html.match(/const POPULAR = (\[[\s\S]*?\]);/)[1]);

async function run(username) {
  const sites = POPULAR.filter((n) => data[n] && !data[n].isNSFW)
    .map((n) => ({ name: n, ...data[n] }));
  const out = [];
  for (let i = 0; i < sites.length; i += 10) {
    const req = { method: "POST", body: { username, sites: sites.slice(i, i + 10) } };
    const res = { status: (c) => { res.statusCode = c; return res; }, json: (o) => { res.body = o; return res; }, setHeader: () => {} };
    await handler(req, res);
    out.push(...res.body.results);
  }
  return out;
}

for (const u of ["torvalds", "xjqwzvkzxkqwv987654321"]) {
  const t0 = Date.now();
  const res = await run(u);
  const count = (s) => res.filter((r) => r.status === s).length;
  console.log(`\n== ${u} == (${((Date.now() - t0) / 1000).toFixed(1)}s, ${res.length} sites)`);
  console.log(`found=${count("found")} not_found=${count("not_found")} unknown=${count("unknown")} invalid=${count("invalid")}`);
  console.log("FOUND:", res.filter((r) => r.status === "found").map((r) => r.site).join(", "));
  console.log("UNKNOWN:", res.filter((r) => r.status === "unknown").map((r) => `${r.site} (${r.error})`).join(" | "));
  console.log("INVALID:", res.filter((r) => r.status === "invalid").map((r) => r.site).join(", "));
}
