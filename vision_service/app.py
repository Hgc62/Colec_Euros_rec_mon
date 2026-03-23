import io
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
import timm
import torch
from fastapi import FastAPI, File, Form, UploadFile
from PIL import Image
from torchvision import transforms

ROOT = Path(__file__).resolve().parent
CATALOG_PATH = ROOT / "catalog_embeddings.json"

device = "cuda" if torch.cuda.is_available() else "cpu"

model = timm.create_model("resnet18", pretrained=True, num_classes=0)
model.eval()
model.to(device)

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.Grayscale(num_output_channels=3),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    ),
])

app = FastAPI()

with open(CATALOG_PATH, "r", encoding="utf-8") as f:
    CATALOG = json.load(f)


def preprocess_coin_image(img: Image.Image) -> Image.Image:
    img = img.convert("L")
    w, h = img.size
    side = int(min(w, h) * 0.75)
    left = max(0, (w - side) // 2)
    top = max(0, (h - side) // 2)
    return img.crop((left, top, left + side, top + side))


@torch.no_grad()
def embedding_from_bytes(data: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(data))
    img = preprocess_coin_image(img)
    tensor = transform(img).unsqueeze(0).to(device)
    emb = model(tensor).squeeze(0).cpu().numpy().astype(np.float32)
    norm = np.linalg.norm(emb)
    if norm > 0:
        emb = emb / norm
    return emb


def score_items(query_emb, items):
    scored = []
    for item in items:
        emb = np.array(item["embedding"], dtype=np.float32)
        score = float(np.dot(query_emb, emb))
        scored.append({**item, "score": round(score, 4)})
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored


def top_matches(query_emb, items, top_n=5):
    return score_items(query_emb, items)[:top_n]


def rank_countries(query_emb, items, top_n=5):
    scored = score_items(query_emb, items)

    by_country = defaultdict(list)
    for item in scored:
        if item["pais"]:
            by_country[item["pais"]].append(item)

    ranking = []
    for pais, elems in by_country.items():
        top_scores = [x["score"] for x in elems[:3]]

        best_score = top_scores[0]
        if len(top_scores) > 1:
            rest_avg = sum(top_scores[1:]) / len(top_scores[1:])
        else:
            rest_avg = best_score

        final_score = 0.7 * best_score + 0.3 * rest_avg

        ranking.append({
            "pais": pais,
            "score": round(final_score, 4),
            "best_file": elems[0]["file"],
            "best_moneda": elems[0]["moneda"],
            "best_anio": elems[0]["anio"],
        })

    ranking.sort(key=lambda x: x["score"], reverse=True)
    return ranking[:top_n]


def detect_2e_type(query_emb, nacionales_2e):
    normales = [x for x in nacionales_2e if x["moneda"] == "2€"]
    conmemorativas = [x for x in nacionales_2e if x["moneda"].startswith("2€ Com")]

    normales_scores = score_items(query_emb, normales)
    conme_scores = score_items(query_emb, conmemorativas)

    normal_score = 0.0
    conme_score = 0.0

    if normales_scores:
        top_scores = [x["score"] for x in normales_scores[:3]]
        normal_score = sum(top_scores) / len(top_scores)

    if conme_scores:
        top_scores = [x["score"] for x in conme_scores[:3]]
        conme_score = sum(top_scores) / len(top_scores)

    tipo2e = "normal" if normal_score >= conme_score else "conmemorativa"

    return {
        "tipo2e": tipo2e,
        "score_normal": round(normal_score, 4),
        "score_conmemorativa": round(conme_score, 4),
    }


@app.get("/health")
def health():
    return {"ok": True, "catalog_size": len(CATALOG)}


@app.post("/identify/value")
async def identify_value(image: UploadFile = File(...)):
    data = await image.read()
    query_emb = embedding_from_bytes(data)

    reversos = [x for x in CATALOG if x["tipo"] == "reverse"]
    candidatos = top_matches(query_emb, reversos, 5)

    return {
        "valor": candidatos[0]["valor"] if candidatos else None,
        "score": candidatos[0]["score"] if candidatos else 0,
        "candidatos": [
            {
                "valor": c["valor"],
                "file": c["file"],
                "score": c["score"]
            }
            for c in candidatos
        ]
    }


@app.post("/identify/national")
async def identify_national(
    image: UploadFile = File(...),
    valor: str = Form(...),
    pais: str | None = Form(None),
):
    data = await image.read()
    query_emb = embedding_from_bytes(data)

    nacionales = [x for x in CATALOG if x["tipo"] == "national" and x["valor"] == valor]

    if pais:
        nacionales = [x for x in nacionales if x["pais"] == pais]

    if not nacionales:
        return {
            "pais": None,
            "moneda": None,
            "anio": None,
            "score": 0,
            "candidatos": []
        }

    if valor != "2€":
        ranking_paises = rank_countries(query_emb, nacionales, top_n=5)
        best = ranking_paises[0] if ranking_paises else None

        return {
            "valor": valor,
            "pais": best["pais"] if best else None,
            "score": best["score"] if best else 0,
            "candidatos_pais": ranking_paises
        }

    detection = detect_2e_type(query_emb, nacionales)
    tipo2e = detection["tipo2e"]

    if tipo2e == "normal":
        normales = [x for x in nacionales if x["moneda"] == "2€"]
        ranking_paises = rank_countries(query_emb, normales, top_n=5)
        best = ranking_paises[0] if ranking_paises else None

        return {
            "valor": "2€",
            "tipo2e": "normal",
            "pais": best["pais"] if best else None,
            "score": best["score"] if best else 0,
            "score_normal": detection["score_normal"],
            "score_conmemorativa": detection["score_conmemorativa"],
            "candidatos_pais": ranking_paises
        }

    conmemorativas = [x for x in nacionales if x["moneda"].startswith("2€ Com")]
    candidatos = top_matches(query_emb, conmemorativas, 5)
    best = candidatos[0] if candidatos else None

    if not best:
        return {
            "valor": "2€",
            "tipo2e": "conmemorativa",
            "pais": None,
            "moneda": None,
            "anio": None,
            "score": 0,
            "candidatos": []
        }

    return {
        "valor": "2€",
        "tipo2e": "conmemorativa",
        "pais": best["pais"],
        "moneda": best["moneda"],
        "anio": best["anio"],
        "score": best["score"],
        "score_normal": detection["score_normal"],
        "score_conmemorativa": detection["score_conmemorativa"],
        "candidatos": [
            {
                "pais": c["pais"],
                "moneda": c["moneda"],
                "anio": c["anio"],
                "file": c["file"],
                "score": c["score"]
            }
            for c in candidatos
        ]
    }