/**
 * `languagePolicy` domain (L4) — Agent-side injection contract and session-policy seam.
 *
 * Supplies each Agent with the session's current reply language through
 * `ISessionLanguagePolicy`, then injects that policy into its context through
 * `IAgentContextInjectorService`. The session-policy domain owns detection and
 * persistence; this Agent-scoped service owns only the per-context reminder.
 */

import { createDecorator } from '#/_base/di/instantiation';

export interface IAgentLanguagePolicyInjectionService {
  readonly _serviceBrand: undefined;
}

export const IAgentLanguagePolicyInjectionService =
  createDecorator<IAgentLanguagePolicyInjectionService>('agentLanguagePolicyInjectionService');
