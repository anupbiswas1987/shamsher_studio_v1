import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CALENDAR_DAY_INITIAL_VALUES, composeCalendarDayPrompt, composeCalendarDayScenePrompt, parseCalendarDayImport, exportCalendarDayJson } from '../src/calendar-day.js';
import { SMART_CAMPAIGN_DEFAULTS, SCENE_FIELDS, composeSmartCampaignPrompt } from '../src/smart-campaign.js';
const master = await readFile(new URL('../public/resources/Smartness_Awareness_Master_Prompt_V3.md', import.meta.url), 'utf8');
const values = { ...CALENDAR_DAY_INITIAL_VALUES, ...Object.fromEntries(SCENE_FIELDS.map(key => [key, SMART_CAMPAIGN_DEFAULTS[key]])), date: '2026-12-16', occasion: 'Victory Day', title_tagline: 'বিজয়ের আনন্দ সবার', targetedInfo: 'সবার পাশে দাঁড়ান', finalCta: 'আজ একটি ভালো কাজ করুন' };
test('calendar prompts include date, occasion, and renamed title without the legacy field', () => {
  const prompt = composeCalendarDayPrompt(master, values);
  assert.ok(prompt.includes('DATE\n2026-12-16'));
  assert.ok(prompt.includes('OCCASION\nVictory Day'));
  assert.ok(prompt.includes('TITLE_TAGLINE\nবিজয়ের আনন্দ সবার'));
  assert.ok(!prompt.includes('TAGLINE_QUESTION'));
  assert.ok(!prompt.includes('[TITLE_TAGLINE]'));
  const scene = composeCalendarDayScenePrompt(values);
  assert.ok(scene.includes('"title_tagline": "বিজয়ের আনন্দ সবার"'));
  assert.ok(scene.includes('"date": "2026-12-16"'));
  assert.ok(scene.includes('"occasion": "Victory Day"'));
  assert.ok(!scene.includes('taglineQuestion'));
});
test('calendar sessions round trip all settings and omit taglineQuestion', () => {
  const json = exportCalendarDayJson(values);
  assert.equal(JSON.parse(json).type, 'calendar-day');
  assert.ok(!json.includes('taglineQuestion'));
  assert.deepEqual(parseCalendarDayImport(json), values);
  assert.deepEqual(parseCalendarDayImport('{"date":"2026-12-16","occasion":"Victory Day"}'), { date: values.date, occasion: values.occasion });
  assert.equal(parseCalendarDayImport('{"taglineQuestion":"Legacy title"}').title_tagline, 'Legacy title');
});
test('calendar validation rejects impossible dates and missing required context', () => {
  for (const date of ['2026-02-30', '2026-13-01', '12/16/2026', '']) assert.throws(() => composeCalendarDayPrompt(master, { ...values, date }), /valid calendar date/);
  assert.throws(() => composeCalendarDayScenePrompt({ ...values, occasion: '' }), /occasion/);
  assert.throws(() => composeCalendarDayPrompt(master, { ...values, title_tagline: '' }), /title/);
  assert.throws(() => parseCalendarDayImport('{"date":"2026-02-30"}'), /valid calendar date/);
  assert.throws(() => parseCalendarDayImport('{"title_tagline":42}'), /Invalid value/);
  assert.throws(() => parseCalendarDayImport('{"type":"calendar-day","version":2,"values":{}}'), /version/);
});
test('scene-only import preserves calendar context and shared scene validation', () => {
  const scene = Object.fromEntries(['location', 'crowdDetails', 'peopleType', 'sceneDetails', 'mainIncident', 'shomserAction', 'supportingReactions', 'directorNotes'].map(key => [key, values[key]]));
  assert.deepEqual(parseCalendarDayImport(JSON.stringify({ ...scene, date: values.date, title_tagline: 'Updated headline' }), true), { ...scene, title_tagline: 'Updated headline' });
  assert.throws(() => parseCalendarDayImport('{"location":"Park"}', true), /all eight/);
});

test('imports sample envelope, rich clipboard artifacts, and tagline alias', () => {
  const sample = {
    date: '2026-11-13', occasion: 'World Kindness Day', type: 'calendar-day', version: 1,
    values: { tagline: '', fixedEnglishTagline: 'Knowing is healthy for the mind', locationPreset: 'Bus Stop', location: 'A busy public bus stop in Dhaka.' },
  };
  const escaped = JSON.stringify(sample, null, 2).split('\n').map(line => '&#x20; ' + line + '\\').join('\n');
  const imported = parseCalendarDayImport(escaped);
  assert.equal(imported.date, sample.date);
  assert.equal(imported.occasion, sample.occasion);
  assert.equal(imported.title_tagline, '');
  assert.equal(imported.fixedEnglishTagline, sample.values.fixedEnglishTagline);
  assert.equal(imported.locationPreset, 'Custom Location');
  assert.equal(imported.location, sample.values.location);
  assert.equal(parseCalendarDayImport(JSON.stringify({ ...sample, values: { ...sample.values, title_tagline: 'Canonical title', date: '2026-11-14' } })).title_tagline, 'Canonical title');
  assert.equal(parseCalendarDayImport(JSON.stringify({ ...sample, values: { date: '2026-11-14' } })).date, '2026-11-14');
  const exported = JSON.parse(exportCalendarDayJson({ ...values, ...imported }));
  assert.equal(exported.date, sample.date);
  assert.equal(exported.occasion, sample.occasion);
  assert.equal(exported.values.title_tagline, '');
  assert.ok(!Object.hasOwn(exported.values, 'date'));
});

test('extended scene JSON applies title, targeted message, and CTA with legacy scene compatibility', () => {
  const scene = Object.fromEntries(['location', 'crowdDetails', 'peopleType', 'sceneDetails', 'mainIncident', 'shomserAction', 'supportingReactions', 'directorNotes'].map(key => [key, values[key]]));
  const additions = { title_tagline: 'সবার পাশে থাকুন', finalCta: 'আজ ভালো কাজ করুন', targetedInfo: 'অন্যের কথা ভাবুন' };
  assert.deepEqual(parseCalendarDayImport(JSON.stringify({ ...scene, ...additions }), true), { ...scene, ...additions });
  const prompt = composeCalendarDayScenePrompt(values);
  for (const field of Object.keys(additions)) assert.ok(prompt.includes(`"${field}": ""`));
  assert.ok(!prompt.includes('taglineQuestion'));
  assert.deepEqual(parseCalendarDayImport(JSON.stringify(scene), true), scene);
  assert.throws(() => parseCalendarDayImport(JSON.stringify({ ...scene, finalCta: 42 }), true), /Invalid value/);
});

test('Calendar Day scene generation allows a blank title and requests a generated title', () => {
  const blank = { ...values, title_tagline: '' };
  const scene = composeCalendarDayScenePrompt(blank);
  assert.ok(scene.includes('Generate a suitable Bengali title_tagline'));
  assert.ok(scene.includes('"title_tagline": ""'));
  assert.ok(scene.includes(values.date));
  assert.ok(scene.includes(values.occasion));
  assert.throws(() => composeCalendarDayPrompt(master, blank), /title/);
});

test('fresh Calendar Day generates a complete scene prompt from date and occasion only', () => {
  const fresh = { ...CALENDAR_DAY_INITIAL_VALUES, date: '2026-11-13', occasion: 'World Kindness Day' };
  const prompt = composeCalendarDayScenePrompt(fresh);
  assert.ok(prompt.includes('Generate a suitable Bengali title_tagline, targetedInfo, and finalCta for each blank field'));
  assert.ok(prompt.includes('"targetedInfo": ""'));
  assert.ok(prompt.includes('"finalCta": ""'));
  assert.ok(prompt.includes(fresh.date));
  assert.ok(prompt.includes(fresh.occasion));
  assert.throws(() => composeCalendarDayScenePrompt({ ...fresh, occasion: '' }), /occasion/);
  assert.throws(() => composeCalendarDayScenePrompt({ ...fresh, date: '' }), /date/);
});

test('scene campaign context includes the current fixed English tagline and Bengali intro', () => {
  const current = { ...values, fixedEnglishTagline: 'Knowing is healthy for the mind', fixedIntro: 'গুজব নয়, সঠিক জানা ও সচেতনতা সমাজের পক্ষে স্বাস্থ্যকর।' };
  const prompt = composeCalendarDayScenePrompt(current);
  const context = JSON.parse(prompt.split('Campaign context:\n\n')[1]);
  assert.equal(context.fixedEnglishTagline, current.fixedEnglishTagline);
  assert.equal(context.fixedIntro, current.fixedIntro);
  const edited = composeCalendarDayScenePrompt({ ...current, fixedEnglishTagline: 'Custom English tagline', fixedIntro: 'নিজস্ব পরিচিতি' });
  const editedContext = JSON.parse(edited.split('Campaign context:\n\n')[1]);
  assert.equal(editedContext.fixedEnglishTagline, 'Custom English tagline');
  assert.equal(editedContext.fixedIntro, 'নিজস্ব পরিচিতি');
});

test('Calendar Day uses the supplied educational story template and complete current context', () => {
  const current = { ...CALENDAR_DAY_INITIAL_VALUES, date: '2026-11-13', occasion: 'World Kindness Day', directorNotes: 'Include a curious student.', canvas: 'story' };
  const prompt = composeCalendarDayScenePrompt(current);
  assert.ok(prompt.startsWith('# CALENDAR DAY STORY & SCENE GENERATOR'));
  for (const section of ['RECOGNIZE', 'REMEMBER', 'LEARN', 'FACTUAL ACCURACY', 'SHOMSER CHARACTER IDENTITY', 'SUPPORTING CHARACTERS']) assert.ok(prompt.includes(section));
  assert.ok(prompt.includes('Distinct curled moustache.'));
  assert.ok(!prompt.includes('Keep primary content within')); 
  assert.ok(!prompt.includes('[FIXED_ENGLISH_TAGLINE]'));
  const schema = JSON.parse(prompt.match(/```json\s*(\{[\s\S]*?\})/)[1]);
  assert.equal(Object.keys(schema).length, 14);
  assert.deepEqual(Object.keys(schema), ['location', 'crowdDetails', 'peopleType', 'sceneDetails', 'mainIncident', 'shomserAction', 'supportingReactions', 'directorNotes', 'title_tagline', 'fixedEnglishTagline', 'fixedIntro', 'finalCta', 'targetedInfo', 'shomserDialogue']);
  const context = JSON.parse(prompt.split('Campaign context:\n\n')[1]);
  assert.deepEqual(context, current);
});

test('13-field scene responses import while preserving the current fixed campaign identity', () => {
  const response = Object.fromEntries(['location', 'crowdDetails', 'peopleType', 'sceneDetails', 'mainIncident', 'shomserAction', 'supportingReactions', 'directorNotes', 'title_tagline', 'fixedEnglishTagline', 'fixedIntro', 'finalCta', 'targetedInfo'].map(key => [key, values[key]]));
  assert.deepEqual(parseCalendarDayImport(JSON.stringify(response), true, values), response);
  for (const key of ['fixedEnglishTagline', 'fixedIntro']) {
    assert.throws(() => parseCalendarDayImport(JSON.stringify({ ...response, [key]: 'Unexpected replacement' }), true, values), /Preserve the supplied fixed text/);
    assert.throws(() => parseCalendarDayImport(JSON.stringify({ ...response, [key]: 123 }), true, values), /Invalid value/);
  }
  const edited = { ...values, fixedIntro: 'নিজস্ব পরিচিতি', fixedEnglishTagline: 'Custom exact tagline $&' };
  const prompt = composeCalendarDayScenePrompt(edited);
  assert.ok(prompt.includes(edited.fixedIntro));
  assert.ok(prompt.includes(edited.fixedEnglishTagline));
  assert.deepEqual(parseCalendarDayImport(JSON.stringify({ ...response, fixedIntro: edited.fixedIntro, fixedEnglishTagline: edited.fixedEnglishTagline }), true, edited), { ...response, fixedIntro: edited.fixedIntro, fixedEnglishTagline: edited.fixedEnglishTagline });
});


test('Calendar Day V2 dialogue imports, validates, exports, and reaches the poster prompt', () => {
  const shomserDialogue = 'ভালো কাজেই মনের আলো জ্বলে!';
  const current = { ...values, shomserDialogue };
  assert.equal(parseCalendarDayImport(JSON.stringify({ shomserDialogue })).shomserDialogue, shomserDialogue);
  assert.deepEqual(parseCalendarDayImport(exportCalendarDayJson(current)), current);
  const scene = Object.fromEntries(SCENE_FIELDS.map(key => [key, values[key]]));
  assert.equal(parseCalendarDayImport(JSON.stringify({ ...scene, shomserDialogue }), true).shomserDialogue, shomserDialogue);
  for (const value of [42, null, {}, 'x'.repeat(20001)]) {
    assert.throws(() => parseCalendarDayImport(JSON.stringify({ shomserDialogue: value })), /Invalid value/);
  }
  assert.ok(composeCalendarDayPrompt(master, current).includes(`SHOMSER_DIALOGUE\n${shomserDialogue}`));
  assert.ok(composeCalendarDayPrompt(master, current).includes('one speech bubble'));
  assert.ok(composeCalendarDayScenePrompt(current).includes('exactly the 14 string fields'));
});

test('Calendar Day screenplay matches the supplied V2 resource', async () => {
  const resource = await readFile(new URL('../public/resources/Shamsher_Dinponji_Screenplay_Generator_V2.md', import.meta.url), 'utf8');
  assert.ok(composeCalendarDayScenePrompt(values).startsWith(resource.split('### 14.')[0].trimEnd()));
});


test('Calendar Day final poster adds 20 px clearance and protects complete logos and footers', () => {
  for (const [canvas, safeArea, oldArea] of [
    ['feed', 'X = 100–980, Y = 100–1250', 'X = 80–1000, Y = 80–1270'],
    ['square', 'X = 128–952, Y = 65–1015', 'X = 108–972, Y = 45–1035'],
    ['story', 'X = 100–980, Y = 305–1615', 'X = 80–1000, Y = 285–1635'],
  ]) {
    const prompt = composeCalendarDayPrompt(master, { ...values, canvas });
    assert.ok(prompt.includes(`Primary content safe area: ${safeArea}`));
    assert.ok(!prompt.includes(oldArea));
    assert.ok(prompt.includes('### HEADER PROTECTION'));
    assert.ok(prompt.includes('### FOOTER PROTECTION'));
    assert.ok(prompt.includes('### Logo and footer crop validation'));
    assert.ok(prompt.includes(`Logo bounding box must remain entirely within ${safeArea}`));
    assert.ok(prompt.includes(`Footer CTA and decorations must remain entirely within ${safeArea}`));
    assert.ok(prompt.includes('The 20 px additional margin is mandatory for every poster.'));
  }
  const feed = composeCalendarDayPrompt(master, values);
  assert.ok(feed.includes('Start the complete logo artwork at Y >= 120'));
  assert.ok(feed.includes('at least 120 px from the left canvas edge'));
  assert.ok(feed.includes('Target logo width: approximately 140–160 px'));
  assert.ok(feed.includes('must end at Y <= 1210'));
  assert.ok(!feed.includes('Top ~20%'));
  assert.ok(feed.includes('### PRIORITY RULE')); 
  assert.ok(feed.includes('Keep at least 140 px between the bottom of the CTA and the canvas edge')); 
});


test('all active final prompt workflows require adaptive art direction without fixed styling conflicts', () => {
  const prompts = [composeCalendarDayPrompt(master, values), composeSmartCampaignPrompt(master, { ...values, taglineQuestion: values.title_tagline })];
  for (const prompt of prompts) {
    assert.ok(prompt.includes('ADAPTIVE VISUAL DESIGN RULE — MANDATORY'));
    assert.ok(prompt.includes('Every poster must have an independently developed visual art direction.'));
    assert.ok(prompt.includes('Maintain brand recognition through Shomser'));
    for (const conflict of ['centered on a yellow brush-stroke banner', 'Bottom maroon CTA ribbon', 'Palette: cream, maroon', 'retain the cream, maroon', '**Top ~20%:**', '**Lower ~25%:**', 'compact cream highlight']) {
      assert.ok(!prompt.includes(conflict), conflict);
    }
    assert.ok(prompt.includes('cream panjabi'));
    assert.ok(prompt.includes('maroon scarf'));
  }
  assert.ok(prompts[0].includes('ribbon is optional'));
  assert.ok(prompts[0].includes('Y <= 1210'));
});
