import {createHash,randomBytes} from 'node:crypto';
export interface EnrolledAgent {principal:string;runId:string;expiresAt:number}
export interface CapabilityScope {taskNo:string;proposalDigest:string;evidenceDigest:string;policyRevision:string}
export type EnrollmentVerifier=(proof:unknown)=>Promise<EnrolledAgent|null>;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function scopeKey(s:CapabilityScope):string{
 if(!s||typeof s.taskNo!=='string'||!s.taskNo||s.taskNo.length>200||!/^[a-f0-9]{64}$/.test(s.proposalDigest)||!/^[a-f0-9]{64}$/.test(s.evidenceDigest)||typeof s.policyRevision!=='string'||!s.policyRevision||s.policyRevision.length>100)throw new Error('CAPABILITY_SCOPE');
 return JSON.stringify([s.taskNo,s.proposalDigest,s.evidenceDigest,s.policyRevision]);
}
/** Trusted supervisor verifier seam; never supplied by a pipe client or renderer.
 * No verifier is configured in the packaged app until genuine enrollment is proven.
 * Tokens are ephemeral; independent durable journal fences survive restarts.
 */
export class AgentCapabilityAuthority {
 private sessions=new WeakMap<object,EnrolledAgent>();
 private capabilities=new Map<string,{session:object;scope:string;expiresAt:number}>();
 constructor(private readonly verify:EnrollmentVerifier=async()=>null,private readonly now:()=>number=Date.now){}
 async enroll(proof:unknown):Promise<object>{
  const identity=await this.verify(proof);
  if(!identity||typeof identity.principal!=='string'||!identity.principal||typeof identity.runId!=='string'||!identity.runId||!Number.isFinite(identity.expiresAt)||identity.expiresAt<=this.now())throw new Error('AGENT_ENROLLMENT_REQUIRED');
  const session=Object.freeze({});this.sessions.set(session,{...identity});return session;
 }
 identity(session:object):Readonly<EnrolledAgent>{
  const identity=this.sessions.get(session);
  if(!identity||identity.expiresAt<=this.now())throw new Error('AGENT_UNAUTHORIZED');
  return Object.freeze({...identity});
 }
 issue(session:object,scope:CapabilityScope):string{
  const identity=this.identity(session);const key=scopeKey(scope);const token=randomBytes(32).toString('base64url');
  this.capabilities.set(hash(token),{session,scope:key,expiresAt:Math.min(identity.expiresAt,this.now()+60000)});return token;
 }
 consume(session:object,token:string,scope:CapabilityScope,persistConsumption:()=>void):void{
  this.identity(session);
  if(typeof token!=='string'||token.length!==43)throw new Error('CAPABILITY_REPLAY');
  const key=hash(token),capability=this.capabilities.get(key);
  if(!capability||capability.expiresAt<=this.now())throw new Error('CAPABILITY_REPLAY');
  if(capability.session!==session||capability.scope!==scopeKey(scope))throw new Error('CAPABILITY_SCOPE');
  this.capabilities.delete(key);persistConsumption();
 }
 revoke(session:object):void{this.sessions.delete(session);for(const [k,c] of this.capabilities)if(c.session===session)this.capabilities.delete(k);}
}
