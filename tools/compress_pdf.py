#!/usr/bin/env python3
"""Make a print PDF small enough to host (Cloudflare Pages refuses files over 25 MiB).

usage: compress_pdf.py IN.pdf OUT.pdf "PAGES,TO,DROP" MAX_IMAGE_WIDTH JPEG_QUALITY
       compress_pdf.py report.pdf public/library/report.pdf "2,3" 2000 74

Large images are re-encoded as JPEG at or below MAX_IMAGE_WIDTH; text and vectors are untouched.
Images with transparency are left alone. Needs PyMuPDF and Pillow.
"""
import pymupdf, sys, os, io
from PIL import Image
src, out, drop, maxw, q = sys.argv[1], sys.argv[2], [int(x) for x in sys.argv[3].split(',') if x], int(sys.argv[4]), int(sys.argv[5])
d=pymupdf.open(src)
for p in sorted(drop, reverse=True): d.delete_page(p-1)
done=0; saved=0
for x in range(1, d.xref_length()):
    try:
        if not d.xref_is_stream(x) or d.xref_get_key(x,'Subtype')[1] != '/Image': continue
        L=len(d.xref_stream_raw(x))
        if L < 250_000: continue
        if d.xref_get_key(x,'SMask')[0] != 'null' or d.xref_get_key(x,'ImageMask')[1] == 'true': continue
        pix=pymupdf.Pixmap(d, x)
        if pix.n - pix.alpha >= 4: pix=pymupdf.Pixmap(pymupdf.csRGB, pix)
        if pix.alpha: continue
        im=Image.frombytes('RGB' if pix.n==3 else 'L', (pix.width, pix.height), pix.samples)
        if im.width > maxw: im=im.resize((maxw, round(im.height*maxw/im.width)), Image.LANCZOS)
        b=io.BytesIO(); im.save(b, 'JPEG', quality=q, optimize=True, progressive=True)
        if b.tell() < L*0.8:
            d[0].replace_image(x, stream=b.getvalue()); done+=1; saved+=L-b.tell()
    except Exception as e:
        print('skip', x, str(e)[:60])
d.save(out, garbage=4, deflate=True, clean=True)
print('recompressed', done, 'images, saved', round(saved/1048576,1), 'MB ->', len(d), 'pages', round(os.path.getsize(out)/1048576,1), 'MB')
