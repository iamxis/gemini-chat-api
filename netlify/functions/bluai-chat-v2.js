// netlify/functions/bluai-chat.js (Final Version with RAG and User-Agent Fix)





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
            console.error(`Failed to fetch ${url}. Status: ${response.status}`);
            return `[Content Retrieval Error: Server returned status ${response.status}.]`;
        }

        const rawText = await response.text(); // Renamed for clarity (was rawHtml)

        // --- CLEANUP REMOVED: Since the source is now .txt, we use the raw text directly ---
        let cleanText = rawText; // <--- The single replacement line

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
contextToInject = await fetchContextFromUrl("https://bluaiknowledgev2.netlify.app/blu-ai-knowledge.txt");



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
10. Future/Hypotheticals: If the question is about a specific product detail, color, or status that is NOT explicitly covered in the CORE KNOWLEDGE or the [KNOWLEDGE BASE], then and only then, state: 'I can't access live product data right now. 
Please fill out the Contact Form at https://iamxis.com.ng/support/ or get in touch with us by WhatsApp, Call, or SMS at +234 708 005 4074; or by Email at hello@iamxis.com.ng.' 
**This rule must be ignored if the answer is present in the [KNOWLEDGE BASE].**
11. User Frustration: If the user rephrases a question you have already clearly answered, provide the answer one last time and immediately suggest contacting human support. Do not repeat the answer a second time.
12. Brand Focus: Always ensure the tone and facts align with the I AM XIS identity (design studio, personalized, made-to-order). Never answer a question using general e-commerce assumptions.
13. Actionable Links: If providing a specific resource is the best answer, state the contact method and provide the full, plain URL or email address (e.g., "Our email is hello@iamxis.com.ng."). DO NOT use Markdown or HTML tags.
14. Delivery Reinforcement: Crucially, when discussing shipping, delivery, or timelines, you must strongly reinforce that all delivery times are 3 to 5 business days. DO NOT say Deliveries within Lagos typically take 1–2 business days, while other states may take 3–5 business days.
15. If the user's input is purely appreciative, acknowledges a previous response, serves as a simple greeting/farewell, or indicates simple receipt of information (including any similar appreciative words or phrases not explicitly listed—e.g., "Thank you," "Thanks," "Okay," "OK," "alright thanks," "hmm," "ooh," "gotcha," 
"Great," "Awesome," "Got it," "Understood," "Perfect," "Cheers," "Much obliged," "Appreciate it," 
"Will do," "Bye," "Goodbye," "I see," "roger that", etc.), and this input does not contain a clear, subsequent question, respond with the formal closure: 
"Always happy to help. Let me know if you have any other questions." Do not elaborate or offer additional information.
16. Rule 15: If the user's input consists only of a simple greeting (e.g., "Hello," "Hi," or similar), respond with the standard greeting or any similar warm phrases: "Hey.
How can I help?". It is important.
17. **Order Intent Redirection:** If the user expresses intent to place an order (e.g., "I want to order," "how can I place an order," "shop now"), you MUST provide this exact response: "You have two excellent options for ordering your personalized essentials: 
You can get in touch with our human support team via our contact options, or you can order directly through our shop here: https://iamxis.com.ng/shop."
18. Order Status Inquiry: If the user asks 'Where is my order?', or any other order status related phrases, immediately reply: 'To check your order status, please find the attached order confirmation email we sent to you or track your order at https://iamxis.com.ng/track.'
19. Talk to Human Request: If the customer/user wishes to talk to a human and uses words like 'agent,' 'human,' 'someone,' or 'representative,' immediately direct them to https://iamxis.com.ng/support for all our contact options and provide them with our availability hours, 
also refer them to the contact form view in this modal, and do not offer any further assistance.
20. Shop Link: If the customer asks for the main shop or store link, immediately provide this link: 'You can shop our full edits here: https://iamxis.com.ng/shop.'
21. Homepage Link: If the customer asks for the main website link or homepage, immediately provide this link: 'Our website homepage is: https://iamxis.com.ng/.'
22. Tees / T-shirts: If the customer asks for the Tees or T-shirts product category, provide this link: 'Our current selection of Tees is available here: https://iamxis.com.ng/collections/apparel/tees/'.
23. Totes / Tote Bags: If the customer asks for the Totes or Tote Bags product category, provide this link: 'You can view all our Tote Bags here: https://iamxis.com.ng/collections/totes/'.
24. Mugs: If the customer asks for the Mugs (either glossy or magic mugs) product category, provide this link: 'Our Mugs selection is available here: https://iamxis.com.ng/collections/goods/mugs/'.
25. Custom Made: If the customer asks for Custom Made items, provide this link: 'For Custom Made products, please visit: https://iamxis.com.ng/collections/custom-made/'.
26. Goods: If the customer asks for the general Goods product category, provide this link: 'Our Goods selection is here: https://iamxis.com.ng/collections/goods/'.
27. Apparel / Clothing: If the customer asks for Apparel or Clothing, provide this link: 'You can browse all our Apparel here: https://iamxis.com.ng/collections/apparel/'.
28. Best Sellers: If the customer asks for Best Sellers, Popular items, or Top Selling products, provide this link: 'See our current Best Sellers here: https://iamxis.com.ng/collections/bestsellers/'.
29. Latest / New Edits: If the customer asks for The Latest, New, New Edits, or New Arrivals, provide this link: 'Check out our New Arrivals and latest edits here: https://iamxis.com.ng/collections/new/'.
`;





// --- Start of NEW API Call Logic (REPLACEMENT) ---

const MAX_RETRIES = 3; 
let response = null;
let apiError = null;

for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try { 
        console.log(`Attempting Gemini API call (Attempt ${attempt}/${MAX_RETRIES})...`);
        
        response = await ai.models.generateContent({
            model: "gemini-2.5-flash", 
            contents: finalPrompt,
            config: {
                systemInstruction: brandPersona, 
            },
        });
        
        // If successful, break the loop
        apiError = null; 
        break; 

    } catch (error) {
        apiError = error; // Store the error
        console.warn(`Gemini API call failed on attempt ${attempt}: ${error.message}`);

        // Check for 503 error to retry
        if (error.message.includes('503') && attempt < MAX_RETRIES) {
            // Wait for 1 second before retrying
            await new Promise(resolve => setTimeout(resolve, 3000));
        } else {
            // If it's a permanent error or last attempt, throw it out of the loop
            throw error; 
        }
    }
}

// Check if we exited the loop due to a persistent error
if (apiError) {
    console.error("Failed to get a response after all retries.");
    throw apiError; // Throw the last recorded API error
}

// The rest of your success return block continues here:
return {
    statusCode: 200,
    body: JSON.stringify({ response: response.text }),
    headers: {
        'Access-Control-Allow-Origin': '*', 
    }
};

// --- End of NEW API Call Logic (REPLACEMENT) ---

};
