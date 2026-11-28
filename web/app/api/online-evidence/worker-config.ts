/** A configured service endpoint, never derived from user input. Local development
 * may use loopback; hosted workers must use TLS and share an explicit token. */
export function evidenceWorkerBase(env:NodeJS.ProcessEnv=process.env):string {
 const raw=env.ONLINE_EVIDENCE_WORKER_URL||'http://127.0.0.1:3232';
 const u=new URL(raw);const local=['127.0.0.1','localhost','[::1]'].includes(u.hostname);
 if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.protocol!=='https:'&&!(local&&u.protocol==='http:'))throw new Error('Invalid evidence worker endpoint');
 return u.origin;
}
