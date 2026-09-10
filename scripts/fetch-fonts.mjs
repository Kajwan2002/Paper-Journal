import { writeFile, mkdir } from "node:fs/promises";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const URL_ = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..600&family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..500&family=JetBrains+Mono:wght@400..500&display=swap";

const css = await (await fetch(URL_, { headers: { "User-Agent": UA } })).text();
const OUT = new URL("../src/assets/fonts", import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

// split into /* subset */ @font-face { ... } blocks
const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)];
const keep = new Set(["latin", "latin-ext"]);
const out = [];
let n = 0;

for (const [, subset, block] of blocks) {
  if (!keep.has(subset)) continue;
  const fam = /font-family:\s*'([^']+)'/.exec(block)[1];
  const style = /font-style:\s*([\w]+)/.exec(block)[1];
  const url = /url\((https:[^)]+)\)/.exec(block)[1];
  const slug = `${fam.toLowerCase().replace(/\s+/g, "-")}-${style}-${subset}`;
  const buf = Buffer.from(await (await fetch(url, { headers: { "User-Agent": UA } })).arrayBuffer());
  await writeFile(`${OUT}/${slug}.woff2`, buf);
  n++;
  out.push(
    block
      .replace(/url\(https:[^)]+\)/, `url("../assets/fonts/${slug}.woff2")`)
      .replace(/^@font-face\s*\{/, "@font-face {")
      .trim(),
  );
  console.log(`${slug}.woff2  ${(buf.length / 1024).toFixed(0)}kB`);
}

const header = `/* Self-hosted so the paper renders identically offline and on a cold,
   flaky connection — and so no request leaves the device to render a page.
   Latin + latin-ext subsets of the same three families the brief calls for.
   Regenerate with scripts/fetch-fonts.mjs. */\n\n`;
await writeFile(new URL("../src/styles/fonts.css", import.meta.url).pathname, header + out.join("\n\n") + "\n");
console.log(`\n${n} faces -> src/styles/fonts.css`);
