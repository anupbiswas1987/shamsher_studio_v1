import React, { useCallback, useMemo, useRef, useState } from "react";
import SmartCampaignBuilder from "./SmartCampaignBuilder.jsx";

const promptTabs = [
  {
    id: "smart-campaign",
    label: "Smart Campaing",
    badge: "Master prompt",
    title: "Smartness Awareness Prompt Generator",
    description:
      "A campaign-first prompt builder for creating Bengali social-awareness poster prompts with context-aware scene settings, typography controls, and final image-generation output.",
    points: [
      "Campaign text: tagline, intro, targeted message, and CTA",
      "Location presets: bus, metro, park, market, campus, tea stall, and more",
      "Crowd, people, scene, and incident storytelling controls",
      "Typography: headline scale, line breaks, centered maroon headline, yellow banner",
      "Canvas sizing: Facebook Feed, Square Post, and Reel/Story output rules",
    ],
  },
  {
    id: "calendar-day",
    label: "Calendar Day",
  },
  {
    id: "series-story",
    label: "Serise Story",
    badge: "Coming soon",
    title: "Serise Story is in progress",
    description:
      "This section will organize multi-part narrative prompts for episodic stories, character arcs, and serial reel storytelling.",
    points: [
      "Episode-based narrative prompts",
      "Character continuity prompts",
      "Story progression builders",
    ],
  },
];

export default function PromptLibrary({ onNotify }) {
  const [activeTab, setActiveTab] = useState(promptTabs[0].id);
  const tabStates = useRef(new Map());
  const saveTabState = useCallback((workflowId, state) => {
    tabStates.current.set(workflowId, state);
  }, []);

  const activePromptTab = useMemo(
    () => promptTabs.find((tab) => tab.id === activeTab) ?? promptTabs[0],
    [activeTab],
  );

  return (
    <main className="prompt-library" aria-label="Prompt workflows">
      <div className="prompt-subtabs" role="tablist" aria-label="Prompt workflow tabs">
        {promptTabs.map((tab) => (
          <button
            key={tab.id}
            id={`prompt-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`prompt-panel-${tab.id}`}
            className={activeTab === tab.id ? "is-active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section
        key={activePromptTab.id}
        id={`prompt-panel-${activePromptTab.id}`}
        className="prompt-workspace-panel"
        role="tabpanel"
        aria-labelledby={`prompt-tab-${activePromptTab.id}`}
      >
        {["smart-campaign", "calendar-day"].includes(activePromptTab.id) ? (
          <SmartCampaignBuilder
            calendarDay={activePromptTab.id === "calendar-day"}
            workflowId={activePromptTab.id}
            initialState={tabStates.current.get(activePromptTab.id)}
            onStateChange={saveTabState}
            onNotify={onNotify}
          />
        ) : (
          <div className="prompt-construction-card">
            <span className="prompt-construction-badge">{activePromptTab.badge}</span>
            <h2>{activePromptTab.title}</h2>
            <p>{activePromptTab.description}</p>

            <div className="prompt-construction-details">
              <div className="prompt-construction-visual" aria-hidden="true">
                <div className="prompt-visual-glow" />
                <div className="prompt-visual-bar" />
                <div className="prompt-visual-window" />
              </div>

              <ul>
                {activePromptTab.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>

            <div className="prompt-status-row">
              <span className="status-dot" aria-hidden="true" />
              Under construction
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
