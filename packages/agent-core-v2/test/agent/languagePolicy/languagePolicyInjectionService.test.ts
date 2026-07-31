/**
 * Scenario: the session reply-language policy is injected independently into
 * every Agent context, refreshed only for policy changes or lost context, and
 * rendered as user-interaction guidance rather than repository-artifact rules.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SyncDescriptor } from '#/_base/di/descriptors';
import { DisposableStore } from '#/_base/di/lifecycle';
import { TestInstantiationService } from '#/_base/di/test';
import { AsyncEmitter } from '#/_base/event';
import {
  IAgentContextInjectorService,
  type ContextInjectionProvider,
} from '#/agent/contextInjector/contextInjector';
import { IAgentLanguagePolicyInjectionService } from '#/agent/languagePolicy/languagePolicy';
import { AgentLanguagePolicyInjectionService } from '#/agent/languagePolicy/languagePolicyInjectionService';
import { IAgentStateService } from '#/agent/state/agentState';
import { AgentStateService } from '#/agent/state/agentStateService';
import {
  ISessionLanguagePolicy,
  type ISessionLanguagePolicy as SessionLanguagePolicy,
  type ReplyLanguage,
  type SessionLanguagePolicyChangedEvent,
} from '#/session/languagePolicy/languagePolicy';

const INJECTION_CONTEXT = {
  injectedPositions: [],
  lastInjectedAt: null,
  isNewTurn: true,
} as const;

interface InjectionRegistration {
  readonly name: string;
  readonly provider: ContextInjectionProvider;
}

class LanguagePolicyFixture implements SessionLanguagePolicy {
  declare readonly _serviceBrand: undefined;
  readonly ready = Promise.resolve();

  private readonly emitter = new AsyncEmitter<SessionLanguagePolicyChangedEvent>();
  readonly onDidChange = this.emitter.event;

  constructor(private language: ReplyLanguage | undefined) {}

  replyLanguage(): ReplyLanguage | undefined {
    return this.language;
  }

  async observeUserPrompt(): Promise<void> {}

  async setReplyLanguage(language: ReplyLanguage | undefined): Promise<void> {
    this.language = language;
    await this.emitter.fireAsync({}, new AbortController().signal);
  }
}

function createAgentLanguageInjection(
  disposables: DisposableStore,
  policy: SessionLanguagePolicy,
): InjectionRegistration {
  let registration: InjectionRegistration | undefined;
  const injector: IAgentContextInjectorService = {
    _serviceBrand: undefined,
    register: (name, provider) => {
      registration = { name, provider };
      return { dispose: () => {} };
    },
    injectAfterCompaction: async () => {},
  };
  const ix = disposables.add(new TestInstantiationService());
  ix.stub(ISessionLanguagePolicy, policy);
  ix.stub(IAgentContextInjectorService, injector);
  ix.set(IAgentStateService, new AgentStateService());
  ix.set(
    IAgentLanguagePolicyInjectionService,
    new SyncDescriptor(AgentLanguagePolicyInjectionService),
  );
  ix.get(IAgentLanguagePolicyInjectionService);
  if (registration === undefined) throw new Error('expected language-policy injection registration');
  return registration;
}

async function run(
  registration: InjectionRegistration,
  injectedPositions: readonly number[] = [],
): Promise<string | undefined> {
  const content = await registration.provider({
    ...INJECTION_CONTEXT,
    injectedPositions,
    lastInjectedAt: injectedPositions.at(-1) ?? null,
  });
  if (typeof content !== 'string' && content !== undefined) {
    throw new Error('expected language-policy injection to return text');
  }
  return content;
}

describe('AgentLanguagePolicyInjectionService', () => {
  let disposables: DisposableStore;

  beforeEach(() => {
    disposables = new DisposableStore();
  });

  afterEach(() => {
    disposables.dispose();
  });

  it('injects the shared session policy into main and child Agent contexts', async () => {
    const policy = new LanguagePolicyFixture('Japanese');
    const main = createAgentLanguageInjection(disposables, policy);
    const child = createAgentLanguageInjection(disposables, policy);

    expect(main.name).toBe('language_policy');
    expect(child.name).toBe('language_policy');
    await expect(run(main)).resolves.toContain('Session user-facing language: Japanese.');
    await expect(run(child)).resolves.toContain('Session user-facing language: Japanese.');
  });

  it('refreshes only after a policy change or when compaction removed the reminder', async () => {
    const policy = new LanguagePolicyFixture('English');
    const registration = createAgentLanguageInjection(disposables, policy);

    await expect(run(registration)).resolves.toContain('English');
    await expect(run(registration, [0])).resolves.toBeUndefined();

    await policy.setReplyLanguage('Korean');
    await expect(run(registration, [0])).resolves.toContain('Korean');
    await expect(run(registration, [0, 1])).resolves.toBeUndefined();

    await expect(run(registration)).resolves.toContain('Korean');
  });

  it('does not inject without a detected policy and keeps repository artifacts distinct', async () => {
    const policy = new LanguagePolicyFixture(undefined);
    const registration = createAgentLanguageInjection(disposables, policy);

    await expect(run(registration)).resolves.toBeUndefined();

    await policy.setReplyLanguage('Japanese');
    const reminder = await run(registration);
    expect(reminder).toContain('all interaction content sent to the user');
    expect(reminder).toContain('including child-agent results');
    expect(reminder).toContain('Repository artifacts follow the project’s existing conventions');
  });
});
