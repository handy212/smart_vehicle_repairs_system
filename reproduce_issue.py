import requests
import sys

def check_url(url):
    print(f"Checking {url}...")
    try:
        response = requests.get(url, timeout=5)
        print(f"Status: {response.status_code}")
        if response.status_code == 404:
            print("Confirmed 404 Not Found")
            print(f"Body: {response.text}")
        elif response.status_code in [401, 403]:
            print(f"Endpoint exists but requires auth ({response.status_code})")
            # If we get here with file_format=csv, IT WORKS (because view was entered)
        elif response.status_code == 200:
            print("Endpoint accessible!")
        else:
            print(f"Unexpected status: {response.status_code}")
    except Exception as e:
        print(f"Error: {e}")

print("Testing audit log download with file_format=csv...")
# This used to 404. Now it should 401
check_url("http://localhost:8001/api/accounts/admin/audit-logs/download/?file_format=csv")
