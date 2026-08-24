"""
Runtime verification (iteration 18) that the lazy PIL / fpdf proxies do not break
real endpoints: PDF generation (fpdf subclasses + PIL logo embedding) and the
social-image export (PIL Image/ImageDraw/ImageFont).

A NameError / AttributeError from a proxy would surface as HTTP 500 here.
"""
import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
_base = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not _base:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = _base.rstrip("/")
RESTAURANT = "rest_efb3705687ef"


@pytest.fixture(scope="module")
def creds():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    m = re.search(r"\|\s*Holding\s*\|\s*(\S+@\S+)\s*\|\s*(\S+)\s*\|", content)
    if not m:
        pytest.skip("no holding creds")
    return {"email": m.group(1), "password": m.group(2)}


@pytest.fixture(scope="module")
def session(creds):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"login failed: {r.status_code} {r.text[:300]}")
    s.headers.update({"Authorization": f"Bearer {r.json()['session_token']}"})
    return s


class TestFpdfProxyRuntime:
    def test_ardoise_export_pdf(self, session):
        r = session.get(f"{BASE_URL}/api/ardoise/export-pdf", timeout=120)
        assert r.status_code != 500, f"500 from ardoise export-pdf: {r.text[:400]}"
        assert r.status_code in (200, 404), f"{r.status_code}: {r.text[:300]}"
        if r.status_code == 200:
            assert r.content[:4] == b"%PDF", r.content[:20]
            assert len(r.content) > 800

    def test_planning_export_pdf_if_available(self, session):
        """class PlanningPDF(FPDF) path."""
        candidates = ["/api/planning/export-pdf", "/api/planning/export/pdf"]
        seen = []
        for path in candidates:
            r = session.get(f"{BASE_URL}{path}", timeout=120)
            seen.append((path, r.status_code))
            assert r.status_code != 500, f"500 from {path}: {r.text[:400]}"
            if r.status_code == 200:
                assert r.content[:4] == b"%PDF"
                return
        print(f"planning pdf endpoints probed: {seen}")


class TestPilProxyRuntime:
    def test_ardoise_export_social_image(self, session):
        share = session.get(f"{BASE_URL}/api/ardoise/by-restaurant/{RESTAURANT}", timeout=60)
        if share.status_code != 200:
            pytest.skip(f"no ardoise for restaurant ({share.status_code})")
        token = share.json().get("share_token")
        if not token:
            pytest.skip("no share_token")
        for fmt in ("instagram_story", "facebook"):
            r = requests.get(f"{BASE_URL}/api/ardoise/export-social/{token}",
                             params={"format": fmt}, timeout=120)
            assert r.status_code != 500, f"500 from export-social({fmt}): {r.text[:400]}"
            assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
            assert r.content[:8].startswith(b"\x89PNG") or r.content[:3] == b"\xff\xd8\xff", r.content[:16]
            assert len(r.content) > 5000

    def test_invoice_pdf_with_logo(self, session):
        """PILImage path at server.py:7560 (invoice PDF logo)."""
        lst = session.get(f"{BASE_URL}/api/invoices", timeout=60)
        if lst.status_code != 200:
            pytest.skip(f"cannot list invoices ({lst.status_code})")
        payload = lst.json()
        invoices = payload if isinstance(payload, list) else payload.get("invoices", [])
        if not invoices:
            pytest.skip("no invoices to render")
        inv_id = invoices[0].get("invoice_id") or invoices[0].get("id")
        r = session.get(f"{BASE_URL}/api/invoices/{inv_id}/pdf", timeout=120)
        assert r.status_code != 500, f"500 from invoice pdf: {r.text[:400]}"
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        assert r.content[:4] == b"%PDF"
