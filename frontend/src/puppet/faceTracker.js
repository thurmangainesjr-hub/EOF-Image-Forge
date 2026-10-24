/**
 * Face tracking with MediaPipe, running in the browser
 *
 * The tracking code is served by this page (copied from the npm package by
 * scripts/copy-mediapipe.js) and the face model downloads from Google the
 * first time. Nothing about the face leaves the computer.
 */

const WASM_URL = '/mediapipe/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let loading = null;

// Load once, then reuse. Tries the graphics chip first and falls back to the processor.
export function loadFaceTracker() {
  if (!loading) {
    loading = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const options = delegate => ({
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true
      });
      try {
        return await FaceLandmarker.createFromOptions(fileset, options('GPU'));
      } catch {
        return FaceLandmarker.createFromOptions(fileset, options('CPU'));
      }
    })();
    loading.catch(() => { loading = null; });
  }
  return loading;
}

// Track one video frame. Returns the MediaPipe result, or null if the frame isn't ready.
export function trackFrame(tracker, video, timeMs) {
  if (!tracker || video.readyState < 2 || !video.videoWidth) return null;
  return tracker.detectForVideo(video, timeMs);
}
