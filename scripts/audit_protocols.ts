import fs from 'fs';

const data = JSON.parse(fs.readFileSync('web/public/data/products_structured.json', 'utf8'));
const allTokens = new Map<string, number>();
for (const [, blob] of Object.entries(data) as any) {
  for (const p of (blob as any).products || []) {
    const tokens = (p._features || '').toLowerCase().split(/\s+/).filter(Boolean);
    for (const t of tokens) new Set([t]).forEach(x => allTokens.set(x, (allTokens.get(x) || 0) + 1));
  }
}

// Known covered by parser rules (lowercase)
const covered = new Set([
  'dcdc', 'ldo', 'adc', 'dac', 'can-fd', 'lin', 'rs-485', 'rs-232',
  'i2c', 'sbc', 'mlvds', '隔离rs485', '隔离can', '隔离i2c', '隔离adc',
  '以太网', '交换机', '网卡', 't1-phy', '以太网供电', 'poe',
  'rgmii', 'sgmii', 'qsgmii', 'rmii', 'mii', 'gmii',
  '100base-tx', '100fx', '百兆', '千兆', '2.5g',
  '车规aec-q100', '工业级', '消费级', 'aec-q100',
  'lcd', 'led驱动', 'led',
  'tvs/esd', 'tvs', 'esd',
  'sram', 'dram', 'flash', 'eeprom',
  'emi滤波器',
  '固态继电器',
]);

// Focus: interface/protocol/standard tokens (alphanumeric, could be queried)
const protocolLike = new Set<string>();
for (const [t, c] of allTokens) {
  if (c < 3) continue;
  if (covered.has(t)) continue;
  // Must look like a technical standard: letters+digits, or known protocols
  if (/^(spi|i3c|mdio|smbus|pmbus|jtag|swd|uart|usb|pcie|sata|gmii|xgmii|sfi|xfi|serdes|fifo|lvds|sub-lvds|mipi|csi|dsi|hdmi|dp|displayport|vga|rgb|yuv|bt656|bt1120|i2s|tdm|pdm|ac97|hda|slimbus|soundwire|owire|1-wire|ir|irda|rf|bluetooth|ble|wifi|zigbee|thread|enocean|z-wave|nfc)$/.test(t)) {
    protocolLike.add(`${t} (${c} products)`);
  }
  // Ethernet speed variants
  if (/^\d+(\.\d+)?[g]?base-[a-z]/.test(t) && !covered.has(t)) {
    protocolLike.add(`${t} (${c} products)`);
  }
}

console.log('=== Interface/Protocol tokens missing parser rules ===');
if (protocolLike.size === 0) console.log('  (none found)');
else for (const t of [...protocolLike].sort()) console.log(' ', t);

// Also check: tokens ending in specific interface suffixes
console.log('\n=== Bus/Interface suffix tokens (X-bus, X-if, etc.) ===');
for (const [t, c] of allTokens) {
  if (c < 3 || covered.has(t)) continue;
  if (/\b(spi|i2c|uart|can|lin|usb|pcie|sata|mdio|smbus|pmbus)\b/i.test(t)
      && !/^[\u4e00-\u9fff]+$/.test(t)) {
    console.log(`  ${t.padEnd(25)} ${c} products`);
  }
}

// Check: what about GMII, XGMII, SFI, XFI?
console.log('\n=== Specific tech tokens in product features ===');
for (const t of ['gmii', 'xgmii', 'sfi', 'xfi', 'serdes', 'fifo', 'spi', 'i3c',
                  'mdio', 'smbus', 'pmbus', 'uart', 'usb', 'lvds', 'sub-lvds',
                  'mipi', 'i2s', 'tdm', 'pdm', 'hdmi', 'dp']) {
  const c = allTokens.get(t) || 0;
  if (c > 0) console.log(`  ${t.padEnd(15)} ${c} products`);
}

// Also list ALL tokens containing "base" to see Ethernet standards
console.log('\n=== Tokens with "base" ===');
for (const [t, c] of allTokens) {
  if (t.includes('base') && !covered.has(t)) {
    console.log(`  ${t.padEnd(25)} ${c} products`);
  }
}
