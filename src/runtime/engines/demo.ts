import type { EngineAdapter, EngineInput, EngineResult } from './types';
import type { Bot, Outcome, Task } from '../../shared/contracts';
import { setTimeout as delay } from 'node:timers/promises';

// Deliberate fixtures, reachable only from the physically separate Demo database.
export class DemoAdapter implements EngineAdapter {
  readonly version = 'Offline fixture 1';
  async readiness() {
    return {
      engine: 'demo' as const,
      state: 'ready' as const,
      version: this.version,
      detail: 'Deterministic offline simulation. No provider or computer connectivity.',
      models: [{ id: 'offline-fixture', name: 'Offline fixture', default: true, efforts: [] }],
    };
  }
  async run(input: EngineInput): Promise<EngineResult> {
    let call = 0;
    const invoke = (name: string, args: unknown) => input.callTool(name, args, `demo-${++call}`);
    const task =
      input.prompt.split('CURRENT REQUEST\n')[1]?.split('\nEND REQUEST')[0] ?? input.prompt;
    input.onSession(`demo-${input.run.id}`, 'offline-fixture');
    let answer: string;
    if (input.run.snapshot.temporary || input.run.snapshot.id !== 'orchestrator') {
      await delay(600, undefined, { signal: input.signal });
      if (/fail/i.test(task) && input.run.attempt === 1)
        throw new Error(
          'Simulated helper failure: source unavailable. Retry this helper to demonstrate recovery.',
        );
      answer =
        'Offline fixture finding: a persistent orchestrator keeps ownership clear; linked tasks make handoffs inspectable. Evidence: the supplied demo brief. No web research was performed.';
    } else if (/approval/i.test(task)) {
      const a = await input.ask(
        'approval',
        'Read a simulated public page',
        'https://example.com/demo',
        'Offline approval scenario. This never sends a network request.',
        ['Allow once', 'Deny'],
      );
      answer =
        a === 'Allow once'
          ? 'One-time approval recorded. The simulated page contains a small product brief. No network request was sent.'
          : 'The request was denied. No page was read. Your existing permissions are unchanged.';
    } else if (/question/i.test(task)) {
      const a = await invoke('relay_ask_user', {
        question: 'Which audience should this demo brief address?',
        reason: 'The audience changes the emphasis.',
        options: ['Hiring manager', 'Engineer'],
      });
      answer = `The demo brief will address ${JSON.stringify(a)}. This question and your answer are retained with the run.`;
    } else if (/recover|failure|delegate|research|comparison|team/i.test(task)) {
      const bots = (await invoke('relay_list_bots', {})) as Bot[];
      const researcher =
        bots.find((b) => b.name === 'Researcher') ??
        ((await invoke('relay_create_bot', {
          name: 'Researcher',
          role: 'Research and evidence',
          instructions: 'Examine the provided material and return concise findings with sources.',
          persistent: true,
        })) as Bot);
      const reviewer =
        bots.find((b) => b.name === 'Reviewer') ??
        ((await invoke('relay_create_bot', {
          name: 'Reviewer',
          role: 'Independent review',
          instructions: 'Check conclusions against the supplied evidence.',
          persistent: true,
        })) as Bot);
      await invoke('relay_delegate', {
        botId: researcher.id,
        objective: /failure|recover/i.test(task)
          ? 'Demo: fail the first attempt, then recover on retry.'
          : 'Examine the supplied demo brief.',
        criteria: 'Return a finding with evidence.',
        context: 'Demo brief: Relay coordinates persistent bots with linked tasks.',
      });
      await invoke('relay_delegate', {
        botId: reviewer.id,
        objective: 'Review the demo product direction.',
        criteria: 'Identify one strength and one limitation.',
        context:
          'Demo brief: Relay is a local orchestrator workspace; schedules require a running computer.',
      });
      const children = (await invoke('relay_wait_children', {})) as Task[];
      const failed = children.filter((c) => c.state !== 'completed');
      answer = failed.length
        ? 'The reviewer completed its check, but the research helper failed in this offline scenario. I can only give a partial comparison. Open the failed helper in Work and choose Retry; both attempts remain visible. No failed assignment is counted as finished.'
        : 'The research and review assignments are complete.\n\n**Recommendation:** keep the orchestrator conversation central, with linked work available for inspection. Both helpers used the supplied demo brief.\n\n**Limitation:** local schedules require the computer and Relay to be running. This is an offline fixture, not live research.';
      await invoke('relay_write_artifact', {
        name: 'demo-comparison.md',
        content: `# Demo comparison\n\n${answer}\n\nSource: supplied offline fixture.`,
      });
      await invoke('relay_finish', {
        status: failed.length ? 'blocked' : 'success',
        summary: answer,
        evidence: children.map((c) => c.id),
        uncertainty: ['Offline fixture only; no live provider or VM.'],
        blockers: failed.map((c) => c.error ?? 'Helper incomplete'),
      });
    } else if (/create.*bot/i.test(task)) {
      const bot = (await invoke('relay_create_bot', {
        name: 'Writing partner',
        role: 'Clear, concise writing',
        instructions: 'Help draft and review short documents.',
        persistent: true,
      })) as Bot;
      answer = `Created **${bot.name}** as a persistent demo bot. Its configuration is available in Bots and will survive a restart. It uses the offline fixture engine.`;
    } else {
      const context = await invoke('relay_search_context', { query: task });
      answer = `This is Relay’s **offline Demo workspace**. I can show real local bot creation, linked task state, approvals, failure and retry using deterministic fixtures.\n\nTry “Delegate a comparison to a researcher and reviewer”, “Show an approval”, or “Demonstrate helper failure and recovery”.\n\nRetrieved ${(context as unknown[]).length} local context records. No provider or virtual computer is connected to this demo.`;
    }
    for (const word of answer.match(/\S+\s*/g) ?? []) {
      await delay(12, undefined, { signal: input.signal });
      input.onText(word);
    }
    return {
      text: answer,
      outcome: {
        status: 'success',
        summary: answer,
        evidence: ['Offline scenario fixture'],
        uncertainty: ['Offline fixture only; no live provider or VM.'],
        blockers: [],
        artifacts: [],
      },
    };
  }
}
