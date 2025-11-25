import os
from pymongo import MongoClient
from dotenv import load_dotenv
from models import TouristSpot

# Nạp biến môi trường từ file .env
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DATABASE_NAME")

def get_database():
    """Kết nối tới MongoDB và trả về database object"""
    if not MONGO_URI:
        raise ValueError("MONGO_URI chưa được thiết lập trong file .env")
    client = MongoClient(MONGO_URI)
    return client[DB_NAME]

def get_all_places():
    """Lấy toàn bộ dữ liệu từ collection places và in ra màn hình"""
    print("Đang kết nối tới MongoDB...")
    db = get_database()
    collection = db["places"]
    print("Lấy dữ liệu từ collection 'places'...")
    places = list(collection.find())
    print(f"Tổng số địa điểm: {len(places)}")
    for place in places:
        print(place)

if __name__ == "__main__":
    get_all_places()