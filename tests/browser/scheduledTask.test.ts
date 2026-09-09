import { describe, expect, test, vi } from "vitest";
import { verifyScheduledTask } from "../../src/browser/actions/scheduledTask.js";

describe("verifyScheduledTask", () => {
  test("requires an active matching task row before succeeding", async () => {
    const page = { navigate: vi.fn().mockResolvedValue(undefined) };
    const runtime = {
      evaluate: vi
        .fn()
        .mockResolvedValueOnce({ result: { value: { status: "missing" } } })
        .mockResolvedValueOnce({
          result: { value: { status: "verified", rowText: "Monthly CHECK_TASK_OK active" } },
        }),
    };
    const logger = Object.assign(vi.fn(), { verbose: false });
    await expect(
      verifyScheduledTask(
        page as never,
        runtime as never,
        "Create a monthly task titled CHECK_TASK_OK",
        logger as never,
        2_000,
        "https://chatgpt.com/c/source",
      ),
    ).resolves.toMatchObject({ verified: true, rowText: expect.stringContaining("CHECK_TASK_OK") });
    expect(page.navigate).toHaveBeenNthCalledWith(1, { url: "https://chatgpt.com/scheduled" });
    expect(page.navigate).toHaveBeenLastCalledWith({ url: "https://chatgpt.com/c/source" });
  });

  test("fails closed when the matching row is inactive", async () => {
    const page = { navigate: vi.fn().mockResolvedValue(undefined) };
    const runtime = {
      evaluate: vi.fn().mockResolvedValue({ result: { value: { status: "inactive" } } }),
    };
    await expect(
      verifyScheduledTask(page as never, runtime as never, "CHECK_TASK_OK", undefined, 100),
    ).rejects.toMatchObject({ details: { code: "scheduled-task-row-unverified" } });
  });
});
