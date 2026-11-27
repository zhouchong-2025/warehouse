import {PARAMETERS,sourceMeasurements,measurementForField} from './selection-spec';
/** Mapping one quantity cannot discharge other dimensions in a compound source.
 * Protocol-version tokens may resemble units (CAN 2.0B); preserve them for
 * document verification rather than forcing them into a resource-count field. */
export function unboundRequirementMeasurements(r:{source:string;searchFields:string[]}){
 return sourceMeasurements(r.source).filter(m=>!r.searchFields.some(field=>Object.hasOwn(PARAMETERS,field)&&measurementForField(field as keyof typeof PARAMETERS,m.value,m.unit)!==null));
}

/** This existing protocol obligation is shared with the legacy plan guard;
 * a controller count is never evidence for an actual frame format. */
export function separateProtocolEvidence(r:{source:string;searchFields:string[]}){
 return r.searchFields.some(f=>['canChannels','canFdChannels'].includes(f))&&/CAN\s*2\.0[AB]?\b/i.test(r.source);
}
