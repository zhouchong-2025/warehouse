import { NextRequest, NextResponse } from "next/server";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_BASE = "https://api.deepseek.com/v1";

const SYSTEM_PROMPT = `You are a semiconductor product search interpreter. Your job: convert natural language queries (Chinese or English) into precise structured filters for a chip selection database.

The database contains products from: 纳芯微(Novosense), 思瑞浦(3PEAK), 裕太微(Yutai).
Product categories: CAN/LIN transceivers, op-amps, comparators, Ethernet PHYs, isolated gate drivers, sensors, DCDC converters, analog switches, etc.

Available feature tags in the database (you MUST use these exact strings):
- CAN FD
- 特定帧唤醒(Partial Networking)
- 低功耗唤醒
- VIO
- 高耐压
- LIN
- 轨到轨
- 高速(≥50MHz)
- 中速(≥10MHz)
- 超低功耗(≤1µA)
- 低功耗(≤50µA)
- 精密(≤1mV Vos)
- 车规AEC-Q100
- 高压(≥30V)
- 车规级
- 工业级
- 消费级
- 千兆
- 2.5G
- 百兆
- Pin-to-Pin兼容
- 5kVrms隔离
- 3kVrms隔离
- 隔离电源
- 电流传感器
- 温度传感器
- 压力传感器
- 位置传感器

CRITICAL SEMANTIC RULES:
- "特定帧唤醒" / "selective wake-up" / "选择性唤醒" → MUST use "特定帧唤醒(Partial Networking)". This is NOT the same as sleep/standby.
- "待机唤醒" / "低功耗唤醒" / "standby wake" → use "低功耗唤醒"
- "省电" / "低功耗" / "low power" when referring to op-amps → use "低功耗(≤50µA)" or "超低功耗(≤1µA)"
- "高速" for op-amps → use "高速(≥50MHz)" or "中速(≥10MHz)"
- "汽车级" / "车规" → use "车规AEC-Q100" or "车规级"
- "隔离" / "isolation" with voltage → use "5kVrms隔离" or "3kVrms隔离"
- "网口" / "以太网" / "PHY" → these are product categories, not features

Output ONLY a JSON object with these fields (no markdown, no explanation):
{
  "features": ["exact tag from list above"],
  "vendor": "vendor slug or null",
  "category_hint": "hint string or null",
  "explanation": "brief Chinese explanation of your interpretation",
  "confidence": "high|medium|low"
}`;

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query || !DEEPSEEK_API_KEY) {
      return NextResponse.json({ error: "Missing query or API key" }, { status: 400 });
    }

    const response = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: query },
        ],
        temperature: 0.1,
        max_tokens: 300,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Parse JSON from LLM response (strip markdown code fences if any)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse LLM response", raw: content }, { status: 500 });
    }
    
    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
