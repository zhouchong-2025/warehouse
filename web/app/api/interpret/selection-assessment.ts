import { isPackageTag, packageMatches } from './query-specs';

export interface OrderableConfiguration {
  orderNumber: string;
  parentModel: string;
  outputVoltageV: number;
  outputMode?: 'fixed';
  features?: string;
  package: string;
  source: {
    factId: string;
    document: string;
    documentSha256: string;
    factsSha256: string;
    wikiFactPage?: string;
    page: number;
    originalValue: string;
    outputEvidence?: { physicalPage: number; partNumber: string; originalValue: string;
      originalHeader?: string; voltageCode?: string };
  };
}

export interface AdjustableOrderable {
  orderNumber: string;
  parentModel: string;
  outputMode: 'adjustable';
  adjustableRangeV: { min: number; max: number };
  package: string;
  features: string;
  source: OrderableConfiguration['source'] & {
    rangeEvidence: { physicalPage: number; originalHeader: string;
      minimumOriginalValue: string; maximumOriginalValue: string };
  };
}

export interface ConfigurationOption {
  isoKvrms?: number;
  package: string;
  forwardReverseChannels?: string;
  maxDataRateMbps?: number;
  source: { factId: string; document: string; documentSha256: string; factsSha256: string;
    wikiFactPage?: string; page: number; originalHeader: string; originalValue: string };
}

export function reviewedConfigurationOptions(product?: { part_number?: unknown; _configuration_options?: unknown;
  _conditional_rate_resolution?: unknown }): ConfigurationOption[] {
  if (typeof product?.part_number !== 'string' || !Array.isArray(product._configuration_options)) return [];
  const rate = product._conditional_rate_resolution as { status?: unknown } | undefined;
  if (rate?.status === 'orderable_specific_only') return [];
  return product._configuration_options.filter((option): option is ConfigurationOption =>
    !!option && typeof option === 'object' && (option.isoKvrms === undefined || Number.isFinite(option.isoKvrms))
    && typeof option.package === 'string' && option.package.length > 0
    && typeof option.source?.factId === 'string' && typeof option.source?.documentSha256 === 'string'
    && Number.isInteger(option.source.page));
}

function reviewedNsr33Version(config: OrderableConfiguration | AdjustableOrderable): boolean {
  if (config.parentModel !== 'NSR33xxx') return false;
  const family = config.orderNumber.match(/^NSR(330|331|332)(01|25|33|50)-Q(?:HMSR|HSPR)$/);
  if (!family) return false;
  const [, series, code] = family;
  const expectedPackage = series === '332' ? 'HSOP8' : 'HMSOP8';
  const expectedFeature = series === '330' ? '无 PG' : series === '331' ? 'PG/DLY' : 'PG';
  const expectedVoltage: Record<string, number> = { '25': 2.5, '33': 3.3, '50': 5 };
  const evidence = config.source.outputEvidence;
  return config.package === expectedPackage && config.features === expectedFeature
    && config.orderNumber.endsWith(series === '332' ? '-QHSPR' : '-QHMSR')
    && evidence?.physicalPage === 1 && evidence.partNumber === `NSR${series}${code === '01' ? '01' : 'XX'}-Q1`
    && evidence.originalHeader === 'Version Info' && evidence.voltageCode === code
    && (code === '01'
      ? config.outputMode === 'adjustable' && evidence.originalValue.includes('Adjustable output')
      : config.outputMode === 'fixed' && code in expectedVoltage
        && (series !== '332' || code !== '25')
        && (config as OrderableConfiguration).outputVoltageV === expectedVoltage[code]
        && evidence.originalValue.includes(code))
    && config.source.page === 22;
}

export function reviewedOrderableConfigurations(product?: { part_number?: unknown; _orderable_configurations?: unknown }): OrderableConfiguration[] {
  if (typeof product?.part_number !== 'string' || !Array.isArray(product._orderable_configurations)) return [];
  return product._orderable_configurations.filter((config): config is OrderableConfiguration =>
    config && typeof config === 'object'
    && config.parentModel === product.part_number
    && typeof config.orderNumber === 'string'
    && Number.isFinite(config.outputVoltageV)
    && typeof config.package === 'string'
    && typeof config.source?.factId === 'string'
    && typeof config.source?.documentSha256 === 'string'
    && (!config.source.outputEvidence || (config.source.outputEvidence.originalHeader === 'Version Info'
      ? reviewedNsr33Version(config)
      : config.source.originalValue === config.orderNumber
        && Number.isInteger(config.source.outputEvidence.physicalPage)
        && typeof config.source.outputEvidence.originalValue === 'string'
        && Math.abs(Number.parseFloat(config.source.outputEvidence.originalValue) - config.outputVoltageV) < 1e-9)));
}

export function reviewedAdjustableOrderables(product?: { part_number?: unknown; _adjustable_orderables?: unknown }): AdjustableOrderable[] {
  if (typeof product?.part_number !== 'string' || !Array.isArray(product._adjustable_orderables)) return [];
  return product._adjustable_orderables.filter((config): config is AdjustableOrderable =>
    config && typeof config === 'object' && config.parentModel === product.part_number
    && config.outputMode === 'adjustable' && config.adjustableRangeV?.min === 0.65
    && config.adjustableRangeV?.max === 18 && typeof config.orderNumber === 'string'
    && config.source?.originalValue === config.orderNumber
    && config.source?.rangeEvidence?.physicalPage === 5
    && config.source.rangeEvidence.originalHeader === 'Output Voltage Range'
    && config.source.rangeEvidence.minimumOriginalValue === '0.65'
    && config.source.rangeEvidence.maximumOriginalValue === '18'
    && reviewedNsr33Version(config));
}

export function orderablePackageMatches(config: { parentModel: string; package: string }, tag: string): boolean {
  // The Novosense selection-guide row abbreviates HMSOP8 to HMSOP. The
  // reviewed order table establishes the pin-count-specific part numbers.
  return (config.parentModel === 'NSR33xxx' && config.package === 'HMSOP8' && tag === 'HMSOP封装')
    || packageMatches(`Package: ${config.package}`, tag) === true;
}

interface OperatingFact {
  field: string;
  value: unknown;
  rating: string;
  conditionSetId: string;
  conditionScope: string;
  conditionParentIds: string[];
  qualifiers: Record<string, string>;
  applicableOrderNumbers: string[];
  applicableCatalogModels?: string[];
  source: { factId: string; document: string; documentSha256: string; page: number;
    originalHeader: string; originalValue: string };
}

type OperatingSource = OperatingFact['source'];

export interface OperatingCheck {
  orderNumber: string;
  checkedTags: string[];
  status: 'inside_documented_bounds' | 'outside_documented_bounds';
  minimumInputV: number;
  maximumInputV: number;
  maximumOutputCurrentA: number;
  sources: OperatingSource[];
  thermal?: {
    referenceThetaJaCPerW: number;
    optimisticMaximumAmbientC: number;
    ratedAmbientMinimumC: number;
    exceedsFullRatedAmbientRange: boolean;
    sourceFactIds: string[];
    sources: OperatingSource[];
  };
}

export interface ThermalReferenceCheck {
  orderNumber: string;
  inputV: number;
  outputCurrentA: number;
  outputVoltageV: number;
  package: string;
  referenceThetaJaCPerW: number;
  optimisticMaximumAmbientC: number;
  junctionGuidanceC: number;
  belowRatedAmbientMinimum: boolean;
  belowRoomTemperature: boolean;
  referenceBoard: string;
  sources: OperatingSource[];
}

/** A configuration result checks only the explicitly listed output/package
 * combination. Other catalog requirements and application conditions remain separate. */
export interface SelectionAssessment {
  basis: 'catalog_record';
  requirementsStatus: 'matched' | 'incomplete';
  orderableStatus: 'unverified' | 'configuration_found' | 'no_listed_configuration';
  orderableCheckedTags?: string[];
  matchingOrderables?: OrderableConfiguration[];
  adjustableOrderables?: AdjustableOrderable[];
  operatingStatus?: 'unverified' | 'inside_documented_bounds' | 'outside_documented_bounds';
  operatingChecks?: OperatingCheck[];
  thermalReferenceChecks?: ThermalReferenceCheck[];
  namedRailStatus?: 'unverified' | 'inside_documented_bounds' | 'outside_documented_bounds';
  namedRailCheck?: { vccaV: number; vccbV: number; checkedTags: string[];
    status: 'inside_documented_bounds' | 'outside_documented_bounds'; sources: OperatingSource[] };
  applicationStatus: 'unverified';
}

function checkNsr31ThermalReference(config: OrderableConfiguration, rawFacts: unknown,
  tags: string[]): ThermalReferenceCheck | null {
  if (config.parentModel !== 'NSR31xxx' || !Array.isArray(rawFacts)) return null;
  const vins = numericTags(tags, /^Vin_(\d+(?:\.\d+)?)V$/);
  const currents = numericTags(tags, /^Iout_(\d+(?:\.\d+)?)A$/);
  if (vins.length !== 1 || currents.length !== 1) return null;
  const facts = rawFacts.filter((fact): fact is OperatingFact => fact && typeof fact === 'object'
    && fact.applicableCatalogModels?.length === 0
    && fact.applicableOrderNumbers?.includes(config.orderNumber)
    && fact.source?.documentSha256 === config.source.documentSha256);
  const one = (field: string, scope: string) => {
    const found = facts.filter(fact => fact.field === field && fact.conditionScope === scope);
    return found.length === 1 ? found[0] : undefined;
  };
  const minimum = one('vin_min', 'recommended_operation');
  const maximum = one('vin_max', 'recommended_operation');
  const current = one('iout_max', 'regulated_output');
  const ambient = one('ta_range', 'recommended_operation');
  const theta = one('theta_ja', 'thermal_reference');
  const junction = one('tj_limit', 'application_estimate');
  const formula = one('thermal_formula', 'application_estimate');
  const base = minimum?.conditionSetId;
  if (!base || maximum?.conditionSetId !== base || ambient?.conditionSetId !== base
      || !current?.conditionParentIds?.includes(base)
      || !junction?.conditionParentIds?.includes(base)
      || formula?.conditionSetId !== junction?.conditionSetId
      || current.qualifiers?.output !== 'requires_dropout_verification'
      || theta?.qualifiers?.boardImplementation !== 'JEDEC JESD 51-7 four-layer reference'
      || formula?.qualifiers?.groundCurrent !== 'ignored_for_optimistic_bound') return null;
  const thermal = theta.value as { package?: string; thetaJaCPerW?: number };
  const ambientRange = ambient.value as { min?: number; max?: number };
  const equation = formula.value as { powerDissipation?: string; junctionTemperature?: string };
  if (thermal?.package !== config.package || typeof thermal.thetaJaCPerW !== 'number'
      || typeof minimum.value !== 'number' || typeof maximum.value !== 'number'
      || typeof current.value !== 'number' || typeof junction.value !== 'number'
      || typeof ambientRange?.min !== 'number' || typeof ambientRange?.max !== 'number'
      || equation?.powerDissipation !== '(vin-vout)*iout+vin*iq'
      || equation.junctionTemperature !== 'tc+pd*psiJc') return null;
  const vin = vins[0].value, iout = currents[0].value;
  if (vin < minimum.value || vin > maximum.value || vin < config.outputVoltageV
      || iout < 0 || iout > current.value) return null;
  // Manufacturer supplies the PD formula and JEDEC theta-JA separately. This
  // joins them only as a labeled reference-board lower bound on dissipated heat.
  const optimisticMaximumAmbientC = junction.value
    - (vin - config.outputVoltageV) * iout * thermal.thetaJaCPerW;
  return { orderNumber: config.orderNumber, inputV: vin, outputCurrentA: iout,
    outputVoltageV: config.outputVoltageV, package: config.package,
    referenceThetaJaCPerW: thermal.thetaJaCPerW,
    optimisticMaximumAmbientC: Number(optimisticMaximumAmbientC.toFixed(2)),
    junctionGuidanceC: junction.value,
    belowRatedAmbientMinimum: optimisticMaximumAmbientC < ambientRange.min,
    belowRoomTemperature: optimisticMaximumAmbientC < 25,
    referenceBoard: 'JEDEC JESD 51-7 四层参考板',
    sources: [minimum, maximum, current, ambient, theta, junction, formula].map(item => item!.source) };
}

function numericTags(tags: string[], pattern: RegExp): { tag: string; value: number }[] {
  const matches: { tag: string; value: number }[] = [];
  for (const tag of tags) {
    const match = tag.match(pattern);
    if (match) matches.push({ tag, value: Number(match[1]) });
  }
  return matches;
}

function checkNamedRails(product: { part_number?: string; _operating_facts?: unknown }, tags: string[])
  : SelectionAssessment['namedRailCheck'] | null {
  const a = numericTags(tags, /^VCCA_(\d+(?:\.\d+)?)V$/);
  const b = numericTags(tags, /^VCCB_(\d+(?:\.\d+)?)V$/);
  if (a.length !== 1 || b.length !== 1 || !Array.isArray(product._operating_facts)) return null;
  const facts = product._operating_facts.filter((fact): fact is OperatingFact =>
    fact && typeof fact === 'object' && fact.applicableCatalogModels?.includes(product.part_number || '')
    && typeof fact.source?.documentSha256 === 'string');
  const one = (field: string, scope: string) => {
    const rows = facts.filter(item => item.field === field && item.conditionScope === scope
      && item.rating === 'operating');
    return rows.length === 1 ? rows[0] : undefined;
  };
  const min = one('vcca_min', 'recommended_operation');
  const range = one('vccb_range', 'recommended_operation');
  const order = one('vcca_vccb_order', 'recommended_operation');
  const enabled = one('vcca_vccb_enabled_rule', 'functional_dependency');
  if (!min || !range || !order || !enabled) return null;
  const base = min.conditionSetId;
  const sourceHash = min.source.documentSha256;
  if (range.conditionSetId !== base || order.conditionSetId !== base
      || !enabled.conditionParentIds?.includes(base)
      || enabled.qualifiers?.channels !== 'enabled'
      || [range, order, enabled].some(item => item.source.documentSha256 !== sourceHash)) return null;
  const r = range.value as { min?: number; max?: number };
  const relation = order.value as { operator?: string; left?: string; right?: string };
  const rule = enabled.value as { left?: string; leftFactor?: number; leftOffsetV?: number;
    operator?: string; right?: string };
  if (typeof min.value !== 'number' || typeof r?.min !== 'number' || typeof r?.max !== 'number'
      || relation?.operator !== 'lte' || relation.left !== 'VCCA' || relation.right !== 'VCCB'
      || rule?.left !== 'VCCA' || rule.leftFactor !== 0.4 || rule.leftOffsetV !== 0.8
      || rule.operator !== 'lte' || rule.right !== 'VCCB') return null;
  const inside = a[0].value >= min.value && b[0].value >= r.min && b[0].value <= r.max
    && a[0].value <= b[0].value && 0.4 * a[0].value + 0.8 <= b[0].value;
  return { vccaV: a[0].value, vccbV: b[0].value, checkedTags: [a[0].tag, b[0].tag],
    status: inside ? 'inside_documented_bounds' : 'outside_documented_bounds',
    sources: [min.source, range.source, order.source, enabled.source] };
}

function checkOperating(config: OrderableConfiguration, rawFacts: unknown, tags: string[]): OperatingCheck | null {
  if (!Array.isArray(rawFacts)) return null;
  const vins = numericTags(tags, /^Vin_(\d+(?:\.\d+)?)V$/);
  const iouts = numericTags(tags, /^Iout_(\d+(?:\.\d+)?)A$/);
  if (!vins.length && !iouts.length) return null;
  const facts = rawFacts.filter((fact): fact is OperatingFact =>
    fact && typeof fact === 'object'
    && Array.isArray(fact.applicableOrderNumbers)
    && fact.applicableOrderNumbers.includes(config.orderNumber)
    && fact.source?.documentSha256 === config.source.documentSha256);
  const unique = (field: string, scope: string, rating: string) => {
    const rows = facts.filter(item => item.field === field
      && item.conditionScope === scope && item.rating === rating);
    return rows.length === 1 ? rows[0] : undefined;
  };
  const minFact = unique('vin_min_rule', 'recommended_operation', 'operating');
  const maxFact = unique('vin_max', 'recommended_operation', 'operating');
  const currentFact = unique('iout_max', 'regulated_output', 'operating');
  const baseCondition = minFact?.conditionSetId;
  if (!baseCondition || maxFact?.conditionSetId !== baseCondition
      || !currentFact?.conditionParentIds?.includes(baseCondition)
      || currentFact.qualifiers?.output !== 'in_regulation') return null;
  const minRule = minFact.value as { operator?: string; constantV?: number; outputOffsetV?: number } | undefined;
  const maxVin = maxFact.value;
  const maxIout = currentFact.value;
  if (minRule?.operator !== 'max' || typeof minRule.constantV !== 'number'
      || typeof minRule.outputOffsetV !== 'number'
      || typeof maxVin !== 'number' || typeof maxIout !== 'number') return null;
  const minimumInputV = Math.max(minRule.constantV, config.outputVoltageV + minRule.outputOffsetV);
  const checkedTags = [...vins, ...iouts].map(item => item.tag);
  const inside = vins.every(vin => vin.value >= minimumInputV && vin.value <= maxVin)
    && iouts.every(iout => iout.value >= 0 && iout.value <= maxIout);
  const result: OperatingCheck = {
    orderNumber: config.orderNumber, checkedTags,
    status: inside ? 'inside_documented_bounds' : 'outside_documented_bounds',
    minimumInputV, maximumInputV: maxVin, maximumOutputCurrentA: maxIout,
    sources: [minFact.source, maxFact.source, currentFact.source],
  };
  const theta = unique('theta_ja', 'thermal_reference', 'estimate');
  const junction = unique('tj_range', 'recommended_operation', 'operating');
  const ambient = unique('ta_range', 'recommended_operation', 'operating');
  const formula = unique('thermal_formula', 'application_estimate', 'estimate');
  const thetaValue = theta?.value as { package?: string; thetaJaCPerW?: number } | undefined;
  const junctionValue = junction?.value as { max?: number } | undefined;
  const ambientValue = ambient?.value as { min?: number } | undefined;
  if (inside && vins.length === 1 && iouts.length === 1 && thetaValue?.package === config.package
      && junction?.conditionSetId === baseCondition
      && ambient?.conditionSetId === baseCondition
      && formula?.conditionParentIds?.includes(baseCondition)
      && typeof thetaValue.thetaJaCPerW === 'number'
      && typeof junctionValue?.max === 'number'
      && typeof ambientValue?.min === 'number'
      && formula?.value && vins[0].value >= config.outputVoltageV) {
    // The datasheet adds VIN × IGND. Omitting it gives an optimistic upper
    // bound for permissible ambient temperature, never a suitability proof.
    const optimisticMaximumAmbientC = junctionValue.max
      - (vins[0].value - config.outputVoltageV) * iouts[0].value * thetaValue.thetaJaCPerW;
    result.thermal = {
      referenceThetaJaCPerW: thetaValue.thetaJaCPerW,
      optimisticMaximumAmbientC: Number(optimisticMaximumAmbientC.toFixed(2)),
      ratedAmbientMinimumC: ambientValue.min,
      exceedsFullRatedAmbientRange: optimisticMaximumAmbientC < ambientValue.min,
      sourceFactIds: [theta, junction, ambient, formula].map(item => item!.source.factId),
      sources: [theta, junction, ambient, formula].map(item => item!.source),
    };
  }
  return result;
}

export function catalogAssessment(
  fullMatch: boolean,
  product?: { part_number?: string; _orderable_configurations?: unknown;
    _adjustable_orderables?: unknown; _configuration_options?: unknown; _operating_facts?: unknown },
  hardTags: string[] = [],
): SelectionAssessment {
  const base: SelectionAssessment = {
    basis: 'catalog_record',
    requirementsStatus: fullMatch ? 'matched' : 'incomplete',
    orderableStatus: 'unverified',
    applicationStatus: 'unverified',
  };
  if (hardTags.some(tag => /^VCC[AB]_\d/.test(tag))) {
    const check = checkNamedRails(product || {}, hardTags);
    base.namedRailStatus = check?.status || 'unverified';
    if (check) base.namedRailCheck = check;
  }
  const configs = reviewedOrderableConfigurations(product);
  const adjustable = reviewedAdjustableOrderables(product);
  const options = reviewedConfigurationOptions(product);
  if (!configs.length && !adjustable.length && !options.length) return base;
  const checked = hardTags.filter(tag => isPackageTag(tag) || /^Vout_\d+(?:\.\d+)?V$/.test(tag));
  if (!checked.length) return base;
  const matchingOptions = options.filter(option => checked.every(tag => isPackageTag(tag) && packageMatches(`Package: ${option.package}`, tag)));
  const matching = configs.filter(config => checked.every(tag => {
    if (isPackageTag(tag)) return orderablePackageMatches(config, tag);
    const requested = Number(tag.match(/^Vout_(\d+(?:\.\d+)?)V$/)?.[1]);
    return Number.isFinite(requested) && Math.abs(config.outputVoltageV - requested) < 1e-9;
  }));
  const matchingAdjustable = adjustable.filter(config => checked.every(tag => {
    if (isPackageTag(tag)) return orderablePackageMatches(config, tag);
    const requested = Number(tag.match(/^Vout_(\d+(?:\.\d+)?)V$/)?.[1]);
    return Number.isFinite(requested) && requested >= config.adjustableRangeV.min
      && requested <= config.adjustableRangeV.max;
  }));
  const hasOutputVoltage = checked.some(tag => /^Vout_\d+(?:\.\d+)?V$/.test(tag));
  const operatingChecks = matching.map(config => checkOperating(config, product?._operating_facts, hardTags))
    .filter((check): check is OperatingCheck => check !== null);
  const thermalReferenceChecks = matching.map(config => checkNsr31ThermalReference(config, product?._operating_facts, hardTags))
    .filter((check): check is ThermalReferenceCheck => check !== null);
  const operatingStatus = !operatingChecks.length ? 'unverified'
    : operatingChecks.some(check => check.status === 'inside_documented_bounds')
      ? 'inside_documented_bounds' : 'outside_documented_bounds';
  return {
    ...base,
    orderableStatus: matching.length || matchingOptions.length || (matchingAdjustable.length && !hasOutputVoltage)
      ? 'configuration_found' : matchingAdjustable.length ? 'unverified' : 'no_listed_configuration',
    orderableCheckedTags: checked,
    matchingOrderables: matching,
    ...(matchingOptions.length ? { matchingConfigurations: matchingOptions } : {}),
    ...(matchingAdjustable.length ? { adjustableOrderables: matchingAdjustable } : {}),
    operatingStatus,
    operatingChecks,
    ...(thermalReferenceChecks.length ? { thermalReferenceChecks } : {}),
  };
}
