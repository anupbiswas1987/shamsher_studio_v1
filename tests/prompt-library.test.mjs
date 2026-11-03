import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterPromptTemplates,
  PROMPT_CATEGORIES,
  PROMPT_TEMPLATES,
} from "../src/prompt-library.js";

test("prompt library includes usable templates and matching categories", () => {
  assert.equal(PROMPT_TEMPLATES.length, 8);
  assert.equal(PROMPT_CATEGORIES[0], "All");
  assert.deepEqual(
    PROMPT_CATEGORIES.slice(1),
    [...new Set(PROMPT_TEMPLATES.map(({ category }) => category))],
  );
  assert.ok(PROMPT_TEMPLATES.every(({ id, title, text }) => id && title && text));
});

test("filters prompt templates by category and case-insensitive search", () => {
  assert.equal(filterPromptTemplates().length, PROMPT_TEMPLATES.length);
  assert.deepEqual(
    filterPromptTemplates(" forest ").map(({ id }) => id),
    ["forest-morning"],
  );
  assert.deepEqual(
    filterPromptTemplates("vertical 9:16", "Nature").map(({ id }) => id),
    ["forest-morning"],
  );
  assert.deepEqual(filterPromptTemplates("missing prompt"), []);
});
