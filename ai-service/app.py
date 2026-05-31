import os
import base64
import io
import re
from flask import Flask, request, jsonify

import numpy as np
from PIL import Image
import pytesseract
import fitz  # PyMuPDF
from docx import Document as DocxDocument

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from sklearn.pipeline import Pipeline

app = Flask(__name__)

LABELS = ["Finance", "RH", "Support Client"]

# Lightweight baseline classifier (rule-augmented ML)
TRAIN = [
    ("facture devis bon de commande paiement virement tva budget audit", "Finance"),
    ("relevé bancaire compte fournisseur client paiement", "Finance"),
    ("contrat travail recrutement congé paie salaire présence sanction", "RH"),
    ("fiche de paie onboarding performance évaluation formation", "RH"),
    ("réclamation incident ticket assistance dépannage client ligne internet", "Support Client"),
    ("SAV support demande client plainte hotline", "Support Client"),
]

clf: Pipeline = Pipeline(
    [
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1, max_features=4000)),
        ("svc", LinearSVC()),
    ]
)

X = [t for t, y in TRAIN]
Y = [y for t, y in TRAIN]
clf.fit(X, Y)


def _clean(text: str) -> str:
    text = text or ""
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_text_from_pdf(data: bytes) -> str:
    doc = fitz.open(stream=data, filetype="pdf")
    parts = []
    for page in doc:
        parts.append(page.get_text("text"))
    return _clean("\n".join(parts))


def ocr_pdf_first_page(data: bytes) -> str:
    # Fallback OCR: render first page and OCR it
    doc = fitz.open(stream=data, filetype="pdf")
    if doc.page_count == 0:
        return ""
    page = doc.load_page(0)
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    return _clean(pytesseract.image_to_string(img))


def extract_text_from_docx(data: bytes) -> str:
    f = io.BytesIO(data)
    d = DocxDocument(f)
    return _clean("\n".join([p.text for p in d.paragraphs]))


def extract_text_from_txt(data: bytes) -> str:
    try:
        return _clean(data.decode("utf-8", errors="ignore"))
    except Exception:
        return ""


def summarize(text: str, max_sentences: int = 4) -> str:
    text = _clean(text)
    if not text:
        return ""
    # naive extractive summary
    sentences = re.split(r"(?<=[.!?])\s+", text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 20]
    return _clean(" ".join(sentences[:max_sentences]))


def classify(text: str):
    text = _clean(text).lower()
    if not text:
        return {"label": None, "confidence": None}

    # rule boosts
    rules = {
        "Finance": ["facture", "tva", "budget", "paiement", "virement", "devis"],
        "RH": ["congé", "salaire", "recrut", "contrat", "paie"],
        "Support Client": ["réclamation", "incident", "ticket", "assistance", "dépannage"],
    }
    for label, kws in rules.items():
        if any(kw in text for kw in kws):
            return {"label": label, "confidence": 0.75}

    pred = clf.predict([text])[0]
    # LinearSVC has no probability by default; return pseudo-confidence
    return {"label": pred, "confidence": 0.6}


@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "ai"})


@app.post("/analyze")
def analyze():
    body = request.get_json(force=True, silent=False)
    filename = body.get("filename", "")
    content_type = body.get("contentType", "")
    b64 = body.get("bytesBase64")
    if not b64:
        return jsonify({"error": "bytesBase64 is required"}), 400

    data = base64.b64decode(b64)

    text = ""
    if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
        text = extract_text_from_pdf(data)
        if len(text) < 40:
            text = ocr_pdf_first_page(data)
    elif (
        content_type
        in [
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
        ]
        or filename.lower().endswith(".docx")
    ):
        text = extract_text_from_docx(data)
    else:
        text = extract_text_from_txt(data)

    s = summarize(text)
    c = classify(text)

    return jsonify(
        {
            "ocr_text": text,
            "summary": s,
            "label": c["label"],
            "confidence": c["confidence"],
            "similar": [],
        }
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)
