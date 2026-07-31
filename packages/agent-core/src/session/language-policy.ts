import type { ContentPart } from '@moonshot-ai/kosong';
import { franc } from 'franc-min';

/** A concrete user-facing language name retained as plain session state. */
export type ReplyLanguage = string;

export interface SessionReplyLanguagePolicyOptions {
  readonly replyLanguage?: ReplyLanguage;
  /** Persists only the detected language; never receives source prompt content. */
  readonly onDidChange: (replyLanguage: ReplyLanguage) => Promise<void>;
}

const FRANC_LANGUAGE_NAMES = new Map<string, ReplyLanguage>([
  ['ara', 'Arabic'], ['arb', 'Arabic'], ['ben', 'Bengali'], ['dan', 'Danish'], ['deu', 'German'],
  ['ell', 'Greek'], ['eng', 'English'], ['fas', 'Persian'], ['fin', 'Finnish'],
  ['fra', 'French'], ['heb', 'Hebrew'], ['hin', 'Hindi'], ['ind', 'Indonesian'],
  ['ita', 'Italian'], ['jpn', 'Japanese'], ['kor', 'Korean'], ['nld', 'Dutch'],
  ['nor', 'Norwegian'], ['pol', 'Polish'], ['por', 'Portuguese'], ['rus', 'Russian'],
  ['spa', 'Spanish'], ['swe', 'Swedish'], ['tha', 'Thai'], ['tur', 'Turkish'],
  ['ukr', 'Ukrainian'], ['vie', 'Vietnamese'], ['zho', 'Chinese'],
]);

/**
 * A Session-owned language choice shared by every Agent in that Session.
 * Observation is intentionally opt-in at the external RPC boundary; callers
 * never retain the source prompt after detection.
 */
export class SessionReplyLanguagePolicy {
  private language: ReplyLanguage | undefined;
  private updateQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: SessionReplyLanguagePolicyOptions) {
    this.language = options.replyLanguage;
  }

  replyLanguage(): ReplyLanguage | undefined {
    return this.language;
  }

  restore(replyLanguage: unknown): void {
    this.language = isReplyLanguage(replyLanguage) ? replyLanguage : undefined;
  }

  observeUserPrompt(content: readonly ContentPart[]): Promise<void> {
    const detected = detectReplyLanguage(content);
    if (detected === undefined) return this.updateQueue;
    const update = this.updateQueue.then(async () => {
      if (detected === this.language) return;
      await this.options.onDidChange(detected);
      this.language = detected;
    });
    this.updateQueue = update.catch(() => {});
    return update;
  }
}

/**
 * Identifies natural-language prose conservatively. CJK scripts have strong
 * direct signals; other supported languages are identified offline by franc.
 * Short, code-heavy, and mixed-script text deliberately preserve the current
 * policy rather than guessing from task text or source snippets.
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

function isReplyLanguage(value: unknown): value is ReplyLanguage {
  return typeof value === 'string' && value.trim().length > 0;
}
