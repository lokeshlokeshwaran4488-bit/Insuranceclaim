"""
PyTorch image classification service for damage analysis.
Architecture: ResNet-50 fine-tuned for damage detection.
Model weights must be placed at app/ai/model_weights/damage_classifier.pt
"""

import io
from pathlib import Path
from typing import Optional
from app.core.logging_config import get_logger

logger = get_logger(__name__)

MODEL_PATH = Path(__file__).parent / "model_weights" / "damage_classifier.pt"

DAMAGE_CLASSES = [
    "No Damage",
    "Minor Scratch",
    "Dent",
    "Major Dent",
    "Broken Glass",
    "Structural Damage",
    "Total Loss",
]

SEVERITY_MAPPING = {
    "No Damage": "NONE",
    "Minor Scratch": "MINOR",
    "Dent": "MODERATE",
    "Major Dent": "MODERATE",
    "Broken Glass": "MAJOR",
    "Structural Damage": "MAJOR",
    "Total Loss": "CATASTROPHIC",
}

_model = None  # Lazy-loaded


def _load_model():
    """Lazy-load the PyTorch model."""
    global _model
    if _model is not None:
        return _model

    if not MODEL_PATH.exists():
        logger.warning(f"PyTorch damage classifier not found at {MODEL_PATH}. Image analysis will return fallback.")
        return None

    try:
        import torch
        import torchvision.models as models

        # Load architecture
        model = models.resnet50(weights=None)
        model.fc = torch.nn.Linear(model.fc.in_features, len(DAMAGE_CLASSES))

        # Load weights
        state_dict = torch.load(MODEL_PATH, map_location="cpu", weights_only=True)
        model.load_state_dict(state_dict)
        model.eval()
        _model = model
        logger.info("PyTorch damage classifier loaded successfully")
        return _model
    except Exception as e:
        logger.error(f"Failed to load PyTorch model: {e}")
        return None


def _build_transforms():
    """Build standard image preprocessing transforms."""
    try:
        from torchvision import transforms
        return transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
    except ImportError:
        return None


async def analyze_damage_image(image_bytes: bytes, filename: str) -> dict:
    """
    Analyze a damage image using PyTorch ResNet-50.

    Returns:
    {
        "damage_detected": true,
        "damage_type": "Dent",
        "severity": "MODERATE",
        "confidence": 0.87,
        "all_predictions": [...],
        "model_version": "resnet50-v1.0"
    }
    """
    model = _load_model()

    if model is None:
        return _fallback_image_analysis(filename)

    try:
        import torch
        from PIL import Image

        # Load image
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        transforms = _build_transforms()
        if transforms is None:
            return _fallback_image_analysis(filename)

        tensor = transforms(image).unsqueeze(0)  # Add batch dimension

        with torch.no_grad():
            outputs = model(tensor)
            probabilities = torch.softmax(outputs, dim=1)[0]

        # Get top prediction
        top_prob, top_idx = torch.max(probabilities, 0)
        top_class = DAMAGE_CLASSES[top_idx.item()]
        confidence = float(top_prob.item())

        # All predictions
        all_predictions = [
            {"class": DAMAGE_CLASSES[i], "probability": float(probabilities[i].item())}
            for i in range(len(DAMAGE_CLASSES))
        ]

        return {
            "damage_detected": top_class != "No Damage",
            "damage_type": top_class,
            "severity": SEVERITY_MAPPING.get(top_class, "UNKNOWN"),
            "confidence": round(confidence, 4),
            "all_predictions": sorted(all_predictions, key=lambda x: x["probability"], reverse=True),
            "model_version": "resnet50-v1.0",
            "status": "completed",
        }

    except Exception as e:
        logger.error(f"PyTorch image analysis failed: {e}")
        return {"status": "failed", "error": str(e), **_fallback_image_analysis(filename)}


def _fallback_image_analysis(filename: str) -> dict:
    """Return when model weights are not available."""
    return {
        "status": "model_unavailable",
        "damage_detected": None,
        "damage_type": None,
        "severity": None,
        "confidence": None,
        "message": "Image analysis model not configured. Manual visual inspection required.",
        "filename": filename,
        "model_version": "fallback-v1.0",
    }
