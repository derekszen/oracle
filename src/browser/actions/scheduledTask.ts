import type { BrowserLogger, ChromeClient } from "../types.js";
import { BrowserAutomationError } from "../../oracle/errors.js";
import { delay } from "../utils.js";

export interface ScheduledTaskVerification {
  verified: boolean;
  title?: string;
  rowText?: string;
}

/**
 * Verify that ChatGPT persisted a Scheduled task after the composer handoff.
 * The assistant's confirmation text is deliberately never treated as proof.
 */
export async function verifyScheduledTask(
  Page: ChromeClient["Page"],
  Runtime: ChromeClient["Runtime"],
  prompt: string,
  logger?: BrowserLogger,
  timeoutMs = 30_000,
  returnUrl?: string,
): Promise<ScheduledTaskVerification> {
  const scheduledUrl = "https://chatgpt.com/scheduled";
  await Page.navigate({ url: scheduledUrl });
  const deadline = Date.now() + timeoutMs;
  const tokens = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .slice(0, 6);
  const expression = `(() => {
    const tokens = ${JSON.stringify(tokens)};
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const text = (node) => String(node?.innerText || node?.textContent || '').replace(/\\s+/g, ' ').trim();
    const candidates = Array.from(document.querySelectorAll('main article, main li, main [role="row"], main [role="listitem"], main section'))
      .filter(visible)
      .map((node) => ({ node, value: text(node) }))
      .filter((item) => item.value.length > 0 && item.value.length < 2_000);
    const match = candidates.find((item) => tokens.length > 0 && tokens.filter((token) => item.value.toLowerCase().includes(token)).length >= Math.min(3, tokens.length));
    if (!match) return { status: 'missing' };
    const active = !/\\b(disabled|paused|inactive)\\b/i.test(match.value);
    return { status: active ? 'verified' : 'inactive', rowText: match.value };
  })()`;
  let lastStatus = "waiting";
  while (Date.now() < deadline) {
    const { result } = await Runtime.evaluate({ expression, returnByValue: true });
    const value = result.value as { status?: string; rowText?: string } | undefined;
    lastStatus = value?.status ?? lastStatus;
    if (value?.status === "verified") {
      logger?.("Verified active Scheduled task row");
      if (returnUrl) await Page.navigate({ url: returnUrl });
      return { verified: true, rowText: value.rowText };
    }
    if (value?.status === "inactive") break;
    await delay(500);
  }
  if (returnUrl) await Page.navigate({ url: returnUrl });
  throw new BrowserAutomationError("ChatGPT did not expose a verified active Scheduled task row.", {
    stage: "scheduled-task-verification",
    code: "scheduled-task-row-unverified",
    timeoutMs,
    lastStatus,
  });
}

export function buildScheduledTaskVerificationExpressionForTest(tokens: string[]): string {
  return `(() => ${JSON.stringify(tokens)})()`;
}
