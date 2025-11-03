// netlify/functions/gemini-chat.js (Final Version with RAG and System Instruction)

// --- RAG HELPER FUNCTION ---
// WARNING: Netlify's environment typically supports the native 'fetch', 
// but if not, you must install 'node-fetch' in your package.json.
async function fetchContextFromUrl(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to fetch ${url}. Status: ${response.status}`);
            return `[Content Retrieval Error: Page not found or unreachable.]`;
        }
        
        const rawHtml = await response.text();
        
        // --- Crude HTML Cleanup (for simplicity) ---
        // Removes scripts, styles, and HTML tags to get readable text.
        let cleanText = rawHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                               .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                               .replace(/<[^>]*>/g, '');
        
        // Truncate content to avoid exceeding Gemini's token limit (5,000 chars is safe)
        const MAX_CONTEXT_LENGTH = 5000;
        cleanText = cleanText.substring(0, MAX_CONTEXT_LENGTH);
        
        return cleanText.trim();

    } catch (e) {
        console.error("Context fetch error:", e);
        return "[Content Retrieval Error: Network issue.]";
    }
}
// --- END HELPER FUNCTION ---


exports.handler = async (event) => {
    // 1. Dynamic Import
    const { GoogleGenAI } = await import("@google/genai"); 
    
    // 2. Initialize the client securely
    const ai = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY 
    });
    
    // 3. HANDLE OPTIONS (CORS Pre-Flight Check)
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
    
    // --- BRAND TRAINING LOGIC ---
    let contextToInject = "";
    
    // 🛑 RAG LOGIC: Check User Intent and Define Context URL 🛑
    // REPLACE these URLs with the actual links on your site!
    if (userPrompt.toLowerCase().includes("return") || userPrompt.toLowerCase().includes("refund")) {
        contextToInject = await fetchContextFromUrl("https://iamxis.com.ng/returns/"); 
    } else if (userPrompt.toLowerCase().includes("shipping") || userPrompt.toLowerCase().includes("delivery")) {
        contextToInject = await fetchContextFromUrl("https://iamxis.com.ng/shipping/"); 
    } 
    // Add more conditions here for "FAQ", "sizing", etc.
 
    // After the RAG Logic block where contextToInject is set:
    console.log("Fetched Context for Gemini:", contextToInject); // <-- ADD THIS LINE

    // 🛑 Construct the FINAL Prompt 🛑
    let finalPrompt = userPrompt;

    if (contextToInject.length > 0) {
        // Embed the fetched content into the prompt
        finalPrompt = `
        [START KNOWLEDGE BASE FROM SITE]
        ${contextToInject}
        [END KNOWLEDGE BASE]
        
        Based ONLY on the CONTEXT provided above and your general knowledge about e-commerce, answer the user's question concisely.
        User Question: ${userPrompt}
        `;
    }
    
    // 🛑 Set the System Instruction (Brand Persona) 🛑
    const brandPersona = `You are "Blu," a friendly, expert customer service representative for I AM XIS, an e-commerce brand specializing in high-quality, eco-friendly made-to-order
    personalized items. 
    Your primary goals are to answer FAQs, provide product details, and maintain a professional, helpful, and concise tone. 
    Rules: 1. Do not fabricate facts. 2. Always refer to the site's official policies provided in the context. 3. If information is missing, suggest checking the official product page.`;


    // 6. API Call Logic
    try { 
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", 
            // Use the augmented prompt
            contents: finalPrompt,
            config: {
                // Set the fixed persona and rules
                systemInstruction: brandPersona, 
            },
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
        
        const status = (error.message && (error.message.includes('API key') || error.message.includes('permission'))) ? 403 : 500;
        
        return {
            statusCode: status,
            body: JSON.stringify({ error: `AI Service Error (Code ${status}): ${error.message}` }),
        };
    }
};
