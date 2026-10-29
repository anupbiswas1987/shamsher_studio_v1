# Shomshar Animation Studio

A browser-based animation and image-to-reel editor built with React and Vite.

## Installation

### Requirements

- **Node.js 22.12 or newer**. This project has been verified with Node.js 22.22.1.
- **npm**, included with Node.js.
- **Git** if you are cloning the repository rather than downloading an archive.
- A modern browser with Canvas, Web Audio, and WebAssembly support for preview and export.

Check your installed versions:

```sh
node --version
npm --version
```

### 1. Get the project

Clone your repository, replacing `YOUR_REPOSITORY_URL` with its actual Git URL:

```sh
git clone YOUR_REPOSITORY_URL shomshar-reel-studio
cd shomshar-reel-studio
```

If you already downloaded or copied the project, open a terminal in its directory instead. On this server:

```sh
cd /var/www/shomshar-reel-studio
```

### 2. Install dependencies

Install the versions recorded in `package-lock.json`:

```sh
npm ci
```

Keep `package-lock.json` in version control so other installations use the same dependency versions. No database, API keys, or environment variables are required for the current application.

### 3. Generate the asset library

```sh
npm run assets
```

This creates `src/generated/asset-catalog.js` and `public/asset-catalog.json` from the media folders in `public/`. These generated files are ignored by Git. Development, build, and test commands also regenerate them automatically.

### 4. Start development

```sh
npm run dev
```

Open:

- Animation Studio: `http://localhost:5173/`
- Screen Studio: `http://localhost:5173/screens`

Vite prints the actual URL in the terminal. If port 5173 is already occupied, it may select another port. Stop the server with **Ctrl+C**.

To open the editor from another device on your local network:

```sh
npm run dev -- --host 0.0.0.0
```

Use your computer's local IP address in place of `localhost` on the other device.

## Production build

```sh
npm run build
```

The deployable website is written to `dist/`, including public media and the browser-side MP4 encoder. Upload the **contents of `dist/`** to your static web host. Rebuild after changing source files or public assets.

Configure the host to serve `index.html` for application routes such as `/screens`, and serve the generated JavaScript and `.wasm` assets from the same site. For Nginx, set the site's document root to your `dist/` directory and use this fallback:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

Use HTTPS for the deployed site, especially for microphone recording.

To check the production build locally:

```sh
npm run preview -- --port 4173
```

Open `http://localhost:4173/` or `http://localhost:4173/screens`. This command is for checking the built files locally; deploy `dist/` through your production web server.

## Verification commands

| Command | Purpose |
| --- | --- |
| `npm test` | Run the automated unit and rendering checks. |
| `npm run test:screens` | Check uploads, screen ordering, timing, audio, and draft restoration in a desktop browser. |
| `npm run test:screens:mobile` | Run the screen-editor checks at a mobile viewport. |
| `npm run test:browser` | Check the main studio and asset library in a browser. |
| `npm run test:cinematic` | Test the retained animation evaluator independently of the UI. |

The browser check scripts currently expect Google Chrome at `/usr/bin/google-chrome` on Linux and permission to start a temporary localhost server. Chrome is not required for `npm test`.

## Installation troubleshooting

- **Node version error:** check `node --version` and switch to Node.js 22.12 or newer before running `npm ci` again.
- **Missing asset catalog:** run `npm run assets` from the project directory.
- **Missing artwork or audio:** keep the supplied `public/` files and folder names intact; see the asset-library structure below.
- **`/screens` returns 404 after deployment:** configure the static host's `index.html` fallback as shown above.
- **Saved draft appears missing:** drafts are stored in the browser for each site address. Development on port 5173, preview on port 4173, and your production domain have separate storage. Use the same browser and address to resume a draft.
- **MP4 export takes time on its first run:** the browser loads the bundled encoder, then renders and encodes the reel locally. Keep the tab open until the download is ready.


## Folder-based asset library

The tabs mirror these folders. Add your files, without editing React or the renderer:

```text
public/
  character/
    shomshar/
      explaining.png           # single pose
      teacher.png              # single pose
      walking/                 # one animation sequence
        001.png
        002.png
        010.png
      talking/
        001.png
        002.png
    friend/
      idle/
        001.png
        002.png
  props/
    books-and-tea.png
  background/
    village.png
  audio/
    dialogue.mp3
```

Each direct subfolder of `character/` is a character. Images directly inside it become individual poses; each nested image folder becomes a frame sequence. A character containing only numbered root images (for example `character/friend/001.png`, `002.png`) becomes a default sequence. A sequence means different character looks/poses shown one after another, such as thinking → explaining → laughing. Images use natural numeric filename order: `1`, `2`, `10`, rather than `1`, `10`, `2`. Use equal-sized transparent canvases for frames to keep their placement steady. Choose a character in the Character folder selector, then a pose or sequence; look sequences have editable seconds per look (0.1–30, default 2 seconds) and repeat controls, used in preview, saves and exports. Frame timing restarts at its pose cue.

Props, backgrounds and audio can have nested folders too. Their filenames become library labels. Image props are draggable and editable; background images apply to the active scene; audio files have previews and can be added at the playhead. PNG, JPG, WebP, AVIF, GIF and SVG image files are indexed; frame sequences require separate image files (animated GIF decoding is not used as a timeline). MP3, WAV, OGG, M4A, AAC, WebM, FLAC and Opus audio files are indexed; playback depends on browser decoder support. Hidden files, symlinks and unsupported files are ignored. Empty folders produce empty library states.

`npm run dev` watches these folders and refreshes the library after additions, removals or edits. `npm run build` scans them automatically for production; rebuild and redeploy after changing production assets. `npm run assets` explicitly regenerates the catalog. `src/generated/asset-catalog.js` and `public/asset-catalog.json` are generated outputs; edit the folders instead. Older saved pose IDs such as `teacher` and `thinking` migrate to `shomshar/teacher` and `shomshar/thinking` without changing their keyframes. Existing uploaded background and audio data remains embedded; folder-backed image references require those assets to stay available at their public paths.

Run `npm test` for discovery, frame-ordering, playback, migration, background, audio and story checks. `npm run test:browser` runs a headless Chrome check of character selection, sequence playback and all four asset tabs using a temporary local server and isolated browser profile.

The Character library reads character folders in `public/character/`. The supplied Shomshar poses have been copied into `public/character/shomshar/`; legacy originals remain in `public/assets` for compatibility. Choose a pose per scene, move the playhead, and change the character X, Y or rotation to create whole-character keyframes. These supplied images are flattened; independent head, eye, mouth, arm and hand rigging requires separate artwork layers. Legacy body-part keys are preserved in imported projects but are not applied to the original PNG artwork.

Add scenes from the scene strip. Props can be clicked or dropped onto the stage, then dragged or positioned through the Inspector. Captions accept Bengali text and have independent start/end timing.

The Audio library supports microphone recording, audio file import, and generated Pop/Chime effects. Recording requires HTTPS or localhost and microphone permission. The supplied flattened character poses do not support mouth animation. Imported and recorded audio is included in video exports.

Use **Add audio** in the header or **Audio → Add audio file** to select an audio file (up to 25 MB). Each imported clip has an original-file preview, scene start time, beginning trim, volume (0–200%), and mute control. Audio is cut at its scene boundary; **Extend scene to fit** includes the full remaining clip. Muted clips are omitted from playback and export.

Projects save in browser local storage, including embedded audio. Use Save project for a portable JSON backup, and Open project to restore it. Large audio clips can exceed browser storage capacity; keep a downloaded backup.

Export offers 720 × 1280 or 1080 × 1920 at 30 FPS, with Auto, MP4 (when supported), and WebM format choices. All audio and effects are mixed before recording; video timing follows the audio clock across scenes. Rendering runs in real time and includes progress, cancellation, and a repeat-download link. Keep the tab visible until rendering finishes. MP4 is preferred when MediaRecorder supports it; otherwise WebM is downloaded. Browser codec and microphone support vary and must be checked on the target device.

To convert the fallback WebM with an installed FFmpeg:

```sh
ffmpeg -i shomshar-animation.webm -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart shomshar-animation.mp4
```

If browser video recording is unavailable, download the editable project and reopen it in a browser with canvas captureStream and MediaRecorder support. Export options also include a PNG snapshot of the current frame.

Run `npm test` for clip-boundary, format-detection, and multi-scene audio-mix checks. Browser recording and microphone access still require testing on the target device.

Each scene has a separate **Background** layer. Open the Background library tab, upload a PNG/JPG/WebP image (up to 10 MB), and choose Fill stage or Fit inside stage. Adjust horizontal/vertical position, zoom and opacity, toggle visibility, or use a solid base color with an optional paper grid. Backgrounds render beneath characters, props and captions, are embedded in project saves, and are loaded before video export. Click the Background track in the timeline or Edit background layer in scene settings to access the controls. Large images can exceed local storage limits; download a project backup when prompted.

## Movement sequences

In **Character → Bring him to life**, choose a movement preset: Still, Breathe & sway, Speaking emphasis, Happy bounce, or Walking bounce. Speed and intensity adjust the motion. Speaking emphasis becomes stronger during audible dialogue clips; it does not move the mouth. Presets add motion to existing character position/rotation keyframes and anchor scaling at the feet.

**Create movement sequence** plays the selected frame sequence or creates timed pose cues from the selected character’s folder, and enables breathing. Press Play to preview. Edit cue times and poses, jump to them from the Pose sequence timeline track, or choose an artwork and use **Add selected pose at…** to add your own cue at the playhead. Clear the sequence to return to a single selected pose. Adjacent artwork changes use a short dissolve; they are not generated in-between drawings or independent limb animation.

Sequences and preset settings persist in project saves. All cue artwork is loaded before export, and motion is evaluated from scene time so seeking and exports use identical animation timing. New scenes start with gentle breathing; older scenes retain their existing still appearance until a preset is applied.

## জীবনের সফলতা animated short

The supplied dialogue is available as an eight-scene, 29.5-second animation using the original artwork, Bengali captions, character motion, and sound effects. It contains no recorded narration. Watch `/animations/jiboner-sofolota.html`, download the rendered MP4 or editable JSON from the story strip, or click **জীবনের সফলতা** to load the scenes into the studio. Loading from the button backs up the prior project under the `shomshar-before-story` local-storage key.

Re-render with `node scripts/render-story.mjs`. This requires local Google Chrome, access to a temporary localhost server, and the system Noto Sans Bengali font. The script uses the same scene renderer and audio mixer as the editor, creates a poster and MP4 (or WebM on browsers without MP4 recording), and checks browser decoding, dimensions, and duration before writing export metadata. The included MP4 was validated in Chrome at 720 × 1280, approximately 29.5 seconds. Exported codecs depend on browser recording support.

## Comic reel presentation

The reel is presented as one vertical comic panel at a time, with a character look, bold Bengali speech bubble, panel border, and optional gentle camera movement. Use **Comic panels & speech bubbles** below the stage to arrange the reel:

1. Select a character look or look sequence in the Character library.
2. Click **Create panels from character looks**. A sequence produces one panel for each different image; individual poses in a character folder produce one panel per pose. Each panel freezes that look rather than cycling through the sequence. Existing dialogue, audio and effects stay on the first generated panel; its duration is retained when needed. Later panels begin with empty dialogue and use the selected seconds-per-look duration.
3. Select a panel card and edit its character/look, hold duration, speaker, Bengali dialogue, background, bubble position and direction, camera movement, and incoming cut/dissolve. Use Earlier/Later to change panel order or Blank panel to add one. Original library assets are unchanged.
4. Click **Preview full reel** to watch every panel in sequence with mixed audio. Playback supports pause, restart, seeking and mute. The preview and video export share the same panel renderer, transitions, camera movement, timing and audio mixer.
5. Export the reel using the existing MP4/WebM controls.

Comic presentation settings and fixed look references are stored in project JSON. Captions wrap automatically inside the speech bubble. Independent facial or limb motion still requires suitable layered artwork; imported audio can be attached to each panel through the Audio tab.

## Trademark overlay

The supplied `public/assets/Cheerful Bengali Cartoon Sticker Logo.png` is used as the fixed bottom-right trademark. The studio and standalone sample player display it above UI overlays with `z-index: 2147483647` and `pointer-events: none`. The canvas renderer draws it last, at full opacity, outside camera transforms and after panel transitions. It appears in every panel, full-reel previews, MP4/WebM exports and PNG snapshots. The original source artwork is unchanged. Video and snapshot exports preload the logo before rendering.

## Screen Studio

Open `/screens` to upload images, add up to 30 screens within a 30-second reel, and edit each screen's start/end, entry/exit, transition length and image fit directly on its row. Drag the handle to reorder screens, or reset their timing to consecutive 3-second slots. Add an audio layer with start time and volume controls. Drafts save on this device and restore after reload. Export supports Full HD vertical MP4 with H.264/AAC at 30 FPS.

The original UI has no Select checkboxes or additional camera-animation inspector. Run `npm run test:screens` or `npm run test:screens:mobile` for the current UI checks. The retained animation evaluator is covered by `npm test` and `npm run test:cinematic`.
