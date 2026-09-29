from http.server import BaseHTTPRequestHandler
import json
import pathlib
import sys

_ROOT = pathlib.Path(__file__).parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from api._shared.db import (  # noqa: E402
    delete_old_records,
    delete_record,
    delete_records,
    is_configured,
    list_history,
)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if not is_configured():
            self._respond(503, {
                "success": False,
                "error": "Supabase가 설정되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY를 확인하세요.",
            })
            return
        try:
            records = list_history()
            self._respond(200, {
                "success": True,
                "count": len(records),
                "records": records,
            })
        except Exception as e:
            self._respond(500, {"success": False, "error": str(e)})

    def do_POST(self):
        if not is_configured():
            self._respond(503, {
                "success": False,
                "error": "Supabase가 설정되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY를 확인하세요.",
            })
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}
        except Exception:
            self._respond(400, {"success": False, "error": "Invalid JSON body"})
            return

        action = (body.get("action") or "").strip()

        try:
            if action == "delete-one":
                record_id = body.get("id")
                if record_id is None:
                    self._respond(400, {"success": False, "error": "id가 필요합니다."})
                    return
                delete_record(int(record_id))
                self._respond(200, {"success": True, "message": "삭제되었습니다."})
                return

            if action == "delete-multiple":
                record_ids = body.get("record_ids") or []
                if not record_ids:
                    self._respond(400, {"success": False, "error": "삭제할 항목이 없습니다."})
                    return
                deleted_count = delete_records([int(i) for i in record_ids])
                self._respond(200, {
                    "success": True,
                    "deleted_count": deleted_count,
                    "message": f"{deleted_count}건의 기록이 삭제되었습니다.",
                })
                return

            if action == "delete-old":
                days = int(body.get("days") or 90)
                deleted_count = delete_old_records(days)
                self._respond(200, {
                    "success": True,
                    "deleted_count": deleted_count,
                    "message": f"{deleted_count}건의 {days}일 이상 경과 기록이 삭제되었습니다.",
                })
                return

            self._respond(400, {"success": False, "error": "알 수 없는 action입니다."})
        except Exception as e:
            self._respond(500, {"success": False, "error": str(e)})

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
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
