# Cinematic image animation — retained implementation reference

The active `/screens` UI has been restored to its original per-screen controls. The Select controls and animation-inspector panel described below are no longer mounted. This document records the retained renderer and the earlier inspector implementation.

Screen Studio (`/screens`) runs in the existing React/Vite application. No new illustration generation or CSS camera animations are used.

## Editor workflow

1. Upload an illustration and click **Animate screen…**. New screens are 3 seconds, use **Contain**, and zoom subtly from 94% to 100%. Existing drafts retain their framing, entry/exit transitions, and timing; old screens without camera animation restore as Static.
2. Choose one of 11 presets. Expand **Visual preset previews** to see start, middle and end thumbnails using your original image.
3. Set duration, intensity, easing and start/end position, scale, rotation and opacity. **Entire clip** uses the original source duration. Frames after a shorter motion duration hold the final pose.
4. Choose **Zoom toward focal point** and click **Pick focal point on image**. Click the face or detail in the preview, or enter normalized source-image X/Y coordinates. The marker is an editor overlay and is not exported.
5. Contain and **Protect full illustration** keep source artwork inside the stage, including during rotation. This can limit requested zoom or panning; feedback explains when it does. Contain margins are intentional. Cover and Custom crop fill the stage and can clip lettering or faces. Disable content protection only when cropping is intentional. For Cover/crop, automatic overscan increases scale as needed to avoid exposed background; the inspector reports the required scale.
6. **Custom keyframes** exposes separate X, Y, scale, rotation and opacity tracks. **+ Key** adds a key at the current source time. Click a diamond to seek, drag it to change its time, or use the numeric/range editor. Segment easing belongs to the outgoing key. Keys outside the trimmed interval remain editable and appear dimmed.
7. Use **Trim clip** to trim the beginning/end without retiming animation. Use the existing screen Start/End fields to change reel placement or length. **Restore untrimmed clip** restores the original source interval when it fits the 30-second reel.
8. Check clips to build a selection. **Copy animation** copies the inspected clip; **Paste animation** applies to checked clips. **Apply to selected clips** copies the inspected animation directly to the selection. Key times and explicit motion duration scale to each target's source duration. Framing/crop settings stay specific to each illustration.
9. **Reset animation** returns the inspected clip to Static and Contain. Changes save automatically to the local IndexedDB draft, including uploaded files, crop, focal point, keyframes, trims, and reduced-motion preference.

The system reduced-motion preference is the initial setting. **Reduce motion in preview and export** suppresses camera movement and moving transitions in both pipelines; opacity keyframes remain effective. The preference is saved with the draft.

## Engine contract

`src/cinematic.js` is independent of React and browser storage. Its evaluators have no random-number, animation-frame, wall-clock or DOM dependencies.

- `evaluateAnimation(clip, timelineTime, options)` returns X/Y (% of stage), uniform scale (relative to fitted image), rotation (degrees), opacity (0–1).
- `evaluateTrack(keys, sourceTime, fallback, easing)` linearly interpolates values after mapping segment time through Linear, Ease in, Ease out or Ease in/out. Keys are evaluated in timestamp order. At duplicate timestamps, the last key wins.
- `imageGeometry` performs aspect-preserving fit, normalized source cropping, focal anchoring, content protection, and overscan calculation. It reports framing adjustments to the inspector.
- `evaluateClip` composes camera state, geometry and entry/exit transitions. `renderClip` uses those values for canvas drawing. `renderReelFrame` composites layers in their saved order. The preview calls this at 360 × 640; export applies a uniform 3× stage transform for 1080 × 1920 before calling the same function. MP4 evaluates frame `n` at exactly `n / 30` seconds, stores temporary high-quality JPEG frame intermediates in a local encoding worker, and encodes them with H.264 plus a 48 kHz AAC audio mix. Encoding does not depend on real-time browser capture. WebM retains real-time canvas recording.
- `focalFromCanvas` inverts the rendered transform so picking works through zoom, rotation and crop.
- `trimClip` freezes the original `sourceDuration`, updates `trimIn`/`trimOut` and the visible end, and preserves all keys. The source clock is `timelineTime - clip.start + trimIn`. Moving a clip does not move its keyframes. A new key's time is in source seconds, not reel seconds.
- Presets store explicit start/end transforms. Handheld motion uses bounded analytic sine functions with an endpoint envelope; arbitrary seeks always yield the same state.

Positions and transforms affect only the complete original illustration. They do not independently animate flattened characters, speech bubbles or faces. There is no automatic face/text detection; choose focal points/crops manually and inspect important dialogue throughout the clip.

## Verification

- `npm test`: evaluator interpolation, all presets, focal direction, crop aspect ratio, clipping protection, overscan, trims, copy/paste, serialization, reduced motion and shared rendering.
- `node scripts/check-cinematic.mjs`: isolated Chrome browser checks of the actual inspector, preset previews, image motion, focal picking, multiple keys, trim-safe source time, pixel comparison between scrubbed preview and shared export renderer, copy/paste, crop and draft reload.
- `node scripts/check-cinematic.mjs --mobile`: same interaction checks at a narrow viewport.
- `node scripts/check-cinematic-export.mjs`: actual MP4 conversion/download, codecs, dimensions and decoded cinematic framing.

Browser checks require local Chrome and permission to start an isolated localhost server. The original illustration files are never modified.
