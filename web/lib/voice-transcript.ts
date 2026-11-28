import { spokenMeasurements, SPOKEN_UNITS } from '../app/api/interpret/spoken-measurements.ts';

type Field = {
  kind: '型号/缩写' | '数值/单位';
  text: string;
  start: number;
  end: number;
  normalized?: string;
};

const identifier = /\b(?:[A-Z][A-Z0-9]*\d[A-Z0-9]*(?:[-_.+/#][A-Z0-9]+)*|(?:\d+(?:\.\d+)?)?BASE[- ]?[A-Z0-9]+|IEC\s*\d+(?:-\d+)*|ISO\s*\d+(?:-\d+)*|AEC[- ]?Q\d+|CAN\s*FD|SGMII|PSRR?|CMTI|UVLO|I2C|UART|PWM|SPI|Buck|LDO|PHY|DC[- ]?DC)\b/gi;
const quantity = /(?<![A-Za-z0-9.])[+−-]?\d+(?:\.\d+)?(?:\s*(?:[gmk]?bps|[kmg]?Hz|[kmμµun]?V(?:rms|pp|AC|DC)?|[mμµun]?A|[pnumμµ]?F|[mμµun]s|[km]?Ω|dB|mm|KB|°C|℃|%|摄氏度|度|路|通道|兆)(?:\s*\/\s*(?:√\s*Hz|[mμµun]?s))?(?![A-Za-z]))?/giu;
const spokenCount = /[零〇一二两三四五六七八九十百千万点]+\s*(?:路|通道|兆(?!赫))/gu;
const prefixes: Record<number, string> = { 1e-9: 'n', 1e-6: 'μ', 1e-3: 'm', 1: '', 1e3: 'k', 1e6: 'M', 1e9: 'G', 1e-12: 'p' };

export function voiceTranscriptFields(text: string): Field[] {
  const fields: Field[] = [];
  const overlaps = (start: number, end: number) => fields.some(field => field.start < end && field.end > start);
  for (const match of text.matchAll(identifier)) {
    const start = match.index!;
    fields.push({ kind: '型号/缩写', text: match[0], start, end: start + match[0].length });
  }
  for (const measurement of spokenMeasurements(text)) {
    const { start, end, unit } = measurement;
    if (overlaps(start, end)) continue;
    const spec = SPOKEN_UNITS[unit];
    // A range endpoint may inherit its unit. Never add a unit absent in its original span.
    const normalized = spec && (measurement.text.trimEnd().endsWith(unit)
      ? `${measurement.value} ${prefixes[spec[1]]}${spec[0]}`
      : /[\p{Script=Han}〇]/u.test(measurement.text) ? String(measurement.value) : undefined);
    fields.push({ kind: '数值/单位', text: measurement.text, start, end, normalized });
  }
  for (const match of [...text.matchAll(quantity), ...text.matchAll(spokenCount)]) {
    const start = match.index!;
    const end = start + match[0].length;
    if (!overlaps(start, end)) fields.push({ kind: '数值/单位', text: match[0], start, end });
  }
  return fields.sort((a, b) => a.start - b.start);
}

export function normalizeVoiceTranscript(text: string, fields = voiceTranscriptFields(text)): string {
  return fields.reduceRight((result, field) => field.normalized
    ? result.slice(0, field.start) + field.normalized + result.slice(field.end)
    : result, text);
}
