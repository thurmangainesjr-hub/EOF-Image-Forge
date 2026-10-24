import React, { useEffect, useState } from 'react';

const PHASE_LABEL = { B: 'Coming in Phase B', C: 'Coming in Phase C' };

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

export default function App() {
  const [health, setHealth] = useState(null);
  const [features, setFeatures] = useState([]);
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
  }, []);

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
        <h2>Tools</h2>
        <ul className="tools">
          {features.map(f => (
            <li key={f.id} className="tool">
              <span className="tool-name">{f.name}</span>
              <span className="tool-phase">{PHASE_LABEL[f.phase] || f.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
