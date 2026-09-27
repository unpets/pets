import './style.css';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const modes={idle:['Idle','A quiet breathing cycle, with an occasional blink.'], 'running-right':['Move right','Alternating foot contact and opposing arm swing.'], 'running-left':['Move left','The same articulated gait, turned toward the left.'], waving:['Wave','A raised forearm and a small wrist-led greeting.'], jumping:['Jump','Anticipation, lift, and a soft return to the ground.'], failed:['Failure','A subdued head dip and a tired display.'], waiting:['Waiting','Open hands and an expectant upward glance.'], running:['Active work','Terminal output and digital rain. The wrist cable connects to the server.'], review:['Review','A hand near the chin and a deliberate inspection sweep.'], look:['Look around','A continuous clockwise sweep through sixteen directions.']};
const $=id=>document.getElementById(id), viewport=$('viewport');
const scene=new THREE.Scene();
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
viewport.appendChild(renderer.domElement);
const camera=new THREE.PerspectiveCamera(32,1,.05,100);camera.up.set(0,0,1);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(.12,0,1.40);controls.enableDamping=true;controls.minDistance=3;controls.maxDistance=12;controls.maxPolarAngle=Math.PI*.95;
function setCamera(view){const pos={home:[3.2,-7.5,3.5],front:[0,-10,1.5],side:[9,-.1,2.5],back:[0,10,2.8]}[view];camera.position.set(...pos);controls.target.set(.10,0,1.43);controls.update();}
setCamera('home');
scene.add(new THREE.HemisphereLight(0xd6edff,0x384555,2.2));
for(const [pos,color,power] of [[[-3,-5,7],0xedf6ff,3.5],[[4,-2,4],0xbcdcff,1.7],[[-2,4,6],0xd9caff,2.7]]){const light=new THREE.DirectionalLight(color,power);light.position.set(...pos);scene.add(light);}
const grid=new THREE.GridHelper(12,48,0x3a5667,0x273e4d);grid.rotation.x=Math.PI/2;grid.position.z=-.026;grid.material.transparent=true;grid.material.opacity=.36;scene.add(grid);
new ResizeObserver(()=>{const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}).observe(viewport);
let model,data,screenImage,display,server,parts={},ready=false,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,state='running',phase=0,speed=1,previousTime=performance.now(),transition=null;
const canvas=$('screen'),ctx=canvas.getContext('2d');
// glTF UVs already use image-top coordinates; do not flip the framebuffer twice.
const screenCanvas=document.createElement('canvas');screenCanvas.width=96;screenCanvas.height=64;const screenCtx=screenCanvas.getContext('2d');
const screenTex=new THREE.CanvasTexture(screenCanvas);screenTex.colorSpace=THREE.SRGBColorSpace;screenTex.magFilter=THREE.NearestFilter;screenTex.minFilter=THREE.NearestFilter;screenTex.flipY=false;
const cablePositions=new Float32Array(32*8*3),cableIndices=[];
for(let i=0;i<31;i++)for(let j=0;j<8;j++){const a=i*8+j,b=i*8+(j+1)%8,c=(i+1)*8+(j+1)%8,d=(i+1)*8+j;cableIndices.push(a,b,d,b,c,d);}
const cableGeometry=new THREE.BufferGeometry();cableGeometry.setAttribute('position',new THREE.BufferAttribute(cablePositions,3));cableGeometry.setIndex(cableIndices);
const cable=new THREE.Mesh(cableGeometry,new THREE.MeshStandardMaterial({color:0x347888,metalness:.15,roughness:.5}));cable.frustumCulled=false;scene.add(cable);
const jointsGroup=new THREE.Group();jointsGroup.visible=false;scene.add(jointsGroup);const joints=[];
const markerGeometry=new THREE.SphereGeometry(.055,12,8),markerMaterial=new THREE.MeshBasicMaterial({color:0xefd394,depthTest:false,transparent:true,opacity:.8});
for(let i=0;i<12;i++){const mesh=new THREE.Mesh(markerGeometry,markerMaterial);jointsGroup.add(mesh);joints.push(mesh);}
const q1=new THREE.Quaternion(),q2=new THREE.Quaternion(),p1=new THREE.Vector3(),p2=new THREE.Vector3(),p=new THREE.Vector3(),q=new THREE.Quaternion();
function framePose(){const samples=data.states[state].samples;const f=phase*120;return [samples[Math.floor(f)],samples[Math.min(120,Math.floor(f)+1)],f%1];}
function updateCable(a,b,u){const points=a.cable.map((v,i)=>new THREE.Vector3(...v).lerp(new THREE.Vector3(...b.cable[i]),u));for(let i=0;i<32;i++){const tangent=points[Math.min(31,i+1)].clone().sub(points[Math.max(0,i-1)]).normalize();const side=new THREE.Vector3(1,0,0).cross(tangent).normalize();const normal=tangent.clone().cross(side).normalize();for(let j=0;j<8;j++){const angle=j*Math.PI/4;const v=points[i].clone().addScaledVector(side,.025*Math.cos(angle)).addScaledVector(normal,.025*Math.sin(angle));v.toArray(cablePositions,(i*8+j)*3);}}cableGeometry.attributes.position.needsUpdate=true;cableGeometry.computeVertexNormals();}
function updatePose(now){if(!ready)return;const [a,b,u]=framePose();const blend=transition?Math.min(1,(now-transition.started)/180):1;
  for(const [name,obj] of Object.entries(parts)){if(!a.parts[name])continue;const aa=a.parts[name],bb=b.parts[name];p1.fromArray(aa.p);p2.fromArray(bb.p);p.copy(p1).lerp(p2,u);q1.fromArray(aa.q);q2.fromArray(bb.q);q.copy(q1).slerp(q2,u);if(transition&&transition.parts[name]){p.lerpVectors(transition.parts[name].p,p,blend);q.slerpQuaternions(transition.parts[name].q,q,blend);}obj.position.copy(p);obj.quaternion.copy(q);obj.updateMatrix();}
  if(blend===1)transition=null;server.visible=state==='running';cable.visible=state==='running';if(cable.visible)updateCable(a,b,u);
  const screenRow=data.states[state].screenRow,screenFrame=Math.min(47,Math.floor(phase*48));ctx.drawImage(screenImage,96*screenFrame,64*screenRow,96,64,0,0,96,64);screenCtx.drawImage(canvas,0,0);screenTex.needsUpdate=true;
  const names=['upper_arm.L','forearm.L','hand.L','upper_arm.R','forearm.R','hand.R','thigh.L','shin.L','foot.L','thigh.R','shin.R','foot.R'];names.forEach((n,i)=>{if(parts[n])joints[i].position.copy(parts[n].position);});
  $('timeline').value=Math.round(phase*1000);$('time').textContent=(phase*data.states[state].duration).toFixed(2)+' s';
}
function setState(next){if(!ready)return;transition={started:performance.now(),parts:{}};for(const [n,o]of Object.entries(parts))transition.parts[n]={p:o.position.clone(),q:o.quaternion.clone()};state=next;phase=0;for(const button of $('states').children)button.setAttribute('aria-pressed',String(button.dataset.state===state));$('current-mode').textContent=modes[state][0];$('mode-description').textContent=modes[state][1];$('screen').setAttribute('aria-label',modes[state][0]+' display');updatePose(performance.now());}
for(const [name,[label]]of Object.entries(modes)){const button=document.createElement('button');button.textContent=label;button.dataset.state=name;button.setAttribute('aria-pressed',String(name===state));button.onclick=()=>setState(name);$('states').append(button);}
function updatePlay(){ $('play').textContent=playing?'Pause':'Play';$('play').setAttribute('aria-label',playing?'Pause animation':'Play animation');}
$('play').onclick=()=>{playing=!playing;updatePlay();};updatePlay();
$('speed').onchange=e=>{speed=Number(e.target.value);};
$('timeline').oninput=e=>{phase=Number(e.target.value)/1000;playing=false;transition=null;updatePlay();updatePose(performance.now());};
$('wireframe').onchange=e=>{if(model)model.traverse(o=>{if(o.isMesh&&o!==display){for(const m of Array.isArray(o.material)?o.material:[o.material])m.wireframe=e.target.checked;}});};
$('joints').onchange=e=>{jointsGroup.visible=e.target.checked;};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setCamera(b.dataset.view));
try{
 const [gltf,json,image]=await Promise.all([new GLTFLoader().loadAsync('assets/kernel.glb'),fetch('assets/animations.json').then(r=>{if(!r.ok)throw Error('Animation data unavailable');return r.json();}),new THREE.ImageLoader().loadAsync('assets/screens.png')]);model=gltf.scene;data=json;screenImage=image;scene.add(model);
 model.traverse(o=>{if(o.userData.rig_part)parts[o.userData.rig_part]=o;if(o.userData.is_display)display=o;});
 if(!display||!parts.head||!parts.server)throw Error('The model is missing required rig nodes.');
 server=parts.server;display.material=new THREE.MeshBasicMaterial({map:screenTex,toneMapped:false});
 ready=true;$('loading').hidden=true;$('detail').textContent=data.voxelCount.toLocaleString()+' source voxels · 35 mm grid';updatePose(performance.now());
 // Deterministic test interface. No network or service state is exposed.
 window.kernelViewer={setState,seek:t=>{playing=false;phase=Math.max(0,Math.min(1,t));transition=null;updatePlay();updatePose(performance.now());},get state(){return state;},get ready(){return ready;},get parts(){return parts;},get camera(){return camera;},get serverVisible(){return server.visible;}};
}catch(error){$('loading').textContent='The model could not load. Reload the page to retry.';$('loading').setAttribute('role','alert');console.error(error);}
function animate(now){const dt=Math.min((now-previousTime)/1000,.05);previousTime=now;if(ready&&playing)phase=(phase+dt*speed/data.states[state].duration)%1;updatePose(now);controls.update();renderer.render(scene,camera);requestAnimationFrame(animate);}requestAnimationFrame(animate);
