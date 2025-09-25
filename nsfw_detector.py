# FileName: nsfw_detector.py (FINAL CORRECTED VERSION)
import os
from PIL import Image
import requests
import torch
from transformers import AutoProcessor, AutoModelForImageClassification
import io
import base64

class NsfwDetector:
    """
    A class to load an NSFW detection model and classify images.
    """
    # --- NSFW detection model ---
    def __init__(self, model_name="Falconsai/nsfw_image_detection"):
        self.model_name = model_name
        self.processor = None
        self.model = None

        try:
            print(f"Loading CORRECT NSFW detection model '{self.model_name}'...")
            self.processor = AutoProcessor.from_pretrained(self.model_name)
            self.model = AutoModelForImageClassification.from_pretrained(self.model_name)
            print("NSFW detection model loaded successfully.")
            print("Model labels found:", self.model.config.id2label)

        except Exception as e:
            print(f"FATAL ERROR: Could not load NSFW model '{self.model_name}'. Error: {e}")
            self.model = None

    def predict(self, image_base64: str, nsfw_threshold: float = 0.65) -> dict:
        """
        Analyzes a base64 encoded image to determine if it's NSFW.
        """
        if not self.model or not image_base64:
            return {'is_nsfw': False, 'score': 0.0, 'error': 'Model not loaded or no image provided'}
        
        try:
            image_data = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_data)).convert("RGB")
        except Exception as e:
            return {'is_nsfw': False, 'score': 0.0, 'error': f'Invalid image data: {e}'}

        try:
            inputs = self.processor(images=image, return_tensors="pt")
            with torch.no_grad():
                outputs = self.model(**inputs)
            
            logits = outputs.logits
            labels = self.model.config.id2label
            
            all_scores = {labels[i]: logit.item() for i, logit in enumerate(logits[0])}
            print("--- NSFW Model Prediction ---")
            print("All Scores (Logits):", all_scores)

            probabilities = torch.softmax(logits, dim=1)[0]
            prob_scores = {labels[i]: round(prob.item(), 4) for i, prob in enumerate(probabilities)}
            print("All Scores (Probabilities):", prob_scores)
            
            nsfw_score = prob_scores.get('nsfw', 0.0)
            
            is_nsfw = nsfw_score >= nsfw_threshold
            
            print(f"NSFW Score: {nsfw_score}, Threshold: {nsfw_threshold}, Is NSFW: {is_nsfw}")
            print("--------------------------")

            return {
                'is_nsfw': is_nsfw,
                'score': nsfw_score,
                'details': {'nsfw_score': nsfw_score}
            }

        except Exception as e:
            print(f"ERROR during NSFW prediction pipeline: {e}")
            return {'is_nsfw': False, 'score': 0.0, 'error': str(e)}