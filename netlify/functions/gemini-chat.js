// netlify/functions/gemini-chat.js (Using Dynamic Import for ES Module compatibility)

// We no longer require the library here. It is loaded inside the handler.

exports.handler = async (event) => {
    // Dynamically import the GoogleGenAI class inside the handler function.
    // This is the fix recommended by the error log (using dynamic import()).
    const { GoogleGenAI } = await import("@google/genai"); 
    
    // Initialize the client securely (must be done after the import)
    // Initialize the client securely
   // 🛑 FIX: Explicitly read the key from Netlify's environment variable (process.env)
   const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY 
   });

    // 🛑 1. HANDLE OPTIONS (CORS PRE-FLIGHT) FIRST 🛑
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            body: '' // No content needed for a pre-flight success
        };
    }
    
    // 2. Only proceed if it is a POST request
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    // --- Start POST Request Logic ---
    let requestBody;
    try {
        requestBody = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON format" }) };
    }
    
    const userPrompt = requestBody.prompt;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", 
            contents: userPrompt,
        });

        // 3. Return the AI's response (with CORS header for the main request)
        return {
            statusCode: 200,
            body: JSON.stringify({ response: response.text }),
            headers: {
                'Access-Control-Allow-Origin': '*', 
            }
        };
    } catch (error) {
        console.error("Gemini API Error:", error);
        
        // Return a detailed error if the API call fails
        const status = (error.message && (error.message.includes('API key') || error.message.includes('permission'))) ? 403 : 500;
        
        return {
            statusCode: status,
            body: JSON.stringify({ error: `AI Service Error (Code ${status}): ${error.message}` }),
        };
    }
};
