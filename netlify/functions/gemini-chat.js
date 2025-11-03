// netlify/functions/gemini-chat.js (Final Standardized Imports with Cheerio RAG)

// 🛑 STANDARD IMPORTS AT TOP OF FILE 🛑
const cheerio = require('cheerio'); 
const { GoogleGenAI } = require("@google/genai"); 


// --- RAG HELPER FUNCTION ---
async function fetchContextFromUrl(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        }); 
        
        if (response.status !== 200) {
            console.error(`Failed to fetch ${url}. Status: ${response.status}`);
            return `[Content Retrieval Error: Server returned status ${response.status}.]`;
        }
        
        const rawHtml = await response.text();
        
        // 🛑 CHEERIO IMPLEMENTATION 🛑
        const $ = cheerio.load(rawHtml);
        
        // CRITICAL: You are using the selector '#7996'. Make SURE this is the 
        // correct HTML element ID for the content you want to retrieve.
        const policyContainer = $('#7996'); 

        let cleanText = policyContainer.text();
        cleanText = cleanText.replace(/\s\s+/g, ' ').trim();
        
        const MAX_CONTEXT_LENGTH = 5000;
        cleanText = cleanText.substring(0, MAX_CONTEXT_LENGTH);
        
        return cleanText.trim();

    } catch (e) {
        console.error("Context fetch error:", e);
        return "[Content Retrieval Error: Network issue or invalid Cheerio selector.]";
    }
}
// --- END HELPER FUNCTION ---


exports.handler = async (event) => {
    // 1. Initialize the client securely (Now outside the dynamic import block)
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
    
    // RAG LOGIC:
    if (userPrompt.toLowerCase().includes("return") || userPrompt.toLowerCase().includes("refund")) {
        contextToInject = await fetchContextFromUrl("https://iamxis.com.ng/returns/"); 
    } else if (userPrompt.toLowerCase().includes("shipping") || userPrompt.toLowerCase().includes("delivery")) {
        contextToInject = await fetchContextFromUrl("https://iamxis.com.ng/shipping/"); 
    } 

    // ADDED DEBUG LINE
    console.log("Fetched Context for Gemini:", contextToInject); 

    // 🛑 Construct the FINAL Prompt 🛑
    let finalPrompt = userPrompt;

    if (contextToInject.length > 0 && !contextToInject.startsWith('[Content Retrieval Error:')) {
        // Embed the focused, cleaned content into the prompt
        finalPrompt = `
        [START CONTEXT: FOCUSED KNOWLEDGE BASE]
        The following text was retrieved from the site's official policy page. Answer the user's question by citing this specific policy text.
        ${contextToInject}
        [END CONTEXT]
        
        User Question: ${userPrompt}
        `;
    }
    
    // 🛑 Set the System Instruction (Brand Persona) 🛑
    const brandPersona = `You are "Blu," a friendly, expert customer service representative for I AM XIS, an e-commerce brand specializing in high-quality, eco-friendly made-to-order
    personalized items. Your primary goals are to answer FAQs, provide product details, and maintain a professional, helpful, and concise tone. 
    Rules: 1. Do not fabricate facts. 2. Always base your response on the provided context. 3. If information is missing, suggest checking the official product page.`;


    // 6. API Call Logic
    try { 
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", 
            contents: finalPrompt,
            config: {
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
