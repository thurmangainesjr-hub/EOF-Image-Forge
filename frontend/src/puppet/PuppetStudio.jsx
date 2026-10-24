import React, { useEffect, useRef, useState } from 'react';
import { NEUTRAL_POSE, levelFromSamples, mouthFromLevel, idleBlink, poseFromFace, smoothPose } from './rig.js';
import { LAYERS, drawBackground, drawPuppet } from './draw.js';
import { loadFaceTracker, trackFrame } from './faceTracker.js';

const STAGE = { width: 1280, height: 720 };

const SOURCES = [
  { id: 'audio', label: 'Recorded dialogue', hint: 'Upload a voice recording. The mouth follows the words.' },
  { id: 'webcam', label: 'Webcam', hint: 'Your face moves the puppet live, and your voice is recorded.' },
  { id: 'video', label: 'Video file', hint: 'A video of a performer moves the puppet, with its sound.' }
];

const BACKDROPS = [
  { id: 'studio', label: 'Dark studio', color: '#15151d' },
  { id: 'green', label: 'Green screen', color: '#00b140' },
  { id: 'night', label: 'Night blue', color: '#0f1d3a' }
];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That picture could not be opened'));
    img.src = src;
  });
}

function recorderType() {
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return types.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || 'video/webm';
}

// Sound from an <audio>/<video> element or a microphone goes to the
// analyser (for lip sync) and to the recording. Files also play out loud.
function connectSound(audio, node, { speakers }) {
  node.connect(audio.analyser);
  node.connect(audio.recordDest);
  if (speakers) node.connect(audio.ctx.destination);
}

function ConsentBox({ source, consent, onConsent }) {
  const [statement, setStatement] = useState('');
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/puppet/consent-statement')
      .then(res => res.json())
      .then(data => setStatement(data.statement))
      .catch(() => setMessage('The Image Forge server is not running.'));
  }, []);

  if (consent?.source === source) {
    return (
      <p className="consent-done">
        Consent recorded for <strong>{consent.performerName}</strong> on {new Date(consent.createdAt).toLocaleString()}.
      </p>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setMessage('');
    try {
      const res = await fetch('/api/puppet/consents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ performerName: name, source, agreed })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onConsent(data.consent);
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <form className="consent" onSubmit={submit}>
      <strong>Performer consent</strong>
      <p className="hint">This uses a real person's face, so they agree first. Nothing is tracked until this is recorded.</p>
      <blockquote>{statement || '…'}</blockquote>
      <input placeholder="Performer's full name" value={name} onChange={e => setName(e.target.value)} required />
      <label className="check">
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
        <span>The performer agrees to the statement above</span>
      </label>
      <button type="submit" disabled={!agreed || !name.trim()}>Record consent</button>
      {message && <p className="error">{message}</p>}
    </form>
  );
}

function LayerPicker({ puppet, setPuppet }) {
  const [message, setMessage] = useState('');

  async function pick(key, file) {
    setMessage('');
    if (!file) return;
    try {
      const img = await loadImage(URL.createObjectURL(file));
      setPuppet(p => ({ ...p, layers: { ...p.layers, [key]: img } }));
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="layers">
      <p className="hint">Use transparent PNGs that are all the same size, drawn so they line up when stacked.</p>
      {LAYERS.map(layer => (
        <label key={layer.key} className="layer">
          <span>{layer.label}{layer.required ? ' *' : ''}{puppet.layers[layer.key] ? ' ✓' : ''}</span>
          <input type="file" accept="image/png,image/webp" onChange={e => pick(layer.key, e.target.files[0])} />
        </label>
      ))}
      <label className="layer">
        <span>Neck height</span>
        <input type="range" min="0.15" max="0.7" step="0.01" value={puppet.neck.y}
          onChange={e => setPuppet(p => ({ ...p, neck: { ...p.neck, y: Number(e.target.value) } }))} />
      </label>
      {message && <p className="error">{message}</p>}
    </div>
  );
}

export default function PuppetStudio({ images }) {
  const canvasRef = useRef(null);
  const mediaRef = useRef(null); // <video> for webcam or video file, <audio> for dialogue
  const audioRef = useRef(null); // { ctx, analyser, recordDest }
  const connectedRef = useRef(new WeakSet());
  const streamRef = useRef(null);
  const trackerRef = useRef(null);
  const recorderRef = useRef(null);
  const live = useRef({ pose: NEUTRAL_POSE, puppet: null, background: null, source: 'audio', running: false, faceSeen: false });

  const [puppet, setPuppet] = useState({ kind: 'demo', layers: {}, neck: { x: 0.5, y: 0.42 } });
  const [backdrop, setBackdrop] = useState('studio');
  const [background, setBackground] = useState({ color: BACKDROPS[0].color });
  const [source, setSource] = useState('audio');
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState('');
  const [consent, setConsent] = useState(null);
  const [running, setRunning] = useState(false);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState('');
  const [takes, setTakes] = useState([]);
  const [name, setName] = useState('');

  live.current.puppet = puppet;
  live.current.background = background;
  live.current.source = source;

  const needsConsent = source !== 'audio';
  const hasConsent = !needsConsent || consent?.source === source;
  const layersReady = puppet.kind === 'demo' || LAYERS.filter(l => l.required).every(l => puppet.layers[l.key]);
  const canStart = hasConsent && layersReady && (source === 'webcam' || file);

  useEffect(() => {
    fetch('/api/puppet/videos')
      .then(res => (res.ok ? res.json() : { videos: [] }))
      .then(data => setTakes(data.videos))
      .catch(() => {});
  }, []);

  // Backdrop: a colour or one of the Image Forge pictures
  useEffect(() => {
    const color = BACKDROPS.find(b => b.id === backdrop);
    if (color) return setBackground({ color: color.color });
    const image = images.find(i => i.id === backdrop);
    if (image) loadImage(image.url).then(img => setBackground({ image: img })).catch(() => {});
  }, [backdrop, images]);

  // A new file replaces the old one
  useEffect(() => {
    if (!file) return setFileUrl('');
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The animation loop: work out the pose, then draw, every frame
  useEffect(() => {
    let frame;
    const ctx = canvasRef.current.getContext('2d');
    const samples = new Uint8Array(1024);
    const tick = () => {
      const now = performance.now();
      const state = live.current;
      let pose = state.pose;
      let face = null;

      if (state.running && state.source !== 'audio' && trackerRef.current && mediaRef.current) {
        try {
          face = poseFromFace(trackFrame(trackerRef.current, mediaRef.current, now), { mirror: state.source === 'webcam' });
        } catch {
          face = null;
        }
        state.faceSeen = Boolean(face);
      }

      if (face) {
        pose = smoothPose(pose, face, 0.5);
      } else {
        // No face: the mouth follows the sound, blinks and sway are automatic
        let mouth = { mouthOpen: pose.mouthOpen * 0.8, mouth: 'closed' };
        if (state.running && audioRef.current) {
          audioRef.current.analyser.getByteTimeDomainData(samples);
          mouth = mouthFromLevel(levelFromSamples(samples), pose.mouthOpen);
        }
        pose = {
          ...mouth,
          blink: idleBlink(now),
          roll: Math.sin(now / 1700) * 0.05,
          yaw: Math.sin(now / 2300) * 0.15,
          pitch: 0
        };
      }
      state.pose = pose;

      drawBackground(ctx, state.background);
      drawPuppet(ctx, state.puppet, pose, now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Show whether the tracker can see a face
  useEffect(() => {
    if (!running || source === 'audio') return undefined;
    const timer = setInterval(() => {
      if (trackerRef.current) setStatus(live.current.faceSeen ? 'Face found: the puppet is following.' : 'Looking for a face… face the camera in good light.');
    }, 500);
    return () => clearInterval(timer);
  }, [running, source]);

  function sound() {
    if (!audioRef.current) {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      audioRef.current = { ctx, analyser, recordDest: ctx.createMediaStreamDestination() };
    }
    return audioRef.current;
  }

  function stopMedia() {
    live.current.running = false;
    setRunning(false);
    mediaRef.current?.pause?.();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (mediaRef.current && source === 'webcam') mediaRef.current.srcObject = null;
    setStatus('');
  }

  async function start({ fromStart = false } = {}) {
    setMessage('');
    const audio = sound();
    await audio.ctx.resume();
    const media = mediaRef.current;
    try {
      if (source !== 'audio' && !trackerRef.current) {
        setStatus('Loading face tracking (the first time takes a little while)…');
        trackerRef.current = await loadFaceTracker();
      }
      if (source === 'webcam') {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
        streamRef.current = stream;
        media.srcObject = stream;
        await media.play();
        // The microphone is recorded and drives the mouth, but isn't played back (no echo)
        connectSound(audio, audio.ctx.createMediaStreamSource(stream), { speakers: false });
      } else {
        if (!connectedRef.current.has(media)) {
          connectSound(audio, audio.ctx.createMediaElementSource(media), { speakers: true });
          connectedRef.current.add(media);
        }
        if (fromStart) media.currentTime = 0;
        await media.play();
      }
      live.current.running = true;
      setRunning(true);
      if (source === 'audio') setStatus('Playing: the mouth follows the dialogue.');
    } catch (err) {
      setStatus('');
      setMessage(err.name === 'NotAllowedError' ? 'The browser was not allowed to use the camera or microphone.' : err.message || 'Could not start');
      return false;
    }
    return true;
  }

  async function saveTake(blob) {
    setStatus('Saving the video…');
    const query = new URLSearchParams({ mode: source, name: name.trim() || 'Puppet take' });
    if (consent && needsConsent) query.set('consentId', consent.id);
    try {
      const res = await fetch(`/api/puppet/videos?${query}`, { method: 'POST', headers: { 'content-type': 'video/webm' }, body: blob });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTakes(list => [data.video, ...list]);
      setStatus('Saved. Your video is below.');
    } catch (err) {
      setStatus('');
      setMessage(`The video was made but not saved: ${err.message}`);
    }
  }

  async function record() {
    if (!(await start({ fromStart: source !== 'webcam' }))) return;
    const audio = sound();
    const stream = new MediaStream([
      ...canvasRef.current.captureStream(30).getVideoTracks(),
      ...audio.recordDest.stream.getAudioTracks()
    ]);
    const type = recorderType();
    const recorder = new MediaRecorder(stream, { mimeType: type });
    const chunks = [];
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      setRecording(false);
      stream.getVideoTracks().forEach(t => t.stop());
      saveTake(new Blob(chunks, { type: 'video/webm' }));
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    setRecording(true);
    // A file take ends with the file
    if (source !== 'webcam') mediaRef.current.onended = () => stopRecording();
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    if (mediaRef.current) mediaRef.current.onended = null;
    stopMedia();
  }

  function changeSource(id) {
    if (running) stopMedia();
    setSource(id);
    setFile(null);
    setStatus('');
    setMessage('');
  }

  return (
    <div className="layout">
      <aside className="maker">
        <section className="panel">
          <strong>1. Puppet</strong>
          <div className="tabs">
            <button type="button" className={puppet.kind === 'demo' ? 'tab active' : 'tab'} onClick={() => setPuppet(p => ({ ...p, kind: 'demo' }))}>Demo drake</button>
            <button type="button" className={puppet.kind === 'layers' ? 'tab active' : 'tab'} onClick={() => setPuppet(p => ({ ...p, kind: 'layers' }))}>My layers</button>
          </div>
          {puppet.kind === 'layers' && <LayerPicker puppet={puppet} setPuppet={setPuppet} />}
        </section>

        <section className="panel">
          <strong>2. Backdrop</strong>
          <select value={backdrop} onChange={e => setBackdrop(e.target.value)}>
            {BACKDROPS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
            {images.map(i => (
              <option key={i.id} value={i.id}>
                {i.kind === 'cover' ? `Cover: ${i.overlay?.title}` : i.kind === 'studio' ? `Studio: ${i.text?.slice(0, 40)}` : `Character: ${i.request?.name}`}
              </option>
            ))}
          </select>
        </section>

        <section className="panel">
          <strong>3. What moves it</strong>
          <div className="choices">
            {SOURCES.map(s => (
              <label key={s.id} className={source === s.id ? 'choice active' : 'choice'}>
                <input type="radio" name="source" checked={source === s.id} onChange={() => changeSource(s.id)} />
                <span>
                  <span className="choice-label">{s.label}</span>
                  <span className="choice-hint">{s.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {needsConsent && <ConsentBox source={source} consent={consent} onConsent={setConsent} />}
          {source === 'audio' && (
            <input type="file" accept="audio/*" onChange={e => setFile(e.target.files[0] || null)} />
          )}
          {source === 'video' && hasConsent && (
            <input type="file" accept="video/*" onChange={e => setFile(e.target.files[0] || null)} />
          )}
        </section>
      </aside>

      <section className="stage">
        <h2>Stage</h2>
        <div className="stage-frame">
          <canvas ref={canvasRef} width={STAGE.width} height={STAGE.height} className="puppet-canvas" />
          {source !== 'audio' && (
            <video ref={mediaRef} className={source === 'webcam' ? 'performer mirrored' : 'performer'} src={source === 'video' ? fileUrl || undefined : undefined} playsInline muted={source === 'webcam'} />
          )}
          {source === 'audio' && <audio ref={mediaRef} src={fileUrl || undefined} />}
          {recording && <span className="rec">● REC</span>}
        </div>

        <div className="stage-controls">
          <input placeholder="Name this take (optional)" value={name} onChange={e => setName(e.target.value)} />
          {!running && <button type="button" className="secondary" disabled={!canStart} onClick={() => start({ fromStart: true })}>Preview</button>}
          {running && !recording && <button type="button" className="secondary" onClick={stopMedia}>Stop</button>}
          {!recording ? (
            <button type="button" disabled={!canStart} onClick={record}>Record video</button>
          ) : (
            <button type="button" className="danger" onClick={stopRecording}>Stop recording</button>
          )}
        </div>
        {!canStart && (
          <p className="hint">
            {!layersReady ? 'Add the body, head and closed-mouth layers first.'
              : !hasConsent ? 'Record the performer\'s consent first.'
              : source === 'audio' ? 'Choose a voice recording to start.'
              : 'Choose a video to start.'}
          </p>
        )}
        {status && <p className="status-line">{status}</p>}
        {message && <p className="error">{message}</p>}

        {takes.length > 0 && (
          <>
            <h2>Puppet videos <span className="count">{takes.length}</span></h2>
            <ul className="takes">
              {takes.map(take => (
                <li key={take.id} className="take">
                  <video src={take.url} controls preload="metadata" />
                  <div className="card-meta">
                    <span className="card-title">{take.name}</span>
                    <span className="card-kind">{take.mode === 'audio' ? 'Dialogue' : take.mode === 'webcam' ? `Webcam · ${take.performerName}` : `Video · ${take.performerName}`}</span>
                    <a className="card-download" href={take.url} download={`${take.name}.webm`}>Download</a>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
