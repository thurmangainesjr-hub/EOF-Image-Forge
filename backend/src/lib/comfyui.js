/**
 * ComfyUI connection
 *
 * ComfyUI runs on Blue's PC and makes the images. Image Forge only talks to it
 * over HTTP, so it must be running for covers and character art.
 */

const CHECK_TIMEOUT_MS = 2000;

export function comfyUrl() {
  return process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
}

// Is ComfyUI running? Never throws: an offline engine is a normal state.
export async function checkComfyUI() {
  const url = comfyUrl();
  try {
    const res = await fetch(`${url}/system_stats`, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    if (!res.ok) return { name: 'comfyui', url, online: false, error: `ComfyUI answered ${res.status}` };
    const stats = await res.json();
    return {
      name: 'comfyui',
      url,
      online: true,
      devices: (stats.devices || []).map(d => d.name)
    };
  } catch (error) {
    return { name: 'comfyui', url, online: false, error: `ComfyUI is not running at ${url}` };
  }
}
