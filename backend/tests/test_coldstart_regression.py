"""
Regression tests after cold-start / deployment fixes (iteration 16).
Covers: health endpoints, login, translation cache, forgot-password,
change-password / change-email / update-profile, menu-restaurant item create
background translation scheduling.
"""
import os
import re
import time
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
LOCAL_URL = "http://localhost:8001"

RESTAURANT_LE_CERCLE = "rest_efb3705687ef"
EXPECTED_LANGS = ["en", "es", "de", "it", "zh", "ru", "pt"]


@pytest.fixture(scope="session")
def creds():
    p = Path("/app/memory/test_credentials.md")
    if not p.exists():
        pytest.skip("missing test_credentials.md")
    content = p.read_text(encoding="utf-8")
    m = re.search(r"\|\s*Holding\s*\|\s*(\S+@\S+)\s*\|\s*(\S+)\s*\|", content)
    if not m:
        pytest.skip("no holding creds found")
    return {"email": m.group(1), "password": m.group(2)}


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def token(client, creds):
    r = client.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"login failed {r.status_code}: {r.text[:300]}")
    data = r.json()
    tok = data.get("session_token") or data.get("token")
    if not tok:
        pytest.fail(f"no session_token in login response: {list(data.keys())}")
    return tok


@pytest.fixture(scope="session")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Health endpoints (cold start) ----------
class TestHealth:
    @pytest.mark.parametrize("path,expected_key", [
        ("/health", "ok"),
        ("/healthz", "ok"),
        ("/ready", "ready"),
        ("/api/health", "ok"),
        ("/", "ok"),
    ])
    def test_local_health(self, client, path, expected_key):
        r = client.get(f"{LOCAL_URL}{path}", timeout=10)
        assert r.status_code == 200, f"{path} -> {r.status_code}"
        assert r.json().get("status") == expected_key

    def test_public_api_health(self, client):
        r = client.get(f"{BASE_URL}/api/health", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert body["app"] == "RestoPilot"

    def test_health_response_time(self, client):
        t0 = time.time()
        r = client.get(f"{LOCAL_URL}/health", timeout=5)
        elapsed = time.time() - t0
        assert r.status_code == 200
        assert elapsed < 1.0, f"health slow: {elapsed:.2f}s"


# ---------- Auth / login ----------
class TestAuth:
    def test_login_returns_session_token(self, client, creds):
        r = client.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "session_token" in d
        assert isinstance(d["session_token"], str) and len(d["session_token"]) > 10
        assert d["user"]["email"] == creds["email"]

    def test_login_wrong_password(self, client, creds):
        r = client.post(f"{BASE_URL}/api/auth/login",
                        json={"email": creds["email"], "password": "WRONG_pass_123"}, timeout=30)
        assert r.status_code == 401

    def test_auth_me(self, client, auth_headers, creds):
        r = client.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["user"]["email"] == creds["email"]

    def test_auth_me_no_token(self, client):
        s = requests.Session()
        r = s.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert r.status_code in (401, 403)


# ---------- Forgot password ----------
class TestForgotPassword:
    def test_forgot_password_existing_user(self, client, creds):
        r = client.post(f"{BASE_URL}/api/auth/forgot-password",
                        json={"email": creds["email"]}, timeout=60)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        assert "message" in r.json()

    def test_forgot_password_unknown_email(self, client):
        r = client.post(f"{BASE_URL}/api/auth/forgot-password",
                        json={"email": f"TEST_nobody_{uuid.uuid4().hex[:6]}@example.com"}, timeout=60)
        assert r.status_code == 200
        assert "message" in r.json()

    def test_forgot_password_invalid_email_format(self, client):
        r = client.post(f"{BASE_URL}/api/auth/forgot-password",
                        json={"email": "not-an-email"}, timeout=30)
        assert r.status_code == 422


# ---------- Translation cache ----------
class TestTranslationCache:
    def test_get_cached_translations(self, client):
        r = client.get(f"{BASE_URL}/api/public/translations/{RESTAURANT_LE_CERCLE}", timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert isinstance(data, dict) and data, "empty translation cache"
        missing = [l for l in EXPECTED_LANGS if l not in data]
        assert not missing, f"missing languages: {missing} (present: {list(data.keys())})"
        for lang in EXPECTED_LANGS:
            assert isinstance(data[lang], dict) and len(data[lang]) > 0, f"{lang} empty"
        assert "_id" not in data

    def test_get_translations_fast_cache_hit(self, client):
        t0 = time.time()
        r = client.get(f"{BASE_URL}/api/public/translations/{RESTAURANT_LE_CERCLE}", timeout=30)
        elapsed = time.time() - t0
        assert r.status_code == 200
        assert elapsed < 10, f"cache hit slow: {elapsed:.2f}s"

    def test_get_translations_unknown_restaurant(self, client):
        r = client.get(f"{BASE_URL}/api/public/translations/rest_does_not_exist", timeout=30)
        assert r.status_code == 200
        assert r.json() == {}

    def test_generate_returns_202_immediately(self, client):
        """Fix (iteration 17): endpoint must schedule background work and return 202 fast."""
        t0 = time.time()
        r = client.post(f"{BASE_URL}/api/public/translations/{RESTAURANT_LE_CERCLE}/generate", timeout=30)
        elapsed = time.time() - t0
        assert r.status_code == 202, f"{r.status_code}: {r.text[:300]}"
        d = r.json()
        assert d.get("restaurant_id") == RESTAURANT_LE_CERCLE
        assert isinstance(d.get("message"), str) and d["message"]
        assert elapsed < 5, f"generate slow (LLM on request path?): {elapsed:.2f}s"

    def test_generate_cache_hit_still_202(self, client):
        """Cache is populated -> still 202, internal short-circuit skips LLM."""
        r = client.post(f"{BASE_URL}/api/public/translations/{RESTAURANT_LE_CERCLE}/generate", timeout=30)
        assert r.status_code == 202, r.text[:300]
        # cached translations must remain intact right after
        g = client.get(f"{BASE_URL}/api/public/translations/{RESTAURANT_LE_CERCLE}", timeout=30)
        assert g.status_code == 200
        assert all(l in g.json() for l in EXPECTED_LANGS)


# ---------- Public menu / client page ----------
class TestPublicMenu:
    def test_public_menu_restaurant(self, client):
        r = client.get(f"{BASE_URL}/api/menu-restaurant/public/{RESTAURANT_LE_CERCLE}", timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "sections" in d or "items" in d, list(d.keys())

    def test_public_restaurant_info(self, client):
        r = client.get(f"{BASE_URL}/api/restaurants/{RESTAURANT_LE_CERCLE}/public", timeout=30)
        assert r.status_code == 200
        assert r.json().get("restaurant_id") == RESTAURANT_LE_CERCLE or "name" in r.json()

    def test_client_menu_page_html(self, client):
        r = client.get(f"{BASE_URL}/client/{RESTAURANT_LE_CERCLE}", timeout=30)
        assert r.status_code == 200, f"{r.status_code}"
        assert "text/html" in r.headers.get("content-type", "")


# ---------- Account settings ----------
class TestAccountSettings:
    def test_update_profile(self, client, auth_headers):
        r = client.post(f"{BASE_URL}/api/auth/update-profile",
                        json={"name": "Nagaratnam"}, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("name") == "Nagaratnam"
        me = client.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=30)
        assert me.json()["user"]["name"] == "Nagaratnam"

    def test_update_profile_empty_name(self, client, auth_headers):
        r = client.post(f"{BASE_URL}/api/auth/update-profile",
                        json={"name": "   "}, headers=auth_headers, timeout=30)
        assert r.status_code == 400

    def test_change_email_wrong_password(self, client, auth_headers):
        r = client.post(f"{BASE_URL}/api/auth/change-email",
                        json={"current_password": "WRONG_pass_123",
                              "new_email": "TEST_should_not_apply@example.com"},
                        headers=auth_headers, timeout=30)
        assert r.status_code == 401, r.text[:300]

    def test_change_email_same_email_idempotent(self, client, auth_headers, creds):
        r = client.post(f"{BASE_URL}/api/auth/change-email",
                        json={"current_password": creds["password"], "new_email": creds["email"]},
                        headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("email") == creds["email"]

    def test_change_password_wrong_current(self, client, auth_headers):
        r = client.post(f"{BASE_URL}/api/auth/change-password",
                        json={"current_password": "WRONG_pass_123", "new_password": "Whatever123!"},
                        headers=auth_headers, timeout=30)
        assert r.status_code == 401

    def test_change_password_too_short(self, client, auth_headers, creds):
        r = client.post(f"{BASE_URL}/api/auth/change-password",
                        json={"current_password": creds["password"], "new_password": "abc"},
                        headers=auth_headers, timeout=30)
        assert r.status_code == 400

    def test_change_password_roundtrip(self, client, auth_headers, creds):
        temp = "TEST_Temp_Pass_987"
        r = client.post(f"{BASE_URL}/api/auth/change-password",
                        json={"current_password": creds["password"], "new_password": temp},
                        headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        # login with the new password
        r2 = client.post(f"{BASE_URL}/api/auth/login",
                         json={"email": creds["email"], "password": temp}, timeout=30)
        assert r2.status_code == 200, "new password not usable"
        new_tok = r2.json()["session_token"]
        # restore original
        r3 = client.post(f"{BASE_URL}/api/auth/change-password",
                         json={"current_password": temp, "new_password": creds["password"]},
                         headers={"Authorization": f"Bearer {new_tok}"}, timeout=30)
        assert r3.status_code == 200, "failed to restore original password"
        r4 = client.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
        assert r4.status_code == 200, "original password not restored"


# ---------- menu-restaurant item create -> background translation ----------
class TestMenuItemCreateTranslationTrigger:
    """KNOWN CRITICAL BUG (reproduced 2026-08-24): creating a menu-restaurant item
    schedules regenerate_translations_background, which calls
    emergentintegrations LlmChat.send_message -> litellm.completion() (SYNC).
    That blocks the single uvicorn event loop for the whole translation run
    (observed 10+ min, previously 14 min until the internal timeout), during which
    /health, /healthz, /ready and every API return nothing (connection hangs).
    Enable with RUN_BLOCKING_TRANSLATION_TEST=1 -- it makes the backend
    unavailable for several minutes."""

    @pytest.mark.skipif(os.environ.get("RUN_BLOCKING_TRANSLATION_TEST") != "1",
                        reason="Blocks backend for minutes; see docstring / iteration_16 report")
    def test_create_and_delete_item_triggers_translation(self, client, auth_headers):
        secs = client.get(f"{BASE_URL}/api/menu-restaurant/sections/list", headers=auth_headers, timeout=30)
        assert secs.status_code == 200, secs.text[:300]
        payload_secs = secs.json()
        sections = payload_secs if isinstance(payload_secs, list) else payload_secs.get("sections", [])
        if not sections:
            pytest.skip("no menu-restaurant sections available")
        section_id = sections[0]["section_id"]

        item_payload = {
            "section_id": section_id,
            "name": f"TEST_Item_{uuid.uuid4().hex[:6]}",
            "descriptions": ["TEST description"],
            "price": 9.5,
        }
        r = client.post(f"{BASE_URL}/api/menu-restaurant/items/create",
                        json=item_payload, headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text[:400]
        body = r.json()
        item_id = body.get("item_id") or body.get("item", {}).get("item_id")
        assert item_id, f"no item_id in response: {str(body)[:300]}"

        # No 500 / RuntimeError from the scheduling path
        time.sleep(2)
        h = client.get(f"{LOCAL_URL}/health", timeout=5)
        assert h.status_code == 200, "backend unhealthy after item create"

        # cleanup
        d = client.delete(f"{BASE_URL}/api/menu-restaurant/items/{item_id}",
                          headers=auth_headers, timeout=60)
        assert d.status_code in (200, 204, 404), d.text[:200]


# ---------- Event-loop starvation regression (iteration 17 fix) ----------
class TestEventLoopStarvationRegression:
    """Iteration 16 CRITICAL bug: LlmChat.send_message ran sync litellm.completion()
    on the event loop, so /health hung for minutes -> K8s liveness restarts.
    Fix: asyncio.to_thread(_blocking_call). This test forces a real background
    translation run (by invalidating the content hash) and asserts /health stays fast.
    """

    @pytest.fixture(scope="class")
    def translations_coll(self):
        from pymongo import MongoClient
        from dotenv import dotenv_values as _dv
        env = _dv("/app/backend/.env")
        cli = MongoClient(env["MONGO_URL"].strip('"'), serverSelectionTimeoutMS=5000)
        coll = cli[env["DB_NAME"].strip('"')]["mep_translations"]
        doc = coll.find_one({"restaurant_id": RESTAURANT_LE_CERCLE})
        yield coll, doc
        if doc:  # restore original cached translations / hash
            doc.pop("_id", None)
            coll.update_one({"restaurant_id": RESTAURANT_LE_CERCLE}, {"$set": doc}, upsert=True)
        cli.close()

    def test_health_latency_during_background_translation(self, client, translations_coll):
        coll, doc = translations_coll
        # Invalidate content hash -> background task cannot short-circuit, real LLM work runs
        if doc:
            coll.update_one({"restaurant_id": RESTAURANT_LE_CERCLE},
                            {"$set": {"content_hash": "FORCE_REGEN_TEST"}})

        t0 = time.time()
        r = client.post(f"{BASE_URL}/api/public/translations/{RESTAURANT_LE_CERCLE}/generate", timeout=30)
        trigger_elapsed = time.time() - t0
        assert r.status_code == 202, f"expected 202, got {r.status_code}: {r.text[:300]}"
        assert trigger_elapsed < 5, f"trigger blocked {trigger_elapsed:.2f}s (LLM on request path)"

        latencies = []
        for i in range(8):
            s = time.time()
            try:
                h = client.get(f"{LOCAL_URL}/health", timeout=5)
                el = time.time() - s
                status = h.status_code
            except Exception as e:
                el = time.time() - s
                status = f"EXC:{type(e).__name__}"
            latencies.append((status, round(el * 1000, 1)))
            time.sleep(1.8)

        print(f"trigger={trigger_elapsed*1000:.0f}ms  health latencies(ms)={latencies}")
        bad = [x for x in latencies if x[0] != 200 or x[1] > 500]
        assert not bad, f"event loop starved: {bad} (all={latencies})"

    def test_public_health_still_ok_after(self, client):
        r = client.get(f"{BASE_URL}/api/health", timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


# ---------- Translation cache data-format / completion bugs (found iteration 17) ----------
class TestTranslationCacheDataIntegrity:
    def test_legacy_format_docs_are_served(self, client):
        """BUG: 5 mep_translations docs store languages at the TOP level (no
        'translations' wrapper). GET reads cached.get('translations', {}) so it
        returns {} and those restaurants silently lose all translations."""
        r = client.get(f"{BASE_URL}/api/public/translations/rest_963812abe3f4", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data, "legacy-format translation doc served as empty {} (see docstring)"

    def test_le_cercle_cache_gets_populated(self, client):
        """BUG: background translation for Le Cercle (232 items x 7 langs) is aborted
        by the hard 300s asyncio.wait_for timeout and results are only persisted at
        the very end -> the cache is never written."""
        r = client.get(f"{BASE_URL}/api/public/translations/{RESTAURANT_LE_CERCLE}", timeout=30)
        assert r.status_code == 200
        assert r.json(), "Le Cercle translation cache is empty (translation never completes)"
