import { useEffect, useState } from "react";

/**
 * Video del hero con carga diferida: se pinta el póster de inmediato
 * (mismo primer cuadro del video) y el MP4 solo se monta cuando la
 * página terminó de cargar; al reproducir entra con fade. Nació del
 * reporte de móvil "queda cargando la mitad" (2 sep 2026) cuando el
 * video anterior de 20 MB bloqueaba el primer render.
 */
export function HeroVideo({
  src,
  poster,
  aspect = "1920 / 1080",
  alt = "Demo de Psicomorfosis",
}: {
  src: string;
  poster: string;
  aspect?: string;
  alt?: string;
}) {
  const [ready, setReady] = useState(false); // ventana cargada → montar el video
  const [playing, setPlaying] = useState(false); // primer frame → fade in

  useEffect(() => {
    if (document.readyState === "complete") {
      setReady(true);
      return;
    }
    const onLoad = () => setReady(true);
    window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return (
    <div className="relative w-full" style={{ aspectRatio: aspect }}>
      <img
        src={poster}
        alt={alt}
        fetchPriority="high"
        className="absolute inset-0 w-full h-full object-cover"
      />
      {ready && (
        <video
          src={src}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onPlaying={() => setPlaying(true)}
          aria-hidden
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${playing ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}
