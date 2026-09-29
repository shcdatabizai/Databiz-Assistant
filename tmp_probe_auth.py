import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def load_env():
    env = {}
    for line in Path(r"D:\Cursor\DataBiz_Assist\.env.local").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k] = v.strip().strip('"')
    return env


def main():
    env = load_env()
    url = env["NEXT_PUBLIC_SUPABASE_URL"]
    key = env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
    secret = env["SUPABASE_SECRET_KEY"]

    req = urllib.request.Request(
        url + "/auth/v1/settings",
        headers={"apikey": key, "Authorization": "Bearer " + key},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        settings = json.loads(resp.read().decode())
    external = settings.get("external") or {}
    print("google_enabled", external.get("google"))
    print("disable_signup", settings.get("disable_signup"))
    print("mailer_autoconfirm", settings.get("mailer_autoconfirm"))

    redirect = "https://databiz-assist-theta.vercel.app/auth/callback"
    auth_url = (
        url
        + "/auth/v1/authorize?provider=google&redirect_to="
        + urllib.parse.quote(redirect, safe="")
    )
    class NoRedir(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    opener = urllib.request.build_opener(NoRedir)
    request = urllib.request.Request(auth_url, headers={"apikey": key})
    try:
        opener.open(request, timeout=20)
        print("authorize_no_redirect")
    except urllib.error.HTTPError as e:
        loc = e.headers.get("Location", "")
        parsed = urllib.parse.urlparse(loc)
        qs = urllib.parse.parse_qs(parsed.query)
        cid = (qs.get("client_id") or [""])[0]
        redir = (qs.get("redirect_uri") or [""])[0]
        print("authorize_status", e.code)
        print("google_host", parsed.netloc)
        print("client_id", cid)
        print("redirect_uri", redir)
        Path(r"D:\Cursor\DataBiz_Assist\tmp_google_client_id.txt").write_text(cid, encoding="utf-8")


if __name__ == "__main__":
    main()
