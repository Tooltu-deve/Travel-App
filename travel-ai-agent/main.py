"""
FastAPI Server for Travel AI Agent - Companion Mode
=================================================
REST API endpoint for NestJS backend to interact with the AI Companion
Focus on real-time travel assistance during trips.

Endpoints:
- POST /chat - Real-time travel companion chat
- POST /reset - Reset conversation
- GET /health - Health check
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
from contextlib import asynccontextmanager
import uvicorn
import logging
from datetime import datetime

from agent_new import TravelCompanion


# =====================================
# LIFESPAN EVENTS (FastAPI v0.93+)
# =====================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown"""
    # Startup
    logging.basicConfig(level=logging.INFO)
    logging.info("Travel AI Agent API started successfully")
    yield
    # Shutdown
    logging.info("Travel AI Agent API shutting down")


# Initialize FastAPI app
app = FastAPI(
    title="Travel AI Companion API",
    description="Real-time travel companion for on-trip assistance",
    version="2.0.0",
    lifespan=lifespan
)

# Configure CORS for NestJS backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://travel-app-r9qu.onrender.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the travel companion
companion = TravelCompanion()

# In-memory conversation storage (in production, use Redis or database)
conversations: Dict[str, Dict] = {}

# =====================================
# REQUEST/RESPONSE MODELS
# =====================================

class ChatRequest(BaseModel):
    """Request model for chat endpoint"""
    message: str
    user_id: str
    session_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None  # Contains: current_location, active_place_id, itinerary

class ChatResponse(BaseModel):
    """Response model for chat endpoint"""
    response: str
    session_id: str
    suggestions: Optional[List[Dict[str, Any]]] = None
    metadata: Dict[str, Any] = {}

class ResetRequest(BaseModel):
    """Request model for reset endpoint"""
    user_id: str
    session_id: Optional[str] = None

class HealthResponse(BaseModel):
    """Response model for health check"""
    status: str
    timestamp: str
    version: str

# =====================================
# UTILITY FUNCTIONS
# =====================================

def generate_session_id(user_id: str) -> str:
    """Generate unique session ID"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{user_id}_{timestamp}"

def get_conversation_key(user_id: str, session_id: str) -> str:
    """Get conversation storage key"""
    return f"{user_id}:{session_id}"

# =====================================
# API ENDPOINTS
# =====================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        timestamp=datetime.now().isoformat(),
        version="2.0.0"
    )

@app.post("/chat", response_model=ChatResponse)
async def chat_with_companion(request: ChatRequest):
    """
    Main chat endpoint for real-time travel companion
    """
    try:
        # Generate session ID if not provided
        session_id = request.session_id or generate_session_id(request.user_id)
        conversation_key = get_conversation_key(request.user_id, session_id)
        
        # Get existing conversation state
        conversation_state = conversations.get(conversation_key)
        
        # Extract context data
        current_location = None
        active_place_id = None
        itinerary = None
        
        if request.context:
            if request.context.get('current_location'):
                current_location = request.context['current_location']
                logging.info(f"   📍 Location from context: {current_location}")
            
            if request.context.get('active_place_id'):
                active_place_id = request.context['active_place_id']
                logging.info(f"   🏛️ Place from context: {active_place_id}")
            
            if request.context.get('itinerary'):
                itinerary = request.context['itinerary']
                # Log itinerary info - handle both dict and list formats
                if isinstance(itinerary, dict):
                    logging.info(f"   📋 Itinerary from context: Object with keys: {list(itinerary.keys())[:5]}")
                elif isinstance(itinerary, list):
                    logging.info(f"   📋 Itinerary from context: {len(itinerary)} places")
                else:
                    logging.info(f"   📋 Itinerary from context: {type(itinerary)}")
        
        # Call the companion
        result = companion.chat(
            request.message,
            conversation_state=conversation_state,
            current_location=current_location,
            active_place_id=active_place_id,
            itinerary=itinerary
        )
        
        # Update conversation storage
        conversations[conversation_key] = result["state"]
        logging.info(f"💾 Saved conversation state: {conversation_key} (total: {len(conversations)} conversations)")
        
        # Parse action markers from response
        response_text = result["response"]
        action_data = None
        
        # Check for [ACTION:TYPE:DATA] markers
        import re
        action_match = re.search(r'\[ACTION:(\w+):(.+?)\]', response_text)
        if action_match:
            action_type = action_match.group(1)
            action_value = action_match.group(2)
            action_data = {
                "type": action_type,
                "value": action_value
            }
            # Remove marker from response text
            response_text = re.sub(r'\[ACTION:(\w+):(.+?)\]\n?', '', response_text)
            logging.info(f"   🎬 Action detected: {action_type} -> {action_value[:50]}...")
        
        # Prepare metadata
        metadata = {
            "timestamp": datetime.now().isoformat(),
            "user_id": request.user_id,
            "session_id": session_id,
            "message_length": len(request.message),
            "response_length": len(response_text),
            "status": result.get("status", "success")
        }
        
        # Add action to metadata if exists
        if action_data:
            metadata["action"] = action_data
        
        return ChatResponse(
            response=response_text,
            session_id=session_id,
            suggestions=result.get("suggestions"),
            metadata=metadata
        )
        
    except Exception as e:
        logging.error(f"Error in chat endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/reset")
async def reset_conversation(request: ResetRequest):
    """
    Reset conversation for a user/session
    """
    try:
        if request.session_id:
            conversation_key = get_conversation_key(request.user_id, request.session_id)
            if conversation_key in conversations:
                del conversations[conversation_key]
                return {"message": "Conversation reset successfully", "session_id": request.session_id}
        else:
            # Reset all conversations for user
            keys_to_delete = [k for k in conversations.keys() if k.startswith(f"{request.user_id}:")]
            for key in keys_to_delete:
                del conversations[key]
            return {"message": f"All conversations reset for user {request.user_id}", "count": len(keys_to_delete)}
        
        return {"message": "No conversation found to reset"}
        
    except Exception as e:
        logging.error(f"Error in reset endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")



@app.get("/conversations/{user_id}")
async def get_user_conversations(user_id: str):
    """
    Get all conversation sessions for a user
    """
    try:
        user_conversations = {}
        prefix = f"{user_id}:"
        
        for key, state in conversations.items():
            if key.startswith(prefix):
                session_id = key[len(prefix):]
                user_conversations[session_id] = {
                    "last_activity": datetime.now().isoformat(),
                    "message_count": len(state.get("messages", []))
                }
        
        return {"user_id": user_id, "conversations": user_conversations}
        
    except Exception as e:
        logging.error(f"Error getting conversations: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# =====================================

if __name__ == "__main__":
    print("🚀 Starting Travel AI Companion API server...")
    print("📋 Available endpoints:")
    print("   - POST /chat - Real-time travel companion chat")
    print("   - POST /reset - Reset conversation")
    print("   - GET /health - Health check")
    print("   - GET /conversations/{user_id} - Get user conversations")
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=False,
        log_level="info"
    )