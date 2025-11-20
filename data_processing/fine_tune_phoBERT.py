import os
import pandas as pd
from datasets import Dataset
from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments
import torch
from torch import nn
import numpy as np
from sklearn.metrics import f1_score, accuracy_score
import subprocess

# ----------------------------------------------------------------------
# 0. CHUẨN BỊ TÁCH TỪ (Dùng underthesea)
# ----------------------------------------------------------------------
try:
    from underthesea import word_tokenize
except ImportError:
    print("⚠️ underthesea chưa được cài. Đang cài đặt...")
    subprocess.check_call(["pip", "install", "underthesea"])
    from underthesea import word_tokenize

def segment_text(text: str) -> str:
    text = str(text).strip()
    if not text:
        return ""
    try:
        tokens = word_tokenize(text)
        return " ".join(tokens)
    except Exception as e:
        # Fallback an toàn
        return text

# ----------------------------------------------------------------------
# 1. ĐỌC DỮ LIỆU VÀ MAPPING
# ----------------------------------------------------------------------
support_set_path = "support_set.csv"
if not os.path.exists(support_set_path):
    raise FileNotFoundError(f"Thiếu file {support_set_path}")

df = pd.read_csv(support_set_path)
df['tag_label'] = df['tag_label'].apply(lambda x: str(x).strip())

print("⏳ Đang tách từ tiếng Việt...")
df['review_text_segmented'] = df['review_text'].apply(segment_text)

# Tạo mapping labels
unique_labels = sorted(list(set(df['tag_label'])))
label_to_id = {label: i for i, label in enumerate(unique_labels)}
id_to_label = {i: label for label, i in label_to_id.items()}
NUM_TAGS = len(unique_labels)
print(f"Training với {NUM_TAGS} tags.")

raw_datasets = Dataset.from_pandas(df)

# ----------------------------------------------------------------------
# 2. MODEL & TOKENIZER
# ----------------------------------------------------------------------
MODEL_NAME = "vinai/phobert-base"
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, use_fast=False)

model = AutoModelForSequenceClassification.from_pretrained(
    MODEL_NAME,
    num_labels=NUM_TAGS,
    id2label=id_to_label,
    label2id=label_to_id,
    problem_type="multi_label_classification"
)

# ----------------------------------------------------------------------
# 3. ENCODE & SPLIT
# ----------------------------------------------------------------------
def tokenize_and_encode(examples):
    tokenized = tokenizer(examples['review_text_segmented'], truncation=True, padding='max_length', max_length=128)
    multi_hot_labels = []
    for label in examples['tag_label']:
        vec = [0.0] * NUM_TAGS
        if label in label_to_id:
            vec[label_to_id[label]] = 1.0
        multi_hot_labels.append(vec)
        
    tokenized['labels'] = multi_hot_labels
    return tokenized

tokenized_datasets = raw_datasets.map(tokenize_and_encode, batched=True)
cols_to_keep = ['input_ids', 'attention_mask', 'labels']
if 'token_type_ids' in tokenized_datasets.column_names: cols_to_keep.append('token_type_ids')
tokenized_datasets = tokenized_datasets.remove_columns([c for c in tokenized_datasets.column_names if c not in cols_to_keep])
tokenized_datasets.set_format("torch")

if len(tokenized_datasets) > 5:
    split_dataset = tokenized_datasets.train_test_split(test_size=0.2, seed=42)
else:
    split_dataset = {"train": tokenized_datasets, "test": tokenized_datasets}

# ----------------------------------------------------------------------
# 4. CUSTOM TRAINER (SỬ DỤNG POS_WEIGHT)
# ----------------------------------------------------------------------
class WeightedTrainer(Trainer):
    """Trainer tùy chỉnh để thêm pos_weight vào hàm loss."""
    
    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.get("labels")
        outputs = model(**inputs)
        logits = outputs.get("logits")
        
        # ⚠️ Tùy chỉnh POS_WEIGHT tại đây ⚠️
        # Đặt 10.0 (hoặc 15.0) nghĩa là nhãn Positive (1) quan trọng gấp 10 lần Negative (0).
        # Điều này sẽ giúp model tự tin hơn khi dự đoán 1.
        
        # Đảm bảo tensor có cùng device với model
        pos_weight_tensor = torch.ones(NUM_TAGS).to(model.device) * 10.0 
        
        loss_fct = nn.BCEWithLogitsLoss(pos_weight=pos_weight_tensor)
        loss = loss_fct(logits, labels.float()) # Labels phải là float
        
        return (loss, outputs) if return_outputs else loss

# ----------------------------------------------------------------------
# 5. METRIC & TRAINING
# ----------------------------------------------------------------------
def compute_metrics(eval_pred):
    logits, labels = eval_pred
    probs = 1 / (1 + np.exp(-logits))
    preds = (probs >= 0.5).astype(int)
    f1 = f1_score(labels, preds, average='micro')
    acc = accuracy_score(labels, preds)
    return {"f1_micro": f1, "accuracy": acc}

training_args = TrainingArguments(
    output_dir="./phobert_underthesea_weighted",
    learning_rate=3e-5, # Tăng nhẹ Learning Rate lên 3e-5
    per_device_train_batch_size=4,
    num_train_epochs=15, # Tăng lên 15 epoch để học hết dữ liệu Few-shot
    weight_decay=0.01,
    eval_strategy="epoch",
    save_strategy="epoch",
    load_best_model_at_end=True,
    metric_for_best_model="f1_micro",
    save_total_limit=1,
    logging_steps=5
)

# SỬ DỤNG WEIGHTED TRAINER
trainer = WeightedTrainer( 
    model=model,
    args=training_args,
    train_dataset=split_dataset["train"],
    eval_dataset=split_dataset["test"],
    tokenizer=tokenizer,
    compute_metrics=compute_metrics,
)

print("🚀 Bắt đầu training với POS_WEIGHT...")
trainer.train()

trainer.save_model("./final_model_weighted")
tokenizer.save_pretrained("./final_model_weighted")
print("✅ Xong! Model đã được train với trọng số.")