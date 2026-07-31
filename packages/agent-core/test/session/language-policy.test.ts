import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SDKSessionRPC } from '../../src/rpc';
import { Session } from '../../src/session';
import { detectReplyLanguage } from '../../src/session/language-policy';
import { SessionStore } from '../../src/session/store';
import { testKaos } from '../fixtures/test-kaos';

const tempDirs: string[] = [];
const sessions: Session[] = [];

function text(value: string) {
  return [{ type: 'text' as const, text: value }];
}

function createSession(sessionDir: string, id: string): Session {
  const session = new Session({
    id,
    kaos: testKaos.withCwd(sessionDir),
    homedir: sessionDir,
    rpc: {
      emitEvent: vi.fn(async () => {}),
      requestApproval: vi.fn(async () => ({ decision: 'cancelled' })),
      requestQuestion: vi.fn(async () => null),
      toolCall: vi.fn(async () => ({ output: '', isError: true })),
    } as unknown as SDKSessionRPC,
    skills: { explicitDirs: [join(sessionDir, 'missing-skills')] },
  });
  sessions.push(session);
  return session;
}

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'kimi-language-policy-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.allSettled(sessions.splice(0).map((session) => session.close()));
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('legacy session reply-language policy', () => {
  it('uses the V2-conservative CJK and franc detector behavior', () => {
    expect(detectReplyLanguage(text('この変更を実装してテストを追加してください。'))).toBe('Japanese');
    expect(detectReplyLanguage(text('이 변경을 구현하고 테스트를 추가해 주세요.'))).toBe('Korean');
    expect(detectReplyLanguage(text('请实现这个修改，并添加相关测试。'))).toBe('Chinese');
    expect(detectReplyLanguage(text('Please implement this change and add focused tests for the prompt service.'))).toBe('English');
    expect(detectReplyLanguage(text('Veuillez implémenter cette modification et ajouter des tests ciblés au service de prompt.'))).toBe('French');

    expect(detectReplyLanguage(text('fix it'))).toBeUndefined();
    expect(detectReplyLanguage(text('const prompt = await service.enqueue(input);'))).toBeUndefined();
    expect(detectReplyLanguage(text('请 fix the prompt service'))).toBeUndefined();
    expect(detectReplyLanguage([{ type: 'image_url', imageUrl: { url: 'data:image/png;base64,AA==' } }])).toBeUndefined();
  });

  it('persists only replyLanguage in root state, restores it, and carries it into a fork', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);
    const source = await store.create({ id: 'language-source', workDir });
    const sourceSession = createSession(source.sessionDir, 'language-source');
    const prompt = 'Please implement this change and add focused tests for the prompt service.';

    await sourceSession.replyLanguagePolicy.observeUserPrompt(text(prompt));
    const sourceState = JSON.parse(await readFile(join(source.sessionDir, 'state.json'), 'utf8')) as Record<string, unknown>;
    expect(sourceState['replyLanguage']).toBe('English');
    expect(JSON.stringify(sourceState)).not.toContain(prompt);

    const fork = await store.fork({ sourceId: 'language-source', targetId: 'language-fork' });
    const forkedState = JSON.parse(await readFile(join(fork.sessionDir, 'state.json'), 'utf8')) as Record<string, unknown>;
    expect(forkedState['replyLanguage']).toBe('English');

    const resumed = createSession(fork.sessionDir, 'language-fork');
    await resumed.readMetadata();
    expect(resumed.replyLanguagePolicy.replyLanguage()).toBe('English');
  });
});
