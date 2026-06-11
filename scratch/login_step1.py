import urllib.request
import json
import os
from http.cookiejar import CookieJar

# Step 1: Send OTP and persist session
url = "http://127.0.0.1:5000/api/send-otp"
data = {
    "name": "Priyanshu",
    "email": "rajpriyanshu6083@gmail.com",
    "phone": "9876543210"
}

req = urllib.request.Request(
    url,
    data=json.dumps(data).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)

# Set up cookie handler to capture session cookies
cj = CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

try:
    print("Sending OTP request to backend...")
    resp = opener.open(req, timeout=10)
    res_data = json.loads(resp.read().decode("utf-8"))
    print("Response received:", res_data)
    
    if res_data.get("success"):
        # Save cookies to a file
        cookies = {}
        for cookie in cj:
            cookies[cookie.name] = cookie.value
        
        os.makedirs("scratch", exist_ok=True)
        with open("scratch/session_cookie.json", "w") as f:
            json.dump(cookies, f)
        print("Session cookie saved successfully. Ready for verification.")
    else:
        print("Backend returned failure:", res_data.get("message"))
except Exception as e:
    print("Error calling send-otp:", str(e))
