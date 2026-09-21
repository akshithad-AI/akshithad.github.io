/**
 * AKIRA backend — Cloudflare Worker
 *
 * What this does:
 *  - Receives a request from your website with a "prompt"
 *  - Adds your Anthropic API key (kept secret, never sent to the browser)
 *  - Calls Claude, and sends the generated text back to your website
 *
 * SETUP (see the step-by-step from Claude for full instructions):
 *  1. Create a free Cloudflare account at https://dash.cloudflare.com/sign-up
 *  2. Create a new Worker, paste this whole file in as its code
 *  3. In the Worker's Settings > Variables, add a SECRET (not a plain var)
 *     named ANTHROPIC_API_KEY with your key from console.anthropic.com
 *  4. (Optional but recommended) Add a second secret AKIRA_SHARED_KEY —
 *     any password you make up — to stop random people from finding your
 *     worker's URL and using up your API credits.
 *  5. Deploy. Copy the worker's URL (looks like
 *     https://akira-backend.<your-subdomain>.workers.dev) into
 *     index.html's WORKER_URL constant.
 */

const ALLOWED_ORIGIN = "*"; // once your site is live, change this to
                             // e.g. "https://akshithadharmarathne.com"
                             // to stop other sites from using your worker

const MODEL = "claude-sonnet-5"; // swap to "claude-haiku-4-5-20251001" for
                                  // a cheaper/faster option if you want

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Akira-Key",
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders(),
      });
    }

    // Simple shared-secret check — not bulletproof (it's visible in your
    // site's JS), but stops casual scanning/abuse of the URL.
    if (env.AKIRA_SHARED_KEY) {
      const provided = request.headers.get("X-Akira-Key");
      if (provided !== env.AKIRA_SHARED_KEY) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Bad request" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    const prompt = (body.prompt || "").toString().slice(0, 8000);
    if (!prompt) {
      return new Response(JSON.stringify({ error: "Missing prompt" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    try {
      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        return new Response(
          JSON.stringify({ error: "Upstream error", detail: errText }),
          {
            status: 502,
            headers: { "Content-Type": "application/json", ...corsHeaders() },
          }
        );
      }

      const data = await anthropicRes.json();
      const text = (data.content || [])
        .map((block) => (block.type === "text" ? block.text : ""))
        .filter(Boolean)
        .join("\n");

      return new Response(JSON.stringify({ text }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Worker error", detail: String(err) }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        }
      );
    }
  },
};
