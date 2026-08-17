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

async function assertNoOverflow(page, label) {
  const offenders = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > window.innerWidth + 1 || rect.left < -1;
      })
      .map((element) => ({ tag: element.tagName, className: element.className })),
  );
  if (offenders.length) throw new Error(`${label} horizontal overflow: ${JSON.stringify(offenders)}`);
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator('html[data-ready="true"]').waitFor();

  await page.keyboard.press("f");
  await page.locator(".choice-token").first().waitFor();
  const first = await page.locator(".choice-token").first().textContent();
  if (first !== "F1.00") throw new Error(`First F was not scored at one bit: ${first}`);

  for (let index = 0; index < 10; index += 1) await page.keyboard.press("f");
  const probabilityF = Number((await page.locator("#probability-f").textContent()).replace("%", ""));
  if (probabilityF <= 50) throw new Error(`Predictor did not learn F: ${probabilityF}%`);
  if ((await page.locator(".choice-token").count()) !== 11) throw new Error("Keyboard choices were dropped");

  await page.locator('[data-choice="d"]').click();
  if ((await page.locator("#last-choice").textContent()).trim() !== "D") {
    throw new Error("D button did not register");
  }

  await mkdir("artifacts", { recursive: true });
  await assertNoOverflow(page, "desktop");
  await page.screenshot({ path: "artifacts/outguess-desktop.png", fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(baseURL, { waitUntil: "domcontentloaded" });
  await mobile.locator('html[data-ready="true"]').waitFor();
  await mobile.locator('[data-choice="f"]').click();
  await mobile.locator('[data-choice="d"]').click();
  await assertNoOverflow(mobile, "mobile");
  await mobile.screenshot({ path: "artifacts/outguess-mobile.png", fullPage: true });

  console.log(JSON.stringify({
    choices: 12,
    probabilityF,
    desktop: "artifacts/outguess-desktop.png",
    mobile: "artifacts/outguess-mobile.png",
  }));
} finally {
  await browser.close();
  server?.kill("SIGTERM");
}
