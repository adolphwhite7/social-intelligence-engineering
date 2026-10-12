/**
 * SIT Intelligence Client
 *
 * Client-side wrapper for the IntelligenceService Supabase Edge Function.
 * Handles the full coaching request pipeline:
 *
 *   1. preProcess() — Layer 1 (crisis detect, BRE, resource key detection) — runs client-side
 *   2. If crisis: return crisis response immediately, no server call
 *   3. Call Edge Function — sends preProcessResult, gets L2+L3-validated coaching response
 *   4. Handle REGENERATE: build constraint, retry Edge Function with Sonnet
 *   5. appendResources() — inject hardcoded crisis resources (deterministic, client-side)
 *   6. Return final text to caller
 *
 * The API key never touches the device. All LLM calls happen in the Edge Function.
 *
 */

import { preProcess } from '../intelligence/index.js';
import { appendResources } from '../intelligence/resourceRegistry.js';
import { buildRegenerationConstraint } from '../intelligence/exitInterviewValidator.js';

// ── Configuration ─────────────────────────────────────────────────────────

/**
 * Supabase Edge Function URL.
 * Set via environment variable — never hardcode.
 *
 * In Expo: process.env.EXPO_PUBLIC_SUPABASE_URL
 * Edge Function path: /functions/v1/intelligence-service
 */
function getEdgeFunctionUrl() {
  const supabaseUrl =
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SUPABASE_URL) ||
    '';

  if (!supabaseUrl) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL is not set');
  }

  return `${supabaseUrl}/functions/v1/intelligence-service`;
}

/**
 * Supabase anon key for Edge Function auth.
 * Safe to expose client-side (row-level security enforced on Supabase).
 */
function getAnonKey() {
  return (
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY) ||
    ''
  );
}

// ── Main Public API ───────────────────────────────────────────────────────

/**
 * Generate a coaching response for the given user message.
 *
 * @param {object} params
 * @param {string} params.userMessage - The user's current message
 * @param {string[]} [params.conversationHistory=[]] - Previous user messages (for Layer 1 coercion accumulation)
 * @param {object} [params.behavioralProfile=null] - BIMS TPIP data for the person being discussed
 * @param {string} [params.mode='default'] - Coaching mode: 'quick_guidance' | 'pre_conversation' | 'post_conversation' | 'default'
 * @param {string} [params.scenarioRiskLevel='normal'] - Risk level hint: 'normal' | 'elevated' | 'red'
 * @param {object} [params.authSession=null] - Supabase auth session for JWT (null = anon)
 * @returns {Promise<CoachingResult>}
 */
export async function generateCoachingResponse({
  userMessage,
  conversationHistory = [],
  behavioralProfile = null,
  mode = 'default',
  scenarioRiskLevel = 'normal',
  authSession = null,
}) {
  // ── Step 1: Layer 1 — preProcess (client-side, sync) ─────────────────

  const preProcessResult = preProcess(userMessage, conversationHistory);

  // ── Step 2: Crisis short-circuit (no server call needed) ─────────────

  if (preProcessResult.action === 'crisis_redirect') {
    return {
      text: preProcessResult.crisisResponse,
      isCrisis: true,
      layer2Violations: [],
      layer3Action: null,
      layer3Result: null,
      modelUsed: null,
      resourcesInjected: [],
      isRegenerated: false,
    };
  }

  // ── Step 3: Call Edge Function (primary LLM + L2 + L3) ───────────────

  let edgeResult;
  try {
    edgeResult = await callEdgeFunction({
      userMessage,
      conversationHistory,
      preProcessResult,
      behavioralProfile,
      mode,
      scenarioRiskLevel,
      regenerationConstraint: null,
      authSession,
    });
  } catch (err) {
    throw new Error(`IntelligenceService call failed: ${err?.message ?? err}`);
  }

  // ── Step 4: Handle REGENERATE verdict (single retry with Sonnet) ──────

  if (edgeResult.requiresRegeneration && edgeResult.layer3Result) {
    const constraint = buildRegenerationConstraint(edgeResult.layer3Result);

    let regeneratedResult;
    try {
      regeneratedResult = await callEdgeFunction({
        userMessage,
        conversationHistory,
        preProcessResult,
        behavioralProfile,
        mode,
        scenarioRiskLevel: 'red', // Forces Sonnet for regeneration
        regenerationConstraint: constraint,
        authSession,
      });
    } catch {
      // Regeneration failed — deliver original (better than nothing)
      regeneratedResult = edgeResult;
    }

    edgeResult = regeneratedResult;
  }

  // ── Step 5: Resource injection (client-side, deterministic) ──────────

  const resourceKeys = preProcessResult.resourceKeys ?? [];
  const finalText = appendResources(edgeResult.text, resourceKeys);

  // ── Step 6: Return ────────────────────────────────────────────────────

  return {
    text: finalText,
    isCrisis: false,
    layer2Violations: edgeResult.layer2Violations ?? [],
    layer3Action: edgeResult.layer3Action ?? null,
    layer3Result: edgeResult.layer3Result ?? null,
    modelUsed: edgeResult.modelUsed ?? null,
    resourcesInjected: resourceKeys,
    isRegenerated: edgeResult.isRegenerated ?? false,
  };
}

// ── Internal Helpers ──────────────────────────────────────────────────────

/**
 * HTTP call to the Supabase Edge Function.
 * @private
 */
async function callEdgeFunction({
  userMessage,
  conversationHistory,
  preProcessResult,
  behavioralProfile,
  mode,
  scenarioRiskLevel,
  regenerationConstraint,
  authSession,
}) {
  const url = getEdgeFunctionUrl();
  const anonKey = getAnonKey();

  const headers = {
    'Content-Type': 'application/json',
    'apikey': anonKey,
  };

  if (authSession?.access_token) {
    headers['Authorization'] = `Bearer ${authSession.access_token}`;
  } else if (anonKey) {
    headers['Authorization'] = `Bearer ${anonKey}`;
  }

  const body = JSON.stringify({
    userMessage,
    conversationHistory,
    preProcessResult: {
      faithContext: preProcessResult.faithContext,
      resourceKeys: preProcessResult.resourceKeys,
      action: preProcessResult.action,
    },
    behavioralProfile,
    mode,
    scenarioRiskLevel,
    regenerationConstraint,
  });

  const response = await fetch(url, { method: 'POST', headers, body });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Edge Function returned ${response.status}: ${errorText}`);
  }

  return response.json();
}

// ── JSDoc Types ───────────────────────────────────────────────────────────

/**
 * @typedef {object} CoachingResult
 * @property {string} text - Final coaching response text (ready to display)
 * @property {boolean} isCrisis - True if crisis short-circuit was triggered
 * @property {object[]} layer2Violations - Violations found by Layer 2 regex validator
 * @property {string|null} layer3Action - 'pass' | 'patch' | 'regenerate' | 'skip' | null
 * @property {object|null} layer3Result - Full exit interview scan result
 * @property {string|null} modelUsed - Model ID used for primary coaching call
 * @property {string[]} resourcesInjected - Resource keys that were appended to text
 * @property {boolean} isRegenerated - True if this was a REGENERATE retry
 */
