#!/usr/bin/env python3
"""
Master Re-extractor: re-extract 思瑞浦-模拟 PDF with correct section headers.
Fixes both SCHEMA misalignment and ParamN issues.
"""
import fitz, json, re, os, sys
from collections import defaultdict

PDF = '/Users/zhouchong/Projects/warehouse/raw/思瑞浦-模拟产品选型册_2026.pdf'
DATA = '/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'
DRY_RUN = '--dry-run' in sys.argv

# Section name → merged schema (clean headers in order)
SECTION_SCHEMA = {
    'RS232 收发器': ['Status','Rating','Drivers Per Package','Receivers Per Package','VCC Min (V)','VCC Max (V)','Data Rate Max (kBPS)','ICC Max (mA)','ESD HBM (kV)','IEC Contact (kV)','Operating Temp (C)','Package'],
    'RS485 收发器': ['Status','Rating','Drivers Per Package','Receivers Per Package','VCC Min (V)','VCC Max (V)','Data Rate Max (kBPS)','ICC Max (mA)','ESD HBM (kV)','IEC Contact (kV)','Operating Temp (C)','Package'],
    'LIN 收发器': ['Status','Rating','Supply Voltage (V)','Bus Fault Protection (V)','Data Rate Max (kBPS)','Channels','Features','ESD BUS Contact (kV)','Package'],
    'CAN 收发器': ['Status','Rating','Supply Voltage (V)','Bus Fault Protection (V)','Max Data Rate (Mbps)','Channels','Features','ESD BUS Contact (kV)','Package'],
    '隔离CAN': ['Status','Rating','Isolation Rating (Vrms)','Surge Voltage (Vpk)','CMTI Static (kV/us)','CMTI Dynamic (kV/us)','Max Data Rate (Mbps)','Bus Fault Protection (V)','Package'],
    '隔离RS485': ['Status','Rating','Isolation Rating (Vrms)','Surge Voltage (Vpk)','CMTI Static (kV/us)','CMTI Dynamic (kV/us)','Max Data Rate (Mbps)','Mode','Package'],
    '隔离I2C': ['Status','Rating','Isolation Rating (Vrms)','Surge Voltage (Vpk)','CMTI Static (kV/us)','CMTI Dynamic (kV/us)','Max Data Rate (Mbps)','Clock Direction','Package'],
    '隔离电源': ['Status','Rating','VIN (V)','Iout Max (A)','Topology','Regulation','Switching Frequency (kHz)','Temperature Range (C)','Package'],
    '隔离栅极驱动': ['Status','Rating','Isolation Rating (Vrms)','Channels','Input','UVLO Threshold (V)','Peak Output Current (A)','Features','Output Voltage Max (V)','Output Voltage Min (V)','Propagation Delay (ns)','Junction Temp Range (C)','Package'],
    '非隔离栅极驱动': ['Status','Rating','VIN (V)','Channels','Max Output Current (A)','Input Range (V)','Junction Temp Range (C)','Rise/Fall Time (ns)','Propagation Delay (ns)','Delay Matching (ns)','Package'],
    'IO 扩展器': ['Status','Rating','Drivers Per Package','Receivers Per Package','VCC Min (V)','VCC Max (V)','Data Rate Max (kBPS)','ICC Max (mA)','ESD HBM (kV)','Operating Temp (C)','Package'],
    '电平转换器': ['Status','Rating','Technology Family','Channels','Supply Range (V)','Input Type','Output Type','DC Drive Strength (mA)','Operating Temp (C)','Package'],
    '比较器': ['Status','Rating','Output Type','Vs Min (V)','Channels','Vs Max (V)','Iq/Ch (uA)','Propagation Delay (ns)','Vos Max (mV)','Ib Typ (nA)','Rail-to-rail Input','Rail-to-rail Output','VICR Max (V)','VICR Min (V)','Operating Temp (C)','Features','Package'],
    '温度传感器': ['Status','Rating','Type','Local Sensor Accuracy (C)','Resolution (Bits)','Features','Supply Max (V)','Supply Min (V)','Iq Typ (uA)','Digital Interface','Operating Temp (C)','Package'],
    '复位芯片': ['Status','Rating','Power Consumption (uA)','Power Supervisor','Manual Reset Input','Watchdog','Power Fail Input','Reset Timeout (mS)','Watchdog Timeout (S)','Reset Output Polarity','Reset Output Type','Operating Temp (C)','Package'],
    '步进马达驱动': ['Status','Rating','VIN (V)','Channels','Max Output Current (A)','Features','Package'],
    '直流马达驱动': ['Status','Rating','VIN (V)','Rdson (Ohm)','Max Output Current (A)','Half Bridges','Temperature Range (C)','Package'],
    '高压LDO': ['Status','Rating','Vin Min (V)','Vin Max (V)','Vout (V)','Accuracy (%)','Iout Max (mA)','Iq (mA)','Dropout (mV)','PSRR (dB)','Noise (uVRMS)','Temperature Range (C)','Package'],
    '低压LDO': ['Status','Rating','Vin Min (V)','Vin Max (V)','Vout (V)','Accuracy (%)','Iout Max (mA)','Iq (mA)','Dropout (mV)','PSRR 1kHz (dB)','Noise (uVRMS)','Temperature Range (C)','Features','Package'],
    '线性稳压器与基准': ['Status','Rating','Vin Min (V)','Vin Max (V)','Vout (V)','Accuracy (%)','Iout Max (mA)','Iq (mA)','Dropout (mV)','PSRR 1kHz (dB)','Noise (uVRMS)','Temperature Range (C)','Features','Package'],
    '宽压降压变换器': ['Status','Rating','VIN (V)','Vout (V)','Iout Max (A)','Control Mode','Switching Freq (kHz)','Features','Temperature Range (C)','Package'],
    '中压降压变换器': ['Status','Rating','VIN (V)','Vout (V)','Iout Max (A)','Control Mode','Switching Freq (kHz)','Features','Temperature Range (C)','Package'],
    '低压降压变换器': ['Status','Rating','VIN (V)','Vout (V)','Iout Max (A)','Control Mode','Switching Freq (kHz)','Features','Temperature Range (C)','Package'],
    '升压变换器': ['Status','Rating','VIN (V)','Vout (V)','Iout Max (A)','Temperature Range (C)','Package'],
    '高压模拟开关': ['Status','Channels','Switch Config','Rating','VCC-VEE Min (V)','VCC-VEE Max (V)','VCC Min (V)','VCC Max (V)','VEE Min (V)','VEE Max (V)','Input Range','BW (MHz)','IQ (uA)','Ron (Ohm)','Leakage (nA)','VIH Min (V)','VIL Max (V)','tON (ns)','tOFF (ns)','Package'],
    '低压模拟开关': ['Status','Channels','Rating','Switch Config','VCC Min (V)','VCC Max (V)','Input Range','BW (MHz)','IQ (uA)','Ron (Ohm)','Leakage (nA)','VIH Min (V)','VIL Max (V)','tON (ns)','tOFF (ns)','Package'],
    '负载开关': ['Status','Rating','Function','Channels','Vin Min (V)','Vin Max (V)','Imax (A)','Rdson (mOhm)','Shutdown Current (uA)','Iq (uA)','Soft Start','Features','Package'],
    '电子保险丝': ['Status','Rating','Vin Min (V)','Vin Max (V)','Ron (mOhm)','Channels','Current Limit Type','Ilimit Min (mA)','Ilimit Max (mA)','Ilimit Accuracy','Current Sense Accuracy','Temperature Range (C)','Package'],
    '高边开关': ['Status','Rating','Vin Min (V)','Vin Max (V)','Channels','Ron (mOhm)','Iq Max (uA)','Iout Max (A)','Current Limit Type','Ilimit Max (A)','Temperature Range (C)','Package'],
    '电流信号检测放大器': ['Status','Rating','Features','VCM Min (V)','VCM Max (V)','Vos Drift (uV/c)','Input Direction','CMRR Min (dB)','BW (kHz)','Gain Option','GE Max (%)','GE Drift (ppm/c)','Vos Max (uV)','Ib Typ (nA)','PWM Rejection','VS Min (V)','VS Max (V)','Iq Max (uA)','Channels','Comparator','Package'],
    '带电压基准的放大器': ['Status','Rating','Working Voltage Max (V)','Vos Max (mV)','Vref Typ (V)','Vref Accuracy (%)','Ref for Current Typ (mV)','Package'],
    '电池管理': ['Status','Rating','Vin Max (V)','Float Voltage (V)','Float Voltage Accuracy','Iout Max (mA)','IBAT (uA)','OVP (V)','Operating Temp (C)','Package'],
    '线性充电芯片': ['Status','Rating','Vin Max (V)','Float Voltage (V)','Float Voltage Accuracy','Iout Max (mA)','IBAT (uA)','OVP (V)','Operating Temp (C)','Package'],
    '以太网供电': ['Status','Rating','VIN (V)','Temperature Range (C)','PD Hot-Swap Rdson (Ohm)','PoE Standards','PoE Current Limit (mA)','DCDC Controller','DCDC Topology','DCDC Rdson (Ohm)','Switching Freq (kHz)','Max Duty Cycle (%)','Fault Response','Special Features','Package'],
    '串联型电压基准': ['Status','Rating','Vin Min (V)','Vin Max (V)','Vout (V)','Iq Max (uA)','Accuracy (%)','TC -40~85C (ppm/C)','TC -40~125C (ppm/C)','Noise 0.1-10Hz (uVpp)','Line Regulation (ppm/V)','Load Regulation (ppm/mA)','Output Cap (uF)','Features','Package'],
    '并联型电压基准': ['Status','Rating','Vout (V)','Isink Min (mA)','Isink Max (mA)','Accuracy (%)','TC (ppm/C)','Noise 10-10kHz (uVrms)','Output Cap (uF)','Features','Package'],
    '传感器接口': ['Status','Rating','VDD (V)','Description','Package'],
    '仪表放大器': ['Status','Rating','Product Family','Supply Min (V)','Supply Max (V)','VOS Max (uV)','Ib Typ (nA)','BW G=1 Typ (MHz)','Slew Rate Typ (V/us)','Gain Setting (V/V)','Gain Error G=1 Max (%)','CMRR G=1 Min (dB)','Package'],
    '差动放大器': ['Status','Rating','Features','Product Family','Supply Min (V)','Supply Max (V)','Iq Max (mA)','VOS Max (uV)','BW Typ (MHz)','Slew Rate Typ (V/us)','Gain Setting (V/V)','Gain Error Max (%)','Input Range (V)','CMRR Typ (dB)','Package'],
    '对数放大器': ['Status','Rating','CH','VDD (V)','Iq Max (mA)','Input Current Range','Log Slope (mV/dec)','Law Conformance Error (dB)','Package'],
    '音频线路驱动': ['Status','Rating','Features','VDD Min (V)','VDD Max (V)','Iq Typ (mA)','Vout RL=2.5k VCC=5V Min (Vrms)','Vout RL=2.5k VCC=3.3V Min (Vrms)','Input Type','Shutdown','UVP Control','Click-Pop Suppression','Package'],
    '视频滤波驱动': ['Status','Rating','Resolution','Channels','VDD Min (V)','VDD Max (V)','Iq Typ (mA)','Voltage Gain Typ (dB)','Stop-Band Rejection 27MHz (dB)','Diff Gain Typ (%)','Diff Phase Typ (Deg)','THD Typ (%)','Package'],
    '匹配电阻网络': ['Status','Rating','Product Family','Resistor Config','Working Voltage Max (V)','Resistor Matching Max (%)','Matching Temp Drift Max (ppm/C)','Matching for CMRR Max (%)','Package'],
    '功率级DrMOS': ['Status','Rating','VIN (V)','Iout Max (A)','Temperature Range (C)','Current Limit (A)','Trise (ns)','Tfall (ns)','PWM Logic (V)','Package'],
    '数字式电流/功率检测器': ['Status','Features','Channels','Resolution (Bits)','Rating','Common Mode Voltage Max (V)','Shunt Offset Max (uV)','Gain Error (%)','CMRR Min (dB)','Supply Max (V)','Supply Min (V)','Iq Typ (mA)','Digital Interface','Operating Temp (C)','Package'],
    '多通道可配置模数/数模转换器': ['Status','Rating','ADC Input Channel','ADC Resolution (Bits)','ADC Input Range (V)','DAC Channel','DAC Resolution (Bits)','DAC Output Type','DAC Output Range','GPIO Number','VREF','Temperature Sensor','Interface','Features','Operating Temp (C)','Package'],
    '精密模数转换器（ADC）': ['Status','Rating','Resolution (Bits)','VDD (V)','Channels','Throughput Rate (Msps)','Architecture','Input Type','Multichannel Config','INL Max (LSB)','DNL Max (LSB)','Offset Error Max (LSB)','Gain Error (LSB)','Voltage Input Range (V)','IDD (mA)','Digital Interface','Operating Temp (C)','Package'],
    '精密数模转换器(DAC)': ['Status','Rating','Resolution (Bits)','VDD (V)','Channels','Output Type','Reference Type','Settling Time (uS)','Architecture','Output POR Status','INL (LSB)','DNL Max (LSB)','Offset Error Max (mV)','IDD Max (uA)','Gain Error Max (%FSR)','Voltage Output Range (V)','DAC Glitch Impulse (nV-sec)','Interface Type','Operating Temp (C)','Package'],
    '高速模数转换器（ADC）': ['Status','Rating','Resolution (Bits)','Update Rate (MSPS)','CH','Interface','VIN (V)','DNL (LSB)','SINAD (dB)','VDD (V)','Power (mW)','Datum','Package'],
    '高速数模转换器（DAC）': ['Status','Rating','CH','Resolution (Bits)','Update Rate (MSPS)','Interface','Output','SNR (dB)','VDD (V)','Reference','Package'],
    '高速数据复用器/解复用器': ['Status','Rating','Function','Type','Speed (Mbits/s)','Channels','Supply Max (V)','Supply Min (V)','Ron Typ (mOhm)','I/O Voltage Min (V)','I/O Voltage Max (V)','Configuration','Operating Temp (C)','Package'],
    '电源时序控制': ['Status','Rating','VCC (V)','Timing Control','Power-up Sequence','Power-down Sequence','Open-Drain Output','Output Voltage (V)','Channels','Junction Temp (C)','Package'],
    '电源监控': ['Status','Rating','VCC (V)','Timing Control','Power-up Sequence','Power-down Sequence','Open-Drain Output','Output Voltage (V)','Channels','Junction Temp (C)','Package'],
    '集成看门狗的复位芯片': ['Status','Rating','Power Consumption (uA)','Power Supervisor','Manual Reset Input','Watchdog','Power Fail Input','Reset Timeout (mS)','Watchdog Timeout (S)','Reset Output Polarity','Reset Output Type','Operating Temp (C)','Package'],
    '理想二极管|ORing 控制器': ['Status','Rating','Vin Min (V)','Vin Max (V)','Channels','Iq Typ (uA)','Iq Max (uA)','IGATE Source Typ (uA)','IGATE Source Min (uA)','IGATE Sink Typ (mA)','Temperature Range (C)','Package'],
    '高边驱动': ['Status','Rating','Temperature Range (C)','Package'],
    '电池监控': ['Status','Rating','Device Type','Description','Max Series Cells','Accuracy','Vin Max (V)','Comm Interface','Operating Temp (C)','Package'],
    '电池均衡IC': ['Status','Rating','Balancing Start-up Voltage (V)','Balancing Recovery Voltage (V)','Balancing Start-up Delay (mS)','Standby Voltage (V)','Output Logic','Package'],
}

# Op-amp sections share the same schema
OPAMP_SCHEMA = ['Status','Rating','Channels','Supply Min (V)','Supply Max (V)','Iq/Ch Typ (uA)','GBW Typ (MHz)','Slew Rate Typ (V/us)','Rail-to-rail In','Rail-to-rail Out','Ishort Typ (mA)','Vos Max (mV)','Offset Drift Typ (uV/C)','Ib Typ (pA)','Vn 1kHz Typ (nV/rtHz)','Peak Noise 0.1-10Hz (uVpp)','Shutdown','Operating Temp (C)','Features','Package']

OPAMP_SECTIONS = [
    '高压运算放大器(Vs ＞10V)', '低压运算放大器(Vs ＜10V)', '高速运算放大器(GBW ＞＝50MHz)',
    '精密运算放大器(Vos ＜＝1mV)', '低功耗运算放大器 (Iq Per Ch <= 50μa)',
    '小尺寸封装运算放大器 (DFN, QFN, Wafer-Level CSP)', '放大器和特殊功能电路'
]

for sec in OPAMP_SECTIONS:
    if sec not in SECTION_SCHEMA:
        SECTION_SCHEMA[sec] = OPAMP_SCHEMA

# ──── EXTRACTION ────

def find_section_page(doc, section_name):
    """Find page number where a section table starts."""
    for i in range(len(doc)):
        text = doc[i].get_text()
        if section_name in text:
            # Verify it's a section header (not just mentioned in passing)
            lines = text.split('\n')
            for j, line in enumerate(lines):
                if line.strip() == section_name:
                    return i
    return None

def extract_table_products(doc, page_idx, section_name, schema):
    """Extract products from a table section using the correct schema."""
    text = doc[page_idx].get_text()
    lines = [l.strip() for l in text.split('\n')]
    
    # Find the section header and Part Number row
    in_section = False
    header_row = False
    products = []
    current_product = None
    
    for i, line in enumerate(lines):
        if line == section_name:
            in_section = True
            continue
        if not in_section:
            continue
        if line == 'Part Number':
            header_row = True
            continue
        if not header_row:
            continue
        
        # Detect next section header (stops product extraction)
        if (re.search(r'[\u4e00-\u9fff]', line) and 2 <= len(line) <= 40 
            and line != section_name and not re.match(r'^[\d\s\.\-～~（）/]+$', line)):
            # Could be next section. Check if a Part Number follows
            next_few = lines[i+1:i+4] if i+4 < len(lines) else lines[i+1:]
            if 'Part Number' in next_few:
                break  # new section starts
        
        # Check if this is a product PN (starts with uppercase + digits, or specific patterns)
        if re.match(r'^[A-Z]{2,}[\d]', line):
            # Save previous product if any
            if current_product and len(current_product) >= len(schema):
                pn = current_product[0]
                raw_vals = current_product[1:1+len(schema)]
                labeled = []
                for idx, val in enumerate(raw_vals):
                    if idx < len(schema):
                        labeled.append('{}: {}'.format(schema[idx], val))
                products.append({
                    'part_number': pn,
                    '_params': ' | '.join(labeled),
                    '_raw': ' | '.join(raw_vals),
                    '_section': section_name
                })
            
            # Start new product
            current_product = [line]
        elif current_product is not None:
            # Check if this value is part of previous product
            # Product values are single-line per cell (no multi-line values)
            # If we haven't collected enough values yet, add it
            if len(current_product) <= len(schema):
                current_product.append(line)
            elif re.match(r'^[A-Z]{2,}[\d]', line):
                # New product starting
                if len(current_product) >= len(schema):
                    pn = current_product[0]
                    raw_vals = current_product[1:1+len(schema)]
                    labeled = []
                    for idx, val in enumerate(raw_vals):
                        if idx < len(schema):
                            labeled.append('{}: {}'.format(schema[idx], val))
                    products.append({
                        'part_number': pn,
                        '_params': ' | '.join(labeled),
                        '_raw': ' | '.join(raw_vals),
                        '_section': section_name
                    })
                current_product = [line]
    
    # Save last product
    if current_product and len(current_product) >= len(schema):
        pn = current_product[0]
        raw_vals = current_product[1:1+len(schema)]
        labeled = []
        for idx, val in enumerate(raw_vals):
            if idx < len(schema):
                labeled.append('{}: {}'.format(schema[idx], val))
        products.append({
            'part_number': pn,
            '_params': ' | '.join(labeled),
            '_raw': ' | '.join(raw_vals),
            '_section': section_name
        })
    
    return products

# ──── MAIN ────
print('Loading data...')
data = json.load(open(DATA))

# Build PN → product index for updating
pn_to_product = {}
for slug, vd in data.items():
    if '3peak' not in slug and '思瑞浦' not in vd.get('name',''): continue
    for p in vd['products']:
        pn_to_product[p['part_number']] = (slug, p)

doc = fitz.open(PDF)
total_fixed = 0
total_extracted = 0

for section, schema in SECTION_SCHEMA.items():
    page = find_section_page(doc, section)
    if page is None:
        continue
    
    products = extract_table_products(doc, page, section, schema)
    total_extracted += len(products)
    
    for prod in products:
        pn = prod['part_number']
        if pn in pn_to_product:
            slug, existing = pn_to_product[pn]
            old_params = existing.get('_params','')
            # Only update if params changed
            if old_params != prod['_params']:
                existing['_params'] = prod['_params']
                existing['_raw'] = prod['_raw']
                # Keep existing _section if already set correctly
                if not existing.get('_section'):
                    existing['_section'] = prod['_section']
                total_fixed += 1

doc.close()

if not DRY_RUN:
    json.dump(data, open(DATA, 'w'), ensure_ascii=False, indent=2)

print('Extracted {} products from PDF sections'.format(total_extracted))
print('Fixed {} products with correct schemas'.format(total_fixed))
