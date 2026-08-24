"""
Cold-start lazy-import regression tests (iteration 18).

Verifies:
 - `import server` is fast and does NOT pull PIL / fpdf / sendgrid at import time
 - the _LazyModule / _LazyClass proxies (Image, ImageDraw, ImageFont, FPDF,
   Mail, SendGridAPIClient) resolve correctly on first attribute access / call
 - the 3 `class ...(FPDF)` definitions keep their local `from fpdf import FPDF`
   (the proxy cannot be used as a base class)
"""
import re
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

BACKEND_DIR = Path("/app/backend")
SERVER_PY = BACKEND_DIR / "server.py"
HEAVY_RE = re.compile(r"^import time:.*\b(PIL|fpdf|sendgrid)\b", re.M)


def _run(code, timeout=120):
    return subprocess.run([sys.executable, "-c", textwrap.dedent(code)],
                          cwd=str(BACKEND_DIR), capture_output=True, text=True, timeout=timeout)


# ---------- import speed / no heavy modules on cold start ----------
class TestColdStartImport:
    def test_import_server_is_fast(self):
        r = _run("""
            import time
            t0 = time.perf_counter()
            import server  # noqa
            print(f"ELAPSED={time.perf_counter()-t0:.3f}")
        """)
        assert r.returncode == 0, f"import server failed: {r.stderr[-1500:]}"
        m = re.search(r"ELAPSED=([\d.]+)", r.stdout)
        assert m, r.stdout[-500:]
        elapsed = float(m.group(1))
        print(f"import server took {elapsed:.3f}s")
        assert elapsed < 2.0, f"cold-start import too slow: {elapsed:.2f}s"

    def test_no_heavy_modules_in_sys_modules_after_import(self):
        r = _run("""
            import server, sys  # noqa
            heavy = sorted(m for m in sys.modules
                           if m.split('.')[0] in ('PIL', 'fpdf', 'sendgrid'))
            print("HEAVY=" + ",".join(heavy))
        """)
        assert r.returncode == 0, r.stderr[-1500:]
        line = [l for l in r.stdout.splitlines() if l.startswith("HEAVY=")][0]
        loaded = [x for x in line[len("HEAVY="):].split(",") if x]
        assert not loaded, f"heavy modules imported at cold start: {loaded}"

    def test_importtime_shows_no_heavy_modules(self):
        r = subprocess.run([sys.executable, "-X", "importtime", "-c", "import server"],
                           cwd=str(BACKEND_DIR), capture_output=True, text=True, timeout=120)
        assert r.returncode == 0, r.stderr[-1500:]
        hits = HEAVY_RE.findall(r.stderr)
        assert not hits, f"-X importtime reports heavy imports: {set(hits)}"

    def test_no_toplevel_heavy_import_statements(self):
        """Only *local* (indented) imports of PIL/fpdf/sendgrid are allowed."""
        offenders = []
        for i, line in enumerate(SERVER_PY.read_text(encoding="utf-8").splitlines(), 1):
            if re.match(r"^(from (PIL|fpdf|sendgrid)[\w.]*\s+import|import (PIL|fpdf|sendgrid)\b)", line):
                offenders.append((i, line.strip()))
        assert not offenders, f"top-level heavy imports found: {offenders}"


# ---------- lazy proxies behave like the real thing ----------
class TestLazyProxies:
    def test_pil_proxies_resolve(self):
        r = _run("""
            import server
            img = server.Image.new("RGB", (20, 10), "white")
            d = server.ImageDraw.Draw(img)
            d.rectangle([0, 0, 5, 5], fill="black")
            f = server.ImageFont.load_default()
            print("PIL_OK", img.size, type(d).__name__, f is not None)
        """)
        assert r.returncode == 0, f"PIL proxies failed: {r.stderr[-1500:]}"
        assert "PIL_OK" in r.stdout, r.stdout

    def test_imagefont_truetype_through_proxy(self):
        r = _run("""
            import glob, server
            paths = glob.glob('/usr/share/fonts/**/*.ttf', recursive=True)
            if not paths:
                print('NO_TTF')
            else:
                fnt = server.ImageFont.truetype(paths[0], 12)
                print('TTF_OK', type(fnt).__name__)
        """)
        assert r.returncode == 0, f"ImageFont.truetype proxy failed: {r.stderr[-1500:]}"
        if "NO_TTF" in r.stdout:
            pytest.skip("no ttf font available in the image")
        assert "TTF_OK" in r.stdout, r.stdout

    def test_fpdf_proxy_instantiates_and_renders(self):
        r = _run("""
            import server
            pdf = server.FPDF()
            pdf.add_page()
            pdf.set_font("helvetica", size=12)
            pdf.cell(40, 10, "hello")
            out = pdf.output()
            print("FPDF_OK", len(bytes(out)) > 500)
        """)
        assert r.returncode == 0, f"FPDF proxy failed: {r.stderr[-1500:]}"
        assert "FPDF_OK True" in r.stdout, r.stdout

    def test_sendgrid_proxies_resolve(self):
        r = _run("""
            import server
            mail = server.Mail(from_email='a@b.co', to_emails='c@d.co',
                               subject='s', html_content='<b>x</b>')
            cli = server.SendGridAPIClient('SG.dummy-key')
            print("SG_OK", mail.subject.subject if hasattr(mail.subject, 'subject') else mail.subject,
                  type(cli).__name__)
        """)
        assert r.returncode == 0, f"sendgrid proxies failed: {r.stderr[-1500:]}"
        assert "SG_OK" in r.stdout, r.stdout

    def test_proxy_class_attribute_access(self):
        """_LazyClass.__getattr__ must forward to the real class (not the instance)."""
        r = _run("""
            import server
            print("ATTR_OK", server.FPDF.__name__, hasattr(server.FPDF, 'add_page'))
        """)
        assert r.returncode == 0, r.stderr[-1500:]
        assert "ATTR_OK FPDF True" in r.stdout, r.stdout


# ---------- inheritance sites keep their real import ----------
class TestFPDFSubclasses:
    def test_each_fpdf_subclass_has_local_real_import(self):
        lines = SERVER_PY.read_text(encoding="utf-8").splitlines()
        subclass_lines = [i for i, l in enumerate(lines) if re.search(r"class \w+\(FPDF\)", l)]
        assert len(subclass_lines) >= 3, f"expected >=3 FPDF subclasses, found {len(subclass_lines)}"
        for idx in subclass_lines:
            window = "\n".join(lines[max(0, idx - 6):idx])
            assert "from fpdf import FPDF" in window, (
                f"line {idx+1} ({lines[idx].strip()}) has no local 'from fpdf import FPDF' "
                "within the 6 preceding lines - proxy cannot be subclassed")

    def test_subclass_of_real_fpdf_works(self):
        r = _run("""
            from fpdf import FPDF
            class P(FPDF):
                def header(self):
                    self.set_font("helvetica", size=8)
                    self.cell(0, 5, "hdr")
            p = P(); p.add_page(); print("SUBCLASS_OK", len(bytes(p.output())) > 400)
        """)
        assert r.returncode == 0, r.stderr[-1500:]
        assert "SUBCLASS_OK True" in r.stdout, r.stdout
