async function api(path, options) {
  const response = await fetch(`/api/render${path}`, options);
  let result;
  try { result = await response.json(); }
  catch { throw Error('Server rendering is unavailable. Check that the render worker is running.'); }
  if (!response.ok) throw Error(result.error || 'Server export request failed');
  return result;
}
export async function renderOnServer({ screens, audioClips, duration, title, aspectRatio, reducedMotion, onProgress }) {
  onProgress('Creating server render job…');
  const { id } = await api('/jobs', { method: 'POST' });
  const base = `/jobs/${id}`;
  try {
    const upload = async (item, index, kind) => {
      if (!item.src) return { ...item, file: undefined, src: undefined };
      onProgress(`Uploading ${kind} ${index + 1}…`);
      let blob = item.file;
      if (!blob) {
        const response = await fetch(item.src);
        if (!response.ok) throw Error(`Could not read ${item.name || kind} for upload`);
        blob = await response.blob();
      }
      const { asset } = await api(`${base}/assets`, { method: 'POST', body: blob });
      const { file, src, ...settings } = item;
      return { ...settings, asset };
    };
    const project = { title, aspectRatio, duration, reducedMotion, screens: [], audioClips: [] };
    for (const [index, screen] of screens.entries()) project.screens.push(await upload(screen, index, 'screen'));
    for (const [index, clip] of audioClips.entries()) project.audioClips.push(await upload(clip, index, 'audio'));
    await api(`${base}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project) });
    while (true) {
      const status = await api(base);
      onProgress(status.message);
      if (status.state === 'failed') throw Error(status.message);
      if (status.state === 'complete') return `/api/render${base}/download`;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    await api(base, { method: 'DELETE' }).catch(() => {});
    throw error;
  }
}
