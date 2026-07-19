import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const appRoot = path.join(root, "app");
const sourceRoots = [appRoot, path.join(root, "components")];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const legacyRedirects = [/^\/leave(?:\/|$)/];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map(async (entry) => {
        const fullPath = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(fullPath) : fullPath;
      }),
  );
  return files.flat();
}

function routePattern(pageFile) {
  const relativeDirectory = path.relative(appRoot, path.dirname(pageFile));
  const segments = relativeDirectory
    .split(path.sep)
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));

  const expression = segments
    .map((segment) => {
      if (/^\[\[\.\.\..+\]\]$/.test(segment)) return "(?:/.*)?";
      if (/^\[\.\.\..+\]$/.test(segment)) return "/.+";
      if (/^\[.+\]$/.test(segment)) return "/[^/]+";
      return `/${segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
    })
    .join("");

  return new RegExp(`^${expression || "/"}(?:/)?$`);
}

function candidatePath(rawValue) {
  if (
    !rawValue.startsWith("/") ||
    rawValue.startsWith("//") ||
    rawValue.startsWith("/api/") ||
    rawValue.includes("\n") ||
    rawValue.includes("join(")
  ) {
    return null;
  }

  const withDynamicSegments = rawValue.replace(/\$\{[^}]+\}/g, "__dynamic__");
  return withDynamicSegments.split(/[?#]/, 1)[0];
}

const pageFiles = (await walk(appRoot)).filter((file) => file.endsWith(`${path.sep}page.tsx`));
const routePatterns = pageFiles.map(routePattern);
const sourceFiles = (
  await Promise.all(sourceRoots.map((directory) => walk(directory)))
).flat().filter((file) => sourceExtensions.has(path.extname(file)));

const referencePatterns = [
  /\bhref\s*=\s*(?:\{\s*)?(`[^`]+`|"[^"]+"|'[^']+')/g,
  /\b(?:push|replace|prefetch)\(\s*(`[^`]+`|"[^"]+"|'[^']+')/g,
];
const failures = [];

for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  for (const referencePattern of referencePatterns) {
    for (const match of source.matchAll(referencePattern)) {
      const rawValue = match[1].slice(1, -1);
      const candidate = candidatePath(rawValue);
      if (!candidate) continue;

      const matched =
        legacyRedirects.some((redirect) => redirect.test(candidate)) ||
        routePatterns.some((route) => route.test(candidate));
      if (!matched) {
        const line = source.slice(0, match.index).split("\n").length;
        failures.push(`${path.relative(root, file)}:${line} -> ${rawValue}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Internal navigation references missing App Router pages:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Validated internal navigation against ${routePatterns.length} App Router pages.`,
  );
}
