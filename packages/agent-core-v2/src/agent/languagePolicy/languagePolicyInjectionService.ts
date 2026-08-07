/**
 * `languagePolicy` domain (L4) — Agent-scoped user-facing language reminder.
 *
 * Reads the session's shared reply-language policy, registers a reminder through
 * `contextInjector`, and retains the last injected value in `agentState` so
 * active main and child Agent contexts refresh only when the policy changes or
 * compaction removes their reminder. Bound at Agent scope.
 */

import { Disposable } from '#/_base/di/lifecycle';
import { ScopeActivation, registerScopedService } from '#/_base/di/scope';
import { defineState } from '#/_base/state/stateRegistry';
import { LifecycleScope } from '#/app/scopes';
import { IAgentContextInjectorService } from '#/agent/contextInjector/contextInjector';
import { IAgentStateService } from '#/agent/state/agentState';
import {
  ISessionLanguagePolicy,
  type ReplyLanguage,
} from '#/session/languagePolicy/languagePolicy';
import { IAgentLanguagePolicyInjectionService } from './languagePolicy';

const LANGUAGE_POLICY_INJECTION_VARIANT = 'language_policy';

export const languagePolicyLastInjectedLanguageKey = defineState<ReplyLanguage | undefined>(
  'languagePolicy.lastInjectedLanguage',
  () => undefined,
);

export class AgentLanguagePolicyInjectionService
  extends Disposable
  implements IAgentLanguagePolicyInjectionService
{
  declare readonly _serviceBrand: undefined;

  private policyChanged = false;

  constructor(
    @ISessionLanguagePolicy private readonly policy: ISessionLanguagePolicy,
    @IAgentContextInjectorService dynamicInjector: IAgentContextInjectorService,
    @IAgentStateService private readonly states: IAgentStateService,
  ) {
    super();
    this.states.register(languagePolicyLastInjectedLanguageKey);
    this._register(
      this.policy.onDidChange(() => {
        this.policyChanged = this.policy.replyLanguage() !== this.lastInjectedLanguage;
      }),
    );
    this._register(
      dynamicInjector.register(LANGUAGE_POLICY_INJECTION_VARIANT, async (context) => {
        await this.policy.ready;
        return this.reminder(context.injectedPositions.length);
      }),
    );
  }

  private get lastInjectedLanguage(): ReplyLanguage | undefined {
    return this.states.get(languagePolicyLastInjectedLanguageKey);
  }

  private set lastInjectedLanguage(value: ReplyLanguage | undefined) {
    this.states.set(languagePolicyLastInjectedLanguageKey, value);
  }

  private reminder(liveReminderCount: number): string | undefined {
    const language = this.policy.replyLanguage();
    if (language === undefined) {
      this.lastInjectedLanguage = undefined;
      this.policyChanged = false;
      return undefined;
    }
    if (
      !this.policyChanged &&
      this.lastInjectedLanguage === language &&
      liveReminderCount > 0
    ) {
      return undefined;
    }
    this.lastInjectedLanguage = language;
    this.policyChanged = false;
    return languagePolicyReminder(language);
  }
}

export function languagePolicyReminder(language: ReplyLanguage): string {
  return [
    `Session user-facing language: ${language}.`,
    'Use it for all interaction content sent to the user, including progress updates, questions, and final responses.',
    'Apply this in every Agent context, including child-agent results that are shown to the user.',
    'Repository artifacts follow the project’s existing conventions and are not translated solely for this policy.',
  ].join(' ');
}

registerScopedService(
  LifecycleScope.Agent,
  IAgentLanguagePolicyInjectionService,
  AgentLanguagePolicyInjectionService,
  ScopeActivation.OnScopeCreated,
  'languagePolicy',
);
