import { expect, test, type Page } from "@playwright/test";

const username = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const passphrase = "TestPassphrase-2026";

async function openProtectedRoute(page: Page, path: string) {
  await page.goto(path);
  if (await page.locator("#auth-username").isVisible()) {
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-passphrase").fill(passphrase);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
  }
  await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}$`));
}

test.describe.serial("core portfolio workflows", () => {
  test("registers, records a transaction, configures rebalance, and opens analytics", async ({ page }, testInfo) => {
    test.setTimeout(90_000);

    await page.goto("/portfolio/add");
    await page.getByRole("tab", { name: "Register" }).click();
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-passphrase").fill(passphrase);
    await page.locator("#auth-confirm-passphrase").fill(passphrase);
    await page.getByRole("button", { name: "Create Account" }).click();
    await page.getByRole("button", { name: "I have saved my passphrase" }).click();
    await expect(page).toHaveURL(/\/portfolio\/add$/);
    await page.getByLabel("Token Symbol").fill("BTC");
    await page.getByLabel("Token Name").fill("Bitcoin");
    await page.getByLabel("Quantity").fill("0.25");
    await page.getByLabel("Price per Unit (USD)").fill("50000");
    await page.screenshot({
      path: testInfo.outputPath("add-transaction-desktop.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Add Transaction", exact: true }).click();
    await expect(page).toHaveURL(/\/portfolio$/);
    await expect(page.getByRole("rowheader", { name: "BTC" })).toBeVisible();
    await page.waitForTimeout(1_000);

    await openProtectedRoute(page, "/rebalance");
    await page.getByRole("button", { name: "Add Token" }).click();
    await page.getByPlaceholder("Token symbol (e.g. ETH)").fill("BTC");
    await page.getByPlaceholder("Target %").fill("100");
    await page.getByRole("button", { name: "Save Targets" }).first().click();
    // The three phases are a stepper now, not a tab strip.
    await expect(page.getByRole("button", { name: /Analysis/ })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("rebalance-desktop.png"),
      fullPage: true,
    });

    await openProtectedRoute(page, "/analytics");
    await expect(page.getByRole("navigation", { name: "Analytics" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Portfolio History", exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("analytics-desktop.png"),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Allocation History", exact: true }).click();
    await expect(page).toHaveURL(/\/analytics\/allocation$/);
  });

  test("supports the authenticated mobile navigation", async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/portfolio");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-passphrase").fill(passphrase);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(page).toHaveURL(/\/portfolio$/);

    // The off-canvas drawer is gone: five destinations sit in a bottom tab
    // bar, and the desktop rail is display:none at this width, so the link
    // below resolves to the tab.
    await expect(page.getByRole("link", { name: "Analytics" })).toBeVisible();
    await page.getByRole("link", { name: "Analytics" }).click();
    await expect(page).toHaveURL(/\/analytics$/);
    await expect(page.getByRole("navigation", { name: "Analytics" })).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: testInfo.outputPath("analytics-mobile.png"),
      fullPage: true,
    });
  });
});
