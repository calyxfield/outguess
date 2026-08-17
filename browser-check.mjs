import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:4187";
let server = null;

if (!process.env.EXTERNAL_SERVER) {
  server = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: "4187" },
    stdio: ["ignore", "pipe", "inherit"],
  });

  await new Promise((resolve, reject) => {
    server.stdout.on("data", (chunk) => {
      if (String(chunk).includes("listening")) resolve();
    });
    server.once("error", reject);
  });
}

const browser = await chromium.launch({
  headless: true,
  env: {
    ...process.env,
    LD_LIBRARY_PATH: "/workspace/.playwright-libs/root/usr/lib/x86_64-linux-gnu:/workspace/.playwright-libs/root/lib/x86_64-linux-gnu",
    FONTCONFIG_FILE: "/tmp/pw-deps/fonts.conf",
    FONTCONFIG_PATH: "/tmp/pw-deps",
  },
});
try {
  console.log("browser launched");
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator('html[data-ready="true"]').waitFor();
  console.log("desktop loaded");
  const firstGuess = (await page.locator("#guess").textContent()).trim();
  console.log(`locked guess: ${firstGuess}`);
  await page.evaluate((guess) => {
    const input = document.querySelector("#word-input");
    input.value = guess;
    document.querySelector("#word-form").requestSubmit();
  }, firstGuess);
  await page.locator("tbody tr").first().waitFor();
  console.log("first word scored");
  const firstCells = await page.locator("tbody tr").first().locator("td").allTextContents();
  if (firstCells.at(-1) !== "00" || firstCells[1] !== firstGuess) {
    throw new Error(`Exact prediction was not scored as a catch: ${firstCells.join(" | ")}`);
  }

  await page.evaluate(() => {
    const input = document.querySelector("#word-input");
    input.value = "quasar";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
  });
  if ((await page.locator("tbody tr").count()) !== 2) {
    throw new Error("Space did not commit the second word");
  }
  console.log("second word scored");

  await mkdir("artifacts", { recursive: true });
  await page.waitForTimeout(350);
  await page.screenshot({ path: "artifacts/outguess-desktop.png", fullPage: true });
  console.log("desktop captured");

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(baseURL, { waitUntil: "domcontentloaded" });
  await mobile.locator('html[data-ready="true"]').waitFor();
  await mobile.screenshot({ path: "artifacts/outguess-mobile.png", fullPage: true });
  console.log(JSON.stringify({ firstGuess, desktop: "artifacts/outguess-desktop.png", mobile: "artifacts/outguess-mobile.png" }));
} finally {
  await browser.close();
  server?.kill("SIGTERM");
}
