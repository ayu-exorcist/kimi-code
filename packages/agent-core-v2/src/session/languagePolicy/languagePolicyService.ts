/**
 * `languagePolicy` domain (L3) — persisted session reply-language policy.
 *
 * Stores one conservative, high-confidence reply language for user-visible
 * interaction. State is plain data registered in `sessionState`, persisted as
 * one atomic document, and shared by all Agents in the Session.
 */

import { franc } from 'franc-min';

import { Disposable } from '#/_base/di/lifecycle';
import { LifecycleScope, ScopeActivation, registerScopedService } from '#/_base/di/scope';
import { AsyncEmitter, type Event } from '#/_base/event';
import { defineState } from '#/_base/state/stateRegistry';
import type { ContentPart } from '#/kosong/contract/message';
import { IAtomicDocumentStore } from '#/persistence/interface/atomicDocumentStore';
import { ISessionContext } from '#/session/sessionContext/sessionContext';
import { ISessionStateService } from '#/session/state/sessionState';

import {
  ISessionLanguagePolicy,
  type ReplyLanguage,
  type SessionLanguagePolicyChangedEvent,
} from './languagePolicy';

interface SessionLanguagePolicyState {
  readonly replyLanguage: ReplyLanguage | undefined;
}

export const sessionLanguagePolicyStateKey = defineState<SessionLanguagePolicyState>(
  'sessionLanguagePolicy.state',
  () => ({ replyLanguage: undefined }),
);

const STATE_KEY = 'state.json';
const FRANC_LANGUAGE_NAMES = new Map<string, ReplyLanguage>([
  ['ara', 'Arabic'], ['arb', 'Arabic'], ['ben', 'Bengali'], ['dan', 'Danish'], ['deu', 'German'],
  ['ell', 'Greek'], ['eng', 'English'], ['fas', 'Persian'], ['fin', 'Finnish'],
  ['fra', 'French'], ['heb', 'Hebrew'], ['hin', 'Hindi'], ['ind', 'Indonesian'],
  ['ita', 'Italian'], ['jpn', 'Japanese'], ['kor', 'Korean'], ['nld', 'Dutch'],
  ['nor', 'Norwegian'], ['pol', 'Polish'], ['por', 'Portuguese'], ['rus', 'Russian'],
  ['spa', 'Spanish'], ['swe', 'Swedish'], ['tha', 'Thai'], ['tur', 'Turkish'],
  ['ukr', 'Ukrainian'], ['vie', 'Vietnamese'], ['zho', 'Chinese'],
]);

export class SessionLanguagePolicyService extends Disposable implements ISessionLanguagePolicy {
  declare readonly _serviceBrand: undefined;
  readonly ready: Promise<void>;
  readonly onDidChange: Event<SessionLanguagePolicyChangedEvent>;

  private readonly changeEmitter = this._register(
    new AsyncEmitter<SessionLanguagePolicyChangedEvent>(),
  );
  private readonly scope: string;
  private updateQueue: Promise<void> = Promise.resolve();

  constructor(
    @ISessionStateService private readonly states: ISessionStateService,
    @ISessionContext sessionContext: ISessionContext,
    @IAtomicDocumentStore private readonly store: IAtomicDocumentStore,
  ) {
    super();
    this.states.register(sessionLanguagePolicyStateKey);
    this.scope = sessionContext.scope('language-policy');
    this.onDidChange = this.changeEmitter.event;
    this.ready = this.load();
  }

  private get state(): SessionLanguagePolicyState {
    return this.states.get(sessionLanguagePolicyStateKey);
  }

  private set state(value: SessionLanguagePolicyState) {
    this.states.set(sessionLanguagePolicyStateKey, value);
  }

  replyLanguage(): ReplyLanguage | undefined {
    return this.state.replyLanguage;
  }

  observeUserPrompt(content: readonly ContentPart[]): Promise<void> {
    const detected = detectReplyLanguage(content);
    if (detected === undefined) return this.ready.then(() => this.updateQueue);
    const run = this.updateQueue.then(() => this.replace(detected));
    this.updateQueue = run.catch(() => {});
    return run;
  }

  private async load(): Promise<void> {
    const stored = await this.store.get<SessionLanguagePolicyState>(this.scope, STATE_KEY);
    if (isSessionLanguagePolicyState(stored)) this.state = stored;
  }

  private async replace(replyLanguage: ReplyLanguage): Promise<void> {
    await this.ready;
    if (replyLanguage === this.state.replyLanguage) return;
    const nextState = { replyLanguage };
    await this.store.set(this.scope, STATE_KEY, nextState);
    this.state = nextState;
    await this.changeEmitter.fireAsync({}, new AbortController().signal);
  }
}

/**
 * Identifies natural-language prose conservatively. CJK scripts have strong
 * direct signals; other supported languages are identified offline by franc.
 * Short, code-heavy, and mixed-script text deliberately preserves the current
 * policy rather than guessing from an Agent task or source snippet.
 */
export function detectReplyLanguage(content: readonly ContentPart[]): ReplyLanguage | undefined {
  const text = content
    .filter((part): part is Extract<ContentPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
  const letters = count(text, /\p{L}/gu);
  if (letters < 12 || isCodeHeavy(text)) return undefined;

  const han = count(text, /\p{Script=Han}/gu);
  const hiragana = count(text, /\p{Script=Hiragana}/gu);
  const katakana = count(text, /\p{Script=Katakana}/gu);
  const hangul = count(text, /\p{Script=Hangul}/gu);
  const kana = hiragana + katakana;

  if (kana >= 3 && (kana + han) / letters >= 0.75) return 'Japanese';
  if (hangul >= 3 && hangul / letters >= 0.75) return 'Korean';
  if (han >= 4 && han / letters >= 0.75) return 'Chinese';
  if (han + kana + hangul > 0) return undefined;

  const detected = franc(text, {
    minLength: 20,
    only: [...FRANC_LANGUAGE_NAMES.keys()],
  });
  return FRANC_LANGUAGE_NAMES.get(detected);
}

function isCodeHeavy(text: string): boolean {
  const nonWhitespace = text.replace(/\s/gu, '').length;
  if (nonWhitespace === 0) return true;
  const syntax = count(text, /[{}[\];=<>`]/gu);
  const codeKeywords = count(text, /\b(?:async|await|class|const|function|import|let|return|var)\b/giu);
  return (syntax + codeKeywords * 3) / nonWhitespace >= 0.08;
}

function count(text: string, pattern: RegExp): number {
  return Array.from(text.matchAll(pattern)).length;
}

function isSessionLanguagePolicyState(value: unknown): value is SessionLanguagePolicyState {
  if (typeof value !== 'object' || value === null || !('replyLanguage' in value)) return false;
  const replyLanguage = value.replyLanguage;
  return replyLanguage === undefined
    || (typeof replyLanguage === 'string' && replyLanguage.trim().length > 0);
}

registerScopedService(
  LifecycleScope.Session,
  ISessionLanguagePolicy,
  SessionLanguagePolicyService,
  ScopeActivation.OnScopeCreated,
  'languagePolicy',
);
