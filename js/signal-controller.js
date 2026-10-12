// Universal signal controller. Signal groups and stage durations are data, not road-specific code.
export function createSignalController(config){
 const stages=config?.stages;
 if(!Array.isArray(stages)||!stages.length||stages.some(s=>!Array.isArray(s.green)||!s.green.length))throw Error("Chybí definice fází semaforů.");
 let stage=0,mode="green",elapsed=0;
 const greenSeconds=s=>Math.max(2,Number(s.greenSeconds)||12);
 const yellowSeconds=Math.max(1,Number(config.yellowSeconds)||3);
 const redYellowSeconds=Math.max(1,Number(config.redYellowSeconds)||2);
 const allRedSeconds=Math.max(1,Number(config.allRedSeconds)||2);
 const state=signal=>{
  const active=stages[stage].green.includes(signal);
  if(!active)return"red";
  if(mode==="green")return"green";
  if(mode==="yellow")return"yellow";
  if(mode==="red-yellow")return"red-yellow";
  return"red";
 };
 // A live clearance check means a vehicle that crossed the line is never
 // trapped by a countdown. The next stage waits for the *entire* preceding
 // stream to vacate the controlled crossing.
 function tick(dt,hasVehicleInside){
  let remaining=Math.max(0,dt);
  while(remaining>0){
   const duration=mode==="green"?greenSeconds(stages[stage]):mode==="yellow"?yellowSeconds:mode==="all-red"?allRedSeconds:redYellowSeconds;
   const advance=Math.min(remaining,Math.max(0,duration-elapsed));
   elapsed+=advance;remaining-=advance;
   if(elapsed+1e-9<duration)break;
   if(mode==="green"){mode="yellow";elapsed=0;}
   else if(mode==="yellow"){mode="all-red";elapsed=0;}
   else if(mode==="all-red"){
    // Wait for exiting vehicles, without counting waiting time towards the
    // red/yellow stage. The new stage may only start on an empty intersection.
    if(hasVehicleInside(stages[stage].green))break;
    stage=(stage+1)%stages.length;mode="red-yellow";elapsed=0;
   }
   else{mode="green";elapsed=0;}
  }
 }
 return {state,tick,reset(){stage=0;mode="green";elapsed=0;},status(){return {stage:stage+1,mode,green:[...stages[stage].green],elapsed}}};
}
