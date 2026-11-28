import { validVoiceWav, voiceWavHasSignal } from '../../../lib/voice-recording.ts';
const MAX_BODY = 2_000_000;
const reply = (body: object, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
export async function transcribe(request: Request, key: string, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  // Next may normalize a loopback request URL to localhost; the browser uses Host.
  const expectedOrigin = request.headers.get('host') ? `${url.protocol}//${request.headers.get('host')}` : url.origin;
  if (request.headers.get('origin') !== expectedOrigin) return reply({error:'语音请求来源不允许。'},403);
  if (!key) return reply({error:'语音转写服务未配置，请联系管理员。'},503);
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) return reply({error:'录音上传格式不正确。'},400);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (Number(request.headers.get('content-length')) > MAX_BODY) return reply({error:'录音过大，请缩短至60秒以内。'},413);
    reader = request.body?.getReader(); if (!reader) return reply({error:'没有录音内容。'},400);
    const chunks: Uint8Array[] = []; let total = 0;
    while (true) { const {done,value} = await reader.read(); if (done) break; total += value.length;
      if (total > MAX_BODY) { await reader.cancel(); return reply({error:'录音过大，请缩短至60秒以内。'},413); } chunks.push(value); }
    const bytes = new Uint8Array(total); let offset=0; for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const form = await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')!}}).formData();
    const file = form.get('file');
    const wav = file instanceof File ? await file.arrayBuffer() : null;
    if (!(file instanceof File) || !wav || !validVoiceWav(wav)) return reply({error:'录音格式无效，请重新录制（最多60秒）。'},400);
    if (!voiceWavHasSignal(wav)) return reply({error:'录音没有采集到声音，请检查此站点使用的麦克风和静音状态。',code:'silent_audio'},422);
    const upload = new FormData(); upload.append('file', file, 'speech.wav');
    const response = await fetcher('https://api.deepseek.com/v1/tools/asr',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:upload,signal:AbortSignal.any([request.signal,AbortSignal.timeout(45000)]),redirect:'error'});
    if (!response.ok) {
      if (response.status === 402) return reply({error:'语音转写的模型账户余额不足。请联系管理员，或用键盘输入。',code:'voice_model_balance'},502);
      if (response.status === 429) return reply({error:'语音转写服务商限制了请求频率。请稍后重试，或用键盘输入。',code:'voice_provider_rate_limit'},502);
      const errors: Record<number,string> = {401:'语音服务密钥无效，请联系管理员。',403:'当前账号暂不能使用语音转写。',404:'当前语音转写接口不可用，请稍后重试。'};
      return reply({error:errors[response.status] || '语音转写服务暂时不可用，请稍后再试。'},502);
    }
    const data = await response.json();
    if(typeof data.text !== 'string' || data.text.length > 12000) return reply({error:'语音服务返回异常，请重试。'},502);
    if(!data.text.trim()) return reply({error:'录音已送达转写服务，但未返回文字。请试录一段完整短句，或使用系统键盘听写。',code:'empty_transcript'},422);
    return reply({text:data.text.trim()});
  } catch { return reply({error:'语音上传或转写未完成，请检查网络后重试。'},502); }
  finally { reader?.releaseLock(); }
}
