import pandas as pd
from datasets import Dataset, load_dataset
from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments
import torch
import numpy as np
import evaluate
import os

# ----------------------------------------------------------------------
# 1. CHUẨN BỊ DỮ LIỆU - ĐỌC TỪ FILE CSV SUPPORT SET
# ----------------------------------------------------------------------

# Đọc dữ liệu từ file CSV support_set.csv (4-shot cho mỗi emotional tag)
support_set_path = "support_set.csv"

if not os.path.exists(support_set_path):
    raise FileNotFoundError(
        f"Không tìm thấy file {support_set_path}. "
        "Vui lòng đảm bảo file CSV đã được tạo với cấu trúc: review_text, tag_label"
    )

# Đọc CSV
df = pd.read_csv(support_set_path)

# Kiểm tra cấu trúc file
required_columns = ['review_text', 'tag_label']
if not all(col in df.columns for col in required_columns):
    raise ValueError(
        f"File CSV phải có các cột: {required_columns}. "
        f"Các cột hiện tại: {list(df.columns)}"
    )

print(f"✅ Đã đọc {len(df)} reviews từ {support_set_path}")
print(f"📊 Số lượng tags duy nhất: {df['tag_label'].nunique()}")
print(f"📋 Các tags: {sorted(df['tag_label'].unique())}")

# Chuyển đổi DataFrame thành đối tượng Dataset của Hugging Face
raw_datasets = Dataset.from_pandas(df)

# ----------------------------------------------------------------------
# 2. KHỞI TẠO MÔ HÌNH VÀ TOKENIZER
# ----------------------------------------------------------------------

# Tạo mapping từ tên tag (string) sang ID số (integer)
unique_labels = sorted(list(set(df['tag_label'])))
label_to_id = {label: i for i, label in enumerate(unique_labels)}
id_to_label = {i: label for label, i in label_to_id.items()}
NUM_TAGS = len(unique_labels)
print(f"Tags đang được huấn luyện: {unique_labels}. Số lượng: {NUM_TAGS}")

MODEL_NAME = "vinai/phobert-base"
# Sử dụng 'use_fast=False' là bắt buộc đối với PhoBERT Tokenizer
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, use_fast=False) 

# Tải mô hình cơ sở và cấu hình lại đầu phân loại (num_labels)
model = AutoModelForSequenceClassification.from_pretrained(
    MODEL_NAME,
    num_labels=NUM_TAGS,
    id2label=id_to_label,
    label2id=label_to_id
)
print("Đã tải mô hình PhoBERT base.")

# ----------------------------------------------------------------------
# 3. TIỀN XỬ LÝ VÀ CHIA TẬP DỮ LIỆU
# ----------------------------------------------------------------------

def tokenize_and_encode(examples):
    """Tokenize văn bản và chuyển nhãn (tag string) thành ID số."""
    # max_length và padding rất quan trọng, đảm bảo input đồng nhất
    tokenized = tokenizer(examples['review_text'], truncation=True, padding='max_length', max_length=128)
    # Ánh xạ nhãn string sang nhãn số (ID)
    tokenized['labels'] = [label_to_id[label] for label in examples['tag_label']]
    return tokenized

# Áp dụng Tokenizer cho toàn bộ dataset
tokenized_few_shot = raw_datasets.map(tokenize_and_encode, batched=True)

# Loại bỏ các cột không cần thiết cho training
# Lưu ý: '__index_level_0__' chỉ có khi tạo từ pandas DataFrame, có thể không có khi đọc từ CSV
columns_to_remove = ['review_text', 'tag_label']
if '__index_level_0__' in tokenized_few_shot.column_names:
    columns_to_remove.append('__index_level_0__')
tokenized_few_shot = tokenized_few_shot.remove_columns(columns_to_remove)

# Chia tập dữ liệu Few-Shot thành train và test (validation)
split_dataset = tokenized_few_shot.train_test_split(test_size=0.2, seed=42) 

# ----------------------------------------------------------------------
# 4. CẤU HÌNH VÀ CHẠY TRAINER (FEW-SHOT SFT)
# ----------------------------------------------------------------------

metric = evaluate.load("accuracy")

def compute_metrics(eval_pred):
    """Tính toán độ chính xác (accuracy) trong quá trình đánh giá."""
    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=-1)
    return metric.compute(predictions=predictions, references=labels)

# Tham số Huấn luyện Few-Shot: CHỈ CẦN THAY ĐỔI ÍT, CÓ TÍNH MỤC TIÊU
training_args = TrainingArguments(
    output_dir="./phobert_few_shot_tags_classifier",
    learning_rate=1e-5, # Tốc độ học tập RẤT NHỎ (Giúp tinh chỉnh nhẹ, tránh làm hỏng kiến thức gốc)
    per_device_train_batch_size=8,
    per_device_eval_batch_size=8,
    num_train_epochs=3, # SỐ EPOCH THẤP (QUAN TRỌNG cho Few-Shot, tránh overfitting vào dữ liệu nhỏ)
    weight_decay=0.01,
    eval_strategy="epoch", # Đánh giá sau mỗi epoch (đổi tên từ evaluation_strategy trong transformers mới)
    save_strategy="epoch", # Lưu model sau mỗi epoch (phải khớp với eval_strategy khi dùng load_best_model_at_end)
    load_best_model_at_end=True,
    logging_dir='./logs',
    dataloader_pin_memory=False, # Tắt pin_memory để tránh cảnh báo trên MPS (Apple Silicon GPU)
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=split_dataset["train"],
    eval_dataset=split_dataset["test"],
    tokenizer=tokenizer,
    compute_metrics=compute_metrics,
)

print("\nBắt đầu tinh chỉnh Few-Shot (PhoBERT)...")
trainer.train()

# ----------------------------------------------------------------------
# 5. LƯU VÀ SỬ DỤNG
# ----------------------------------------------------------------------

# Lưu mô hình đã fine-tuned và tokenizer vào thư mục Microservice AI của bạn
output_dir = "./final_few_shot_phobert_model"
os.makedirs(output_dir, exist_ok=True)

trainer.save_model(output_dir)
tokenizer.save_pretrained(output_dir)

print(f"\n✅ Hoàn tất. Mô hình và tokenizer đã được lưu vào: {output_dir}")