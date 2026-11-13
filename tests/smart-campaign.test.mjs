import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAMPAIGN_CANVASES,
  composeSmartCampaignPrompt,
  SMART_CAMPAIGN_DEFAULTS,
} from "../src/smart-campaign.js";

const masterPrompt = await readFile(
  new URL("../public/resources/Smartness_Awareness_Master_Prompt_V3.md", import.meta.url),
  "utf8",
);

function createValues(overrides = {}) {
  return {
    ...SMART_CAMPAIGN_DEFAULTS,
    headlineScale: 100,
    lineCount: "2",
    taglineLineBreak: "",
    canvas: "feed",
    ...overrides,
  };
}

test("composes the master prompt with current defaults and removes the sample scenario", () => {
  const prompt = composeSmartCampaignPrompt(
    masterPrompt,
    createValues({
      location: "A neighborhood park in Dhaka during late afternoon.",
      crowdDetails: "Light crowd; a few families are walking along the path.",
      peopleType: "Local families and university students in everyday clothing.",
      sceneDetails: "Shaded trees, park benches, a walking path, and warm afternoon light.",
      mainIncident: "A visitor leaves a food wrapper on a public bench.",
      shomserAction: "Shomser gently gestures toward the nearby litter bin.",
      supportingReactions: "A nearby family notices and appreciates the considerate reminder.",
    }),
  );

  assert.ok(prompt.includes(SMART_CAMPAIGN_DEFAULTS.taglineQuestion));
  assert.ok(prompt.includes("A visitor leaves a food wrapper on a public bench."));
  assert.ok(prompt.includes("Smartness is a Habit, Not a Show!"));
  assert.ok(prompt.includes("Exact 1080 × 1350 4:5 portrait canvas"));
  assert.ok(!prompt.includes("Interior of a typical Bangladeshi public bus"));
  assert.ok(!prompt.includes("[TAGLINE_QUESTION]"));
  assert.ok(!prompt.includes("[LOCATION]"));
  assert.ok(prompt.includes("Character continuity: curly black hair"));
  assert.ok(prompt.includes("user-supplied canonical logo artwork"));
});

test("uses custom text, typography, manual line breaks, and square canvas settings", () => {
  const values = createValues({
    taglineQuestion: "আপনি কি অন্যের কথা ভাবেন?",
    targetedInfo: "Custom Bengali awareness message.",
    location: "A quiet community reading room in Chattogram.",
    crowdLevel: "Light",
    crowdDetails: "Three visitors are reading quietly.",
    peopleType: "Local visitors studying quietly in everyday clothing.",
    sceneDetails: "Bookshelves, shared study tables, task lights, and quiet library ambience.",
    mainIncident: "A visitor takes a call at a high volume inside the reading room.",
    shomserAction: "Shomser politely reminds the visitor to keep their voice low.",
    supportingReactions: "Nearby readers return to their books as the visitor lowers their voice.",
    headlineScale: 125,
    lineCount: "2",
    taglineLineBreak: "আপনি কি\nঅন্যের কথা ভাবেন?",
    canvas: "square",
  });
  const prompt = composeSmartCampaignPrompt(masterPrompt, values);

  assert.ok(prompt.includes("Custom Bengali awareness message."));
  assert.ok(prompt.includes("A quiet community reading room in Chattogram."));
  assert.ok(prompt.includes("Relative font-size scale: 125%"));
  assert.ok(!prompt.includes(SMART_CAMPAIGN_DEFAULTS.taglineQuestion));
  assert.ok(prompt.includes("Maximum line count: 2."));
  assert.ok(prompt.includes("আপনি কি\nঅন্যের কথা ভাবেন?"));
  assert.ok(prompt.includes(`exactly ${CAMPAIGN_CANVASES.square.width} × ${CAMPAIGN_CANVASES.square.height} pixels`));
  assert.ok(prompt.includes(CAMPAIGN_CANVASES.square.safeArea));
  assert.ok(prompt.toLowerCase().includes("compose natively"));
  assert.ok(!prompt.includes("Exact 1080 × 1350 4:5 canvas"));
  assert.ok(!prompt.includes("public bus travelling through Dhaka"));
});

test("uses Reel/Story-specific canvas and safe-area instructions", () => {
  const prompt = composeSmartCampaignPrompt(masterPrompt, createValues({ canvas: "story" }));
  assert.ok(prompt.includes("1080 × 1920 pixels, 9:16 portrait"));
  assert.ok(prompt.includes(CAMPAIGN_CANVASES.story.safeArea));
  assert.ok(prompt.includes("Redesign the poster layout natively for vertical Reel/Story UI"));
});

test("rejects incomplete content, unsupported canvases, and invalid typography settings", () => {
  assert.throws(
    () => composeSmartCampaignPrompt(masterPrompt, createValues({ taglineQuestion: " " })),
    /Complete all required/,
  );
  assert.throws(
    () => composeSmartCampaignPrompt(masterPrompt, createValues({ canvas: "poster" })),
    /supported canvas/,
  );
  assert.throws(
    () => composeSmartCampaignPrompt(masterPrompt, createValues({ headlineScale: 151 })),
    /between 50% and 150%/,
  );
  assert.throws(
    () => composeSmartCampaignPrompt(masterPrompt, createValues({ lineCount: "3" })),
    /one-line or two-line/,
  );
  assert.throws(
    () =>
      composeSmartCampaignPrompt(
        masterPrompt,
        createValues({ lineCount: "1", taglineLineBreak: "First line\nSecond line" }),
      ),
    /exceeds the selected headline line count/,
  );
});

test("scene prompts preserve campaign context and request importable JSON", async () => {
  const { composeScenePrompt, CAMPAIGN_INITIAL_VALUES, SCENE_FIELDS } = await import('../src/smart-campaign.js');
  const prompt = composeScenePrompt({ ...CAMPAIGN_INITIAL_VALUES, targetedInfo: SMART_CAMPAIGN_DEFAULTS.targetedInfo });
  assert.ok(prompt.includes(CAMPAIGN_INITIAL_VALUES.taglineQuestion));
  for (const key of SCENE_FIELDS) assert.ok(prompt.includes(`"${key}"`));
  assert.throws(() => composeScenePrompt({ ...CAMPAIGN_INITIAL_VALUES, targetedInfo: '' }), /targeted message/);
});

test("campaign JSON round trips all settings and safely imports ChatGPT scenes", async () => {
  const { parseCampaignImport, exportCampaignJson, CAMPAIGN_INITIAL_VALUES, SCENE_FIELDS } = await import('../src/smart-campaign.js');
  const values = { ...CAMPAIGN_INITIAL_VALUES, headlineScale: 120, canvas: 'story', directorNotes: '' };
  assert.deepEqual(parseCampaignImport(exportCampaignJson(values)), values);
  const scene = Object.fromEntries(SCENE_FIELDS.map(key => [key, values[key]]));
  assert.deepEqual(parseCampaignImport('```json\n' + JSON.stringify({ ...scene, taglineQuestion: 'overwrite', unknown: 'ignored' }) + '\n```', true), scene);
  assert.throws(() => parseCampaignImport('{'), /Invalid JSON/);
  assert.throws(() => parseCampaignImport('[]'), /object/);
  assert.throws(() => parseCampaignImport('{"canvas":"bad"}'), /canvas/);
  assert.throws(() => parseCampaignImport('{"headlineScale":"100"}'), /Invalid value/);
  assert.throws(() => parseCampaignImport('{"headlineScale":200}'), /between/);
  assert.throws(() => parseCampaignImport('{"location":"Park"}', true), /eight scene fields/);
});

test("imports rich-text JSON artifacts while preserving valid escapes and text", async () => {
  const { parseCampaignImport, CAMPAIGN_INITIAL_VALUES, SCENE_FIELDS } = await import('../src/smart-campaign.js');
  const scene = Object.fromEntries(SCENE_FIELDS.map(key => [key, CAMPAIGN_INITIAL_VALUES[key]]));
  scene.directorNotes = 'Keep "natural" lighting.\nPath C:\\references; literal &#x20;';
  const json = JSON.stringify(scene, null, 2);
  assert.deepEqual(parseCampaignImport(json, true), scene);
  assert.deepEqual(parseCampaignImport(JSON.stringify(json), true), scene);
  // Reproduce markdown hard-break backslashes and HTML indentation from a rich-text paste.
  const rich = json.replace(/\n/g, '\\\\\\\n').replace(/^  /gm, '&#x20; ');
  assert.deepEqual(parseCampaignImport(rich, true), scene);
  assert.throws(() => parseCampaignImport('{"location": broken}', true), /Invalid JSON/);
});

test("imports custom location presets and normalizes known preset names", async () => {
  const { parseCampaignImport } = await import('../src/smart-campaign.js');
  assert.deepEqual(parseCampaignImport(JSON.stringify({ locationPreset: ' metro rail ' })), {
    locationPreset: 'Metro Rail',
  });
  assert.deepEqual(parseCampaignImport(JSON.stringify({ locationPreset: 'Hospital', location: 'A hospital waiting room in Dhaka.' })), {
    locationPreset: 'Custom Location', location: 'A hospital waiting room in Dhaka.',
  });
  assert.deepEqual(parseCampaignImport(JSON.stringify({ locationPreset: 'Hospital' })), {
    locationPreset: 'Custom Location', location: 'Hospital',
  });
  assert.deepEqual(parseCampaignImport(JSON.stringify({ locationPreset: '' })), {
    locationPreset: 'Custom Location',
  });
  assert.throws(() => parseCampaignImport('{"locationPreset":42}'), /Invalid value/);
});

test("imports common crowd level names while rejecting unsupported values", async () => {
  const { parseCampaignImport } = await import('../src/smart-campaign.js');
  for (const [input, expected] of [['Low', 'Light'], ['medium', 'Moderate'], ['HIGH', 'Heavy'], [' Light ', 'Light'], ['Custom', 'Custom']]) {
    assert.equal(parseCampaignImport(JSON.stringify({ crowdLevel: input })).crowdLevel, expected);
  }
  assert.throws(() => parseCampaignImport('{"crowdLevel":"unknown"}'), /Unsupported crowd level/);
  assert.throws(() => parseCampaignImport('{"crowdLevel":"__proto__"}'), /Unsupported crowd level/);
});

test("scene imports include environment settings without replacing campaign text", async () => {
  const { parseCampaignImport, CAMPAIGN_INITIAL_VALUES, SCENE_FIELDS } = await import('../src/smart-campaign.js');
  const scene = Object.fromEntries(SCENE_FIELDS.map(key => [key, CAMPAIGN_INITIAL_VALUES[key]]));
  const result = parseCampaignImport(JSON.stringify({ type: 'smart-campaign', version: 1, values: {
    ...scene, locationPreset: 'Home / Bedroom', crowdLevel: 'Low', taglineQuestion: 'Do not overwrite', canvas: 'story',
  } }), true);
  assert.deepEqual(result, { ...scene, locationPreset: 'Custom Location', crowdLevel: 'Light' });
});

test("formatting preserves complete campaign and scene JSON without extracting fields", async () => {
  const { formatCampaignJson, exportCampaignJson, CAMPAIGN_INITIAL_VALUES } = await import('../src/smart-campaign.js');
  const campaign = JSON.parse(exportCampaignJson(CAMPAIGN_INITIAL_VALUES));
  campaign.extraMetadata = { title: 'Keep this metadata' };
  const compact = JSON.stringify(campaign);
  assert.equal(formatCampaignJson(compact), JSON.stringify(campaign, null, 2));
  assert.deepEqual(JSON.parse(formatCampaignJson(compact)), campaign);
  const partialScene = { location: 'Bedroom', unknownField: 'Preserved', directorNotes: 'Line one\nLine two' };
  assert.deepEqual(JSON.parse(formatCampaignJson(JSON.stringify(partialScene))), partialScene);
  assert.deepEqual(JSON.parse(formatCampaignJson('```json\n' + compact + '\n```')), campaign);
  assert.throws(() => formatCampaignJson('{'), /Invalid JSON/);
});
