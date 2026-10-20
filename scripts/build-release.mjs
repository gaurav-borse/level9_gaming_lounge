// Builds the double-click folder:  release/  (start.bat, stop.bat, node/, app/, README.txt)
// Run with:  npm run release     (needs internet once, for the fonts)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "release");
const standalone = path.join(root, ".next", "standalone");

const r = spawnSync("npm run build", { cwd: root, stdio: "inherit", shell: true });
if (r.status !== 0) throw new Error("npm run build failed");

const app = path.join(out, "app");
try {
  fs.rmSync(app, { recursive: true, force: true }); // only ever release/app, our own output
} catch {
  throw new Error("Could not replace release/app. Is the lounge app still running from it? Run release/stop.bat and try again.");
}
fs.mkdirSync(app, { recursive: true });

// Next's file tracer can pull the developer's own data/ folder (database, auth secret) into the standalone
// output. Never copy it, whatever the tracer decides.
const isLocalData = (src) => ["data", "release"].some((d) => path.relative(standalone, src).split(path.sep)[0] === d);
fs.cpSync(standalone, app, { recursive: true, filter: (src) => !isLocalData(src) });
fs.cpSync(path.join(root, ".next", "static"), path.join(app, ".next", "static"), { recursive: true });
fs.cpSync(path.join(root, "public"), path.join(app, "public"), { recursive: true });

for (const leaked of ["data", "release"]) {
  if (fs.existsSync(path.join(app, leaked))) throw new Error(`release/app/${leaked} must not exist. Refusing to ship local data.`);
}

// The Node you built and tested with is a single self-contained exe: ship it so nothing needs installing.
const nodeDir = path.join(out, "node");
fs.mkdirSync(nodeDir, { recursive: true });
fs.copyFileSync(process.execPath, path.join(nodeDir, "node.exe"));

// Windows batch files need CRLF line endings.
for (const f of fs.readdirSync(path.join(root, "release-files"))) {
  const text = fs.readFileSync(path.join(root, "release-files", f), "utf8").replace(/\r?\n/g, "\r\n");
  fs.writeFileSync(path.join(out, f), text);
}
fs.writeFileSync(path.join(out, "VERSION"), `${process.version}\n`);
console.log(`\nRelease ready: ${out}\nCopy that whole folder to the lounge laptop and double-click start.bat`);
