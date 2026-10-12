/**
 * SIT Output Validator
 *
 * Post-generation filter that checks AI coaching responses for prohibited
 * content before delivery to the user. Runs after every LLM response.
 *
 * Returns: { isClean: boolean, violations: string[], sanitizedText: string|null }
 */

// ── Prohibited Clinical Terms ─────────────────────────────────────────────

const CLINICAL_TERMS = [
  'narcissist', 'narcissistic', 'npd',
  'bpd', 'borderline personality',
  'avoidant attachment', 'anxious attachment', 'disorganized attachment',
  'depression', 'depressed', 'anxiety disorder',
  'ptsd', 'post-traumatic', 'post traumatic',
  'bipolar', 'sociopath', 'psychopath',
  'codependent', 'codependency',
  'enmeshment', 'parentification',
  'gaslighting',
];

// ── Prohibited Directive Patterns ─────────────────────────────────────────

const DIRECTIVE_PATTERNS = [
  { pattern: /\byou should\b/gi, replacement: 'you could try' },
  { pattern: /\byou need to\b/gi, replacement: 'it might help to' },
  { pattern: /\byou must\b/gi, replacement: 'something worth considering is' },
  { pattern: /\byou have to\b/gi, replacement: 'what if you' },
];

// ── Prohibited Character Judgments ────────────────────────────────────────

const CHARACTER_LABEL_WORDS = '(?:narcissist|abuser|sociopath|psychopath|monster|predator|bad person|bad man|bad woman|terrible person|toxic person|manipulator|batterer|perpetrator|offender|criminal|evil|dangerous person|sick person|lost cause)';
const CHARACTER_JUDGMENT_PATTERNS = [
  new RegExp(`\\bthey are a ${CHARACTER_LABEL_WORDS}\\b`, 'i'),
  new RegExp(`\\bthey're a ${CHARACTER_LABEL_WORDS}\\b`, 'i'),
  new RegExp(`\\bhe is a ${CHARACTER_LABEL_WORDS}\\b`, 'i'),
  new RegExp(`\\bshe is a ${CHARACTER_LABEL_WORDS}\\b`, 'i'),
  new RegExp(`\\bhe's a ${CHARACTER_LABEL_WORDS}\\b`, 'i'),
  new RegExp(`\\bshe's a ${CHARACTER_LABEL_WORDS}\\b`, 'i'),
];

// ── Prohibited Therapy Language ───────────────────────────────────────────

const THERAPY_PATTERNS = [
  /\bthis is a sign of\b/i,
  /\bthey suffer from\b/i,
  /\bthey need therapy\b/i,
  /\byou need therapy\b/i,
];

// ── Prohibited Prediction Patterns ────────────────────────────────────────

const PREDICTION_PATTERNS = [
  /\bhe will do it again\b/i,
  /\bshe will do it again\b/i,
  /\bthis will escalate\b/i,
  /\bthis will get worse\b/i,
  /\bhe won't change\b/i,
  /\bshe won't change\b/i,
  /\bthey won't change\b/i,
  /\bthis cycle will continue\b/i,
  /\bit's only going to get worse\b/i,
  /\bhe's never going to\b/i,
  /\bshe's never going to\b/i,
];

// ── Core Validation Function ──────────────────────────────────────────────

/**
 * Validate an AI coaching response for prohibited content.
 *
 * @param {string} responseText - The AI's response text (without metadata block)
 * @param {object} [options] - Validation options
 * @param {boolean} [options.isCrisis=false] - If true, allows directive language
 * @param {boolean} [options.autoSanitize=false] - If true, attempts to fix violations
 * @returns {{ isClean: boolean, violations: object[], sanitizedText: string|null }}
 */
export function validateOutput(responseText, options = {}) {
  const { isCrisis = false, autoSanitize = false } = options;
  const violations = [];
  let sanitized = responseText;

  // 1. Check clinical terms
  for (const term of CLINICAL_TERMS) {
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(responseText)) {
      violations.push({
        type: 'clinical_term',
        term,
        severity: 'high',
        message: `Prohibited clinical term: "${term}"`,
      });
      if (autoSanitize) {
        sanitized = sanitized.replace(regex, '[pattern]');
      }
    }
  }

  // 2. Check directive language (exempt in crisis)
  if (!isCrisis) {
    for (const { pattern, replacement } of DIRECTIVE_PATTERNS) {
      if (pattern.test(responseText)) {
        const match = responseText.match(pattern)?.[0];
        violations.push({
          type: 'directive_language',
          term: match,
          severity: 'medium',
          message: `Directive language: "${match}" → should be "${replacement}"`,
        });
        if (autoSanitize) {
          sanitized = sanitized.replace(pattern, replacement);
        }
      }
    }
  }

  // 3. Check character judgments
  for (const pattern of CHARACTER_JUDGMENT_PATTERNS) {
    if (pattern.test(responseText)) {
      const match = responseText.match(pattern)?.[0];
      violations.push({
        type: 'character_judgment',
        term: match,
        severity: 'high',
        message: `Character judgment: "${match}"`,
      });
    }
  }

  // 4. Check therapy language
  for (const pattern of THERAPY_PATTERNS) {
    if (pattern.test(responseText)) {
      const match = responseText.match(pattern)?.[0];
      violations.push({
        type: 'therapy_language',
        term: match,
        severity: 'high',
        message: `Therapy language: "${match}"`,
      });
    }
  }

  // 5. Check predictions about third parties
  for (const pattern of PREDICTION_PATTERNS) {
    if (pattern.test(responseText)) {
      const match = responseText.match(pattern)?.[0];
      violations.push({
        type: 'prediction',
        term: match,
        severity: 'medium',
        message: `Prediction about third party: "${match}"`,
      });
    }
  }

  return {
    isClean: violations.length === 0,
    violations,
    sanitizedText: autoSanitize && violations.length > 0 ? sanitized : null,
  };
}

/**
 * Quick check — returns true if the response passes all checks.
 *
 * @param {string} responseText - The AI's response text
 * @param {boolean} [isCrisis=false] - Whether this is a crisis response
 * @returns {boolean}
 */
export function isClean(responseText, isCrisis = false) {
  return validateOutput(responseText, { isCrisis }).isClean;
}
