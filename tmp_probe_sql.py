import json
import urllib.error
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


def call(url, secret, key, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "apikey": secret,
            "Authorization": "Bearer " + secret,
            "Content-Type": "application/json",
            "x-client-info": "databiz-probe",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            return resp.status, resp.read()[:300].decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:300].decode("utf-8", "replace")
    except Exception as e:
        return 0, str(e)[:300]


def main():
    env = load_env()
    base = env["NEXT_PUBLIC_SUPABASE_URL"]
    secret = env["SUPABASE_SECRET_KEY"]
    key = env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
    query = {"query": "select 1 as ok"}
    targets = [
        base + "/pg/query",
        base + "/pg-meta/default/query",
        base + "/pg/query/default",
    ]
    for t in targets:
        status, body = call(t, secret, key, query)
        print(status, t, body.replace("\n", " ")[:180])


if __name__ == "__main__":
    main()
