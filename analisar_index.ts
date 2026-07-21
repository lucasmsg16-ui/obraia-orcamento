// ============================================================
// MAR ABERTO ENGENHARIA — Edge Function "analisar" (VERSÃO STREAMING)
// Proxy seguro da IA. Valida a chave, sanitiza o payload, chama a Anthropic em
// modo STREAM (evita timeout 504), repassa o fluxo ao navegador e, ao final,
// desconta 1 crédito e envia evento "mar_credits".
//
// CHANGELOG:
//   - CORS restrito ao domínio oficial (não mais wildcard *)
//   - Payload sanitizado: modelo whitelisted, max_tokens limitado, tamanho máximo
//   - sem_credito substituído por refine_token HMAC (evita chamadas ilimitadas grátis)
//   - Rate-limit da Anthropic (429) retornado com status 429 ao cliente
//   - Headers de segurança em todas as respostas (X-Frame-Options, X-Content-Type-Options)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const NL = String.fromCharCode(10);

// Origens permitidas
const ALLOWED_ORIGINS = [
  "https://marabertoeng.com.br",
  "http://localhost",
  "http://127.0.0.1",
];

function corsHeaders(origin: string | null) {
  const allowed =
    origin && ALLOWED_ORIGINS.some((o) => origin.startsWith(o))
      ? origin
      : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
}

// Headers de segurança adicionados a toda resposta
function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

function jsonResp(obj: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders(origin),
      ...securityHeaders(),
      "content-type": "application/json",
    },
  });
}

function mapErro(e?: string) {
  const m: Record<string, string> = {
    chave_invalida: "Chave invalida.",
    inativo: "Acesso desativado. Fale com o suporte.",
    expirado: "Seu acesso expirou. Renove para continuar.",
    sem_creditos: "Seus creditos acabaram. Renove para continuar.",
  };
  return (e && m[e]) || "Acesso negado.";
}

// Payload sanitization: impede modelos caros, tokens excessivos e payloads gigantes.
const ALLOWED_MODELS = [
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-8",
];
const MAX_PAYLOAD_BYTES = 4500000;  // 4,5MB — comporta vistas completas + ampliações em alta resolução (leitura de cotas)
const MAX_TOKENS_CAP    = 32000;  // claude-sonnet-4-6 suporta até 64K; 32K cobre qualquer projeto real
const MAX_MESSAGES      = 10;

function sanitizePayload(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const model =
    typeof p.model === "string" && ALLOWED_MODELS.includes(p.model)
      ? p.model
      : "claude-sonnet-4-6";
  const maxTokens = Math.min(Math.max(Number(p.max_tokens) || 4096, 256), MAX_TOKENS_CAP);
  const messages = Array.isArray(p.messages) ? p.messages.slice(0, MAX_MESSAGES) : [];
  const system = typeof p.system === "string" ? p.system.slice(0, 60000) : undefined;
  const clean: Record<string, unknown> = { model, max_tokens: maxTokens, messages };
  if (system) clean.system = system;
  if (new TextEncoder().encode(JSON.stringify(clean)).length > MAX_PAYLOAD_BYTES) return null;
  return clean;
}

// HMAC-based refine_token:
// Apos analise PAGA, servidor emite token de curta duracao (15 min).
// Cliente envia na chamada de refinamento; servidor verifica sem debitar credito.
// Token invalido/expirado => analise tratada como normal (debita credito).

const REFINE_TTL_MS = 15 * 60 * 1000;

async function getRefineSecret(): Promise<string> {
  return Deno.env.get("REFINE_SECRET") || Deno.env.get("ANTHROPIC_API_KEY") || "default_secret";
}

async function createRefineToken(chave: string): Promise<string> {
  const secret = await getRefineSecret();
  const exp = Date.now() + REFINE_TTL_MS;
  const payload = `${chave}:${exp}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return btoa(payload) + "." + sigB64;
}

async function verifyRefineToken(chave: string, token: string): Promise<boolean> {
  try {
    const dot = token.indexOf(".");
    if (dot < 0) return false;
    const payloadB64 = token.slice(0, dot);
    const sigB64     = token.slice(dot + 1);
    const payload    = atob(payloadB64);
    const colonIdx   = payload.lastIndexOf(":");
    const tokenChave = payload.slice(0, colonIdx);
    const exp        = parseInt(payload.slice(colonIdx + 1), 10);
    if (tokenChave !== chave) return false;
    if (Date.now() > exp)     return false;
    const secret = await getRefineSecret();
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigBytes = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

// Handler principal
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors   = corsHeaders(origin);
  const sec    = securityHeaders();

  if (req.method === "OPTIONS")
    return new Response("ok", { headers: { ...cors, ...sec } });

  if (req.method !== "POST")
    return jsonResp({ error: "Metodo nao permitido." }, 405, origin);

  try {
    const body = await req.json().catch(() => null);
    if (!body) return jsonResp({ error: "Body JSON invalido." }, 400, origin);

    const chave = typeof body.chave === "string" ? body.chave.trim() : "";
    if (!chave) return jsonResp({ error: "Chave nao informada." }, 401, origin);

    const cleanPayload = sanitizePayload(body.payload);
    if (!cleanPayload)
      return jsonResp({ error: "Payload invalido ou muito grande." }, 400, origin);

    // Token valido = refinamento legitimo (nao debita credito).
    // Token invalido/ausente = analise normal (debita credito).
    const rawToken = typeof body.refine_token === "string" ? body.refine_token : "";
    const isRefinement = rawToken ? await verifyRefineToken(chave, rawToken) : false;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: v, error: ve } = await supabase.rpc("validar_chave", { p_chave: chave });
    if (ve) return jsonResp({ error: "Erro ao validar a chave.", detalhe: ve.message }, 500, origin);
    if (!v || !v.ok) return jsonResp({ error: mapErro(v && v.erro), erro: v && v.erro }, 403, origin);

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) return jsonResp({ error: "Servidor sem chave de IA configurada." }, 500, origin);

    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ ...cleanPayload, stream: true }),
    });

    // Repassa erros da Anthropic (429, 529, etc.) diretamente ao cliente
    if (!aiResp.ok || !aiResp.body) {
      const e = await aiResp.json().catch(() => ({}));
      return jsonResp({ error: "Erro da IA", detalhe: e }, aiResp.status || 500, origin);
    }

    const reader = aiResp.body.getReader();
    const encd   = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const rr = await reader.read();
            if (rr.done) break;
            controller.enqueue(rr.value);
          }

          // Debita credito APENAS para analises principais
          let restantes: number | null = null;
          if (!isRefinement) {
            try {
              const { data: c } = await supabase.rpc("consumir_credito", { p_chave: chave });
              restantes = (c && c.creditos_restantes != null) ? c.creditos_restantes : null;
            } catch (_) {}
          }

          // Gera refine_token para analises pagas (valido 15 min)
          let refineTokenOut: string | null = null;
          if (!isRefinement) {
            try { refineTokenOut = await createRefineToken(chave); } catch (_) {}
          }

          const creditEvt: Record<string, unknown> = {
            type: "mar_credits",
            creditos_restantes: restantes,
          };
          if (refineTokenOut) creditEvt.refine_token = refineTokenOut;

          controller.enqueue(encd.encode(NL + "data: " + JSON.stringify(creditEvt) + NL + NL));
          controller.close();
        } catch (e) {
          try {
            controller.enqueue(encd.encode(
              NL + "data: " + JSON.stringify({ type: "error", error: { message: String(e) } }) + NL + NL
            ));
          } catch (_) {}
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...cors, ...sec, "content-type": "text/event-stream", "cache-control": "no-cache" },
    });
  } catch (e) {
    return jsonResp({ error: String(e) }, 500, origin);
  }
});
