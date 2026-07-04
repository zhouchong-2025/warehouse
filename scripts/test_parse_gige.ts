import { parseQuery } from '../web/app/api/interpret/query_parser.ts';
const r = parseQuery('千兆 phy');
console.log('confidence:', r.confidence);
console.log('needsLLM:', r.needsLLM);
console.log('features:', r.features);
console.log('must:', r.must);
console.log('nice:', r.nice);
console.log('mustMeta:', JSON.stringify(r.mustMeta, null, 2));
