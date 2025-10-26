import { expect, test } from "@playwright/test";

test("GET /", async ({ page }) => {
  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toContainText("Home");
  await expect(body).toContainText("Welcome to the marketing pages.");
  await expect(body).toContainText(
    "This landing page is rendered entirely on the server.",
  );
});

test("GET /about", async ({ page }) => {
  await page.goto("/about");
  const body = page.locator("body");
  await expect(body).toContainText("About");
  await expect(body).toContainText("Welcome to the marketing pages.");
  await expect(body).toContainText("server-first React meta framework");
});

test("GET /shop", async ({ page }) => {
  await page.goto("/shop");
  const body = page.locator("body");
  await expect(body).toContainText("Shop");
  await expect(body).toContainText("The Stack Tee — $28");
  await expect(body).toContainText("SSR Mug — $18");
  await expect(body).toContainText("Framework Sticker Pack — $8");
});

test("navigates from / to /shop", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Shop" }).click();
  await expect(page).toHaveURL(/\/shop$/);
  const body = page.locator("body");
  await expect(body).toContainText("Shop");
  await expect(body).toContainText("The Stack Tee — $28");
  await expect(body).toContainText("SSR Mug — $18");
  await expect(body).toContainText("Framework Sticker Pack — $8");
});
