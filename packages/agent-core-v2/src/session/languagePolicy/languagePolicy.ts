/**
 * `languagePolicy` domain (L3) — session-wide user-facing reply language.
 *
 * The policy is learned only from authentic user prompt content, is persisted
 * independently of an Agent, and is shared by every Agent in the Session.
 */

import { createDecorator, type ServiceIdentifier } from '#/_base/di/instantiation';
import type { Event, IWaitUntil } from '#/_base/event';
import type { ContentPart } from '#/kosong/contract/message';

/** A concrete user-facing language name, retained as plain session data. */
export type ReplyLanguage = string;

export type SessionLanguagePolicyChangedEvent = IWaitUntil;

export interface ISessionLanguagePolicy {
  readonly _serviceBrand: undefined;
  readonly ready: Promise<void>;
  readonly onDidChange: Event<SessionLanguagePolicyChangedEvent>;

  replyLanguage(): ReplyLanguage | undefined;
  observeUserPrompt(content: readonly ContentPart[]): Promise<void>;
}

export const ISessionLanguagePolicy: ServiceIdentifier<ISessionLanguagePolicy> =
  createDecorator<ISessionLanguagePolicy>('sessionLanguagePolicy');
