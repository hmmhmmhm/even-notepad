from PIL import Image,ImageDraw,ImageFont,ImageFilter
from pathlib import Path
import argparse, json, subprocess
parser=argparse.ArgumentParser()
parser.add_argument('--work',type=Path,required=True,help='Directory containing voice-0..5.wav and corresponding JSON timestamps')
parser.add_argument('--tap',type=Path,required=True,help='Licensed or self-recorded tap WAV')
args=parser.parse_args()
p=args.work.resolve(); p.mkdir(parents=True,exist_ok=True)
root=Path(__file__).resolve().parents[2]
base=Image.open(root/'docs/media/promo/g2-phone-template.png').convert('RGB'); W,H=base.size
font='/System/Library/Fonts/Supplemental/Arial.ttf'; bold='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
f=lambda n:ImageFont.truetype(font,n); fb=lambda n:ImageFont.truetype(bold,n)
# Illustration based on the existing promotional composition, with HUD rendered separately.
def image(n):
 im=base.convert('RGBA')
 # Remove marks baked into the original mockup with feathered nearby pixels.
 for src, pos in [((500,1000,903,1059),(53,1000)), ((690,513,1112,635),(1278,513))]:
  patch=im.crop(src); mask=Image.new('L',patch.size,0); md=ImageDraw.Draw(mask)
  md.rectangle((10,10,patch.width-10,patch.height-10),fill=255)
  im.paste(patch,pos,mask.filter(ImageFilter.GaussianBlur(10)))
 d=ImageDraw.Draw(im); d.rectangle((215,209,334,236),fill=(30,30,30,255)); d.text((219,214),'Quiet Terminal',font=f(14),fill='#eeeeee')
 d.rectangle((376,177,394,188),fill='#ededed')
 d.text((68,43),'Suggested Replies',font=fb(26),fill='white')
 hud=Image.new('RGBA',(576,288),(0,0,0,0)); h=ImageDraw.Draw(hud)
 green=(115,247,122,255); dim=(75,164,81,220)
 if n in (0,1):
  for j,t in enumerate(['> I updated the layout and checked the tests.','> What would you like me to do next?','','> _']):h.text((18,15+j*35),t,font=f(19),fill=green)
 elif n in (2,3,4,5):
  items=['Back','Run the tests and fix any failures.','Review the changes for edge cases.','Summarize what changed and why.','More different replies']
  if n==5:items=['Review the changes for edge cases.','Summarize what changed and why.','Create a concise implementation plan.','More different replies']
  selected={2:0,3:2,4:4,5:2}[n]
  for j,t in enumerate(items):
   y=12+j*38
   if j==selected:h.rounded_rectangle((16,y,552,y+36),radius=5,outline=green,width=1)
   h.text((24,y+6),t,font=f(19),fill=green if j==selected else dim)
  d.text((715,887),'R1  •  '+('PRESS & HOLD' if n==2 else 'SCROLL  /  TAP'),font=fb(20),fill='#ffffff')
 else:
  for j,t in enumerate(['> Review the changes for edge cases.','> I’ll inspect the changes and report','  any issues I find.']):h.text((18,15+j*35),t,font=f(19),fill=green)
 # Both HUDs use the same 576 x 288 source, with transparent pixels and no plate.
 large=hud.resize((864,432),Image.Resampling.LANCZOS)
 glow=large.filter(ImageFilter.GaussianBlur(3)); im.alpha_composite(glow,(970,55)); im.alpha_composite(large,(970,55))
 mini=hud.resize((288,144),Image.Resampling.LANCZOS);im.alpha_composite(mini,(1320,505))
 if n in (2,3,4,5):
  hand=Image.open(root/'docs/media/promo/r1-hand-illustration.png').convert('RGBA')
  hand.thumbnail((750,420),Image.Resampling.LANCZOS)
  im.alpha_composite(hand,(1130,660))
 im.convert('RGB').save(p/f'scene-{n}.png')
for i in range(7):image(i)
card=Image.new('RGB',(W,H),'black'); cd=ImageDraw.Draw(card); cd.text((115,430),'Quiet Terminal',font=fb(88),fill='white'); cd.text((120,540),'Suggested replies. No voice required.',font=f(40),fill='#dddddd'); card.save(p/'scene-7.png')
# Voice is placed at each scene opening. Captions follow Typecast word times.
starts=[.3,3.4,8.4,15.0,22.2,28.3]
sub=[]
for i,start in enumerate(starts):
 words=json.loads((p/f'voice-{i}.json').read_text())['words']
 for j in range(0,len(words),5):
  part=words[j:j+5];sub.append((start+part[0]['start'],start+part[-1]['end'],' '.join(x['text'] for x in part)))
def stamp(t):
 ms=round(t*1000);h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000);return f'{h:02}:{m:02}:{s:02},{ms:03}'
(p/'subtitles.srt').write_text('\n'.join(f'{i+1}\n{stamp(a)} --> {stamp(b)}\n{t}\n' for i,(a,b,t) in enumerate(sub)))
segments=[(0,.04),(7,3.36),(1,5),(2,4),(3,4.8),(6,2.0),(4,3.0),(5,5.4),(6,7.0)]
# Render each caption interval as a still, using the API timestamps.
bounds={0.,35.}; elapsed=0.
for _,duration in segments:
 elapsed+=duration; bounds.add(min(35.,elapsed))
for a,b,_ in sub:
 bounds.add(max(0.,a)); bounds.add(min(35.,b))
bounds=sorted(x for x in bounds if 0<=x<=35)
with (p/'sequence.txt').open('w') as q:
 for k,(a,b) in enumerate(zip(bounds,bounds[1:])):
  if b-a<.005: continue
  mid=(a+b)/2; elapsed=0; idx=segments[-1][0]
  for si,dur in segments:
   elapsed+=dur
   if mid<elapsed: idx=si; break
  im=Image.open(p/f'scene-{idx}.png').convert('RGB'); d=ImageDraw.Draw(im)
  caption=next((t for x,y,t in sub if x<=mid<y),None)
  if caption:
   fontcap=f(36); box=d.textbbox((0,0),caption,font=fontcap); w=box[2]-box[0]; x=(W-w)//2
   d.rounded_rectangle((x-20,955,x+w+20,1012),radius=8,fill=(8,8,8));d.text((x,961),caption,font=fontcap,fill='white')
  name=f'frame-{k:03}.jpg'; im.save(p/name,quality=92);q.write(f"file '{name}'\nduration {b-a}\n")
 q.write(f"file '{name}'\n")
cmd=['ffmpeg','-hide_banner','-loglevel','warning','-y','-f','concat','-safe','0','-i',str(p/'sequence.txt')]
for i in range(6):cmd+=['-i',str(p/f'voice-{i}.wav')]
cmd+=['-i',str(args.tap.resolve())]
filters=[]
for i,t in enumerate(starts):filters.append(f'[{i+1}:a]adelay={int(t*1000)}|{int(t*1000)},volume=1[a{i}]')
filters += ["[7:a]volume=0.12,adelay=14500|14500[tap]", "[a0][a1][a2][a3][a4][a5][tap]amix=inputs=7:duration=longest:normalize=0[aout]",'[0:v]fps=25,scale=1280:720:flags=lanczos,format=yuv420p[vout]']
cmd+=['-filter_complex',';'.join(filters),'-map','[vout]','-map','[aout]','-t','35','-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',str(p/'quiet-terminal-suggested-replies.mp4')]
subprocess.run(cmd,check=True)
