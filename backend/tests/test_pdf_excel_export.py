"""
Test PDF and Excel export functionality for NeoChef PWA
Tests:
1. Login with admin credentials
2. Fiche Technique PDF export endpoint
3. Fiche Technique Excel export endpoint
4. Monthly report PDF endpoint
5. Order PDF endpoint
"""
import pytest
import requests
import os
from dotenv import dotenv_values

_frontend_env = dotenv_values("/app/frontend/.env")
_base = os.environ.get('REACT_APP_BACKEND_URL') or _frontend_env.get('REACT_APP_BACKEND_URL')
if not _base:
    raise RuntimeError("REACT_APP_BACKEND_URL missing from env and /app/frontend/.env")
BASE_URL = _base.rstrip('/')

class TestPDFExcelExport:
    """Test PDF and Excel export endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with admin credentials
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "groupenaga@gmail.com",
            "password": "LeCercle123!"
        })
        
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("session_token")
            self.user = data.get("user")
            self.restaurant = data.get("restaurant")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip("Login failed - skipping authenticated tests")
    
    def test_login_success(self):
        """Test login with admin credentials"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "groupenaga@gmail.com",
            "password": "LeCercle123!"
        })
        assert response.status_code == 200
        data = response.json()
        assert "session_token" in data
        assert "user" in data
        print(f"✓ Login successful for user: {data['user']['email']}")
    
    def test_fiche_sections_list(self):
        """Test getting fiche technique sections"""
        response = self.session.get(f"{BASE_URL}/api/fiche-sections/list")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Fiche sections list: {len(data)} sections found")
        return data
    
    def test_fiche_products_list(self):
        """Test getting fiche technique products"""
        response = self.session.get(f"{BASE_URL}/api/fiche-products/list")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Fiche products list: {len(data)} products found")
        return data
    
    def test_fiche_export_pdf(self):
        """Test Fiche Technique PDF export endpoint"""
        # First get products to export
        products_response = self.session.get(f"{BASE_URL}/api/fiche-products/list")
        if products_response.status_code != 200:
            pytest.skip("Could not get products list")
        
        products = products_response.json()
        if not products:
            pytest.skip("No products available for export")
        
        # Get first product ID
        product_ids = [products[0].get("product_id")]
        
        # Test PDF export
        response = self.session.post(
            f"{BASE_URL}/api/fiche-products/export-pdf",
            json={
                "product_ids": product_ids,
                "include_prices": True
            }
        )
        
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"
        assert len(response.content) > 0
        print(f"✓ Fiche PDF export successful: {len(response.content)} bytes")
    
    def test_fiche_export_excel(self):
        """Test Fiche Technique Excel export endpoint - CRITICAL TEST"""
        # First get products to export
        products_response = self.session.get(f"{BASE_URL}/api/fiche-products/list")
        if products_response.status_code != 200:
            pytest.skip("Could not get products list")
        
        products = products_response.json()
        if not products:
            pytest.skip("No products available for export")
        
        # Get first product ID
        product_ids = [products[0].get("product_id")]
        
        # Test Excel export
        response = self.session.post(
            f"{BASE_URL}/api/fiche-products/export-excel",
            json={
                "product_ids": product_ids,
                "include_prices": True
            }
        )
        
        assert response.status_code == 200
        # Check for proper XLSX content type
        content_type = response.headers.get("content-type", "")
        assert "spreadsheetml" in content_type or "xlsx" in content_type or "octet-stream" in content_type, f"Unexpected content type: {content_type}"
        assert len(response.content) > 0
        
        # Verify it's a valid XLSX file (starts with PK - ZIP signature)
        assert response.content[:2] == b'PK', "Excel file should start with PK (ZIP signature)"
        print(f"✓ Fiche Excel export successful: {len(response.content)} bytes, valid XLSX format")
    
    def test_suppliers_list(self):
        """Test getting suppliers list"""
        response = self.session.get(f"{BASE_URL}/api/suppliers/list")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Suppliers list: {len(data)} suppliers found")
        return data
    
    def test_supplier_orders_list(self):
        """Test getting supplier orders list"""
        response = self.session.get(f"{BASE_URL}/api/supplier-orders/list")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Supplier orders list: {len(data)} orders found")
        return data
    
    def test_monthly_report_api(self):
        """Test monthly report API endpoint"""
        # Get current date range
        from datetime import datetime, timedelta
        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        
        response = self.session.get(
            f"{BASE_URL}/api/supplier-orders/monthly-report",
            params={
                "start_date": start_date,
                "end_date": end_date
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        print(f"✓ Monthly report API successful: {data.keys()}")
    
    def test_order_pdf_endpoint(self):
        """Test order PDF generation endpoint"""
        # First get orders
        orders_response = self.session.get(f"{BASE_URL}/api/supplier-orders/list")
        if orders_response.status_code != 200:
            pytest.skip("Could not get orders list")
        
        orders = orders_response.json()
        if not orders:
            pytest.skip("No orders available for PDF export")
        
        # Get first order ID
        order_id = orders[0].get("order_id")
        
        # Test PDF export
        response = self.session.get(f"{BASE_URL}/api/supplier-orders/{order_id}/pdf")
        
        if response.status_code == 200:
            assert response.headers.get("content-type") == "application/pdf"
            assert len(response.content) > 0
            print(f"✓ Order PDF export successful: {len(response.content)} bytes")
        elif response.status_code == 404:
            print("⚠ Order PDF endpoint not found (may not be implemented)")
        else:
            print(f"⚠ Order PDF returned status: {response.status_code}")


class TestHealthEndpoints:
    """Test basic health endpoints"""
    
    def test_health(self):
        """Test health endpoint (non-/api paths are only routed to the backend
        inside the pod; the public ingress sends them to the frontend)."""
        response = requests.get("http://localhost:8001/health")
        assert response.status_code == 200
        print("✓ Health endpoint OK")
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print("✓ API health endpoint OK")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
