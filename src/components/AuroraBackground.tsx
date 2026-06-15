import "./AuroraBackground.css";

// AuroraBackground — fondo animado aurora/lava-lamp.
// Se renderiza fijo detrás de cualquier contenido (z-index: -1).
// Solo se usa en la página de login; no afecta al layout global.

export default function AuroraBackground() {
  return (
    <div className="aurora-bg" aria-hidden="true">
      <div className="aurora-blob aurora-blob-1" />
      <div className="aurora-blob aurora-blob-2" />
      <div className="aurora-blob aurora-blob-3" />
      <div className="aurora-blob aurora-blob-4" />
      <div className="aurora-overlay" />
    </div>
  );
}
