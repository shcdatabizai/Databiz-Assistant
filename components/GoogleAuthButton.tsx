"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** OAuth 클라이언트 ID는 공개 값입니다. */
const GOOGLE_CLIENT_ID = "412561138947-go10qo1tnvou93l8s1lo12pkut2orrgc.apps.googleusercontent.com";

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

type CredentialResponse = { credential?: string };

type PromptNotification = {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  getNotDisplayedReason: () => string;
  getSkippedReason: () => string;
};

type GoogleAccounts = {
  accounts: {
    id: {
      initialize: (config: Record<string, unknown>) => void;
      prompt: (callback?: (notification: PromptNotification) => void) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleAccounts;
  }
}

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("script")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("script"));
    document.head.appendChild(script);
  });
}

async function generateNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = btoa(String.fromCharCode(...bytes));
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  const hashedNonce = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { nonce, hashedNonce };
}

export default function GoogleAuthButton({
  intent = "login",
  onSuccess,
}: {
  intent?: "login" | "signup";
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const nonceRef = useRef("");
  const [error, setError] = useState<string | null>(null);
  const label = intent === "signup" ? "Google 계정으로 가입하기" : "Google 계정으로 로그인";

  async function handleCredential(response: CredentialResponse) {
    if (!response.credential) {
      setError("Google에서 로그인 정보를 받지 못했습니다. 팝업이 차단되지 않았는지 확인해주세요.");
      return;
    }
    const supabase = createClient();
    const exchange = supabase.auth.signInWithIdToken({
      provider: "google",
      token: response.credential,
      nonce: nonceRef.current,
    });
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 20000));
    try {
      const { error: signInError } = await Promise.race([exchange, timeout]);
      if (signInError) {
        setError(signInError.message);
        return;
      }
      if (onSuccess) onSuccess();
      else router.push("/");
      router.refresh();
    } catch {
      setError("Google 로그인 응답이 너무 오래 걸립니다. 잠시 후 다시 시도해주세요.");
    }
  }

  async function handleClick() {
    setError(null);
    try {
      await loadGoogleScript();
      if (!window.google?.accounts?.id) {
        setError("Google 로그인을 열지 못했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      const { nonce, hashedNonce } = await generateNonce();
      nonceRef.current = nonce;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        nonce: hashedNonce,
        ux_mode: "popup",
        auto_select: false,
        use_fedcm_for_prompt: false,
        callback: (response: CredentialResponse) => {
          void handleCredential(response);
        },
      });
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          setError("Google 로그인 창을 열지 못했습니다. 팝업 차단을 해제한 뒤 다시 눌러주세요.");
        }
      });
    } catch {
      setError("Google 로그인을 열지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void handleClick()}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-foreground hover:bg-black/[0.03]"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.964 10.706A5.41 5.41 0 0 1 3.68 9c0-.593.102-1.17.284-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
          />
        </svg>
        {label}
      </button>
      {error && <p className="text-center text-sm text-red-500">{error}</p>}
    </div>
  );
}
