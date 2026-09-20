import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { buildChatBody } from "./client";

const schema = z.object({ answer: z.string() });

const nvidia = {
  model: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-NVFP4",
  maxTokensParam: "max_tokens" as const,
  supportsNemotronReasoning: true,
  forceThinkingDisabled: false,
};

const req = {
  name: "Answer",
  system: "system",
  user: "user",
  maxTokens: 512,
};

test("never sends nvext: both NVIDIA endpoints reject the field with a 400", () => {
  const body = buildChatBody(nvidia, req, schema, true);
  assert.equal("nvext" in body, false);
  assert.ok(body.response_format, "guided output still uses response_format");
});

test("reasoningMode disabled turns thinking off", () => {
  const body = buildChatBody(
    nvidia,
    { ...req, reasoningMode: "disabled" },
    schema,
    false,
  );
  assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
});

test("reasoningMode high asks for thinking with a budget", () => {
  const body = buildChatBody(
    nvidia,
    { ...req, reasoningMode: "high" },
    schema,
    false,
  );
  assert.deepEqual(body.chat_template_kwargs, {
    enable_thinking: true,
    thinking_budget: 4096,
  });
});

test("forceThinkingDisabled overrides a caller asking for high reasoning", () => {
  const body = buildChatBody(
    { ...nvidia, forceThinkingDisabled: true },
    { ...req, reasoningMode: "high" },
    schema,
    false,
  );
  assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
});

test("a provider without Nemotron reasoning gets no chat_template_kwargs", () => {
  const body = buildChatBody(
    {
      model: "nemotron-3-nano-30b",
      maxTokensParam: "max_completion_tokens" as const,
      supportsNemotronReasoning: false,
      forceThinkingDisabled: false,
    },
    { ...req, reasoningMode: "high" },
    schema,
    false,
  );
  assert.equal("chat_template_kwargs" in body, false);
  assert.equal(body.max_completion_tokens, 512);
});
