import requests
import sys
import json
from datetime import datetime
from typing import Dict, List, Optional

class NeoChefAPITester:
    def __init__(self, base_url="https://neochef-bugfix-1.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.session = requests.Session()
        self.session.timeout = 10

    def log_result(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict] = None, headers: Optional[Dict] = None) -> tuple:
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        test_headers = {'Content-Type': 'application/json'}
        
        if headers:
            test_headers.update(headers)
            
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=test_headers)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=test_headers)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=test_headers)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=test_headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                self.log_result(name, True, f"Status: {response.status_code}")
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_text = response.text[:200] if response.text else "No response body"
                    print(f"   Response: {error_text}")
                    self.log_result(name, False, f"Expected {expected_status}, got {response.status_code}. Response: {error_text}")
                except:
                    self.log_result(name, False, f"Expected {expected_status}, got {response.status_code}")

            try:
                response_json = response.json() if response.content else {}
            except:
                response_json = {}

            return success, response_json, response

        except requests.exceptions.Timeout:
            print(f"❌ Failed - Request timeout")
            self.log_result(name, False, "Request timeout")
            return False, {}, None
        except requests.exceptions.ConnectionError:
            print(f"❌ Failed - Connection error")
            self.log_result(name, False, "Connection error")
            return False, {}, None
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.log_result(name, False, f"Error: {str(e)}")
            return False, {}, None

    def test_health_endpoint(self):
        """Test /api/health endpoint"""
        success, response, _ = self.run_test(
            "Health Check",
            "GET",
            "/api/health",
            200
        )
        
        if success and response:
            # Check if response contains expected health info
            if 'status' in response:
                print(f"   Status: {response.get('status')}")
            if 'mongodb' in response:
                print(f"   MongoDB: {response.get('mongodb')}")
            if 'timestamp' in response:
                print(f"   Timestamp: {response.get('timestamp')}")
                
        return success

    def test_root_endpoint(self):
        """Test /api/ endpoint for app info"""
        success, response, _ = self.run_test(
            "App Info",
            "GET",
            "/api/",
            200
        )
        
        if success and response:
            print(f"   App Info: {response}")
                
        return success

    def test_static_files(self):
        """Test static file serving"""
        files_to_test = [
            ("/manifest.json", "Manifest JSON"),
            ("/apple-touch-icon.png", "Apple Touch Icon"),
            ("/favicon.ico", "Favicon")
        ]
        
        results = []
        for file_path, description in files_to_test:
            try:
                url = f"{self.base_url}{file_path}"
                response = self.session.get(url, timeout=10)
                success = response.status_code == 200
                
                print(f"\n📄 Testing {description}...")
                print(f"   URL: {url}")
                
                if success:
                    print(f"✅ Passed - Status: {response.status_code}")
                    print(f"   Content-Type: {response.headers.get('content-type', 'Unknown')}")
                    print(f"   Content-Length: {response.headers.get('content-length', 'Unknown')}")
                    self.log_result(f"Static File: {description}", True, f"Status: {response.status_code}")
                    self.tests_passed += 1
                else:
                    print(f"❌ Failed - Status: {response.status_code}")
                    self.log_result(f"Static File: {description}", False, f"Status: {response.status_code}")
                
                results.append(success)
                self.tests_run += 1
                
            except Exception as e:
                print(f"❌ Failed - Error: {str(e)}")
                self.log_result(f"Static File: {description}", False, f"Error: {str(e)}")
                results.append(False)
                self.tests_run += 1
        
        return all(results)

    def test_cors_and_preflight(self):
        """Test CORS configuration"""
        try:
            url = f"{self.base_url}/api/health"
            
            # Test preflight request
            print(f"\n🌐 Testing CORS preflight...")
            preflight_response = self.session.options(
                url, 
                headers={
                    'Origin': 'https://example.com',
                    'Access-Control-Request-Method': 'GET',
                    'Access-Control-Request-Headers': 'Content-Type'
                }
            )
            
            cors_success = (preflight_response.status_code in [200, 204] or 
                          'Access-Control-Allow-Origin' in preflight_response.headers)
            
            if cors_success:
                print(f"✅ CORS Preflight - Status: {preflight_response.status_code}")
                print(f"   CORS Headers: {dict(preflight_response.headers)}")
                self.log_result("CORS Preflight", True, f"Status: {preflight_response.status_code}")
                self.tests_passed += 1
            else:
                print(f"❌ CORS Preflight - Status: {preflight_response.status_code}")
                self.log_result("CORS Preflight", False, f"Status: {preflight_response.status_code}")
                
            self.tests_run += 1
            return cors_success
            
        except Exception as e:
            print(f"❌ CORS Test Failed - Error: {str(e)}")
            self.log_result("CORS Preflight", False, f"Error: {str(e)}")
            self.tests_run += 1
            return False

    def test_basic_endpoints(self):
        """Test basic application endpoints"""
        endpoints_to_test = [
            ("/api/", "GET", 200, "Application Root"),
        ]
        
        results = []
        for endpoint, method, expected_status, description in endpoints_to_test:
            success, _, _ = self.run_test(description, method, endpoint, expected_status)
            results.append(success)
        
        return all(results)

    def print_summary(self):
        """Print test summary"""
        print(f"\n" + "="*60)
        print(f"📊 TEST SUMMARY")
        print(f"="*60)
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        if self.tests_run - self.tests_passed > 0:
            print(f"\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"   • {result['test']}: {result['details']}")
        
        return self.tests_passed == self.tests_run

def main():
    """Run all tests"""
    print("🚀 Starting NeoChef PWA Backend Tests...")
    print(f"Target URL: https://neochef-bugfix-1.preview.emergentagent.com")
    
    tester = NeoChefAPITester()
    
    # Test core functionality
    print(f"\n" + "="*60)
    print(f"🔧 CORE API TESTS")
    print(f"="*60)
    
    health_success = tester.test_health_endpoint()
    root_success = tester.test_root_endpoint()
    basic_success = tester.test_basic_endpoints()
    
    print(f"\n" + "="*60)
    print(f"📄 STATIC FILE TESTS")
    print(f"="*60)
    
    static_success = tester.test_static_files()
    
    print(f"\n" + "="*60)
    print(f"🌐 CORS & NETWORKING TESTS")
    print(f"="*60)
    
    cors_success = tester.test_cors_and_preflight()
    
    # Print final summary
    all_success = tester.print_summary()
    
    # Return appropriate exit code
    return 0 if all_success else 1

if __name__ == "__main__":
    sys.exit(main())