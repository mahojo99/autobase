import { _electron as electron } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
mkdirSync(resolve('.cache/accessibility'), { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  args: ['.'],
  env: { ...env, RELAY_DATA_DIR: mkdtempSync(resolve('.cache/accessibility/session-')) },
});
try {
  const page = await app.firstWindow();
  await page.getByRole('heading', { name: 'Your workspace, in conversation.' }).waitFor();
  const result = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  writeFileSync(
    resolve('.cache/accessibility/audit.json'),
    JSON.stringify(result.violations, null, 2),
  );
  console.log(
    JSON.stringify(
      result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          selector: n.target,
          text: n.html.slice(0, 120),
          why: n.failureSummary,
        })),
      })),
      null,
      2,
    ),
  );
} finally {
  await app.close();
}
