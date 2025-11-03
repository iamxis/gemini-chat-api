// Use 'require' syntax for wider compatibility in serverless environments
const { GoogleGenAI } = require("@google/genai");

// This is the standard entry point for Netlify Functions (CommonJS export)
exports.handler = async (event) => {
    // 1. Check if the request is a POST (or the OPTIONS pre-flight)
    if (event.httpMethod === "OPTIONS") {
        // Explicitly allow the pre-flight check for CORS
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
    
    // We only process the body for POST requests
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    // Safely parse the JSON body
    let requestBody;
    try {
        requestBody = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON format" }) };
    }
    
    const userPrompt = requestBody.prompt;

    // Initialize the client securely
    const ai = new GoogleGenAI({}); 

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", 
            contents: userPrompt,
        });

        // Return the AI's response
        return {
            statusCode: 200,
            body: JSON.stringify({ response: response.text }),
            headers: {
                // Allows your external website to call the function
                'Access-Control-Allow-Origin': '*', 
            }
        };
    } catch (error) {
        console.error("Gemini API Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `Serverless API Error: ${error.message}` }),
        };
    }
};
