import { useEffect, useRef, useState } from "react";
import type { NeuralVoice } from "./types";

export default function NeuralVoices({onUse}: {onUse: (id: string, language: string) => void}) {
  const active=useRef(true);
  const [voices,setVoices]=useState<NeuralVoice[]>([]);
  const [downloading,setDownloading]=useState("");
  const [percent,setPercent]=useState(0);
  const [error,setError]=useState("");
  useEffect(() => {
    let live=true;active.current=true;
    void window.folio?.neuralVoices?.().then(result => {if(live)setVoices(result.voices);}).catch(err => {if(live)setError(err.message);});
    const progress=(event: Event) => {
      const detail=(event as CustomEvent<{id: string;percent: number}>).detail;
      if(live){
        setPercent(detail.percent);setDownloading(detail.percent===100?"":detail.id);
        if(detail.percent===100)void window.folio?.neuralVoices?.().then(result=>{if(live)setVoices(result.voices);}).catch(()=>{});
      }
    };
    window.addEventListener("folio-neural-download",progress);
    return () => {live=false;active.current=false;window.removeEventListener("folio-neural-download",progress);};
  },[]);
  if(!window.folio?.neuralVoices)return null;
  async function download(voice: NeuralVoice) {
    setDownloading(voice.id);setPercent(0);setError("");
    try {
      await window.folio?.downloadNeuralVoice?.(voice.id);
      const result=await window.folio?.neuralVoices?.();if(result && active.current)setVoices(result.voices);
      if(active.current)onUse(voice.id,voice.language);
    }catch(err){if(active.current)setError((err as Error).message);}
    finally{if(active.current)setDownloading("");}
  }
  return <section className="neural-voices" aria-label="Vozes neurais offline">
    <strong>Vozes neurais offline · gratuitas</strong>
    <p>Baixe uma vez e ouça sem internet nem custo de API. A voz é gerada no celular. O acompanhamento dentro de cada frase é estimado.</p>
    {voices.map(voice => <div key={voice.id} className="neural-voice">
      <span>{voice.name}<small>{voice.installed ? "Instalada · offline" : `${Math.ceil(voice.bytes/1000000)} MB para baixar`}</small></span>
      <button type="button" aria-label={`${voice.installed ? "Usar voz" : "Baixar voz"}: ${voice.name}`} disabled={Boolean(downloading)} onClick={() => {if(voice.installed)onUse(voice.id,voice.language);else void download(voice);}}>{voice.installed ? "Usar voz" : "Baixar voz"}</button>
    </div>)}
    {downloading && <label>Baixando e verificando: {percent}%<progress aria-label="Download da voz" value={percent} max={100} /></label>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
