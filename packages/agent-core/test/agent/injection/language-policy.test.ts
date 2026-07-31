import { describe, expect, it } from 'vitest';

import type { Agent } from '../../../src/agent';
import { LanguagePolicyInjector } from '../../../src/agent/injection/language-policy';
import { InjectionManager } from '../../../src/agent/injection/manager';
import { SessionReplyLanguagePolicy } from '../../../src/session/language-policy';

function policy(language: string): SessionReplyLanguagePolicy {
  return new SessionReplyLanguagePolicy({
    replyLanguage: language,
    onDidChange: async () => {},
  });
}

function fakeAgent(type: 'main' | 'sub', sharedPolicy: SessionReplyLanguagePolicy): Agent {
  const history: Array<Record<string, unknown>> = [];
  return {
    type,
    replyLanguagePolicy: sharedPolicy,
    context: {
      history,
      appendSystemReminder: (content: string, origin: unknown) => {
        history.push({ role: 'user', content: [{ type: 'text', text: content }], origin });
      },
    },
  } as unknown as Agent;
}

function reminders(agent: Agent): string[] {
  return (agent.context.history as unknown as Array<{
    origin?: { kind?: string; variant?: string };
    content: Array<{ type: string; text?: string }>;
  }>)
    .filter((message) => message.origin?.kind === 'injection' && message.origin.variant === 'language_policy')
    .map((message) => message.content.map((part) => part.text ?? '').join(''));
}

describe('LanguagePolicyInjector', () => {
  it('is registered by InjectionManager when an Agent has a Session policy', () => {
    const agent = fakeAgent('sub', policy('Japanese'));
    const manager = new InjectionManager(agent);
    const injectors = (manager as unknown as { injectors: unknown[] }).injectors;

    expect(injectors.some((injector) => injector instanceof LanguagePolicyInjector)).toBe(true);
  });

  it('shares one policy with main and child contexts, refreshes on change, and reinjects after compaction', async () => {
    const shared = policy('Japanese');
    const main = fakeAgent('main', shared);
    const child = fakeAgent('sub', shared);
    const mainInjector = new LanguagePolicyInjector(main, shared);
    const childInjector = new LanguagePolicyInjector(child, shared);

    await mainInjector.inject();
    await childInjector.inject();
    await mainInjector.inject();
    await childInjector.inject();
    expect(reminders(main)).toEqual([expect.stringContaining('Session user-facing language: Japanese.')]);
    expect(reminders(child)).toEqual([expect.stringContaining('Session user-facing language: Japanese.')]);

    shared.restore('Korean');
    await mainInjector.inject();
    await childInjector.inject();
    expect(reminders(main)).toHaveLength(2);
    expect(reminders(child)).toHaveLength(2);
    expect(reminders(main).at(-1)).toContain('Session user-facing language: Korean.');
    expect(reminders(child).at(-1)).toContain('Session user-facing language: Korean.');

    // Full compaction drops injection messages before notifying injectors.
    (main.context.history as unknown[]).splice(0);
    mainInjector.onContextCompacted();
    await mainInjector.inject();
    expect(reminders(main)).toEqual([expect.stringContaining('Session user-facing language: Korean.')]);
  });
});
