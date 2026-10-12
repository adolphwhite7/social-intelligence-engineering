/**
 * SIT Intelligence Layer — Main Pipeline
 *
 * Orchestrates the three enforcement components:
 * 1. Crisis Detector (pre-classification fast path)
 * 2. BRE Enforcement (faith-context constraint injection)
 * 3. Output Validator (post-generation filter — syntactic violations)
 * 4. Exit Interview Validator (post-generation — semantic violations)
 *
 * Flow:
 * User Message → Crisis Detector → (if crisis: short-circuit to resources)
 *                                → (if not crisis: BRE check → build prompt → LLM
 *                                   → Output Validator → Exit Interview → response)
 *
 * postProcess() is async due to the Exit Interview Validator (Layer 3 Haiku call).
 * Set EXPO_PUBLIC_FEATURE_EXIT_INTERVIEW=true to enable Layer 3.
 */

import { detectCrisis, generateCrisisResponse } from './crisisDetector.js';
import { detectFaithContext } from './breEnforcement.js';
import { validateOutput } from './outputValidator.js';
import { runExitInterview, routeRemediation } from './exitInterviewValidator.js';
import { detectInjectionNeeds, appendResources } from './resourceRegistry.js';

/**
 * Process a user message through the full intelligence pipeline.
 *
 * @param {string} userMessage - The current user message
 * @param {string[]} conversationHistory - Previous user messages (for coercion accumulation)
 * @param {object} [options] - Pipeline options
 * @param {boolean} [options.autoSanitize=true] - Auto-fix output violations
 * @returns {{ action: 'crisis_redirect'|'normal_response', crisisDetection: object|null, faithContext: object|null, outputValidation: object|null, constraintPrompt: string, resourceKeys: string[] }}
 */
export function preProcess(userMessage, conversationHistory = [], options = {}) {
  const { autoSanitize = true } = options;

  // Step 1: Crisis Detection (fast path)
  const crisisDetection = detectCrisis(userMessage, conversationHistory);

  if (crisisDetection.isCrisis) {
    return {
      action: 'crisis_redirect',
      crisisDetection,
      crisisResponse: generateCrisisResponse(crisisDetection),
      faithContext: null,
      outputValidation: null,
      constraintPrompt: '',
      resourceKeys: [],
    };
  }

  // Step 2: BRE Faith Context Detection
  const faithContext = detectFaithContext(userMessage);

  // Step 3: Resource Injection Detection (non-crisis scenarios that still need resources)
  // Lower threshold than crisis — fires on potential_conflict / legal_medical_boundary topics
  // even when isCrisis is false. Resources are appended after Layer 3 in postProcess().
  const resourceKeys = detectInjectionNeeds(userMessage, conversationHistory.slice(-3));

  return {
    action: 'normal_response',
    crisisDetection,
    crisisResponse: null,
    faithContext,
    outputValidation: null,
    constraintPrompt: faithContext.constraintPrompt || '',
    resourceKeys,
  };
}

/**
 * Validate and optionally sanitize an AI response before delivery.
 *
 * Layer 2 (OutputValidator) always runs synchronously first.
 * Layer 3 (ExitInterviewValidator) runs async when EXIT_INTERVIEW_ENABLED=true.
 * Layer 3 is skipped on crisis paths (Layer 1 already handled those).
 *
 * @param {string} responseText - The AI's response (coaching text, no metadata)
 * @param {object} preProcessResult - Result from preProcess() — carries faithContext for BRE threading
 * @param {object} [options] - Validation options
 * @param {boolean} [options.autoSanitize=true] - Layer 2: attempt to fix syntactic violations
 * @param {string[]} [options.recentHistory=[]] - Last 3 user messages for exit interview context
 * @returns {Promise<{ isClean: boolean, violations: object[], finalText: string, layer3Action: string|null, layer3Result: object|null }>}
 */
export async function postProcess(responseText, preProcessResult, options = {}) {
  const { autoSanitize = true, recentHistory = [] } = options;

  const isCrisis = preProcessResult.action === 'crisis_redirect' ||
    preProcessResult.crisisDetection?.isCrisis;

  // ── Layer 2: Output Validator (syntactic violations, always runs) ──────
  const validation = validateOutput(responseText, {
    isCrisis,
    autoSanitize,
  });

  let currentText = validation.sanitizedText || responseText;

  // ── Layer 3: Exit Interview Validator (semantic violations, async) ─────
  const exitInterviewEnabled =
    typeof process !== 'undefined'
      ? process.env.EXPO_PUBLIC_FEATURE_EXIT_INTERVIEW === 'true'
      : false;

  if (!exitInterviewEnabled || isCrisis) {
    // Still apply resource injection even when Layer 3 is disabled.
    const resourceKeys = preProcessResult?.resourceKeys ?? [];
    const finalText = appendResources(currentText, resourceKeys);
    return {
      isClean: validation.isClean,
      violations: validation.violations,
      finalText,
      layer3Action: null,
      layer3Result: null,
      resourcesInjected: resourceKeys,
    };
  }

  const scanResult = await runExitInterview(currentText, preProcessResult, recentHistory);
  const remediation = await routeRemediation(scanResult, currentText);

  // ── Resource Injection (deterministic, runs after Layer 3) ───────────────
  // Resources detected in preProcess() are appended here, after all LLM-based
  // validation is complete. This ensures they are never scanned by the exit
  // interview validator and are always delivered regardless of LLM behavior.
  const resourceKeys = preProcessResult?.resourceKeys ?? [];
  const finalText = appendResources(remediation.finalText, resourceKeys);

  return {
    isClean: validation.isClean && remediation.action === 'pass',
    violations: validation.violations,
    finalText,
    layer3Action: remediation.action,
    layer3Result: remediation.scanResult,
    resourcesInjected: resourceKeys,
  };
}

// Re-export components for direct access
export { detectCrisis, generateCrisisResponse } from './crisisDetector.js';
export { detectFaithContext, getDomainStats } from './breEnforcement.js';
export { validateOutput, isClean } from './outputValidator.js';
export { runExitInterview, routeRemediation, buildRegenerationConstraint } from './exitInterviewValidator.js';
export { detectInjectionNeeds, appendResources, formatResourceBlock } from './resourceRegistry.js';
