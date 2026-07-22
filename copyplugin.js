import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.argv.find((arg) => arg === "-dev") !== undefined;
const VORTEX_PLUGINS = path.join(
  process.env.APPDATA,
  isDev ? "vortex_devel" : "Vortex",
  "plugins",
);

async function removeOldPlugins(name) {
  try {
    await fs.stat(VORTEX_PLUGINS);
  } catch {
    console.log(`${VORTEX_PLUGINS} doesn't exist.`);
    return;
  }

  const entries = (await fs.readdir(VORTEX_PLUGINS)).filter((entry) =>
    entry.startsWith(name),
  );
  for (const entry of entries) {
    const dir = path.join(VORTEX_PLUGINS, entry);
    const contents = await fs.readdir(dir);
    for (const content of contents) {
      await fs.unlink(path.join(dir, content));
    }
    await fs.rmdir(dir);
  }
}

async function start() {
  const packageData = await fs.readFile(path.join(__dirname, "package.json"), {
    encoding: "utf8",
  });

  try {
    const data = JSON.parse(packageData);
    const destination = path.join(
      VORTEX_PLUGINS,
      `${data.name}-${data.version}`,
    );
    await removeOldPlugins(data.name);
    const fileEntries = (await fs.readdir(path.join(__dirname, "dist"))).filter(
      (file) => !file.endsWith(".map"),
    );
    await fs.mkdir(destination, { recursive: true });
    for (const file of fileEntries) {
      await fs.copyFile(
        path.join(__dirname, "dist", file),
        path.join(destination, file),
      );
    }
    console.log(`${fileEntries.length} file(s) copied to ${destination}`);
  } catch (err) {
    console.error(err);
  }
}

start();
