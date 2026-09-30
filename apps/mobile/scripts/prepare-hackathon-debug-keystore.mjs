import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.EAS_BUILD_PROFILE !== "hackathon-apk") {
  process.exit(0);
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const keystorePath = resolve(scriptDirectory, "../android/app/debug.keystore");

if (!existsSync(keystorePath)) {
  mkdirSync(dirname(keystorePath), { recursive: true });
  execFileSync(
    "keytool",
    [
      "-genkeypair",
      "-noprompt",
      "-storetype",
      "JKS",
      "-keystore",
      keystorePath,
      "-alias",
      "androiddebugkey",
      "-storepass",
      "android",
      "-keypass",
      "android",
      "-dname",
      "CN=Android Debug,O=Android,C=US",
      "-keyalg",
      "RSA",
      "-keysize",
      "2048",
      "-validity",
      "10000",
    ],
    { stdio: "inherit" },
  );
}

console.log("Prepared the hackathon debug signing keystore.");
