import { applyAuth, expect, test } from "./fixtures";

const hrRoutes = [
  "/hr/training/1",
  "/hr/performance/1",
  "/hr/leave/balances",
  "/hr/payroll/statutory-filing",
];

test.describe("HR route integrity", () => {
  test.beforeEach(async ({ page, apiToken, apiRefreshToken, baseURL }) => {
    await applyAuth(
      page,
      page.context(),
      apiToken,
      apiRefreshToken,
      baseURL!,
    );
  });

  for (const route of hrRoutes) {
    test(`${route} resolves to an application page`, async ({ page }) => {
      const response = await page.goto(route, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });

      expect(response?.status()).toBeLessThan(400);
      await expect(page).not.toHaveURL(/\/login|\/404(?:\/|$)/);
      await expect(page.getByText("404 Page Not Found")).toHaveCount(0);
    });
  }

  test("legacy leave balance URL redirects to the canonical HR route", async ({
    page,
  }) => {
    const response = await page.goto("/leave/balances", {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });

    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/hr\/leave\/balances$/);
  });
});
