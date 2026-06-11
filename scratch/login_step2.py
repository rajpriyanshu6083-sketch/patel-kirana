import urllib.request
import json
import sys
from http.cookiejar import CookieJar, Cookie

if len(sys.argv) < 2:
    print("Error: Please provide the OTP code as an argument.")
    sys.exit(1)

otp = sys.argv[1].strip()

# Load cookies from file
try:
    with open("scratch/session_cookie.json", "r") as f:
        cookies = json.load(f)
except Exception as e:
    print("Error loading session cookie:", str(e))
    sys.exit(1)

# Recreate CookieJar
cj = CookieJar()
for name, value in cookies.items():
    c = Cookie(
        version=0, name=name, value=value,
        port=None, port_specified=False,
        domain="127.0.0.1", domain_specified=True, domain_initial_dot=False,
        path="/", path_specified=True,
        secure=False,
        expires=None,
        discard=True,
        comment=None,
        comment_url=None,
        rest={},
        rfc2109=False
    )
    cj.set_cookie(c)

url = "http://127.0.0.1:5000/api/verify-otp"
data = {"otp": otp}

req = urllib.request.Request(
    url,
    data=json.dumps(data).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)

opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

try:
    print(f"Verifying OTP '{otp}' with backend...")
    resp = opener.open(req, timeout=10)
    res_data = json.loads(resp.read().decode("utf-8"))
    print("Verification response:", res_data)
    
    if res_data.get("success"):
        print("SUCCESS: OTP verified successfully! Login complete.")
    else:
        print("FAILURE: OTP verification failed:", res_data.get("message"))
except Exception as e:
    print("Error calling verify-otp:", str(e))
