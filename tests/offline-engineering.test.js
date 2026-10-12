import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCrisis, generateCrisisResponse } from '../client/src/intelligence/crisisDetector.js';
import { validateOutput } from '../client/src/intelligence/outputValidator.js';
import { detectInjectionNeeds, appendResources } from '../client/src/intelligence/resourceRegistry.js';

// All input sentences in this file are invented fixtures, not user conversations.
// Imports are limited to dependency-free modules: no SDK, credentials, or network.

test('an ordinary disagreement stays on the normal response path', () => {
  const result = detectCrisis('We disagree about where to have lunch.');
  assert.equal(result.isCrisis, false);
  assert.equal(result.sublabel, null);
  assert.equal(result.resources.length, 0);
});

test('an explicit danger phrase produces a resource-bearing response without an LLM', () => {
  const result = detectCrisis('I am afraid to go home.');
  assert.equal(result.isCrisis, true);
  assert.equal(result.sublabel, 'immediate_danger');
  assert.ok(result.resources.length > 0);
  const response = generateCrisisResponse(result);
  assert.ok(response.includes(result.resources[0].name));
});

test('separate control indicators accumulate across turns', () => {
  const current = 'He controls all the money.';
  const history = ['He keeps me away from my friends.'];
  assert.equal(detectCrisis(current).isCrisis, false);
  const result = detectCrisis(current, history);
  assert.equal(result.isCrisis, true);
  assert.equal(result.sublabel, 'abuse_disclosure');
  assert.equal(result.coercionScore, 2);
});

test('the same directive is softened for coaching and permitted on the crisis path', () => {
  const draft = 'You should take a moment to consider your options.';
  const coaching = validateOutput(draft, { autoSanitize: true });
  assert.ok(coaching.violations.some(v => v.type === 'directive_language'));
  assert.match(coaching.sanitizedText, /^you could try /);
  assert.doesNotMatch(coaching.sanitizedText, /you should/i);
  const crisis = validateOutput(draft, { isCrisis: true, autoSanitize: true });
  assert.equal(crisis.isClean, true);
  assert.equal(crisis.sanitizedText, null);
});

test('clinical labels and character judgments remain visible as findings', () => {
  const result = validateOutput('He is a narcissist.');
  assert.equal(result.isClean, false);
  assert.ok(result.violations.some(v => v.type === 'clinical_term'));
  assert.ok(result.violations.some(v => v.type === 'character_judgment'));
  assert.equal(result.sanitizedText, null);
});

test('overlapping topic rules select unique resource keys before rendering', () => {
  const keys = detectInjectionNeeds('He controls all the money and checks my phone.');
  assert.equal(keys.filter(k => k === 'ndvh').length, 1);
  assert.ok(keys.includes('nnedv_tech_safety'));
  const draft = 'Let us look at the options available.';
  assert.equal(appendResources(draft, []), draft);
  const rendered = appendResources(draft, keys);
  assert.ok(rendered.startsWith(draft));
  assert.equal((rendered.match(/National Domestic Violence Hotline/g) || []).length, 1);
});
