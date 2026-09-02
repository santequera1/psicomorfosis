import { useEffect, useState } from "react";

/**
 * Video del hero (20 MB): con autoplay directo, en celular la página se
 * quedaba "cargando la mitad" o tardaba en pintar (reporte 2 sep 2026).
 * Arreglo: se muestra de inmediato el still del video (la misma imagen
 * del OG, mismo encuadre y fondo) y el MP4 solo se monta cuando la
 * página ya terminó de cargar todo lo demás; al reproducir hace fade.
 */
export function HeroVideo() {
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
    <div className="relative w-full" style={{ aspectRatio: "1920 / 1117" }}>
      <img
        src="/landing/preview-psicoapp.jpg"
        alt="Demo de Psicomorfosis"
        fetchPriority="high"
        className="absolute inset-0 w-full h-full object-cover"
      />
      {ready && (
        <video
          src="/landing/Video-Dashboard-Psic.mp4"
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
