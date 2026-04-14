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
    const { messages, clientName, instruction } = await req.json()
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY")

    // Build conversation context
    const context = messages.map((m: any) => {
      const role = m.role === "client" ? "Cliente" : "Tú (Jane/Denis)"
      return `${role}: ${m.text}`
    }).join("\n")

    const systemPrompt = `Eres un asistente de marketing para salones de belleza en España. Tu nombre es Denis, fundador de Amity AI.

Tu tarea: el usuario (Denis) te da instrucciones en ruso sobre qué responder al cliente. Tú escribes el mensaje final en español.

Reglas:
- Escribe SOLO el mensaje en español que se enviará al cliente. Nada más.
- Estilo: profesional pero cercano, tuteo, amigable
- No añadas saludos ni despedidas a menos que Denis lo pida
- Mantén el tono natural, como un mensaje real de WhatsApp
- No uses lenguaje excesivamente formal

Contexto de la conversación con ${clientName}:
${context}

Denis te dará instrucciones en ruso sobre qué escribir. Genera el mensaje en español.
Después del mensaje en español, en una nueva línea escribe "---RU---" y luego la traducción al ruso del mensaje que generaste.`

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
        system: systemPrompt,
        messages: [{ role: "user", content: instruction }],
      }),
    })

    const data = await response.json()
    const fullText = data.content?.[0]?.text || ""

    // Split Spanish and Russian parts
    const parts = fullText.split("---RU---")
    const es = parts[0]?.trim() || fullText.trim()
    const ru = parts[1]?.trim() || ""

    return new Response(
      JSON.stringify({ es, ru }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
