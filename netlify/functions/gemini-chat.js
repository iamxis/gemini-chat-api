// netlify/functions/gemini-chat.js (Final Version with RAG and User-Agent Fix)



// --- RAG HELPER FUNCTION ---

async function fetchContextFromUrl(url) {

    try {

        // 🛑 FIX: Added User-Agent header to bypass potential 503 firewalls/security checks

        const response = await fetch(url, {

            headers: {

                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'

            }

        }); 

        

        if (response.status !== 200) {

            // Updated error message to be more specific for debugging

            console.error(`Failed to fetch ${url}. Status: ${response.status}`);

            return `[Content Retrieval Error: Server returned status ${response.status}.]`;

        }

        

        const rawHtml = await response.text();

        

        // --- Crude HTML Cleanup (for simplicity) ---

        let cleanText = rawHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')

                               .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')

                               .replace(/<[^>]*>/g, '');

        

        // Truncate content to avoid exceeding Gemini's token limit

        const MAX_CONTEXT_LENGTH = 5000;

        cleanText = cleanText.substring(0, MAX_CONTEXT_LENGTH);

        

        return cleanText.trim();



    } catch (e) {

        console.error("Context fetch error:", e);

        return "[Content Retrieval Error: Network issue (e.g., DNS or Timeout).]";

    }

}

// --- END HELPER FUNCTION ---





// ... (The fetchContextFromUrl function remains unchanged above this point) ...

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
    
    // 🛑 HISTORY CHANGE 1: DESTRUCTURE HISTORY 🛑
    // Now receiving the history array from the client
    const userPrompt = requestBody.prompt;
    const chatHistory = requestBody.history || []; // Safely get history or default to empty array
    
    
    // 🛑 Set the System Instruction (Brand Persona - Moved for Chat API) 🛑
    const brandPersona = `You are "Blu," a friendly, expert customer service representative for I AM XIS, an e-commerce brand specializing in high-quality, eco-friendly made-to-order
    personalized items. 
    Your primary goals are to answer FAQs, provide product details, and maintain a professional, helpful, and concise tone. 
    Rules: 1. Do not fabricate facts. 2. Always refer to the site's official policies provided in the context. 3. If information is missing, suggest checking the official product page.`;


    // --- BRAND TRAINING LOGIC ---
    let contextToInject = "";
    
    // RAG LOGIC: Check User Intent and Define Context URL 
    if (userPrompt.toLowerCase().includes("return") || userPrompt.toLowerCase().includes("refund")) {
        contextToInject = await fetchContextFromUrl("https://iamxis.com.ng/returns/"); 
    } else if (userPrompt.toLowerCase().includes("shipping") || userPrompt.toLowerCase().includes("delivery")) {
        contextToInject = await fetchContextFromUrl("https://iamxis.com.ng/shipping/"); 
    } 

    console.log("Fetched Context for Gemini:", contextToInject); 

    // Construct the FINAL Prompt with RAG Context 
    let ragMessage = userPrompt; 

    if (contextToInject.length > 0 && !contextToInject.startsWith('[Content Retrieval Error:')) {
        // Embed the fetched content into the PROMPT of the current turn
        ragMessage = `
        [START KNOWLEDGE BASE FROM SITE]
        ${contextToInject}
        [END KNOWLEDGE BASE]
        
        Based ONLY on the CONTEXT provided above and your general knowledge about e-commerce, answer the user's question concisely.
        User Question: ${userPrompt}
        `;
    }
    
    // 6. API Call Logic (Using Chat Service for History)
    try { 
        // 🛑 HISTORY CHANGE 2: USE ai.chats.create 🛑
        // Initialize the chat session with the full history and the system instruction
        const chat = ai.chats.create({
            model: "gemini-2.5-flash",
            history: chatHistory, // <-- THIS IS THE KEY TO HISTORY
            config: {
                systemInstruction: brandPersona, // System instruction goes in config here
            },
        });

        // 🛑 HISTORY CHANGE 3: USE chat.sendMessage 🛑
        // Send the RAG-augmented prompt as the current message
        const response = await chat.sendMessage({ message: ragMessage });

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
