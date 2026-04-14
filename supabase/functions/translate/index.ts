import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { text, from, to } = await req.json()
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY")

    const directionMap: Record<string, string> = {
      "ru-es": "Переведи с русского на испанский (Испания). Стиль: профессиональный но дружелюбный, tuteo. Только перевод, ничего больше.",
      "es-ru": "Переведи с испанского на русский. Только перевод, ничего больше.",
    }

    const direction = `${from}-${to}`
    const systemPrompt = directionMap[direction] || directionMap["ru-es"]

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: text }],
        system: systemPrompt,
      }),
    })

    const data = await response.json()
    const translated = data.content?.[0]?.text || ""

    return new Response(
      JSON.stringify({ translated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
