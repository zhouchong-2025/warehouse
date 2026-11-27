/** Recover only semantically empty duplicated scaffolding, never missing values. */
export function parsePlanContent(content: unknown): {value: unknown; repair?: 'trailing_empty_scaffold'} {
  if(typeof content!=='string')return {value:null};
  const text=content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return {value:JSON.parse(text)};}catch{/* Inspect an otherwise complete root object. */}
  if(!text.startsWith('{'))return {value:null};
  let depth=0,quoted=false,escaped=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"'){quoted=true;continue;}
    if(c==='{')depth++;else if(c==='}')depth--;
    if(depth!==0)continue;
    const tail=text.slice(i+1);
    // Only redundant closing delimiters and empty bookkeeping arrays may be
    // discarded. Another object, branch, exclusion or nonempty value is fatal.
    if(!/"(?:exclude|waived|unresolved|contexts)"/.test(tail)
      || !/^[\s}\],]*(?:"(?:exclude|waived|unresolved|contexts)"\s*:\s*\[\s*\][\s,}\]]*)+$/.test(tail))return {value:null};
    try{return {value:JSON.parse(text.slice(0,i+1)),repair:'trailing_empty_scaffold'};}catch{return {value:null};}
  }
  return {value:null};
}
