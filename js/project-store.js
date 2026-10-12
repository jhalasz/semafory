const DB="semafory-projects",STORE="projects";
function openDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:"id"});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function transaction(mode,act){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode);const store=tx.objectStore(STORE);let request;try{request=act(store);}catch(e){db.close();reject(e);return;}tx.oncomplete=()=>{db.close();resolve(request?.result);};tx.onerror=()=>{db.close();reject(tx.error);};});}
export const projectStore={
 async save(p){return transaction("readwrite",s=>s.put(p));},
 async get(id){return transaction("readonly",s=>s.get(id));},
 async list(){const projects=await transaction("readonly",s=>s.getAll());return projects.sort((a,b)=>(b.updated||"").localeCompare(a.updated||"")).map(p=>({id:p.id,name:p.name,updated:p.updated}));},
 async remove(id){return transaction("readwrite",s=>s.delete(id));}
};
