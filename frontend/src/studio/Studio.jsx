import React, { useEffect, useRef, useState } from 'react';

const EXAMPLES = [
  'A 35-year-old African American superhero with a muscular build, wearing futuristic black armor with gold detailing, photorealistic, standing on a rooftop at night',
  'A young drake guarding the last dragon egg in a burning kingdom',
  'A cozy bookshop on a rainy street at dusk, warm light in the windows'
];

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
    body: options.body && JSON.stringify(options.body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.data = data;
    throw error;
  }
  return data;
}

// A short project name from the first request
const nameFrom = text => text.trim().split(/\s+/).slice(0, 6).join(' ').replace(/[,.]$/, '');

function Message({ message, versions, onPick }) {
  const image = message.imageId && versions.find(v => v.id === message.imageId);
  return (
    <li className={`msg msg-${message.role}${message.error ? ' msg-error' : ''}`}>
      <p>{message.text}</p>
      {image && (
        <button type="button" className="msg-thumb" onClick={() => onPick(image.id)} title="Show this version">
          <img src={image.url} alt="" />
        </button>
      )}
    </li>
  );
}

function Options({ options, settings, onChange, open, setOpen }) {
  if (!options) return null;
  return (
    <aside className={open ? 'studio-options open' : 'studio-options'}>
      <button type="button" className="options-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Hide options ›' : '‹ Options'}
      </button>
      {open && (
        <div className="options-body">
          <p className="hint">All optional. Just typing works too.</p>

          <h3>Shape</h3>
          <div className="ratio-grid">
            {options.ratios.map(r => (
              <button key={r.id} type="button" className={settings.ratio === r.id ? 'ratio active' : 'ratio'} onClick={() => onChange({ ratio: r.id })} title={r.label}>
                <span className="ratio-box" style={{ aspectRatio: r.id.replace(':', ' / ') }} />
                <span>{r.id}</span>
                <small>{r.label}</small>
              </button>
            ))}
          </div>

          <h3>Style</h3>
          <select value={settings.style} onChange={e => onChange({ style: e.target.value })}>
            {options.styles.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>

          <h3>Preset</h3>
          <div className="preset-chips">
            {options.presets.map(p => (
              <button key={p.id} type="button" className={settings.preset === p.id ? 'chip active' : 'chip'}
                onClick={() => onChange(settings.preset === p.id ? { preset: null } : { preset: p.id, ratio: p.ratio, style: p.style })}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="hint">A preset only fills in the shape and style. You can still change anything by chatting.</p>
        </div>
      )}
    </aside>
  );
}

export default function Studio({ engineReady, onImagesChanged }) {
  const [options, setOptions] = useState(null);
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [settings, setSettings] = useState({ ratio: '1:1', style: 'none', preset: null });
  const [text, setText] = useState('');
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [compare, setCompare] = useState(false);
  // Options start open on big screens and folded away on phones
  const [optionsOpen, setOptionsOpen] = useState(() => window.innerWidth > 1100);
  const listRef = useRef(null);

  useEffect(() => {
    api('/api/studio/options').then(setOptions).catch(() => {});
    api('/api/studio/projects').then(data => {
      setProjects(data.projects);
      if (data.projects[0]) openProject(data.projects[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [project?.messages?.length, busy]);

  function show(next) {
    setProject(next);
    setSettings(next.settings);
    setProjects(list => [
      { id: next.id, name: next.name, updatedAt: next.updatedAt },
      ...list.filter(p => p.id !== next.id)
    ]);
  }

  async function openProject(id) {
    setError('');
    setCompare(false);
    const { project: loaded } = await api(`/api/studio/projects/${id}`);
    setProject(loaded);
    setSettings(loaded.settings);
  }

  function newProject() {
    setProject(null);
    setText('');
    setError('');
    setFresh(false);
    setCompare(false);
  }

  async function changeSettings(change) {
    const next = { ...settings, ...change };
    setSettings(next);
    if (project) {
      const { project: saved } = await api(`/api/studio/projects/${project.id}`, { method: 'PATCH', body: { settings: next } });
      setProject(saved);
    }
  }

  async function pick(imageId) {
    if (!project || imageId === project.currentImageId) return;
    const { project: saved } = await api(`/api/studio/projects/${project.id}`, { method: 'PATCH', body: { currentImageId: imageId } });
    setProject(saved);
    setCompare(false);
  }

  async function send(body) {
    setBusy(true);
    setError('');
    try {
      let target = project;
      if (!target) {
        ({ project: target } = await api('/api/studio/projects', { method: 'POST', body: { name: nameFrom(body.text), settings } }));
        setProject(target);
      }
      // Show the request straight away while the picture is made
      if (body.text) {
        setProject(p => ({ ...p, messages: [...p.messages, { id: 'pending', role: 'user', text: body.text }] }));
      }
      const { project: saved } = await api(`/api/studio/projects/${target.id}/messages`, { method: 'POST', body: { ...body, settings } });
      show(saved);
      setText('');
      setFresh(false);
      onImagesChanged?.();
    } catch (err) {
      if (err.data?.project) show(err.data.project);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function submit(e) {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    send({ text: text.trim(), mode: fresh ? 'new' : 'auto' });
  }

  const versions = project?.versions || [];
  const current = versions.find(v => v.id === project?.currentImageId);
  const parent = current?.parentId && versions.find(v => v.id === current.parentId);
  const hasPicture = Boolean(current);

  return (
    <div className={optionsOpen ? 'studio' : 'studio options-closed'}>
      <section className="chat">
        <div className="chat-head">
          <select value={project?.id || ''} onChange={e => (e.target.value ? openProject(e.target.value) : newProject())}>
            <option value="">New project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="button" className="secondary" onClick={newProject}>+ New</button>
        </div>

        <ul className="messages" ref={listRef}>
          {!project?.messages?.length && (
            <li className="msg msg-assistant">
              <p>Describe the picture you want, in your own words. Then tell me what to change, like “make the armor silver and keep his face the same.”</p>
            </li>
          )}
          {project?.messages?.map(m => <Message key={m.id} message={m} versions={versions} onPick={pick} />)}
          {busy && <li className="msg msg-assistant msg-busy"><p>Painting… about a minute</p></li>}
        </ul>

        <form className="composer" onSubmit={submit}>
          <textarea
            rows={3}
            placeholder={hasPicture ? 'Tell me what to change…' : 'Describe your picture…'}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) submit(e); }}
            disabled={busy}
          />
          <div className="composer-row">
            {hasPicture && (
              <label className="check">
                <input type="checkbox" checked={fresh} onChange={e => setFresh(e.target.checked)} />
                <span>Start a new picture</span>
              </label>
            )}
            <button type="submit" disabled={busy || !text.trim() || !engineReady}>{hasPicture && !fresh ? 'Change it' : 'Create'}</button>
          </div>
          {!engineReady && <p className="hint">The image engine isn't ready. See the status at the top.</p>}
          {error && <p className="error">{error}</p>}
        </form>
      </section>

      <section className="preview">
        {!current ? (
          <div className="preview-empty">
            <span className="empty-mark" aria-hidden="true">✦</span>
            <p>Your picture will appear here.</p>
            <div className="examples">
              {EXAMPLES.map(example => (
                <button key={example} type="button" className="example" onClick={() => setText(example)}>{example}</button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className={compare && parent ? 'preview-stage compare' : 'preview-stage'}>
              {compare && parent && (
                <figure>
                  <img src={parent.url} alt="Before" />
                  <figcaption>Before</figcaption>
                </figure>
              )}
              <figure>
                <img src={current.url} alt={current.text} />
                {compare && parent && <figcaption>After</figcaption>}
              </figure>
              {busy && <div className="preview-busy">Painting…</div>}
            </div>

            <div className="preview-actions">
              <button type="button" className="secondary" disabled={busy || !engineReady} onClick={() => send({ regenerate: true })}>Try again</button>
              {parent && (
                <button type="button" className="secondary" onClick={() => setCompare(!compare)}>{compare ? 'Hide before' : 'Compare with before'}</button>
              )}
              <a className="button-link" href={current.url} download={`${project.name}.png`}>Download PNG</a>
              <span className="preview-meta">{current.ratio} · {current.width}×{current.height}</span>
            </div>

            <ol className="versions" aria-label="Versions">
              {versions.map((v, i) => (
                <li key={v.id}>
                  <button type="button" className={v.id === current.id ? 'version active' : 'version'} onClick={() => pick(v.id)} title={v.text}>
                    <img src={v.url} alt="" />
                    <span>v{i + 1}</span>
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <Options options={options} settings={settings} onChange={changeSettings} open={optionsOpen} setOpen={setOptionsOpen} />
    </div>
  );
}
