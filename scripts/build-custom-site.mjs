import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await cp(path.join(root, "status-page"), dist, { recursive: true });

for (const dir of ["assets", "history"]) {
  const source = path.join(root, dir);
  if (existsSync(source)) {
    await cp(source, path.join(dist, dir), { recursive: true });
  }
}

await writeFile(path.join(dist, ".nojekyll"), "");
await writeFile(path.join(dist, "CNAME"), "status.namoid.in\n");
