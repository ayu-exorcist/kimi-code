/**
 * Scenario: persistent, conservative session reply-language policy.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ContentPart } from '#/kosong/contract/message';
import { JsonAtomicDocumentStore } from '#/persistence/backends/node-fs/atomicDocumentStore';
import { InMemoryStorageService } from '#/persistence/backends/memory/inMemoryStorageService';
import { ISessionContext, makeSessionContext } from '#/session/sessionContext/sessionContext';
import { SessionLanguagePolicyService, detectReplyLanguage } from '#/session/languagePolicy/languagePolicyService';
import { SessionStateService } from '#/session/state/sessionStateService';

const scope = 'sessions/wd_test/s1/language-policy';

function text(value: string): readonly ContentPart[] {
  return [{ type: 'text', text: value }];
}

function context(): ISessionContext {
  return makeSessionContext({
    sessionId: 's1',
    workspaceId: 'wd_test',
    sessionDir: '/tmp/sessions/wd_test/s1',
    sessionScope: 'sessions/wd_test/s1',
    cwd: '/tmp/sessions/wd_test/s1',
  });
}

function createPolicy(store = new JsonAtomicDocumentStore(new InMemoryStorageService())) {
  const states = new SessionStateService();
  const policy = new SessionLanguagePolicyService(states, context(), store);
  afterEach(() => {
    policy.dispose();
    states.dispose();
  });
  return { policy, store };
}

describe('SessionLanguagePolicyService', () => {
  it('detects only high-confidence CJK and English user-facing language signals', () => {
    expect(detectReplyLanguage(text('この変更を実装してテストを追加してください。'))).toBe('Japanese');
    expect(detectReplyLanguage(text('이 변경을 구현하고 테스트를 추가해 주세요.'))).toBe('Korean');
    expect(detectReplyLanguage(text('请实现这个修改，并添加相关测试。'))).toBe('Chinese');
    expect(detectReplyLanguage(text('Please implement this change and add focused tests for the prompt service.'))).toBe('English');
    expect(detectReplyLanguage(text('Veuillez implémenter cette modification et ajouter des tests ciblés au service de prompt.'))).toBe('French');
    expect(detectReplyLanguage(text('يرجى تنفيذ هذا التغيير وإضافة اختبارات مركزة لخدمة الطلبات.'))).toBe('Arabic');
  });

  it('keeps the existing policy for ambiguous, code-heavy, and mixed-script input', async () => {
    const { policy } = createPolicy();
    await policy.ready;
    await policy.observeUserPrompt(text('请实现这个修改，并添加相关测试。'));

    await policy.observeUserPrompt(text('fix it'));
    await policy.observeUserPrompt(text('const prompt = await service.enqueue(input);'));
    await policy.observeUserPrompt(text('请 fix the prompt service'));
    await policy.observeUserPrompt([{ type: 'image_url', imageUrl: { url: 'data:image/png;base64,AA==' } }]);

    expect(policy.replyLanguage()).toBe('Chinese');
  });

  it('persists replacements atomically, emits only for changes, and reloads on resume', async () => {
    const storage = new InMemoryStorageService();
    const store = new JsonAtomicDocumentStore(storage);
    const { policy } = createPolicy(store);
    await policy.ready;
    const changed = vi.fn();
    policy.onDidChange(changed);

    await policy.observeUserPrompt(text('Please implement this change and add focused tests for the prompt service.'));
    await policy.observeUserPrompt(text('Please implement this change and add focused tests for the prompt service.'));

    expect(policy.replyLanguage()).toBe('English');
    expect(changed).toHaveBeenCalledTimes(1);
    await expect(store.get(scope, 'state.json')).resolves.toEqual({ replyLanguage: 'English' });

    const resumedStates = new SessionStateService();
    const resumed = new SessionLanguagePolicyService(resumedStates, context(), store);
    await resumed.ready;
    expect(resumed.replyLanguage()).toBe('English');
    resumed.dispose();
    resumedStates.dispose();
  });
});
