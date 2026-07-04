import { parseQuery } from '../web/app/api/interpret/query_parser.ts';

const r = parseQuery('有没有车规以太网 PHY，支持 100BASE-T1，接口接 RGMII 或 RMII，用在域控制器和摄像头网关。');
console.log('confidence:', r.confidence);
console.log('needsLLM:', r.needsLLM);
console.log('features:', r.features);
console.log('must:', r.must);
console.log('nice:', r.nice);
