# Publish-ready copies of two brokerage documents: commission figures read "Negotiated",
# and the Buyer Guide's "personal logo here" boxes carry the advisor's name.
import pymupdf, io, sys
import numpy as np
from PIL import Image
S="/mnt/user-data/uploads/Sothebys Company Documents (Official)/"
OUT="/home/claude/patrick-realestate-v13/public/library/"
REG='/home/claude/lib/PublicSans-Regular.ttf'; BOOK='/home/claude/lib/PublicSans-Book.ttf'; SEMI='/home/claude/lib/PublicSans-SemiBold.ttf'

# ── 1. Closing Cost Breakdown: one page, one image ──────────────────────────
d=pymupdf.open(S+"Operations/JSIR Closing Cost Breakdown.pdf"); p=d[0]
xref=p.get_images(full=True)[0][0]; pix=pymupdf.Pixmap(d, xref)
if pix.n-pix.alpha>=4: pix=pymupdf.Pixmap(pymupdf.csRGB, pix)
im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples); W,H=im.size; a=np.asarray(im).astype(np.int16); f=W/1020.0
print('native', W, H, 'scale', round(f,3))
dark=(a.min(axis=2)<150)
def box(x0,y0,x1,y1):   # bounding box of dark pixels inside a region given in 1020-wide coordinates
    X0,Y0,X1,Y1=[int(round(v*f)) for v in (x0,y0,x1,y1)]; m=dark[Y0:Y1,X0:X1]; ys=np.where(m.any(axis=1))[0]; xs=np.where(m.any(axis=0))[0]
    return X0+xs[0], Y0+ys[0], X0+xs[-1]+1, Y0+ys[-1]+1
r1=box(385,226,700,252); r2=box(385,264,700,291)          # the two commission amounts
c1=box(50,226,300,252); c2=box(50,264,300,291)            # "Commission (…)" labels: same glyphs, gives the row offset
src=box(750,264,965,291)                                  # "Negotiated by Buyer and Seller"
dy=c2[1]-c1[1]
# first word of the source line: stop at the first gap wider than a word space
cols=dark[src[1]:src[3], src[0]:src[2]].any(axis=0); em=(src[3]-src[1])/0.95; gap=0; end=len(cols)
for i,v in enumerate(cols):
    gap = 0 if v else gap+1
    if gap>0.17*em: end=i-gap+1; break
word=a[src[1]-2:src[3]+2, src[0]-1:src[0]+end+1].copy(); wh,ww=word.shape[:2]
print('row offset', dy, 'word px', ww, wh, 'cells', r1, r2)
bg1=a[(r1[1]+r1[3])//2, r1[0]-int(14*f)].copy(); bg2=a[(r2[1]+r2[3])//2, r2[0]-int(14*f)].copy(); print('row backgrounds', bg1, bg2)
out=a.copy(); pad=int(3*f)
out[r1[1]-pad:r1[3]+pad, r1[0]-pad:r1[2]+pad]=bg1
out[r2[1]-pad:r2[3]+pad, r2[0]-pad:r2[2]+pad]=bg2
def paste(x,y,bg):                                        # multiply the word (dark on white) onto the row colour
    region=(word.astype(np.float32)/255.0)*bg.astype(np.float32)
    out[y:y+wh, x:x+ww]=np.clip(region,0,255).astype(np.int16)
paste(r2[0]-1, src[1]-2, bg2)
paste(r1[0]-1, src[1]-2-dy, bg1)
res=Image.fromarray(out.astype(np.uint8)); b=io.BytesIO(); res.save(b,'PNG',optimize=True)
p.replace_image(xref, stream=b.getvalue())
d.set_metadata({**d.metadata, 'title':'Closing Cost Breakdown', 'subject':'Commission figures shown as negotiated'})
d.save(OUT+'closing-cost-breakdown.pdf', garbage=4, deflate=True)
res.crop((int(40*f),int(180*f),int(980*f),int(300*f))).save('/home/claude/lib/cc-edit-crop.png')

# ── 2. Buyer Guide ──────────────────────────────────────────────────────────
d=pymupdf.open(S+"Marketing/Buyer Guide.pdf")
p=d[16]; hit=None
for bl in p.get_text('dict')['blocks']:
    for l in bl.get('lines',[]):
        t=''.join(s['text'] for s in l['spans']).strip()
        if t=='6% of Purchase Price': hit=(pymupdf.Rect(l['bbox']), l['spans'][0])
assert hit, 'commission line not found'
rect,span=hit; pm=p.get_pixmap(dpi=72); px=pm.pixel(int(rect.x0-6), int((rect.y0+rect.y1)/2)); fill=tuple(c/255 for c in px[:3])
p.add_redact_annot(rect+(-0.5,0,0.5,0), fill=fill); p.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
col=span['color']; rgb=((col>>16&255)/255,(col>>8&255)/255,(col&255)/255)
p.insert_text(pymupdf.Point(span['origin']), 'Negotiated', fontname='pbook', fontfile=BOOK, fontsize=span['size'], color=rgb)
for n in (0,27):                                          # cover and back: the logo placeholder
    p=d[n]; info=[i for i in p.get_image_info(xrefs=True) if i['width']<1500 and (i['bbox'][2]-i['bbox'][0])<140]
    assert len(info)==1, info
    r=pymupdf.Rect(info[0]['bbox']); p.delete_image(info[0]['xref']); p.draw_rect(r, color=None, fill=(1,1,1))
    fs=pymupdf.Font(fontfile=SEMI); fr=pymupdf.Font(fontfile=REG); name='PATRICK MILHAUPT'; role='GLOBAL ADVISOR'
    s1=min(11.5, (r.width)/fs.text_length(name,1)); s2=s1*0.74; cx=(r.x0+r.x1)/2; mid=(r.y0+r.y1)/2
    p.insert_text((cx-fs.text_length(name,s1)/2, mid-1.5), name, fontname='psemi', fontfile=SEMI, fontsize=s1, color=(0.07,0.07,0.09))
    p.insert_text((cx-fr.text_length(role,s2)/2, mid+s2+3.5), role, fontname='psans', fontfile=REG, fontsize=s2, color=(0.07,0.07,0.09))
# recompress the large photographs
saved=0
for x in range(1,d.xref_length()):
    try:
        if not d.xref_is_stream(x) or d.xref_get_key(x,'Subtype')[1]!='/Image': continue
        L=len(d.xref_stream_raw(x))
        if L<250_000 or d.xref_get_key(x,'SMask')[0]!='null': continue
        px=pymupdf.Pixmap(d,x)
        if px.n-px.alpha>=4: px=pymupdf.Pixmap(pymupdf.csRGB,px)
        if px.alpha: continue
        im=Image.frombytes('RGB' if px.n==3 else 'L',(px.width,px.height),px.samples)
        if im.width>1800: im=im.resize((1800, round(im.height*1800/im.width)), Image.LANCZOS)
        b=io.BytesIO(); im.save(b,'JPEG',quality=76,optimize=True,progressive=True)
        if b.tell()<L*0.8: d[0].replace_image(x, stream=b.getvalue()); saved+=L-b.tell()
    except Exception as e: print('skip',x,str(e)[:50])
d.set_metadata({**d.metadata, 'title':'Buyer Guide', 'author':'Jameson Sotheby\'s International Realty'})
d.save(OUT+'buyer-guide.pdf', garbage=4, deflate=True, clean=True); print('buyer guide saved; images saved MB', round(saved/1048576,1))
