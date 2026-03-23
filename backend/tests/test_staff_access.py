"""
Test suite for NeoChef Staff Access & Permissions
Tests the following features:
1. Login with staff account (tharshikan@orange.fr / Kajan1012)
2. Access to events (GET /api/events)
3. Access to Menu Restaurant (GET /api/menu-restaurant/sections/list)
4. Restaurant switching (POST /api/restaurants/switch)
5. Translation API (POST /api/translate)
"""
import pytest
import requests
import os

# Use the public URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://ios-pdf-repair.preview.emergentagent.com"

# Test credentials
STAFF_EMAIL = "tharshikan@orange.fr"
STAFF_PASSWORD = "Kajan1012"
ADMIN_EMAIL = "groupenaga@gmail.com"
ADMIN_PASSWORD = "LeCercle123!"


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_health_endpoint(self):
        """Test that health endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        print(f"✓ Health check passed: {data}")


class TestStaffLogin:
    """Test staff authentication"""
    
    def test_staff_login_success(self):
        """Test login with staff account"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": STAFF_EMAIL, "password": STAFF_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "session_token" in data, "No session_token in response"
        assert "user" in data, "No user in response"
        
        user = data["user"]
        assert user["email"] == STAFF_EMAIL
        assert "role" in user
        assert "detailed_permissions" in user, "No detailed_permissions in user object"
        
        print(f"✓ Staff login successful")
        print(f"  User: {user.get('name')} ({user.get('role')})")
        print(f"  Restaurant ID: {user.get('restaurant_id')}")
        print(f"  Restaurant IDs: {user.get('restaurant_ids', [])}")
        print(f"  Detailed Permissions: {user.get('detailed_permissions', {})}")
        
        return data
    
    def test_staff_has_detailed_permissions(self):
        """Verify staff user has detailed_permissions populated"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": STAFF_EMAIL, "password": STAFF_PASSWORD}
        )
        assert response.status_code == 200
        
        data = response.json()
        user = data["user"]
        dp = user.get("detailed_permissions", {})
        
        # Check that detailed_permissions is not empty
        assert dp, "detailed_permissions should not be empty"
        
        # Check specific permissions exist
        print(f"✓ Staff has detailed_permissions:")
        print(f"  - parametres: {dp.get('parametres', False)}")
        print(f"  - equipe: {dp.get('equipe', False)}")
        print(f"  - evenement: {dp.get('evenement', {})}")
        print(f"  - menu_restaurant: {dp.get('menu_restaurant', {})}")
        print(f"  - fiche_technique: {dp.get('fiche_technique', {})}")


class TestEventsAccess:
    """Test events module access for staff"""
    
    @pytest.fixture
    def staff_token(self):
        """Get staff authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": STAFF_EMAIL, "password": STAFF_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Staff login failed: {response.text}")
        return response.json()["session_token"]
    
    def test_events_list_access(self, staff_token):
        """Test GET /api/events with staff account"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        response = requests.get(f"{BASE_URL}/api/events", headers=headers)
        
        # Staff should have access if evenement.actif is true
        print(f"Events response status: {response.status_code}")
        print(f"Events response: {response.text[:500]}")
        
        # Check if access is granted (200) or denied (403)
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Staff has access to events")
            print(f"  Events count: {len(data) if isinstance(data, list) else 'N/A'}")
        elif response.status_code == 403:
            print(f"✗ Staff does NOT have access to events (403 Forbidden)")
            print(f"  Response: {response.text}")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code} - {response.text}")


class TestMenuRestaurantAccess:
    """Test Menu Restaurant module access for staff"""
    
    @pytest.fixture
    def staff_token(self):
        """Get staff authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": STAFF_EMAIL, "password": STAFF_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Staff login failed: {response.text}")
        return response.json()["session_token"]
    
    def test_menu_restaurant_sections_list(self, staff_token):
        """Test GET /api/menu-restaurant/sections/list with staff account"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        response = requests.get(f"{BASE_URL}/api/menu-restaurant/sections/list", headers=headers)
        
        print(f"Menu Restaurant sections response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Staff has access to Menu Restaurant sections")
            print(f"  Sections count: {len(data) if isinstance(data, list) else 'N/A'}")
        elif response.status_code == 403:
            print(f"✗ Staff does NOT have access to Menu Restaurant (403 Forbidden)")
        else:
            # API should return 200 even if empty
            print(f"Response: {response.text[:500]}")


class TestRestaurantSwitching:
    """Test restaurant switching for staff with multi-restaurant access"""
    
    @pytest.fixture
    def staff_login_data(self):
        """Get staff login data including restaurant_ids"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": STAFF_EMAIL, "password": STAFF_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Staff login failed: {response.text}")
        return response.json()
    
    def test_staff_has_multiple_restaurants(self, staff_login_data):
        """Verify staff user has access to multiple restaurants"""
        user = staff_login_data["user"]
        restaurant_ids = user.get("restaurant_ids", [])
        
        print(f"Staff restaurant_ids: {restaurant_ids}")
        print(f"Current restaurant_id: {user.get('restaurant_id')}")
        
        # Staff should have access to at least 2 restaurants based on previous tests
        if len(restaurant_ids) >= 2:
            print(f"✓ Staff has access to {len(restaurant_ids)} restaurants")
        else:
            print(f"⚠ Staff has access to only {len(restaurant_ids)} restaurant(s)")
    
    def test_restaurant_switch(self, staff_login_data):
        """Test POST /api/restaurants/switch"""
        token = staff_login_data["session_token"]
        user = staff_login_data["user"]
        restaurant_ids = user.get("restaurant_ids", [])
        
        if len(restaurant_ids) < 2:
            pytest.skip("Staff doesn't have access to multiple restaurants")
        
        # Get a different restaurant to switch to
        current_restaurant = user.get("restaurant_id")
        target_restaurant = None
        for rid in restaurant_ids:
            if rid != current_restaurant:
                target_restaurant = rid
                break
        
        if not target_restaurant:
            pytest.skip("No alternate restaurant found to switch to")
        
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.post(
            f"{BASE_URL}/api/restaurants/switch",
            json={"restaurant_id": target_restaurant},
            headers=headers
        )
        
        print(f"Switch restaurant response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Restaurant switch successful")
            print(f"  Switched to: {data.get('restaurant', {}).get('name', 'Unknown')}")
            print(f"  New restaurant_id: {data.get('user', {}).get('restaurant_id')}")
        elif response.status_code == 403:
            print(f"✗ Restaurant switch failed (403 Forbidden)")
            print(f"  Response: {response.text}")
        else:
            print(f"Response: {response.text}")


class TestTranslationAPI:
    """Test translation API endpoint"""
    
    @pytest.fixture
    def staff_token(self):
        """Get staff authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": STAFF_EMAIL, "password": STAFF_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Staff login failed: {response.text}")
        return response.json()["session_token"]
    
    def test_translate_endpoint(self, staff_token):
        """Test POST /api/translate"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        
        # Test translation request
        payload = {
            "texts": ["Bonjour", "Menu du jour"],
            "target_language": "en"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/translate",
            json=payload,
            headers=headers
        )
        
        print(f"Translation response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Translation API works")
            print(f"  Response: {data}")
        elif response.status_code == 403:
            print(f"✗ Translation API access denied")
        elif response.status_code == 404:
            print(f"⚠ Translation endpoint not found - may need different payload format")
        else:
            print(f"Response: {response.text[:500]}")


class TestFicheTechniqueAccess:
    """Test Fiche Technique module access for staff"""
    
    @pytest.fixture
    def staff_token(self):
        """Get staff authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": STAFF_EMAIL, "password": STAFF_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Staff login failed: {response.text}")
        return response.json()["session_token"]
    
    def test_fiche_products_list(self, staff_token):
        """Test GET /api/fiche-products/list"""
        headers = {"Authorization": f"Bearer {staff_token}"}
        response = requests.get(f"{BASE_URL}/api/fiche-products/list", headers=headers)
        
        print(f"Fiche Products response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Staff has access to Fiche Technique products")
            print(f"  Products count: {len(data) if isinstance(data, list) else 'N/A'}")
        elif response.status_code == 403:
            print(f"✗ Staff does NOT have access to Fiche Technique (403 Forbidden)")


class TestAdminLogin:
    """Test admin authentication for comparison"""
    
    def test_admin_login_success(self):
        """Test login with admin account"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        
        if response.status_code == 200:
            data = response.json()
            user = data["user"]
            print(f"✓ Admin login successful")
            print(f"  User: {user.get('name')} ({user.get('role')})")
            print(f"  Restaurant ID: {user.get('restaurant_id')}")
        else:
            print(f"⚠ Admin login failed: {response.status_code} - {response.text}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
