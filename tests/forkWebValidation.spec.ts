import { expect, test, Page } from "@playwright/test";

// Every number and exercise below is synthetic; no private fitness exports, credentials,
// real accounts or production API endpoints are used in the browser test environment.
const START = "/app/index.html?skipintro=1&nosync=true";
const DATE1 = Date.parse("2026-07-14T12:00:00Z");
const DATE2 = Date.parse("2026-07-16T12:00:00Z");

async function openIsolatedApp(page: Page): Promise<void> {
  const response = await page.goto(START);
  expect(response?.status(), "webpack must serve the actual app HTML, not a proxy/404 page").toBe(200);
  const entitlement = "CI-SYNTHETIC-ENTITLEMENT-NOT-A-REAL-KEY";
  // The first launch can still have pending writes from Liftosaur initialization.
  // Re-read after each reload and retry a local-only bootstrap if a write raced
  // those initial saves. Fail quickly with a useful state snapshot if it persists.
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.waitForFunction(() =>
      !!(window as any).state?.storage?.settings && typeof (window as any).storeData === "function"
    );
    const ready = await page.evaluate(({ entitlement }) => {
      const storage = (window as any).state.storage;
      return storage.currentProgramId === "emptyprogram" &&
        storage.hearAboutUs?.done === true &&
        storage.subscription?.key === entitlement;
    }, { entitlement });
    if (ready) {
      await expect(page.getByTestId("footer-graphs")).toBeVisible();
      await expect(page.getByTestId("footer-me")).toBeVisible();
      return;
    }
    await page.evaluate(async ({ entitlement }) => {
      const app = window as any;
      const storage = structuredClone(app.state.storage);
      storage.currentProgramId = "emptyprogram";
      // Prevent unrelated onboarding dialogs from blocking the isolated suite.
      storage.hearAboutUs = { requests: [], done: true };
      // Local synthetic entitlement: exercise the real Premium UI without
      // altering production subscription checks or contacting any payment API.
      storage.subscription = { ...storage.subscription, key: entitlement };
      await app.storeData({ storage });
    }, { entitlement });
    await page.reload();
  }
  const snapshot = await page.evaluate(() => ({
    program: (window as any).state?.storage?.currentProgramId,
    surveyDone: (window as any).state?.storage?.hearAboutUs?.done,
    hasTestEntitlement: (window as any).state?.storage?.subscription?.key ===
      "CI-SYNTHETIC-ENTITLEMENT-NOT-A-REAL-KEY",
  }));
  throw new Error("Isolated app bootstrap did not persist after 4 attempts: " + JSON.stringify(snapshot));
}

async function seedSyntheticHistory(page: Page): Promise<void> {
  await openIsolatedApp(page);
  // Liftosaur itself produces the required default storage shape.
  // Clone that default instead of inventing an incomplete account schema.
  await page.evaluate(async ({ first, second }) => {
    const app = window as any;
    const storage = structuredClone(app.state.storage);
    const create = (startTime: number, load: number, rir: number, suffix: string) => {
      const w = { value: load, unit: "kg" };
      return {
        vtype: "history_record",
        id: startTime,
        startTime,
        endTime: startTime + 30 * 60000,
        date: new Date(startTime).toISOString(),
        programId: "synthetic-e2e",
        programName: "Synthetic CI",
        day: 1,
        dayName: "Pull-ups - test only",
        source: "macrofactor-workouts",
        entries: [{
          vtype: "history_entry",
          id: "entry-" + suffix,
          index: 0,
          exercise: { id: "pullUp", equipment: "bodyweight" },
          warmupSets: [],
          sets: [{
            vtype: "set",
            id: "set-" + suffix,
            index: 0,
            reps: 5,
            completedReps: 5,
            weight: w,
            completedWeight: w,
            isCompleted: true,
            customMetrics: { rir },
            completedRpe: 10 - rir,
            rpeDerivedFromRir: true,
          }],
        }],
      };
    };
    storage.history = [create(first, 20, 3, "one"), create(second, 22, 2, "two")];
    storage.stats.weight.weight = [{
      vtype: "stat", timestamp: Date.parse("2026-07-14T06:00:00Z"),
      value: { value: 85, unit: "kg" },
    }];
    storage.stats.bodyweightTrend = [{
      date: "2026-07-16", kg: 84.6, source: "macrofactor",
    }];
    storage.settings.units = "kg";
    storage.settings.nickname = "SYNTHETIC CI — never a personal record";
    await app.storeData({ storage });
  }, { first: DATE1, second: DATE2 });
  await page.reload();
  await page.waitForFunction(() => (window as any).state?.storage?.history?.length === 2);
}

test("All Workouts graphs show actual persisted synthetic history and preserve RIR after reload", async ({ page }) => {
  await seedSyntheticHistory(page);
  await page.getByTestId("footer-graphs").click();
  const dashboard = page.getByTestId("all-workout-history-dashboard");
  await expect(dashboard).toBeVisible();
  await expect(dashboard).toContainText("All Workouts — History");
  await expect(dashboard).toContainText("Pull-ups - test only");
  await expect(dashboard).toContainText("Workouts");
  await expect(dashboard).toContainText("2");
  const performance = page.getByTestId("bodyweight-load-performance");
  await expect(performance).toContainText("Pull-ups and dips — three load measures");
  await expect(performance).toContainText("static supported mass: 105 kg");
  await expect(performance).toContainText("equivalent resistance not available");
  const model = await page.evaluate(() => {
    const data = (window as any).state.storage;
    return {
      history: data.history.map((r: any) => ({
        id: r.id,
        load: r.entries[0].sets[0].completedWeight.value,
        rir: r.entries[0].sets[0].customMetrics.rir,
        rpe: r.entries[0].sets[0].completedRpe,
      })),
      nickname: data.settings.nickname,
    };
  });
  expect(model.history).toEqual([
    { id: DATE1, load: 20, rir: 3, rpe: 7 },
    { id: DATE2, load: 22, rir: 2, rpe: 8 },
  ]);
  expect(model.nickname).toContain("SYNTHETIC CI");
});

test("Contribution editor records 95% in native settings and survives browser reload", async ({ page }) => {
  await seedSyntheticHistory(page);
  await page.getByTestId("footer-graphs").click();
  const graph = page.getByTestId("bodyweight-load-performance");
  const editor = graph.getByTestId("bodyweight-contribution-editor-pullUp_bodyweight");
  await expect(editor).toBeVisible();
  await expect(graph).toContainText("equivalent resistance not available");

  // InputNumber2 uses document keydown events on desktop, not the mobile pad.
  const percentField = editor.getByTestId("input-bodyweight-contribution-percent-field");
  await percentField.click();
  await expect(percentField.locator(".blinking")).toBeVisible();
  await page.keyboard.type("95");
  await expect(percentField).toContainText("95");
  await page.keyboard.press("Enter"); // inputCommitMode="blur": persist the new value.
  const saveContribution = editor.getByTestId("save-bodyweight-contribution");
  await expect(saveContribution).toBeEnabled();
  await saveContribution.click();
  await expect(editor).toContainText("Coefficient saved");
  await expect(graph).toContainText("equivalent resistance: 100.75 kg");
  await expect(graph).toContainText("95%");

  const before = await page.evaluate(() => {
    const state = (window as any).state.storage;
    return {
      percent: state.settings.exerciseData.pullUp_bodyweight.bodyweightContributions[0].fraction,
      source: state.settings.exerciseData.pullUp_bodyweight.bodyweightContributions[0].provenance,
      setCount: state.history.reduce((n: number, r: any) => n + r.entries[0].sets.length, 0),
      originalLoads: state.history.map((r: any) => r.entries[0].sets[0].completedWeight.value),
      customRirs: state.history.map((r: any) => r.entries[0].sets[0].customMetrics.rir),
    };
  });
  expect(before).toEqual({
    percent: 0.95, source: "user-estimate", setCount: 2,
    originalLoads: [20, 22], customRirs: [3, 2],
  });
  // Persistence is asynchronously batched; give the native Liftosaur storage write
  // time to flush before forcing a browser reload.
  await page.waitForTimeout(850);
  await page.reload();
  await page.waitForFunction(() => (window as any).state?.storage?.history?.length === 2);
  await page.getByTestId("footer-graphs").click();
  await expect(page.getByTestId("bodyweight-load-performance")).toContainText("equivalent resistance: 100.75 kg");
  const after = await page.evaluate(() => {
    const state = (window as any).state.storage;
    return {
      percent: state.settings.exerciseData.pullUp_bodyweight.bodyweightContributions[0].fraction,
      source: state.settings.exerciseData.pullUp_bodyweight.bodyweightContributions[0].provenance,
      setCount: state.history.reduce((n: number, r: any) => n + r.entries[0].sets.length, 0),
      originalLoads: state.history.map((r: any) => r.entries[0].sets[0].completedWeight.value),
      customRirs: state.history.map((r: any) => r.entries[0].sets[0].customMetrics.rir),
    };
  });
  expect(after).toEqual(before);
});

test("Custom metric manager creates a typed metric without removing existing histories", async ({ page }) => {
  await seedSyntheticHistory(page);
  await page.getByTestId("footer-me").click();
  const manager = page.getByTestId("custom-metric-settings");
  await expect(manager).toBeVisible();
  await expect(manager).toContainText("RIR");
  await manager.getByTestId("new-metric-name").fill("Tempo");
  await manager.getByTestId("new-metric-unit").fill("seconds");
  await manager.getByTestId("create-custom-metric").click();
  await expect(manager).toContainText("Tempo");
  await expect.poll(async () => page.evaluate(() =>
    (window as any).state?.storage?.settings?.customMetricDefinitions?.some((x: any) => x.id === "tempo")
  )).toBe(true);
  await page.waitForTimeout(850);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).state?.storage?.settings);
  const saved = await page.evaluate(() => {
    const s = (window as any).state.storage;
    return {
      metric: s.settings.customMetricDefinitions?.find((x: any) => x.id === "tempo"),
      histories: s.history.length,
      originalRirs: s.history.map((x: any) => x.entries[0].sets[0].customMetrics.rir),
    };
  });
  expect(saved.metric).toMatchObject({ id: "tempo", kind: "number", scope: "set", unit: "seconds" });
  expect(saved.histories).toBe(2);
  expect(saved.originalRirs).toEqual([3, 2]);
});
