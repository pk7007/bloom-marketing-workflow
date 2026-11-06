import { test, expect } from "@playwright/test";
test("approve a demo draft, schedule it, then invalidate approval by editing", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Make room for good ideas." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Approvals/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Review this post" }).first().click();
  await page.getByRole("button", { name: "Approve version" }).click();
  await page
    .getByRole("button", { name: "Content studio", exact: true })
    .click();
  const card = page.locator(".content-card").filter({
    has: page.getByRole("button", {
      name: "A little room to slow down",
      exact: true,
    }),
  });
  await card.getByRole("button", { name: "Schedule", exact: true }).click();
  const timeInput = page.getByLabel("Publication time", { exact: true });
  const defaultTime = await timeInput.inputValue();
  await timeInput.fill("2020-01-01T10:00");
  await page
    .getByRole("button", { name: "Schedule post", exact: true })
    .click();
  await expect(page.locator(".dialog")).toContainText(
    "Choose a time at least one minute in the future",
  );
  await timeInput.fill(defaultTime);
  await page
    .getByRole("button", { name: "Schedule post", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Demo schedule saved");
  await card
    .getByRole("button", { name: "A little room to slow down", exact: true })
    .click();
  await page
    .getByLabel("Your caption")
    .fill("A refreshed caption, ready for another review.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(card.locator(".badge")).toHaveText("Draft");
  await page.reload();
  await page
    .getByRole("button", { name: "Content studio", exact: true })
    .click();
  await expect(
    page
      .locator(".content-card")
      .filter({ hasText: "A little room to slow down" })
      .locator(".badge"),
  ).toHaveText("Draft");
});
test("creator view hides approval actions and mobile layout fits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Demo role").selectOption("creator");
  await page.getByRole("button", { name: "Open approval inbox" }).click();
  await page.getByRole("button", { name: "Review this post" }).click();
  await expect(
    page.getByRole("button", { name: "Approve version" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close dialog" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
