import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function start() {
  const distFolder = path.join(__dirname, "dist");
  const packageJsonPath = path.join(__dirname, "package.json");
  const infoJsonPath = path.join(distFolder, "info.json");

  const packageData = await fs.readFile(packageJsonPath, { encoding: "utf8" });
  const packageJson = JSON.parse(packageData);

  const infoJson = {
    name: packageJson?.config?.extensionName ?? packageJson.name,
    author: packageJson.author,
    version: packageJson.version,
    description: packageJson.description,
  };

  await fs.mkdir(distFolder, { recursive: true });
  await fs.writeFile(infoJsonPath, JSON.stringify(infoJson, null, 2), {
    encoding: "utf8",
  });
  console.log(JSON.stringify(infoJson));
}

start();
