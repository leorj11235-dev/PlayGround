(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 960, H = 540, FLOOR = 429;
  const input = new Set(), justPressed = new Set();
  const controls = {
    left: ['ArrowLeft','KeyA'], right: ['ArrowRight','KeyD'], up: ['ArrowUp','KeyW','Space'], down: ['ArrowDown','KeyS'],
    punch: ['KeyJ'], heavyPunch: ['KeyU'], kick: ['KeyK'], heavyKick: ['KeyI'], guard: ['KeyL'], special: ['KeyO']
  };
  const keyMap = new Map(Object.entries(controls).flatMap(([name, keys]) => keys.map(k => [k,name])));
  let muted = false, audio = null, lastTime = 0, clock = 0, particles = [], texts = [], screenShake = 0;
  let state = 'intro', stateTime = 0, round = 1, pWins = 0, cpuWins = 0, timeLeft = 60;
  const p1 = fighter(280, 1, 'p1'), cpu = fighter(680, -1, 'cpu');
  function fighter(x, dir, id) { return {x, y:0, vx:0, vy:0, dir, id, hp:100, meter:18, wins:0, crouch:false, guarding:false, attack:null, cooldown:0, stun:0, flash:0, walk:0, aiTimer:.2, aiMode:'approach', jumpLock:false}; }
  const attacks = {
    punch:{label:'JAB',damage:7,range:75,start:.10,active:.15,end:.15,cool:.30,meter:5,kind:'punch',knock:75},
    heavyPunch:{label:'POWER FIST',damage:13,range:91,start:.19,active:.18,end:.25,cool:.57,meter:8,kind:'heavyPunch',knock:135},
    kick:{label:'LOW KICK',damage:8,range:89,start:.13,active:.17,end:.19,cool:.38,meter:5,kind:'kick',knock:90},
    heavyKick:{label:'SKY BREAKER',damage:15,range:116,start:.25,active:.18,end:.30,cool:.72,meter:10,kind:'heavyKick',knock:165},
    special:{label:'NEON BURST',damage:22,range:245,start:.22,active:.24,end:.35,cool:1.0,meter:0,kind:'special',knock:240}
  };
  function beginAttack(f, name) {
    if (!f || f.attack || f.cooldown > 0 || f.stun > 0 || state !== 'fight') return false;
    const spec = attacks[name];
    if (name === 'special' && f.meter < 45) { if(f===p1) popText(f.x, FLOOR-140, 'PRECISA DE 45 ✦', '#ffcf72'); return false; }
    if (name === 'special') f.meter -= 45; else f.meter = Math.min(100, f.meter + spec.meter);
    f.attack = {name, spec, t:0, hit:false}; f.cooldown = spec.cool;
    if (name === 'special') { sfx('special'); screenShake=5; }
    else sfx(name.includes('heavy') ? 'swing' : 'tap');
    return true;
  }
  function sfx(type) {
    if(muted) return;
    try {
      audio ||= new (window.AudioContext||window.webkitAudioContext)();
      if(audio.state === 'suspended') audio.resume();
      const now=audio.currentTime, osc=audio.createOscillator(), gain=audio.createGain();
      osc.connect(gain); gain.connect(audio.destination);
      if(type==='hit') { osc.type='square'; osc.frequency.setValueAtTime(175,now); osc.frequency.exponentialRampToValueAtTime(65,now+.11); gain.gain.setValueAtTime(.12,now); gain.gain.exponentialRampToValueAtTime(.001,now+.13); osc.start(now); osc.stop(now+.14); }
      else if(type==='special') { osc.type='sawtooth'; osc.frequency.setValueAtTime(140,now); osc.frequency.exponentialRampToValueAtTime(650,now+.22); gain.gain.setValueAtTime(.07,now); gain.gain.exponentialRampToValueAtTime(.001,now+.3); osc.start(now); osc.stop(now+.31); }
      else { osc.type='triangle'; osc.frequency.setValueAtTime(type==='swing'?210:310,now); osc.frequency.exponentialRampToValueAtTime(100,now+.08); gain.gain.setValueAtTime(.035,now); gain.gain.exponentialRampToValueAtTime(.001,now+.09); osc.start(now); osc.stop(now+.1); }
    } catch(e) {}
  }
  function popText(x,y,text,color='#fff') { texts.push({x,y,text,color,life:1.1}); }
  function burst(x,y,color='gold',count=12) {
    for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=70+Math.random()*240;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.25+Math.random()*.42,max:.67,color,size:3+Math.random()*5});}
  }
  function hit(attacker, target) {
    const a=attacker.attack, spec=a.spec;
    if(a.hit || a.t < spec.start || a.t > spec.start+spec.active) return;
    const dist=Math.abs(attacker.x-target.x), facing=(target.x-attacker.x)*attacker.dir>0;
    const yGap=Math.abs(attacker.y-target.y);
    if(dist > spec.range || !facing || yGap>87) return;
    a.hit=true;
    const guarding=target.guarding && target.dir === -attacker.dir && target.y===0;
    const dmg=guarding?Math.max(1,Math.floor(spec.damage*.18)):spec.damage;
    target.hp=Math.max(0,target.hp-dmg); target.flash=guarding?.12:.17;
    target.stun=guarding?.16:(spec.kind==='special'?.46:.28);
    target.vx=attacker.dir*(guarding?spec.knock*.22:spec.knock);
    if(!guarding && spec.kind==='heavyKick' && target.y===0) target.vy=-140;
    const hx=(attacker.x+target.x)/2, hy=FLOOR-95-Math.max(attacker.y,target.y);
    burst(hx,hy,guarding?'cyan':(spec.kind==='special'?'pink':'gold'),guarding?7:14);
    popText(hx,hy-25,guarding?'GUARD!':`-${dmg}`,guarding?'#6ff8e9':'#ffe77d');
    screenShake=guarding?2:5; sfx('hit');
    if(attacker===p1) attacker.meter=Math.min(100,attacker.meter+(guarding?5:12));
    else attacker.meter=Math.min(100,attacker.meter+(guarding?4:9));
    if(target.hp<=0) finishRound(attacker===p1?'player':'cpu');
  }
  function finishRound(winner) {
    if(state!=='fight') return;
    state='roundEnd'; stateTime=0;
    if(winner==='player'){pWins++;p1.wins=pWins;popText(480,220,'ROUND '+round+' — VOCÊ VENCEU!','#7cf7e8');}
    else if(winner==='cpu'){cpuWins++;cpu.wins=cpuWins;popText(480,220,'ROUND '+round+' — KO!','#ff71ae');}
    else popText(480,220,'TEMPO ESGOTADO!','#ffdb83');
    burst(winner==='player'?cpu.x:p1.x,FLOOR-130,winner==='player'?'cyan':'pink',26);
    screenShake=7;
  }
  function startRound() {
    p1.x=280;p1.y=0;p1.vx=0;p1.vy=0;p1.hp=100;p1.attack=null;p1.cooldown=0;p1.stun=0;p1.dir=1;p1.guarding=false;
    cpu.x=680;cpu.y=0;cpu.vx=0;cpu.vy=0;cpu.hp=100;cpu.attack=null;cpu.cooldown=.25;cpu.stun=0;cpu.dir=-1;cpu.guarding=false;cpu.aiTimer=.5;
    timeLeft=60;state='intro';stateTime=0;
  }
  function update(dt) {
    clock+=dt; stateTime+=dt;
    if(state==='intro' && stateTime>2.65){state='fight';stateTime=0;popText(480,185,'FIGHT!','#fff2a1');}
    if(state==='fight') {
      timeLeft=Math.max(0,timeLeft-dt);
      if(timeLeft===0){finishRound(p1.hp===cpu.hp?'draw':(p1.hp>cpu.hp?'player':'cpu'));}
      updatePlayer(dt); updateAI(dt);
      updateFighter(p1,cpu,dt); updateFighter(cpu,p1,dt);
      if(state==='roundEnd') return;
    } else if(state==='roundEnd' && stateTime>2.35) {
      if(pWins>=2 || cpuWins>=2){state='matchEnd';stateTime=0;} else {round++;startRound();}
    } else if(state==='matchEnd' && stateTime>7 && [...justPressed].length){pWins=0;cpuWins=0;round=1;state='intro';stateTime=0;startRound();}
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.08,dt);p.vy=p.vy*Math.pow(.3,dt)+170*dt;p.life-=dt;}
    particles=particles.filter(p=>p.life>0);
    for(const t of texts){t.y-=26*dt;t.life-=dt;}
    texts=texts.filter(t=>t.life>0);
    screenShake=Math.max(0,screenShake-dt*20);
    justPressed.clear();
  }
  function down(name){return input.has(name);}
  function updatePlayer(dt) {
    if(p1.stun>0) return;
    p1.guarding=down('guard') && !p1.attack;
    if(p1.attack) return;
    const l=down('left'), r=down('right');
    p1.crouch=down('down') && p1.y===0;
    let move=(r?1:0)-(l?1:0);
    if(cpu.x!==p1.x) p1.dir=cpu.x>p1.x?1:-1;
    if(move){p1.vx=move*(p1.crouch?90:235);p1.walk+=dt*(p1.crouch?3:12);if(!p1.crouch)p1.dir=move;}
    else {p1.vx=0;p1.walk=0;}
    if(down('up') && !p1.jumpLock && p1.y===0){p1.vy=-490;p1.jumpLock=true;p1.crouch=false;sfx('tap');}
    if(!down('up'))p1.jumpLock=false;
    for(const action of ['special','heavyPunch','heavyKick','punch','kick']) if(justPressed.has(action)){beginAttack(p1,action);break;}
  }
  function updateAI(dt) {
    if(cpu.stun>0)return;
    const d=cpu.x-p1.x, abs=Math.abs(d);cpu.dir=d>0?-1:1;
    cpu.aiTimer-=dt;
    if(cpu.attack){cpu.guarding=false;return;}
    if(cpu.aiTimer<=0){
      cpu.aiTimer=.24+Math.random()*.5;
      if(abs<145 && Math.random()<.30){cpu.aiMode='guard';cpu.guarding=true;return;}
      if(abs<145 && Math.random()<.17){cpu.aiMode='retreat';cpu.guarding=false;return;}
      cpu.guarding=false;
      if(abs<124){
        const roll=Math.random();
        if(cpu.meter>=45 && abs<220 && roll<.09)beginAttack(cpu,'special');
        else if(roll<.28)beginAttack(cpu,'heavyKick');
        else if(roll<.53)beginAttack(cpu,'heavyPunch');
        else if(roll<.77)beginAttack(cpu,'kick');
        else beginAttack(cpu,'punch');
        return;
      }
      cpu.aiMode=abs>225?'approach':(Math.random()<.36?'retreat':'approach');
    }
    if(cpu.aiMode==='guard' && cpu.aiTimer>.03){cpu.guarding=true;cpu.vx=0;return;}
    cpu.guarding=false;
    if(cpu.aiMode==='approach' && abs>100) cpu.vx=(d>0?-1:1)*((abs>270)?164:95);
    else if(cpu.aiMode==='retreat' && abs<205)cpu.vx=(d>0?1:-1)*145;
    else cpu.vx=0;
  }
  function updateFighter(f,other,dt) {
    f.cooldown=Math.max(0,f.cooldown-dt);f.stun=Math.max(0,f.stun-dt);f.flash=Math.max(0,f.flash-dt);
    if(f.attack){f.attack.t+=dt;hit(f,other);const total=f.attack.spec.start+f.attack.spec.active+f.attack.spec.end;if(f.attack.t>=total)f.attack=null;}
    f.x+=f.vx*dt;
    if(f.stun>0 || f.attack) f.vx*=Math.pow(.04,dt); else f.vx*=Math.pow(.0005,dt);
    f.y+=f.vy*dt;f.vy+=1250*dt;
    if(f.y>0){f.y=0;f.vy=0;}
    f.x=Math.max(90,Math.min(870,f.x));
    const gap=f.x-other.x;
    if(Math.abs(gap)<50){const push=(50-Math.abs(gap))*.5;f.x+=Math.sign(gap||f.dir)*push;}
  }
  function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  function line(x1,y1,x2,y2,color,width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
  function text(str,x,y,size,color='#fff',align='center',font='bold 14px "Space Mono", monospace'){ctx.font=font.replace('14px',size+'px');ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(str,x,y);}
  function drawBackground(){
    const sky=ctx.createLinearGradient(0,0,0,430);sky.addColorStop(0,'#1c1738');sky.addColorStop(.46,'#59335d');sky.addColorStop(.74,'#df6959');sky.addColorStop(1,'#ffb56b');rect(0,0,W,430,sky);
    // distant mountains and dusk sun
    ctx.fillStyle='#ffcb84';ctx.beginPath();ctx.arc(492,175,76,0,Math.PI*2);ctx.fill();
    for(let i=0;i<5;i++)rect(425,150+i*18,134,6,'#ef8b79');
    ctx.fillStyle='#342747';ctx.beginPath();ctx.moveTo(0,310);ctx.lineTo(115,210);ctx.lineTo(221,310);ctx.lineTo(346,220);ctx.lineTo(475,312);ctx.lineTo(636,208);ctx.lineTo(812,310);ctx.lineTo(912,236);ctx.lineTo(960,270);ctx.lineTo(960,410);ctx.lineTo(0,410);ctx.fill();
    for(let i=0;i<18;i++){let x=i*63-12,y=40+(i*29%100);rect(x,y,30,2,'#ffd1bc22');rect(x+5,y+5,18,1,'#fff0dd18');}
    // city silhouettes
    for(let i=0;i<19;i++){const x=i*57-13,h=70+(i*43%115),w=30+(i*17%27);rect(x,400-h,w,h,'#22223d');rect(x+4,400-h-5,w-8,5,'#352844');for(let wy=400-h+14;wy<392;wy+=17)for(let wx=x+6;wx<x+w-5;wx+=12)if((wx+wy)%3)rect(wx,wy,4,6,(i%3===0)?'#fb9c7658':'#ffd78b54');}
    // lanterns, cables and dojo facade
    line(0,96,960,126,'#221b36',3);for(let i=0;i<9;i++){const x=34+i*115;line(x,99+i*3,x,135,'#27203a',2);rect(x-9,131,18,24,'#ed4e67');rect(x-6,134,12,16,'#ffcb71');rect(x-11,128,22,4,'#35233d');}
    rect(28,281,159,123,'#302440');rect(39,263,138,20,'#4e3150');rect(49,300,116,104,'#211d36');rect(55,308,105,4,'#ffba70');
    for(let i=0;i<5;i++){rect(61+i*21,325,9,65,'#3f2a47');rect(63+i*21,329,5,57,'#ffcb7955');}
    rect(748,280,178,124,'#392544');rect(760,263,156,18,'#57304c');rect(774,301,126,103,'#241d37');rect(780,309,114,4,'#ffba70');for(let i=0;i<4;i++){rect(786+i*28,327,13,64,'#452847');rect(789+i*28,331,7,56,'#ffbd7655');}
    // dojo signage
    rect(77,283,66,22,'#17192d');text('龍 DOJO',110,294,9,'#ffd17f','center','bold 9px monospace');rect(794,284,82,17,'#17192d');text('NEON FIGHT',835,293,8,'#ff6b9f','center','bold 8px monospace');
    // floor platform
    rect(0,400,W,140,'#221d38');rect(0,400,W,7,'#ff9770');rect(0,407,W,5,'#ffe091');rect(0,412,W,128,'#28213b');
    for(let x=0;x<W;x+=64){rect(x,413,2,127,'#4b354b');rect(x+4,430,56,2,'#604252');rect(x+4,486,56,2,'#493149');rect(x+4,524,56,2,'#493149');}
    for(let x=-15;x<W;x+=48){rect(x,413,28,5,'#34253d');rect(x+8,416,24,2,'#87504e');}
    // perspective floor lines and stage neon
    for(let i=0;i<18;i++){const x=i*62;line(480,414,x,540,'#463044',1);}
    rect(0,402,960,2,'#ffdf9a');rect(186,407,2,7,'#58f1dd');rect(774,407,2,7,'#ff4d9d');
    // floating embers
    for(let i=0;i<18;i++){const x=(i*163+clock*13)%960,y=175+(i*79%235)+Math.sin(clock*1.7+i)*4;rect(x,y,2,2,i%2?'#ffcf83aa':'#fe769288');}
  }
  function drawHud(){
    rect(0,0,W,96,'#101024d9');rect(0,94,W,2,'#ff8c90');
    // player labels / portrait chips
    rect(28,17,45,45,'#162a43');rect(31,20,39,39,'#38d9d0');rect(36,25,29,29,'#14223b');rect(41,26,19,10,'#f1bc9f');rect(38,35,25,14,'#24bcb7');rect(43,27,15,4,'#13253c');
    text('KAI',84,28,15,'#71eee2','left','bold 15px "Press Start 2P", monospace');text('THE QUICK FIST',84,47,9,'#a8adc5','left');
    rect(29,70,402,14,'#080a19');rect(32,73,396,8,'#3b1b38');const pwidth=392*p1.hp/100;rect(32,73,pwidth,8,p1.hp>28?'#5af0d7':'#ff507b');rect(32,73,pwidth,2,'#c5fff3');
    // opposing card mirrored
    rect(887,17,45,45,'#422139');rect(890,20,39,39,'#db497e');rect(894,24,31,31,'#29203d');rect(897,31,25,18,'#c84975');rect(901,26,17,11,'#ebc0a3');rect(899,25,21,5,'#282039');
    text('ROOK',875,28,15,'#ff7aa7','right','bold 15px "Press Start 2P", monospace');text('IRON WALL',875,47,9,'#a8adc5','right');
    rect(529,70,402,14,'#080a19');rect(532,73,396,8,'#3b1b38');const cwidth=392*cpu.hp/100;rect(928-cwidth,73,cwidth,8,cpu.hp>28?'#ff668e':'#ff507b');rect(928-cwidth,73,cwidth,2,'#ffd3e0');
    // round pips and timer
    for(let i=0;i<2;i++){rect(31+i*17,91,9,4,pWins>i?'#62f2dc':'#56516c');rect(920-i*17,91,9,4,cpuWins>i?'#ff6b9c':'#56516c');}
    rect(435,11,90,68,'#111127');rect(438,14,84,62,'#25213b');text('ROUND',480,25,8,'#8e89a8');text(String(round).padStart(2,'0'),480,45,25,'#ffe196','center','bold 25px "Press Start 2P", monospace');text('BEST OF 3',480,66,7,'#a69fb7');
    rect(444,80,72,5,'#0c0d1d');rect(446,81,68*Math.max(0,timeLeft/60),3,timeLeft<10?'#ff557d':'#ffce77');
    text('SPECIAL',80,106,8,'#82e9df','left');rect(80,115,148,7,'#101020');rect(82,117,144,3,'#24464c');rect(82,117,140*p1.meter/100,3,'#47f3e5');if(p1.meter>=45)text('✦ READY',239,120,8,'#ffdc84','left');
    // opponent energy indicator
    text('RAGE',879,106,8,'#ff83aa','right');rect(732,115,148,7,'#101020');rect(734,117,144,3,'#48243b');rect(734,117,140*cpu.meter/100,3,'#ff598c');
    // fighter round score badges
    text(`${pWins} WINS`,34,133,8,'#b2b4c9','left');text(`${cpuWins} WINS`,926,133,8,'#b2b4c9','right');
  }
  function drawFighter(f){
    const x=Math.round(f.x), gy=FLOOR-f.y, dir=f.dir, t=f.attack?f.attack.t:0, atk=f.attack, kind=atk&&atk.name; 
    const moving=Math.abs(f.vx)>25 && !atk && f.stun<=0, bob=moving?Math.sin(f.walk)*3:Math.sin(clock*2+(f===cpu?1:0))*1.4;
    const crouch=f.crouch&&f===p1&&!atk&&f.y===0, jump=f.y>0, flash=f.flash>0;
    const shadowScale=1-Math.min(.45,f.y/450);ctx.globalAlpha=.38;ctx.fillStyle='#090817';ctx.beginPath();ctx.ellipse(x,FLOOR+7,36*shadowScale,8*shadowScale,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    ctx.save();ctx.translate(x,gy+bob);ctx.scale(dir,1);
    const isKai=f===p1;
    const skin=flash?'#fff5cf':(isKai?'#f0bb9d':'#d99b82'), hair=isKai?'#18324b':'#26182f', suit=isKai?'#15a99f':'#a83264', light=isKai?'#61f2df':'#ff6498', dark=isKai?'#087c7b':'#682246';
    // limbs and stance
    const attacking=atk&&atk.t>atk.spec.start*.45;
    let armX=0,armY=0,legX=0,legY=0;
    if(attacking){const prog=Math.min(1,atk.t/(atk.spec.start+atk.spec.active));if(kind==='punch'||kind==='heavyPunch'){armX=kind==='heavyPunch'?42:35;armY=-8+Math.sin(prog*3)*-7;}if(kind==='kick'||kind==='heavyKick'){legX=kind==='heavyKick'?48:35;legY=-12;} }
    // trailing leg
    rect(-19,gy*0+(-30)+(jump?2:0),15,25,dark);rect(-24,-10,23,10,isKai?'#f1e7d2':'#dfd5d9');rect(-19,-8,17,3,light);
    // body
    rect(-19,-73,38,crouch?38:44,suit);rect(-23,-70,8,28,dark);rect(14,-70,8,27,light);rect(-17,-44,34,8,dark);rect(-12,-37,24,4,light);
    // chest emblem
    rect(-6,-64,12,13,isKai?'#e7d8b8':'#f5c2d0');rect(-3,-62,6,9,dark);rect(-12,-66,4,5,'#fff2dc');
    // front leg kicking / planted stance
    if(attacking&&(kind==='kick'||kind==='heavyKick')){rect(8,-38,legX,12,suit);rect(legX+4,-39,19,13,isKai?'#f0e5d2':'#e9d8db');rect(legX+7,-37,12,3,light);}
    else {rect(5,-38,14,25,suit);rect(7,-17,22,9,dark);rect(19,-17,16,9,isKai?'#eee5d5':'#e8d8dc');rect(23,-15,11,3,light);}
    // arms, guard or jab
    if(f.guarding){rect(9,-75,11,28,suit);rect(13,-81,14,11,skin);rect(9,-88,15,11,skin);rect(-21,-71,12,24,suit);rect(-24,-78,13,11,skin);}
    else if(attacking&&(kind==='punch'||kind==='heavyPunch')){rect(11,-71,Math.max(14,armX),13,suit);rect(armX+3,-73,18,15,skin);rect(armX+13,-70,10,7,skin);}
    else{rect(9,-70,11,24,suit);rect(14,-51,13,11,skin);rect(-20,-69,11,22,suit);rect(-24,-53,13,11,skin);}
    // head and hair/bandana
    rect(-15,-96,30,27,skin);rect(-17,-101,33,12,hair);rect(-16,-94,8,9,hair);rect(5,-91,6,5,'#fff3da');rect(7,-90,3,4,'#172035');rect(5,-82,9,2,'#9b4e56');
    if(isKai){rect(-19,-91,38,5,'#f2dfaa');rect(13,-90,17,4,'#f2dfaa');rect(26,-89,8,3,'#fff0c2');}else{rect(-16,-90,35,5,'#492139');rect(-10,-100,9,7,'#392039');rect(-1,-101,8,7,'#392039');rect(8,-99,8,7,'#392039');}
    // wrist wraps and pixel highlights
    rect(armX?armX+2:-26,-54,8,6,isKai?'#f2dfaa':'#ecd1d9');rect(-13,-69,7,3,'#ffffff50');
    ctx.restore();
    // special energy ribbon
    if(atk&&atk.name==='special'){const progress=atk.t/(atk.spec.start+atk.spec.active+atk.spec.end);ctx.globalAlpha=.75;ctx.fillStyle='#ff6cb7';ctx.beginPath();ctx.ellipse(x+dir*(35+progress*85),gy-82,45+progress*36,22+progress*10,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;for(let i=0;i<5;i++)rect(x+dir*(25+i*18),gy-95+Math.sin(clock*17+i)*14,9,5,i%2?'#ffdf79':'#fff');}
    // attack streak
    if(attacking&&kind!=='special'&&atk.t<atk.spec.start+atk.spec.active){ctx.globalAlpha=.45;rect(x+dir*27,gy-83,kind.includes('heavy')?50:34,5,light);ctx.globalAlpha=1;}
  }
  function drawOverlays(){
    if(state==='intro'){
      const n=Math.max(1,Math.ceil(3-stateTime));text(n===3?'ROUND '+round:n===2?'READY':'FIGHT!',480,231,32,n===1?'#fff1a0':'#fff','center','bold 32px "Press Start 2P", monospace');
      if(n===1)text('MOSTRE DO QUE É CAPAZ!',480,268,10,'#a4f6e8');
    }
    if(state==='roundEnd'){rect(0,176,960,124,'#0b0b1bc9');text(pWins>=2?'K.O. — VOCÊ DOMINOU!':cpuWins>=2?'K.O. — ROOK VENCEU':'K.O.',480,224,29,pWins>=cpuWins?'#6af3df':'#ff75a5','center','bold 29px "Press Start 2P", monospace');text('ROUND '+round+' FINALIZADO',480,264,11,'#fff0b0');}
    if(state==='matchEnd'){rect(0,142,960,178,'#0b0b1be8');text(pWins>=2?'VITÓRIA!':'FIM DE JOGO',480,194,33,pWins>=2?'#67f4dc':'#ff6d9d','center','bold 33px "Press Start 2P", monospace');text(pWins>=2?'O NEON DOJO É SEU!':'ROOK DEFENDEU O DOJO',480,235,13,'#fff0b0');text('APERTE QUALQUER TECLA PARA JOGAR DE NOVO',480,278,10,'#bbb7d2');}
  }
  function draw(){
    ctx.clearRect(0,0,W,H);ctx.save();if(screenShake>0)ctx.translate((Math.random()-.5)*screenShake,(Math.random()-.5)*screenShake);
    drawBackground();drawHud();drawFighter(p1);drawFighter(cpu);
    for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);rect(p.x,p.y,p.size,p.size,p.color);}ctx.globalAlpha=1;
    for(const t of texts){ctx.globalAlpha=Math.min(1,t.life*2);text(t.text,t.x,t.y,11,t.color,'center','bold 11px "Press Start 2P", monospace');}ctx.globalAlpha=1;
    drawOverlays();ctx.restore();
  }
  function loop(now){const dt=Math.min(.04,(now-lastTime)/1000||0);lastTime=now;update(dt);draw();requestAnimationFrame(loop);}
  function setControl(name,on){if(on){if(!input.has(name))justPressed.add(name);input.add(name);}else input.delete(name);}
  window.addEventListener('keydown',e=>{const name=keyMap.get(e.code);if(name){e.preventDefault();setControl(name,true);}else if(state==='matchEnd'){justPressed.add('restart');}});
  window.addEventListener('keyup',e=>{const name=keyMap.get(e.code);if(name){e.preventDefault();setControl(name,false);}});
  window.addEventListener('blur',()=>input.clear());
  document.querySelectorAll('[data-control]').forEach(btn=>{
    const name=btn.dataset.control;
    btn.addEventListener('pointerdown',e=>{e.preventDefault();btn.setPointerCapture(e.pointerId);btn.classList.add('pressed');setControl(name,true);});
    const release=e=>{if(e)e.preventDefault();btn.classList.remove('pressed');setControl(name,false);};
    btn.addEventListener('pointerup',release);btn.addEventListener('pointercancel',release);btn.addEventListener('lostpointercapture',release);btn.addEventListener('contextmenu',e=>e.preventDefault());
  });
  document.getElementById('soundToggle').addEventListener('click',e=>{muted=!muted;e.currentTarget.querySelector('b').textContent=muted?'OFF':'ON';e.currentTarget.querySelector('.sound-icon').textContent=muted?'♫':'♪';});
  // Clicking the arena also starts/restarts a finished match.
  canvas.addEventListener('pointerdown',()=>{if(state==='matchEnd'){pWins=0;cpuWins=0;round=1;startRound();}});
  startRound();requestAnimationFrame(loop);
})();

