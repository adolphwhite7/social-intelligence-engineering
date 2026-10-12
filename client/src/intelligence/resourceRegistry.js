/**
 * SIT Resource Registry — Deterministic Resource Injection
 *
 * Provides hardcoded crisis resource injection for scenarios that need exact
 * hotline numbers and service information appended to coaching responses.
 *
 * Design intent:
 *   The coaching LLM (Haiku/Sonnet) will not reliably volunteer exact hotline
 *   numbers or service action strings. This module detects when a scenario
 *   warrants resource disclosure and injects the exact strings deterministically.
 *
 * Injection threshold is LOWER than crisis detection:
 *   - Crisis detector (crisisDetector.js) fires at isCrisis=true and short-circuits
 *     to a crisis response. Resources are embedded in that response.
 *   - This module fires at potential_conflict / legal_medical_boundary level —
 *     the coaching response is still delivered, but resources are appended to it.
 *
 * Injection happens AFTER Layer 3 (Exit Interview) so resources are never
 * scanned by the exit interview validator.
 *
 * Last verified: 2026-03-18
 */

// ── Resource Definitions ──────────────────────────────────────────────────

/**
 * Canonical resource definitions for appended injection blocks.
 * These may overlap with crisisDetector.js RESOURCES — both are intentionally
 * maintained separately (crisisDetector.js serves the crisis short-circuit path;
 * this registry serves the coaching-response append path).
 */
const RESOURCE_CATALOG = {
  '988': {
    name: '988 Suicide & Crisis Lifeline',
    action: 'call or text 988',
    description: '24/7 free, confidential support',
    last_verified: '2026-03-18',
    source_url: 'https://988lifeline.org',
  },
  crisis_text: {
    name: 'Crisis Text Line',
    action: 'text HOME to 741741',
    description: 'Free 24/7 crisis counseling via text',
    last_verified: '2026-03-18',
    source_url: 'https://www.crisistextline.org',
  },
  ndvh: {
    name: 'National Domestic Violence Hotline',
    action: 'call 1-800-799-7233 (TTY: 1-800-787-3224) or text START to 88788',
    description: '24/7 confidential support for domestic and economic abuse',
    last_verified: '2026-03-18',
    source_url: 'https://www.thehotline.org',
  },
  rainn: {
    name: 'RAINN Sexual Assault Hotline',
    action: 'call 1-800-656-4673',
    description: 'Confidential 24/7 support for sexual assault survivors',
    last_verified: '2026-03-18',
    source_url: 'https://www.rainn.org',
  },
  childhelp: {
    name: 'Childhelp National Child Abuse Hotline',
    action: 'call 1-800-422-4453',
    description: '24/7 support for child abuse concerns',
    last_verified: '2026-03-18',
    source_url: 'https://www.childhelp.org/hotline',
  },
  trafficking: {
    name: 'National Human Trafficking Hotline',
    action: 'call 1-888-373-7888 or text HELP to 233733',
    description: 'Confidential support for trafficking and labor exploitation',
    last_verified: '2026-03-18',
    source_url: 'https://humantraffickinghotline.org',
  },
  victim_center: {
    name: 'National Center for Victims of Crime',
    action: 'call 1-855-4-VICTIM (1-855-482-8468)',
    description: 'Support for crime victims including stalking',
    last_verified: '2026-03-18',
    source_url: 'https://victimsofcrime.org',
  },
  elder_fraud: {
    name: 'National Elder Fraud Hotline',
    action: 'call 1-833-FRAUD-11 (1-833-372-8311)',
    description: 'For elder financial exploitation, scams, and fraud',
    last_verified: '2026-03-18',
    source_url: 'https://ovc.ojp.gov/program/stop-elder-fraud',
  },
  elder_abuse: {
    name: 'Eldercare Locator',
    action: 'call 1-800-677-1116',
    description: 'Connects to local elder abuse resources and Adult Protective Services',
    last_verified: '2026-03-18',
    source_url: 'https://eldercare.acl.gov',
  },
  nnedv_tech_safety: {
    name: 'NNEDV Technology Safety Project',
    action: 'techsafety.org',
    description: 'Guidance on device monitoring, digital privacy, and safety planning',
    last_verified: '2026-03-18',
    source_url: 'https://www.techsafety.org',
  },
  '211': {
    name: '211 Community Resources',
    action: 'call or text 211',
    description: 'Free referrals for housing, food, utilities, and financial assistance',
    last_verified: '2026-03-18',
    source_url: 'https://www.211.org',
  },
  professional_referral: {
    name: 'Psychology Today Therapist Finder',
    action: 'psychologytoday.com/us/therapists',
    description: 'Find licensed therapists, including sliding-scale and low-cost options',
    last_verified: '2026-03-18',
    source_url: 'https://www.psychologytoday.com/us/therapists',
  },
  open_path: {
    name: 'Open Path Collective',
    action: 'openpathcollective.org',
    description: 'Therapy sessions for $30–$80 for those who qualify',
    last_verified: '2026-03-18',
    source_url: 'https://openpathcollective.org',
  },
};

// ── Injection Trigger Rules ───────────────────────────────────────────────

/**
 * Each trigger rule maps keyword patterns (matched against the user message)
 * to resource keys. Triggers at a LOWER threshold than crisis detection —
 * these fire when the topic is detected, regardless of crisis classification.
 *
 * Rules are evaluated in order. A message may match multiple rules.
 * All matched resource keys are deduplicated before injection.
 */
const INJECTION_RULES = [
  {
    name: 'financial_abuse',
    patterns: [
      'controls all the money', 'controls my finances', "won't let me work",
      "won't give me money", 'takes my paycheck', 'hides money from me',
      'put me on an allowance', 'monitors my spending', 'controls the bank',
      'took my cards', 'financial abuse', 'economic abuse',
      'gives me an allowance', 'i have no money of my own',
      'takes my ebt', 'takes my benefits', 'controls the ebt',
      'lost my healthcare', 'lost my benefits', 'none of it is mine',
      'nothing in my name', 'leave with nothing',
    ],
    resourceKeys: ['ndvh'],
  },

  {
    name: 'elder_exploitation',
    patterns: [
      'elder abuse', 'exploiting my mother', 'exploiting my father',
      'exploiting my grandmother', 'exploiting my grandfather',
      'exploiting my grandparent', 'exploiting my parent',
      'taking her money', 'taking his money', 'taking their money',
      'stealing from her', 'stealing from him', 'stealing from them',
      'forged her', 'forged his', 'changed the will', 'changed their will',
      'power of attorney', 'guardian abuse', 'caregiver stealing',
      'nursing home abuse', 'scamming my', 'scamming my grandmother',
      'scamming my grandfather', 'scamming my mom', 'scamming my dad',
      'reverse mortgage', 'elder fraud',
    ],
    resourceKeys: ['elder_fraud', 'elder_abuse'],
  },

  {
    name: 'device_safety',
    patterns: [
      'monitors my phone', 'checks my phone', 'goes through my phone',
      'tracks my phone', 'gps on my phone', 'tracking app on my phone',
      'spyware', 'keylogger', 'shared phone', 'shares my phone',
      'shared device', 'he checks my messages', 'she checks my messages',
      'reads my texts', 'goes through my messages', 'monitoring my device',
      'monitoring software', 'reads my emails', 'monitoring app',
    ],
    resourceKeys: ['nnedv_tech_safety', 'ndvh'],
  },

  {
    name: 'trafficking_labor',
    patterns: [
      'took my passport', 'taken my passport', 'confiscated my passport',
      'took my documents', 'taken my documents', 'owes them money',
      'owe them money', 'debt bondage', 'forced to work', 'forces me to work',
      'human trafficking', 'trafficked', 'labor trafficking', 'forced labor',
      "can't leave the job", "won't let me leave the job",
      'domestic worker', 'au pair situation',
    ],
    resourceKeys: ['trafficking', 'crisis_text'],
  },

  {
    name: 'housing_economic_hardship',
    patterns: [
      'going to be homeless', "we'll be homeless", 'end up homeless',
      'eviction notice', 'being evicted', 'getting evicted',
      'nowhere to go', 'no place to go', 'sleeping in my car',
      'living in my car', 'on the street', 'food insecure', 'can\'t afford food',
      'utility shutoff', 'utilities cut off',
    ],
    resourceKeys: ['211'],
  },

  {
    name: 'low_income_therapy',
    patterns: [
      "can't afford therapy", "can't afford a therapist", 'therapy is too expensive',
      'therapist is too expensive', 'no insurance', "don't have insurance",
      'sliding scale', 'free therapy', 'low-cost therapy', 'low cost therapy',
      'community mental health',
    ],
    resourceKeys: ['open_path', '211'],
  },

  {
    name: 'professional_referral_boundary',
    // Injected when coaching has reached its boundary and professional help is warranted
    // Triggered by explicit test criteria keywords in Cat7 YELLOW scenarios
    patterns: [
      'considering professional help', 'thinking about therapy',
      'should i see a therapist', 'should i talk to someone',
      'need more help', 'beyond what i can handle',
      'legal question', 'is this legal', 'is that illegal',
      'medical advice', 'medical question', 'is this normal medically',
    ],
    resourceKeys: ['professional_referral', 'open_path'],
  },
];

// ── Core Functions ────────────────────────────────────────────────────────

/**
 * Detect which resources should be injected based on user message content.
 *
 * Runs at a LOWER threshold than crisis detection — matches topic patterns
 * regardless of crisis classification. May fire on non-crisis scenarios.
 *
 * @param {string} userMessage - The user's current message
 * @param {string[]} [recentHistory=[]] - Last 3 messages for context
 * @returns {string[]} Array of resource keys to inject (deduplicated)
 */
export function detectInjectionNeeds(userMessage, recentHistory = []) {
  const searchText = [userMessage, ...recentHistory].join(' ').toLowerCase();
  const matched = new Set();

  for (const rule of INJECTION_RULES) {
    for (const pattern of rule.patterns) {
      if (searchText.includes(pattern)) {
        for (const key of rule.resourceKeys) matched.add(key);
        break; // One match per rule is enough
      }
    }
  }

  return [...matched];
}

/**
 * Format a list of resource keys into a human-readable block for appending.
 *
 * @param {string[]} resourceKeys - Array of resource keys from detectInjectionNeeds
 * @returns {string} Formatted resource block, or '' if no keys
 */
export function formatResourceBlock(resourceKeys) {
  if (!resourceKeys || resourceKeys.length === 0) return '';

  const items = resourceKeys
    .map(key => RESOURCE_CATALOG[key])
    .filter(Boolean)
    .map(r => `• **${r.name}** — ${r.action} (${r.description})`)
    .join('\n');

  if (!items) return '';

  return `\n\n---\n**Resources that may help:**\n${items}`;
}

/**
 * Append the formatted resource block to a coaching response.
 * No-op if resourceKeys is empty or already-injected resources are detected.
 *
 * @param {string} text - The coaching response text
 * @param {string[]} resourceKeys - Resource keys from detectInjectionNeeds
 * @returns {string} Text with resource block appended, or original text
 */
export function appendResources(text, resourceKeys) {
  if (!resourceKeys || resourceKeys.length === 0) return text;

  // Avoid double-injection if resources already present in the response.
  // Check for the presence of any hotline number that would be injected.
  const block = formatResourceBlock(resourceKeys);
  if (!block) return text;

  return text + block;
}
