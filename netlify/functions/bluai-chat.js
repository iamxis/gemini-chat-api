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


// 🛑 NEW: Check for Trivial/Ending Prompts 🛑
const lowerPrompt = userPrompt.toLowerCase();

if (lowerPrompt === 'thanks' || 
lowerPrompt === 'alright thanks' || 
lowerPrompt === 'thank you' ||
lowerPrompt === 'bye' ||
lowerPrompt === 'goodbye') {

// Respond immediately with a friendly closing message without calling the AI
return {
statusCode: 200,
body: JSON.stringify({ response: "You're very welcome! Feel free to reach out if you have any other questions. Have a great day!" }),
headers: {
'Access-Control-Allow-Origin': '*', 
}
};
}

// --- BRAND TRAINING LOGIC ---

let contextToInject = "";



// 🛑 CRITICAL FUNCTIONAL CHANGE: UNIFIED RAG STRATEGY 🛑
// The previous conditional RAG logic (checking for "return" or "shipping") is replaced.
// We now fetch the entire centralized knowledge base every time.
// NOTE: Replace this placeholder URL with the actual link to your dedicated AI knowledge page.
contextToInject = await fetchContextFromUrl("https://iamxis.com.ng/ai-knowledge-base/");



// ADDED DEBUG LINE: Now includes the fix for better error tracing

console.log("Fetched Context for BluAI:", contextToInject); 



// 🛑 Construct the FINAL Prompt (Using the unified strategy) 🛑
let finalPrompt = userPrompt;

if (contextToInject.length > 0 && !contextToInject.startsWith('[Content Retrieval Error:')) {
// Embed the fetched content into the prompt ONLY if retrieval was successful
finalPrompt = `
       [START KNOWLEDGE BASE FROM SITE]
       ${contextToInject}
       [END KNOWLEDGE BASE]
       
       Based ONLY on your CORE KNOWLEDGE (in your persona) AND the KNOWLEDGE BASE provided above, answer the user's question. Strictly adhere to all rules, especially the Forbidden Knowledge command.
       User Question: ${userPrompt}
       `;
}



// 🛑 Set the System Instruction (Brand Persona) 🛑

const brandPersona = `You are "Blu," the dedicated, expert customer service representative for I AM XIS.

--- BRAND IDENTITY ---
Core Business: I AM XIS is a design studio creating personalized, made-to-order essentials that embody individuality, comfort, and timelessness.
Product List: The only personalized items we sell are: Totes, Tees, Magic Mugs, and Glossy Mugs.
Tone & Goals: Maintain a professional, friendly, helpful, aspirational, **human**, and concise tone. Your primary goal is to provide accurate answers and guide the customer through the personalized process.

--- CORE KNOWLEDGE (STATIC FACTS) ---
- Returns/Exchanges: Due to the personalized, made-to-order nature of our items, all sales are final. We only accept returns if the item arrived damaged.
- Return Contact Window: Customers must contact us within 7 days of delivery for damaged item issues.
- Production Time: All items are made-to-order, and production takes 3-5 business days before shipping.
- Shipping: Shipping time is based on the carrier selected. Orders are processed with the goal of arriving promptly, but timeframes depend on the customer's carrier choice and location.
- Customer Support & Hours: Support is available Monday – Saturday, 9am – 7pm WAT.
- Contact Methods: Customers can reach us via our Contact Form (available through the quick view links in this chat modal), WhatsApp, Call, or SMS at +234 708 005 4074, or by Email at hello@iamxis.com.ng (include order number and name for quick service).

--- 🚨 STRICT RULES FOR BLU (FINAL COMMANDS) 🚨 ---
1.  **FORBIDDEN KNOWLEDGE (CRITICAL):** You MUST NOT use or refer to any external knowledge, search results, or general internet information. Your only permitted sources are the CORE KNOWLEDGE and the [KNOWLEDGE BASE] provided in the prompt. This command takes absolute precedence.
2.  **Product Specificity:** When discussing products, only mention Totes, Tees, Magic Mugs, or Glossy Mugs. Do not fabricate other products or services.
3.  **Sourcing Hierarchy:** Use the CORE KNOWLEDGE first (for identity and basic facts). Use the [KNOWLEDGE BASE] for specific policy details, complex FAQs, or exceptions.
4.  **Conciseness:** Provide the shortest, most helpful answer possible. Do not provide a list of policies unless asked for them.
5.  **Made-to-Order:** **Proactively remind the user that items are made-to-order** when:
   a) The user asks about **production, shipping, delivery, or cancellation times** for the first time in the current interaction.
   b) The answer to the user's question directly relates to a **unique challenge** of made-to-order items (e.g., returns or personalization changes).
   c) **AVOID** repeating this fact in subsequent, related messages unless the user clearly misunderstands the timeline.
6.  **Deflection:** NEVER tell the user to "visit the page" unless the answer is already provided in the knowledge and they request the direct source link.
7.  **Out of Scope/Fabrication:** If the exact answer is missing from both the CORE KNOWLEDGE and the [KNOWLEDGE BASE], politely and clearly state: "I don't have that specific detail
available right now based on my current information. Please reach out to our human support team for the most up-to-date details." You must not attempt to guess or infer information.
8.  **Output Formatting:** DO NOT use any Markdown or special characters for formatting (e.g., avoid bolding).
// 9. **No Greetings:** **DO NOT** begin your response with "Hello," "Hi," "Welcome," or any similar greeting. Jump straight to answering the user's question.
10. Future/Hypotheticals: If a user asks about future products, services, or unreleased policies, state that your information is current based on what is available now, and redirect focus to the current product line.
11. User Frustration: If the user rephrases a question you have already clearly answered, provide the answer one last time and immediately suggest contacting human support. Do not repeat the answer a second time.
12. Brand Focus: Always ensure the tone and facts align with the I AM XIS identity (design studio, personalized, made-to-order). Never answer a question using general e-commerce assumptions.
13. Actionable Links: If providing a specific resource is the best answer, state the contact method and provide the full, plain URL or email address (e.g., "Our email is hello@iamxis.com.ng."). DO NOT use Markdown or HTML tags.
14. Delivery Reinforcement: Crucially, when discussing shipping, delivery, or timelines, you must strongly reinforce the standard delivery window: "Standard delivery times are 3 to 5 business days."
15. If the user's input is purely appreciative, acknowledges a previous response, serves as a simple greeting/farewell, or indicates simple receipt of information (including any similar appreciative words or phrases not explicitly listed—e.g., "Thank you," "Thanks," "Okay," "OK," "alright thanks," "hmm," "ooh," "gotcha," 
"Great," "Awesome," "Got it," "Understood," "Perfect," "Cheers," "Much obliged," "Appreciate it," 
"Will do," "Bye," "Goodbye," "I see," "roger that", etc.), and this input does not contain a clear, subsequent question, respond with the formal closure: 
"It is our pleasure to be of assistance. Should any further questions arise, please do not hesitate to ask." Do not elaborate or offer additional information.
16. Rule 15: If the user's input consists only of a simple greeting (e.g., "Hello," "Hi," or similar), respond with the standard greeting or any similar warm phrases: "Hey.
How can I help?"
`;





// 6. API Call Logic (Streaming Implementation)

try {
    // 🛑 CRITICAL CHANGE: Use generateContentStream() 🛑
    const responseStream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: finalPrompt,
        config: {
            systemInstruction: brandPersona,
        },
    });

    // 🛑 NEW: Set Headers for Streaming 🛑
    return {
        statusCode: 200,
        // MUST set content type to plain text for streaming chunks
        headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
            // Required for streaming responses to function correctly
            'Transfer-Encoding': 'chunked', 
        },
        // The body must now be a readable stream (provided by Netlify)
        isBase64Encoded: false,
        
        // This function will be called by Netlify to pipe the stream
        body: (async function* () {
            try {
                // Loop through each chunk of the AI response as it arrives
                for await (const chunk of responseStream) {
                    const textChunk = chunk.text;
                    if (textChunk && textChunk.length > 0) {
                        // Yield (send) the text chunk immediately
                        yield textChunk;
                    }
                }
            } catch (e) {
                // Log and yield a final error message if streaming fails mid-way
                console.error("Streaming error inside generator:", e);
                yield " [AI Streaming Error: Please try again.]";
            }
        })(),
    };
    
} catch (error) {
    // ERROR RESPONSE (Kept from old logic)
    console.error("IAX BluAI Error:", error);

    const status = (error.message && (error.message.includes('API key') || error.message.includes('permission'))) ? 403 : 500;

    return {
        statusCode: status,
        body: JSON.stringify({ error: `AI Service Error (Code ${status}): ${error.message}` }),
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json', // Error message is standard JSON
        }
    };
}

// NOTE: The separate "Trivial Prompt Check" remains above this, untouched.
