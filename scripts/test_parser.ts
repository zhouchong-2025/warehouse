/**
 * test_parser.ts — Parser test harness
 * Run: npx tsx scripts/test_parser.ts
 * 0 tokens, ~2 seconds. Run before every parser change.
 */

import { parseQuery } from '../web/app/api/interpret/query_parser';

interface TestCase {
  query: string;
  expectedFeatures: string[];
  expectedMust?: string[];
  /** Tags that should NOT appear in features */
  forbiddenFeatures?: string[];
  /** Tags that must appear in exclude_tags */
  expectedExclude?: string[];
  /** Expected needsLLM */
  needsLLM?: boolean;
}

const TESTS: TestCase[] = [
  // ── 非隔离 modifier ──
  { query: '非隔离 rs485', expectedFeatures: ['RS-485'], forbiddenFeatures: ['隔离', 'kVrms', '隔离栅极驱动'], expectedExclude: ['隔离', '5kVrms隔离', '3kVrms隔离', '隔离栅极驱动', '隔离电源', '隔离放大器', '隔离I2C', '隔离CAN', '隔离RS485'] },
  { query: '非隔离 485 高速', expectedFeatures: ['RS-485', '高速(≥50MHz)'], forbiddenFeatures: ['隔离'] },
  { query: '非隔离 RS-485 半双工', expectedFeatures: ['RS-485', '半双工'], forbiddenFeatures: ['隔离'] },
  { query: '非隔离 CAN 车规', expectedFeatures: ['CAN-FD', '车规AEC-Q100'], forbiddenFeatures: ['隔离'], expectedExclude: ['隔离', '5kVrms隔离', '3kVrms隔离', '隔离栅极驱动', '隔离电源', '隔离放大器', '隔离I2C', '隔离CAN', '隔离RS485'] },
  { query: '非隔离 电流传感器', expectedFeatures: ['电流传感器'], forbiddenFeatures: ['隔离'] },
  { query: '非隔离栅极驱动 4A', expectedFeatures: ['非隔离栅极驱动'], forbiddenFeatures: ['隔离', '隔离栅极驱动'] },

  // ── 隔离 (should keep isolation context) ──
  { query: '思瑞浦 隔离', expectedFeatures: ['隔离'], expectedMust: ['隔离'], needsLLM: false },
  { query: '隔离 RS-485 20Mbps', expectedFeatures: ['隔离RS485', 'RS-485', '隔离', '20Mbps'], expectedExclude: [] },
  { query: '隔离 485 全双工', expectedFeatures: ['隔离RS485', 'RS-485', '隔离', '全双工'], expectedMust: ['隔离RS485', '全双工', 'RS-485', '隔离'], needsLLM: false },
  { query: '隔离CAN', expectedFeatures: ['隔离CAN', 'CAN-FD', '隔离'], needsLLM: false },
  { query: '集成隔离电源的隔离CAN', expectedFeatures: ['集成隔离电源的隔离CAN', '隔离电源', 'CAN-FD', '隔离'], expectedMust: ['集成隔离电源的隔离CAN', '隔离电源', 'CAN-FD', '隔离'], needsLLM: false },
  { query: '集成隔离电源的隔离RS485', expectedFeatures: ['集成隔离电源的隔离RS485', '隔离电源', 'RS-485', '隔离'], expectedMust: ['集成隔离电源的隔离RS485', '隔离电源', 'RS-485', '隔离'], needsLLM: false },
  { query: '隔离栅极驱动 5kVrms', expectedFeatures: ['隔离栅极驱动', '5kVrms隔离'] },

  // ── Standard interface ──
  { query: '485 3T5R', expectedFeatures: ['RS-485', '3T5R'] },
  { query: '485 半双工', expectedFeatures: ['RS-485', '半双工'] },
  { query: 'CAN FD 低功耗唤醒', expectedFeatures: ['CAN-FD', '低功耗唤醒'] },
  { query: 'LIN', expectedFeatures: ['LIN'], needsLLM: false },
  { query: 'MLVDS', expectedFeatures: ['MLVDS'], needsLLM: false },
  { query: 'I2C IO扩展', expectedFeatures: ['I2C', 'IO扩展器'], expectedMust: ['I2C', 'IO扩展器'], needsLLM: false },
  { query: '16通道IO扩展器', expectedFeatures: ['IO扩展器', '16通道'], expectedMust: ['IO扩展器', '16通道'], needsLLM: false },
  { query: '车规16通道IO扩展器', expectedFeatures: ['IO扩展器', '车规AEC-Q100', '16通道'], expectedMust: ['IO扩展器', '车规AEC-Q100', '16通道'], needsLLM: false },
  { query: '隔离I2C', expectedFeatures: ['隔离I2C', 'I2C', '隔离'], needsLLM: false },
  { query: 'SBC 车规', expectedFeatures: ['SBC', '车规AEC-Q100'], expectedMust: ['SBC', '车规AEC-Q100'] },
  { query: 'RS-485 工业级', expectedFeatures: ['RS-485', '工业级'], expectedMust: ['RS-485', '工业级'] },
  { query: '网卡 消费级 千兆', expectedFeatures: ['网卡', '消费级', '千兆'], expectedMust: ['网卡', '消费级', '千兆'] },
  { query: '非隔离栅极驱动', expectedFeatures: ['非隔离栅极驱动'], expectedMust: ['非隔离栅极驱动'], forbiddenFeatures: ['隔离栅极驱动', '隔离'] },
  { query: '霍尔 电流传感器', expectedFeatures: ['霍尔', '电流传感器'], expectedMust: ['霍尔', '电流传感器'] },
  { query: '千兆交换机', expectedFeatures: ['千兆', '交换机'], expectedMust: ['千兆', '交换机'] },
  { query: '千兆网卡', expectedFeatures: ['千兆', '网卡'], expectedMust: ['千兆', '网卡'] },
  { query: '系统基础芯片 推荐', expectedFeatures: ['SBC'], needsLLM: false },

  // ── Power ──
  { query: 'LDO 5V 1A', expectedFeatures: ['LDO', 'Iout_1A'] },
  { query: '5V LDO', expectedFeatures: ['LDO', 'Vout_5V'], needsLLM: false },
  { query: 'DCDC 降压 12V 3A', expectedFeatures: ['DCDC', '降压', 'Iout_3A'] },
  { query: '降压器', expectedFeatures: ['DCDC', '降压'], expectedMust: ['DCDC', '降压'], needsLLM: false },
  { query: '升压器', expectedFeatures: ['DCDC', '升压'], expectedMust: ['DCDC', '升压'], needsLLM: false },
  { query: '电源芯片', expectedFeatures: ['电源'], expectedMust: ['电源'], needsLLM: false },
  { query: '电子保险丝 12V', expectedFeatures: ['电子保险丝'] },
  { query: '理想二极管 48V 车规', expectedFeatures: ['理想二极管', '车规AEC-Q100'] },
  { query: '高边驱动', expectedFeatures: ['高边驱动'], needsLLM: false },
  { query: '负载开关', expectedFeatures: ['负载开关'], needsLLM: false },
  { query: '电源时序', expectedFeatures: ['电源时序'], needsLLM: false },
  { query: '线性充电', expectedFeatures: ['线性充电'], needsLLM: false },
  { query: '电池监控', expectedFeatures: ['电池监控'], needsLLM: false },

  // ── Signal chain ──
  { query: '隔离运放', expectedFeatures: ['隔离放大器'], forbiddenFeatures: ['运放'], needsLLM: false },
  { query: '隔离调制器', expectedFeatures: ['隔离放大器'], forbiddenFeatures: ['ADC', '运放'], needsLLM: false },
  { query: '零漂运放', expectedFeatures: ['零漂运算放大器'], forbiddenFeatures: ['运放'], needsLLM: false },
  { query: '高压运放', expectedFeatures: ['高压运算放大器'], forbiddenFeatures: ['运放'], needsLLM: false },
  { query: '低压运放', expectedFeatures: ['低压运算放大器'], forbiddenFeatures: ['运放'], needsLLM: false },
  { query: '放大器 推荐', expectedFeatures: ['放大器'], needsLLM: false },
  { query: '差动放大器 推荐', expectedFeatures: ['差动放大器'], needsLLM: false },
  { query: '对数放大器 推荐', expectedFeatures: ['对数放大器'], needsLLM: false },
  { query: '系统基础芯片 推荐', expectedFeatures: ['SBC'], needsLLM: false },
  { query: 'SBC 推荐', expectedFeatures: ['SBC'], forbiddenFeatures: ['CAN-FD', 'LIN'], needsLLM: false },
  { query: '运放 轨到轨 低噪声', expectedFeatures: ['运放', '轨到轨', '低噪声'] },
  { query: '仪表放大器 精密', expectedFeatures: ['仪表放大器', '精密(≤1mV)'] },
  { query: '比较器 低噪声', expectedFeatures: ['比较器', '低噪声'] },
  { query: 'ADC 16bit 8通道', expectedFeatures: ['ADC', '16bit', '8通道'] },
  { query: 'DAC 12bit', expectedFeatures: ['DAC', '12bit'] },
  { query: '电压基准 2.5V', expectedFeatures: ['电压基准'] },
  { query: '内置电压基准的运放', expectedFeatures: ['电压基准', '运放'], expectedMust: ['运放'], needsLLM: false },
  { query: '带电压基准的放大器', expectedFeatures: ['电压基准', '放大器'], expectedMust: ['放大器'], needsLLM: false },
  { query: '电流传感器', expectedFeatures: ['电流传感器'], needsLLM: false },
  { query: '温度传感器', expectedFeatures: ['温度传感器'], needsLLM: false },

  // ── Switch / Mux ──
  { query: '模拟开关 8:1', expectedFeatures: ['模拟开关', '8:1'] },
  { query: '5口千兆交换机 非管理型', expectedFeatures: ['千兆', '交换机', '5口', '非管理型'], needsLLM: false },
  { query: '八切一开关', expectedFeatures: ['模拟开关', '8:1'], needsLLM: false },
  { query: '八切一模拟开关 2通道', expectedFeatures: ['模拟开关', '8:1', '2通道'], needsLLM: false },
  { query: '高速数据复用器', expectedFeatures: ['高速数据复用器'], needsLLM: false },

  // ── Motor / Level shift ──
  { query: '马达驱动 2A', expectedFeatures: ['马达驱动', 'Iout_2A'] },
  { query: '低边驱动', expectedFeatures: ['低边驱动'], needsLLM: false },
  { query: '电平转换', expectedFeatures: ['电平转换'], needsLLM: false },
  { query: '隔离ADC', expectedFeatures: ['隔离ADC'], forbiddenFeatures: ['ADC'], needsLLM: false },

  // ── Other ──
  { query: '复位芯片 车规', expectedFeatures: ['复位芯片', '车规AEC-Q100'] },
  { query: 'BMS 3节', expectedFeatures: ['BMS'] },
  { query: '逻辑门', expectedFeatures: ['逻辑门'], needsLLM: false },
  { query: '匹配电阻', expectedFeatures: ['匹配电阻'], needsLLM: false },
  { query: '视频滤波', expectedFeatures: ['视频滤波'], needsLLM: false },
  { query: '传感器接口', expectedFeatures: ['传感器接口'], needsLLM: false },
  { query: 'MEMS麦克风', expectedFeatures: ['传感器接口'], needsLLM: false },
  { query: 'PDM麦克风', expectedFeatures: ['传感器接口'], needsLLM: false },
  { query: 'MEMS压力传感器', expectedFeatures: ['压力传感器'], needsLLM: false },
  { query: '音频总线', expectedFeatures: ['音频总线'], needsLLM: false },
  { query: 'EMI滤波器', expectedFeatures: ['EMI滤波器'], needsLLM: false },

  // ── Speed / params ── (方案甲 2026-06-12: 单一真实值标签, 不再梯子展开)
  { query: '20Mbps', expectedFeatures: ['20Mbps'], forbiddenFeatures: ['10Mbps', '5Mbps', '2Mbps', '1Mbps'] },
  { query: '1Gbps', expectedFeatures: ['1000Mbps'], forbiddenFeatures: ['200Mbps', '100Mbps', '50Mbps'] },

  // ── LLM fallback (fuzzy) ──
  { query: '帮我找个高速的接口芯片', expectedFeatures: [], needsLLM: true },
  { query: '运算放大器推荐', expectedFeatures: ['运放'] },  // enough keywords to match
  // ── Modifier: 精密（各种写法 + 方向）──
  { query: '精密运放', expectedFeatures: ['运放', '精密(≤1mV)'] },
  { query: '低失调运放', expectedFeatures: ['运放', '精密(≤1mV)'] },
  { query: '运放 offset 1mv', expectedFeatures: ['运放', 'Vos_<=1mV'] },
  { query: '1mv offset 运放', expectedFeatures: ['运放', 'Vos_<=1mV'] },
  { query: 'offset小于1mv 运放', expectedFeatures: ['运放', 'Vos_<=1mV'] },
  { query: 'offset 0.5μV 运放', expectedFeatures: ['运放', '精密(≤1mV)'] },
  // ── Modifier: 低噪声/轨到轨/特定帧唤醒 变体 ──
  { query: 'low noise 运放', expectedFeatures: ['运放', '低噪声'] },
  { query: 'rail to rail 运放', expectedFeatures: ['运放', '轨到轨'] },
  { query: 'partial networking CAN', expectedFeatures: ['CAN-FD', '特定帧唤醒'] },
  { query: 'can sic', expectedFeatures: ['CAN-FD', 'SIC'] },
  // ── 中文数字 ──
  { query: '三发五收 RS-232', expectedFeatures: ['RS-232', '3T5R'] },
  { query: '两发两收 485', expectedFeatures: ['RS-485', '2T2R'] },
  { query: '八通道运放', expectedFeatures: ['运放', '8通道'] },
  { query: '十六bit ADC', expectedFeatures: ['ADC', '16bit'] },
  { query: '五A DCDC', expectedFeatures: ['DCDC', 'Iout_5A'] },
  { query: '二十Mbps CAN', expectedFeatures: ['CAN-FD', '20Mbps'] },
  { query: '四路比较器', expectedFeatures: ['比较器', '4通道'] },
  { query: '运放 1mv offset 轨到轨', expectedFeatures: ['运放', '轨到轨', 'Vos_<=1mV'], expectedMust: ['运放', '轨到轨', 'Vos_<=1mV'] },
  { query: '轨到轨运放，1mv 以下的 offset', expectedFeatures: ['运放', '轨到轨', 'Vos_<=1mV'], expectedMust: ['运放', '轨到轨', 'Vos_<=1mV'] },
  // ── 2026-06-23: MCU/固态继电器/POE parser rules ──
  { query: '有没有 m7 的 mcu', expectedFeatures: ['MCU/DSP'] },
  { query: '固态继电器', expectedFeatures: ['固态继电器'] },
  { query: 'poe供电', expectedFeatures: ['以太网供电'] },
  { query: '高边开关', expectedFeatures: ['高边开关'] },
];

// ═══════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const tc of TESTS) {
  const result = parseQuery(tc.query);
  const errors: string[] = [];

  // Check expected features
  for (const feat of tc.expectedFeatures) {
    if (!result.features.includes(feat)) {
      errors.push(`  missing feature: "${feat}"`);
    }
  }

  if (tc.expectedMust) {
    for (const must of tc.expectedMust) {
      if (!result.must.includes(must)) {
        errors.push(`  missing must: "${must}"`);
      }
    }
  }

  // Check forbidden features
  if (tc.forbiddenFeatures) {
    for (const forbid of tc.forbiddenFeatures) {
      if (result.features.includes(forbid)) {
        errors.push(`  FORBIDDEN feature present: "${forbid}"`);
      }
    }
  }

  // Check expectedExclude
  if (tc.expectedExclude !== undefined) {
    for (const ex of tc.expectedExclude) {
      if (!result.exclude_tags.includes(ex)) {
        errors.push(`  missing exclude tag: "${ex}"`);
      }
    }
    // Check no unexpected exclude tags
    for (const ex of result.exclude_tags) {
      if (!tc.expectedExclude.includes(ex)) {
        errors.push(`  unexpected exclude tag: "${ex}"`);
      }
    }
  }

  // Check needsLLM
  if (tc.needsLLM !== undefined && result.needsLLM !== tc.needsLLM) {
    errors.push(`  needsLLM: expected ${tc.needsLLM}, got ${result.needsLLM}`);
  }

  if (errors.length > 0) {
    failed++;
    failures.push(`❌ "${tc.query}"`);
    failures.push(`   got: [${result.features.join(', ')}]`);
    failures.push(...errors);
  } else {
    passed++;
  }
}

// ── Report ──
console.log(`\n╔══════════════════════════════╗`);
console.log(`║  Parser Test Results         ║`);
console.log(`╠══════════════════════════════╣`);
console.log(`║  ✅ ${String(passed).padEnd(3)}  ❌ ${String(failed).padEnd(3)}  total ${TESTS.length}`.padEnd(31) + '║');
console.log(`╚══════════════════════════════╝`);

if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(f);
  process.exit(1);
} else {
  console.log('\nAll tests passed! 🎉');
  process.exit(0);
}
