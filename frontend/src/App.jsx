import React, { useEffect, useState } from 'react';
import PuppetStudio from './puppet/PuppetStudio.jsx';
import Studio from './studio/Studio.jsx';

const PHASE_LABEL = { B: 'Phase B', C: 'Coming in Phase C' };
const STATUS_LABEL = { built: 'Ready to try', planned: 'Planned' };
const STYLES = ['painted', 'photo', 'illustrated', 'comic', 'noir'];

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function EngineStatus({ health, error }) {
  if (error) {
    return <p className="status status-bad">Image Forge server is off. Start it with <code>npm run dev</code> in the backend folder.</p>;
  }
  if (!health) return <p className="status">Checking the image engine…</p>;
  const { engine } = health;
  const cloud = engine.name === 'replicate';
  if (engine.online) {
    return (
      <p className="status status-good" title={cloud ? engine.model : engine.devices?.join(', ')}>
        {cloud ? 'Cloud engine ready (Replicate)' : 'ComfyUI ready'}
      </p>
    );
  }
  return (
    <p className="status status-warn" title={engine.error}>
      {cloud
        ? `Cloud engine not ready: ${engine.error}`
        : 'No image engine. Start ComfyUI or add a Replicate key.'}
    </p>
  );
}

// Cover art with the title and author laid over it as real text
function Cover({ image }) {
  return (
    <figure className="cover">
      <img src={image.url} alt={`Cover art for ${image.overlay?.title}`} />
      {image.overlay && (
        <figcaption>
          <span className="cover-title">{image.overlay.title}</span>
          <span className="cover-author">{image.overlay.author}</span>
        </figcaption>
      )}
    </figure>
  );
}

function ImageCard({ image, large }) {
  const label = image.kind === 'cover' ? image.overlay?.title || 'Cover'
    : image.kind === 'studio' ? image.text?.slice(0, 40) || 'Studio picture'
    : image.request?.name || 'Character';
  return (
    <li className={`card card-${image.kind}${large ? ' card-large' : ''}`}>
      <a href={image.url} target="_blank" rel="noreferrer" className="card-art" title="Open full size">
        {image.kind === 'cover' ? <Cover image={image} /> : <img src={image.url} alt={`Character sheet of ${image.request?.name}`} />}
      </a>
      <div className="card-meta">
        <span className="card-title">{label}</span>
        <span className="card-kind">{image.kind === 'cover' ? 'Book cover' : image.kind === 'studio' ? 'Studio' : 'Character sheet'}</span>
        <a className="card-download" href={image.url} download={`${label}.png`}>Download</a>
      </div>
    </li>
  );
}

function CoverForm({ disabled, onMade }) {
  const [form, setForm] = useState({ title: '', author: '', genre: '', description: '', style: 'painted' });
  const [bookId, setBookId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const set = key => e => setForm({ ...form, [key]: e.target.value });

  async function fillFromLibrary() {
    setMessage('');
    try {
      const res = await fetch(`/api/library/books/${encodeURIComponent(bookId.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm({ ...form, ...data.book });
    } catch (e) {
      setMessage(e.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const { image } = await postJson('/api/images/cover', form);
      onMade(image);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="row">
        <input placeholder="EOF Library book id (optional)" value={bookId} onChange={e => setBookId(e.target.value)} />
        <button type="button" className="secondary" onClick={fillFromLibrary} disabled={!bookId.trim()}>Fill from Library</button>
      </div>
      <input placeholder="Book title" value={form.title} onChange={set('title')} required />
      <input placeholder="Author" value={form.author} onChange={set('author')} required />
      <input placeholder="Genre (for example Fantasy)" value={form.genre} onChange={set('genre')} />
      <textarea placeholder="What should the cover show?" rows={3} value={form.description} onChange={set('description')} />
      <select value={form.style} onChange={set('style')}>
        {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <button type="submit" disabled={disabled || busy}>{busy ? 'Painting… about a minute' : 'Make cover'}</button>
      {message && <p className="error">{message}</p>}
    </form>
  );
}

function CharacterForm({ disabled, onMade }) {
  const [form, setForm] = useState({ name: '', description: '', style: 'painted' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const set = key => e => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const { image } = await postJson('/api/images/character', form);
      onMade(image);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <input placeholder="Character name" value={form.name} onChange={set('name')} required />
      <textarea placeholder="What do they look like? Clothes, age, colors…" rows={3} value={form.description} onChange={set('description')} required />
      <select value={form.style} onChange={set('style')}>
        {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <button type="submit" disabled={disabled || busy}>{busy ? 'Painting… about a minute' : 'Make character sheet'}</button>
      {message && <p className="error">{message}</p>}
    </form>
  );
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [features, setFeatures] = useState([]);
  const [images, setImages] = useState([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(setHealth)
      .catch(() => setError(true));
    fetch('/api/features')
      .then(res => (res.ok ? res.json() : { features: [] }))
      .then(data => setFeatures(data.features))
      .catch(() => {});
    loadImages();
  }, []);

  function loadImages() {
    fetch('/api/images')
      .then(res => (res.ok ? res.json() : { images: [] }))
      .then(data => setImages(data.images))
      .catch(() => {});
  }

  const engineOff = !health?.engine?.online;
  const addImage = image => setImages(list => [image, ...list]);

  const [tab, setTab] = useState('cover');
  const [view, setView] = useState('studio');
  const [latest, ...older] = images;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">✦</span>
          <div>
            <h1>EOF Image Forge</h1>
            <p className="lead">Book covers, character art and talking puppets for the E.O.F. Creative Cloud</p>
          </div>
        </div>
        <nav className="views">
          <button type="button" className={view === 'studio' ? 'view active' : 'view'} onClick={() => setView('studio')}>Studio</button>
          <button type="button" className={view === 'images' ? 'view active' : 'view'} onClick={() => setView('images')}>Covers &amp; characters</button>
          <button type="button" className={view === 'puppet' ? 'view active' : 'view'} onClick={() => setView('puppet')}>Puppet</button>
        </nav>
        {view !== 'puppet' && <EngineStatus health={health} error={error} />}
      </header>

      {view === 'studio' && <Studio engineReady={!engineOff} onImagesChanged={loadImages} />}
      {view === 'puppet' && <PuppetStudio images={images} />}
      {view === 'images' && (
      <main className="layout">
        <aside className="maker">
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'cover'} className={tab === 'cover' ? 'tab active' : 'tab'} onClick={() => setTab('cover')}>Book cover</button>
            <button type="button" role="tab" aria-selected={tab === 'character'} className={tab === 'character' ? 'tab active' : 'tab'} onClick={() => setTab('character')}>Character</button>
          </div>
          {tab === 'cover' ? (
            <>
              <p className="hint">The art is made without words. The real title and author go on top.</p>
              <CoverForm disabled={engineOff} onMade={addImage} />
            </>
          ) : (
            <>
              <p className="hint">A full-body sheet with front and side views, to keep a character looking the same.</p>
              <CharacterForm disabled={engineOff} onMade={addImage} />
            </>
          )}

          <ul className="tools">
            {features.map(f => (
              <li key={f.id} className={`tool tool-${f.status}`}>
                <span>{f.name}</span>
                <span className="tool-phase">{STATUS_LABEL[f.status] || PHASE_LABEL[f.phase]}</span>
              </li>
            ))}
          </ul>
        </aside>

        <section className="stage">
          {!latest ? (
            <div className="empty">
              <span className="empty-mark" aria-hidden="true">✦</span>
              <p>Your covers and characters will show up here.</p>
            </div>
          ) : (
            <>
              <h2>Newest</h2>
              <ul className="spotlight">
                <ImageCard image={latest} large />
              </ul>
              {older.length > 0 && (
                <>
                  <h2>Earlier <span className="count">{older.length}</span></h2>
                  <ul className="gallery">
                    {older.map(image => <ImageCard key={image.id} image={image} />)}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
      </main>
      )}
    </div>
  );
}
