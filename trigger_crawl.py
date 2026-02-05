import requests
import time
import sys

BASE_URL = "http://localhost:8000"

def trigger_crawl():
    try:
        print("Sending start request...")
        resp = requests.post(f"{BASE_URL}/start", json={"url": "https://www.coursera.org/"})
        print(f"Start response: {resp.status_code} - {resp.text}")
        if resp.status_code != 200:
            return
            
        print("Monitoring status...")
        for i in range(30): # Monitor for 30 seconds
            try:
                status_resp = requests.get(f"{BASE_URL}/status")
                if status_resp.status_code == 200:
                    data = status_resp.json()
                    print(f"Status: running={data['is_running']}, data_count={data['data_count']}")
                    # Check logs for crash
                    for log in data.get('logs', []):
                        if "crashed" in log.get('message', '').lower():
                            print("FOUND CRASH IN LOGS!")
                            print(log)
                            return
                else:
                    print(f"Status check failed: {status_resp.status_code}")
            except requests.exceptions.ConnectionError:
                print("Connection refused - Server likely CRASHED!")
                return
            
            time.sleep(2)
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    trigger_crawl()
