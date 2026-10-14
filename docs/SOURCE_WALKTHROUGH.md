# Source walkthrough

## Follow one request

1. **Route before generation.** [`preProcess`](../client/src/intelligence/index.js) calls the [crisis detector](../client/src/intelligence/crisisDetector.js), which combines current-message patterns with indicators accumulated across recent context. A risk route returns a deterministic response without a model call. On the coaching route, preprocessing collects contextual constraints and resource keys.
2. **Separate the service boundary.** The [client wrapper](../client/src/services/intelligenceClient.js) sends the request to a configured server function. The [service source](../supabase/functions/intelligence-service/index.ts) selects the model, assembles context, obtains a draft, and applies response checks. Configuration values and deployment authentication settings are outside this showcase.
3. **Make review outcomes explicit.** The [output validator](../client/src/intelligence/outputValidator.js) reports prohibited patterns as structured findings. The optional [model-based reviewer](../client/src/intelligence/exitInterviewValidator.js) asks for tool-schema findings and distinguishes a pass, a targeted patch, and regeneration. The client limits regeneration to one additional request.
4. **Render selected resources deterministically.** The [resource registry](../client/src/intelligence/resourceRegistry.js) selects unique resource keys from relevant topics and formats a resource block after review. This moves exact reference strings outside model generation.

## Two engineering tradeoffs

**Deterministic rules plus semantic review.** Fast pattern checks are inexpensive and inspectable; the example tests can exercise them without a provider. They have limited language understanding. The optional model review addresses semantic patterns but introduces latency, cost, and a separate failure mode. Its current source returns the already-processed response when the optional review fails. That availability choice is visible in the code and remains part of ongoing evaluation; it is not proof that every output is safe.

**Bounded regeneration.** A second generation attempt can address a structured review finding without allowing an unbounded loop. The source caps regeneration at one retry, making cost and latency easier to reason about. Provider behavior and the resulting response quality require evaluation beyond the offline tests.

## Context policy and component boundaries

The [context-constraint module](../client/src/intelligence/breEnforcement.js) demonstrates keyword-to-domain matching and construction of faith-context constraints. Its broader trigger dataset is not included. The [persona module](../client/src/intelligence/prompts/olderSiblingPersona.js) defines the coaching voice and response constraints. These modules are available for source review; the offline tests do not load their provider-dependent orchestration path.

The server and client-side modules show related development paths. The showcase preserves them as source components rather than presenting them as a single packaged application.

## What the offline tests establish

The [test file](../tests/offline-engineering.test.js) uses six example scenarios. Each assertion targets an observable behavior of the selected source: normal routing, deterministic risk routing, context accumulation, directive handling, structured findings, or unique resource-key selection. No conversations, provider responses, or historical test outputs were copied into the fixtures.

The tests validate those bounded behaviors. Model quality, mobile integration, server authorization, resource currency, and end-to-end product acceptance are evaluated separately as development proceeds.
