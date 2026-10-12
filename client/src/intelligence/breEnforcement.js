/**
 * SIT Biblical Rules Engine (BRE) Enforcement Layer
 *
 * Programmatic gate that detects faith-context conversations via keyword
 * matching against the 3,230-term BRE trigger table, looks up relevant
 * BRE rules, and injects classification constraints to prevent secular-bias
 * misclassification.
 *
 * Key Principle (Scriptural Precedent Test):
 * Before classifying any faith-context behavior as spiritual abuse, the
 * system must FIRST check if the behavior has scriptural precedent. If
 * biblically supported and a legitimate creed of Christianity, it is NOT
 * abuse. Only behaviors that contradict Scripture or have no scriptural
 * basis should be flagged.
 *
 * Architecture: Option 4 — BRE Lookup Table + Override Authority
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Load BRE Keyword Triggers ─────────────────────────────────────────────

let BRE_TRIGGERS = null;
let TRIGGER_INDEX = null; // domain -> [terms]

function loadTriggers() {
  if (BRE_TRIGGERS) return;

  const triggerPath = join(__dirname, '../../data/bre_keyword_triggers.json');
  try {
    BRE_TRIGGERS = JSON.parse(readFileSync(triggerPath, 'utf8'));
    TRIGGER_INDEX = {};

    for (const domain of BRE_TRIGGERS.domains || []) {
      const domainName = domain.domain;
      TRIGGER_INDEX[domainName] = [];

      for (const term of domain.terms || []) {
        TRIGGER_INDEX[domainName].push({
          text: term.term.toLowerCase(),
          type: term.type, // keyword | phrase
          confidence: term.confidence,
          ambiguity: term.ambiguity,
        });
      }
    }
  } catch (e) {
    console.error('BRE trigger load failed:', e.message);
    BRE_TRIGGERS = { domains: [] };
    TRIGGER_INDEX = {};
  }
}

// ── BRE Domain Definitions ────────────────────────────────────────────────

/**
 * Mapping from BRE trigger domains to relevant BRE rule categories.
 * When keywords from a domain are detected, these rules are injected
 * into the classification context.
 */
const DOMAIN_TO_RULES = {
  pastoral_authority: {
    axiom: 'A1 (Servant Authority)',
    rules: [
      'Pastoral teaching, preaching, and spiritual leadership are normative biblical functions (1 Tim 3:1-7, Titus 1:5-9)',
      'A pastor exhorting the congregation on biblical topics (tithing, sexual ethics, church attendance) is exercising scriptural authority, not coercion',
      'ONLY flag when: leader claims personal authority over individual decisions, demands unquestioning obedience, or punishes dissent with spiritual threats',
    ],
    scriptural_precedent_test: true,
  },

  financial_giving: {
    axiom: 'A3 (Stewardship Accountability)',
    rules: [
      'Teaching on tithing has scriptural precedent (Malachi 3:10, Luke 6:38, 2 Cor 9:6-7)',
      'Churches rely on congregational giving — this is the biblical funding model, not exploitation (1 Cor 9:11, Phil 4:15-19)',
      'Prosperity gospel messaging that ties giving to guaranteed material return may be theologically questionable but is a creed held by legitimate denominations',
      'ONLY flag when: leader demands specific amounts, threatens spiritual consequences for non-giving, or diverts funds for personal enrichment',
    ],
    scriptural_precedent_test: true,
  },

  marriage_submission: {
    axiom: 'A2 (Mutual Sacrifice) + A5 (Safety Ceiling)',
    rules: [
      'Ephesians 5:22-33 teaches mutual submission — wives submit AND husbands sacrifice as Christ sacrificed for the church',
      'Complementarian theology (husband as head) is a legitimate biblical interpretation held by major denominations',
      'Egalitarian theology (mutual submission) is equally legitimate',
      'ONLY flag when: submission language is used to justify control, silence, or physical/emotional abuse',
      'Safety Ceiling: Physical safety ALWAYS overrides theological interpretation — abuse is never biblically sanctioned',
    ],
    scriptural_precedent_test: true,
  },

  church_discipline: {
    axiom: 'A4 (Restorative Accountability)',
    rules: [
      'Matthew 18:15-17 outlines a process of private correction → witnesses → church involvement',
      'Church discipline aimed at restoration is biblically normative',
      'Excommunication/disfellowship exists in Scripture (1 Cor 5:1-5) but is intended to be restorative',
      'ONLY flag when: discipline is punitive without restoration path, used to silence abuse victims, or results in shunning that causes psychological harm',
    ],
    scriptural_precedent_test: true,
  },

  scripture_references: {
    rules: [
      'The presence of scripture references in a conversation indicates faith context — apply BRE rules',
      'Do not assume scripture citation equals manipulation — it is the normal mode of Christian discourse',
    ],
    scriptural_precedent_test: false,
  },

  denominational_terms: {
    rules: [
      'Denominational language (Baptist, Pentecostal, Catholic, Reformed, etc.) indicates faith context',
      'Each denomination has legitimate theological distinctives — do not apply one tradition\'s standards to another',
    ],
    scriptural_precedent_test: false,
  },

  spiritual_experience: {
    rules: [
      'Speaking in tongues, prophecy, healing, and other charismatic experiences are legitimate practices in many traditions (1 Cor 12-14)',
      'Do not pathologize spiritual experiences as mental health symptoms',
      'ONLY flag when: spiritual experiences are used to claim authority, override consent, or justify harmful behavior',
    ],
    scriptural_precedent_test: true,
  },

  euphemistic_indirect: {
    rules: [
      'Indirect faith language ("the Lord told me", "God\'s will", "covering") may indicate either normative faith expression OR spiritual manipulation',
      'Apply the Scriptural Precedent Test: does the claimed behavior/teaching have biblical support?',
      'When ambiguous, explore rather than classify — ask the user to describe what specifically happened',
    ],
    scriptural_precedent_test: true,
  },
};

// ── Core Detection Function ───────────────────────────────────────────────

/**
 * Scan a message for BRE keyword triggers and return matched domains
 * with their associated rules.
 *
 * @param {string} message - User message to scan
 * @returns {{ isFaithContext: boolean, matchedDomains: object[], triggerCount: number, constraintPrompt: string }}
 */
export function detectFaithContext(message) {
  loadTriggers();

  const lowerMsg = message.toLowerCase();
  const matchedDomains = {};
  let triggerCount = 0;

  for (const [domainName, terms] of Object.entries(TRIGGER_INDEX)) {
    for (const term of terms) {
      if (term.type === 'phrase') {
        if (lowerMsg.includes(term.text)) {
          if (!matchedDomains[domainName]) {
            matchedDomains[domainName] = { terms: [], rules: DOMAIN_TO_RULES[domainName] };
          }
          matchedDomains[domainName].terms.push(term.text);
          triggerCount++;
        }
      } else {
        // keyword — match as whole word
        const regex = new RegExp(`\\b${term.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (regex.test(lowerMsg)) {
          if (!matchedDomains[domainName]) {
            matchedDomains[domainName] = { terms: [], rules: DOMAIN_TO_RULES[domainName] };
          }
          matchedDomains[domainName].terms.push(term.text);
          triggerCount++;
        }
      }
    }
  }

  const isFaithContext = triggerCount >= 2 || Object.keys(matchedDomains).length >= 1;

  // Build constraint prompt to inject into safety classifier
  let constraintPrompt = '';
  if (isFaithContext) {
    constraintPrompt = buildConstraintPrompt(matchedDomains);
  }

  return {
    isFaithContext,
    matchedDomains,
    triggerCount,
    constraintPrompt,
  };
}

// ── Constraint Prompt Builder ─────────────────────────────────────────────

/**
 * Build a prompt injection that constrains the safety classifier's
 * behavior in faith contexts.
 *
 * @param {object} matchedDomains - Domains matched by keyword detection
 * @returns {string} Constraint text to append to system prompt
 */
function buildConstraintPrompt(matchedDomains) {
  let prompt = `\n\nFAITH CONTEXT DETECTED — BRE CLASSIFICATION CONSTRAINTS:\n`;
  prompt += `This conversation involves religious/faith topics. Apply the Scriptural Precedent Test before classifying any behavior as abuse or manipulation:\n\n`;
  prompt += `SCRIPTURAL PRECEDENT TEST:\n`;
  prompt += `1. Does the behavior described have scriptural precedent?\n`;
  prompt += `2. Is it a legitimate creed or practice of a recognized Christian tradition?\n`;
  prompt += `3. If YES to both → it is NOT abuse/manipulation. Classify as normal_interaction or potential_conflict at most.\n`;
  prompt += `4. If NO or if the behavior CONTRADICTS Scripture → may be manipulation/abuse. Classify accordingly.\n\n`;

  prompt += `ACTIVE BRE RULES FOR THIS CONVERSATION:\n`;

  for (const [domainName, data] of Object.entries(matchedDomains)) {
    if (data.rules) {
      const domainRules = data.rules;
      if (domainRules.axiom) {
        prompt += `\n[${domainName}] — Axiom: ${domainRules.axiom}\n`;
      } else {
        prompt += `\n[${domainName}]\n`;
      }
      for (const rule of domainRules.rules || []) {
        prompt += `  • ${rule}\n`;
      }
    }
  }

  prompt += `\nIMPORTANT: The Safety Ceiling (Axiom A5) ALWAYS applies — physical safety overrides ALL theological interpretation. If someone is in physical danger, classify as crisis regardless of faith context.\n`;

  return prompt;
}

/**
 * Get all available BRE domains and their term counts.
 *
 * @returns {object[]} Array of { domain, termCount }
 */
export function getDomainStats() {
  loadTriggers();
  return Object.entries(TRIGGER_INDEX).map(([domain, terms]) => ({
    domain,
    termCount: terms.length,
  }));
}
