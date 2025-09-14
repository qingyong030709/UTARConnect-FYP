# FileName: detector.py
import os
import re
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification

class FoulWordDetector:
    """
    A class that uses a hybrid approach to detect toxic content:
    1. An explicit BLACKLIST for instant rejection of unambiguously foul words.
    2. An ALLOWLIST to prevent the AI from flagging common acronyms.
    3. An AI model to analyze the remaining text for contextual toxicity.
    """
    # --- BLACKLIST ---
    # Words in this list will ALWAYS be rejected, regardless of the AI's opinion.
    # Add any words you want to unconditionally block. Must be lowercase.
    BLACKLIST = {
        'fuck', 'fucked', 'fucking', 'fuk', 'faggot', 'fagot',
        'shit', 'bitch', 'asshole', 'dick', 'pussy', 'cunt',
        'nigger', 'nigga', 'coon',
        'stupid', 'dumb' # Added based on your test case
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

    def __init__(self, model_path: str):
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model directory not found at '{model_path}'.")
        print(f"Loading model from '{model_path}'...")
        self.model = AutoModelForSequenceClassification.from_pretrained(model_path)
        self.tokenizer = AutoTokenizer.from_pretrained(model_path)
        self.pipeline = pipeline('text-classification', model=self.model, tokenizer=self.tokenizer)
        print("Model loaded successfully.")

    def predict(self, text: str, toxicity_threshold: float = 0.80) -> dict:
        """
        Analyzes text using a multi-step process for higher accuracy.
        """
        original_text = text
        if not isinstance(original_text, str) or not original_text.strip():
            return {'is_toxic': False, 'confidence_score': 0.0, 'text': original_text}

        # --- THIS IS THE NEW, HYBRID LOGIC ---
        # 1. First, check for any blacklisted words for an instant rejection.
        words_in_text = set(re.findall(r'\b\w+\b', original_text.lower()))
        blacklisted_words_found = self.BLACKLIST.intersection(words_in_text)
        
        if blacklisted_words_found:
            print(f"BLACKLIST TRIGGERED: Found '{', '.join(blacklisted_words_found)}' in '{original_text}'.")
            return {'is_toxic': True, 'confidence_score': 1.0, 'text': original_text}

        # 2. If no blacklisted words, proceed with the AI check after filtering safe words.
        words_to_check = []
        for word in words_in_text:
            is_safe = False
            for safe_word in self.ALLOWLIST:
                if word.startswith(safe_word):
                    is_safe = True
                    break
            if not is_safe:
                words_to_check.append(word)
        
        filtered_text = ' '.join(words_to_check)
        
        if not filtered_text:
            print(f"Text '{original_text}' contains only allowlisted words. Deemed safe.")
            return {'is_toxic': False, 'confidence_score': 0.0, 'text': original_text}
        
        print(f"Analyzing filtered text with AI: '{filtered_text}'")
        result = self.pipeline(filtered_text)[0]
        # --- END OF NEW LOGIC ---

        is_toxic_prediction = (result['label'] == 'LABEL_1')
        confidence = result['score']
        
        final_is_toxic = is_toxic_prediction and (confidence >= toxicity_threshold)
        display_confidence = confidence if is_toxic_prediction else (1 - confidence)

        return {
            'is_toxic': final_is_toxic,
            'confidence_score': round(display_confidence, 4),
            'text': original_text
        }

# This block allows you to test the detector directly
if __name__ == "__main__":
    MODEL_PATH = './toxic-content-model'
    try:
        detector = FoulWordDetector(model_path=MODEL_PATH)
        
        print("\n--- Testing Model ---")
        
        # Test Case 1: An allowed acronym
        test_sentence_1 = "fyi this is a test" 
        prediction_1 = detector.predict(test_sentence_1)
        print(f"Text: '{prediction_1['text']}' -> Is Toxic: {prediction_1['is_toxic']}")

        # Test Case 2: A genuinely toxic phrase
        test_sentence_2 = "you are so stupid"
        prediction_2 = detector.predict(test_sentence_2)
        print(f"Text: '{prediction_2['text']}' -> Is Toxic: {prediction_2['is_toxic']}")

        # Test Case 3: A phrase that only contains allowlisted words
        test_sentence_3 = "omg lmao fyi"
        prediction_3 = detector.predict(test_sentence_3)
        print(f"Text: '{prediction_3['text']}' -> Is Toxic: {prediction_3['is_toxic']}")


    except FileNotFoundError as e:
        print(e)
        print("ACTION: Please run 'train_model.py' to create the model folder first.")