import { NextRequest, NextResponse } from "next/server";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";

const SYSTEM_PROMPT = `将用户的芯片选型需求转为JSON。可用标签: CAN FD, 特定帧唤醒(Partial Networking), 低功耗唤醒, VIO, 高耐压, LIN, 轨到轨, 高速(≥50MHz), 中速(≥10MHz), 超低功耗(≤1µA), 低功耗(≤50µA), 精密(≤1mV Vos), 车规AEC-Q100, 高压(≥30V), 车规级, 工业级, 消费级, 千兆, 2.5G, 百兆, Pin-to-Pin兼容, 5kVrms隔离, 3kVrms隔离, 隔离电源, 电流传感器, 温度传感器, 压力传感器, 位置传感器。

规则: 特定帧唤醒=Partial Networking(非sleep/standby); 车规=车规AEC-Q100; 隔离+电压→对应kVrms标签。

仅输出JSON: {"features":[],"vendor":null,"category_hint":"","explanation":"","confidence":"high|medium|low"}`;

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query || !DEEPSEEK_API_KEY) {
      return NextResponse.json({ features: [], vendor: null, category_hint: null, explanation: "LLM未配置", confidence: "low" });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: query },
        ],
        temperature: 0.1,
        max_tokens: 150,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `DeepSeek ${response.status}`, features: [], vendor: null, category_hint: null, explanation: "", confidence: "low" });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ features: [], vendor: null, category_hint: null, explanation: "", confidence: "low" });
    }
    
    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (e: any) {
    if (e.name === "AbortError") {
      return NextResponse.json({ features: [], vendor: null, category_hint: null, explanation: "LLM超时", confidence: "low" });
    }
    return NextResponse.json({ error: e.message, features: [], vendor: null, category_hint: null, explanation: "", confidence: "low" });
  }
}
