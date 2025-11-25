"""
FastAPI Server for Travel AI Agent
=================================
REST API endpoint for NestJS backend to interact with the AI Agent

Endpoints:
- POST /chat - Main chat interface
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

from agent import TravelAgent


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
    title="Travel AI Agent API",
    description="Intelligent travel itinerary planning agent",
    version="1.0.0",
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

# Initialize the AI agent
travel_agent = TravelAgent()

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
    context: Optional[Dict[str, Any]] = None

class ChatResponse(BaseModel):
    """Response model for chat endpoint"""
    response: str
    session_id: str
    stage: str
    preferences: Dict[str, Any]
    itinerary: List[Dict[str, Any]]
    suggestions: List[str] = []
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

def extract_suggestions(stage: str, preferences: Dict) -> List[str]:
    """Generate context-aware suggestions for next user actions"""
    suggestions = []
    
    if stage == "profiling":
        if not preferences.get("travel_style"):
            suggestions.append("Bạn thích du lịch kiểu gì? (chill, phiêu lưu, văn hóa, ẩm thực)")
        if not preferences.get("group_type"):
            suggestions.append("Bạn đi một mình hay cùng ai? (solo, cặp đôi, gia đình, bạn bè)")
        if not preferences.get("duration"):
            suggestions.append("Bạn có bao nhiều thời gian? (nửa ngày, cả ngày, 2-3 ngày)")
    
    elif stage == "planning":
        suggestions.extend([
            "Tôi muốn thay đổi một địa điểm",
            "Có thể điều chỉnh thời gian không?",
            "Thêm hoạt động ăn uống"
        ])
    
    elif stage == "optimizing":
        suggestions.extend([
            "Kiểm tra thời tiết ngày đó",
            "Tính chi phí ước tính",
            "Có phương án thay thế không?"
        ])
    
    elif stage == "complete":
        suggestions.extend([
            "Tạo lộ trình mới",
            "Thay đổi ngân sách",
            "Xuất lịch trình PDF"
        ])
    
    return suggestions

# =====================================
# API ENDPOINTS
# =====================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        timestamp=datetime.now().isoformat(),
        version="1.0.0"
    )

@app.post("/chat", response_model=ChatResponse)
async def chat_with_agent(request: ChatRequest):
    """
    Main chat endpoint for interacting with the travel agent
    """
    try:
        # Generate session ID if not provided
        session_id = request.session_id or generate_session_id(request.user_id)
        conversation_key = get_conversation_key(request.user_id, session_id)
        
        # Get existing conversation state
        conversation_state = conversations.get(conversation_key)
        
        # Call the AI agent
        result = travel_agent.chat(request.message, conversation_state)
        
        # Update conversation storage
        conversations[conversation_key] = result["state"]
        
        # Generate suggestions
        suggestions = extract_suggestions(result["stage"], result["preferences"])
        
        # Prepare metadata
        metadata = {
            "timestamp": datetime.now().isoformat(),
            "user_id": request.user_id,
            "session_id": session_id,
            "message_length": len(request.message),
            "response_length": len(result["response"]),
            "optimization_applied": result["state"].get("optimization_applied", False),
            "weather_checked": result["state"].get("weather_checked", False),
            "budget_calculated": result["state"].get("budget_calculated", False)
        }
        
        return ChatResponse(
            response=result["response"],
            session_id=session_id,
            stage=result["stage"],
            preferences=result["preferences"],
            itinerary=result["itinerary"],
            suggestions=suggestions,
            metadata=metadata
        )
        
    except Exception as e:
        logging.error(f"Error in chat endpoint: {str(e)}")
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
                    "stage": state.get("session_stage", "unknown"),
                    "preferences": state.get("user_preferences", {}).dict() if hasattr(state.get("user_preferences", {}), 'dict') else {},
                    "last_activity": datetime.now().isoformat(),  # In real app, track this properly
                    "message_count": len(state.get("messages", []))
                }
        
        return {"user_id": user_id, "conversations": user_conversations}
        
    except Exception as e:
        logging.error(f"Error getting conversations: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/debug/database")
async def debug_database_connection():
    """
    Debug endpoint to check database connectivity
    """
    try:
        from tools import places_collection
        
        # Test MongoDB connection
        count = places_collection.count_documents({})
        sample_places = list(places_collection.find({}).limit(3))
        
        return {
            "database_status": "connected",
            "total_places": count,
            "sample_places": [
                {
                    "name": place.get("name", "Unknown"),
                    "type": place.get("type", "Unknown"),
                    "address": place.get("address", place.get("formatted_address", "Unknown"))
                }
                for place in sample_places
            ]
        }
        
    except Exception as e:
        logging.error(f"Database connection error: {str(e)}")
        return {
            "database_status": "error",
            "error": str(e),
            "total_places": 0,
            "sample_places": []
        }

# =====================================

if __name__ == "__main__":
    print("🚀 Starting Travel AI Agent API server...")
    print("📋 Available endpoints:")
    print("   - POST /chat - Main chat interface")
    print("   - POST /reset - Reset conversation")
    print("   - GET /health - Health check")
    print("   - GET /debug/database - Debug database connection")
    print("   - GET /conversations/{user_id} - Get user conversations")
    
    uvicorn.run(
        "main:app",  # Import string format để enable reload
        host="0.0.0.0",
        port=8000,
        reload=True,  # For development
        log_level="info"
    )