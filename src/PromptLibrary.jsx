import React, { useMemo, useState } from "react";
import {
  filterPromptTemplates,
  PROMPT_CATEGORIES,
} from "./prompt-library.js";

export default function PromptLibrary() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [copiedPromptId, setCopiedPromptId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const prompts = useMemo(
    () => filterPromptTemplates(query, category),
    [query, category],
  );

  async function copyPrompt(prompt) {
    if (!navigator.clipboard?.writeText) {
      setFeedback({
        type: "error",
        message:
          "Clipboard access is unavailable in this browser. Select the prompt text and copy it manually.",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(prompt.text);
      setCopiedPromptId(prompt.id);
      setFeedback({
        type: "success",
        message: `Copied “${prompt.title}” to the clipboard.`,
      });
    } catch (error) {
      const details =
        error instanceof Error ? ` ${error.message}` : " Clipboard access was denied.";
      setFeedback({
        type: "error",
        message: `Could not copy this prompt.${details} Select the prompt text and copy it manually.`,
      });
    }
  }

  return (
    <main className="prompt-library" aria-labelledby="prompt-library-title">
      <div className="prompt-library-heading">
        <span className="eyebrow">PROMPT LIBRARY</span>
        <h1 id="prompt-library-title">Start with a strong image prompt.</h1>
        <p>
          Browse ready-to-customize prompts for vertical reel screens. Replace
          the bracketed details, then copy a prompt into your image generator.
        </p>
      </div>

      <div className="prompt-library-tools">
        <label className="prompt-search">
          <span>Search prompts</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setFeedback(null);
              setCopiedPromptId(null);
            }}
            placeholder="Try “forest”, “portrait”, or “soft light”"
          />
        </label>
        <div
          className="prompt-category-filters"
          role="group"
          aria-label="Filter prompts by category"
        >
          {PROMPT_CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={category === item}
              onClick={() => {
                setCategory(item);
                setFeedback(null);
                setCopiedPromptId(null);
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <p className="prompt-result-count" aria-live="polite">
        {prompts.length} {prompts.length === 1 ? "prompt" : "prompts"}
      </p>

      {feedback && (
        <p
          className={`prompt-copy-feedback prompt-copy-feedback-${feedback.type}`}
          role={feedback.type === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      )}

      {prompts.length ? (
        <div className="prompt-card-grid">
          {prompts.map((prompt) => (
            <article className="prompt-card" key={prompt.id}>
              <div className="prompt-card-heading">
                <span className="prompt-category-tag">{prompt.category}</span>
                <h2>{prompt.title}</h2>
                <p>{prompt.description}</p>
              </div>
              <div className="prompt-text-wrap">
                <span className="prompt-text-label">Prompt</span>
                <p className="prompt-card-text">{prompt.text}</p>
              </div>
              <button
                type="button"
                className="prompt-copy-button"
                aria-label={`Copy ${prompt.title} prompt`}
                onClick={() => copyPrompt(prompt)}
              >
                {copiedPromptId === prompt.id ? "Copied" : "Copy prompt"}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="prompt-empty-state">
          <h2>No prompts match that search.</h2>
          <p>Try a different phrase or show prompts from every category.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("All");
            }}
          >
            Clear search and filters
          </button>
        </div>
      )}
    </main>
  );
}
