import type { Agent } from '..';
import type { ReplyLanguage, SessionReplyLanguagePolicy } from '../../session/language-policy';

import { DynamicInjector } from './injector';

const LANGUAGE_POLICY_INJECTION_VARIANT = 'language_policy';

/** Keeps each Agent context aligned with the Session's shared reply language. */
export class LanguagePolicyInjector extends DynamicInjector {
  protected override readonly injectionVariant = LANGUAGE_POLICY_INJECTION_VARIANT;
  private lastInjectedLanguage: ReplyLanguage | undefined;

  constructor(
    agent: Agent,
    private readonly policy: SessionReplyLanguagePolicy,
  ) {
    super(agent);
  }

  protected override getInjection(): string | undefined {
    const language = this.policy.replyLanguage();
    if (language === undefined) return undefined;

    this.restoreReplayedInjection(language);
    if (this.lastInjectedLanguage === language && this.injectedAt !== null) return undefined;

    this.lastInjectedLanguage = language;
    return languagePolicyReminder(language);
  }

  private restoreReplayedInjection(language: ReplyLanguage): void {
    if (this.injectedAt !== null) return;
    const replayedAt = this.agent.context.history.findLastIndex((message) => {
      if (
        message.origin?.kind !== 'injection' ||
        message.origin.variant !== LANGUAGE_POLICY_INJECTION_VARIANT
      ) {
        return false;
      }
      return message.content.some(
        (part) =>
          part.type === 'text' && part.text.includes(`Session user-facing language: ${language}.`),
      );
    });
    if (replayedAt >= 0) {
      this.injectedAt = replayedAt;
      this.lastInjectedLanguage = language;
    }
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
