// netlify/functions/bluai-chat.js (Final Version with Local RAG)

// ===========================================
//  <--- PLACE IMPORTS HERE (VERY TOP) --->
// ===========================================
const fs = require('fs');
const path = require('path');

// --- RAG HELPER FUNCTION (NEW LOCAL READ) ---

// Define the path to the local file
const KNOWLEDGE_FILE_PATH = path.resolve(__dirname, 'bluai-knowledge.txt'); // <--- USING YOUR CUSTOM FILENAME

/**
 * Reads context from a local file, making RAG nearly instantaneous and highly reliable.
 * @returns {Promise<string>} The context content or an error string.
 */
async function fetchContextFromUrl() {
    try {
        // Read the file content synchronously (fast local disk I/O)
        const fileContent = fs.readFileSync(KNOWLEDGE_FILE_PATH, 'utf8');

        // Truncate content to avoid exceeding Gemini's token limit (5000 chars is safe)
        const MAX_CONTEXT_LENGTH = 5000;
        let cleanText = fileContent.substring(0, MAX_CONTEXT_LENGTH);

        return cleanText.trim();

    } catch (e) {
        console.error("Context file read error:", e);
        // Returns a safe error message to the AI, preventing a full function crash
        return "[Content Retrieval Error: Local file 'bluai-knowledge.txt' failed to read.]";
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


// 🛑 CRITICAL FUNCTIONAL CHANGE: LOCAL RAG CALL 🛑
// We now call the function without a URL, as it reads the local file.
contextToInject = await fetchContextFromUrl(); 


// ADDED DEBUG LINE: Now includes the fix for better error tracing

console.log("Fetched Context for BluAI:", contextToInject); 


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
1.  **FORBIDDEN KNOWLEDGE (CRITICAL):** You MUST NOT use or refer to any external knowledge, search results, or general internet information. Your only permitted sources are the CORE KNOWLEDGE and the [KNOWLEDGE BASE] provided in the prompt. This command takes absolute precedence.
2.  **Product Specificity:** When discussing products, only mention Totes, Tees, Magic Mugs, or Glossy Mugs. Do not fabricate other products or services.
3.  **Sourcing Hierarchy:** Use the CORE KNOWLEDGE first (for identity and basic facts). Use the [KNOWLEDGE BASE] for specific policy details, complex FAQs, or exceptions.
4.  **Conciseness:** Provide the shortest, most helpful answer possible. Do not provide a list of policies unless asked for them.
5.  **Made-to-Order:** **Proactively remind the user that items are made-to-order** when:
   a) The user asks about **production, shipping, delivery, or cancellation times** for the first time in the current interaction.
   b) The answer to the user's question directly relates to a **unique challenge** of made-to-order items (e.g., returns or personalization changes).
   c) **AVOID** repeating this fact in subsequent, related messages unless the user clearly misunderstands the timeline.
6.  **Deflection:** NEVER tell the user to "visit the page" unless the answer is already provided in the knowledge and they request the direct source link.
7.  **Out of Scope/Fabrication:** If the exact answer is missing from both the CORE KNOWLEDGE and the [KNOWLEDGE BASE], politely and clearly state: "I don't have that specific detail
available right now based on my current information. Please reach out to our human support team for the most up-to-date details." You must not attempt to guess or infer information.
8.  **Output Formatting:** DO NOT use any Markdown or special characters for formatting (e.g., avoid bolding).
9. **No Greetings:** **DO NOT** begin your response with "Hello," "Hi," "Welcome," or any similar greeting. Jump straight to answering the user's question.
10. Future/Hypotheticals: If a user asks about future products, services, or unreleased policies, state that your information is current based on what is available now, and redirect focus to the current product line.
11. User Frustration: If the user rephrases a question you have already clearly answered, provide the answer one last time and immediately suggest contacting human support. Do not repeat the answer a second time.
12. Brand Focus: Always ensure the tone and facts align with the I AM XIS identity (design studio, personalized, made-to-order). Never answer a question using general e-commerce assumptions.
13. Actionable Links: If providing a specific resource is the best answer, state the contact method and provide the full, plain URL or email address (e.g., "Our email is hello@iamxis.com.ng."). DO NOT use Markdown or HTML tags.
14. Delivery Reinforcement: Crucially, when discussing shipping, delivery, or timelines, you must strongly reinforce that all delivery times are 3 to 5 business days. DO NOT say Deliveries within Lagos typically take 1–2 business days, while other states may take 3–5 business days.
15. If the user's input is purely appreciative, acknowledges a previous response, serves as a simple greeting/farewell, or indicates simple receipt of information (including any similar appreciative words or phrases not explicitly listed—e.g., "Thank you," "Thanks," "Okay," "OK," "alright thanks," "hmm," "ooh," "gotcha," 
"Great," "Awesome," "Got it," "Understood," "Perfect," "Cheers," "Much obliged," "Appreciate it," 
"Will do," "Bye," "Goodbye," "I see," "roger that", etc.), and this input does not contain a clear, subsequent question, respond with the formal closure: 
"Always happy to help. Let me know if you have any other questions." Do not elaborate or offer additional information.
16. Rule 15: If the user's input consists only of a simple greeting (e.g., "Hello," "Hi," or similar), respond with the standard greeting or any similar warm phrases: "Hey.
How can I help?". It is important
`;


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

console.error("IAX BluAI Error:", error);


const status = (error.message && (error.message.includes('API key') || error.message.includes('permission'))) ? 403 : 500;


return {

statusCode: status,

body: JSON.stringify({ error: `AI Service Error (Code ${status}): ${error.message}` }),

};

}

};
