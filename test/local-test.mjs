// Local test for api/search.js — runs the REAL handler (mock req/res),
// no Vercel deploy needed. Usage: node test/local-test.mjs
import { readFileSync } from "node:fs";
import handler, { checkSite } from "../api/search.js";

const data = JSON.parse(readFileSync(new URL("../data/sites.json", import.meta.url), "utf8"));
delete data.$schema;

function mockRes() {
  const res = { statusCode: 0, body: null, headers: {} };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.body = o; return res; };
  res.end = () => res;
  return res;
}

async function callApi(username, siteNames) {
  const sites = siteNames.map((n) => ({ name: n, ...data[n] }));
  const req = { method: "POST", body: { username, sites } };
  const res = mockRes();
  await handler(req, res);
  return res;
}

const SUBSET = ["GitHub", "GitLab", "Reddit", "Wikipedia", "YouTube", "Twitter", "Instagram", "TikTok", "LinkedIn", "Medium"];
const GIBBERISH = "xjqwzvkzxkqwv987654321";

console.log("== data.json ==");
console.log("sites:", Object.keys(data).length);
console.log("nsfw:", Object.values(data).filter((v) => v.isNSFW).length);
console.log("errorType:", JSON.stringify(
  Object.values(data).reduce((a, v) => { a[v.errorType] = (a[v.errorType] || 0) + 1; return a; }, {})));

console.log("\n== popular list check ==");
const { POPULAR } = await import("node:fs").then(async () => {
  // POPULAR lives in search.html; re-declare the check by scraping it.
  const html = readFileSync(new URL("../search.html", import.meta.url), "utf8");
  const m = html.match(/const POPULAR = (\[[\s\S]*?\]);/);
  return { POPULAR: JSON.parse(m[1]) };
});
console.log("popular count:", POPULAR.length);
console.log("popular missing from data.json:", POPULAR.filter((n) => !data[n]));

console.log("\n== handler: torvalds (expect GitHub found) ==");
let r = await callApi("torvalds", SUBSET);
console.log("HTTP", r.statusCode);
for (const x of r.body.results) console.log(`  ${x.site}: ${x.status} ${x.error || ""} -> ${x.url}`);

console.log("\n== handler: gibberish (expect not_found on status_code sites) ==");
r = await callApi(GIBBERISH, SUBSET);
console.log("HTTP", r.statusCode);
for (const x of r.body.results) console.log(`  ${x.site}: ${x.status} ${x.error || ""}`);

console.log("\n== checkSite: invalid format (GitHub regex) ==");
console.log(await checkSite("!!! not a user", { name: "GitHub", ...data["GitHub"] }));
console.log(await checkSite("torvalds", { name: "GitHub", ...data["GitHub"] }));

console.log("\n== handler: bad input ==");
const bad = mockRes();
await handler({ method: "POST", body: { username: "", sites: [] } }, bad);
console.log("empty username -> HTTP", bad.statusCode, JSON.stringify(bad.body));
const bad2 = mockRes();
await handler({ method: "GET" }, bad2);
console.log("GET health -> HTTP", bad2.statusCode, JSON.stringify(bad2.body));
