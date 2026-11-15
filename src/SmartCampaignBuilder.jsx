import React, { useEffect, useRef, useState } from "react";
import CalendarDateField from "./CalendarDateField.jsx";
import {
  CAMPAIGN_INITIAL_VALUES,
  composeScenePrompt,
  parseCampaignImport,
  exportCampaignJson,
  formatCampaignJson,
  CAMPAIGN_CANVASES,
  CAMPAIGN_LOCATIONS,
  composeSmartCampaignPrompt,
  SMART_CAMPAIGN_DEFAULTS,
} from "./smart-campaign.js";

import {
  CALENDAR_DAY_INITIAL_VALUES,
  composeCalendarDayPrompt,
  composeCalendarDayScenePrompt,
  parseCalendarDayImport,
  exportCalendarDayJson,
} from "./calendar-day.js";

const LOCATION_PRESETS = {
  "Public Bus": SMART_CAMPAIGN_DEFAULTS.location,
  "Metro Rail":
    "Interior of a modern Dhaka metro rail carriage during regular service, with metro seating, handrails, route signage, and a view of the city through the windows.",
  Train:
    "Inside a Bangladesh intercity train carriage, with realistic seats, windows, luggage racks, and a view of the countryside or railway surroundings.",
  "Public Park":
    "A public park in Bangladesh with shaded walking paths, greenery, benches, families, and a believable everyday community atmosphere.",
  "University Campus":
    "A Bangladeshi university campus with students, academic buildings, trees, and a relaxed campus setting.",
  "Shopping Mall":
    "Inside a contemporary shopping mall in Bangladesh, with storefronts, polished walkways, natural visitor flow, and locally believable details.",
  "Public Market":
    "A busy Bangladeshi public market with local stalls, produce or everyday goods, narrow walkways, and believable shoppers and vendors.",
  "Roadside Tea Stall":
    "A familiar roadside tea stall in Bangladesh with a small counter, tea glasses, stools, street-side activity, and a welcoming everyday atmosphere.",
  Restaurant:
    "Inside a casual Bangladeshi restaurant with dining tables, local details, staff, and a comfortable public dining atmosphere.",
  Library:
    "A quiet Bangladeshi public or university library with bookshelves, study tables, reading lights, and respectful study activity.",
  "Street / Footpath":
    "A Bangladesh city street and footpath with pedestrians, street-side details, and credible urban activity.",
  "Custom Location": "",
};

const CROWD_PRESETS = {
  Light: "Light crowd; a few people with generous open space around the main action.",
  Moderate: SMART_CAMPAIGN_DEFAULTS.crowdDetails,
  Heavy: "Heavily crowded public setting; show a dense but believable crowd without obscuring the main action or faces.",
  Custom: "",
};

const MASTER_PROMPT_URL = `${import.meta.env.BASE_URL}resources/Smartness_Awareness_Master_Prompt_V3.md`;

function TextField({ id, label, value, onChange, multiline = false, ...props }) {
  const Control = multiline ? "textarea" : "input";
  return (
    <label className="smart-campaign-field" htmlFor={id}>
      <span>{label}</span>
      <Control
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      />
    </label>
  );
}

function SelectField({ id, label, value, options, onChange }) {
  return (
    <label className="smart-campaign-field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function SmartCampaignBuilder({ calendarDay = false, workflowId, initialState, onStateChange, onNotify }) {
  const headlineKey = calendarDay ? "title_tagline" : "taglineQuestion";
  const [values, setValues] = useState(() => ({ ...(calendarDay ? CALENDAR_DAY_INITIAL_VALUES : CAMPAIGN_INITIAL_VALUES), ...initialState?.values }));
  const [fixedTextUnlocked, setFixedTextUnlocked] = useState(initialState?.fixedTextUnlocked ?? false);
  const [masterPrompt, setMasterPrompt] = useState("");
  const [masterError, setMasterError] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState(initialState?.generatedPrompt ?? "");
  const [feedback, setFeedbackState] = useState(initialState?.feedback ?? null);
  const [scenePrompt, setScenePrompt] = useState(initialState?.scenePrompt ?? "");
  const [copiedPrompt, setCopiedPrompt] = useState(initialState?.copiedPrompt ?? null);
  const [importText, setImportText] = useState(initialState?.importText ?? "");
  const [sceneImportText, setSceneImportText] = useState(initialState?.sceneImportText ?? "");
  const environmentSection = useRef(null);
  const storytellingSection = useRef(null);

  // Keep every workflow's fields and generated/imported content in its own
  // parent-owned snapshot. Only the active builder mounts, so field IDs stay unique.
  useEffect(() => {
    onStateChange?.(workflowId, {
      values, fixedTextUnlocked, generatedPrompt, feedback, scenePrompt,
      copiedPrompt, importText, sceneImportText,
    });
  }, [workflowId, onStateChange, values, fixedTextUnlocked, generatedPrompt,
    feedback, scenePrompt, copiedPrompt, importText, sceneImportText]);

  useEffect(() => {
    let active = true;
    fetch(MASTER_PROMPT_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`The master prompt could not be loaded (HTTP ${response.status}).`);
        }
        return response.text();
      })
      .then((text) => {
        if (!text.trim()) throw new Error("The master prompt file is empty.");
        if (active) {
          setMasterPrompt(text);
          setMasterError("");
        }
      })
      .catch((error) => {
        if (active) {
          setMasterError(
            error instanceof Error
              ? error.message
              : "The master prompt could not be loaded. Check the file and try again.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function setFeedback(next) {
    if (next && onNotify) {
      onNotify(next.message, next.type);
      setFeedbackState(null);
    } else {
      setFeedbackState(next);
    }
  }

  function updateValue(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    setGeneratedPrompt("");
    setScenePrompt("");
    setFeedback(null);
  }

  function selectLocationPreset(preset) {
    setValues((current) => ({
      ...current,
      locationPreset: preset,
      location: LOCATION_PRESETS[preset],
      ...(preset !== "Public Bus"
        ? {
            peopleType:
              current.peopleType === SMART_CAMPAIGN_DEFAULTS.peopleType ? "" : current.peopleType,
            sceneDetails:
              current.sceneDetails === SMART_CAMPAIGN_DEFAULTS.sceneDetails
                ? ""
                : current.sceneDetails,
            mainIncident:
              current.mainIncident === SMART_CAMPAIGN_DEFAULTS.mainIncident
                ? ""
                : current.mainIncident,
            shomserAction:
              current.shomserAction === SMART_CAMPAIGN_DEFAULTS.shomserAction
                ? ""
                : current.shomserAction,
            supportingReactions:
              current.supportingReactions === SMART_CAMPAIGN_DEFAULTS.supportingReactions
                ? ""
                : current.supportingReactions,
          }
        : {}),
    }));
    setGeneratedPrompt("");
    setFeedback({
      type: "success",
      message:
        "Location updated. Review the people, environment, and storytelling details for this setting.",
    });
  }

  function generatePrompt() {
    setFeedback(null);
    try {
      const prompt = (calendarDay ? composeCalendarDayPrompt : composeSmartCampaignPrompt)(masterPrompt, values);
      setGeneratedPrompt(prompt);
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not generate the prompt. Review the required fields and try again.",
      });
    }
  }

  function resetCalendarDay() {
    setValues({ ...CALENDAR_DAY_INITIAL_VALUES });
    setFixedTextUnlocked(false);
    setGeneratedPrompt("");
    setScenePrompt("");
    setCopiedPrompt(null);
    setImportText("");
    setSceneImportText("");
    setFeedback({ type: "success", message: "Calendar Day reset to defaults. Choose a date and occasion to start again." });
  }

  function generateScene() {
    try {
      setScenePrompt((calendarDay ? composeCalendarDayScenePrompt : composeScenePrompt)(values));
      setCopiedPrompt(null);
      setFeedback({ type: "success", message: "Scene prompt ready. Copy it into ChatGPT, then paste its JSON response below." });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    }
  }

  function importJson(text, sceneOnly = false, source = "import") {
    try {
      const imported = (calendarDay ? parseCalendarDayImport : parseCampaignImport)(text, sceneOnly, values);
      setValues((current) => ({
        ...current,
        ...(sceneOnly ? { locationPreset: "Custom Location", crowdLevel: "Custom" } : {}),
        ...imported,
      }));
      setGeneratedPrompt("");
      if (!sceneOnly) setScenePrompt("");
      if (environmentSection.current) environmentSection.current.open = true;
      if (storytellingSection.current) storytellingSection.current.open = true;
      const message = sceneOnly ? "Scene fields updated, including any supplied title / tagline, targeted message, and final CTA. Review the updated fields below." : "Campaign fields imported. Review your restored settings.";
      if (!sceneOnly && onNotify) {
        setFeedback(null);
        onNotify(message, "success");
      } else {
        setFeedback({ type: "success", location: source, message });
      }
    } catch (error) {
      setFeedback({ type: "error", location: source, message: error.message });
    }
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFeedback({ type: "info", location: "import", message: `Reading ${file.name}…` });
    try {
      if (file.size > 512000) throw new Error("Choose a JSON file smaller than 500 KB.");
      setImportText(await file.text());
      setFeedback({ type: "success", location: "import", message: `Loaded ${file.name}. Click Import campaign JSON to restore all campaign fields and settings from this file.` });
    } catch (error) {
      setFeedback({ type: "error", location: "import", message: error.message });
    }
  }

  function exportJson() {
    const url = URL.createObjectURL(new Blob([(calendarDay ? exportCalendarDayJson : exportCampaignJson)(values)], { type: "application/json;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = calendarDay ? "calendar-day.json" : "smart-campaign.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback({ type: "success", message: "Campaign JSON export started." });
  }

  function formatJson(sceneOnly = false) {
    try {
      const formatted = formatCampaignJson(sceneOnly ? sceneImportText : importText);
      if (sceneOnly) setSceneImportText(formatted);
      else setImportText(formatted);
      setFeedback({ type: "success", location: sceneOnly ? "scene" : "import", message: "JSON formatted. All JSON fields are preserved. Choose Apply scene JSON or Import campaign JSON to update the form." });
    } catch (error) {
      setFeedback({ type: "error", location: sceneOnly ? "scene" : "import", message: error.message });
    }
  }

  async function copyPrompt(text = generatedPrompt) {
    setCopiedPrompt(null);
    if (!navigator.clipboard?.writeText) {
      setFeedback({
        type: "error",
        message: "Clipboard access is unavailable. Select the generated prompt and copy it manually.",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPrompt(text);
      setFeedback({ type: "success", message: "Prompt copied to the clipboard." });
    } catch (error) {
      setFeedback({
        type: "error",
        message: `Could not copy the prompt. ${
          error instanceof Error ? error.message : "Clipboard access was denied."
        } Select the prompt text and copy it manually.`,
      });
    }
  }

  function exportPrompt() {
    try {
      const blob = new Blob([generatedPrompt], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const filename = values[headlineKey]
        .normalize("NFC")
        .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[. ]+$/g, "");
      anchor.download = `${filename || "smartness-awareness-prompt"}.md`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({ type: "success", message: "Prompt export started." });
    } catch (error) {
      setFeedback({
        type: "error",
        message: `Could not export the prompt. ${
          error instanceof Error ? error.message : "Your browser could not create the download."
        }`,
      });
    }
  }

  const locationOptions = CAMPAIGN_LOCATIONS.map((location) => ({
    value: location,
    label: location,
  }));
  const canvasOptions = Object.entries(CAMPAIGN_CANVASES);

  return (
    <div className="smart-campaign-builder">
      <div className="smart-campaign-intro">
        <div>
          <span className="smart-campaign-kicker">{calendarDay ? "CALENDAR DAY" : "SMARTNESS AWARENESS"}</span>
          <h2>{calendarDay ? "Calendar Day prompt builder" : "Campaign prompt builder"}</h2>
          <p>Configure the message and scene, then generate a production-ready image prompt.</p>
        </div>
        <span className="smart-campaign-master-badge">Master Prompt V3</span>
      </div>

      <details className="smart-campaign-section">
        <summary>Import / export JSON</summary>
        <div className="smart-campaign-section-content">
          <p className="smart-campaign-note">Save or restore the entire campaign session. Import campaign JSON updates every matching campaign field and setting. Apply scene responses separately in Generate scene.</p>
          <div className="smart-campaign-output-actions">
            <button type="button" onClick={exportJson}>Export campaign JSON</button>
            <label className="smart-campaign-field" htmlFor="campaign-json-file">
              <span>Import campaign JSON file</span>
              <input id="campaign-json-file" type="file" accept=".json,application/json" onClick={(event) => { event.currentTarget.value = ""; }} onChange={importFile} />
            </label>
          </div>
          {feedback?.location === "import" && (
            <p
              className={`smart-campaign-feedback is-${feedback.type}`}
              role={feedback.type === "error" ? "alert" : "status"}
            >
              {feedback.message}
            </p>
          )}

          <TextField id="campaign-json-input" label="Campaign session JSON" value={importText} onChange={setImportText} multiline rows={8} placeholder={calendarDay ? '{ "type": "calendar-day", "version": 1, "date": "2026-12-16", "occasion": "Victory Day", "values": { "title_tagline": "…" } }' : '{ "type": "smart-campaign", "version": 1, "values": { "taglineQuestion": "…" } }'} />
          <div className="smart-campaign-output-actions">
            <button type="button" disabled={!importText.trim()} onClick={() => formatJson()}>Format campaign JSON</button>
            <button type="button" disabled={!importText.trim()} onClick={() => importJson(importText)}>Import campaign JSON</button>
          </div>
        </div>
      </details>

      {masterError && (
        <p className="smart-campaign-feedback is-error" role="alert">
          {masterError} Confirm that the master prompt is available at{" "}
          <code>public/resources/Smartness_Awareness_Master_Prompt_V3.md</code>, then reload this page.
        </p>
      )}

      <div className="smart-campaign-form">
        <details className="smart-campaign-section" open>
          <summary>
            <span className="smart-campaign-step">01</span>
            <span>Campaign text</span>
            <span className="smart-campaign-section-hint">Exact text is preserved</span>
          </summary>
          <div className="smart-campaign-section-content">
            <div className="smart-campaign-ai-action">
              {calendarDay && (
                <button type="button" onClick={resetCalendarDay}>
                  Reset
                </button>
              )}
              <button
                type="button"
                className="smart-campaign-ai-button"
                onClick={generateScene}
              >
                Generate scene
              </button>
              <p>
                Create a prompt to copy into ChatGPT. Paste the JSON response below to fill the scene and story fields.
              </p>
            </div>
            {scenePrompt && (
              <section className="smart-campaign-output" aria-labelledby="scene-prompt-title">
                <div className="smart-campaign-output-heading">
                  <h3 id="scene-prompt-title">Prompt for ChatGPT</h3>
                  <div className="smart-campaign-output-actions">
                    <button type="button" onClick={() => copyPrompt(scenePrompt)} aria-live="polite">{copiedPrompt === scenePrompt ? "✓ Copied" : "Copy scene prompt"}</button>
                  </div>
                </div>
                <TextField id="campaign-scene-prompt" label="Copy this prompt into ChatGPT" value={scenePrompt} onChange={() => {}} multiline readOnly rows={12} />
                <TextField id="campaign-scene-json" label="Paste ChatGPT’s JSON response" value={sceneImportText} onChange={setSceneImportText} multiline rows={6} />
                <div className="smart-campaign-output-actions">
                  <button type="button" disabled={!sceneImportText.trim()} onClick={() => formatJson(true)}>Format scene JSON</button>
                  <button type="button" disabled={!sceneImportText.trim()} onClick={() => importJson(sceneImportText, true, "scene")}>Apply scene JSON</button>
                </div>
                {feedback?.location === "scene" && (
                  <p className={`smart-campaign-feedback is-${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>
                    {feedback.message}
                  </p>
                )}
              </section>
            )}
            {calendarDay && (
              <>
                <CalendarDateField value={values.date} onChange={(value) => updateValue("date", value)} />
                <TextField id="calendar-day-occasion" label="Occasion" value={values.occasion} onChange={(value) => updateValue("occasion", value)} required />
              </>
            )}
            <TextField
              id={calendarDay ? "calendar-day-title-tagline" : "campaign-tagline-question"}
              label={calendarDay ? "Title / tagline (title_tagline)" : "Main awareness question (Bengali)"}
              value={values[headlineKey]}
              onChange={(value) => updateValue(headlineKey, value)}
              multiline
              required={!calendarDay}
              rows={3}
            />
            {calendarDay && <p className="smart-campaign-note">Leave the title blank to let Generate scene suggest one.</p>}
            <div className="smart-campaign-fixed-fields">
              <TextField
                id="campaign-english-tagline"
                label="Fixed English tagline"
                value={values.fixedEnglishTagline}
                onChange={(value) => updateValue("fixedEnglishTagline", value)}
                disabled={!fixedTextUnlocked}
                required
              />
              <TextField
                id="campaign-fixed-intro"
                label="Fixed Bengali intro"
                value={values.fixedIntro}
                onChange={(value) => updateValue("fixedIntro", value)}
                disabled={!fixedTextUnlocked}
                required
              />
              <label className="smart-campaign-check">
                <input
                  type="checkbox"
                  checked={fixedTextUnlocked}
                  onChange={(event) => setFixedTextUnlocked(event.target.checked)}
                />
                <span>Unlock fixed campaign text to edit</span>
              </label>
            </div>
            <TextField
              id="campaign-targeted-info"
              label="Scenario-specific awareness message (Bengali)"
              value={values.targetedInfo}
              onChange={(value) => updateValue("targetedInfo", value)}
              multiline
              required
              rows={3}
            />
            <TextField
              id="campaign-final-cta"
              label="Final call to action (Bengali)"
              value={values.finalCta}
              onChange={(value) => updateValue("finalCta", value)}
              multiline
              required
              rows={2}
            />
          </div>
        </details>

        <details className="smart-campaign-section" ref={environmentSection}>
          <summary>
            <span className="smart-campaign-step">02</span>
            <span>Environment and people</span>
            <span className="smart-campaign-section-hint">Bangladesh-aware settings</span>
          </summary>
          <div className="smart-campaign-section-content">
            <SelectField
              id="campaign-location-preset"
              label="Location preset"
              value={values.locationPreset ?? "Public Bus"}
              options={locationOptions.map((location) => ({
                value: location.value,
                label: location.label,
              }))}
              onChange={selectLocationPreset}
            />
            <TextField
              id="campaign-location"
              label="Location description"
              value={values.location}
              onChange={(value) => updateValue("location", value)}
              multiline
              required
              rows={3}
              placeholder="Describe the location and time of day."
            />
            <SelectField
              id="campaign-crowd-level"
              label="Crowd level"
              value={values.crowdLevel}
              options={["Light", "Moderate", "Heavy", "Custom"].map((level) => ({
                value: level,
                label: level,
              }))}
              onChange={(level) => {
                setValues((current) => ({
                  ...current,
                  crowdLevel: level,
                  crowdDetails: CROWD_PRESETS[level],
                }));
                setGeneratedPrompt("");
                setFeedback(null);
              }}
            />
            <TextField
              id="campaign-crowd-details"
              label="Crowd details"
              value={values.crowdDetails}
              onChange={(value) => updateValue("crowdDetails", value)}
              multiline
              required
              rows={2}
            />
            <TextField
              id="campaign-people-type"
              label="People, age groups, attire, and social context"
              value={values.peopleType}
              onChange={(value) => updateValue("peopleType", value)}
              multiline
              required
              rows={3}
            />
            <TextField
              id="campaign-scene-details"
              label="Environmental details, lighting, objects, and atmosphere"
              value={values.sceneDetails}
              onChange={(value) => updateValue("sceneDetails", value)}
              multiline
              required
              rows={3}
            />
          </div>
        </details>

        <details className="smart-campaign-section" ref={storytellingSection}>
          <summary>
            <span className="smart-campaign-step">03</span>
            <span>Storytelling</span>
            <span className="smart-campaign-section-hint">Respectful, non-confrontational</span>
          </summary>
          <div className="smart-campaign-section-content">
            <TextField
              id="campaign-main-incident"
              label="Main incident — public behavior being addressed"
              value={values.mainIncident}
              onChange={(value) => updateValue("mainIncident", value)}
              multiline
              required
              rows={3}
            />
            <TextField
              id="campaign-shomser-action"
              label="Shomser's position, expression, gesture, and response"
              value={values.shomserAction}
              onChange={(value) => updateValue("shomserAction", value)}
              multiline
              required
              rows={3}
            />
            {calendarDay && (
              <TextField
                id="calendar-day-shomser-dialogue"
                label="Shomser's dialogue (Bengali) — shomserDialogue"
                value={values.shomserDialogue}
                onChange={(value) => updateValue("shomserDialogue", value)}
                multiline
                rows={3}
                placeholder="Leave blank to let Generate scene suggest Shomser's dialogue."
              />
            )}
            <TextField
              id="campaign-supporting-reactions"
              label="Supporting reactions"
              value={values.supportingReactions}
              onChange={(value) => updateValue("supportingReactions", value)}
              multiline
              required
              rows={3}
            />
            <TextField
              id="campaign-director-notes"
              label="Optional director notes"
              value={values.directorNotes}
              onChange={(value) => updateValue("directorNotes", value)}
              multiline
              rows={3}
              placeholder="Additional camera, composition, or scene-specific guidance."
            />
          </div>
        </details>

        <details className="smart-campaign-section">
          <summary>
            <span className="smart-campaign-step">04</span>
            <span>Headline typography</span>
            <span className="smart-campaign-section-hint">Image-generation guidance</span>
          </summary>
          <div className="smart-campaign-section-content">
            <label className="smart-campaign-field" htmlFor="campaign-headline-scale">
              <span>
                Relative headline size <output>{values.headlineScale}%</output>
              </span>
              <input
                id="campaign-headline-scale"
                type="range"
                min="50"
                max="150"
                step="1"
                value={values.headlineScale}
                onChange={(event) =>
                  updateValue("headlineScale", Number(event.target.value))
                }
              />
              <small>100% is the approved medium-large headline baseline.</small>
            </label>
            <SelectField
              id="campaign-headline-lines"
              label="Maximum headline lines"
              value={values.lineCount}
              options={[
                { value: "1", label: "1 line" },
                { value: "2", label: "2 lines" },
              ]}
              onChange={(value) => updateValue("lineCount", value)}
            />
            <TextField
              id="campaign-tagline-line-break"
              label="Optional manual line arrangement"
              value={values.taglineLineBreak}
              onChange={(value) => updateValue("taglineLineBreak", value)}
              multiline
              rows={2}
              placeholder={"আপনার ভিডিওতে কি\nঅন্যের গোপনীয়তা হারিয়ে যাচ্ছে?"}
            />
            <p className="smart-campaign-note">
              The generated prompt selects typography, colors and text treatments for each campaign. Text rendering is guided, not pixel-guaranteed.
            </p>
          </div>
        </details>

        <details className="smart-campaign-section">
          <summary>
            <span className="smart-campaign-step">05</span>
            <span>Canvas format</span>
            <span className="smart-campaign-section-hint">Native composition</span>
          </summary>
          <fieldset className="smart-campaign-canvas-options">
            <legend className="smart-campaign-sr-only">Choose output canvas</legend>
            {canvasOptions.map(([id, canvas]) => (
              <label className="smart-campaign-canvas-option" key={id}>
                <input
                  type="radio"
                  name="campaign-canvas"
                  value={id}
                  checked={values.canvas === id}
                  onChange={() => updateValue("canvas", id)}
                />
                <span className="smart-campaign-canvas-name">{canvas.label}</span>
                <span>
                  {canvas.width} × {canvas.height} · {canvas.ratio}
                </span>
              </label>
            ))}
            <p className="smart-campaign-note">
              Safe areas are internal editorial guidelines, not guaranteed platform crop
              specifications.
            </p>
          </fieldset>
        </details>
      </div>

      <div className="smart-campaign-actions">
        <button
          type="button"
          className="smart-campaign-generate"
          onClick={generatePrompt}
          disabled={!masterPrompt}
        >
          {masterPrompt ? "Generate image prompt" : "Loading master prompt…"}
        </button>
      </div>

      {feedback && !["import", "scene"].includes(feedback.location) && (
        <p
          className={`smart-campaign-feedback is-${feedback.type}`}
          role={feedback.type === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      )}

      {generatedPrompt && (
        <section className="smart-campaign-output" aria-labelledby="campaign-output-title">
          <div className="smart-campaign-output-heading">
            <div>
              <span className="smart-campaign-kicker">READY TO USE</span>
              <h3 id="campaign-output-title">Generated image prompt</h3>
            </div>
            <div className="smart-campaign-output-actions">
              <button type="button" onClick={() => copyPrompt()}>Copy prompt</button>
              <button type="button" onClick={exportPrompt}>Export .md</button>
            </div>
          </div>
          <label className="smart-campaign-sr-only" htmlFor="campaign-generated-prompt">
            Generated image prompt
          </label>
          <textarea
            id="campaign-generated-prompt"
            className="smart-campaign-generated-text"
            value={generatedPrompt}
            readOnly
            rows={24}
          />
        </section>
      )}
    </div>
  );
}
