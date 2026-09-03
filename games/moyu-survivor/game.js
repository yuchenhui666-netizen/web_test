(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const ui = {
    hud:$('hud'),bossHud:$('bossHud'),bossBar:$('bossBar'),touch:$('touchControls'),menu:$('menu'),upgrade:$('upgrade'),gameOver:$('gameOver'),shop:$('shop'),work:$('work'),
    time:$('time'),level:$('level'),xp:$('xpBar'),runCoins:$('runCoins'),best:$('bestTime'),coins:$('totalCoins'),shopCoins:$('shopCoins'),dashCd:$('dashCd'),dash:$('dash')
  };
  const STORE = 'moyuSurvivor.save.v1';
  const SHOP = {
    speed:{name:'轻便跑鞋',icon:'👟',desc:'初始移动速度 +5%',max:5,cost:[20,45,80,130,200]},
    damage:{name:'加厚回形针',icon:'📎',desc:'初始攻击伤害 +10%',max:5,cost:[20,45,80,130,200]},
    rate:{name:'提神咖啡',icon:'☕',desc:'初始攻击速度 +6%',max:5,cost:[25,55,95,150,230]},
    shield:{name:'摸鱼护身符',icon:'🧿',desc:'开局获得 1 层护盾',max:1,cost:[120]}
  };
  let save = loadSave();
  let W=0,H=0,dpr=1,last=0,raf=0;
  let mode='menu',elapsed=0,nextBoss=30,spawnTimer=0,shotTimer=0,runCoins=0,level=1,xp=0,xpNeed=8,boss=null;
  let enemies=[],bullets=[],pickups=[],trails=[],particles=[];
  const keys=new Set();
  const move={x:0,y:0,touchX:0,touchY:0};
  const player={x:0,y:0,r:16,speed:220,damage:1,fireRate:.64,projectiles:1,shield:0,dashCd:0,dashMax:2.5,inv:0,boost:0};
  const enemyNames=['DDL','早八','临时任务','签到','开会','消息99+','小组作业'];
  const upgrades=[
    {id:'damage',icon:'📎',name:'强力回形针',desc:'攻击伤害 +35%',apply:()=>player.damage*=1.35},
    {id:'rate',icon:'☕',name:'双倍浓缩',desc:'攻击间隔缩短 18%',apply:()=>player.fireRate=Math.max(.18,player.fireRate*.82)},
    {id:'speed',icon:'👟',name:'静音跑鞋',desc:'移动速度 +14%',apply:()=>player.speed*=1.14},
    {id:'multi',icon:'✉️',name:'群发邮件',desc:'每次攻击多发射 1 枚',apply:()=>player.projectiles=Math.min(5,player.projectiles+1)},
    {id:'dash',icon:'💨',name:'熟练切屏',desc:'冲刺冷却缩短 18%',apply:()=>player.dashMax=Math.max(.8,player.dashMax*.82)},
    {id:'shield',icon:'🛡️',name:'免打扰模式',desc:'立即获得 1 层护盾',apply:()=>player.shield=Math.min(3,player.shield+1)}
  ];

  function loadSave(){try{const data=JSON.parse(localStorage.getItem(STORE));return {coins:Number(data?.coins)||0,best:Number(data?.best)||0,shop:{speed:0,damage:0,rate:0,shield:0,...data?.shop}}}catch{return {coins:0,best:0,shop:{speed:0,damage:0,rate:0,shield:0}}}}
  function persist(){localStorage.setItem(STORE,JSON.stringify(save));syncMenu()}
  function syncMenu(){ui.best.textContent=`${save.best.toFixed(1)}s`;ui.coins.textContent=save.coins;ui.shopCoins.textContent=save.coins}
  function resize(){const rect=canvas.getBoundingClientRect();dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);W=rect.width;H=rect.height;if(mode==='menu'){player.x=W/2;player.y=H/2}}
  addEventListener('resize',resize,{passive:true});resize();syncMenu();renderShop();

  function show(el){el.classList.add('show')}function hide(el){el.classList.remove('show')}
  function startGame(){[ui.menu,ui.gameOver,ui.shop,ui.upgrade].forEach(hide);ui.hud.classList.remove('hidden');ui.touch.classList.remove('hidden');reset();mode='playing';last=performance.now();cancelAnimationFrame(raf);raf=requestAnimationFrame(loop)}
  function reset(){elapsed=0;nextBoss=30;spawnTimer=.5;shotTimer=.3;runCoins=0;level=1;xp=0;xpNeed=8;boss=null;enemies=[];bullets=[];pickups=[];trails=[];particles=[];Object.assign(player,{x:W/2,y:H/2,r:16,speed:220*(1+save.shop.speed*.05),damage:1*(1+save.shop.damage*.1),fireRate:.64*Math.pow(.94,save.shop.rate),projectiles:1,shield:save.shop.shield,dashCd:0,dashMax:2.5,inv:0,boost:0});syncHud()}
  function endGame(){mode='over';ui.hud.classList.add('hidden');ui.touch.classList.add('hidden');ui.bossHud.classList.add('hidden');save.coins+=runCoins;if(elapsed>save.best)save.best=elapsed;persist();$('finalTime').textContent=`${elapsed.toFixed(1)}s`;$('earnedCoins').textContent=runCoins;$('finalLevel').textContent=level;show(ui.gameOver)}
  function loop(now){if(mode!=='playing')return;const dt=Math.min(.033,(now-last)/1000);last=now;update(dt);draw();raf=requestAnimationFrame(loop)}

  function update(dt){
    elapsed+=dt;spawnTimer-=dt;shotTimer-=dt;player.dashCd=Math.max(0,player.dashCd-dt);player.inv=Math.max(0,player.inv-dt);player.boost=Math.max(0,player.boost-dt);
    const kx=(keys.has('arrowright')||keys.has('d')?1:0)-(keys.has('arrowleft')||keys.has('a')?1:0);const ky=(keys.has('arrowdown')||keys.has('s')?1:0)-(keys.has('arrowup')||keys.has('w')?1:0);let dx=kx||move.touchX,dy=ky||move.touchY;const len=Math.hypot(dx,dy)||1;if(Math.hypot(dx,dy)>1){dx/=len;dy/=len}move.x=dx;move.y=dy;const speed=player.speed*(player.boost>0?1.45:1);player.x=clamp(player.x+dx*speed*dt,player.r,W-player.r);player.y=clamp(player.y+dy*speed*dt,player.r,H-player.r);
    if(spawnTimer<=0&&enemies.length<82){spawnEnemy();spawnTimer=Math.max(.28,1.1-elapsed*.008)}if(elapsed>=nextBoss){spawnBoss();nextBoss+=30}if(shotTimer<=0&&enemies.length){shoot();shotTimer=player.fireRate}
    updateBullets(dt);updateEnemies(dt);updatePickups(dt);updateEffects(dt);syncHud();
  }
  function spawnEnemy(){const elite=elapsed>25&&Math.random()<Math.min(.2,elapsed/500);const p=edgePoint();const scale=1+elapsed/90;enemies.push({x:p.x,y:p.y,r:elite?22:15,hp:(elite?6:2)*scale,maxHp:(elite?6:2)*scale,speed:(elite?54:68)+Math.min(55,elapsed*.32)+Math.random()*18,name:elite?'紧急任务':enemyNames[Math.random()*enemyNames.length|0],elite,boss:false,hue:elite?'#ffe7a5':'#f29aaa'})}
  function spawnBoss(){const p=edgePoint();const wave=Math.floor(elapsed/30);boss={x:p.x,y:p.y,r:43,hp:45*Math.pow(1.34,wave-1),maxHp:45*Math.pow(1.34,wave-1),speed:43+wave*3,name:'热心大领导',elite:true,boss:true,hue:'#d76f83'};enemies.push(boss);ui.bossHud.classList.remove('hidden')}
  function edgePoint(){const side=Math.random()*4|0;if(side===0)return{x:Math.random()*W,y:-50};if(side===1)return{x:W+50,y:Math.random()*H};if(side===2)return{x:Math.random()*W,y:H+50};return{x:-50,y:Math.random()*H}}
  function shoot(){const target=enemies.reduce((best,e)=>!best||dist(e,player)<dist(best,player)?e:best,null);if(!target)return;const base=Math.atan2(target.y-player.y,target.x-player.x);for(let i=0;i<player.projectiles;i++){const offset=(i-(player.projectiles-1)/2)*.16;bullets.push({x:player.x,y:player.y,vx:Math.cos(base+offset)*520,vy:Math.sin(base+offset)*520,r:5,damage:player.damage,life:1.5})}}
  function updateBullets(dt){for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;let hit=false;for(let j=enemies.length-1;j>=0;j--){const e=enemies[j];if(Math.hypot(b.x-e.x,b.y-e.y)<b.r+e.r){e.hp-=b.damage;burst(b.x,b.y,'#ffe7a5',3);hit=true;if(e.hp<=0)killEnemy(j,e);break}}if(hit||b.life<=0||b.x<-20||b.y<-20||b.x>W+20||b.y>H+20)bullets.splice(i,1)}}
  function updateEnemies(dt){for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];const a=Math.atan2(player.y-e.y,player.x-e.x);e.x+=Math.cos(a)*e.speed*dt;e.y+=Math.sin(a)*e.speed*dt;if(Math.hypot(e.x-player.x,e.y-player.y)<e.r+player.r){if(player.inv>0){if(player.dashCd>player.dashMax-.45){e.hp-=3;burst(e.x,e.y,'#99dcc5',8);if(e.hp<=0)killEnemy(i,e)}}else if(player.shield>0){player.shield--;player.inv=1;burst(player.x,player.y,'#99dcc5',16)}else{endGame();return}}}if(boss){ui.bossBar.style.width=`${Math.max(0,boss.hp/boss.maxHp*100)}%`}}
  function killEnemy(index,e){enemies.splice(index,1);const reward=e.boss?15:e.elite?3:1;runCoins+=reward;gainXp(e.boss?20:e.elite?5:1);burst(e.x,e.y,e.hue,12);if(e.boss){boss=null;ui.bossHud.classList.add('hidden')}if(!e.boss&&Math.random()<.075)dropItem(e.x,e.y)}
  function gainXp(amount){xp+=amount;if(xp>=xpNeed){xp-=xpNeed;level++;xpNeed=Math.floor(8+level*4.5);openUpgrade()}}
  function openUpgrade(){mode='upgrade';const picks=[...upgrades].sort(()=>Math.random()-.5).slice(0,3);$('upgradeChoices').replaceChildren(...picks.map((u)=>{const btn=document.createElement('button');btn.className='choice';btn.innerHTML=`<i>${u.icon}</i><h3>${u.name}</h3><p>${u.desc}</p>`;btn.addEventListener('click',()=>{u.apply();hide(ui.upgrade);mode='playing';last=performance.now();raf=requestAnimationFrame(loop)},{once:true});return btn}));show(ui.upgrade)}
  function dropItem(x,y){const items=['shield','coffee','ticket'];pickups.push({x,y,r:16,type:items[Math.random()*items.length|0],life:10,bob:Math.random()*6})}
  function updatePickups(dt){for(let i=pickups.length-1;i>=0;i--){const p=pickups[i];p.life-=dt;p.bob+=dt*4;if(Math.hypot(p.x-player.x,p.y-player.y)<p.r+player.r){if(p.type==='shield')player.shield=Math.min(3,player.shield+1);if(p.type==='coffee')player.boost=6;if(p.type==='ticket'){enemies.forEach(e=>{if(!e.boss&&dist(e,player)<250)e.hp=0});for(let j=enemies.length-1;j>=0;j--)if(enemies[j].hp<=0)killEnemy(j,enemies[j])}burst(p.x,p.y,'#fff9ef',12);pickups.splice(i,1)}else if(p.life<=0)pickups.splice(i,1)}}
  function dash(){if(mode!=='playing'||player.dashCd>0)return;let dx=move.x,dy=move.y;if(Math.hypot(dx,dy)<.1)dy=-1;const len=Math.hypot(dx,dy)||1;dx/=len;dy/=len;for(let i=1;i<=5;i++)trails.push({x:player.x-dx*i*12,y:player.y-dy*i*12,life:.3-i*.03});player.x=clamp(player.x+dx*125,player.r,W-player.r);player.y=clamp(player.y+dy*125,player.r,H-player.r);player.inv=.42;player.dashCd=player.dashMax;burst(player.x,player.y,'#99dcc5',10);navigator.vibrate?.(30)}
  function updateEffects(dt){trails.forEach(t=>t.life-=dt);particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt});trails=trails.filter(t=>t.life>0);particles=particles.filter(p=>p.life>0)}
  function burst(x,y,color,count){for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=40+Math.random()*100;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.25+Math.random()*.35,color,size:2+Math.random()*4})}}

  function draw(){ctx.fillStyle='#30252f';ctx.fillRect(0,0,W,H);drawGrid();trails.forEach(t=>drawPlayer(t.x,t.y,Math.max(0,t.life/.3)*.28));pickups.forEach(drawPickup);bullets.forEach(b=>{ctx.fillStyle='#ffe7a5';ctx.fillRect(Math.round(b.x-5),Math.round(b.y-3),10,6)});enemies.forEach(drawEnemy);drawPlayer(player.x,player.y,player.inv>0?.55+.35*Math.sin(performance.now()/35):1);particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life/.5);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size)});ctx.globalAlpha=1}
  function drawGrid(){ctx.strokeStyle='rgba(255,249,239,.055)';ctx.lineWidth=1;for(let x=0;x<W;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}for(let y=0;y<H;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}}
  function drawPlayer(x,y,alpha=1){ctx.save();ctx.globalAlpha=alpha;ctx.translate(Math.round(x),Math.round(y));ctx.fillStyle=player.shield?'rgba(153,220,197,.22)':'transparent';ctx.strokeStyle='#99dcc5';ctx.lineWidth=player.shield?3:0;if(player.shield){ctx.beginPath();ctx.arc(0,0,25,0,Math.PI*2);ctx.fill();ctx.stroke()}ctx.fillStyle='#99dcc5';ctx.strokeStyle='#433641';ctx.lineWidth=3;ctx.beginPath();ctx.rect(-16,-16,32,32);ctx.fill();ctx.stroke();ctx.font='21px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('🐟',0,1);ctx.restore()}
  function drawEnemy(e){ctx.save();ctx.translate(Math.round(e.x),Math.round(e.y));ctx.fillStyle=e.hue;ctx.strokeStyle='#433641';ctx.lineWidth=3;ctx.fillRect(-e.r,-e.r,e.r*2,e.r*2);ctx.strokeRect(-e.r,-e.r,e.r*2,e.r*2);ctx.fillStyle='#30252f';ctx.font=`bold ${e.boss?11:9}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';const label=e.boss?'大领导':e.name;ctx.fillText(label,0,0);if(e.elite){ctx.fillStyle='#fff9ef';ctx.fillRect(-e.r,e.r+5,e.r*2,5);ctx.fillStyle='#d76f83';ctx.fillRect(-e.r,e.r+5,e.r*2*Math.max(0,e.hp/e.maxHp),5)}ctx.restore()}
  function drawPickup(p){const icon=p.type==='shield'?'🛡️':p.type==='coffee'?'☕':'🎫';ctx.save();ctx.translate(p.x,p.y+Math.sin(p.bob)*4);ctx.fillStyle='#fff9ef';ctx.strokeStyle='#433641';ctx.lineWidth=2;ctx.fillRect(-17,-17,34,34);ctx.strokeRect(-17,-17,34,34);ctx.font='19px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(icon,0,1);ctx.restore()}
  function syncHud(){ui.time.textContent=elapsed.toFixed(1);ui.level.textContent=level;ui.runCoins.textContent=runCoins;ui.xp.style.width=`${xp/xpNeed*100}%`;ui.dashCd.textContent=player.dashCd>0?player.dashCd.toFixed(1):'READY';ui.dash.classList.toggle('cooling',player.dashCd>0)}
  function renderShop(){const wrap=$('shopItems');wrap.replaceChildren(...Object.entries(SHOP).map(([id,item])=>{const lv=save.shop[id];const max=lv>=item.max;const cost=max?0:item.cost[lv];const card=document.createElement('article');card.className='shop-item';card.innerHTML=`<header><i>${item.icon}</i><div><h3>${item.name}</h3><small>LV.${lv} / ${item.max}</small></div></header><p>${item.desc}</p><button ${max||save.coins<cost?'disabled':''}>${max?'已满级':`升级 · 🪙 ${cost}`}</button>`;card.querySelector('button').addEventListener('click',()=>{if(max||save.coins<cost)return;save.coins-=cost;save.shop[id]++;persist();renderShop()});return card}))}
  function openShop(){syncMenu();renderShop();[ui.menu,ui.gameOver].forEach(hide);show(ui.shop)}
  function closeShop(){hide(ui.shop);if(mode==='over')show(ui.gameOver);else show(ui.menu)}
  function clamp(v,min,max){return Math.max(min,Math.min(max,v))}function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}

  $('start').addEventListener('click',startGame);$('restart').addEventListener('click',startGame);$('openShop').addEventListener('click',openShop);$('overShop').addEventListener('click',openShop);$('closeShop').addEventListener('click',closeShop);ui.dash.addEventListener('pointerdown',(e)=>{e.preventDefault();dash()});
  $('panic').addEventListener('click',()=>{if(mode!=='playing')return;mode='work';$('fakeTime').value=new Date().toLocaleString();show(ui.work)});$('returnGame').addEventListener('click',()=>{hide(ui.work);mode='playing';last=performance.now();raf=requestAnimationFrame(loop)});
  addEventListener('keydown',(e)=>{const key=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' ','w','a','s','d'].includes(key))e.preventDefault();keys.add(key);if(key===' ')dash()});addEventListener('keyup',(e)=>keys.delete(e.key.toLowerCase()));
  const joystick=$('joystick'),stick=$('stick');let pointer=null;function setStick(x,y){const r=joystick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=x-cx,dy=y-cy;const max=r.width*.3,len=Math.hypot(dx,dy)||1;if(len>max){dx=dx/len*max;dy=dy/len*max}move.touchX=dx/max;move.touchY=dy/max;stick.style.transform=`translate(${dx}px,${dy}px)`}joystick.addEventListener('pointerdown',(e)=>{pointer=e.pointerId;joystick.setPointerCapture(e.pointerId);setStick(e.clientX,e.clientY)});joystick.addEventListener('pointermove',(e)=>{if(e.pointerId===pointer)setStick(e.clientX,e.clientY)});function release(e){if(e.pointerId!==pointer)return;pointer=null;move.touchX=move.touchY=0;stick.style.transform=''}joystick.addEventListener('pointerup',release);joystick.addEventListener('pointercancel',release);
  draw();
})();
