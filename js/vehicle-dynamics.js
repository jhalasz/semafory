// Universal longitudinal vehicle dynamics. Units: SVG distance units / simulation second.
// Geometry calibration for the active map: 8 SVG units per metre (720 units / 90 metres).
// 50 km/h = 111.11 units/s, Vehicle sprite and collision dimensions are 80% of the previous prototype scale.
// No assumptions about Massag geometry, traffic signals or intersection topology.
export const VEHICLE_TYPES=Object.freeze({
 car:Object.freeze({length:22.4,width:9,cruise:111.11,maxAcceleration:16,comfortableBrake:24,emergencyBrake:48,reaction:0.75,minimumGap:12}),
 truck:Object.freeze({length:40,width:13,cruise:88.89,maxAcceleration:9.6,comfortableBrake:18,emergencyBrake:40,reaction:1.05,minimumGap:16})
});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function desiredGap(vehicle,leader){
 const p=vehicle.spec,v=Math.max(0,vehicle.v),aheadV=Math.max(0,leader?.v??0);
 // IDM-style dynamic desired clearance including relative speed.
 return p.minimumGap+Math.max(0,v*p.reaction+v*(v-aheadV)/(2*Math.sqrt(p.maxAcceleration*p.comfortableBrake)));
}
export function acceleration(vehicle,obstacle){
 const p=vehicle.spec,v=Math.max(0,vehicle.v);
 const free=p.maxAcceleration*(1-Math.pow(v/p.cruise,4));
 if(!obstacle||!Number.isFinite(obstacle.gap))return clamp(free,-p.emergencyBrake,p.maxAcceleration);
 const gap=Math.max(0.1,obstacle.gap),target=desiredGap(vehicle,obstacle);
 return clamp(free-p.maxAcceleration*Math.pow(target/gap,2),-p.emergencyBrake,p.maxAcceleration);
}
export function advanceVehicle(vehicle,obstacle,dt){
 if(!(dt>0))return;
 const p=vehicle.spec,acc=acceleration(vehicle,obstacle),oldV=Math.max(0,vehicle.v);
 let newV=clamp(oldV+acc*dt,0,p.cruise);
 let step=(oldV+newV)*dt/2;
 // Physical constraint: a rear bumper must never penetrate the leader.
 // The gap is bumper-to-bumper, hence already accounts for car/truck length.
 if(obstacle&&Number.isFinite(obstacle.gap)){
  const leaderStep=Math.max(0,obstacle.v||0)*dt;
  const allowed=Math.max(0,obstacle.gap+leaderStep-p.minimumGap);
  if(step>allowed){step=allowed;newV=Math.min(newV,step/dt);}
 }
 vehicle.v=newV;vehicle.s+=Math.max(0,step);
}
