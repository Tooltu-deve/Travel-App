# models.py
from pydantic import BaseModel, Field
from typing import List, Optional

# Đây là cấu trúc chuẩn cho một địa điểm du lịch
class TouristSpot(BaseModel):
    name: str = Field(..., description="Tên địa điểm")
    description: str = Field(..., description="Mô tả chi tiết để AI hiểu (RAG)")
    location: str = Field(..., description="Địa chỉ dạng text")
    
    # Quan trọng cho tính năng gợi ý lộ trình tối ưu:
    coordinates: List[float] = Field(..., description="[kinh_do, vi_do] ví dụ [106.69, 10.77]") 
    
    category: str = Field(..., description="Loại hình: 'museum', 'park', 'food', 'cafe'")
    avg_price: int = Field(..., description="Giá trung bình (VND)")
    opening_hours: str = Field(..., description="Giờ mở cửa, vd: '08:00-17:00'")
    
    # Dùng cho việc tìm kiếm vector sau này
    embedding: Optional[List[float]] = Field(None, description="Vector hóa của phần description")