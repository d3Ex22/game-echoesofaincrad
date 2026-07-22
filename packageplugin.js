import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import archiver from "archiver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function pack() {
  const packageData = await fs.promises.readFile(
    path.join(__dirname, "package.json"),
    { encoding: "utf8" },
  );
  const data = JSON.parse(packageData);
  const destinationFolder = path.join(__dirname, "out");
  const destination = path.join(
    destinationFolder,
    `${data.name}-${data.version}.zip`,
  );

  await fs.promises.mkdir(destinationFolder, { recursive: true });

  const output = fs.createWriteStream(destination);
  const archive = archiver("zip", { zlib: { level: 9 } });

  await new Promise((resolve, reject) => {
    output.on("close", () => {
      console.log(
        `${archive.pointer().toLocaleString()} bytes written to ${destination}`,
      );
      resolve();
    });
    archive.on("error", reject);
    archive.pipe(output);
    archive.glob("**/*", {
      cwd: path.join(__dirname, "dist"),
      ignore: ["**/*.map"],
      dot: true,
    });
    archive.finalize();
  });
}

pack();
