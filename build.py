#!/usr/bin/env python3
"""Build dist/: index.html with vendor/ libraries inlined, plus the PWA files from pwa/."""
import pathlib, re, shutil, time
root = pathlib.Path(__file__).parent
dist = root / "dist"; dist.mkdir(exist_ok=True)
def inline(m):
    text = (root / m.group(1)).read_text()
    return text.replace("</script", "<\\/script").replace("</style", "<\\/style")
html = re.sub(r"/\*INLINE:([^*]+)\*/", inline, (root / "src/app.html").read_text())
(dist / "index.html").write_text(html)
for f in (root / "pwa").iterdir():
    if f.name == "sw.js":
        (dist / f.name).write_text(f.read_text().replace("__BUILD__", time.strftime("%Y%m%d%H%M%S")))
    else:
        shutil.copy(f, dist / f.name)
print(f"built dist/ (index.html {len(html)//1024} kB)")
