"use client";

import { useEffect, useRef, useState } from 'react';
import { encodeVoiceWav, VOICE_SAMPLE_RATE } from '@/lib/voice-recording';

type Props = { value: string; onChange(value: string): void; onActiveChange(active: boolean): void; disabled: boolean };
type State = 'idle' | 'starting' | 'recording' | 'transcribing';
export default function VoiceInput({ value, onChange, onActiveChange, disabled }: Props) {
  const [availability, setAvailability] = useState<'checking' | 'ready' | 'unsupported' | 'insecure' | 'unavailable'>('checking');
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');
  const callbacks = useRef({ onChange, onActiveChange });
  const operation = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const upload = useRef<AbortController | null>(null);
  const context = useRef<AudioContext | null>(null);
  useEffect(() => { callbacks.current = { onChange, onActiveChange }; });
  const transition = (next: State) => { setState(next); callbacks.current.onActiveChange(next !== 'idle'); };
  const closeMicrophone = () => { clearTimeout(timer.current); stream.current?.getTracks().forEach(track=>track.stop()); stream.current=null; };
  const cancel = () => {
    operation.current++; upload.current?.abort();
    if(recorder.current){recorder.current.onstop=null;recorder.current.ondataavailable=null;recorder.current.onerror=null;try{if(recorder.current.state!=='inactive')recorder.current.stop();}catch{}}
    closeMicrophone(); void context.current?.close().catch(()=>{}); context.current=null;
    transition('idle');
  };
  useEffect(() => {
    const controller=new AbortController();
    if(!window.isSecureContext) setAvailability('insecure');
    else if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !window.AudioContext || !window.OfflineAudioContext) setAvailability('unsupported');
    else fetch('/api/transcribe',{signal:controller.signal}).then(r=>r.json()).then(data=>setAvailability(data.available?'ready':'unavailable')).catch(()=>{if(!controller.signal.aborted)setAvailability('unavailable');});
    const hide=()=>{if(document.hidden)cancel();};document.addEventListener('visibilitychange',hide);
    return ()=>{controller.abort();cancel();document.removeEventListener('visibilitychange',hide);};
    // Resources must be stopped on unmount; latest callbacks live in refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{if(disabled)cancel();},[disabled]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = async () => {
    if(state!=='idle' || availability!=='ready')return;
    const id=++operation.current, base=value.trimEnd();setMessage('');transition('starting');
    try {
      // Create/resume in the user's gesture for mobile audio policies.
      const audio=new AudioContext(); context.current=audio;void audio.resume().catch(()=>{});
      const media=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
      if(id!==operation.current){media.getTracks().forEach(t=>t.stop());return;}
      stream.current=media;
      const type=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
      const recording=new MediaRecorder(media,type?{mimeType:type}:undefined);recorder.current=recording;
      const chunks: Blob[]=[];let bytes=0;
      recording.ondataavailable=e=>{if(id!==operation.current)return;if(e.data.size){chunks.push(e.data);bytes+=e.data.size;if(bytes>8*1024*1024){cancel();setMessage('录音过大，请缩短录音后重试。');}}};
      recording.onerror=()=>{if(id!==operation.current)return;cancel();setMessage('录音设备未能完成录制，请检查麦克风权限。');};
      recording.onstop=async()=>{
        if(id!==operation.current)return;closeMicrophone();transition('transcribing');
        try{
          const decoded=await audio.decodeAudioData(await new Blob(chunks,{type:recording.mimeType}).arrayBuffer());
          if(id!==operation.current)return;
          if(decoded.duration>60.5)throw new Error('录音超过60秒，请缩短后重试。');
          const frames=Math.min(60*VOICE_SAMPLE_RATE,Math.ceil(decoded.duration*VOICE_SAMPLE_RATE));
          const offline=new OfflineAudioContext(1,frames,VOICE_SAMPLE_RATE),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
          const pcm=await offline.startRendering();if(id!==operation.current)return;
          const wav=encodeVoiceWav(pcm.getChannelData(0)),form=new FormData();form.append('file',new Blob([wav],{type:'audio/wav'}),'speech.wav');
          const controller=new AbortController();upload.current=controller;
          const response=await fetch('/api/transcribe',{method:'POST',body:form,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(55000)])});
          const data=await response.json();if(id!==operation.current)return;
          if(!response.ok)throw new Error(data.error||'语音转写失败，请重试。');
          if(typeof data.text!=='string'||!data.text.trim())throw new Error('没有识别到清晰语音，请重试。');
          callbacks.current.onChange(base?`${base}\n${data.text}`:data.text);
          setMessage('转写完成，请核对型号、数值和单位，再点击搜索。');
        }catch(error){if(id===operation.current)setMessage(error instanceof Error?error.message:'语音转写未完成，请重试。');}
        finally{if(id===operation.current){void audio.close().catch(()=>{});context.current=null;transition('idle');}}
      };
      recording.start(1000);transition('recording');timer.current=setTimeout(()=>{if(recording.state==='recording')recording.stop();},59000);
    }catch(error){if(id!==operation.current)return;cancel();setMessage(error instanceof DOMException&&error.name==='NotAllowedError'?'麦克风权限被拒绝，请在浏览器或系统设置中允许此页面使用麦克风。':error instanceof DOMException&&error.name==='NotFoundError'?'没有找到可用的麦克风。':'录音无法启动，请检查麦克风与浏览器支持。');}
  };
  const active=state!=='idle';
  return <div className="text-left">
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={()=>state==='recording'?recorder.current?.stop():void start()} disabled={disabled||availability!=='ready'||state==='starting'||state==='transcribing'} aria-pressed={active} aria-label={state==='recording'?'停止录音并转写':'开始语音输入'}
        className={`min-h-11 inline-flex items-center gap-2 rounded-lg border px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#58a6ff] disabled:opacity-50 ${active?'border-[#ff7b72] bg-[#ff7b72]/10 text-[#ffb4ad]':'border-[#30363d] bg-[#161b22] text-[#c9d1d9] hover:border-[#58a6ff]'}`}>
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3" strokeWidth="2"/><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3m-4 0h8" strokeWidth="2" strokeLinecap="round"/></svg>
        {state==='starting'?'等待麦克风…':state==='recording'?'停止并转写':state==='transcribing'?'正在转写…':'语音输入'}
      </button>
      {active&&<button type="button" onClick={()=>{cancel();setMessage('已取消，录音未写入搜索框。');}} className="min-h-11 px-2 text-xs text-[#8b949e] underline">取消</button>}
    </div>
    <p id="voice-help" className="mt-2 text-xs leading-relaxed text-[#8b949e]">
      {availability==='unsupported'?'此浏览器不支持网页录音，可使用系统键盘听写。':availability==='insecure'?'网页录音需要 HTTPS 或本机 localhost；也可使用系统键盘听写。':availability==='unavailable'?'语音转写服务暂不可用，请稍后刷新或使用键盘听写。':'录音最多60秒，停止后发送给 DeepSeek 转写，按音频时长计费。仅填入文字，不自动搜索。'}
    </p>
    <p role="status" aria-live="polite" className="mt-1 text-xs leading-relaxed text-[#a5e6f5]">{state==='recording'?'正在录音，完成后点击“停止并转写”。':state==='transcribing'?'录音已结束，正在转成文字…':message}</p>
  </div>;
}
