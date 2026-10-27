import {describe,it,expect} from 'vitest';
import {AgentCapabilityAuthority} from '../src/main/agent-capability';

describe('agent authority',()=>{
 it('cannot enroll an actor label or session environment assertion by default',async()=>{
  const authority=new AgentCapabilityAuthority();
  await expect(authority.enroll({actor:'agent',sessionId:process.env.HERMES_SESSION_ID})).rejects.toThrow('AGENT_ENROLLMENT_REQUIRED');
 });
 it('binds a one-use capability to a genuine session and exact proposal, journaling before action',async()=>{
  const now=Date.now();const authority=new AgentCapabilityAuthority(async proof=>proof==='supervisor-fixture'?{principal:'fixture-agent',runId:'run-1',expiresAt:now+60000}:null,()=>now);
  const session=await authority.enroll('supervisor-fixture');
  const scope={taskNo:'M03989/Task. IT/1026',proposalDigest:'a'.repeat(64),evidenceDigest:'b'.repeat(64),policyRevision:'v1'};
  const token=authority.issue(session,scope);const events:string[]=[];
  expect(()=>authority.consume({...session},token,scope,()=>events.push('durable'))).toThrow('AGENT_UNAUTHORIZED');
  expect(()=>authority.consume(session,token,{...scope,taskNo:'OTHER'},()=>events.push('durable'))).toThrow('CAPABILITY_SCOPE');
  authority.consume(session,token,scope,()=>events.push('durable'));events.push('action');
  expect(events).toEqual(['durable','action']);
  expect(()=>authority.consume(session,token,scope,()=>events.push('again'))).toThrow('CAPABILITY_REPLAY');
 });
 it('rejects expired and revoked sessions and burns tokens on uncertain storage failure',async()=>{
  let now=100000;const authority=new AgentCapabilityAuthority(async()=>({principal:'fixture',runId:'r',expiresAt:now+120000}),()=>now);
  const session=await authority.enroll(null);const scope={taskNo:'TASK',proposalDigest:'a'.repeat(64),evidenceDigest:'b'.repeat(64),policyRevision:'v1'};
  const token=authority.issue(session,scope);
  expect(()=>authority.consume(session,token,scope,()=>{throw new Error('disk full');})).toThrow('disk full');
  expect(()=>authority.consume(session,token,scope,()=>{})).toThrow('CAPABILITY_REPLAY');
  const expiring=authority.issue(session,scope);now+=60001;
  expect(()=>authority.consume(session,expiring,scope,()=>{})).toThrow('CAPABILITY_REPLAY');
  const revoked=authority.issue(session,scope);authority.revoke(session);
  expect(()=>authority.consume(session,revoked,scope,()=>{})).toThrow('AGENT_UNAUTHORIZED');
 });
});
