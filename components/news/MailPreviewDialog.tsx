"use client";

import { useEffect, useState } from "react";
import { Copy, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function MailPreviewDialog({
  open,
  onOpenChange,
  email,
  value,
  onChange,
  sending,
  error,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  value: string;
  onChange: (value: string) => void;
  sending: boolean;
  error: string | null;
  onSend: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEditing(false);
    setCopied(false);
  }, [open]);

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>메일 본문 확인</DialogTitle>
          <DialogDescription>{email} 으로 아래 내용을 보냅니다.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <textarea
            readOnly={!editing}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={`h-72 w-full resize-none rounded-lg border border-black/10 p-3 pb-12 text-sm leading-relaxed ${
              editing ? "bg-white" : "bg-[#fafafa]"
            }`}
          />
          <div className="absolute bottom-2 right-2 flex gap-1">
            <button
              type="button"
              aria-label={editing ? "수정 끝내기" : "본문 수정"}
              aria-pressed={editing}
              onClick={() => setEditing((current) => !current)}
              className={`inline-flex size-8 items-center justify-center rounded-md border border-black/10 bg-white ${
                editing ? "text-shinhan-blue" : "text-black/55"
              }`}
            >
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              aria-label={copied ? "복사됨" : "본문 복사"}
              onClick={() => void copyBody()}
              className="inline-flex size-8 items-center justify-center rounded-md border border-black/10 bg-white text-black/55"
            >
              <Copy className="size-4" />
            </button>
          </div>
        </div>
        {copied ? <p className="text-xs text-emerald-600">복사했습니다.</p> : null}
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" className="h-10" disabled={sending} onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="button" className="h-10" disabled={sending} onClick={onSend}>
            {sending ? "발송 중..." : "발송"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
