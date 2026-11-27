import { transcribe } from './service';
export const runtime = 'nodejs';
export const maxDuration = 60;
const key = () => process.env.WHOLE_QUERY_MODEL_ENABLED === '1' ? process.env.DEEPSEEK_API_KEY || '' : '';
let active = 0;
let calls: number[] = [];
export async function GET() {
  return Response.json({available: Boolean(key()),provider:'DeepSeek',maxSeconds:60},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request: Request) {
  const expected = process.env.LOCAL_MODEL_TEST_ORIGIN;
  if(process.env.LOCAL_MODEL_TESTING_ONLY === '1' && request.headers.get('origin') !== expected) return Response.json({error:'当前仅开放本地语音测试。'},{status:403});
  const now=Date.now();calls=calls.filter(t=>now-t<60000);
  if(active>=2 || calls.length>=10) return Response.json({error:'语音请求较多，请稍后重试。'},{status:429});
  active++;calls.push(now);
  try { return await transcribe(request,key()); } finally { active--; }
}
