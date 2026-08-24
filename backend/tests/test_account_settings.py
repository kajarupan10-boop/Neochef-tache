"""
Tests for the account-settings + forgot-password features (iteration 16).

Modules covered:
  - /api/auth/login
  - /api/auth/update-profile   (own name)
  - /api/auth/change-email     (own email, requires current password)
  - /api/auth/change-password  (own password, requires current password)
  - /api/auth/forgot-password + /api/auth/verify-reset-token + /api/auth/reset-password-with-token
"""
import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")

ORIGINAL_NAME = "Nagaratnam"
ORIGINAL_PASSWORD = "LeCercle123!"


@pytest.fixture(scope="session")
def test_credentials():
    p = Path("/app/memory/test_credentials.md")
    if not p.exists():
        pytest.skip("Missing /app/memory/test_credentials.md")
    content = p.read_text(encoding="utf-8")
    m = re.search(r"\|\s*Holding\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|", content)
    if not m:
        pytest.skip("Holding credentials not found")
    return {"email": m.group(1), "password": m.group(2)}


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(api_client, email, password):
    return api_client.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)


@pytest.fixture(scope="session")
def auth(api_client, test_credentials):
    r = _login(api_client, test_credentials["email"], test_credentials["password"])
    if r.status_code != 200:
        pytest.fail(f"Login failed {r.status_code}: {r.text[:400]}")
    data = r.json()
    assert "token" in data and isinstance(data["token"], str) and data["token"]
    assert "user" in data
    assert data["user"]["email"] == test_credentials["email"]
    return data


@pytest.fixture(scope="session")
def headers(auth):
    return {"Content-Type": "application/json", "Authorization": f"Bearer {auth['token']}"}


# ---------- update-profile (name) ----------
class TestUpdateProfile:
    def test_update_name_and_verify_persistence(self, api_client, headers, test_credentials):
        new_name = "TEST_QA_Name"
        r = api_client.post(f"{BASE_URL}/api/auth/update-profile", json={"name": new_name}, headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("name") == new_name
        assert "message" in body

        # verify persistence via a fresh login
        r2 = _login(api_client, test_credentials["email"], test_credentials["password"])
        assert r2.status_code == 200
        assert r2.json()["user"]["name"] == new_name

        # restore
        r3 = api_client.post(f"{BASE_URL}/api/auth/update-profile", json={"name": ORIGINAL_NAME}, headers=headers, timeout=30)
        assert r3.status_code == 200
        r4 = _login(api_client, test_credentials["email"], test_credentials["password"])
        assert r4.json()["user"]["name"] == ORIGINAL_NAME

    def test_update_name_empty_rejected(self, api_client, headers):
        r = api_client.post(f"{BASE_URL}/api/auth/update-profile", json={"name": "   "}, headers=headers, timeout=30)
        assert r.status_code == 400, r.text
        assert "nom" in r.json().get("detail", "").lower()

    def test_update_profile_requires_auth(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/update-profile", json={"name": "X"},
                            headers={"Content-Type": "application/json"}, timeout=30)
        assert r.status_code in (401, 403), r.status_code


# ---------- change-email ----------
class TestChangeEmail:
    def test_wrong_current_password(self, api_client, headers, test_credentials):
        r = api_client.post(f"{BASE_URL}/api/auth/change-email",
                            json={"current_password": "WRONG", "new_email": "qa_test_new@example.com"},
                            headers=headers, timeout=30)
        assert r.status_code == 401, r.text
        assert r.json()["detail"] == "Mot de passe actuel incorrect"

    def test_same_email_is_idempotent(self, api_client, headers, test_credentials):
        r = api_client.post(f"{BASE_URL}/api/auth/change-email",
                            json={"current_password": test_credentials["password"],
                                  "new_email": test_credentials["email"]},
                            headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["message"] == "Email inchangé"
        assert body["email"] == test_credentials["email"]

    def test_invalid_email_rejected(self, api_client, headers, test_credentials):
        r = api_client.post(f"{BASE_URL}/api/auth/change-email",
                            json={"current_password": test_credentials["password"], "new_email": "notanemail"},
                            headers=headers, timeout=30)
        assert r.status_code == 400, r.text
        assert r.json()["detail"] == "Email invalide"

    def test_email_taken_by_other_account(self, api_client, headers, test_credentials):
        # tharshikan@orange.fr exists in DB (see test_credentials.md)
        r = api_client.post(f"{BASE_URL}/api/auth/change-email",
                            json={"current_password": test_credentials["password"],
                                  "new_email": "tharshikan@orange.fr"},
                            headers=headers, timeout=30)
        assert r.status_code == 409, r.text
        assert "déjà utilisé" in r.json()["detail"]


# ---------- change-password ----------
class TestChangePassword:
    def test_wrong_current_password(self, api_client, headers):
        r = api_client.post(f"{BASE_URL}/api/auth/change-password",
                            json={"current_password": "WRONG", "new_password": "Whatever123!"},
                            headers=headers, timeout=30)
        assert r.status_code == 401, r.text
        assert r.json()["detail"] == "Mot de passe actuel incorrect"

    def test_short_new_password_rejected(self, api_client, headers, test_credentials):
        r = api_client.post(f"{BASE_URL}/api/auth/change-password",
                            json={"current_password": test_credentials["password"], "new_password": "abc"},
                            headers=headers, timeout=30)
        assert r.status_code == 400, r.text
        assert "6 caract" in r.json()["detail"]

    def test_change_password_same_value_and_relogin(self, api_client, headers, test_credentials):
        # Set the password to the same known value -> success message, login must still work
        r = api_client.post(f"{BASE_URL}/api/auth/change-password",
                            json={"current_password": test_credentials["password"],
                                  "new_password": ORIGINAL_PASSWORD},
                            headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["message"] == "Mot de passe modifié avec succès"

        r2 = _login(api_client, test_credentials["email"], ORIGINAL_PASSWORD)
        assert r2.status_code == 200, r2.text


# ---------- forgot password flow ----------
class TestForgotPassword:
    def test_forgot_password_unknown_email_generic_200(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/forgot-password",
                            json={"email": "TEST_nobody_qa@example.com"}, timeout=60)
        assert r.status_code == 200, r.text
        assert "réinitialisation" in r.json()["message"]

    def test_forgot_password_invalid_email_format(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": "notanemail"}, timeout=30)
        assert r.status_code == 422, r.status_code

    def test_full_reset_flow(self, api_client, test_credentials):
        r = api_client.post(f"{BASE_URL}/api/auth/forgot-password",
                            json={"email": test_credentials["email"]}, timeout=90)
        assert r.status_code == 200, r.text
        assert "réinitialisation" in r.json()["message"]

        # Token is created in DB (no email is really delivered - SendGrid key is invalid)
        token = _latest_reset_token(test_credentials["email"])
        assert token, "No reset token found in DB after forgot-password"

        v = api_client.get(f"{BASE_URL}/api/auth/verify-reset-token", params={"token": token}, timeout=30)
        assert v.status_code == 200, v.text
        vb = v.json()
        assert vb["valid"] is True
        assert vb["email"] == test_credentials["email"]

        # Reset back to the original password
        rp = api_client.post(f"{BASE_URL}/api/auth/reset-password-with-token",
                             json={"token": token, "new_password": ORIGINAL_PASSWORD}, timeout=30)
        assert rp.status_code == 200, rp.text
        assert "réinitialisé" in rp.json()["message"]

        # Token now single-use
        again = api_client.post(f"{BASE_URL}/api/auth/reset-password-with-token",
                                json={"token": token, "new_password": ORIGINAL_PASSWORD}, timeout=30)
        assert again.status_code == 400
        assert "invalide" in again.json()["detail"].lower()

        # Login still works with the original password
        li = _login(api_client, test_credentials["email"], ORIGINAL_PASSWORD)
        assert li.status_code == 200, li.text

    def test_verify_bad_token(self, api_client):
        v = api_client.get(f"{BASE_URL}/api/auth/verify-reset-token", params={"token": "TEST_bogus"}, timeout=30)
        assert v.status_code == 400


def _latest_reset_token(email):
    """Read the most recent unused reset token straight from Mongo."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient

    mongo_url = os.environ.get("MONGO_URL") or dotenv_values("/app/backend/.env").get("MONGO_URL")
    db_name = os.environ.get("DB_NAME") or dotenv_values("/app/backend/.env").get("DB_NAME")

    async def _run():
        client = AsyncIOMotorClient(mongo_url)
        try:
            db = client[db_name]
            doc = await db["mep_password_resets"].find_one(
                {"email": email.lower(), "used": False}, {"_id": 0}, sort=[("created_at", -1)]
            )
            return doc.get("token") if doc else None
        finally:
            client.close()

    return asyncio.run(_run())
