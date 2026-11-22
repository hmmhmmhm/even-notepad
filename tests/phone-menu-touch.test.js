import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchPhoneMenuTouch } from '../src/phone-menu-touch.ts';
import { isWorkspaceTarget } from '../src/phone-workspace.ts';
const wait = () => new Promise(resolve => setTimeout(resolve, 35));
function setup(initial = 'menu') {
  const target = new EventTarget(), result = []; let mode = initial;
  watchPhoneMenuTouch(target, { active: () => true, context: () => mode, move: d => result.push(d), choose: () => result.push('choose'), back: () => result.push('back'), delay: 20, chatDelay: 20 });
  const send = (type, x, y) => { const e = new Event(type, {cancelable:true}); Object.defineProperty(e, 'touches', {value: type === 'touchend' || type === 'touchcancel' ? [] : [{clientX:x,clientY:y}]}); target.dispatchEvent(e); return e; };
  return {send,result,setMode: value => { mode = value; }};
}
test('single tap selects and a swipe moves without selecting', async () => {
  const {send,result}=setup();
  send('touchstart',10,100); send('touchend',10,100); await wait();
  send('touchstart',10,100); send('touchmove',10,60); send('touchmove',10,20); send('touchend',10,20);
  assert.deepEqual(result,['choose',-1,-1]);
});
test('double tap goes back without opening the selected session', async () => {
  const {send,result}=setup();
  send('touchstart',10,100); send('touchend',10,100);
  send('touchstart',12,102); send('touchend',12,102); await wait();
  assert.deepEqual(result,['back']);
});
test('chat single tap retains default focus and double tap goes back', async () => {
  const {send,result}=setup('chat');
  send('touchstart',10,100); assert.equal(send('touchend',10,100).defaultPrevented,false); await wait();
  send('touchstart',10,100); send('touchend',10,100); send('touchstart',10,100); send('touchend',10,100); await wait();
  assert.deepEqual(result,['back']);
});
test('chat and permission swipes scroll once per step without treating a tap as a menu choice', async () => {
  for (const mode of ['chat', 'permission']) {
    const {send,result}=setup(mode);
    send('touchstart',10,100); send('touchmove',10,60); send('touchend',10,60); await wait();
    assert.deepEqual(result,[-1]);
  }
});
test('full workspace accepts background swipes but ignores touches on controls', () => {
  const target = new EventTarget(), result = [];
  const writer = { closest: () => null }, background = { closest: () => null }, button = { closest: () => ({}) };
  watchPhoneMenuTouch(target, { active: event => !event || isWorkspaceTarget(event.source, writer), context: () => 'chat', move: n => result.push(n), choose() {}, back() {} });
  const send = (type, source, y) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { source: { value: source }, touches: { value: type === 'touchend' ? [] : [{ clientX: 1, clientY: y }] } });
    target.dispatchEvent(event);
  };
  send('touchstart', background, 100); send('touchmove', background, 50); send('touchend', background, 50);
  send('touchstart', button, 100); send('touchmove', button, 50); send('touchend', button, 50);
  assert.deepEqual(result, [-1]);
});
test('a swipe started on one menu cannot move another menu after a screen change', () => {
  const target = new EventTarget(), result = []; let scope = 'home';
  watchPhoneMenuTouch(target, { active: () => true, context: () => 'menu', scope: () => scope, move: n => result.push(n), choose() {}, back() {} });
  const send = (type, y) => { const e = new Event(type, { cancelable: true }); Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [{ clientX: 1, clientY: y }] }); target.dispatchEvent(e); };
  send('touchstart', 100); scope = 'computers'; send('touchmove', 50); send('touchend', 50);
  assert.deepEqual(result, []);
});
test('a pending tap cannot select after a swipe or mode change', async () => {
  const {send,result,setMode}=setup();
  send('touchstart',10,100); send('touchend',10,100); send('touchstart',10,100); send('touchmove',10,60); send('touchend',10,60); await wait();
  send('touchstart',10,100); send('touchend',10,100); setMode('chat'); await wait();
  assert.deepEqual(result,[-1]);
});
test('cancelled and horizontal gestures never select', async () => {
  const {send,result}=setup();
  send('touchstart',10,100); send('touchmove',40,100); send('touchend',40,100);
  send('touchstart',10,100); send('touchcancel',10,100); send('touchend',10,100); await wait();
  assert.deepEqual(result,[]);
});


test('a pending selection is cancelled if the highlighted row changes', async () => {
  const target = new EventTarget(), result = []; let selected = 1;
  watchPhoneMenuTouch(target, {active:()=>true,context:()=> 'menu',identity:()=>String(selected),move:()=>{},choose:()=>result.push('choose'),back:()=>result.push('back'),delay:20});
  for (const type of ['touchstart','touchend']) { const e=new Event(type,{cancelable:true}); Object.defineProperty(e,'touches',{value:type==='touchstart'?[{clientX:1,clientY:1}]:[]}); target.dispatchEvent(e); }
  selected=2; await wait(); assert.deepEqual(result,[]);
});


test('a downward swipe moves in the opposite direction to an upward swipe', () => {
  const {send,result}=setup();
  send('touchstart',10,40); send('touchmove',10,90); send('touchend',10,90);
  send('touchstart',10,100); send('touchmove',10,50); send('touchend',10,50);
  assert.deepEqual(result,[1,-1]);
});

test('second touch begun in time is not preempted while the finger is down', async () => {
  const target = new EventTarget(), result = [];
  watchPhoneMenuTouch(target, { active:()=>true, context:()=> 'menu', move:()=>{}, choose:()=>result.push('choose'), back:()=>result.push('back'), delay:80 });
  const send = type => { const e=new Event(type,{cancelable:true}); Object.defineProperty(e,'touches',{value:type==='touchstart'?[{clientX:10,clientY:10}]:[]}); target.dispatchEvent(e); };
  send('touchstart'); send('touchend');
  await new Promise(resolve=>setTimeout(resolve,45)); send('touchstart');
  await new Promise(resolve=>setTimeout(resolve,50)); assert.deepEqual(result,[]);
  send('touchend'); assert.deepEqual(result,['back']);
});

test('an active phone touch suppresses competing SDK clicks only for a bounded time', async () => {
  const target=new EventTarget();
  const gesture=watchPhoneMenuTouch(target,{active:()=>true,context:()=> 'menu',move(){},choose(){},back(){},delay:20,maxHold:30});
  const e=new Event('touchstart');Object.defineProperty(e,'touches',{value:[{clientX:1,clientY:1}]});target.dispatchEvent(e);
  assert.equal(gesture.isPending(),true);
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(gesture.isPending(),false);
});

test('a long continuous swipe keeps moving after the tap timeout', async () => {
  const target=new EventTarget(), moved=[];
  watchPhoneMenuTouch(target,{active:()=>true,context:()=> 'menu',move:d=>moved.push(d),choose(){},back(){},delay:20,maxHold:30});
  const send=(type,y)=>{const e=new Event(type,{cancelable:true});Object.defineProperty(e,'touches',{value:type==='touchend'?[]:[{clientX:1,clientY:y}]});target.dispatchEvent(e);};
  send('touchstart',100);send('touchmove',60);await new Promise(resolve=>setTimeout(resolve,45));send('touchmove',20);send('touchend',20);
  assert.deepEqual(moved,[-1,-1]);
});

test('scroll still works after a finger rests beyond the tap limit', async () => {
  const target=new EventTarget(), moved=[];
  watchPhoneMenuTouch(target,{active:()=>true,context:()=> 'menu',move:d=>moved.push(d),choose(){assert.fail('long hold must not select')},back(){},maxHold:20});
  const send=(type,y)=>{const e=new Event(type,{cancelable:true});Object.defineProperty(e,'touches',{value:type==='touchend'?[]:[{clientX:1,clientY:y}]});target.dispatchEvent(e);};
  send('touchstart',100); await new Promise(resolve=>setTimeout(resolve,35)); send('touchmove',60); send('touchend',60);
  assert.deepEqual(moved,[-1]);
});

test('chat accepts a more relaxed double tap without delaying menu selection', async () => {
  const target=new EventTarget(), result=[];
  watchPhoneMenuTouch(target,{active:()=>true,context:()=> 'chat',move(){},choose(){},back(){result.push('back')},delay:20,chatDelay:100});
  const send=(type,x)=>{const e=new Event(type,{cancelable:true});Object.defineProperty(e,'touches',{value:type==='touchend'?[]:[{clientX:x,clientY:20}]});target.dispatchEvent(e);};
  send('touchstart',10);send('touchend',10);await new Promise(resolve=>setTimeout(resolve,40));
  send('touchstart',120);send('touchend',120);assert.deepEqual(result,['back']);
});
