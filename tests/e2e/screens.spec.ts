import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
const screens = [
  "Overview",
  "Content studio",
  "Approvals",
  "Calendar",
  "Analytics",
  "Brand settings",
  "Team & connections",
];
async function navigate(page: Page, name: string) {
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("button", {
      name: name === "Approvals" ? /^Approvals(?: \d+)?$/ : name,
      exact: true,
    })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}
for (const mobile of [false, true])
  test(`all seven screens are usable and accessible on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Make room for good ideas." }),
    ).toBeVisible();
    for (const screen of screens) {
      await navigate(page, screen);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
        `${screen} accessibility`,
      ).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`${screen.replaceAll(/[^a-z]/gi, "-")}.png`),
        fullPage: true,
      });
    }
    expect(errors).toEqual([]);
  });
test("create, upload, generate samples, and atomically submit an edited draft", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create content", exact: true })
    .click();
  await page.getByLabel("Content title", { exact: true }).fill("A fresh start");
  await page
    .getByLabel("The brief", { exact: true })
    .fill("Share our new handmade ceramic collection.");
  const buffer = await sharp({
    create: { width: 1000, height: 1000, channels: 3, background: "#d9c4ac" },
  })
    .png()
    .toBuffer();
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "sample.png", mimeType: "image/png", buffer });
  await expect(page.locator(".upload-area")).toContainText("1000 × 1000");
  await page
    .getByRole("button", { name: "Get sample captions", exact: true })
    .click();
  await page.locator(".caption-options>button").first().click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await navigate(page, "Content studio");
  const card = page.locator(".content-card").filter({
    has: page.getByRole("button", { name: "A fresh start", exact: true }),
  });
  await expect(card).toBeVisible();
  await card
    .getByRole("button", { name: "A fresh start", exact: true })
    .click();
  await page
    .getByLabel("Your caption")
    .fill("A revised caption for a thoughtful new collection.");
  await page
    .getByRole("button", { name: "Send for review", exact: true })
    .click();
  await expect(card.locator(".badge")).toHaveText("In review");
  await card
    .getByRole("button", { name: "Details & review", exact: true })
    .click();
  await expect(page.locator(".caption-text")).toHaveText(
    "A revised caption for a thoughtful new collection.",
  );
  await expect(page.locator(".review-detail")).toContainText("Version 2");
  const findings = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(findings.violations).toEqual([]);
});
test("demo mode rejects direct live-service mutations", async ({ request }) => {
  for (const path of [
    "commands",
    "generate",
    "team",
    "upload",
    "meta/connect",
  ]) {
    const r = await request.post(`/api/${path}`, {
      headers: { Origin: "http://127.0.0.1:3100" },
      data: {},
    });
    expect(r.status(), path).toBe(503);
    expect((await r.json()).error).toContain("disabled");
  }
});
test("dialog keyboard focus is trapped, visible for uploads, and restored on close", async ({
  page,
}) => {
  await page.goto("/");
  const create = page.getByRole("button", {
    name: "Create content",
    exact: true,
  });
  await create.click();
  await expect(
    page.getByRole("button", { name: "Close dialog", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Content title", { exact: true })).toBeFocused();
  await page.locator("input[type=file]").focus();
  await expect(page.locator(".upload-area")).toHaveCSS(
    "outline-style",
    "solid",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(create).toBeFocused();
});
