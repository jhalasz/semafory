// Universal, simulation-time-independent stochastic decisions.
// Only red-light running and failure-to-yield can be random violations.
// An event ID is sampled only once for each vehicle and manoeuvre.
export class DriverRiskModel {
 constructor({annualCrashes=0,annualVehicles=1,ruleViolationMultiplier=100,seed=17}={}){
  this.configure({annualCrashes,annualVehicles,ruleViolationMultiplier});this.seed=seed>>>0;this.decisions=new Map();
 }
 configure({annualCrashes=this.annualCrashes,annualVehicles=this.annualVehicles,ruleViolationMultiplier=this.ruleViolationMultiplier}={}){
  this.annualCrashes=Math.max(0,Number(annualCrashes)||0);
  this.annualVehicles=Math.max(1,Number(annualVehicles)||1);
  this.ruleViolationMultiplier=Math.max(1,Number(ruleViolationMultiplier)||1);
 }
 random(){this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;return this.seed/4294967296;}
 get crashTargetPerTraversal(){return Math.min(.999,this.annualCrashes/this.annualVehicles);}
 get violationProbability(){return Math.min(.25,this.crashTargetPerTraversal*this.ruleViolationMultiplier);}
 decide(vehicleId,eventId,eventType="red-light"){
  if(!["red-light","failure-to-yield"].includes(eventType))return false;
  const key=String(vehicleId)+":"+String(eventId)+":"+String(eventType);
  if(!this.decisions.has(key))this.decisions.set(key,this.random()<this.violationProbability);
  return this.decisions.get(key);
 }
 forgetVehicle(id){for(const key of this.decisions.keys())if(key.startsWith(String(id)+":"))this.decisions.delete(key);}
 export(){return{format:"semafory-driver-risk-1.0",annualCrashes:this.annualCrashes,annualVehicles:this.annualVehicles,ruleViolationMultiplier:this.ruleViolationMultiplier,seed:this.seed};}
}
// Risk choice permits a rule violation; collision still requires actual vehicle geometry overlap.
export function safeFollowingDistance({speed=0,reactionTime=1.2,standstillGap=2.5,deceleration=3.5}={}){
 return Math.max(0,standstillGap)+Math.max(0,speed)*Math.max(0,reactionTime)+speed*speed/(2*Math.max(.1,deceleration));
}
