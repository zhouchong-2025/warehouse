/** Encode browser-decoded audio as bounded mono 16-bit PCM, without rewriting speech. */
export const VOICE_SAMPLE_RATE = 16000;
export const VOICE_MAX_SECONDS = 60;
export function encodeVoiceWav(samples: Float32Array): ArrayBuffer {
  if (!samples.length || samples.length > VOICE_SAMPLE_RATE * VOICE_MAX_SECONDS) throw new Error('录音须在60秒以内。');
  const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
  const str = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, VOICE_SAMPLE_RATE, true); view.setUint32(28, VOICE_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => { const s = Math.max(-1, Math.min(1, sample)); view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); });
  return buffer;
}
export function validVoiceWav(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 46 || buffer.byteLength > 44 + VOICE_SAMPLE_RATE * VOICE_MAX_SECONDS * 2) return false;
  const v = new DataView(buffer), tag = (offset: number, text: string) => [...text].every((c, i) => v.getUint8(offset + i) === c.charCodeAt(0));
  return tag(0,'RIFF') && tag(8,'WAVE') && tag(12,'fmt ') && tag(36,'data')
    && v.getUint32(4,true) === buffer.byteLength - 8 && v.getUint32(16,true) === 16
    && v.getUint16(20,true) === 1 && v.getUint16(22,true) === 1 && v.getUint32(24,true) === VOICE_SAMPLE_RATE
    && v.getUint32(28,true) === VOICE_SAMPLE_RATE * 2 && v.getUint16(32,true) === 2 && v.getUint16(34,true) === 16
    && v.getUint32(40,true) === buffer.byteLength - 44 && (buffer.byteLength - 44) % 2 === 0;
}
