from http.server import BaseHTTPRequestHandler
import json
import pathlib
import sys

_ROOT = pathlib.Path(__file__).parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from api._shared.db import is_configured, update_mapping  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if not is_configured():
            self._respond(503, {
                "success": False,
                "error": "Supabase가 설정되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY를 확인하세요.",
            })
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length)) if length else {}
        except Exception:
            self._respond(400, {"success": False, "error": "Invalid JSON body"})
            return

        record_id = payload.get("record_id")
        mct_ry_cd = payload.get("mct_ry_cd")
        hpsn_mct_zcd = payload.get("hpsn_mct_zcd")

        if not record_id:
            self._respond(400, {"success": False, "error": "record_id가 필요합니다."})
            return

        if not mct_ry_cd and not hpsn_mct_zcd:
            self._respond(400, {"success": False, "error": "업데이트할 매핑 값이 없습니다."})
            return

        try:
            updated = update_mapping(
                int(record_id),
                mct_ry_cd=mct_ry_cd,
                hpsn_mct_zcd=hpsn_mct_zcd,
                reasoning="[사용자 수기입력건]",
            )
            if not updated:
                self._respond(404, {"success": False, "error": "기록을 찾을 수 없습니다."})
                return
            self._respond(200, {
                "success": True,
                "message": "매핑이 업데이트되었습니다.",
                "updated_record": updated,
            })
        except Exception as e:
            self._respond(500, {"success": False, "error": str(e)})

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _respond(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
