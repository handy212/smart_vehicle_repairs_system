import requests
import sys
import json

BASE_URL = "http://localhost:8001/api"
EMAIL = "fixedlogin@example.com"
PASSWORD = "password123"

def test_login():
    print("1. Attempting login...")
    response = requests.post(f"{BASE_URL}/auth/token/", json={
        "email": EMAIL,
        "password": PASSWORD
    })
    
    if response.status_code != 200:
        print(f"Login FAILED: {response.status_code}")
        print(response.text)
        sys.exit(1)
        
    data = response.json()
    access_token = data.get("access")
    refresh_token = data.get("refresh")
    
    if not access_token:
        print("Login FAILED: No access token returned")
        print(json.dumps(data, indent=2))
        sys.exit(1)
        
    print(f"Login SUCCESS. Access token length: {len(access_token)}")
    
    # 2. Test /me endpoint
    print("2. Testing /users/me/ endpoint...")
    headers = {"Authorization": f"Bearer {access_token}"}
    me_response = requests.get(f"{BASE_URL}/auth/users/me/", headers=headers)
    
    if me_response.status_code != 200:
        print(f"/me FAILED: {me_response.status_code}")
        print(me_response.text)
        sys.exit(1)
        
    me_data = me_response.json()
    print("User Profile:")
    print(json.dumps(me_data, indent=2))
    print(f"Role: {me_data.get('role')}")
    
    if me_data.get('role') != 'customer':
        print("WARNING: User role is not 'customer'!")
    else:
        print("SUCCESS: Customer user verified!")

if __name__ == "__main__":
    test_login()
