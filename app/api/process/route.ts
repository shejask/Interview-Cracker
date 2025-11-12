import { NextResponse } from "next/server";

// This route calls Google's Gemini API
// using an API key set in the environment variable `GOOGLE_API_KEY`.
// Do NOT commit API keys into source control. Provide the key via
// `.env.local` or your host's secrets manager.

export async function POST(req: Request) {
  try {
    // Check if API key is set
    if (!process.env.GOOGLE_API_KEY) {
      console.error("Missing GOOGLE_API_KEY environment variable");
      return NextResponse.json(
        { error: "Server misconfiguration: GOOGLE_API_KEY is not set" },
        { status: 500 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { details, transcript } = body;

    // Validate required fields
    if (!details || !transcript) {
      return NextResponse.json(
        { error: "Missing details or transcript" },
        { status: 400 }
      );
    }

    // Construct prompt for Gemini
    const prompt = `You are an expert interview coach. Candidate details:\n${details}\nUser answer/transcript:\n${transcript}\n\nGenerate a short ideal response (max 80 words).`;

    const key = process.env.GOOGLE_API_KEY;
    
    // Try Gemini models (newer API) - try versioned models first, then fall back to non-versioned
    const geminiModels = ["gemini-2.0-flash", "gemini-1.5-pro-001", "gemini-1.5-flash-001", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-pro"];
    let lastError: any = null;
    let answer: string | undefined;

    for (const modelId of geminiModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`;

      try {
        const googleResp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: prompt
              }]
            }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 256,
            }
          }),
        });

        const text = await googleResp.text();
        let json: any = null;
        
        // Try to parse response as JSON
        if (text && text.length > 0) {
          try {
            json = JSON.parse(text);
          } catch (parseErr) {
            console.error("Failed to parse JSON:", { parseErr, text });
            if (!googleResp.ok) {
              lastError = { status: googleResp.status, text, json: null, modelId };
              continue;
            }
          }
        }

        // Handle non-OK responses
        if (!googleResp.ok) {
          lastError = { status: googleResp.status, json, text, modelId };
          console.error(`Model ${modelId} failed:`, lastError);
          
          if (googleResp.status === 404 || googleResp.status === 400) {
            // Model not found or not available, try next one
            continue;
          }
          
          const message = json?.error?.message || text || `HTTP ${googleResp.status}`;
          return NextResponse.json({ error: message }, { status: googleResp.status });
        }

        // Extract answer from Gemini response format
        if (json?.candidates?.[0]?.content?.parts?.[0]?.text) {
          answer = json.candidates[0].content.parts[0].text;
        } else if (json?.candidates?.[0]?.text) {
          answer = json.candidates[0].text;
        } else if (text && text.length > 0) {
          answer = text;
        }

        if (answer) {
          console.log(`Success with model: ${modelId}`);
          break; // Success!
        }
        
        // Record unsuccessful attempt and try next
        lastError = { status: 200, json, text, modelId };
      } catch (fetchErr) {
        console.error("Fetch error for model", modelId, fetchErr);
        lastError = fetchErr;
        continue;
      }
    }

    // If no answer was obtained from any model
    if (!answer) {
      console.error("No successful response from any Gemini model", { 
        lastError, 
        tried: geminiModels 
      });
      
      if (lastError && lastError.status) {
        const message = lastError.json?.error?.message || 
                       lastError.text || 
                       `HTTP ${lastError.status}`;
        return NextResponse.json({ 
          error: `API Error: ${message}. Please ensure the Generative Language API is enabled at https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com` 
        }, { status: lastError.status });
      }
      
      return NextResponse.json(
        {
          error:
            "Could not connect to any Gemini model. Tried: " +
            geminiModels.join(", ") +
            ". Please enable the Generative Language API at https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com and ensure your API key has proper permissions.",
        },
        { status: 500 }
      );
    }

    // Return successful response
    return NextResponse.json({ answer });
    
  } catch (error: any) {
    console.error("Generative API error:", {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
    });
    return NextResponse.json(
      { error: error?.message || "Unknown error" }, 
      { status: 500 }
    );
  }
}