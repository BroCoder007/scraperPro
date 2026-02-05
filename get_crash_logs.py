import requests
import json

try:
    resp = requests.get("http://localhost:8000/status")
    data = resp.json()
    print("Logs:")
    for log in data.get("logs", []):
        print(f"{log['time']} - {log['message']}")
except Exception as e:
    print(e)
