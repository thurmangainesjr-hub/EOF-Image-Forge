import React, { useEffect, useState } from 'react';

const PHASE_LABEL = { B: 'Phase B', C: 'Coming in Phase C' };
const STATUS_LABEL = { built: 'Works when ComfyUI is running', planned: 'Planned' };
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
    return <p className="status status-bad">The Image Forge server is not running. Start it with <code>npm run dev</code> in the backend folder.</p>;
  }
  if (!health) return <p className="status">Checking the image engine…</p>;
  const { engine } = health;
  if (engine.online) {
    return (
      <p className="status status-good">
        ComfyUI is running{engine.devices?.length ? ` on ${engine.devices.join(', ')}` : ''}.
      </p>
    );
  }
  return (
    <p className="status status-warn">
      ComfyUI is not running, so no images can be made right now. Start ComfyUI on your PC, then reload this page.
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

function ImageCard({ image }) {
  return (
    <li className="card">
      {image.kind === 'cover' ? <Cover image={image} /> : <img src={image.url} alt={`Character sheet of ${image.request?.name}`} />}
      <p className="card-meta">
        {image.kind === 'cover' ? 'Cover' : `Character: ${image.request?.name}`} · seed {image.seed}
      </p>
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
      <button type="submit" disabled={disabled || busy}>{busy ? 'ComfyUI is painting… (about a minute)' : 'Make cover'}</button>
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
      <button type="submit" disabled={disabled || busy}>{busy ? 'ComfyUI is painting… (about a minute)' : 'Make character sheet'}</button>
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
    fetch('/api/images')
      .then(res => (res.ok ? res.json() : { images: [] }))
      .then(data => setImages(data.images))
      .catch(() => {});
  }, []);

  const engineOff = !health?.engine?.online;
  const addImage = image => setImages(list => [image, ...list]);

  return (
    <main className="page">
      <header>
        <h1>EOF Image Forge</h1>
        <p className="lead">Book covers, character art and animated character puppets.</p>
      </header>

      <section>
        <h2>Image engine</h2>
        <EngineStatus health={health} error={error} />
      </section>

      <section>
        <h2>Book cover</h2>
        <p className="hint">The art is made without words; the title and author are added on top as real text.</p>
        <CoverForm disabled={engineOff} onMade={addImage} />
      </section>

      <section>
        <h2>Character sheet</h2>
        <CharacterForm disabled={engineOff} onMade={addImage} />
      </section>

      {images.length > 0 && (
        <section>
          <h2>Made so far</h2>
          <ul className="gallery">
            {images.map(image => <ImageCard key={image.id} image={image} />)}
          </ul>
        </section>
      )}

      <section>
        <h2>Tools</h2>
        <ul className="tools">
          {features.map(f => (
            <li key={f.id} className="tool">
              <span className="tool-name">{f.name}</span>
              <span className="tool-phase">{STATUS_LABEL[f.status] || PHASE_LABEL[f.phase]}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
