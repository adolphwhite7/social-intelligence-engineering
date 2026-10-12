/**
 * SIT Pre-Classification Crisis Detector
 *
 * Runs BEFORE the LLM-based safety classifier to catch crisis situations
 * via keyword matching and coercion pattern accumulation. This is the
 * "fast path" that ensures crisis resources are always delivered regardless
 * of how the LLM classifies the conversation.
 *
 * Returns: { isCrisis, sublabel, confidence, matchedPatterns, resources }
 */

// ── Crisis Keyword Patterns ───────────────────────────────────────────────

const CRISIS_PATTERNS = {
  physical_violence: {
    sublabel: 'abuse_disclosure',
    keywords: [
      'hit me', 'hits me', 'hitting me', 'punched me', 'punches me',
      'slapped me', 'slaps me', 'choked me', 'chokes me', 'choking me',
      'strangled me', 'strangles me', 'strangling me',
      'pushed me', 'pushes me', 'kicked me', 'kicks me',
      'threw something at me', 'throws things at me',
      'grabbed me', 'grabs me', 'held me down', 'holds me down',
      'beat me', 'beats me', 'beating me', 'hurt me physically',
      'put hands on me', 'puts hands on me',
      'broke my', 'bruises', 'black eye',
      'hurts me', 'he hurts me', 'she hurts me',
      'shoved me', 'shoves me', 'shoving me',
      'thrown things', 'throws things',
      'gets violent', 'gets physical', 'became violent', 'becomes violent',
      'punched the wall', 'punched a hole',
    ],
    resources: ['ndvh'],
  },

  fear_of_safety: {
    sublabel: 'immediate_danger',
    keywords: [
      'afraid to go home', 'scared to go home', 'terrified to go home',
      'scared of him', 'scared of her', 'afraid of him', 'afraid of her',
      'locked me in', 'locked me out', 'locks me in', 'locks me out',
      "won't let me leave", "doesn't let me leave", "can't leave",
      'threatens to kill', 'threatened to kill', 'said he would kill',
      'said she would kill', 'going to kill me', 'kill myself',
      'fear for my life', 'fear for my safety',
      'he has a gun', 'she has a gun', 'gun in the house',
      'terrified of him', 'terrified of her',
      "she's terrified", "he's terrified", "i'm terrified",
    ],
    resources: ['ndvh', '988', 'crisis_text'],
  },

  suicidal_ideation: {
    sublabel: 'self_harm',
    keywords: [
      "don't want to be here", "don't want to be here anymore",
      'end it all', 'end it', 'no point in living', 'no point anymore',
      'better off without me', 'better off dead',
      'want to die', 'wanted to die', 'wanting to die',
      'thinking about ending it', 'think about ending it',
      'have a plan', 'made a plan', 'planning to end',
      'kill myself', 'killing myself',
      'not worth living', 'nothing left to live for',
      "can't go on", "can't do this anymore", "can't take it anymore",
      'suicidal', 'suicide',
      'nobody would miss me', "wouldn't miss me", "wouldn't even miss me",
      "what's the point", 'what is the point',
      "don't want to wake up", "didn't want to wake up",
      "don't see the point", "don't see a reason",
      "there's nothing left", 'nothing left for me',
      'no reason to keep going',
    ],
    resources: ['988', 'crisis_text'],
  },

  self_harm: {
    sublabel: 'self_harm',
    keywords: [
      'cutting myself', 'cut myself', 'cuts on my',
      'burning myself', 'burn myself',
      'hurting myself', 'hurt myself', 'hurts myself',
      'self-harm', 'self harm',
      'starving myself', 'purging', 'making myself throw up',
    ],
    resources: ['988', 'crisis_text'],
  },

  sexual_violence: {
    sublabel: 'abuse_disclosure',
    keywords: [
      'forced me to have sex', 'forces me to have sex',
      'raped me', 'rapes me', 'raping me',
      "won't take no for an answer", "doesn't take no",
      'removed the condom', 'took off the condom', 'stealthing',
      "didn't consent", 'without my consent', 'without consent',
      'makes me have sex', 'made me have sex',
      'drugged me', 'drugged my drink',
      'sexually assaulted', 'sexual assault',
      'touched me inappropriately', 'inappropriate touching',
      'molested', 'molestation',
    ],
    resources: ['rainn', 'ndvh'],
  },

  child_abuse: {
    sublabel: 'abuse_disclosure',
    keywords: [
      'hits my child', 'hitting my child', 'beats my child',
      'hits the kids', 'hitting the kids', 'hurts the kids',
      'hurts my child', 'hurting my child',
      'inappropriate touching', 'touches inappropriately',
      'sexually abusing', 'abusing my child', 'abusing the children',
      'child abuse', 'abused as a child', 'molesting',
      'inappropriate with a teenager', 'inappropriate with a child',
      'inappropriate with a minor', 'inappropriate with a kid',
      'something happened to me when i was little',
      'something happened to me as a child',
    ],
    resources: ['childhelp', 'crisis_text'],
  },

  trafficking: {
    sublabel: 'immediate_danger',
    keywords: [
      'took my passport', 'taken my passport', 'confiscated my passport',
      'took my documents', 'taken my documents',
      "won't let me leave the house", "can't leave the house",
      "can't contact anyone", "won't let me use the phone",
      'owes them money', 'owe them money', 'debt bondage',
      'forced to work', 'forces me to work',
      'human trafficking', 'trafficked',
    ],
    resources: ['trafficking', 'crisis_text'],
  },

  stalking: {
    sublabel: 'immediate_danger',
    keywords: [
      'follows me', 'following me', 'followed me',
      'shows up uninvited', 'showed up at my',
      'tracks my location', 'tracking my location', 'tracking my phone',
      "won't stop contacting me", "won't leave me alone",
      'stalking me', 'stalker', 'stalks me',
      'watches my house', 'watching my house',
    ],
    resources: ['ndvh', 'victim_center'],
  },

  forced_marriage_honor: {
    sublabel: 'immediate_danger',
    keywords: [
      'forced marriage', 'forcing me to marry', 'arranged against my will',
      'honor killing', 'honor violence', 'honor-based',
      'fgm', 'female genital mutilation', 'circumcision ceremony',
      'disown me if', 'kill me if I leave', 'threatened to disown',
    ],
    resources: ['ndvh', 'crisis_text'],
  },

  homicidal_ideation: {
    sublabel: 'harm_to_others',
    keywords: [
      'want to kill', 'going to kill', 'thinking about killing',
      'hurt them badly', 'make them pay with their life',
      'shoot up', 'bring a gun to', 'bomb',
    ],
    resources: ['988', 'crisis_text'],
  },

  housing_crisis: {
    sublabel: 'immediate_danger',
    keywords: [
      'going to be homeless', "we'll be homeless", 'end up homeless',
      'eviction notice', 'being evicted', 'getting evicted',
      'nowhere to go', 'no place to go', 'sleeping in my car',
      'living in my car', 'on the street',
    ],
    resources: ['crisis_text', '211'],
  },

  elder_exploitation: {
    sublabel: 'abuse_disclosure',
    keywords: [
      'elder abuse', 'exploiting my mother', 'exploiting my father',
      'exploiting my grandmother', 'exploiting my grandfather',
      'taking her money', 'taking his money',
      'stealing from her', 'stealing from him',
    ],
    resources: ['ndvh', 'crisis_text'],
  },

  political_violence_signal: {
    sublabel: 'immediate_danger',
    keywords: [
      'bought more guns', 'buying guns', 'stockpiling weapons', 'stockpiling guns',
      'joined a militia', 'militia chat', 'militia group',
      'civil war', 'take up arms', 'take action against',
      'people like us will have to', 'time to fight back',
      'revolution is coming', 'prepared for war',
      'they know where my kids go to school',
      'posted my address', 'doxxed me', 'doxxed my family',
      'know where i live', 'threats against my family',
      'someone showed up at my house', 'showed up at my work',
    ],
    resources: ['988', 'ndvh', 'crisis_text'],
  },

  doxxing_threats: {
    sublabel: 'immediate_danger',
    keywords: [
      'posted my home address', 'posted my address online',
      'sharing my personal information', 'leaked my address',
      'sending me death threats', 'death threats online',
      'threatened my children', 'threatened my kids',
      'they found where i work', 'showed up at my door',
      'harassing my family', 'targeting my family',
      'swatted', 'swatting',
    ],
    resources: ['victim_center', 'crisis_text'],
  },
};

// ── Coercion Pattern Accumulation ─────────────────────────────────────────

const COERCION_INDICATORS = {
  isolation: [
    'no one else understands', "they're turning people against me",
    "won't let me see my friends", "won't let me see my family",
    'cut off from', 'isolated from', 'no support system',
    "doesn't want me talking to", 'monitors who i talk to',
    "can't talk to anyone", "won't let me talk to",
    'keeps me away from', 'separated from my',
    "won't let me leave the group", "can't leave the church",
    "won't let her see", "won't let him see",
    "won't let her work", "won't let him work",
  ],
  financial_control: [
    'controls all the money', 'controls my finances',
    "won't let me work", "won't give me money",
    'takes my paycheck', 'hides money from me',
    'put me on an allowance', 'monitors my spending',
    'controls the bank account', 'took my cards',
    "won't let me get a job", 'controls my bank',
    'gives me an allowance', 'i have no money of my own',
    'takes my ebt', 'takes my benefits', 'controls the ebt',
    'lost my healthcare', 'lost my benefits',
    'leave with nothing', 'none of it is mine', 'nothing in my name',
  ],
  movement_restriction: [
    "won't let me leave", "can't go anywhere without",
    'monitors where i go', 'tracks my location', 'tracks where i go',
    'needs to know where i am', 'follows me',
    'locked in', "can't leave the house",
    'monitors my phone', 'checks my phone', 'goes through my phone',
    'tracks my phone', 'gps on my', 'tracking app',
    "won't let me go", "won't let me drive",
    'checks her phone', 'tracks her location', "won't let her leave",
    'checks his phone', 'tracks his location', "won't let him leave",
  ],
  sexual_pressure: [
    'pressures me for sex', 'guilt trips me into sex',
    "won't take no", 'forces me', 'makes me perform',
    'withholds affection unless', 'sex as punishment',
  ],
  document_confiscation: [
    'took my passport', 'took my ID', 'hides my documents',
    'confiscated my', "won't give me my papers",
  ],
  threats: [
    'threatens to', 'threatened to', 'said he would',
    'said she would', 'if I leave he will', 'if I leave she will',
    'threatens to hurt', 'threatens the children',
    'threatens to take the kids', 'threatens to deport',
  ],
  political_coercion: [
    'checks my phone and says', 'spiritual accountability',
    'says god made him accountable', 'obey politically',
    'submit to his political views', 'submit to her political views',
    'not allowed to disagree', 'forbidden from disagreeing',
    'punished for my beliefs', 'retaliated for my views',
    'fired for my political views', 'performance review for my politics',
    'misaligned with company culture',
  ],
};

// ── Resource Definitions ──────────────────────────────────────────────────

const RESOURCES = {
  '988': {
    name: '988 Suicide & Crisis Lifeline',
    action: 'call or text 988',
    description: 'Free, confidential support 24/7',
  },
  crisis_text: {
    name: 'Crisis Text Line',
    action: 'text HOME to 741741',
    description: 'Free crisis counseling via text',
  },
  ndvh: {
    name: 'National Domestic Violence Hotline',
    action: 'call 1-800-799-7233',
    description: 'Confidential support for domestic violence',
  },
  rainn: {
    name: 'RAINN Sexual Assault Hotline',
    action: 'call 1-800-656-4673',
    description: 'Confidential support for sexual assault survivors',
  },
  childhelp: {
    name: 'Childhelp National Child Abuse Hotline',
    action: 'call 1-800-422-4453',
    description: 'For child abuse concerns',
  },
  trafficking: {
    name: 'National Human Trafficking Hotline',
    action: 'call 1-888-373-7888',
    description: 'For trafficking, forced labor, document confiscation',
  },
  stop_it_now: {
    name: 'Stop It Now',
    action: 'call 1-888-773-8368',
    description: 'Confidential help for people concerned about their own behavior toward children',
  },
  victim_center: {
    name: 'National Center for Victims of Crime',
    action: 'call 1-855-4-VICTIM',
    description: 'For stalking and crime victims',
  },
  samhsa: {
    name: 'SAMHSA National Helpline',
    action: 'call 1-800-662-4357',
    description: 'Free, confidential substance abuse treatment referral',
  },
  '211': {
    name: '211 Community Resources',
    action: 'call 211',
    description: 'Housing, food, and utility assistance referrals',
  },
};

// ── Negation Check ────────────────────────────────────────────────────────

const NEGATION_PREFIXES = [
  "not like he ", "not like she ", "not like they ",
  "it's not like he ", "it's not like she ",
  "doesn't ", "doesn't really ", "don't ", "don't really ",
  "not ", "never ", "no ",
  "at least he doesn't ", "at least she doesn't ",
  "he doesn't ", "she doesn't ",
  "he never ", "she never ",
  "he's not ", "she's not ",
];

/**
 * Check if a keyword match is negated by a preceding negation phrase.
 * Returns true if the match appears to be negated (and should be skipped).
 */
function isNegated(text, keyword) {
  const idx = text.indexOf(keyword);
  if (idx < 0) return false;
  // Check the 40 chars before the keyword for negation phrases
  const prefix = text.substring(Math.max(0, idx - 40), idx);
  return NEGATION_PREFIXES.some(neg => prefix.endsWith(neg));
}

// ── Core Detection Function ───────────────────────────────────────────────

/**
 * Detect crisis indicators in a user message.
 *
 * @param {string} message - The user's message text
 * @param {string[]} [conversationHistory] - Previous messages for coercion accumulation
 * @returns {{ isCrisis: boolean, sublabel: string|null, confidence: number, matchedPatterns: string[], resources: object[], coercionScore: number }}
 */
export function detectCrisis(message, conversationHistory = []) {
  const lowerMsg = message.toLowerCase();
  const allText = [lowerMsg, ...conversationHistory.map(m => m.toLowerCase())].join(' ');

  const matchedPatterns = [];
  const resourceKeys = new Set();
  let sublabel = null;
  let highestConfidence = 0;

  // Phase 1: Direct keyword matching against current message
  for (const [category, config] of Object.entries(CRISIS_PATTERNS)) {
    for (const keyword of config.keywords) {
      if (lowerMsg.includes(keyword) && !isNegated(lowerMsg, keyword)) {
        matchedPatterns.push(`${category}: "${keyword}"`);
        sublabel = sublabel || config.sublabel;
        highestConfidence = Math.max(highestConfidence, 0.95);
        for (const r of config.resources) resourceKeys.add(r);
        break; // One match per category is enough
      }
    }
  }

  // Phase 2: Coercion pattern accumulation across conversation
  let coercionScore = 0;
  const coercionMatches = [];

  for (const [category, indicators] of Object.entries(COERCION_INDICATORS)) {
    for (const indicator of indicators) {
      if (allText.includes(indicator)) {
        coercionScore++;
        coercionMatches.push(`coercion_${category}: "${indicator}"`);
        break; // One match per coercion category
      }
    }
  }

  // If 2+ coercion categories detected, escalate to crisis
  if (coercionScore >= 2 && matchedPatterns.length === 0) {
    matchedPatterns.push(...coercionMatches);
    sublabel = 'abuse_disclosure';
    highestConfidence = Math.max(highestConfidence, 0.85);
    resourceKeys.add('ndvh');
    resourceKeys.add('crisis_text');
  }

  // Build resource list
  const resources = [...resourceKeys].map(key => RESOURCES[key]).filter(Boolean);

  return {
    isCrisis: matchedPatterns.length > 0,
    sublabel,
    confidence: highestConfidence,
    matchedPatterns,
    resources,
    coercionScore,
  };
}

/**
 * Format crisis resources into a response string.
 *
 * @param {object[]} resources - Array of resource objects from detectCrisis
 * @returns {string} Formatted resource list
 */
export function formatCrisisResources(resources) {
  if (!resources || resources.length === 0) return '';

  return resources
    .map(r => `- **${r.name}** — ${r.action} (${r.description})`)
    .join('\n');
}

/**
 * Generate a complete crisis response.
 *
 * @param {object} detection - Result from detectCrisis
 * @returns {string} Full crisis response text
 */
export function generateCrisisResponse(detection) {
  const { sublabel, resources } = detection;

  let care = '';
  switch (sublabel) {
    case 'self_harm':
      care = "I hear you, and I'm really glad you're talking about this. What you're feeling matters, and you don't have to carry this alone.";
      break;
    case 'harm_to_others':
      care = "I can hear how much pain you're in right now. Please reach out to someone who can help.";
      break;
    case 'abuse_disclosure':
      care = "Thank you for trusting me with this. What you're describing is serious, and you deserve support.";
      break;
    case 'immediate_danger':
      care = "Your safety matters more than anything else right now. Please reach out to one of these resources — they're confidential and available 24/7.";
      break;
    default:
      care = "I hear you, and I want you to know that support is available right now.";
  }

  const resourceText = formatCrisisResources(resources);

  return `${care}\n\n${resourceText}\n\nThis space is here for you whenever you need it.`;
}
