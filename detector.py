# FileName: detector.py
import os
import re
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification

class FoulWordDetector:
    """
    A class that uses a hybrid approach to detect toxic content.
    """
    BLACKLIST = {
        'fuck', 'fucked', 'fucking', 'fuk', 'faggot', 'fagot',
        'shit', 'bitch', 'asshole', 'dick', 'pussy', 'cunt',
        'nigger', 'nigga', 'coon',
        'stupid', 'dumb'
    }
    
    ALLOWLIST = {
        'afaik', 'ama', 'atm', 'bbl', 'bms', 'brb', 'bts', 'btw', 'cya', 'dm',
        'fomo', 'ftw', 'fyi', 'gg', 'grwm', 'hbd', 'hbu', 'hf', 'hifw', 'hmu',
        'hth', 'ianad', 'ianal', 'icymi', 'idc', 'idk', 'ig', 'iirc', 'ik', 'ikr',
        'ily', 'imho', 'imo', 'irl', 'iykyk', 'jk', 'lmao', 'lmk', 'lol', 'mfw',
        'ngl', 'nvm', 'oan', 'og', 'omg', 'omw', 'ootd', 'op', 'pov', 'ppl',
        'ptl', 'qotd', 'rn', 'rofl', 'rt', 'smh', 'tbh', 'tbt', 'tfw', 'thx',
        'tldr', 'ttyl', 'ty', 'tyt', 'wbu', 'wdym', 'wfh', 'wya', 'wyd', 'yw',
        'fml', 'gtg', 'g2g', 'hecm', 'istg', 'iycr', 'msm', 'ntmy', 'pm',
        'scnr', 'sflr', 'sry', 'tbf', 'tmi', 'ttfn', 'w/e', 'w/o', 'wut',
        'fyp', 'sdp', 'ia', 'fict', 'fas', 'fbf', 'fsc', 'fam', 'fegt', 'fci'
    }

    def __init__(self, model_name="distilbert-base-uncased-finetuned-sst-2-english"):
        print(f"Loading model '{model_name}' from Hugging Face Hub...")
        self.model_name = model_name
        self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name)
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
        self.pipeline = pipeline('text-classification', model=self.model, tokenizer=self.tokenizer)
        print("Model loaded successfully.")

    # --- THIS IS THE KEY CHANGE ---
    # We are increasing the threshold to be much stricter.
    def predict(self, text: str, toxicity_threshold: float = 0.98) -> dict:
        """
        Analyzes text using a multi-step process for higher accuracy.
        """
        original_text = text
        if not isinstance(original_text, str) or not original_text.strip():
            return {'is_toxic': False, 'confidence_score': 0.0, 'text': original_text}

        words_in_text = set(re.findall(r'\b\w+\b', original_text.lower()))
        blacklisted_words_found = self.BLACKLIST.intersection(words_in_text)
        
        if blacklisted_words_found:
            print(f"BLACKLIST TRIGGERED: Found '{', '.join(blacklisted_words_found)}' in '{original_text}'.")
            return {'is_toxic': True, 'confidence_score': 1.0, 'text': original_text}

        # Use a list comprehension for a cleaner filter
        words_to_check = [word for word in words_in_text if word not in self.ALLOWLIST]
        
        filtered_text = ' '.join(words_to_check)
        
        if not filtered_text:
            print(f"Text '{original_text}' contains only allowlisted words. Deemed safe.")
            return {'is_toxic': False, 'confidence_score': 0.0, 'text': original_text}
        
        print(f"Analyzing filtered text with AI: '{filtered_text}'")
        result = self.pipeline(filtered_text)[0]
        
        # This model uses 'POSITIVE' and 'NEGATIVE' or LABEL_0 / LABEL_1. This handles both.
        is_toxic_prediction = (result['label'] == 'LABEL_1' or result['label'].lower() == 'negative')
        confidence = result['score']
        
        # The main logic check
        final_is_toxic = is_toxic_prediction and (confidence >= toxicity_threshold)
        display_confidence = confidence if is_toxic_prediction else (1 - confidence)

        return {
            'is_toxic': final_is_toxic,
            'confidence_score': round(display_confidence, 4),
            'text': original_text
        }