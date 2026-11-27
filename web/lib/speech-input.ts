/** Browser speech adapter. Audio is handled by the browser, never sent to our API. */
export type SpeechResult = { isFinal: boolean; [index: number]: { transcript: string } };
export type SpeechEngine = {
  lang: string; continuous: boolean; interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
export type SpeechConstructor = new () => SpeechEngine;
export function speechConstructor(scope: { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor }) {
  return scope.SpeechRecognition || scope.webkitSpeechRecognition;
}
export function speechError(error: string) {
  switch (error) {
    case 'not-allowed': case 'service-not-allowed': return '无法使用麦克风或语音服务，请检查浏览器权限，也可使用键盘听写。';
    case 'audio-capture': return '没有可用的麦克风，请检查设备连接。';
    case 'network': return '语音识别服务连接失败，请检查网络，或使用键盘听写。';
    case 'no-speech': return '没有听到清晰语音，请重试。';
    case 'language-not-supported': return '当前语音服务不支持中文，请使用键盘听写。';
    default: return '语音输入未完成，请重试或手动输入。';
  }
}
export function createSpeechSession(engine: SpeechEngine, callbacks: {
  onText(text: string): void; onPreview(text: string): void;
  onState(state: 'starting' | 'listening' | 'stopping' | 'idle'): void;
  onMessage(text: string): void;
}) {
  let active = true;
  let gotText = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = () => {
    if (!active) return;
    active = false; clearTimeout(timer);
    engine.onstart = engine.onresult = engine.onerror = engine.onend = null;
    callbacks.onPreview(''); callbacks.onState('idle');
  };
  const abort = () => { finish(); try { engine.abort(); } catch { /* already ended */ } };
  const stop = () => {
    if (!active) return;
    clearTimeout(timer); callbacks.onState('stopping');
    timer = setTimeout(abort, 5000);
    try { engine.stop(); } catch { abort(); }
  };
  engine.lang = 'zh-CN'; engine.continuous = true; engine.interimResults = true;
  engine.onstart = () => { if (active) callbacks.onState('listening'); };
  engine.onresult = event => {
    if (!active) return;
    const results = Array.from(event.results);
    const final = results.filter(r => r.isFinal).map(r => r[0]?.transcript || '').join('').trim();
    const interim = results.filter(r => !r.isFinal).map(r => r[0]?.transcript || '').join('').trim();
    if (final) { gotText = true; callbacks.onText(final); }
    callbacks.onPreview(interim);
  };
  engine.onerror = event => {
    if (!active) return;
    callbacks.onMessage(speechError(event.error)); abort();
  };
  engine.onend = () => {
    if (!active) return;
    callbacks.onMessage(gotText ? '已转成文字，请核对型号、数值和单位，再点击搜索。' : '未取得识别文字，请重试或手动输入。');
    finish();
  };
  callbacks.onState('starting');
  timer = setTimeout(stop, 60000);
  try { engine.start(); } catch { callbacks.onMessage('语音服务无法启动，请重试或使用键盘听写。'); abort(); }
  return { stop, abort };
}
