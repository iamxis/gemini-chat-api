// netlify/functions/gemini-chat.js (Final attempt with corrected flow)

exports.handler = async (event) => {
    // 1. Dynamic Import (Must be first)
    const { GoogleGenAI } = await import("@google/genai"); 
    
    // 🛑 TEMPORARY: PASTE YOUR RAW API KEY HERE 🛑
    const TEMPORARY_API_KEY = "AIzaSyCEd7k0YH2JC5__YK_tWCDdQvREEsufOUg"; 
    
    // 2. Initialize the client
    const ai = new GoogleGenAI({ 
        apiKey: TEMPORARY_API_KEY 
    }); 
    
    // 3. HANDLE OPTIONS (CORS PRE-FLIGHT)
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            body: ''
        };
    }
    
    // 4. Handle non-POST methods
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    // 5. Parse Request Body
    let requestBody;
    try {
        requestBody = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON format" }) };
    }
    
    const userPrompt = requestBody.prompt;

    // 6. API Call Logic (Wrapped in try...catch)
    try { 
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", 
            contents: userPrompt,
        });

        // SUCCESS RESPONSE
        return {
            statusCode: 200,
            body: JSON.stringify({ response: response.text }),
            headers: {
                'Access-Control-Allow-Origin': '*', 
            }
        };
    } catch (error) {
        // ERROR RESPONSE
        console.error("Gemini API Error:", error);
        
        // This catch handles API errors (like invalid key or model fail)
        const status = (error.message && (error.message.includes('API key') || error.message.includes('permission'))) ? 403 : 500;
        
        return {
            statusCode: status,
            body: JSON.stringify({ error: `AI Service Error (Code ${status}): ${error.message}` }),
        };
    } // <-- End of API call try...catch block

}; // <-- End of exports.handler
