"""
Script lọc các dòng không có nội dung review và các POI có số reviews < 80 trong toàn bộ thư mục `reviews/`.

- Tự động duyệt tất cả file CSV trong `data_processing/reviews`.
- Chuẩn hoá tên cột để hỗ trợ nhiều định dạng (`placeId` -> `placeID`, `text` -> `review-text`, ...).
- Loại bỏ các dòng có nội dung review bị rỗng hoặc chỉ chứa khoảng trắng.
- Lọc các POI có số reviews < 80 (chỉ giữ lại các POI có >= 80 reviews).
- Ghi đè file gốc sau khi lọc.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

# Thư mục chứa các file reviews (mặc định là data_processing/reviews)
BASE_DIR = Path(__file__).resolve().parent
REVIEWS_DIR = BASE_DIR / "reviews"

# Map cột để chuẩn hoá tên
COLUMN_MAPPING = {
    "placeId": "placeID",
    "place_id": "placeID",
    "PlaceID": "placeID",
    "PlaceId": "placeID",
    "id": "placeID",
    "text": "review-text",
    "review_text": "review-text",
    "review": "review-text",
    "Review": "review-text",
}


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    renamed = {
        col: COLUMN_MAPPING[col]
        for col in df.columns
        if col in COLUMN_MAPPING
    }
    return df.rename(columns=renamed)


def clean_csv(path: Path) -> None:
    print(f"\n🧹 Đang xử lý: {path.name}")
    try:
        df = pd.read_csv(path)
    except Exception as exc:
        print(f"   ❌ Không thể đọc file: {exc}")
        return

    original_rows = len(df)
    df = normalize_columns(df)

    if "placeID" not in df.columns or "review-text" not in df.columns:
        print("   ⚠️  Bỏ qua: thiếu cột 'placeID' hoặc 'review-text' sau khi chuẩn hoá.")
        return

    # Loại bỏ các dòng review rỗng hoặc chỉ có khoảng trắng
    review_series = df["review-text"]
    not_null_mask = review_series.notna()
    trimmed = review_series.astype(str).str.strip()
    non_empty_mask = trimmed != ""
    not_literal_nan_mask = trimmed.str.lower() != "nan"
    valid_mask = not_null_mask & non_empty_mask & not_literal_nan_mask
    filtered_df = df[valid_mask].copy()
    filtered_df["review-text"] = trimmed[valid_mask]
    removed_empty = original_rows - len(filtered_df)

    # Đếm số reviews theo placeID và lọc các POI có số reviews >= 80
    rows_before_poi_filter = len(filtered_df)
    poi_review_counts = filtered_df["placeID"].value_counts()
    pois_with_enough_reviews = poi_review_counts[poi_review_counts >= 80].index
    filtered_df = filtered_df[filtered_df["placeID"].isin(pois_with_enough_reviews)].copy()
    removed_by_poi_filter = rows_before_poi_filter - len(filtered_df)
    original_pois = df["placeID"].nunique()
    remaining_pois = filtered_df["placeID"].nunique()
    removed_pois_count = original_pois - remaining_pois

    # Kiểm tra xem có thay đổi gì không
    if removed_empty == 0 and removed_pois_count == 0:
        print("   ✅ Không có dòng rỗng và tất cả POI đều có >= 80 reviews. Không cần thay đổi.")
        return

    try:
        filtered_df.to_csv(path, index=False)
    except Exception as exc:
        print(f"   ❌ Lỗi khi ghi file: {exc}")
        return

    print(f"   ✅ Hoàn tất:")
    if removed_empty > 0:
        print(f"      - Xoá {removed_empty} dòng review rỗng")
    if removed_pois_count > 0:
        print(f"      - Xoá {removed_pois_count} POI có < 80 reviews (giữ lại {remaining_pois}/{original_pois} POI)")
        print(f"      - Xoá {removed_by_poi_filter} dòng review từ các POI bị loại")
    print(f"      - Tổng: {len(filtered_df)}/{original_rows} dòng giữ lại")


def main() -> None:
    if not REVIEWS_DIR.exists():
        print(f"❌ Thư mục {REVIEWS_DIR} không tồn tại.")
        return

    csv_files = sorted(REVIEWS_DIR.glob("*.csv"))
    if not csv_files:
        print(f"⚠️  Không tìm thấy file CSV nào trong {REVIEWS_DIR}")
        return

    print(f"🔍 Tìm thấy {len(csv_files)} file CSV trong {REVIEWS_DIR}:")
    for csv_file in csv_files:
        print(f"   - {csv_file.name}")

    for csv_file in csv_files:
        clean_csv(csv_file)

    print("\n✅ Hoàn tất lọc các dòng không có review và các POI có < 80 reviews.")


if __name__ == "__main__":
    main()

